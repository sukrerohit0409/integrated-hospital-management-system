# PulseCare IHMS — Deep Code Audit and GitHub Readiness

**Audit date:** 18 October 2026  
**Repository reviewed:** uploaded `PulseCare_IHMS_Implemented_2026-10-18_v2(1).zip`  
**Mode:** source review and safe local checks; no live deployment or production database changes.

## Verdict

**INCONCLUSIVE — the source package is prepared for GitHub version control, but production readiness is not established.** The complete configured smoke suite passes, and source syntax/import checks pass. The environment could not complete dependency installation, so `npm run lint`, API typechecking, and `npm run build` did not complete. Live Supabase/RLS/Realtime/concurrency tests, SMTP delivery, browser end-to-end checks, and deployed performance measurements were not run.

Do not describe all features as verified. A passing contract smoke suite is not a substitute for end-to-end tests against a staging service.

## Verified architecture

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS 4.
- **Backend:** Vercel serverless TypeScript routes under `api/`.
- **Data/auth:** Supabase Auth and Postgres, database RLS/functions/triggers, Realtime subscriptions, and a client-side shared data store.
- **Email:** server-side Nodemailer SMTP route with database-backed notification claims and explicit handling for uncertain provider-acceptance outcomes.
- **CI:** GitHub Actions runs clean dependency installation, frontend TypeScript checking, API TypeScript checking, smoke suite, and Vite production build.
- **Runtime:** `package.json` and lockfile root metadata specify Node.js `>=22.12.0`; CI uses Node 22.

## Positive findings to preserve

1. The source tree separates role dashboards, shared auth/store/utilities, server API handlers, SQL schema/migrations, and smoke scripts.
2. Sensitive server operations use service-role credentials in API functions rather than placing the service role key in a `VITE_` variable.
3. The schema contains RLS, constrained directory RPCs, unique indexes, appointment/shift locking, database-owned attendance checkout rules, and rate-limit infrastructure.
4. The shared client store uses Realtime with reconciliation on resume/reconnect; ordinary table events target relevant record datasets.
5. Appointment email template values are HTML-escaped, requests authenticate the bearer token and check appointment ownership, and ambiguous delivery is not blindly retried.
6. Historical visit sorting uses a shared utility and should not mutate the stored list.
7. Build artifacts, `.env` files, `node_modules`, `.vercel`, and editor/cache files are ignored; `package-lock.json` is retained.

## Changes made during this audit

- Tightened the manager directory to exclude profile rows for admins, managers, and patients. This aligns read access with what managers are authorized to manage; the sanitized roster/change event is preferred over broad `profiles` selection.
- Changed a stale email `sending` claim to `unknown`, instead of automatically resending when the provider might have accepted the original email before a process interruption. Only an explicitly failed attempt remains automatically retryable. The API surfaces uncertain status and advises provider-log reconciliation.
- Removed fabricated registration numbers and phone numbers from the printed prescription slip/public hospital API. The slip can show verified `VITE_HOSPITAL_REGISTRATION_NUMBER` and `VITE_HOSPITAL_HELPLINE` values only when configured. `GET /api/hospital` returns `emergencyContact` only when `HOSPITAL_EMERGENCY_CONTACT` is explicitly set.
- Added a smoke check to prevent those fabricated public/clinical identity values from returning.
- Documented uniqueness-index preflight queries for existing installations. Legacy duplicate appointment token/slot/follow-up or revenue link records can prevent unique-index creation; the records need review, never automatic deletion.
- Added `GITHUB_RELEASE_CHECKLIST.md` with secure Git hygiene, local checks, push steps, and required staging gates.

## Test and audit evidence

| Check | Result | Interpretation |
|---|---|---|
| `npm run check:smoke` | **PASS** | All configured utility/source-contract checks passed, including shifts, dates, attendance, login/tab sessions, routes, security, feedback, atomic shift/email behavior, visit ordering, and public identity configuration. |
| TypeScript/TSX syntax parse | **PASS** | 43 `.ts`/`.tsx` files parsed with 0 parser diagnostics using the TypeScript compiler API available globally in the container. This uses the globally installed parser version and is not a semantic check under the project's TypeScript 7 dependency. |
| Relative import resolution scan | **PASS** | No missing relative source imports found by the custom scan. |
| Lockfile root/dependency metadata | **PASS** | Package and lockfile root metadata are aligned and the lockfile contains declared dependencies. |
| Secret-like source scan | **PASS with scope limits** | No live secrets were identified in the scanned source; `.env.example` uses placeholders. This is not a complete Git-history secret scan. |
| `npm ci` | **BLOCKED** | Dependency downloads could not complete in this environment. |
| `npm run lint` | **BLOCKED** | Incomplete local `node_modules` lacks required type definitions; do not treat this as a source pass or an observed source type failure. |
| `npx tsc -p api/tsconfig.json` | **NOT RUN successfully** | Dependency installation was incomplete; must run on a network-enabled machine/CI. |
| `npm run build` | **BLOCKED** | Vite executable unavailable because dependency installation did not complete. |
| SQL execution / migration against Postgres | **NOT RUN** | No configured Postgres client/database access in this audit environment. Static SQL contract checks are not a SQL engine validation. |
| Live RLS/API/Reatime/session tests | **NOT RUN** | Require Supabase staging project and least-privilege test accounts. |
| Live SMTP email delivery | **NOT RUN** | Requires SMTP secrets and a test mailbox. |
| Browser end-to-end/performance | **NOT RUN** | No deployed app/browser trace or Lighthouse run available in this environment. |

## Feature validation matrix

| Workflow/area | Source-level checks | Staging evidence needed |
|---|---|---|
| Appointment slot/shift rules | Smoke contract checks pass | Concurrent insert/shift update against Postgres and real API requests |
| Attendance and Cron | SQL/UI contract checks pass | Apply schema, verify job exists and Cron job executions succeed |
| Login and tab isolation | Runtime/session source tests pass | Auth provider and multi-browser-session tests |
| Role route guards | Canonical route contract passes | Direct URL and direct API/RLS attempts for every role |
| Manager staff directory privacy | SQL/API contracts pass | Verify row visibility and roster Realtime with real manager/admin/reception accounts |
| Patient visit chronology | Sorting tests pass | Validate real records with missing/legacy dates and timezone boundaries in browser |
| Email confirmation | API/source contract checks pass | SMTP accepted, rejected, timeout, DB-update failure, retry and duplicate scenarios |
| Payments/revenue | Source paths/uniqueness constraints inspected | Concurrent fee collection and reconciliation against underlying revenue rows |
| Prescription printing | Removed invented static identity details; configurable public values | Validate print/PDF output and real, approved provider credentials/registration copy |
| Deployment/build | CI is configured for checks | Clean `npm ci`, both typechecks, smoke tests, Vite build, Vercel preview and post-deploy smoke test |

## Remaining material risks / release blockers

1. **Build has not passed.** Use a network-enabled CI or development machine and resolve all true TypeScript/API/build errors before merge/deployment.
2. **Database migrations have not been executed against Postgres.** Review the migrations carefully and run in a backed-up staging database. The focused migration must precede the matching application rollout.
3. **Legacy uniqueness conflicts are possible.** Run the duplicate preflight queries in `docs/SQL_EXECUTION_ORDER.md` and deliberately resolve results before index changes; preserve all patient/appointment/payment records during remediation.
4. **Lunch/shift rule migration risk.** Existing future online/follow-up appointments between 13:00 and 13:59 must be reviewed and rescheduled before enabling the updated booking rules. The migration intentionally does not silently delete them.
5. **Cron dependency.** Verify automatic checkout is enabled and has successful `cron.job_run_details` records. A SQL file in the repository does not prove it is running.
6. **Concurrency and real-time behavior need staging tests.** The source now serializes doctor shift updates and appointment writes, but the guarantees must be proven under concurrent requests in the target Postgres schema.
7. **Hospital identity/contact details must be verified.** Removed fabricated values will now be absent unless configured. Set only accurate organization-approved details; do not leave misleading “24/7” claims, registration numbers, physician qualifications, emergency contacts, privacy notice, or patient terms in public/clinical output.
8. **No clinical-safety, compliance, backup/recovery, or penetration certification is implied.** This is a college project source audit; production handling of real medical/financial records requires separate controls and organizational review.

## Recommended final gate

Run, from the project root using Node.js 22.12 or newer on a machine where the npm registry is reachable:

```bash
npm ci
npm run lint
npx tsc -p api/tsconfig.json
npm run check:smoke
npm run build
```

Then complete the staging tests documented in `GITHUB_RELEASE_CHECKLIST.md`. Only after all release-blocking checks pass should the verdict move to ready for production. For GitHub source control, use the push steps in that checklist, review staged files before committing, and never push `.env` or patient data.
