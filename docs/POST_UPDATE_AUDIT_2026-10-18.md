# PulseCare IHMS — Post-Update Engineering Audit

**Audit date:** 18 October 2026  
**Scope:** Read-only architecture review followed by targeted changes to the uploaded project.  
**Approach:** Preserve the existing React/Vite/Supabase architecture, one General Shift rules, workflows, and appointment confirmation email path. No application-wide rewrite was performed.

## Executive summary

The project is a React 19 + TypeScript + Vite + Tailwind 4 application using Supabase Auth/Postgres/RLS, Vercel serverless APIs, and an SMTP-backed appointment-confirmation endpoint. The codebase already had route-level lazy loading, a shared store, realtime synchronization, an application error boundary, and smoke checks for several critical workflows.

The initial pass improved profile-field privacy, attendance account-status enforcement, shared loading and feedback UI, route-level 404 behavior, selected mutation success messages, and unused-image cleanup. A follow-up pass added an atomic doctor shift update, a sanitized manager roster and roster-change signal, dataset-scoped realtime refreshes, safer tracking for uncertain email outcomes, and a CI smoke-check step. The appointment email template and normal booking/follow-up workflow remain in place, but email-tracking source files were intentionally updated. Existing configured smoke checks for scheduling, lunch break, 15-minute booking slots, scheduled checkout, login/session isolation, routing, and the email contract pass.

**Release status: not yet production-verified.** Static checks pass, but the full TypeScript typecheck and Vite production build could not be completed because the environment could not resolve `registry.npmjs.org`; required local dependencies and type definitions are missing. No live Supabase, Vercel, SMTP, or browser end-to-end session was available for this audit.

## Changes made

### 1. Security and data privacy

- Removed the broad `Staff can read the hospital directory` profile policy that exposed complete active-doctor rows to all authenticated users.
- Added `public.get_ihms_doctor_directory()`, a restricted function that returns only `id`, `name`, `department`, `specialty`, `qualification`, and `shift` for active doctors. It does not return email, phone, demographics, or raw profile JSON.
- Updated `src/data/store.ts` to use the restricted directory function for doctor selection, while using full profile rows only where the caller's RLS permissions permit them.
- Added a small partial index for active-doctor directory lookup.
- Added database enforcement that prevents an authenticated inactive/on-leave account from creating a new attendance record. The UI also disables clock-in for non-active accounts but leaves an existing open shift's clock-out available.
- Added the repeat-safe migration `supabase/migrations/20261018_privacy_and_attendance_guards.sql` for an existing database.

**Deployment dependency:** Apply the migration to a matching existing schema before deploying this frontend. The new store calls `get_ihms_doctor_directory()` and initialization will fail if the function does not exist. Review in staging first. The migration is not a substitute for earlier schema migrations that might be missing.

### 2. Loading, error, and success feedback

- Added an accessible shared `LoadingScreen` with spinner/skeleton placeholders and `aria-busy`/live-region semantics.
- Added `FeedbackBanner` for dismissible error and success feedback. The application clears/replaces related messages and cleans up success-message timers.
- Unknown URLs now display a dedicated 404 page instead of being silently redirected or left in a generic loading state. Known workspace routes continue to pass through existing role-based route checks.
- Added explicit success messages for attendance clock-in/out, staff creation/removal/status changes, expense saves, leave decisions, appointment status changes, payment collection, and consultation/prescription saves where the operation reports success.
- Added loading animations that respect `prefers-reduced-motion`.
- Retained the existing top-level application error boundary and its user-safe recovery view.

### 3. Clean-up

Removed three image files that had no source references and whose optimized WebP equivalents are already used:

- `src/assets/images/doctor_avatar_female_1790930016857.jpg` (~619 KB)
- `src/assets/images/doctor_avatar_male_1790929999766.jpg` (~624 KB)
- `src/assets/images/hospital_hero_medical_1790929984585.jpg` (~827 KB)

This removes about **2.02 MiB of source image files** from the project archive. It does not remove the WebP assets used by the app. No source module was deleted based only on a heuristic that it might be unused.

### 4. Tests and documentation

- Added `scripts/check-security-contracts.mjs` for the restricted directory/RLS/attendance contract.
- Added `scripts/check-ui-feedback.mjs` for loading, feedback, 404, reduced motion, selected success messages, and the existing appointment-email contract.
- Included both checks in `npm run check:smoke`.
- Updated the SQL execution order, architecture/security notes, route authorization notes, and changelog.

## Appointment confirmation email safety

The email template and the patient booking/follow-up call sites remain in place. The following files were deliberately updated to handle provider-accepted emails whose final database status cannot be confirmed:

- `src/data/appointmentEmails.ts` now recognizes an `unknown` delivery-tracking outcome.
- `api/appointment-confirmation.ts` records the provider message id and attempts to mark the notification `unknown` instead of retryable `failed` after provider acceptance.
- `src/components/patient/PatientDashboard.tsx` warns the user not to trigger an automatic retry for that uncertain outcome.
- `supabase/schema.sql` and the new migration allow `unknown` as a notification status.

The smoke test checks the booking/follow-up call sites, bearer-token handoff, idempotency claim RPC, SMTP `sendMail` path, and the `sent`/`failed`/`unknown` status handling. A later hardening pass makes stale `sending` claims transition to `unknown` instead of being automatically resent. This is a source contract, not proof of live SMTP delivery; if database state writes are unavailable, provider-log reconciliation is still required.

## Scheduling and workflow compatibility

The smoke suite continues to pass for these existing rules:

- One General Shift: 09:00–22:00 India time.
- Fixed lunch break: 13:00–14:00.
- Online/follow-up booking starts on 15-minute boundaries outside lunch.
- Automatic checkout is anchored to the expected scheduled shift end.
- Lunch-aware working-hour calculations.
- Phone normalization and login contracts.
- Same-tab session restoration and duplicated-tab isolation.
- 23 canonical workspace routes and role-route contracts.

The shared data store now refreshes only the affected record dataset for ordinary realtime events and reconciles all datasets on reconnect/resume. Appointment booking and email delivery remain in the same workflow, with additional handling only for uncertain provider acceptance.

## Verification performed

| Check | Result | Notes |
|---|---|---|
| `npm run check:smoke` | **Passed** | All configured checks passed after changes, including shift/attendance SQL/UI, dates, login, session isolation, routes, security, feedback, and email contract. |
| TypeScript syntax parse | **Passed** | Parsed 42 `.ts`/`.tsx` source files with zero parser diagnostics using the globally available TypeScript compiler API. This is a syntax check, not a complete typecheck. |
| Email workflow static contracts | **Passed** | The booking call sites, provider-send path, idempotency, and uncertain-outcome handling are covered by the smoke suite. |
| `npm run build` | **Not completed** | Vite executable is unavailable because dependency installation did not complete. The command exits with `vite: not found` (exit 127). |
| `npm run lint` / `tsc --noEmit` | **Blocked** | Incomplete `node_modules` caused TS2688 errors for missing `node`, `nodemailer`, `react`, and `react-dom` type definitions. Not evidence that the modified source typechecks or fails typechecking. |
| Registry access | **Blocked** | DNS lookup for `registry.npmjs.org` failed in the execution environment. |
| Live Supabase/RLS/API/email testing | **Not run** | Requires configured staging resources and credentials, which were not supplied. |
| Production performance / Core Web Vitals | **Not measured** | Requires deployment or representative runtime measurements. No numeric speed improvement is claimed. |

## Important remaining risks and next priorities

1. **Verify the database migration in staging.** Test patient, doctor, receptionist, manager, and admin users against the actual RLS policies. Confirm all dashboards can select doctors and that private profile fields stay inaccessible to unauthorized roles.
2. **Complete a full install, typecheck, and production build.** Run `npm ci`, `npm run lint`, `npm run build`, and `npm run check:smoke` in an environment with registry access. Resolve any true build/type errors before deployment.
3. **Run browser end-to-end tests.** Test registration, patient booking, confirmation email, receptionist status updates and fee collection, doctor consultation/prescription, manager leave/staff management, admin revenue/expenses, attendance clock-in/out, login/logout, invalid routes, and role tampering.
4. **Profile data loading before broad refactoring.** `src/data/store.ts` still hydrates all RLS-visible records for its current global-array model and refreshes broadly on realtime/reconnect triggers. This is an architectural scaling bottleneck for a large production dataset. Replacing it safely requires role-specific paginated queries and updating store consumers/mutation semantics together; it was not changed blindly because doing so could break several workflows.
5. **Measure real speed.** Capture Lighthouse/Web Vitals, route chunk sizes, API waterfall, Supabase slow-query plans, and React profiler traces before and after the next performance pass. Add indexes only when real filter/join plans justify them.
6. **Verify shift-change concurrency in staging.** The implementation now uses a database RPC and a doctor-specific advisory lock shared with appointment writes. Static checks confirm the expected contract, but a live concurrent-booking stress test is still needed before relying on the guarantee in production.
7. **Protect sensitive hospital data.** This code-level pass is not a clinical safety, regulatory compliance, disaster recovery, or penetration test. Do not treat the result as certification for real-patient production use.

## Recommended pre-deployment sequence

1. Back up the Supabase staging database.
2. Apply `supabase/migrations/20261018_privacy_and_attendance_guards.sql` to a matching existing schema, or follow the full clean/staging SQL order in `docs/SQL_EXECUTION_ORDER.md`.
3. Verify doctor directory selection and all role-based queries with test accounts.
4. With registry access, install dependencies and run the complete typecheck/build/smoke suite.
5. Test appointment confirmation end-to-end with the configured mail provider, including a failure case and duplicate-send behavior.
6. Test the deployed Vercel app, monitor errors, and measure actual page performance before promoting changes.

---

This report distinguishes successful static checks from unrun live/build checks. The updated source is delivered separately in the project ZIP.


## Follow-up implementation pass — 2026-10-18

The source was updated after the initial audit (see the new migration `20261019130000_atomic_shift_and_profile_privacy.sql`). The doctor shift API now uses a transactional RPC that shares a doctor-specific advisory lock with appointment inserts. The manager role reads a whitelist roster rather than all profile details, with an RLS-scoped event table to preserve roster Realtime refreshes. Shared-store Realtime callbacks now request the affected record type rather than reloading all record datasets, while reconnect/visibility events still request full reconciliation. Appointment email tracking now distinguishes provider acceptance from confirmed database status and avoids auto-retrying the explicit `unknown` state. CI now executes `npm run check:smoke`.

The updated `npm run check:smoke` passed in this workspace. A TypeScript/TSX syntax parse also passed for 42 files. `npm ci` did not complete because package downloads were unavailable in this environment; therefore `npm run lint`, the serverless API typecheck, and `npm run build` still require execution in a dependency-enabled environment. No live Supabase/RLS/concurrency test or live SMTP test was possible here. Apply the new migration in staging before deploying the associated app code; inspect all results there before production rollout.

## Follow-up UI update — Patient visit chronology (2026-10-18)

- Added shared visit-date/time sorting and readable visit dates across admin appointment views, doctor appointment views, patient history, and receptionist visit lists. The admin directory, patient history, and historical/unpaid visit lists show the newest date/time first; doctor's current/upcoming schedules and the receptionist's current-day queue remain chronological from earliest to latest.
- The receptionist pending-fee table now includes Visit Date & Time, and the daily queue displays the visit date as well as slot. Appointment sorting operates on a copied array and does not mutate the store state.
- `npm run check:smoke` passed with the new `scripts/check-appointment-sorting.mjs` coverage. Full `npm run lint` and `npm run build` remain blocked in this environment by missing type-definition packages and the unavailable Vite binary; those checks remain required before deployment.
