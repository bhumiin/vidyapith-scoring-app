-- ============================================================================
-- 009_notes_lock_and_exclusions.sql
--
-- Two rules the judge screen now depends on:
--
-- 1. A judge's note is part of the record, so it locks with the score. Unlike
--    scores (which already lock on submit), notes stayed editable after submit
--    (002_policies.sql said so on purpose). That is now the same rule as
--    app.may_score(): own row, student in my grade, not submitted. Staff keep
--    their unconditional access. Nothing new is invented - the note policies
--    simply call the function that already guards scores.
--
-- 2. A student can be excluded from a judge's scoring - absent, moved, or
--    unable to present. The exclusion is per judge (one missing student does
--    not silence the other judges), carries a reason, and is what lets that
--    judge reach Submit All without a fake zero on the roster.
--    A judge may exclude only while the student is unsubmitted, so a final
--    grade cannot change its roster afterwards. Undo is the same rule.
--
-- Rollback: drop table public.student_exclusions; restore the four
-- judge_notes policies from 002_policies.sql.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. notes lock with the scores
-- ---------------------------------------------------------------------------
drop policy if exists rls_judge_notes_insert on public.judge_notes;
drop policy if exists rls_judge_notes_update on public.judge_notes;

create policy rls_judge_notes_insert on public.judge_notes
    for insert to authenticated
    with check (app.may_score(student_id, judge_id));

create policy rls_judge_notes_update on public.judge_notes
    for update to authenticated
    using (app.may_score(student_id, judge_id))
    with check (app.may_score(student_id, judge_id));

-- select stays as it was: a judge reads their own notes, staff read all.
-- delete stays staff-only: an empty note is '' rather than a missing row.

-- ---------------------------------------------------------------------------
-- 2. exclusions
-- ---------------------------------------------------------------------------
create table if not exists public.student_exclusions (
    id          uuid primary key default gen_random_uuid(),
    student_id  uuid not null references public.students(id) on delete cascade,
    judge_id    uuid not null references public.judges(id)   on delete cascade,
    reason      text not null default '',
    excluded_at timestamptz not null default now(),
    unique (student_id, judge_id)
);

comment on table public.student_exclusions is
    'A judge has taken this student out of their scoring round (absent, moved, unable to present). Not a score of zero.';

alter table public.student_exclusions enable row level security;

create index if not exists idx_student_exclusions_judge
    on public.student_exclusions (judge_id);
create index if not exists idx_student_exclusions_student
    on public.student_exclusions (student_id);

grant select, insert, update, delete on public.student_exclusions to authenticated;

drop policy if exists rls_exclusions_select on public.student_exclusions;
drop policy if exists rls_exclusions_insert on public.student_exclusions;
drop policy if exists rls_exclusions_update on public.student_exclusions;
drop policy if exists rls_exclusions_delete on public.student_exclusions;

create policy rls_exclusions_select on public.student_exclusions
    for select to authenticated
    using (app.is_staff() or judge_id = app.uid());

-- may_score() is deliberately reusable here: own row, student in my grade,
-- not submitted. Those are exactly the conditions for changing a roster.
create policy rls_exclusions_insert on public.student_exclusions
    for insert to authenticated
    with check (app.may_score(student_id, judge_id));

create policy rls_exclusions_update on public.student_exclusions
    for update to authenticated
    using (app.may_score(student_id, judge_id))
    with check (app.may_score(student_id, judge_id));

create policy rls_exclusions_delete on public.student_exclusions
    for delete to authenticated
    using (app.may_score(student_id, judge_id));


-- ---------------------------------------------------------------------------
-- 3. two tables had policies but RLS switched off
--
-- Found while testing the note lock: public.judge_notes and
-- public.criterion_groups carry policies (002_policies.sql) but never had
-- row security enabled, so those policies were inert and *any* signed-in user
-- could read or rewrite every note and every rubric group in the database.
-- database-setup.sql did enable it for judge_notes; it is off on the live
-- project, so the statement is repeated here where it will actually run.
-- ---------------------------------------------------------------------------
alter table public.judge_notes      enable row level security;
alter table public.criterion_groups enable row level security;

-- ---------------------------------------------------------------------------
-- 4. a submitted grade keeps its roster
--
-- app.may_score() only looks at the one student's submission row, so a judge
-- whose grade was submitted could still exclude or restore a student who had no
-- submission of their own (an excluded one, by definition). The roster belongs
-- to the round, so it closes when every student that judge can score in that
-- grade has been submitted.
-- ---------------------------------------------------------------------------
create or replace function app.grade_round_open(p_student uuid, p_judge uuid)
returns boolean
language sql stable security definer
set search_path = public, app, pg_temp
as $$
    select exists (
        select 1
          from public.students s2
          join public.group_judges gj on gj.group_id = s2.group_id
         where gj.judge_id = p_judge
           and s2.group_id = (select group_id from public.students where id = p_student)
           and not exists (select 1 from public.submissions b
                            where b.student_id = s2.id and b.judge_id = p_judge)
    )
$$;

revoke all on function app.grade_round_open(uuid, uuid) from public;
grant execute on function app.grade_round_open(uuid, uuid) to authenticated;

drop policy if exists rls_exclusions_insert on public.student_exclusions;
drop policy if exists rls_exclusions_update on public.student_exclusions;
drop policy if exists rls_exclusions_delete on public.student_exclusions;

create policy rls_exclusions_insert on public.student_exclusions
    for insert to authenticated
    with check (app.may_score(student_id, judge_id) and app.grade_round_open(student_id, judge_id));

create policy rls_exclusions_update on public.student_exclusions
    for update to authenticated
    using (app.may_score(student_id, judge_id) and app.grade_round_open(student_id, judge_id))
    with check (app.may_score(student_id, judge_id) and app.grade_round_open(student_id, judge_id));

create policy rls_exclusions_delete on public.student_exclusions
    for delete to authenticated
    using (app.may_score(student_id, judge_id) and app.grade_round_open(student_id, judge_id));

commit;
