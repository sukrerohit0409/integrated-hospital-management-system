# PulseCare IHMS — Integrated Hospital Management System

A comprehensive, role-based hospital management web application built with **React 19**, **TypeScript**, **Tailwind CSS 4**, and **Vite 8**.

## Features

- **Multi-Role Dashboards** — Admin, Manager, Doctor, Receptionist, Staff (Nurse/Ward Boy/Cleaner), and Patient portals
- **Appointment Management** — Online booking, walk-in registration, queue management, and slot checker
- **Digital Prescriptions** — Doctors write prescriptions with print-ready modal
- **Fee Collection & Billing** — Cash / Card / UPI payment tracking with real-time revenue reports
- **Medical Test Charges** — Doctors can add consultation charges; reception must review and approve them before collection
- **Staff Attendance** — Two eight-hour OPD shifts, scheduled automatic checkout, and working-hours tracking
- **Leave Management** — Staff apply for leave, Managers approve/reject
- **Revenue & Expense Analytics** — Date-filtered financial dashboards for Admin
- **Responsive Design** — Works on mobile, tablet, and desktop

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript 7 |
| Styling | Tailwind CSS 4 |
| Build Tool | Vite 8 |
| Icons | Lucide React |
| Animation | Motion (Framer Motion) |
| Authentication | Supabase Auth (when configured) |
| User profiles | Supabase PostgreSQL with Row Level Security |
| Dashboard records | Supabase PostgreSQL with Row Level Security and Realtime |

## Getting Started

### Prerequisites

- **Node.js** v20.19+ or v22.12+ (Vite 8 requirement)
- **npm** v9 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/<your-username>/pulsecare-ihms.git
cd pulsecare-ihms

# Install dependencies
npm ci

# Start the development server
npm run dev
```

The app will be available at **http://localhost:3000**

### Production Build

```bash
npm run build
npm run start
```

The repository-root GitHub Actions workflow runs `npm ci`, the frontend and API TypeScript checks, and the production build for every push and pull request.

## Local demo mode

Without Supabase environment variables, development mode uses browser-local demo data. Changes to demo records are broadcast to other open tabs in the same browser, while sign-in sessions remain isolated per tab. The local-only demo password is `local-demo-only-not-for-deployment`; demo credentials are public and must never be reused for Supabase, deployment, or real patient/hospital accounts. Configure real accounts and unique passwords directly in Supabase; do not publish or reuse production credentials. Email verification and patient account registration are unavailable in demo mode; public registration is blocked, and reception can register a walk-in visit without creating a portal account. With Supabase configured, dashboards load from the shared database and new changes are synchronized to other signed-in users; if Realtime is disconnected, the client temporarily refreshes shared data every 10 seconds until the channel reconnects. The app does not import browser demo records into Supabase.

Authentication is isolated per browser tab. Opening a duplicated tab does not copy the signed-in user session; sign in separately in each tab. Reloading the same tab preserves its session. The public hospital page has no visible staff-login or generic Sign In button; the appointment entry opens the account form. Signed-in users still see their profile and logout controls.

## Supabase authentication setup

### Create and configure the database

1. Create a Supabase project and save its database password securely. Select the region closest to the hospital and wait until the project is ready.
2. In **Project Settings → API**, copy the Project URL and the publishable/anon key. The browser uses only these public values; never use the service-role key in frontend code.
3. Open **SQL Editor → New query**, paste the complete contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it first. Use a clean Supabase database for a new deployment. The script also supports the earlier auth-only schema; back up existing production data before applying schema upgrades. Keep the SQL files separate: `schema.sql` defines tables/functions, while `attendance-auto-checkout-cron.sql` schedules a function created by the schema.
4. In **Table Editor**, verify that `profiles`, `ihms_records`, and `ihms_prescriptions` exist. In **Database → Publications**, verify that the tables are part of `supabase_realtime` (the script adds them). Keep Row Level Security enabled on all three tables; the script creates their role/ownership policies.
5. In **Authentication → URL Configuration**, set the Site URL to your production Vercel URL and add the local and deployment callback URLs to Redirect URLs, for example `http://localhost:3000/**` and `https://<your-project>.vercel.app/**`. Add your custom domain and preview domain patterns if used. In **Authentication → Providers → Email**, enable **Confirm email**. Configure a production SMTP provider before registering or inviting real users; without confirmation enabled, the app refuses an immediate signup session and reports the configuration problem.

### Connect the application and bootstrap its first admin

6. Copy `.env.example` to `.env.local`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for local browser access. Keep `SUPABASE_SERVICE_ROLE_KEY` and any provider API keys server-side; do not commit `.env.local`.
7. For UI-only local work, start Vite with `npm run dev`. Patient portal invitations and mobile-number sign-in use Vercel API routes (`/api/staff` and `/api/auth-login`): sign in to the Vercel CLI with `npx vercel login`, link this folder to your Vercel project with `npx vercel link`, then start the whole app with `npx vercel dev` (not `npm run dev`) to test these API routes locally. This command loads the server-side variables from `.env.local`; never copy the service-role key into a `VITE_` variable. If Vercel asks for a port, use the prompted available port.
8. Register the first account through the app's patient registration form and confirm its email before signing in. In Supabase **Authentication → Users**, copy that user's UUID. In **SQL Editor**, promote only this trusted account:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = 'AUTH_USER_UUID'
     and role = 'patient';
   ```

   Confirm that exactly one row was updated, then sign out and sign back in so the app reloads the new role. Patient self-registration always receives the `patient` role.
9. Admins and Managers can create staff accounts from their dashboards. Staff email addresses are confirmed when the account is created; enter a unique initial password of at least 8 characters and share it securely with the staff member. Reception can optionally invite a patient portal account using the patient's real email address; the recipient must accept the emailed link and set a password before accessing the portal. Walk-in registration without a portal account remains available.

### Deploy and verify

10. Push the project to GitHub and import that repository into Vercel. The application is stored at the repository root; use the repository root as Vercel's Root Directory. Vercel installs build-time dependencies with `npm ci --include=dev`, then uses `npm run build` and `dist` as configured in [`vercel.json`](./vercel.json).
11. In Vercel **Project → Settings → Environment Variables**, set these for Preview and Production, then redeploy:
    - `VITE_SUPABASE_URL`
    - `VITE_SUPABASE_ANON_KEY`
    - `SUPABASE_URL`
    - `SUPABASE_ANON_KEY`
    - `SUPABASE_SERVICE_ROLE_KEY` (server-only; required for staff provisioning, rate-limited mobile-number sign-in, and other trusted server routes; never prefix with `VITE_`)
12. Test registration, email confirmation, login by both email and mobile number, logout, password change, Admin/Manager staff creation, a receptionist patient invitation, and a booking using separate browser profiles for different roles. Verify staff accounts can sign in without email confirmation and patient invitations still require accepting the emailed link. Verify that a patient cannot see another patient's records and that reception cannot read prescriptions. Also test two users booking the same doctor/time; only one should succeed.

After deploying an application update that changes database policies, triggers, or validation, rerun the current [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL Editor before testing the affected workflows. The schema is designed to be reapplied to an existing installation; back up production data before applying database changes.

The cloud database starts empty. Existing local demo accounts and browser data are not uploaded automatically. The schema stores bookings, prescriptions, attendance, leave, revenue, and expenses as shared records. Row Level Security limits each role's access. Consultation and prescription changes are saved together in a database transaction. The unique doctor/date/time index prevents duplicate online/follow-up bookings, and follow-up requests are linked to their source visit. Date-only workflows use India Standard Time (`Asia/Kolkata`); attendance clock-in/out timestamps and worked hours are generated by the database rather than trusted from the browser.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are read by the server-side [`api/staff.ts`](./api/staff.ts) endpoint, which verifies caller permissions before creating email-confirmed staff accounts for Admins/Managers or sending email-verification invitations for patient portal accounts. Payment collection and the corresponding revenue record are written together by a database trigger; rerun the schema before enabling the updated app. Never expose the service-role key to the browser or commit it to GitHub.

When Supabase is configured, users can sign in with either their registered email address or their 10-digit Indian mobile number. Mobile login uses the same-origin `/api/auth-login` Vercel route, a server-side profile lookup, Supabase Auth password verification, and the existing database-backed rate limiter. For local API testing use `npx vercel dev`; Vite-only `npm run dev` does not serve Vercel API routes. Duplicate mobile numbers are rejected as ambiguous.

This is an application foundation, not a compliance certification or a substitute for clinical security review. Before handling real patient/financial information, review local healthcare/privacy requirements, backups, audit trails, retention, MFA, access review, and operational recovery. Never expose the Supabase service-role key in browser code.

## Deploy to Vercel

### Patient appointment confirmation email

Patient-created appointments send a confirmation email after the appointment is persisted. The server-side Vercel function reads Gmail SMTP settings only from environment variables and sends only to the authenticated patient's profile email. The appointment email notification ledger is created by [`supabase/schema.sql`](./supabase/schema.sql); rerun the schema before enabling this workflow on an existing Supabase project.

Configure these server-only Vercel variables:

- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=465`
- `SMTP_USER=your Gmail address`
- `SMTP_PASS=your Google App Password`
- `SMTP_FROM_NAME=Integrated Hospital Management System`
- `SMTP_FROM_EMAIL=your Gmail address`

Do not prefix SMTP variables with `VITE_`. The Gmail account must have 2-Step Verification enabled and use a Google App Password. Email delivery failures do not create duplicate appointments; the booking remains persisted and can be retried safely through the notification ledger.

1. Push the project to a Git provider and import it in Vercel.
2. Use the default Vite settings (`npm run build`, output directory `dist`); [`vercel.json`](./vercel.json) declares them.
3. Set the Supabase environment variables above in Vercel. Do not add a Supabase `service_role` key to any `VITE_` variable or browser code.
4. Deploy, verify `/api/health` and `/api/hospital`, then test sign-up, email confirmation, sign-in, sign-out, and password change.

You must connect your own Supabase and Vercel accounts to perform the actual hosted deployment; this workspace cannot create those external projects or set their secrets.

## Project Structure

```
├── api/                  # Vercel serverless routes (health, hospital, staff provisioning, mobile login)
├── supabase/
│   ├── schema.sql        # Shared data tables, access policies, and integrity checks
│   └── attendance-auto-checkout-cron.sql # Scheduled checkout and job-history cleanup
├── src/
│   ├── assets/images/    # Doctor avatars and hero images
│   ├── components/
│   │   ├── admin/        # Admin dashboard (revenue, expense, staff, attendance)
│   │   ├── doctor/       # Doctor dashboard (consultations, prescriptions)
│   │   ├── manager/      # Manager dashboard (staff oversight, leave approvals)
│   │   ├── patient/      # Patient dashboard (booking, history, follow-ups)
│   │   ├── receptionist/ # Receptionist dashboard (queue, fee collection, walk-in)
│   │   ├── staff/        # Staff dashboard (attendance, leave applications)
│   │   ├── Navbar.tsx
│   │   ├── LoginModal.tsx
│   │   ├── ChangePasswordModal.tsx
│   │   └── PrintPrescriptionModal.tsx
│   ├── data/
│   │   ├── mockData.ts   # Initial seed data
│   │   └── store.ts      # Shared client cache with Supabase persistence and Realtime sync
│   └── types/
│       └── index.ts      # TypeScript type definitions
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Staff shift attendance automation

The current policy is one General Shift (`details.shift = 'general'`) for all non-patient staff. The schema migration converts legacy morning/evening/night/unassigned profile values to `general`; patient profiles are not assigned a workforce shift.

General Shift is 09:00–22:00 Asia/Kolkata, with a fixed 13:00–14:00 lunch break. Clock-in opens at 08:30, is blocked during lunch, and rejects times at/after 22:00. New attendance rows store the 22:00 end timestamp. Appointment starts are every 15 minutes from 09:00–12:45 and 14:00–21:45; the UI, staff API and database trigger must agree on these boundaries.

The database snapshots `general` and `shiftEndAt` at clock-in. Cron runs once per minute and checks out against the saved end timestamp. New General Shift working hours subtract only the overlap with lunch. Existing attendance retains its saved checkout timestamp and old gross-hour semantics. The migration does not delete/update appointment rows already booked for 13:00–13:59; audit and deliberately reschedule future active bookings in this window before production.

Run `npm run check:smoke`, `npm run lint`, and `npm run build`. SQL contract checks are static; apply the schema in staging, confirm Cron runs, and test manual/automatic checkout and slot validation before production.

## Maintainer reference docs

- [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) — architecture and durable project notes
- [`docs/CODEBASE_MAP.md`](./docs/CODEBASE_MAP.md) — primary file/logic flows
- [`docs/CHANGE_TRACKING.md`](./docs/CHANGE_TRACKING.md) and [`CHANGELOG.md`](./CHANGELOG.md) — changes and deployment notes
- [`docs/SQL_EXECUTION_ORDER.md`](./docs/SQL_EXECUTION_ORDER.md) — why the two SQL files remain separate and the exact execution order

Use these files as the project memory and change-control reference before making further modifications:

- [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) — architecture, core files, coding boundaries, and future-maintenance rules.
- [`docs/CODEBASE_MAP.md`](./docs/CODEBASE_MAP.md) — key frontend/API/database flows and where each behavior is implemented.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system diagram and trust boundaries.
- [`docs/CHANGE_TRACKING.md`](./docs/CHANGE_TRACKING.md) — regression checklist and task-record template.
- [`docs/SECURITY_AND_OPERATIONS.md`](./docs/SECURITY_AND_OPERATIONS.md) — schema, environment, security, and deployment checklist.
- [`CHANGELOG.md`](./CHANGELOG.md) — user-visible and security-relevant code changes.

After installing dependencies with `npm ci`, run `npm run check:smoke`, `npm run lint`, and `npm run build`. Database changes in [`supabase/schema.sql`](./supabase/schema.sql) must be reviewed and applied to the intended Supabase project before deploying code that depends on new RPCs or triggers.

## License

This project is for educational and demonstration purposes.


## 2026-10-18 — Two-shift staffing and 15-minute booking

- Standardized staff, doctor and receptionist shift selection to Morning 09:00–17:00 and Evening 14:00–22:00. Legacy night profiles are normalized to Unassigned and must be deliberately reassigned.
- Updated all patient/reception booking slot generation and server/database validation to 15-minute start increments (32 starts per shift).
- Updated clock-in validation and scheduled checkout ends; the shift and `shiftEndAt` are captured on each attendance record, so a roster update applies on the next clock-in and does not move the end of an active record.
- Added smoke coverage for 2-shift forms, reception-role shift support, quarter-hour boundaries, stored shift-end semantics, and current SQL/cron security contracts.


## 2026-10-18 — Single General Shift and lunch-aware attendance

- Replaced per-person morning/evening assignments with one General Shift from 09:00 AM–10:00 PM Asia/Kolkata for all non-patient profiles, with a fixed 01:00–02:00 PM lunch break.
- Patient/reception booking slots remain 15 minutes and exclude all starts during lunch: 09:00–12:45, then 14:00–21:45 (48 starts per doctor before reservations).
- Clock-in allows 08:30–22:00 except lunch; new attendance records auto-check out at 22:00. New General Shift hours subtract the overlap with lunch.
- The schema migration maps existing non-patient profiles to `general` but preserves historical attendance end timestamps and gross-hour calculations. Existing future bookings during lunch are not deleted; operators must audit/reschedule them before rollout.
- Added regression tests for 48 slots, lunch validation, 12/12.5-hour working-time examples, and historical attendance compatibility.
