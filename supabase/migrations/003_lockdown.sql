-- ============================================================================
-- 003_lockdown.sql — Phase 3: close the open door
--
-- Removes the permissive policies and the anon/authenticated table grants from
-- database-setup.sql, drops the password hashes out of the public tables, and
-- leaves: login() reachable by anon, the admin_* functions by authenticated,
-- and table access governed by the policies in 002.
--
-- Apply only after 001 + 002 are in and the client sends its token.
-- Rollback: supabase/migrations/rollback.sql (restores the old open state).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. the permissive policies
-- ---------------------------------------------------------------------------
drop policy if exists "Allow all operations on admin_users"    on public.admin_users;
drop policy if exists "Allow all operations on judges"         on public.judges;
drop policy if exists "Allow all operations on super_judges"   on public.super_judges;
drop policy if exists "Allow all operations on groups"         on public.groups;
drop policy if exists "Allow all operations on students"       on public.students;
drop policy if exists "Allow all operations on group_judges"   on public.group_judges;
drop policy if exists "Allow all operations on criteria"       on public.criteria;
drop policy if exists "Allow all operations on criterion_groups" on public.criterion_groups;
drop policy if exists "Allow all operations on topics"         on public.topics;
drop policy if exists "Allow all operations on scores"         on public.scores;
drop policy if exists "Allow all operations on submissions"    on public.submissions;
drop policy if exists "Allow all operations on judge_notes"    on public.judge_notes;
-- in case the setup script was run twice under slightly different names
drop policy if exists "Allow all operations on admin_users"    on public.admin_users;

-- ---------------------------------------------------------------------------
-- 2. table privileges: authenticated only where a policy can allow it
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from public;
revoke all on all sequences in schema public from public;

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on all tables in schema public from anon';
        execute 'revoke all on all sequences in schema public from anon';
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
        execute 'revoke all on all tables in schema public from authenticated';
        execute 'revoke all on all sequences in schema public from authenticated';
    end if;
end $$;

grant select on
    public.groups, public.students, public.group_judges, public.judges,
    public.super_judges, public.criteria, public.criterion_groups, public.topics,
    public.scores, public.submissions, public.judge_notes
to authenticated;

grant insert, update on
    public.students, public.groups, public.group_judges, public.criteria,
    public.criterion_groups, public.topics, public.scores, public.judge_notes
to authenticated;

grant insert, update on public.submissions to authenticated;
grant delete on
    public.groups, public.group_judges, public.criteria, public.criterion_groups,
    public.topics, public.students, public.scores, public.submissions,
    public.judge_notes, public.judges, public.super_judges
to authenticated;

-- admin_users is intentionally left with no grants: credentials live in private.

-- ---------------------------------------------------------------------------
-- 3. functions: only the API surface is executable
--    (targeted revokes — a blanket revoke in schema public would also strip
--     EXECUTE from uuid_generate_v4(), which the id defaults depend on)
-- ---------------------------------------------------------------------------
revoke all on function public.login(text, text, text) from public, anon, authenticated;
revoke all on function public.admin_create_judge(text, text, text) from public, anon, authenticated;
revoke all on function public.admin_create_super_judge(text, text, text) from public, anon, authenticated;
revoke all on function public.admin_upsert_judge(text, text, text) from public, anon, authenticated;
revoke all on function public.admin_set_password(text, uuid, text) from public, anon, authenticated;
revoke all on function public.enforce_score_range() from public, anon, authenticated;
revoke all on function public.audit_score_change() from public, anon, authenticated;
revoke all on function public.audit_submission_change() from public, anon, authenticated;

grant execute on function public.login(text, text, text) to anon, authenticated;
grant execute on function public.admin_create_judge(text, text, text) to authenticated;
grant execute on function public.admin_create_super_judge(text, text, text) to authenticated;
grant execute on function public.admin_upsert_judge(text, text, text) to authenticated;
grant execute on function public.admin_set_password(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. hashes leave the public schema (private.credentials is the only copy)
-- ---------------------------------------------------------------------------
alter table public.judges       drop column if exists password_hash;
alter table public.super_judges drop column if exists password_hash;
alter table public.admin_users  drop column if exists password_hash;

-- ---------------------------------------------------------------------------
-- 5. prove the door is actually shut (fails the whole migration if not)
-- ---------------------------------------------------------------------------
do $$
declare
    v_permissive int;
    v_anon_grants int;
begin
    select count(*) into v_permissive
      from pg_policies
     where schemaname = 'public'
       and (policyname like 'Allow all operations%' or 'public' = any(roles));

    if v_permissive > 0 then
        raise exception 'still % permissive policies on public tables — drop them before continuing', v_permissive;
    end if;

    select count(*) into v_anon_grants
      from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'anon';

    if v_anon_grants > 0 then
        raise exception 'anon still holds % table grants in public', v_anon_grants;
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. future tables are not born open
-- ---------------------------------------------------------------------------
do $$
begin
    execute 'alter default privileges in schema public revoke all on tables from public';
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'alter default privileges in schema public revoke all on tables from anon';
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
        execute 'alter default privileges in schema public revoke all on tables from authenticated';
    end if;
end $$;

commit;

-- Verify after running (as postgres, expecting 0 rows / permission denied):
--   set role anon; select count(*) from public.students;      -- permission denied
--   set role authenticated; select count(*) from public.students;
--   select table_name, privilege_type from information_schema.role_table_grants
--    where grantee = 'authenticated' order by 1, 2;
