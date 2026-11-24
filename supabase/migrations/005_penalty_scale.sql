-- 005_penalty_scale.sql
--
-- Penalty criteria (the Preparation group: Overtime, Reading Sentences) are
-- deductions a judge may choose not to apply. A blank field means "no
-- deduction", and 0 is the same thing typed out. To allow that:
--
--   1. the table-level check on scores rejected anything below 1 — relax it to 0
--      (the per-criterion trigger still enforces each criterion's own range);
--   2. the two penalty criteria get a 0..5 range instead of 1..5.
--
-- Safe to re-run. No existing rows are affected: nothing is deleted, and no
-- score above 0 becomes invalid.

begin;

alter table public.scores drop constraint if exists scores_score_check;
alter table public.scores
    add constraint scores_score_check check (score >= 0 and score <= 10);

update public.criteria
   set min_score = 0
 where group_id in (select id from public.criterion_groups where is_penalty);

commit;

-- Verify:
--   select c.name, c.min_score, c.max_score, cg.is_penalty
--     from public.criteria c join public.criterion_groups cg on cg.id = c.group_id
--    order by cg.is_penalty desc, c.name;
--   -- a 0 on a penalty criterion is accepted; a 6 is rejected with 23514
