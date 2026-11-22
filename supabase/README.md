# Database security & rules

The app talks to Supabase directly from the browser, so the database is the only
place a rule can actually be enforced. These three migrations move authentication
and authorisation there.

```
supabase/migrations/
  001_auth.sql       login inside Postgres + tokens  (permissions untouched)
  002_policies.sql   per-role rules + seed criterion groups/ranges
  003_lockdown.sql   removes the old open door
  rollback.sql       restores the old open state in one paste
```

Each file is idempotent and wrapped in a transaction: if anything fails, nothing
is applied.

## What each phase does

| Phase | Database | Client | Old client still works? |
|---|---|---|---|
| 001 | `private.credentials`, `login()`, `admin_*()` RPCs, audit log | login via `rpc('login')`, sends the token | yes |
| 002 | policies for the `authenticated` role, criterion groups/ranges seeded, score-range trigger, audit triggers | none | yes (old policies still present) |
| 003 | drops the permissive policies, revokes `anon` grants, drops `password_hash` columns | none | **no** — deploy the new client first |

## Before you start: the signing secret

`login()` mints a JWT signed with the project's legacy JWT secret, so PostgREST
accepts it and RLS knows who is calling. Store it once:

```sql
-- preferred (encrypted at rest)
select vault.create_secret('<JWT secret>', 'scoring_jwt_secret');

-- or, if Vault is not available
alter database postgres set app.jwt_secret = '<JWT secret>';
```

Find it in Dashboard → Project Settings → API → JWT Settings → *JWT Secret*.
Without it, `login()` stops with `JWT secret not configured` and nobody can log in.

Rotating that secret invalidates every issued token **and** the anon key committed in
`supabase-config.js` — if you rotate, update that file in the same sitting.

## Applying

**SQL Editor (no tools needed):** paste 001 → run → paste 002 → run → paste 003 → run.
Each prints nothing on success; the check queries at the bottom of each file give you
a number to confirm.

**Or from a machine with psql:**

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/001_auth.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/002_policies.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/003_lockdown.sql
```

Run 003 only after the new client is live. Between 001 and 003 both code paths work.

## Verifying

```bash
python3 scripts/verify_security.py
```

Reads `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `TEST_JUDGE_USER`, `TEST_JUDGE_PASS`,
`TEST_SUPER_USER`, `TEST_SUPER_PASS`, `TEST_ADMIN_USER`, `TEST_ADMIN_PASS` from the
environment and checks the matrix with real requests: anonymous is refused on every
table, a judge only sees their own grade and own scores, a judge cannot write outside
their grade, a super judge sees everything, admin can read reference data but not
credentials.

Do **not** point the lockout test at a real account — five wrong passwords lock it
for five minutes by design.

## Rolling back

`rollback.sql` one paste: restores the permissive policies, the `anon` grants and the
`password_hash` columns (refilled from `private.credentials`). The old client works
again immediately.

## The rules

| table | read | write |
|---|---|---|
| groups, criteria, criterion_groups, topics | any signed-in | admin (groups also super judge) |
| students | admin/super judge, or a judge's own grades | admin |
| group_judges | admin/super judge, or own edges | admin/super judge |
| judges, super_judges | admin/super judge, or self | admin (via RPC), delete via RLS |
| scores | admin/super judge, or own | judge: own + own grades + **before submitting**; staff: any |
| submissions | admin/super judge, or own | judge: own + own grades; delete = staff unlock |
| judge_notes | admin/super judge, or own | judge: own + own grades |
| `private.credentials` | nobody | only `login()` / `admin_*()` |

`anon` has no table privileges at all. Its only callable function is `login(...)`.

## If nobody can log in

The old `admin`/`admin` fallback is gone on purpose: there has to be a real row in
`private.credentials`. To set a password from the SQL editor (the escape hatch when the
hash is wrong, the password is forgotten, or the account locked itself out):

```sql
update private.credentials
   set password_hash = crypt('new-password-here', gen_salt('bf', 10)),
       failed_attempts = 0,
       locked_until = null
 where role = 'admin' and username = 'admin';
```

List the accounts the same way:

```sql
select role, username, last_login_at, failed_attempts, locked_until
  from private.credentials order by role, username;
```

A malformed or placeholder hash cannot crash the login: `login()` treats it as a
wrong password, so the symptom is "Invalid username or password", not a 500.

## Things that surprised us, keep them in mind

- `ON CONFLICT DO UPDATE` (what `.upsert()` does) needs **UPDATE** privilege even when
  no row conflicts, so `submissions` has an UPDATE policy and grant.
- A blanket `revoke all on all functions in schema public` also strips EXECUTE from
  `uuid_generate_v4()`, which the id defaults need — revoke specific functions instead.
- PostgREST returns *zero rows* rather than an error when RLS filters a SELECT, and
  *zero rows* for a filtered UPDATE/DELETE. Only INSERT raises "violates row-level
  security policy", so tests must check row counts for update/delete.
- The token is stateless with a 12-hour lifetime: logout is client-side. If you need
  forced logout, add a `session_epoch` column and compare it in `app.uid()`.
