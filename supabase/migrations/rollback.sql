-- ============================================================================
-- rollback.sql — put the database back the way database-setup.sql left it
--
-- One paste. Restores the permissive policies, the anon/authenticated table
-- grants and the password_hash columns (refilled from private.credentials).
-- The login() and admin_* functions stay defined but become redundant; the old
-- client works again as soon as this is applied.
-- ============================================================================

begin;

-- 1. hashes back on the public tables
alter table public.judges       add column if not exists password_hash text;
alter table public.super_judges add column if not exists password_hash text;
alter table public.admin_users  add column if not exists password_hash text;

update public.judges j
   set password_hash = c.password_hash
  from private.credentials c
 where c.id = j.id and j.password_hash is null;

update public.super_judges j
   set password_hash = c.password_hash
  from private.credentials c
 where c.id = j.id and j.password_hash is null;

update public.admin_users j
   set password_hash = c.password_hash
  from private.credentials c
 where c.id = j.id and j.password_hash is null;

-- 2. permissions back to "everything for everyone"
revoke all on all tables in schema public from public;
do $$
begin
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'grant all on all tables in schema public to anon';
        execute 'grant all on all sequences in schema public to anon';
        execute 'grant usage on schema public to anon';
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
        execute 'grant all on all tables in schema public to authenticated';
        execute 'grant all on all sequences in schema public to authenticated';
        execute 'grant usage on schema public to authenticated';
    end if;
end $$;

grant all on all tables in schema public to public;

-- 3. the original policies
drop policy if exists "Allow all operations on admin_users" on public.admin_users;
create policy "Allow all operations on admin_users" on public.admin_users
    for all using (true) with check (true);

drop policy if exists "Allow all operations on judges" on public.judges;
create policy "Allow all operations on judges" on public.judges
    for all using (true) with check (true);

drop policy if exists "Allow all operations on super_judges" on public.super_judges;
create policy "Allow all operations on super_judges" on public.super_judges
    for all using (true) with check (true);

drop policy if exists "Allow all operations on groups" on public.groups;
create policy "Allow all operations on groups" on public.groups
    for all using (true) with check (true);

drop policy if exists "Allow all operations on students" on public.students;
create policy "Allow all operations on students" on public.students
    for all using (true) with check (true);

drop policy if exists "Allow all operations on group_judges" on public.group_judges;
create policy "Allow all operations on group_judges" on public.group_judges
    for all using (true) with check (true);

drop policy if exists "Allow all operations on criteria" on public.criteria;
create policy "Allow all operations on criteria" on public.criteria
    for all using (true) with check (true);

drop policy if exists "Allow all operations on criterion_groups" on public.criterion_groups;
create policy "Allow all operations on criterion_groups" on public.criterion_groups
    for all using (true) with check (true);

drop policy if exists "Allow all operations on topics" on public.topics;
create policy "Allow all operations on topics" on public.topics
    for all using (true) with check (true);

drop policy if exists "Allow all operations on scores" on public.scores;
create policy "Allow all operations on scores" on public.scores
    for all using (true) with check (true);

drop policy if exists "Allow all operations on submissions" on public.submissions;
create policy "Allow all operations on submissions" on public.submissions
    for all using (true) with check (true);

drop policy if exists "Allow all operations on judge_notes" on public.judge_notes;
create policy "Allow all operations on judge_notes" on public.judge_notes
    for all using (true) with check (true);

-- 4. functions callable again (the old client never used them)
grant execute on all functions in schema public to public;

commit;
