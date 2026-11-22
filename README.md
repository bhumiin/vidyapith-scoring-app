# Vidyapith Youth Day Scoring System

A web-based scoring application for managing student evaluations during Youth Day events.

## Features

- **Role-based Access**: Three user roles (Admin, Judge, Super Judge)
- **Group Management**: Organize judges into groups and assign students to groups
- **Scoring System**: Score students on multiple criteria (1-10 scale)
- **Score Aggregation**: Automatic calculation of totals and averages
- **Data Export**: Export scores to CSV or Excel format
- **Local Storage**: All data stored locally in browser

## Getting Started

1. Open `index.html` in a web browser
2. Login as Admin (username: `admin`, password: `admin`)
3. Set up your event:
   - Add students (bulk import supported)
   - Add judges with usernames and passwords
   - Add super judges with usernames and passwords
   - Add scoring criteria
   - Create judge groups
   - Assign judges to groups
   - Assign students to groups

## User Roles

### Admin
- Manage all students, judges, super judges, and criteria
- Create and manage judge groups
- Assign judges and students to groups
- Import/export configuration

### Judge
- View only students assigned to their group(s)
- Score students on all criteria (1-10 scale)
- Save drafts before final submission
- Submit scores (locks editing)
- View scored students list

### Super Judge
- View all groups and students
- See aggregated scores only after all judges in a group submit
- Edit any judge's scores (unlocks for editing)
- Manage groups (same as Admin)
- Export scores to CSV/Excel

## Workflow

1. **Setup Phase** (Admin):
   - Add all students, judges, super judges, and criteria
   - Create judge groups
   - Assign judges to groups (judges can belong to multiple groups)
   - Assign students to groups (each student belongs to exactly one group)

2. **Scoring Phase** (Judges):
   - Judges log in with their credentials
   - Select a student from their assigned group(s)
   - Enter scores for each criterion (1-10)
   - Save draft or submit final scores
   - Once submitted, scores are locked (only super judges can unlock)

3. **Review Phase** (Super Judges):
   - Super judges log in with their credentials
   - View students and their scores
   - Scores are visible only after all judges in the student's group have submitted
   - Can unlock and edit any judge's scores
   - Export final scores to CSV/Excel

## Data Storage

All data lives in Supabase (Postgres). The browser keeps only the login token.
To back up, use the Export Configuration feature in Admin view, or Supabase's own
database backups.

## Access control

Logins are verified inside the database (`public.login()`), which returns a signed,
12-hour token that the browser sends on every request. Row-level security then decides
what each role may read or write — a judge only sees their own grade, cannot score
another grade's students, and cannot change scores after submitting. The database
schema, the rules and the rollout procedure are documented in
[`supabase/README.md`](supabase/README.md).

## Export Formats

### CSV Export
- Raw data: Student, Group, Judge, Criterion, Score, Submitted status

### Excel Export
- Two sheets:
  - Raw Data: All individual scores
  - Summary: Student totals, averages, and judge counts

## Browser Compatibility

Works best in modern browsers (Chrome, Firefox, Safari, Edge). Requires JavaScript enabled.

## Notes

- Passwords are hashed with bcrypt inside Postgres and never leave the database.
- There is no `admin`/`admin` fallback any more: admins need a real account in
  `private.credentials` (created by the setup script or by `admin_set_password`).
- Judge accounts are created by an admin (Judges tab or Excel import), which also
  stores the password hash.
- If nobody can log in after a database change, run `scripts/verify_security.py`
  (see `supabase/README.md`) before touching the client.

## Support

For issues or questions, contact the system administrator.

