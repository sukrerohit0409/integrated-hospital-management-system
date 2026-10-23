# Security & Operations Checklist

## Required setup before deploying these changes

1. Back up the active Supabase database/schema.
2. Review and apply the updated `supabase/schema.sql` to the correct Supabase project. This adds the server-only API rate-limit table/function, the patient-owned blood-group RPC, staff shift assignment handling, and appointment shift validation. The API routes deliberately fail closed if the limiter RPC is missing.
3. Deploy the updated frontend and Vercel API routes together so their contracts are aligned. Mobile-number login uses `api/auth-login.ts`; configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as server-only Vercel variables. Use `npx vercel dev` to exercise API routes locally; `npm run dev` only starts Vite.
4. Verify Supabase Auth email confirmation, password-reset, and invitation templates/redirect URLs in the Supabase dashboard. The app validates `@gmail.com` on patient registration/invitation forms, but code cannot make delivery work without provider configuration.
5. Configure server-only environment variables in the hosting platform. Do not commit actual values or post credentials in issue trackers.
6. Smoke-test roles and database policies with least-privileged accounts, including negative tests for unauthorized API/database writes.

## Environment variable boundaries

### Browser-safe values (public by design)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (or the configured publishable key)

### Server-only values
- `SUPABASE_URL` (or the server fallback supported by the route)
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — never prefix this with `VITE_`
- `SMTP_HOST`, `SMTP_PORT` (currently port 465), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL`

Use `.env.example` only as a variable-name guide. Create a local ignored `.env.local` for local development and platform environment settings for deployment. Rotate any credential that has been accidentally committed or exposed.

## Protections added in this pass

- Consistent name/email/mobile/password input limits and client validation.
- Fixed country prefix `+91` with a ten-digit Indian mobile entry field; server routes check digits/range.
- Strict Gmail validation for patient flows that send email confirmation/invitations, with explicit frontend errors.
- Password visibility controls on login, registration, password change, and staff creation forms.
- Optional explicit blood group capture; no invented `B+` default. Patient self-edit goes through a narrowly scoped RPC.
- API rate limits by hashed IP/account key for staff provisioning and appointment confirmation email routes. Mobile-number login uses the same server-side database limiter for IP and phone buckets, returns generic credential errors, fails closed when rate limiting is unavailable, and never exposes the profile email lookup to anonymous clients.
- Existing Supabase RLS/triggers remain the authority for data ownership/roles, with shift-slot enforcement for appointments. The active-doctor directory is exposed through a narrow authenticated RPC rather than a profile-wide RLS rule; database attendance inserts reject accounts not marked `active`. Apply `supabase/migrations/20261018_privacy_and_attendance_guards.sql` before deploying code that uses the new RPC, or apply the updated full `supabase/schema.sql` in a planned schema rollout. Attendance rows snapshot the assigned shift and expected end timestamp; a server-side database cron records automatic checkout at the expected end and calculates hours from trusted timestamps. A client-side fallback exists only in local/demo mode; production Supabase attendance relies on `pg_cron` so the browser does not race the database job.
- In-page error/success feedback, a top-level render-error fallback, dynamic dashboard imports, slower hidden-tab-aware fallback sync, and smaller WebP images.

## Operational limitations to address before real patient data

- **Not a security/clinical compliance certification.** Have qualified security, privacy, legal, and clinical stakeholders review the app and its data processing obligations before live use.
- Add stronger abuse protection at the edge (WAF/DDoS controls), structured audit logs, alerting, rate-limit dashboards, and retention/cleanup monitoring.
- Review PII exposure in logs and data exports. Never log passwords, tokens, raw sensitive patient data, or SMTP credentials.
- Establish automated encrypted backups and prove point-in-time recovery/restore procedures.
- The shift API blocks a doctor shift change when future online/follow-up appointments would fall outside the new shift. It does not automatically reschedule them. The current RPC performs conflict checking and the shift update in one database transaction while sharing a doctor-specific advisory lock with appointment inserts/updates; verify this invariant with concurrent staging requests and use a controlled roster-change procedure.
- Add migration/version management and staging validation rather than treating `schema.sql` as an unreviewed production one-shot script.
- Add unit/integration/e2e tests for all role permissions, appointment concurrency, registration edge cases, rate limits, and Realtime reconnect cases.
- Verify the correct business contact information, clinical coverage statements, privacy notice, terms, emergency instructions, and accessibility behavior before public launch. The landing page currently uses service/department copy and avoids a placeholder emergency phone number.

## Suggested deployment sequence

```text
Backup current Supabase data/schema
        ↓
Apply/review supabase/schema.sql in staging
        ↓
Enable pg_cron and run supabase/attendance-auto-checkout-cron.sql
        ↓
Confirm the named job is active and test an overdue attendance record
        ↓
Run SQL/RLS negative tests and API smoke tests
        ↓
Configure auth email / SMTP / redirect URLs
        ↓
Deploy Vercel API + frontend from the same commit
        ↓
Verify rate-limit RPC, account invites, patient blood-group save, and shift slots
        ↓
Promote after clinical/business acceptance and recovery checks
```


## Automatic checkout behavior and testing

- The current policy uses one `general` shift for all non-patient profiles. The schema migration changes existing morning/evening/night/unassigned profile values to `general` without changing attendance snapshots or deleting appointments.
- General Shift uses `Asia/Kolkata`: **09:00–22:00**, fixed lunch **13:00–14:00**, with clock-in allowed from 08:30 except during lunch. Automatic checkout remains exactly 22:00 for new records.
- Online/follow-up appointment starts are every 15 minutes from 09:00–12:45 and 14:00–21:45. The shared UI, staff API and database trigger reject lunch-window and out-of-hours starts.
- On new clock-in, the database snapshots `shift = general` and scheduled `shiftEndAt`. The Cron job runs once per minute and uses that saved end timestamp. New General Shift records calculate `hoursWorked` from clock-in to checkout less the portion overlapping lunch; older attendance rows retain their saved end and gross-hour semantics.
- Future appointments previously booked during 13:00–14:00 must be audited/rescheduled deliberately before rollout. The migration does not delete them. Verify Cron and staging workflows after applying the schema; emergency overnight response is separate from the routine General Shift roster.
- Smoke tests: run `npm run check:smoke`. SQL contract checks confirm the core rules and scheduler configuration are present; they do not replace applying the SQL to a staging Supabase project or a full build.
- Staging acceptance: assign test users to morning/evening across doctor, receptionist and other staff roles; verify allowed/disallowed clock-ins; book 15-minute slots at boundaries (09:00, 16:45, 14:00, 21:45) and reject outside slots; change a user's shift while an attendance record is open and confirm its stored end remains unchanged; then confirm Cron writes the exact scheduled checkout and working hours, and repeated Cron runs are idempotent.

## Workspace URL routing and access control (2026-10-17)

The Vite app now uses exact-match workspace routes and a role guard in `src/App.tsx`. Workspace tabs are URL-backed by `src/hooks/useWorkspaceTab.ts`; canonical paths and the role matrix live in `src/utils/workspaceRoutes.ts`. Unknown paths never fall through to a dashboard. An anonymous visitor who opens a protected route is sent to `/login?redirect=...`; after authentication, the redirect target is accepted only if it matches a known route and the signed-in profile is allowed to access it. Wrong-role routes redirect to that user's own default workspace. The `redirect` parameter is not an open redirect.

### Canonical workspace route map

| Role | Feature URLs |
|---|---|
| Admin | `/portal/admin/overview`, `/portal/admin/revenue`, `/portal/admin/expenses`, `/portal/admin/attendance`, `/portal/admin/staff`, `/portal/admin/appointments` |
| Manager | `/portal/manager/overview`, `/portal/manager/attendance`, `/portal/manager/staff`, `/portal/manager/leaves` |
| Doctor | `/portal/doctor/now`, `/portal/doctor/upcoming`, `/portal/doctor/completed` |
| Receptionist | `/portal/receptionist/queue`, `/portal/receptionist/fees`, `/portal/receptionist/collections`, `/portal/receptionist/walk-in`, `/portal/receptionist/slots` |
| Staff (nurse, cleaner, ward boy, other) | `/portal/staff/attendance`, `/portal/staff/leaves` |
| Patient | `/portal/patient/history`, `/portal/patient/book-appointment`, `/portal/patient/follow-ups` |
| Public | `/` hospital information page; `/login` sign-in/registration modal |

`vercel.json` rewrites `/login` and `/portal/:path*` to the SPA entry point so direct links and refreshes load the React route guard. The rewrites do not target `/api/*`.

**Security boundary:** URL guards control which UI renders; they do not make static JavaScript bundles secret. Production data protection still depends on `supabase/schema.sql` Row Level Security policies and database functions, plus authentication/role checks in server-side API endpoints such as `/api/staff` and `/api/auth-login`. Never use a frontend route check as permission to read or mutate sensitive records. Test positive and negative role access against the deployed Supabase project using separate least-privilege accounts.

### Route verification

Run `npm run check:routes` to validate all 23 canonical paths, exact matching, the role access matrix, default role destinations, and safe post-login redirect behavior. `npm run check:smoke` includes this suite. Also test direct URL entry, browser Back/Forward, reload on each role route, anonymous access, and cross-role URL attempts in staging.
