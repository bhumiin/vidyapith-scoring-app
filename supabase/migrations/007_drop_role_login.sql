-- ============================================================================
-- 007_drop_role_login.sql — retire the three-argument login, close the private helpers
--
-- Apply only after the client on main is live and has signed in without a role
-- (deployed 2026-11-24, served bytes verified). 006 added
-- login(p_username, p_password); this removes the old
-- login(p_username, p_role, p_password) so nothing can keep asking the browser
-- which role it thinks it is.
--
-- It also takes back the default EXECUTE that Postgres grants on every function,
-- which 003 never covered: private.jwt_secret() and private.sign_jwt() were
-- callable by anon and authenticated through SQL even though 003 had closed the
-- tables and the anon table grants. They are not exposed by PostgREST (only the
-- public schema is), but "the schema is private" should mean the privileges are.
-- The SECURITY DEFINER functions call them as their owner, so they keep working.
--
-- Safe to run twice: drop is "if exists", revokes are idempotent.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. the old signature must go, but never leave the app with no way in
-- ---------------------------------------------------------------------------
do $$
begin
    if to_regprocedure('public.login(text, text)') is null then
        raise exception 'login(text, text) is missing — apply 006 before 007'
            using errcode = 'P0002';
    end if;
end $$;

drop function if exists public.login(text, text, text);

-- ---------------------------------------------------------------------------
-- 2. helper functions are not API surface
-- ---------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.update_updated_at_column() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. anon may call exactly one function: the role-less login
-- ---------------------------------------------------------------------------
do $$
declare
    v_anon_exec text;
begin
    select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ' order by 1)
      into v_anon_exec
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and has_function_privilege('anon', p.oid, 'execute');

    if coalesce(v_anon_exec, '') <> 'login(p_username text, p_password text)' then
        raise exception 'anon can execute unexpected functions: %', coalesce(v_anon_exec, 'none')
            using errcode = '42501';
    end if;
end $$;

commit;
