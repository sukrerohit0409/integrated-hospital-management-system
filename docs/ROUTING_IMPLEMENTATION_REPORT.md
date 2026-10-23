# IHMS URL Routing and Authorization Implementation Report

**Date:** 2026-10-17  
**Source:** `integrated-hospital-management-system-auth-realtime-fix-2026-10-17.zip`

## Result

Added canonical feature URLs, URL-backed tab/filter navigation, a fail-closed route guard, safe post-login redirects, and Vercel SPA rewrites. Existing Supabase RLS and API authorization remain the source of truth for records and operations.

## Implemented changes

- `src/utils/workspaceRoutes.ts`: central definition of 23 exact-match protected routes, role checks, default route by role, and an allow-listed post-login redirect helper.
- `src/hooks/useWorkspaceTab.ts`: each dashboard's major feature tab/filter updates the URL and responds to browser Back/Forward.
- `src/App.tsx`: signed-in profile + matching role required before a dashboard renders; unauthenticated visitors go to `/login`; wrong-role and unknown paths fail closed; intended return paths are checked against the route allow-list and the authenticated role.
- `vercel.json`: direct visits/refreshes on `/login` and `/portal/:path*` load the SPA entry point. `/api/*` is not included in these rewrites.
- `scripts/check-workspace-routes.mjs` and `npm run check:routes`: validate route uniqueness, exact matches, user-role access, default destinations, safe redirects, tab wiring, RLS policy contract, and rewrite config.
- `docs/ROUTING_AND_AUTHORIZATION.md`, `docs/SECURITY_AND_OPERATIONS.md`, `docs/CODEBASE_MAP.md`, `PROJECT_CONTEXT.md`, `README.md`, and `CHANGELOG.md` updated.

## Canonical URLs

- Public: `/`, `/login`
- Admin: `/portal/admin/overview`, `/portal/admin/revenue`, `/portal/admin/expenses`, `/portal/admin/attendance`, `/portal/admin/staff`, `/portal/admin/appointments`
- Manager: `/portal/manager/overview`, `/portal/manager/attendance`, `/portal/manager/staff`, `/portal/manager/leaves`
- Doctor: `/portal/doctor/now`, `/portal/doctor/upcoming`, `/portal/doctor/completed`
- Receptionist: `/portal/receptionist/queue`, `/portal/receptionist/fees`, `/portal/receptionist/collections`, `/portal/receptionist/walk-in`, `/portal/receptionist/slots`
- Staff (nurse/cleaner/ward boy/other): `/portal/staff/attendance`, `/portal/staff/leaves`
- Patient: `/portal/patient/history`, `/portal/patient/book-appointment`, `/portal/patient/follow-ups`

## Verification

- `npm run check:smoke`: **passed**, including the new route suite.
- TypeScript parser: **38 TypeScript/TSX files, zero syntax errors**.
- Full `npm run lint`: **not verifiable here** because React, React typings, Supabase client, icon package, Vite typings and other project dependencies are missing from this working tree. Typecheck output included missing-module errors; after fixing the generic URL-tab type, no additional route/tab-union errors appeared.
- `npm run build`: **not run successfully** because `vite` is not installed in the workspace. Run `npm ci --include=dev`, `npm run lint`, and `npm run build` in a network-enabled environment.
- Live Supabase and deployed Vercel route tests were not possible from this workspace.

## Important security scope

Client-side routing hides another role's dashboard and ensures changing the URL is not enough to show that UI. Client JavaScript cannot be treated as a secret boundary and route guards do not secure arbitrary data requests by themselves. `supabase/schema.sql` already enables RLS and role/ownership policies for profiles, records and prescriptions; protected API handlers separately verify bearer sessions/roles/ownership. Those server/database controls must remain deployed and must be tested with direct unauthorized API and SQL requests.

## Deployment checklist

1. Unzip the updated project and run `npm ci --include=dev`.
2. Run `npm run check:smoke`, `npm run lint`, and `npm run build`.
3. Deploy the frontend and API routes together to Vercel; verify direct reloads for `/login` and every `/portal/...` route.
4. In staging, test signed-out direct links, patient-to-admin and staff-to-patient URL attempts, allowed same-role post-login redirects, invalid/external redirects, browser Back/Forward, logout and refresh.
5. Test protected API endpoints with no token, an expired token, and a valid token from a lower-privilege role; verify Supabase RLS denies the corresponding direct data requests.
