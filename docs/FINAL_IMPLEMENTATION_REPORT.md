# PulseCare IHMS — Final Implementation Report

**Date:** 2026-10-18  
**Scope:** Requirements 1–13, audit findings, system-maintenance documentation, and shift/attendance reliability.

## Implemented in source

- **Input validation:** Shared person-name validation and length caps, email bounds, numeric/date/amount constraints, notes/reason limits, and a capped medical test/service name. The server/database keep their own validation rather than trusting browser-only rules.
- **Phone and password UX:** Fixed `+91` prefix with a ten-digit Indian mobile entry; show/hide password controls on supported password forms.
- **Email and feedback:** Gmail-format checks for patient verification/invitation flows, accessible in-page error/success feedback, and an app-level render-error recovery boundary. Successful delivery still requires correct Supabase Auth SMTP/templates and redirects.
- **Patient profile:** Explicit optional blood-group inputs across registration, walk-in, quick booking, and profile update; no `B+` fallback. Removed invented age/gender defaults.
- **Performance and structure:** Lazy-loaded role dashboards, WebP variants for referenced large images, 30-second hidden-tab-aware Supabase fallback refresh, system/data-flow/security notes, and repeatable smoke scripts. No live performance benchmark was possible here.
- **Rate limits/security:** Database-backed limits for staff provisioning and appointment-confirmation email APIs, fail-closed behavior if the rate-limit RPC is missing, existing Supabase RLS/trigger boundaries, and no service-role key in browser code. This is not a penetration test or security certification.
- **Current staff shifts and appointments (updated 2026-10-18):** All doctors, receptionists and other staff use one General Shift, 09:00–22:00 Asia/Kolkata, with a fixed lunch break from 13:00–14:00. Routine appointment starts are every 15 minutes from 09:00–12:45 and 14:00–21:45. The database migrates non-patient profiles to `general` without rewriting historical attendance or deleting existing appointments.
- **Appointment workflow fix:** The frontend, staff API and database trigger enforce the same General Shift and lunch-exclusion rules. Automatic checkout uses the clock-in record's saved 22:00 shift end and working-time calculations subtract the lunch overlap for new General Shift records.
- **Automatic attendance checkout (requirement 13):** Clock-in records a database-calculated scheduled end timestamp. Supabase Cron checks each minute and closes due records at that end time, not at the delayed job execution time. Hours are calculated from actual `clockInAt` to actual/scheduled `clockOutAt`; early manual checkout records the shorter actual duration, and a delayed checkout cannot inflate hours past the scheduled end. The job is restricted to trusted database/service-role execution, is idempotent for already-closed records, and has an index for open attendance rows.
- **Overnight reliability:** Open records remain detectable across midnight; invalid legacy shift assignments are inferred conservatively for end-time calculation; a malformed legacy timestamp is skipped rather than intended to halt an entire due-record batch. Client fallback writes are intentionally disabled when Supabase is configured, avoiding a stale browser write racing the authoritative Cron update. Local/demo mode retains only a best-effort browser fallback.
- **Operations and maintenance:** Added/updated `PROJECT_CONTEXT.md`, `docs/CODEBASE_MAP.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY_AND_OPERATIONS.md`, `docs/CHANGE_TRACKING.md`, `CHANGELOG.md`, the Cron setup script, and shift/date/UI/SQL contract smoke tests.

## Validation performed

| Check | Result |
|---|---|
| `npm run check:smoke` | **Passed** — shift, India-time date/slot, attendance UI guard, SQL contract, Cron permission/schedule/index/retention checks. |
| Isolated TypeScript check for shared types and utility modules | **Passed**. |
| TypeScript/TSX parser pass | **Passed** — 35 source/API/script files parsed without syntax diagnostics. |
| Full `npm run lint` | **Blocked in this workspace** — required React/Supabase/Node/Vite types and packages are absent/incomplete; this prevents a trustworthy full-project typecheck. |
| `npm run build` | **Blocked in this workspace** — `vite: not found` because dependencies are not installed completely. |
| Live PostgreSQL/Supabase integration | **Not run** — no connected staging database is available in this workspace. |
| Live email delivery/load/performance/security testing | **Not run** — requires the configured deployment and representative test environment. |

The static SQL contract checks are useful regression checks; they do not prove PostgreSQL will accept and execute every statement. Run the build and apply/test schema changes in staging before using real patient/staff data.

## Required deployment steps

1. **Back up the current Supabase database** and review all changes in `supabase/schema.sql` against the current deployed schema. Apply it to a staging project first; do not blindly run schema changes against production.
2. In the target project, run `npm ci`, then `npm run check:smoke`, `npm run lint`, and `npm run build`. Resolve any dependency/type/build errors before deployment.
3. In Supabase Dashboard, open **Integrations → Cron** and enable Supabase Cron / `pg_cron`. Run `supabase/attendance-auto-checkout-cron.sql` in the SQL Editor after the schema functions exist. This schedules the checkout worker every minute and a daily cleanup retaining 14 days of Cron run history.
4. Confirm both jobs exist and are active:

   ```sql
   select jobid, jobname, schedule, active
   from cron.job
   where jobname in ('ihms-attendance-auto-checkout', 'ihms-cron-history-cleanup');
   ```

   Review recent checkout job runs (the Supabase Cron UI also provides History):

   ```sql
   select jobid, start_time, end_time, status, return_message
   from cron.job_run_details
   where jobid = (
     select jobid from cron.job where jobname = 'ihms-attendance-auto-checkout'
   )
   order by start_time desc
   limit 20;
   ```

5. After the schema migration, verify all non-patient profiles show the fixed **General Shift** (09:00–22:00) and that the lunch break is shown consistently. New staff receive this schedule automatically; no per-person shift selector should appear.
6. In staging, test all role flows: invalid inputs, Gmail verification/invitation, blood-group persistence, General Shift bookings at 09:00, 12:45, 14:00 and 21:45, and rejection of 08:45, 13:00–13:45, 22:00, past slots, and non-15-minute starts. Verify manual early checkout, lunch-aware hours, automatic checkout with the staff browser closed, duplicate Cron runs, and historical attendance with the saved end timestamp.
7. Deploy the frontend and Vercel API routes from the same commit after database tests pass. Confirm server-only keys (`SUPABASE_SERVICE_ROLE_KEY`, SMTP password) are configured only in server environment variables and never in `VITE_*` or client bundles. Verify email provider settings and review Cron History after launch.

## Operational notes

- The authoritative automatic checkout does **not** become active just by deploying frontend source. Supabase schema changes and the Cron job must be applied and verified.
- Existing future online/follow-up appointments booked in the newly defined 13:00–14:00 lunch interval are not automatically deleted or changed. Review the audit query in `docs/SQL_EXECUTION_ORDER.md` and deliberately reschedule those appointments before rollout. The schema migration intentionally preserves appointment history.
- The app has not had a full production build, live database test, performance benchmark, penetration test, clinical-safety review, privacy/legal review, or compliance certification in this workspace. Do not treat passing smoke tests as proof of production readiness.

## Follow-up changes — October 17, 2026

- Removed the public page's separate Patient & Staff Sign In CTA and the generic unauthenticated navbar Sign In button. The appointment CTA remains the path into the patient account/login flow.
- Standardized data-entry placeholder text to field-specific instructions and added missing placeholders. At that point, new staff forms started with blank role/department fields and required explicit role/shift selections; the shift-selection behavior was superseded on 2026-10-18 by the single fixed General Shift. Optional demographics remain blank, forms reset on close/reopen, and existing saved values remain visible in edit flows.
- Added `api/auth-login.ts`: phone/password sign-in performs a server-only unique profile-phone lookup, rate-limits hashed IP and phone keys through `consume_ihms_api_rate_limit`, delegates password/email-confirmation policy to Supabase Auth, and returns only access/refresh tokens. The endpoint refuses ambiguous duplicate phone mappings and uses the same generic credentials error for lookup/auth failures.
- Added `normalizeIndianLoginPhone()` and smoke checks for plain 10-digit and +91 formats, invalid inputs, public button removal, mobile login session handoff, private lookup/rate-limit requirements, blank staff forms, and SQL execution order. Demo/local login also normalizes phone formatting.
- SQL files remain separate by design: apply `supabase/schema.sql` first, then enable Supabase Cron and execute `supabase/attendance-auto-checkout-cron.sql`. Details are in `docs/SQL_EXECUTION_ORDER.md`.
- Validation: `npm run check:smoke` passes in this workspace. Dependency installation was attempted but the npm registry was unreachable (`EAI_AGAIN`), so the full TypeScript typecheck and production Vite build could not be completed here. Live Supabase Auth/Vercel API testing is still required in staging.

## Current shift/slot policy (2026-10-18)

The current roster uses one **General Shift 09:00–22:00 Asia/Kolkata** for doctors, receptionists, and other staff, with a **13:00–14:00 lunch break**. Routine appointment starts are every **15 minutes** from 09:00–12:45 and 14:00–21:45 (48 starts per doctor before filtering past/occupied slots). Emergency overnight coverage is separate from regular OPD appointments.

The schema migrates every non-patient profile to `general`. Each attendance record snapshots `shift` and `shiftEndAt` at clock-in; old attendance records keep their saved end and gross-hour semantics, while new General Shift rows end at 22:00 and subtract the overlap with the 13:00–14:00 lunch break. Supabase Cron performs authoritative checkout at the saved scheduled end.

## Follow-up audit implementation — 2026-10-18

A later review identified and addressed several release-risk items:

- **Atomic shift changes:** `api/staff.ts` now calls `update_ihms_staff_shift`, a service-role-only PostgreSQL RPC. The RPC and appointment writes use the same doctor-specific transaction advisory lock so a shift-change conflict check and the profile update occur in one transaction.
- **Manager profile privacy:** managers now obtain a whitelist roster through `get_ihms_managed_staff_directory()` rather than direct access to all staff profile JSON. A minimal RLS-protected `ihms_staff_directory_events` table preserves roster refresh notifications.
- **Realtime efficiency:** ordinary `ihms_records` changes refresh only the affected record dataset; full reconciliation remains after Realtime reconnect, browser visibility changes and regained connectivity.
- **Uncertain email outcome:** if the SMTP provider accepted a message but the database could not confirm the `sent` state, the endpoint attempts to save `unknown`, and the client warns against automatic retry. The email template and normal booking/follow-up flow remain. This reduces but cannot eliminate uncertainty if both database status writes fail.
- **CI:** `.github/workflows/ci.yml` now runs `npm run check:smoke`, including the new atomic-shift/email outcome contract script.

The incremental migration is `supabase/migrations/20261019130000_atomic_shift_and_profile_privacy.sql`. Apply it after `20261018_privacy_and_attendance_guards.sql` in a backed-up staging database and complete real role/RLS, concurrency, Realtime, and SMTP tests before production.

The final `npm run check:smoke` passed, and the TypeScript/TSX parser reported no syntax errors across 42 files. A full TypeScript typecheck and Vite build could not run because dependency installation was unavailable: the environment lacked React/Node/Nodemailer type definitions and the Vite executable. Thus this project is **not yet verified as production-ready**. No live Supabase, Vercel, SMTP, or browser end-to-end tests were run here.

## Follow-up UI update — Patient visit chronology (2026-10-18)

- Added shared visit-date/time sorting and readable visit dates across admin appointment views, doctor appointment views, patient history, and receptionist visit lists. The admin directory, patient history, and historical/unpaid visit lists show the newest date/time first; doctor's current/upcoming schedules and the receptionist's current-day queue remain chronological from earliest to latest.
- The receptionist pending-fee table now includes Visit Date & Time, and the daily queue displays the visit date as well as slot. Appointment sorting operates on a copied array and does not mutate the store state.
- `npm run check:smoke` passed with the new `scripts/check-appointment-sorting.mjs` coverage. Full `npm run lint` and `npm run build` remain blocked in this environment by missing type-definition packages and the unavailable Vite binary; those checks remain required before deployment.
