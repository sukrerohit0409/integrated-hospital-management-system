# PulseCare IHMS — Integrated Hospital Management System

A comprehensive, role-based hospital management web application built with **React 19**, **TypeScript**, **Tailwind CSS 4**, and **Vite 8**.

## Features

- **Multi-Role Dashboards** — Admin, Manager, Doctor, Receptionist, Staff (Nurse/Ward Boy/Cleaner), and Patient portals
- **Appointment Management** — Online booking, walk-in registration, queue management, and slot checker
- **Digital Prescriptions** — Doctors write prescriptions with print-ready modal
- **Fee Collection & Billing** — Cash / Card / UPI payment tracking with real-time revenue reports
- **Medical Test Charges** — Doctors can add consultation charges; reception must review and approve them before collection
- **Staff Attendance** — One 09:00–22:00 General Shift, fixed lunch break, scheduled automatic checkout, and lunch-adjusted working-hours tracking
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

- **Node.js** v22.12+ (required by the project dependencies)
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

### Verified hospital identity and contact details

Printed prescription slips and `GET /api/hospital` do not invent a hospital registration number or emergency phone number. Configure these only after verifying the details with the responsible organization:

- `VITE_HOSPITAL_REGISTRATION_NUMBER` — optional public registration number printed on the prescription.
- `VITE_HOSPITAL_HELPLINE` — optional public helpline printed on the prescription.
- `HOSPITAL_EMERGENCY_CONTACT` — optional server-only value returned by `GET /api/hospital`.

The two `VITE_` values are public client configuration, not secrets. Leave them unset until the values are verified. Before any public or clinical use, replace prototype copy with accurate approved institution, practitioner, emergency, consent, and privacy information.

### Audit and release preparation

- [Deep code audit and verification status](./docs/DEEP_AUDIT_2026-10-18.md)
- [GitHub push and release checklist](./GITHUB_RELEASE_CHECKLIST.md)

### Production Build

```bash
npm run build
npm run start
```

The repository-root GitHub Actions workflow runs `npm ci`, the frontend and API TypeScript checks, and the production build for every push and pull request.

## Local demo mode

Without Supabase environment variables, development mode uses browser-local demo data. Demo login accepts either a seeded email address or the seeded 10-digit phone number; it also accepts the same number with a `+91` prefix. This compatibility applies only to fictional local demo fixtures. Supabase-backed login continues to enforce strict Indian mobile formatting and uses the server-side `/api/auth-login` route for private phone-to-account resolution. Changes to demo records are broadcast to other open tabs in the same browser, while sign-in sessions remain isolated per tab. The per-tab auth storage key remains stable on a same-origin hard refresh, including normal deployments, so the Supabase session can be restored rather than spuriously cleared. The local-only demo password is `local-demo-only-not-for-deployment`; demo credentials are public and must never be reused for Supabase, deployment, or real patient/hospital accounts. Configure real accounts and unique passwords directly in Supabase; do not publish or reuse production credentials. Email verification and patient account registration are unavailable in demo mode; public registration is blocked, and reception can register a walk-in visit without creating a portal account. With Supabase configured, dashboards load from the shared database and subscribed tables (`ihms_records`, `ihms_prescriptions`, and `profiles`) trigger in-app data refreshes across authorized signed-in profiles. When a tab returns to the foreground or network connectivity is restored, the app performs a reconciliation fetch in case realtime events were missed while the browser was suspended. RLS still limits each role to the records it is authorized to read. The app does not import browser demo records into Supabase.

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

All non-patient staff use one General Shift in India Standard Time: **09:00 AM–10:00 PM**, with a fixed **01:00–02:00 PM lunch break**. Clock-in can open at 08:30 AM (30 minutes early), is blocked during lunch, and ends at 10:00 PM. Automatic checkout uses the saved 10:00 PM shift-end timestamp. A full scheduled day counts as 12 working hours after lunch is deducted.

Appointments use 15-minute slots from **09:00 AM–12:45 PM** and **02:00 PM–09:45 PM**. The frontend, authenticated API checks, and Supabase database trigger all block routine booking starts during lunch and at/after 10:00 PM.

For production, back up Supabase and review `supabase/schema.sql`, enable Supabase Cron / `pg_cron` from Dashboard → Integrations → Cron, and run `supabase/attendance-auto-checkout-cron.sql` second. Verify the job is active in `cron.job` and inspect its runs in `cron.job_run_details`. Existing appointment records in the newly introduced lunch window are not deleted by migration; audit/reschedule them deliberately before rollout. Existing attendance rows retain saved shift-end timestamps and legacy duration semantics; new General Shift attendance applies the lunch deduction.

Run `npm run check:smoke`, `npm run lint`, and `npm run build`. These checks do not replace a staging Supabase integration test. Without the database Cron job, automatic checkout is not guaranteed if staff close the browser (the fallback is local/demo-only).

### Staff shift setup before go-live

The `schema.sql` migration maps all existing non-patient profiles to `general`. No per-person morning/evening selection is required: admin and manager staff forms assign the General Shift automatically. Before applying the migration, inspect and deliberately resolve future appointments booked during 01:00–02:00 PM; the migration will not silently delete or reschedule them.

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

## Workspace URLs and role-based access

Every major dashboard page/filter now has its own URL. See `docs/ROUTING_AND_AUTHORIZATION.md` for the full 23-route map and deployment tests. Protected `/portal/...` routes require a restored sign-in and a matching role; direct URL changes do not render another role's dashboard. The same route is reflected in browser history and survives direct navigation/refresh via the Vercel SPA rewrites.

Frontend route guards are not the data-security boundary: Supabase RLS and server-side API role checks must remain enabled. Run `npm run check:routes` or the full `npm run check:smoke` suite after changes.

