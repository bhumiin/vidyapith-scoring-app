-- ============================================================================
-- 001_auth.sql — Phase 1: login in the database, nothing else changes
--
-- Run in the Supabase SQL Editor (as postgres) or with psql.
-- Safe to run twice: every object is created "if not exists" or replaced.
-- Permissions are NOT changed by this file. The app keeps working exactly as
-- before until 002/003 are applied.
--
-- Before running, set the JWT signing secret (once per project). Either:
--   select vault.create_secret('<JWT secret from Settings > API>', 'scoring_jwt_secret');
-- or, if Vault is unavailable:
--   alter database postgres set app.jwt_secret = '<JWT secret>';
-- Without it, login() raises "JWT secret not configured" and stops.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. private schema: credentials never leave the database
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.credentials (
    id              uuid primary key,
    username        text not null,
    role            text not null check (role in ('judge', 'superjudge', 'admin')),
    password_hash   text not null,
    failed_attempts integer not null default 0,
    locked_until    timestamptz,
    last_login_at   timestamptz,
    created_at      timestamptz not null default now()
);
create unique index if not exists credentials_role_username_uniq
    on private.credentials (role, lower(username));

create table if not exists private.audit_log (
    id         bigserial primary key,
    at         timestamptz not null default now(),
    actor_id   uuid,
    actor_role text,
    action     text not null,
    table_name text,
    row_id     text,
    detail     jsonb
);
create index if not exists audit_log_at_idx on private.audit_log (at desc);

revoke all on all tables in schema private from public;
do $$
begin
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on all tables in schema private from anon';
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
        execute 'revoke all on all tables in schema private from authenticated';
    end if;
end $$;

-- Copy the existing bcrypt hashes across. $2a$ hashes are readable by
-- pgcrypto's crypt(), so nobody has to change their password.
insert into private.credentials (id, username, role, password_hash, created_at)
select id, username, 'judge', password_hash, coalesce(created_at, now())
  from public.judges
on conflict (id) do nothing;

insert into private.credentials (id, username, role, password_hash, created_at)
select id, username, 'superjudge', password_hash, coalesce(created_at, now())
  from public.super_judges
on conflict (id) do nothing;

insert into private.credentials (id, username, role, password_hash, created_at)
select id, username, 'admin', password_hash, coalesce(created_at, now())
  from public.admin_users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. claims helpers (policies in 002 use these)
-- ---------------------------------------------------------------------------
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

create or replace function app.claims()
returns jsonb
language sql stable
as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function app.role()
returns text
language sql stable
as $$ select app.claims() ->> 'app_role' $$;

create or replace function app.uid()
returns uuid
language sql stable
as $$ select nullif(app.claims() ->> 'sub', '')::uuid $$;

revoke all on function app.claims() from public;
revoke all on function app.role() from public;
revoke all on function app.uid() from public;
grant execute on function app.claims(), app.role(), app.uid() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. JWT minting (HS256, signed with the project's legacy JWT secret)
-- ---------------------------------------------------------------------------
create or replace function private.b64url(p_data bytea)
returns text
language sql immutable
as $$
    select rtrim(
             replace(replace(replace(encode(p_data, 'base64'), E'\n', ''), '+', '-'), '/', '_'),
           '=')
$$;

create or replace function private.jwt_secret()
returns text
language plpgsql stable security definer
set search_path = private, extensions, public, pg_temp
as $$
declare
    v text;
begin
    -- preferred: Supabase Vault (encrypted at rest)
    begin
        execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
           into v using 'scoring_jwt_secret';
    exception when others then
        v := null;
    end;

    -- fallback: database setting
    if coalesce(v, '') = '' then
        v := current_setting('app.jwt_secret', true);
    end if;

    if coalesce(v, '') = '' then
        raise exception 'JWT secret not configured: add vault secret "scoring_jwt_secret" or set app.jwt_secret'
            using errcode = '55000';
    end if;
    return v;
end $$;

create or replace function private.sign_jwt(p_sub uuid, p_role text, p_exp timestamptz)
returns text
language plpgsql stable security definer
set search_path = private, extensions, public, pg_temp
as $$
declare
    v_header  text;
    v_payload text;
    v_signing text;
begin
    v_header := private.b64url(convert_to('{"alg":"HS256","typ":"JWT"}', 'UTF8'));

    -- role must be a real database role so PostgREST can SET ROLE;
    -- the app-level role travels in app_role.
    v_payload := private.b64url(convert_to(jsonb_build_object(
        'iss', 'supabase',
        'aud', 'authenticated',
        'role', 'authenticated',
        'sub', p_sub::text,
        'app_role', p_role,
        'iat', floor(extract(epoch from now()))::bigint,
        'exp', floor(extract(epoch from p_exp))::bigint
    )::text, 'UTF8'));

    v_signing := v_header || '.' || v_payload;

    return v_signing || '.' || private.b64url(hmac(v_signing, private.jwt_secret(), 'sha256'));
end $$;

-- ---------------------------------------------------------------------------
-- 4. login — the only thing anon may call
-- ---------------------------------------------------------------------------
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

    if p_role = 'judge' then
        select name into v_name from public.judges where id = v_cred.id;
    elsif p_role = 'superjudge' then
        select name into v_name from public.super_judges where id = v_cred.id;
    else
        v_name := 'Administrator';
    end if;

    insert into private.audit_log (actor_id, actor_role, action, detail)
    values (v_cred.id, p_role, 'login', jsonb_build_object('username', v_cred.username));

    return jsonb_build_object(
        'ok', true,
        'token', private.sign_jwt(v_cred.id, p_role, v_exp),
        'expires_at', v_exp,
        'user', jsonb_build_object(
            'id', v_cred.id,
            'username', v_cred.username,
            'name', coalesce(v_name, v_cred.username),
            'role', p_role
        )
    );
end $$;

-- ---------------------------------------------------------------------------
-- 5. credential writes — SECURITY DEFINER, admin only
-- ---------------------------------------------------------------------------
create or replace function private.require_admin()
returns void
language plpgsql stable
as $$
begin
    if app.role() is distinct from 'admin' then
        raise exception 'not authorized' using errcode = '42501';
    end if;
end $$;

create or replace function private.assert_password(p_password text)
returns void
language plpgsql immutable
as $$
begin
    if length(coalesce(p_password, '')) < 4 then
        raise exception 'password must be at least 4 characters' using errcode = '22023';
    end if;
end $$;

create or replace function public.admin_create_judge(p_name text, p_username text, p_password text)
returns jsonb
language plpgsql security definer
set search_path = private, extensions, public, pg_temp
as $$
declare
    v_judge public.judges;
begin
    perform private.require_admin();
    perform private.assert_password(p_password);
    if coalesce(trim(p_name), '') = '' or coalesce(trim(p_username), '') = '' then
        raise exception 'name and username are required' using errcode = '22023';
    end if;

    insert into public.judges (name, username)
    values (trim(p_name), trim(p_username))
    returning * into v_judge;

    insert into private.credentials (id, username, role, password_hash)
    values (v_judge.id, v_judge.username, 'judge', crypt(p_password, gen_salt('bf', 10)));

    return jsonb_build_object('id', v_judge.id, 'name', v_judge.name,
                              'username', v_judge.username, 'created_at', v_judge.created_at);
end $$;

create or replace function public.admin_create_super_judge(p_name text, p_username text, p_password text)
returns jsonb
language plpgsql security definer
set search_path = private, extensions, public, pg_temp
as $$
declare
    v_sj public.super_judges;
begin
    perform private.require_admin();
    perform private.assert_password(p_password);
    if coalesce(trim(p_name), '') = '' or coalesce(trim(p_username), '') = '' then
        raise exception 'name and username are required' using errcode = '22023';
    end if;

    insert into public.super_judges (name, username)
    values (trim(p_name), trim(p_username))
    returning * into v_sj;

    insert into private.credentials (id, username, role, password_hash)
    values (v_sj.id, v_sj.username, 'superjudge', crypt(p_password, gen_salt('bf', 10)));

    return jsonb_build_object('id', v_sj.id, 'name', v_sj.name,
                              'username', v_sj.username, 'created_at', v_sj.created_at);
end $$;

-- Used by the Excel import: create by username, or update name/password if it exists.
create or replace function public.admin_upsert_judge(p_name text, p_username text, p_password text default null)
returns jsonb
language plpgsql security definer
set search_path = private, extensions, public, pg_temp
as $$
declare
    v_judge public.judges;
    v_cred  private.credentials;
begin
    perform private.require_admin();
    if coalesce(trim(p_name), '') = '' or coalesce(trim(p_username), '') = '' then
        raise exception 'name and username are required' using errcode = '22023';
    end if;

    select * into v_cred from private.credentials
     where role = 'judge' and lower(username) = lower(trim(p_username)) limit 1;

    if found then
        update public.judges set name = trim(p_name), username = trim(p_username)
         where id = v_cred.id returning * into v_judge;
        if coalesce(p_password, '') <> '' then
            perform private.assert_password(p_password);
            update private.credentials
               set password_hash = crypt(p_password, gen_salt('bf', 10)),
                   failed_attempts = 0, locked_until = null
             where id = v_cred.id;
        end if;
        return jsonb_build_object('judge', jsonb_build_object(
                   'id', v_judge.id, 'name', v_judge.name,
                   'username', v_judge.username, 'created_at', v_judge.created_at),
               'created', false);
    end if;

    perform private.assert_password(p_password);
    insert into public.judges (name, username) values (trim(p_name), trim(p_username))
    returning * into v_judge;
    insert into private.credentials (id, username, role, password_hash)
    values (v_judge.id, v_judge.username, 'judge', crypt(p_password, gen_salt('bf', 10)));

    return jsonb_build_object('judge', jsonb_build_object(
               'id', v_judge.id, 'name', v_judge.name,
               'username', v_judge.username, 'created_at', v_judge.created_at),
           'created', true);
end $$;

create or replace function public.admin_set_password(p_role text, p_id uuid, p_password text)
returns jsonb
language plpgsql security definer
set search_path = private, extensions, public, pg_temp
as $$
begin
    perform private.require_admin();
    perform private.assert_password(p_password);
    if p_role not in ('judge', 'superjudge', 'admin') then
        raise exception 'invalid role' using errcode = '22023';
    end if;

    update private.credentials
       set password_hash = crypt(p_password, gen_salt('bf', 10)),
           failed_attempts = 0, locked_until = null
     where id = p_id and role = p_role;

    if not found then
        raise exception 'no % with id %', p_role, p_id using errcode = 'P0002';
    end if;

    insert into private.audit_log (actor_id, actor_role, action, table_name, row_id)
    values (app.uid(), app.role(), 'set_password', 'credentials', p_id::text);

    return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- 6. keep credentials in step when a row is renamed or deleted
-- ---------------------------------------------------------------------------
create or replace function private.sync_credentials()
returns trigger
language plpgsql security definer
set search_path = private, public, pg_temp
as $$
begin
    if tg_op = 'DELETE' then
        delete from private.credentials where id = old.id;
        return old;
    end if;

    if new.username is distinct from old.username then
        update private.credentials set username = new.username where id = new.id;
    end if;
    return new;
end $$;

do $$
declare
    t text;
begin
    foreach t in array array['judges', 'super_judges', 'admin_users'] loop
        execute format('drop trigger if exists %I on public.%I', t || '_sync_credentials', t);
        execute format(
            'create trigger %I after update of username or delete on public.%I
             for each row execute function private.sync_credentials()',
            t || '_sync_credentials', t);
    end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. grants: anon gets login() and nothing else new
-- ---------------------------------------------------------------------------
revoke all on function public.login(text, text, text) from public;
grant execute on function public.login(text, text, text) to anon, authenticated;

revoke all on function public.admin_create_judge(text, text, text) from public;
revoke all on function public.admin_create_super_judge(text, text, text) from public;
revoke all on function public.admin_upsert_judge(text, text, text) from public;
revoke all on function public.admin_set_password(text, uuid, text) from public;
grant execute on function public.admin_create_judge(text, text, text) to authenticated;
grant execute on function public.admin_create_super_judge(text, text, text) to authenticated;
grant execute on function public.admin_upsert_judge(text, text, text) to authenticated;
grant execute on function public.admin_set_password(text, uuid, text) to authenticated;

revoke all on function private.require_admin() from public;
revoke all on function private.assert_password(text) from public;

commit;

-- Sanity check after running:
--   select count(*) from private.credentials;              -- expect judges + super judges + admins
--   select username, role from private.credentials limit 5;
--   select private.jwt_secret() is not null;               -- must be true (or it raises)
