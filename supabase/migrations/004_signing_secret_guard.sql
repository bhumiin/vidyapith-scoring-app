-- ============================================================================
-- 004_signing_secret_guard.sql
--
-- Why this exists: the signing secret was stored as a Supabase *API key*
-- (sb_secret_...). login() happily signed tokens with it, but PostgREST
-- validates against the project's JWT secret, so every token was rejected and
-- each signed-in role looked like an anonymous visitor. The failure surfaced as
-- "no students in the dropdown", three layers away from the cause.
--
-- This makes the wrong value fail loudly at login instead of minting dud tokens,
-- and makes the lookup deterministic when the Vault name is duplicated.
-- ============================================================================

begin;

create or replace function private.jwt_secret()
returns text
language plpgsql stable security definer
set search_path = private, extensions, public, pg_temp
as $$
declare
    v     text;
    v_n   integer;
begin
    -- exactly one secret may carry this name, otherwise the lookup is a coin toss
    begin
        execute 'select count(*) from vault.secrets where name = $1'
           into v_n using 'scoring_jwt_secret';
        if v_n > 1 then
            raise exception 'there are % secrets named scoring_jwt_secret — keep exactly one', v_n
                using errcode = '55000';
        end if;
    exception when undefined_table or invalid_schema_name then
        v_n := 0;
    end;

    begin
        execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
           into v using 'scoring_jwt_secret';
    exception when others then
        v := null;
    end;

    if coalesce(v, '') = '' then
        v := current_setting('app.jwt_secret', true);
    end if;

    if coalesce(v, '') = '' then
        raise exception 'JWT secret not configured: add vault secret "scoring_jwt_secret" (Dashboard → Project Settings → JWT Keys → Legacy JWT secret)'
            using errcode = '55000';
    end if;

    -- a copy/paste with a trailing newline should just work
    v := btrim(v);

    if left(v, 3) = 'sb_' then
        raise exception 'the stored signing secret is a Supabase API key (sb_...), not the JWT secret — PostgREST validates tokens against the project JWT secret'
            using errcode = '55000';
    end if;

    if v ~ '[[:space:]]' then
        raise exception 'the stored signing secret contains whitespace — copy it again with the dashboard button'
            using errcode = '55000';
    end if;

    if length(v) < 32 then
        raise exception 'the stored signing secret is only % characters — that is not a JWT secret', length(v)
            using errcode = '55000';
    end if;

    return v;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- login(): if the signing secret is misconfigured, say so instead of failing
-- with a generic "authentication failed" (the password is still verified first,
-- so this leaks nothing about which usernames exist)
-- ---------------------------------------------------------------------------
begin;

create or replace function public.login(p_username text, p_role text, p_password text)
returns jsonb
language plpgsql security definer
set search_path = private, extensions, public, pg_temp
as $$
declare
    v_cred   private.credentials;
    v_name   text;
    v_valid  boolean := false;
    v_exp    timestamptz := now() + interval '12 hours';
    v_token  text;
    v_waited integer;
begin
    if coalesce(trim(p_username), '') = ''
       or coalesce(p_password, '') = ''
       or p_role not in ('judge', 'superjudge', 'admin') then
        return jsonb_build_object('ok', false, 'error', 'Invalid username or password');
    end if;

    select * into v_cred
      from private.credentials
     where role = p_role and lower(username) = lower(trim(p_username))
     limit 1;

    if not found then
        perform pg_sleep(0.25);
        return jsonb_build_object('ok', false, 'error', 'Invalid username or password');
    end if;

    if v_cred.locked_until is not null and v_cred.locked_until > now() then
        v_waited := ceil(extract(epoch from (v_cred.locked_until - now())) / 60.0)::int;
        return jsonb_build_object('ok', false,
            'error', format('Too many failed attempts. Try again in %s minute(s).', v_waited));
    end if;

    begin
        v_valid := (v_cred.password_hash = crypt(p_password, v_cred.password_hash));
    exception when others then
        v_valid := false;
    end;

    if not v_valid then
        update private.credentials
           set failed_attempts = failed_attempts + 1,
               locked_until = case when failed_attempts + 1 >= 5
                                   then now() + interval '5 minutes' end
         where id = v_cred.id;
        perform pg_sleep(0.25);
        return jsonb_build_object('ok', false, 'error', 'Invalid username or password');
    end if;

    update private.credentials
       set failed_attempts = 0, locked_until = null, last_login_at = now()
     where id = v_cred.id;

    if p_role = 'judge' then
        select name into v_name from public.judges where id = v_cred.id;
    elsif p_role = 'superjudge' then
        select name into v_name from public.super_judges where id = v_cred.id;
    else
        v_name := 'Administrator';
    end if;

    begin
        v_token := private.sign_jwt(v_cred.id, p_role, v_exp);
    exception when others then
        return jsonb_build_object('ok', false,
            'error', 'Sign-in is misconfigured on the server. The administrator must set the JWT signing secret.');
    end;

    insert into private.audit_log (actor_id, actor_role, action, detail)
    values (v_cred.id, p_role, 'login', jsonb_build_object('username', v_cred.username));

    return jsonb_build_object(
        'ok', true,
        'token', v_token,
        'expires_at', v_exp,
        'user', jsonb_build_object(
            'id', v_cred.id,
            'username', v_cred.username,
            'name', coalesce(v_name, v_cred.username),
            'role', p_role
        )
    );
end $$;

commit;


-- Check after running: this must raise a clear error while the wrong value is
-- stored, and return silently once the real JWT secret is in place.
--   select private.jwt_secret();
