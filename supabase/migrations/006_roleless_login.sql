-- ============================================================================
-- 006_roleless_login.sql — one sign-in for every role
--
-- Before this file the client had to say which role it was signing in as, and
-- login() looked the credential up by (role, username). The role is now read
-- from the credential row itself, so the form only carries a username and a
-- password, and the app routes on the role that comes back.
--
-- Additive and safe to run while the current client is deployed: the old
-- three-argument login(text, text, text) is left in place until 007, which is
-- applied only after the new client is live.
--
-- Safe to run twice: the index is "if not exists", the trigger is dropped and
-- recreated, and the function is "or replace".
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. a username must mean exactly one person
--
-- (role, lower(username)) was unique; now the username alone has to be, or a
-- role-less login cannot tell two people apart. This project has no collisions
-- today (36 judges / 2 super judges / 1 admin, all firstname.lastname), so the
-- check is a guard, not a cleanup — it refuses to run rather than picking one.
-- ---------------------------------------------------------------------------
do $$
declare
    v_dupes text;
begin
    select string_agg(format('%s (%s)', d.username, d.roles), ', ')
      into v_dupes
      from (select lower(username) as username,
                   string_agg(role, '/' order by role) as roles
              from private.credentials
             group by 1
            having count(*) > 1) d;

    if v_dupes is not null then
        raise exception 'username used by more than one role: % — resolve before applying 006', v_dupes
            using errcode = '23505';
    end if;
end $$;

create unique index if not exists credentials_username_uniq
    on private.credentials (lower(username));

-- ---------------------------------------------------------------------------
-- 2. reject a cross-role duplicate before it leaves a half-written row
--
-- admin_create_judge() inserts into public.judges first and into
-- private.credentials second. Without this trigger a duplicate username fails
-- on the second insert and leaves the judge row behind. Failing on the first
-- insert keeps the tables in step and gives the admin a sentence they can act
-- on instead of a unique-violation.
-- ---------------------------------------------------------------------------
create or replace function private.reject_cross_role_username()
returns trigger
language plpgsql security definer
set search_path = private, public, pg_temp
as $$
declare
    v_role text;
begin
    select role into v_role
      from private.credentials
     where lower(username) = lower(new.username)
       and id <> new.id
     limit 1;

    if found then
        raise exception 'username % is already taken by a %', new.username, v_role
            using errcode = '23505';
    end if;

    return new;
end $$;

do $$
declare
    t text;
begin
    foreach t in array array['judges', 'super_judges', 'admin_users'] loop
        execute format('drop trigger if exists %I on public.%I', t || '_unique_username', t);
        execute format(
            'create trigger %I before insert or update of username on public.%I
             for each row execute function private.reject_cross_role_username()',
            t || '_unique_username', t);
    end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. login — the only thing anon may call, now without a role
--
-- Same behaviour as 001 apart from where the role comes from: the row decides.
-- Unknown usernames still cost 250 ms so a wrong name and a wrong password
-- look the same, and five failures still lock the account for five minutes.
-- ---------------------------------------------------------------------------
create or replace function public.login(p_username text, p_password text)
returns jsonb
language plpgsql security definer
set search_path = private, extensions, public, pg_temp
as $$
declare
    v_cred   private.credentials;
    v_name   text;
    v_valid  boolean := false;
    v_exp    timestamptz := now() + interval '12 hours';
    v_waited integer;
begin
    if coalesce(trim(p_username), '') = '' or coalesce(p_password, '') = '' then
        return jsonb_build_object('ok', false, 'error', 'Invalid username or password');
    end if;

    -- exactly one row: credentials_username_uniq guarantees it
    select * into v_cred
      from private.credentials
     where lower(username) = lower(trim(p_username))
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

    -- a malformed stored hash must read as "wrong password", never as a 500
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

    if v_cred.role = 'judge' then
        select name into v_name from public.judges where id = v_cred.id;
    elsif v_cred.role = 'superjudge' then
        select name into v_name from public.super_judges where id = v_cred.id;
    else
        v_name := 'Administrator';
    end if;

    insert into private.audit_log (actor_id, actor_role, action, detail)
    values (v_cred.id, v_cred.role, 'login', jsonb_build_object('username', v_cred.username));

    return jsonb_build_object(
        'ok', true,
        'token', private.sign_jwt(v_cred.id, v_cred.role, v_exp),
        'expires_at', v_exp,
        'user', jsonb_build_object(
            'id', v_cred.id,
            'username', v_cred.username,
            'name', coalesce(v_name, v_cred.username),
            'role', v_cred.role
        )
    );
end $$;

revoke all on function public.login(text, text) from public;
grant execute on function public.login(text, text) to anon, authenticated;

comment on function public.login(text, text) is
    'Sign in with username + password. The role comes from private.credentials and is returned in user.role.';

commit;
