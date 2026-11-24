# Vidyapith Youth Day Scoring System

A scoring app for a volunteer-run Sunday school's annual competition: twelve grades, three judges per
grade, several hundred scores submitted in a couple of hours. It replaces paper scoring sheets and the
arithmetic arguments that come with them.

**Live:** https://vidyapith-scoring-app.vercel.app

## Why it exists

Scoring an event this size on paper needs a room full of volunteers and produces disputes about totals.
The app gives each judge only their assigned students, locks a submission once it is sent, and lets a
super judge review and unlock before results are published.

## How it is built

- **Client** — static HTML/JS on Vercel, no build step.
- **Data** — PostgreSQL via Supabase (PostgREST), row-level security per role.
- **Auth** — login handled inside the database through an RPC; passwords never reach the client and no
  credential is stored in the browser.
- **Anonymous access is refused on all 12 tables** — verified with 40/40 probes, 69/69 policy tests and
  25/25 independent security checks against a local replica before deployment.

Schema and policies: `supabase/`. Verification tests: `scripts/`.
