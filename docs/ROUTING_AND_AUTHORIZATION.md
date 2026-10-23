# Workspace Routes and Authorization

Updated: 2026-10-17

## How route protection works

1. On startup, the app restores the Supabase-authenticated profile before rendering any protected dashboard.
2. `src/App.tsx` resolves the exact path with `src/utils/workspaceRoutes.ts` and requires a matching signed-in role before rendering the workspace.
3. Unauthenticated visits to `/portal/...` move to `/login?redirect=<requested-path>`. The redirect is accepted only if the decoded path is one of the known workspace routes and is allowed for the authenticated role. It cannot redirect to an arbitrary external URL.
4. If an authenticated account manually enters another role's URL, the dashboard is not rendered; the user is redirected to their own default workspace. Unknown URLs render an explicit 404 page and never fall through to a dashboard.
5. `src/hooks/useWorkspaceTab.ts` keeps feature tabs/filters, URLs, and browser Back/Forward navigation synchronized.
6. `vercel.json` serves the SPA for `/login` and `/portal/:path*`, enabling direct navigation and refreshes. `/api/*` is intentionally not included in those rewrites.
7. These client routes are not a substitute for authorization. Supabase RLS and server endpoints must continue to validate data permissions independently. Do not remove RLS or expose the service-role key.

## Paths

### Public

- `/` — hospital information page.
- `/login` — sign-in/registration modal.

### Admin

- `/portal/admin/overview`
- `/portal/admin/revenue`
- `/portal/admin/expenses`
- `/portal/admin/attendance`
- `/portal/admin/staff`
- `/portal/admin/appointments`

### Manager

- `/portal/manager/overview`
- `/portal/manager/attendance`
- `/portal/manager/staff`
- `/portal/manager/leaves`

### Doctor

- `/portal/doctor/now`
- `/portal/doctor/upcoming`
- `/portal/doctor/completed`

### Receptionist

- `/portal/receptionist/queue`
- `/portal/receptionist/fees`
- `/portal/receptionist/collections`
- `/portal/receptionist/walk-in`
- `/portal/receptionist/slots`

### Staff

Shared by nurse, cleaner, ward boy, and other staff roles:

- `/portal/staff/attendance`
- `/portal/staff/leaves`

### Patient

- `/portal/patient/history`
- `/portal/patient/book-appointment`
- `/portal/patient/follow-ups`

## Tests

Run `npm run check:routes` for route count/uniqueness, exact matching, role access matrix, default destinations, safe post-login redirects, dashboard tab wiring, RLS contract presence, and Vercel rewrite config. `npm run check:smoke` includes this test.

Also validate in a staging deployment:

- Load every protected path directly in a new signed-out browser; no dashboard data must render.
- Sign in as a patient and open `/portal/admin/revenue`; the patient workspace should be shown instead, with no admin content.
- Sign in as an admin, open `/portal/admin/revenue`, refresh, and use Back/Forward; the route should remain consistent.
- Verify a valid same-role login redirect returns to the intended feature, but an unauthorized role and a tampered external redirect are rejected.
- Exercise protected API endpoints directly with no token, an expired token, and a valid lower-privilege token.
- Verify Supabase RLS blocks unauthorized direct data reads/writes, regardless of URL.
