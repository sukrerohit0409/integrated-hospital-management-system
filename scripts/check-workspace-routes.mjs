import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ADMIN_ROUTES,
  MANAGER_ROUTES,
  DOCTOR_ROUTES,
  RECEPTIONIST_ROUTES,
  STAFF_ROUTES,
  PATIENT_ROUTES,
  canAccessWorkspaceRoute,
  defaultWorkspacePath,
  getAuthorizedDestination,
  getWorkspaceRoute,
  workspaceRoutesForTests,
} from '../src/utils/workspaceRoutes.ts';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const appSource = read('../src/App.tsx');
const schemaSource = read('../supabase/schema.sql');
const vercelConfig = JSON.parse(read('../vercel.json'));
const routes = workspaceRoutesForTests();
assert.equal(routes.length, 23, 'every dashboard page/filter should have its own canonical URL');
assert.equal(new Set(routes.map((route) => route.path)).size, routes.length, 'route paths must be unique');

const users = {
  admin: { role: 'admin' },
  manager: { role: 'manager' },
  doctor: { role: 'doctor' },
  receptionist: { role: 'receptionist' },
  nurse: { role: 'nurse' },
  cleaner: { role: 'cleaner' },
  ward_boy: { role: 'ward_boy' },
  other: { role: 'other' },
  patient: { role: 'patient' },
};

for (const route of routes) {
  const matchingRole = route.group === 'staff' ? 'nurse' : route.group;
  assert.equal(canAccessWorkspaceRoute(users[matchingRole], route), true, `${matchingRole} should access ${route.path}`);
  for (const [role, user] of Object.entries(users)) {
    if (route.group === 'staff' && ['nurse', 'cleaner', 'ward_boy', 'other'].includes(role)) continue;
    if (route.group === role) continue;
    assert.equal(canAccessWorkspaceRoute(user, route), false, `${role} must not access ${route.path}`);
  }
  assert.equal(canAccessWorkspaceRoute(null, route), false, `anonymous users must not access ${route.path}`);
  assert.equal(getWorkspaceRoute(route.path), route);
}

assert.equal(getWorkspaceRoute('/portal/admin/revenue/'), getWorkspaceRoute(ADMIN_ROUTES.revenue), 'trailing slash normalization should work');
assert.equal(getWorkspaceRoute('/portal/admin/revenue?anything=1'), null, 'authorization parser must not treat a query string as a route path');
assert.equal(getWorkspaceRoute('/portal/admin/revenueevil'), null, 'route matching must be exact, not prefix based');
assert.equal(defaultWorkspacePath(users.admin), ADMIN_ROUTES.overview);
assert.equal(defaultWorkspacePath(users.manager), MANAGER_ROUTES.eyes_on_staff);
assert.equal(defaultWorkspacePath(users.doctor), DOCTOR_ROUTES.now);
assert.equal(defaultWorkspacePath(users.receptionist), RECEPTIONIST_ROUTES.queue);
assert.equal(defaultWorkspacePath(users.patient), PATIENT_ROUTES.history);
assert.equal(defaultWorkspacePath(users.cleaner), STAFF_ROUTES.attendance);
assert.equal(getAuthorizedDestination(ADMIN_ROUTES.revenue, users.admin), ADMIN_ROUTES.revenue);
assert.equal(getAuthorizedDestination(ADMIN_ROUTES.revenue, users.patient), PATIENT_ROUTES.history, 'wrong-role redirects to the user’s own workspace');
assert.equal(getAuthorizedDestination('//example.com', users.admin), ADMIN_ROUTES.overview, 'external redirect must be rejected');
assert.equal(getAuthorizedDestination('/not-a-workspace-route', users.doctor), DOCTOR_ROUTES.now, 'unknown redirect must fail closed');

assert.match(appSource, /if \(!canAccessWorkspaceRoute\(currentUser, route\)\)/, 'App must actively reject wrong-role routes');
assert.match(appSource, /hasAuthorizedWorkspace/, 'protected dashboard rendering must depend on explicit authorization');
assert.match(appSource, /getAuthorizedDestination\(intendedPath, currentUser\)/, 'post-login redirect must be role checked');
assert.match(schemaSource, /alter table public\.ihms_records enable row level security/i, 'database record table must retain RLS');
assert.match(schemaSource, /create policy "Read records permitted for the signed-in role"/i, 'database role policy must remain present');
for (const path of [
  '../src/components/admin/AdminDashboard.tsx',
  '../src/components/manager/ManagerDashboard.tsx',
  '../src/components/doctor/DoctorDashboard.tsx',
  '../src/components/receptionist/ReceptionistDashboard.tsx',
  '../src/components/staff/StaffDashboard.tsx',
  '../src/components/patient/PatientDashboard.tsx',
]) {
  assert.match(read(path), /useWorkspaceTab\(/, `dashboard ${path} must synchronize its pages with URL`);
}
assert.deepEqual(vercelConfig.rewrites, [
  { source: '/login', destination: '/' },
  { source: '/portal/:path*', destination: '/' },
], 'SPA rewrites should cover only app paths, not /api');
console.log(`PASS ${routes.length} canonical URLs, route-to-tab wiring, exact matching, role authorization, RLS contract, and safe Vercel rewrites`);
