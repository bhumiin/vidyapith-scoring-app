-- ============================================================================
-- demo-roster.sql — replace the placeholder roster with a realistic demo one
--
-- DESTRUCTIVE. Removes every student, judge, score, submission and note, then
-- inserts 5 students per grade and 3 judges per grade. Topics, criteria and the
-- super-judge/admin accounts are left alone (their passwords are reset below).
--
-- Guard: refuses to run unless the current students are still the placeholders
-- ("Student 1"…), so it cannot wipe a real roster by mistake.
--
-- Conventions used here (and by the admin UI / Excel import):
--   judge username = firstname.lastname, lowercase, unique
--   password       = one demo password, hashed with bcrypt inside Postgres
-- ============================================================================

begin;

do $$
begin
    if (select count(*) from public.students where name like 'Student %') < 50 then
        raise exception 'refusing to run: the roster no longer looks like demo data';
    end if;
end $$;

delete from public.submissions;
delete from public.scores;
delete from public.judge_notes;
delete from public.group_judges;
delete from public.judges;      -- trigger removes their private.credentials rows
delete from public.students;
delete from private.credentials where role = 'judge';

-- ---------------------------------------------------------------------------
-- students: 5 per grade
-- ---------------------------------------------------------------------------
with roster (grade, name) as (values
    ('3B1','Aarav Mehta'),        ('3B1','Diya Patel'),        ('3B1','Vihaan Shah'),
    ('3B1','Ananya Iyer'),        ('3B1','Kabir Rao'),
    ('3B2','Ishaan Desai'),       ('3B2','Myra Joshi'),        ('3B2','Advait Kulkarni'),
    ('3B2','Saanvi Nair'),        ('3B2','Reyansh Gupta'),
    ('4B','Arjun Subramanian'),   ('4B','Aadhya Bhatt'),       ('4B','Krish Menon'),
    ('4B','Riya Chopra'),         ('4B','Veer Malhotra'),
    ('5B','Rohan Verma'),         ('5B','Anika Reddy'),        ('5B','Dhruv Pillai'),
    ('5B','Meera Saxena'),        ('5B','Aryan Kapoor'),
    ('6B','Siddharth Naidu'),     ('6B','Tanvi Agarwal'),      ('6B','Neel Bansal'),
    ('6B','Ishita Ghosh'),        ('6B','Yash Trivedi'),
    ('7B','Aditya Krishnan'),     ('7B','Kavya Shetty'),       ('7B','Om Pandey'),
    ('7B','Nisha Dubey'),         ('7B','Raghav Sinha'),
    ('8B','Pranav Hegde'),        ('8B','Sanya Chatterjee'),   ('8B','Karan Thakur'),
    ('8B','Avni Deshpande'),      ('8B','Manav Solanki'),
    ('9B1','Nikhil Ranganathan'), ('9B1','Pooja Bhattacharya'),('9B1','Ayaan Qureshi'),
    ('9B1','Sneha Kamath'),       ('9B1','Dev Sharma'),
    ('9B2','Harsh Vardhan'),      ('9B2','Trisha Bhatt'),      ('9B2','Sameer Kadam'),
    ('9B2','Lata Pillai'),        ('9B2','Anuj Tiwari'),
    ('10B','Rishabh Jain'),       ('10B','Nandini Rao'),       ('10B','Arnav Sinha'),
    ('10B','Divya Menon'),        ('10B','Abhay Kulkarni'),
    ('11B','Keshav Iyengar'),     ('11B','Shreya Nambiar'),    ('11B','Yuvraj Chauhan'),
    ('11B','Radhika Purohit'),    ('11B','Aakash Bose'),
    ('12B','Mihir Desai'),        ('12B','Anjali Swaminathan'),('12B','Vedant Sabharwal'),
    ('12B','Priyanka Nadar'),     ('12B','Samar Khanna')
)
insert into public.students (name, group_id)
select r.name, g.id
  from roster r
  join public.groups g on g.name = r.grade;

-- ---------------------------------------------------------------------------
-- judges: 3 per grade
-- ---------------------------------------------------------------------------
with roster (grade, name, username) as (values
    ('3B1','Priya Shah','priya.shah'),            ('3B1','Nilesh Bhatt','nilesh.bhatt'),
    ('3B1','Rekha Iyer','rekha.iyer'),
    ('3B2','Suresh Menon','suresh.menon'),        ('3B2','Anita Desai','anita.desai'),
    ('3B2','Farah Ansari','farah.ansari'),
    ('4B','Deepa Kulkarni','deepa.kulkarni'),     ('4B','Rajesh Nair','rajesh.nair'),
    ('4B','Sunil Joshi','sunil.joshi'),
    ('5B','Meenakshi Rao','meenakshi.rao'),       ('5B','Anil Kapoor','anil.kapoor'),
    ('5B','Vaishali Patil','vaishali.patil'),
    ('6B','Bhavesh Trivedi','bhavesh.trivedi'),   ('6B','Kavita Reddy','kavita.reddy'),
    ('6B','Mohan Pillai','mohan.pillai'),
    ('7B','Shalini Gupta','shalini.gupta'),       ('7B','Devendra Singh','devendra.singh'),
    ('7B','Nandita Bose','nandita.bose'),
    ('8B','Prakash Kamath','prakash.kamath'),     ('8B','Asha Verma','asha.verma'),
    ('8B','Imran Sheikh','imran.sheikh'),
    ('9B1','Geeta Subramanian','geeta.subramanian'), ('9B1','Vikram Chauhan','vikram.chauhan'),
    ('9B1','Leela Nambiar','leela.nambiar'),
    ('9B2','Harish Pandey','harish.pandey'),      ('9B2','Rupa Ghosh','rupa.ghosh'),
    ('9B2','Ajay Thakur','ajay.thakur'),
    ('10B','Snehal Deshpande','snehal.deshpande'),('10B','Arun Malhotra','arun.malhotra'),
    ('10B','Bhavna Shetty','bhavna.shetty'),
    ('11B','Kiran Ranganathan','kiran.ranganathan'),('11B','Smita Agarwal','smita.agarwal'),
    ('11B','Tushar Bansal','tushar.bansal'),
    ('12B','Vidya Krishnan','vidya.krishnan'),    ('12B','Rajan Pillai','rajan.pillai'),
    ('12B','Neha Sabharwal','neha.sabharwal')
)
insert into public.judges (name, username)
select r.name, r.username from roster r;

insert into public.group_judges (group_id, judge_id)
select g.id, j.id
  from (values
    ('3B1','priya.shah'),('3B1','nilesh.bhatt'),('3B1','rekha.iyer'),
    ('3B2','suresh.menon'),('3B2','anita.desai'),('3B2','farah.ansari'),
    ('4B','deepa.kulkarni'),('4B','rajesh.nair'),('4B','sunil.joshi'),
    ('5B','meenakshi.rao'),('5B','anil.kapoor'),('5B','vaishali.patil'),
    ('6B','bhavesh.trivedi'),('6B','kavita.reddy'),('6B','mohan.pillai'),
    ('7B','shalini.gupta'),('7B','devendra.singh'),('7B','nandita.bose'),
    ('8B','prakash.kamath'),('8B','asha.verma'),('8B','imran.sheikh'),
    ('9B1','geeta.subramanian'),('9B1','vikram.chauhan'),('9B1','leela.nambiar'),
    ('9B2','harish.pandey'),('9B2','rupa.ghosh'),('9B2','ajay.thakur'),
    ('10B','snehal.deshpande'),('10B','arun.malhotra'),('10B','bhavna.shetty'),
    ('11B','kiran.ranganathan'),('11B','smita.agarwal'),('11B','tushar.bansal'),
    ('12B','vidya.krishnan'),('12B','rajan.pillai'),('12B','neha.sabharwal')
  ) as m(grade, username)
  join public.groups g on g.name = m.grade
  join public.judges j on j.username = m.username;

-- ---------------------------------------------------------------------------
-- credentials: one demo password, hashed here, never stored in clear
-- ---------------------------------------------------------------------------
insert into private.credentials (id, username, role, password_hash)
select j.id, j.username, 'judge', extensions.crypt('Vidyapith2027', extensions.gen_salt('bf', 10))
  from public.judges j;

update private.credentials
   set password_hash = extensions.crypt('Vidyapith2027', extensions.gen_salt('bf', 10)),
       failed_attempts = 0, locked_until = null
 where role in ('superjudge', 'admin');

commit;

-- Check:
--   select g.name, count(distinct s.id) students, count(distinct gj.judge_id) judges
--     from public.groups g
--     left join public.students s on s.group_id = g.id
--     left join public.group_judges gj on gj.group_id = g.id
--    group by g.name order by g.name;
--   -- expect 5 and 3 for every grade
