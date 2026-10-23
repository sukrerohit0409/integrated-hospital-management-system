# PulseCare IHMS — Project Context & Maintenance Notes

**Last reviewed:** 2026-10-17  
**Purpose:** Stable reference for anyone (including future AI-assisted changes) modifying this codebase. Update this document and `CHANGELOG.md` whenever behavior or architecture changes.

## Product summary

PulseCare IHMS is a React/TypeScript web application for a hospital workflow: public hospital information, patient account registration/sign-in, patient appointment booking and follow-up, reception walk-ins and queues, doctor consultation records, staff attendance and leave workflows, management, billing-related records, and administration.

## Technology and deployment shape

- **UI:** React 19, TypeScript, Vite, Tailwind CSS 4, Lucide icons.
- **Identity and primary persistence:** Supabase Auth, Postgres, Row Level Security (RLS), Postgres functions/triggers, Supabase Realtime.
- **Server-only operations:** Vercel API routes under `api/`. These must never run with a service-role key in browser code.
- **Email:** Supabase Auth email delivery for verification/reset/invitations; `api/appointment-confirmation.ts` sends appointment confirmations using server-side SMTP.
- **Source of truth:** In production, Supabase is authoritative. `src/data/store.ts` is the browser-side state/cache and write coordinator. Local seed/demo storage is for local development only.

## Important files

| Path | Responsibility |
|---|---|
| `src/main.tsx` | React entry point and root render |
| `src/App.tsx` | Session restoration, role routing, lazy-loaded dashboards, shared error/success messages |
| `src/components/AppErrorBoundary.tsx` | Accessible fallback UI for unexpected render-time exceptions |
| `src/components/PublicHospitalHome.tsx` | Public hospital landing page, service/department information, appointment/sign-in entry points |
| `src/components/LoginModal.tsx` | Patient registration, sign-in, email verification messaging, password reset |
| `src/components/ChangePasswordModal.tsx` | Change/set/recover password UI |
| `src/components/admin/AdminDashboard.tsx` | Staff and role administration, financial and appointment summaries |
| `src/components/manager/ManagerDashboard.tsx` | Workforce, attendance, leave, and staff-management workflows |
| `src/components/doctor/DoctorDashboard.tsx` | Doctor queue, consultation and prescription workflows |
| `src/components/receptionist/ReceptionistDashboard.tsx` | Walk-in registration, quick slot booking, queue and fee workflows |
| `src/components/patient/PatientDashboard.tsx` | Patient history, appointment booking, follow-ups, and profile blood group |
| `src/components/staff/StaffDashboard.tsx` | Non-clinician/nursing attendance and leave workflows |
| `src/components/IndianPhoneInput.tsx` | Shared fixed `+91` prefix and 10-digit mobile field |
| `src/utils/validation.ts` | Shared client validation and field length limits; validate again on the server/database |
| `src/utils/staffShifts.ts` | Canonical General Shift (09:00–22:00), fixed lunch break and 15-minute appointment slot generation |
| `src/data/auth.ts` | Current Supabase profile hydration |
| `src/data/store.ts` | Shared data cache, Realtime and fallback refresh, write queue and state notification |
| `src/data/staffAccounts.ts` | Browser client for the server-only staff account API |
| `api/staff.ts` | Authenticated staff/patient account provisioning, status/shift changes, server-side rate limits |
| `api/appointment-confirmation.ts` | Authenticated, idempotent appointment confirmation email delivery and rate limits |
| `supabase/schema.sql` | RLS policies, data validation/authorization triggers, appointment controls, staff shift validation, attendance shift-end snapshots, and automatic-checkout RPC |
| `supabase/attendance-auto-checkout-cron.sql` | Schedules the database automatic-checkout worker using Supabase Cron / pg_cron |
| `scripts/check-shift-attendance.mjs` | Shift and overnight attendance smoke checks |
| `scripts/check-attendance-sql.mjs` | Static contract checks for SQL permissions, shift validation, indexes, and cron setup |
| `scripts/check-attendance-ui.mjs` | Ensures Supabase-backed checkout is not raced by stale browser fallback writes |
| `scripts/check-hospital-date.mjs` | India-time slot/date regression checks |
| `docs/CODEBASE_MAP.md` | Detailed file/data-flow map |
| `docs/ARCHITECTURE.md` | Runtime architecture, control boundaries and data flow |
| `docs/SECURITY_AND_OPERATIONS.md` | Deployment, environment variables, security and operational checklist |
| `docs/CHANGE_TRACKING.md` | Change-log process and regression checklist |
| `CHANGELOG.md` | Human-readable list of project changes |

## Core design rules for future changes

1. **Keep authorization server/database-side.** A disabled button or hidden component is not access control. Sensitive writes must still pass Supabase RLS or a narrowly scoped RPC/authorized API route.
2. **Do not put `SUPABASE_SERVICE_ROLE_KEY`, SMTP credentials, or private secrets in `VITE_*` variables or browser source.** Only publish the Supabase URL and anon/publishable key to the frontend.
3. **Use the shared validation helpers and `IndianPhoneInput`.** Names have a maximum of 80 characters, emails 254 characters, and Indian mobiles are stored as ten national digits (UI country prefix is fixed at `+91`). Validate again at API/database boundaries.
4. **Never invent clinical values.** Blood group is optional and remains blank until supplied; do not silently default it to `B+` or any other group.
5. **Use `getShiftAppointmentSlots()` for patient booking and receptionist slot picking.** Database trigger validation is the final gate for appointment shift/time constraints. Keep the insert/API validator aligned: General Shift slots are 09:00–12:45 and 14:00–21:45; do not allow routine booking starts from 13:00–13:59.
6. **Surface user-safe messages via `ihms:data-error` / `ihms:data-success-message`.** Avoid browser `alert()` calls. Keep internal diagnostic details in the server/browser console, but do not return secrets or raw internal stack traces.
7. **Keep dashboards lazy-loaded.** `App.tsx` should not statically import every role dashboard unless there is a clear performance reason.
8. **Keep user-facing public content professional.** Do not expose developer/demo instructions, test accounts, internal stack traces, or false hospital contact claims on the public landing page.
9. **When changing schema/API contracts, update both callers and `supabase/schema.sql`, then document deployment steps.** The deployed database does not automatically receive local SQL changes.
10. **Automatic checkout is database-owned.** Local/demo mode uses a best-effort browser fallback; production relies on Supabase Cron so it cannot race the authoritative database update. Verify Supabase Cron is enabled and the `ihms-attendance-auto-checkout` job succeeds in Cron History.
11. **This is not a verified clinical production platform.** Before real patient care, conduct a professional security review, privacy/legal review, backup/recovery tests, accessibility checks, load tests, and clinical workflow acceptance testing.

## Commands

```bash
npm ci
npm run lint
npm run build
```

For Vercel API routes locally, run `npx vercel dev` rather than relying only on Vite's static dev server. Configure local secrets in an ignored `.env.local` file (never commit it). For a Supabase deployment, apply `supabase/schema.sql` to the correct project and verify the SQL/RLS changes before deploying frontend and API code.

## Session and realtime invariants (2026-10-17)

- Local/demo mobile matching uses `matchesDemoLoginIdentifier()` and supports fictional seeded values with or without `+91`. This must remain restricted to the no-Supabase demo branch; production validation stays strict.
- `src/data/tabSession.ts` must preserve the `ihms_tab_id` and matching Supabase `storageKey` for a same-origin reload. Do not rotate the tab ID or delete its auth storage just because the document instance changed; use navigation type and the live-tab lease to distinguish a duplicated tab. A same-origin refresh should restore the Supabase session through `getSignedInProfile()`.
- `LoginModal` is always mounted but returns `null` while closed. Clear credential, reset, and registration states on close and before every open; never rely only on unmount cleanup.
- On Supabase logout, stop the shared Realtime listener and clear the previous user's cached database records. In demo mode, clear only the current user so locally shared demo datasets survive logout.
- Realtime notifications hydrate `ihms_records`, `ihms_prescriptions`, and `profiles`; dashboard components subscribe to the store and should update without page reload. Also reconcile when visibility returns/network comes online to cover missed broadcasts. RLS must remain authoritative; realtime is not a permission bypass.
- The `npm run check:smoke` suite includes phone normalization, login/reset cleanup, session-refresh isolation contracts and realtime subscription checks. These are regression/contract checks, not substitutes for live Supabase/Vercel end-to-end tests.

## Workspace URL routing (2026-10-17)

- Feature route map and role ACL: `src/utils/workspaceRoutes.ts`; tab/filter URL sync: `src/hooks/useWorkspaceTab.ts`; fail-closed gate: `src/App.tsx`.
- 23 canonical feature URLs are documented in `docs/ROUTING_AND_AUTHORIZATION.md`. Unknown/unauthenticated/unauthorized routes never render another role's dashboard. Safe post-login redirects are allow-listed.
- Direct SPA paths are rewritten by `vercel.json` for `/login` and `/portal/:path*`; API paths are excluded.
- Always retain Supabase RLS and server API permission checks. URL-based UI gating alone does not secure data. Validate with `npm run check:routes` and deployed negative-access tests.
