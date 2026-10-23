## 2026-10-18 — Patient visit history ordering


### Changed
- Added a shared appointment date/time sorter. Historical lists sort by visit date and time with the newest visit first; current queues and upcoming doctor appointments remain chronological.
- Sorted the admin appointment directory and overview by visit date/time and displayed the visit date beside its slot.
- Sorted doctor appointment results according to the selected view: current/upcoming schedules are earliest-first, while completed visit history is newest-first.
- Sorted the patient visit-history list newest-first without changing appointment eligibility, prescription rendering, follow-up handling, or booking behavior.
- Sorted the receptionist's completed visits awaiting payment newest-first and added the visit date/time to that table. The current-day patient queue now sorts by appointment time and shows the date explicitly.
- Formatted valid ISO visit dates as `DD Mon YYYY` without browser-timezone date shifts; unexpected/invalid historical date values are preserved rather than silently normalized.

### Added
- Added `scripts/check-appointment-sorting.mjs` covering chronological/reverse ordering, AM/PM boundaries, malformed time values, invalid dates, and non-mutating sort behavior. Added it to `npm run check:smoke`.

### Verification
- `npm run check:smoke` passes, including the new appointment-sorting tests.
- `npm run lint` remains blocked by missing `@types/node`, `@types/nodemailer`, `@types/react`, and `@types/react-dom` packages; `npm run build` is blocked because Vite is unavailable in the incomplete dependency installation. Re-run both in a dependency-enabled environment before deployment.

## 2026-10-18 — Reliability, feedback, and profile privacy pass

### Changed
- Replaced plain-text app-shell loading messages with an accessible animated spinner and skeleton state; animations honor reduced-motion preferences.
- Added a shared dismissible error/success banner, timed-success cleanup, and a dedicated 404 page for unknown URLs. Existing known routes and role guards are preserved.
- Restricted broad profile-directory RLS access. The updated client uses `get_ihms_doctor_directory()` to fetch only active doctors' names and non-sensitive scheduling/directory fields for roles that cannot read full managed profiles.
- Enforced active account status at the database attendance-insert boundary and in both staff-facing clock-in UIs; successful clock-in/out actions now provide explicit confirmation.
- Removed three confirmed-unreferenced original JPG assets; the application already imports the optimized WebP equivalents. No appointment/email modules were changed.

### Added
- Added an incremental Supabase migration for profile privacy and attendance status checks.
- Added smoke contracts for profile-field minimization, database-enforced attendance status, loading/error/404 UI, reduced-motion behavior, and the appointment confirmation email path.

### Deployment notes
- Before deploying the updated frontend to an existing Supabase project, review and apply `supabase/migrations/20261018_privacy_and_attendance_guards.sql` in staging then production, or apply the complete updated schema according to `docs/SQL_EXECUTION_ORDER.md`. The new frontend requires `get_ihms_doctor_directory()`.
- The appointment confirmation email helper, server SMTP route, idempotency claim, and post-booking/follow-up call sites were intentionally left unchanged.

### Verification
- `npm run check:smoke` passes in this environment after changes.
- A full Vite production build/typecheck and live RLS/API tests still require successful dependency installation and a configured staging Supabase/Vercel environment.

## 2026-10-18 — One General Shift and lunch-aware attendance

### Changed
- Replaced the two eight-hour assignments with one General Shift for all non-patient staff: 09:00 AM–10:00 PM Asia/Kolkata and a fixed 01:00–02:00 PM lunch break. New staff creation assigns this schedule automatically; manager/admin UIs no longer show morning/evening selectors.
- Standardized online/follow-up appointment starts to 15-minute intervals from 09:00–12:45 and 14:00–21:45. The shared client utility, staff API and database trigger all reject lunch-break and out-of-hours starts.
- Automatic checkout for new records is fixed at 10:00 PM. Working-hours calculation subtracts only the overlap with lunch; a standard 09:00–22:00 attendance therefore records 12 working hours.
- Updated existing non-patient profile assignments to `general` when `supabase/schema.sql` runs. Existing appointment and attendance records are not deleted; saved attendance end timestamps and legacy gross-hour calculations remain intact.

### Added
- Added a pre-deployment SQL audit query for future appointments in the new 01:00–02:00 PM lunch break. Those bookings must be deliberately rescheduled before rollout, not silently discarded.
- Expanded shift/attendance smoke checks for 48 slots, lunch exclusion, fixed 22:00 checkout, and lunch-adjusted hours.

### Deployment notes
- Back up Supabase, inspect/reschedule future lunch-window appointments, run `supabase/schema.sql` in staging, enable Cron and run `supabase/attendance-auto-checkout-cron.sql` separately, then verify real Cron execution before production.
- Full lint/build and live Supabase workflows must pass in a dependency-enabled staging environment before release.

## 2026-10-18 — Atomic scheduling and realtime reliability pass

### Changed
- Routed staff shift changes through a service-role-only database RPC that checks future appointment conflicts and updates the shift in one transaction.
- Added a shared doctor-specific transaction lock for appointment insert/update and shift changes to prevent the previous check-then-update race.
- Reduced manager access to full profile records; manager roster data now comes from an explicit field whitelist with a minimal RLS-scoped realtime change signal.
- Scoped ordinary realtime refreshes to the affected record dataset while retaining full reconciliation after reconnect, visibility changes, and network recovery.
- Distinguished SMTP-provider acceptance from confirmed persisted email-delivery state using a non-auto-retry `unknown` status.

### Added
- Added the incremental migration `supabase/migrations/20261019130000_atomic_shift_and_profile_privacy.sql`.
- Added atomic shift/email outcome contract checks to `npm run check:smoke` and configured CI to run the smoke suite.

### Verification and deployment notes
- The repository smoke suite and TypeScript/TSX parser check pass in the available workspace.
- Full typecheck and production build remain blocked until npm dependencies can be installed; live database concurrency, RLS, Realtime, and SMTP verification remain required in staging.
- Apply the new migration after `20261018_privacy_and_attendance_guards.sql` and before deploying the matching application code. Never treat static smoke checks as a substitute for live integration tests.

## 18 October 2026 — Public identity configuration hardening

- Removed fabricated hospital registration, helpline, and doctor registration values from printed prescriptions and the public hospital API.
- Made verified hospital registration/helpline text optional build-time public configuration and the API emergency contact optional server configuration.
- Added smoke coverage to prevent these fabricated values from reappearing.

## 18 October 2026 — Final audit hardening

- Restricted the manager roster and roster-change signals to staff records managers are authorized to manage; manager/admin/patient profiles are excluded from the managed directory.
- Changed stale email `sending` claims to `unknown` instead of automatically resending, and made the API communicate uncertain delivery explicitly. Only explicitly failed sends are automatically eligible for retry.
- Added regression checks for manager profile privacy and uncertain email retry behavior.
- Cleaned the repository `.gitignore`, retained the lockfile for reproducible installs, documented the Node.js 22.12+ runtime, and corrected an outdated store description.


Notable project changes are tracked here. New changes go under `## [Unreleased]` and are grouped by category.

## [Unreleased] — Attendance display, mobile login, and Supabase preview fixes

### Fixed
- Grouped Admin and Manager attendance logs by readable hospital day, newest day first, with per-day record counts. Date and role filters remain active.
- Corrected the patient profile blood-group dropdown placeholder so it no longer says “Select gender”.
- Made mobile login search canonical and common legacy variants of Indian phone numbers while retaining the server-only profile lookup, rate limits, and rejection of ambiguous duplicate numbers.
- Added an idempotent Supabase migration for the mobile-login rate-limit table/function.
- Renamed the newer privacy/attendance migration to a non-colliding version so the legacy 8-digit `20261018` migration no longer shares a version prefix with a 14-digit migration. Added a smoke check to detect that regression.

### Tests
- Added `scripts/check-attendance-display.mjs` and `scripts/check-migration-versions.mjs` to the smoke suite.

## 2026-10-15 — Final scheduling integrity pass

- Corrected the database consultation-start validation so evening/night half-hour slots accepted at booking can also transition into consultation.
- Tightened expected shift-end calculation against stale/mismatched legacy shifts and made malformed historical timestamp payloads skippable instead of allowing one record to halt an automatic-checkout batch.
- Kept automatic system checkout ahead of the administrator update fast-path so privileged scheduled updates cannot bypass the checkout trigger.
- Added an open-attendance partial index and daily 14-day Cron-history retention so the minute-level worker remains operationally bounded.
- Disabled client-side checkout writes whenever Supabase is configured to avoid stale-state races with database Cron.
- Added one-command smoke checks for shift logic, India-time date handling, attendance UI safeguards, and the SQL/cron contract (`npm run check:smoke`).

## [Unreleased] — 2026-10-17

### Changed
- Fixed local demo login matching for seeded mobile numbers with or without `+91`, including legacy fictional fixture values that fail production Indian-mobile prefix validation. This permissive path is used only when Supabase is not configured; production validation remains strict.
- Fixed auth-session storage-key rotation on a same-origin browser reload. A normal refresh now retains the same per-tab Supabase storage key and allows startup auth restoration, while a duplicated tab with a live conflicting lease receives a fresh key.
- Login/reset/registration form state is cleared on both close and every new open; browser autocomplete hints no longer request reusing the current password in the login field.
- Logout explicitly stops shared-data listeners and clears cached Supabase records, while preserving local demo datasets so demo changes are not erased by logout.
- Realtime profile hydration now refreshes the signed-in user's cached profile and app shell. All role dashboards continue subscribing to the shared store; tabs reconcile data on resume and when connectivity returns.

### Added
- Added automated checks for demo phone matching, refresh session isolation, logout form/cache cleanup, realtime table publication, and dashboard store subscriptions.

### Changed (previous update)
- Removed unauthenticated generic/staff Sign In controls from the patient-facing public page; the appointment CTA remains the patient portal entry point.
- Standardized input hints to field-specific “Enter …” prompts and reset new staff forms to blank on close/reopen. Role, department, shift, age, and gender are no longer silently prefilled for newly created staff; optional gender selectors use an explicit “Select gender (optional)” prompt. Existing saved data remains visible in edit flows.

### Added
- Added `/api/auth-login.ts` for mobile-number/password login when Supabase is configured. The endpoint privately maps a unique profile phone to its auth email, delegates password and email-confirmation validation to Supabase Auth, rate-limits hashed IP and phone keys, and returns only the session tokens.
- Added phone-normalization/login contract smoke tests and `docs/SQL_EXECUTION_ORDER.md`.

### Deployment notes
- Keep SQL files separate: run/review `supabase/schema.sql` first, then enable Supabase Cron and run `supabase/attendance-auto-checkout-cron.sql`. The mobile-login endpoint requires `consume_ihms_api_rate_limit` from the current schema and server-only `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` variables.
- Use `npx vercel dev` (rather than Vite-only `npm run dev`) to test `/api/auth-login` locally. Test login by email and mobile number in staging before promotion.

### Verification
- Added static/utility checks covering phone normalization, public sign-in controls, session handoff, server-side private profile mapping/rate limits, blank staff forms, and SQL ordering. Full build/live Supabase authentication remains required in a configured environment.

## [Unreleased] — 2026-10-14

### Added
- Added `PROJECT_CONTEXT.md` and supporting architecture/codebase/security/change-tracking documents to preserve project understanding and make future work traceable.
- Added a professional patient-facing PulseCare home page with hospital service/department information and sign-in/appointment entry points.
- Added reusable validation helpers, fixed `+91` phone input, explicit optional blood group selector, and eye controls for password fields.
- Added explicit staff shift assignment for new and existing staff accounts, with shared 30-minute slot generation, server/database shift checks, and a conflict guard that blocks changes which would strand future appointments.
- Added patient-controlled blood group updates through a narrow Supabase RPC instead of broad profile update access.
- Added an application error boundary with a user-safe recovery screen for unexpected render exceptions.
- Added server-side database-backed rate limits for staff-account management and appointment confirmation email APIs.

### Changed
- Changed unauthenticated initial view from opening the login modal to showing the public hospital information page.
- Lazy-loaded role dashboards to reduce the initial JavaScript bundle requirement.
- Replaced large referenced hospital/doctor JPEG assets with Vite-managed WebP variants (source JPEGs retained).
- Slowed Supabase fallback refresh from 10 seconds to 30 seconds and skip it while the tab is hidden.
- Replaced a blocking follow-up `alert()` with shared in-page success feedback and added network-safe errors for auth operations.
- Removed fake demographic defaults from patient registration, receptionist intake, and follow-up bookings; age, gender, and blood group remain blank unless provided. Added blood-group capture to all patient-entry paths, including quick slot booking.

### Security / deployment notes
- Apply the current `supabase/schema.sql` before deploying APIs that require `consume_ihms_api_rate_limit` and the patient blood-group RPC. If the rate limiter is not present, the affected API routes return `503` rather than silently operating without limits.
- Patient registration/portal invitation validation requires a syntactically valid Gmail address ending in `@gmail.com`. Actual email delivery still requires correct Supabase Auth SMTP/template settings.
- The work is a code hardening pass, not a completed independent security audit or clinical compliance certification.

### Verification
- A TypeScript/TSX syntax pass completed for all 35 source/API files with zero parser errors.
- Utility smoke checks passed 11/11 cases covering valid/invalid Gmail, email formatting, Indian mobile validation, name limits, and 16-slot morning/evening/night shift generation. A JSX AST audit found no editable text input/textarea missing `maxLength`; SQL dollar-quote delimiters are balanced and the rate-limit/blood-group RPCs are present.
- Full typecheck and production build could not run in this workspace because the uploaded `node_modules` tree is incomplete (`@types/*` missing; `vite` executable unavailable). Run `npm ci`, `npm run lint`, and `npm run build` in a network-enabled environment before deployment.


## 2026-10-15 — Attendance automation and validation hardening

- Added database-owned scheduled shift-end timestamps and a service-role/postgres-only automatic-checkout function; checkout and hours are derived from trusted clock-in/shift-end timestamps.
- Added required Supabase `pg_cron` schedule script (`supabase/attendance-auto-checkout-cron.sql`) with an every-minute job and explicit deployment verification steps.
- Attendance UI recognizes open overnight shifts across midnight, caps checkout to the scheduled end, and uses a local/demo-only browser fallback; production checkout is exclusively database-scheduled to avoid stale client writes.
- Enforced shift-specific clock-in windows in Supabase and local/demo mode; prevents multiple same-day records and overlapping open shifts.
- Removed invented staff age/gender defaults and capped medical test/service names in the UI and database validation.
- Added deterministic shift-clock tests and SQL contract smoke tests.

## 2026-10-15 — Attendance and shift integrity

- Added database-scheduled automatic checkout at the assigned shift end, timestamp-derived working hours, and safe overnight attendance tracking.
- Legacy staff without a trustworthy shift are marked unassigned; roster management and new-account creation require explicit shift assignment, while appointment/attendance flows block unassigned doctors and staff.
- Added shift calculation and SQL contract smoke checks.


## 2026-10-17 — Role-protected workspace URLs

### Added
- Added 23 canonical URLs for dashboard features across admin, manager, doctor, receptionist, staff and patient roles, using a shared route map and a URL-synchronized dashboard-tab hook.
- Added an exact-match, fail-closed route guard in `App.tsx`: protected URLs require a restored authenticated profile and a matching role; anonymous requests go through `/login`; unauthorized and unknown paths cannot render another role's dashboard.
- Added safe post-login redirect handling that only accepts known paths authorized for the signed-in role.
- Added Vercel SPA rewrites for `/login` and `/portal/:path*` without rewriting `/api/*` routes.
- Added `npm run check:routes` to test 23 paths, role access, route matching, and redirect safety; included it in `npm run check:smoke`.

### Security note
- Route guards protect UI navigation only. Supabase RLS, database functions, and server-side API authorization remain the data security boundary; direct API/database negative tests are required before production.


## 2026-10-18 — Two-shift roster and 15-minute appointments

- Replaced current assignable shifts with Morning 09:00–17:00 and Evening 14:00–22:00 for doctors, receptionists and other staff; both remain eight hours and overlap for OPD coverage. Emergency overnight coverage is documented as separate from OPD assignments.
- Updated frontend slot generation, the receptionist availability matrix, staff API shift conflict checks, and Supabase appointment validation to allow 15-minute start times within each shift (last morning start 16:45, last evening start 21:45).
- Updated clock-in windows to a maximum 30-minute early arrival and automatic checkout ends to 17:00 / 22:00 IST. Attendance stores the assignment/end timestamp at clock-in; a later roster change affects the next clock-in only.
- Current schema marks old `night` profile assignments unassigned while preserving historic attendance rows' stored ends. Local/demo stored accounts with legacy night assignments are shown as unassigned.
- Expanded shift/slot smoke checks for time boundaries, 32 slots per shift, receptionist support, no night dropdown, shift-change snapshots, and SQL Cron contract.

## 2026-10-18 — Audit-driven reliability and security updates

- Replaced the API's non-atomic doctor shift check/update with a service-role-only database RPC. Appointment writes acquire the same per-doctor advisory transaction lock, so a booking and shift change serialize before the conflict check completes.
- Restricted manager profile reads to their own profile and introduced a sanitized managed-staff directory RPC; added a minimal RLS-protected Realtime signal so manager rosters still refresh immediately without exposing the raw profile `details` JSON.
- Changed shared-store refreshes to fetch only the dataset named by Realtime events. Full reconciliation remains on initial load, reconnect, tab visibility, and network recovery.
- Added an explicit `unknown` state when SMTP accepted a message but the database could not persist its sent status; this state is not automatically retried.
- Added the smoke suite and concurrency/email contract checks to CI.
- Required staging application of `20261019130000_atomic_shift_and_profile_privacy.sql` before deploying code that calls its RPCs.
- Verification in this workspace: `npm run check:smoke` passes. Full TypeScript typecheck and Vite production build remain unverified because dependencies could not be installed in this environment.
