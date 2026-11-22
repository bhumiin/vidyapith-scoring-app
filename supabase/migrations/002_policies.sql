-- ============================================================================
-- 002_policies.sql — Phase 2: rules exist, the old open policies still do
--
-- Adds per-role RLS policies for the `authenticated` role and makes the
-- database the source of truth for criterion groups and score ranges.
-- The permissive "Allow all operations" policies from database-setup.sql are
-- left in place on purpose: if a policy here is wrong the app still works and
-- we find out from a test request instead of an outage.
--
-- Apply AFTER the new client (login via RPC) is live.
-- Rollback: supabase/migrations/rollback.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. helper functions (SECURITY DEFINER so policies cannot recurse)
-- ---------------------------------------------------------------------------
create or replace function app.is_staff()
returns boolean
language sql stable
as $$ select coalesce(app.role() in ('admin', 'superjudge'), false) $$;

create or replace function app.student_in_my_groups(p_student uuid)
returns boolean
language sql stable security definer
set search_path = public, app, pg_temp
as $$
    select exists (
        select 1
          from public.students s
          join public.group_judges gj on gj.group_id = s.group_id
         where s.id = p_student
           and gj.judge_id = app.uid()
    )
$$;

revoke all on function app.is_staff() from public;
revoke all on function app.student_in_my_groups(uuid) from public;
grant execute on function app.is_staff(), app.student_in_my_groups(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. helper: may this actor write this score / submission row?
-- ---------------------------------------------------------------------------
create or replace function app.may_score(p_student uuid, p_judge uuid)
returns boolean
language sql stable security definer
set search_path = public, app, pg_temp
as $$
    select case
        when app.role() in ('admin', 'superjudge') then true
        when app.role() = 'judge' then
            p_judge = app.uid()
            and app.student_in_my_groups(p_student)
            and not exists (select 1 from public.submissions s
                             where s.student_id = p_student and s.judge_id = p_judge)
        else false
    end
$$;

revoke all on function app.may_score(uuid, uuid) from public;
grant execute on function app.may_score(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. policies, table by table
-- ---------------------------------------------------------------------------
-- groups (grades): everyone signed in reads; admin/super judge manage
drop policy if exists rls_groups_select on public.groups;
drop policy if exists rls_groups_write  on public.groups;
create policy rls_groups_select on public.groups
    for select to authenticated using (true);
create policy rls_groups_write on public.groups
    for all to authenticated
    using (app.role() in ('admin', 'superjudge'))
    with check (app.role() in ('admin', 'superjudge'));

-- students: staff see all, a judge sees only their grades
drop policy if exists rls_students_select on public.students;
drop policy if exists rls_students_admin  on public.students;
create policy rls_students_select on public.students
    for select to authenticated
    using (app.is_staff() or app.student_in_my_groups(id));
create policy rls_students_admin on public.students
    for all to authenticated
    using (app.role() = 'admin')
    with check (app.role() = 'admin');

-- group_judges: a judge sees their own edges, staff see all
drop policy if exists rls_group_judges_select on public.group_judges;
drop policy if exists rls_group_judges_write  on public.group_judges;
create policy rls_group_judges_select on public.group_judges
    for select to authenticated
    using (app.is_staff() or judge_id = app.uid());
create policy rls_group_judges_write on public.group_judges
    for all to authenticated
    using (app.role() in ('admin', 'superjudge'))
    with check (app.role() in ('admin', 'superjudge'));

-- judges / super_judges: staff see all, a person sees themself; deletes by admin
drop policy if exists rls_judges_select on public.judges;
drop policy if exists rls_judges_delete on public.judges;
create policy rls_judges_select on public.judges
    for select to authenticated
    using (app.is_staff() or id = app.uid());
create policy rls_judges_delete on public.judges
    for delete to authenticated
    using (app.role() = 'admin');

drop policy if exists rls_super_judges_select on public.super_judges;
drop policy if exists rls_super_judges_delete on public.super_judges;
create policy rls_super_judges_select on public.super_judges
    for select to authenticated
    using (app.is_staff() or id = app.uid());
create policy rls_super_judges_delete on public.super_judges
    for delete to authenticated
    using (app.role() = 'admin');

-- criteria / criterion_groups / topics: reference data, admin writes
drop policy if exists rls_criteria_select on public.criteria;
drop policy if exists rls_criteria_write  on public.criteria;
create policy rls_criteria_select on public.criteria
    for select to authenticated using (true);
create policy rls_criteria_write on public.criteria
    for all to authenticated
    using (app.role() = 'admin') with check (app.role() = 'admin');

drop policy if exists rls_criterion_groups_select on public.criterion_groups;
drop policy if exists rls_criterion_groups_write  on public.criterion_groups;
create policy rls_criterion_groups_select on public.criterion_groups
    for select to authenticated using (true);
create policy rls_criterion_groups_write on public.criterion_groups
    for all to authenticated
    using (app.role() = 'admin') with check (app.role() = 'admin');

drop policy if exists rls_topics_select on public.topics;
drop policy if exists rls_topics_write  on public.topics;
create policy rls_topics_select on public.topics
    for select to authenticated using (true);
create policy rls_topics_write on public.topics
    for all to authenticated
    using (app.role() = 'admin') with check (app.role() = 'admin');

-- scores: judge owns their rows and only while unsubmitted; staff override
drop policy if exists rls_scores_select on public.scores;
drop policy if exists rls_scores_insert on public.scores;
drop policy if exists rls_scores_update on public.scores;
drop policy if exists rls_scores_delete on public.scores;
create policy rls_scores_select on public.scores
    for select to authenticated
    using (app.is_staff() or judge_id = app.uid());
create policy rls_scores_insert on public.scores
    for insert to authenticated
    with check (app.may_score(student_id, judge_id));
create policy rls_scores_update on public.scores
    for update to authenticated
    using (app.may_score(student_id, judge_id))
    with check (app.may_score(student_id, judge_id));
create policy rls_scores_delete on public.scores
    for delete to authenticated
    using (app.role() in ('admin', 'superjudge'));

-- submissions: the lock. Judge may create their own; staff may remove (= unlock)
drop policy if exists rls_submissions_select on public.submissions;
drop policy if exists rls_submissions_insert on public.submissions;
drop policy if exists rls_submissions_update on public.submissions;
drop policy if exists rls_submissions_delete on public.submissions;
create policy rls_submissions_select on public.submissions
    for select to authenticated
    using (app.is_staff() or judge_id = app.uid());
create policy rls_submissions_insert on public.submissions
    for insert to authenticated
    with check (app.role() in ('admin', 'superjudge')
                or (judge_id = app.uid() and app.student_in_my_groups(student_id)));
-- needed because the client submits with an upsert ("on conflict do update"),
-- which Postgres refuses without UPDATE rights even when no row conflicts
create policy rls_submissions_update on public.submissions
    for update to authenticated
    using (app.is_staff() or judge_id = app.uid())
    with check (app.is_staff() or judge_id = app.uid());
create policy rls_submissions_delete on public.submissions
    for delete to authenticated
    using (app.role() in ('admin', 'superjudge'));

-- judge_notes: own notes; unlike scores, still editable after submit
drop policy if exists rls_judge_notes_select on public.judge_notes;
drop policy if exists rls_judge_notes_insert on public.judge_notes;
drop policy if exists rls_judge_notes_update on public.judge_notes;
drop policy if exists rls_judge_notes_delete on public.judge_notes;
create policy rls_judge_notes_select on public.judge_notes
    for select to authenticated
    using (app.is_staff() or judge_id = app.uid());
create policy rls_judge_notes_insert on public.judge_notes
    for insert to authenticated
    with check (app.is_staff()
                or (judge_id = app.uid() and app.student_in_my_groups(student_id)));
create policy rls_judge_notes_update on public.judge_notes
    for update to authenticated
    using (app.is_staff()
           or (judge_id = app.uid() and app.student_in_my_groups(student_id)))
    with check (app.is_staff()
                or (judge_id = app.uid() and app.student_in_my_groups(student_id)));
create policy rls_judge_notes_delete on public.judge_notes
    for delete to authenticated
    using (app.role() in ('admin', 'superjudge'));

-- admin_users: deliberately no policy at all — deny everything.
drop policy if exists rls_admin_users_select on public.admin_users;

-- nobody but the owner may create objects in public
revoke create on schema public from public;
do $$
begin
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke create on schema public from anon';
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
        execute 'revoke create on schema public from authenticated';
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. the database becomes authoritative for criterion groups and ranges
--    (values copied from what judge-view.js / superjudge-view.js hardcode,
--     so behaviour does not change)
--
--    Note: this project's `criteria` table predates min_score/max_score, so
--    they are added here rather than assumed. `criterion_groups` may also be
--    empty and without a unique index on name, so it is seeded without
--    ON CONFLICT.
-- ---------------------------------------------------------------------------
alter table public.criteria
    add column if not exists min_score integer not null default 1,
    add column if not exists max_score integer not null default 10;

insert into public.criterion_groups (name, is_penalty)
select v.name, v.is_penalty
  from (values ('Content', false),
               ('Language', false),
               ('Presentation', false),
               ('Preparation', true)) as v(name, is_penalty)
 where not exists (select 1 from public.criterion_groups cg where cg.name = v.name);

update public.criterion_groups set is_penalty = true where name = 'Preparation';

with mapping (criterion, group_name, min_s, max_s) as (values
    ('ideas example',                'Content',      1,  5),
    ('ideas examples',               'Content',      1,  5),
    ('relate to topic and reflect',  'Content',      1,  5),
    ('values based examples',        'Content',      1, 10),
    ('creativity language',          'Language',     1, 10),
    ('confidence style effectiveness','Presentation',1, 10),
    ('reading sentences',            'Preparation',  1,  5),
    ('overtime (contd. after 2nd bell)', 'Preparation', 1, 5)
)
update public.criteria c
   set group_id  = cg.id,
       min_score = m.min_s,
       max_score = m.max_s
  from mapping m
  join public.criterion_groups cg on cg.name = m.group_name
 where lower(c.name) = m.criterion;

-- anything not in the map keeps working with a sane default
update public.criteria
   set min_score = coalesce(min_score, 1),
       max_score = coalesce(max_score, 10)
 where min_score is null or max_score is null;

-- ---------------------------------------------------------------------------
-- 5. constraints and rules that survive a bad client
-- ---------------------------------------------------------------------------
-- groups: grade names must not differ only by case (whatimports break on)
do $$
declare
    v_dupes text;
begin
    select string_agg(format('%s x%s', lower(name), n), ', ')
      into v_dupes
      from (select lower(name) as name, count(*) as n
              from public.groups group by 1 having count(*) > 1) d;
    if v_dupes is not null then
        raise exception 'cannot add unique grade-name index, duplicates: %', v_dupes;
    end if;
end $$;

create unique index if not exists groups_name_ci_uniq on public.groups (lower(name));

-- scores must sit inside the criterion's own range
create or replace function public.enforce_score_range()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
    v_min integer;
    v_max integer;
begin
    select min_score, max_score into v_min, v_max
      from public.criteria where id = new.criterion_id;

    if not found then
        raise exception 'unknown criterion %', new.criterion_id using errcode = '23503';
    end if;

    if new.score < coalesce(v_min, 0) or new.score > coalesce(v_max, 10) then
        raise exception 'score % is outside the allowed range %..% for this criterion',
            new.score, coalesce(v_min, 0), coalesce(v_max, 10)
            using errcode = '23514';
    end if;
    return new;
end $$;

drop trigger if exists scores_range_check on public.scores;
create trigger scores_range_check
    before insert or update on public.scores
    for each row execute function public.enforce_score_range();

-- ---------------------------------------------------------------------------
-- 6. audit: privileged overwrites and unlocks
-- ---------------------------------------------------------------------------
create or replace function public.audit_score_change()
returns trigger
language plpgsql security definer
set search_path = public, private, app, pg_temp
as $$
begin
    if coalesce(app.role(), '') not in ('admin', 'superjudge') then
        return coalesce(new, old);
    end if;

    if tg_op = 'DELETE' then
        insert into private.audit_log (actor_id, actor_role, action, table_name, row_id, detail)
        values (app.uid(), app.role(), 'score_delete', 'scores', old.id::text,
                jsonb_build_object('student_id', old.student_id, 'judge_id', old.judge_id,
                                   'criterion_id', old.criterion_id, 'old', old.score));
        return old;
    end if;

    insert into private.audit_log (actor_id, actor_role, action, table_name, row_id, detail)
    values (app.uid(), app.role(), 'score_update', 'scores', new.id::text,
            jsonb_build_object('student_id', new.student_id, 'judge_id', new.judge_id,
                               'criterion_id', new.criterion_id, 'new', new.score,
                               'old', case when tg_op = 'UPDATE' then to_jsonb(old.score) end));
    return new;
end $$;

drop trigger if exists scores_audit on public.scores;
create trigger scores_audit
    after update or delete on public.scores
    for each row execute function public.audit_score_change();

create or replace function public.audit_submission_change()
returns trigger
language plpgsql security definer
set search_path = public, private, app, pg_temp
as $$
begin
    if tg_op = 'DELETE' and coalesce(app.role(), '') in ('admin', 'superjudge') then
        insert into private.audit_log (actor_id, actor_role, action, table_name, row_id, detail)
        values (app.uid(), app.role(), 'unlock', 'submissions', old.id::text,
                jsonb_build_object('student_id', old.student_id, 'judge_id', old.judge_id));
    end if;
    return coalesce(new, old);
end $$;

drop trigger if exists submissions_audit on public.submissions;
create trigger submissions_audit
    after delete on public.submissions
    for each row execute function public.audit_submission_change();

revoke all on function public.enforce_score_range() from public;
revoke all on function public.audit_score_change() from public;
revoke all on function public.audit_submission_change() from public;

commit;

-- Check after running:
--   select name, min_score, max_score, group_id is not null as grouped from public.criteria order by name;
--   select count(*) from public.criterion_groups;   -- 4
