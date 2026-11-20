<!-- RCSU Student Union Election 2026–2027 | Project author: Reinhardson Sangma -->
# Raha College Student Union Election 2026–2027

**Developer:** Reinhardson Sangma  
**Stack:** HTML, CSS, vanilla JavaScript, Supabase Auth, Edge Functions and PostgreSQL.

This is a one-laptop election kiosk. Voting is administrator-controlled and currently remains paused. Do not use it for polling until an administrator is provisioned, the official voter workbook is imported, committee-approved candidate details are checked, and end-to-end tests are completed.

## Repository files

The application source is stored in this repository and in `rcsu-election-source.zip`. The Pages workflow publishes `index.html`, `config.js` and `assets/`. Do not add voter workbooks, student names, enrolment numbers, mobile numbers, Supabase secret keys or service-role keys to GitHub.

## Supabase project

Project reference: `vuiesegeutsegvaabpmo` (Mumbai, `ap-south-1`). The election schema and `election-api` Edge Function are deployed. The browser configuration contains only the public project URL and publishable key. Keep the private schema and all voter/ballot records server-side.

To authorize an administrator after creating the user in Supabase Authentication → Users, run this in the SQL Editor, replacing the email:

```sql
insert into election_private.admins(user_id)
select id from auth.users where email = 'YOUR_ADMIN_EMAIL'
on conflict (user_id) do nothing;
```

Use a unique, strong password and keep public sign-ups disabled. Never use a shared six-digit password for a live election.

## Voter workbook

The workbook is intentionally not part of this repository. Import it only after admin access is ready, using the dashboard's secure batch importer. The workbook quality review identified 3,016 named records; some rows have missing or duplicate identifying values, so ambiguous voter matches must be checked rather than automatically selecting the first result.

## FormSubmit report

The application sends aggregate election reports to `rahacollegenss@gmail.com` using `https://formsubmit.co/ajax/rahacollegenss@gmail.com`. The first submission may require the recipient to click FormSubmit's activation link. Check Inbox, Spam and Promotions, then send a test report after activation. The report must remain aggregate-only; the database is the authoritative tally.

## Before polling

1. Confirm all candidate spellings, names, posts and photos with the election committee.
2. Provision and allow-list an administrator account.
3. Import and verify the official voter register.
4. Test voter verification, duplicate blocking, one-vote enforcement, kiosk reset, pause/resume, results release and CSV export.
5. Keep the laptop supervised and the screen private during voting.

Ballot rows are anonymous in the application database, but this cannot prevent a person physically watching the shared screen from observing a student's selections.
