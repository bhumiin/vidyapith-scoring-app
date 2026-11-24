-- ============================================================================
-- 008_judge_clears_own_scores.sql — a judge may remove a score they entered
--
-- Why: switching student now saves a draft without asking, which means a value
-- the judge cleared has to disappear from the database. Until now judges could
-- insert and update their own scores but not delete them (delete was staff-only),
-- so a cleared chip would come back on the next visit.
--
-- The rule below is the same one that already governs writes: app.may_score()
-- is true for a judge only on their own row, for a student in their grade, while
-- that student is not submitted. Staff keep the unconditional delete they had.
-- No new permission is introduced; the delete policy simply stops being stricter
-- than the insert/update policy.
-- ============================================================================

begin;

drop policy if exists rls_scores_delete on public.scores;

create policy rls_scores_delete on public.scores
    for delete to authenticated
    using (app.may_score(student_id, judge_id));

commit;
