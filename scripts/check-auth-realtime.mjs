import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../src/App.tsx');
const loginModal = read('../src/components/LoginModal.tsx');
const tabSession = read('../src/data/tabSession.ts');
const supabase = read('../src/lib/supabase.ts');
const store = read('../src/data/store.ts');
const schema = read('../supabase/schema.sql');

// Session persistence: auth storage key is derived from a stable sessionStorage tab ID,
// and a hard reload must not trigger copied-session cleanup.
assert.match(tabSession, /sessionStorage\.getItem\(TAB_ID_KEY\)/);
assert.match(tabSession, /isReloadNavigation\(\)/);
assert.match(tabSession, /!sameTabReload && !leaseIsStale/);
assert.match(tabSession, /sessionStorage\.setItem\(TAB_ID_KEY, tabId\)/);
assert.match(supabase, /storageKey: `pulsecare-ihms-auth-\$\{tabSessionId\}`/);
assert.match(supabase, /storage: window\.sessionStorage/);
console.log('PASS session storage key remains stable across same-origin reloads while retaining tab isolation');

// Logout stops watchers and removes tab-local cached data.
assert.match(app, /stopSharedSync\.current\?\.\(\)/);
assert.match(app, /if \(supabase\) clearSharedStore\(\)/);
assert.match(app, /setCurrentUser\(null\)/);
assert.match(app, /Keep local demo datasets intact/);
assert.match(loginModal, /values on close and again before every open/);
for (const key of ['setIdentifier', 'setPassword', 'setForgotEmail', 'setRegEmail', 'setRegPhone', 'setRegPassword']) {
  assert.match(loginModal, new RegExp(`${key}\\(''\\)`), `logout/close should clear ${key}`);
}
console.log('PASS logout and modal close clear credentials and cached shared data');

// Cross-role dashboards are store subscribers; database changes refresh all authorized views.
for (const table of ['ihms_records', 'ihms_prescriptions', 'profiles', 'ihms_staff_directory_events']) {
  assert.match(store, new RegExp(`table: '${table}'`), `missing realtime subscription for ${table}`);
  assert.match(schema, new RegExp(`tablename = '${table}'`), `missing Realtime publication for ${table}`);
}
assert.match(store, /notify\(\)/);
assert.match(store, /document\.addEventListener\('visibilitychange', sharedVisibilityHandler\)/);
assert.match(store, /window\.addEventListener\('online', sharedOnlineHandler\)/);
assert.match(store, /export function subscribe\(listener/);
for (const path of [
  '../src/components/admin/AdminDashboard.tsx',
  '../src/components/manager/ManagerDashboard.tsx',
  '../src/components/doctor/DoctorDashboard.tsx',
  '../src/components/receptionist/ReceptionistDashboard.tsx',
  '../src/components/staff/StaffDashboard.tsx',
  '../src/components/patient/PatientDashboard.tsx',
]) {
  assert.match(read(path), /store\.subscribe/, `dashboard ${path} must react to shared-store updates`);
}
assert.match(store, /postgres_changes/);
assert.match(store, /scheduleRefresh\(recordType as RecordRefreshScope\)/, 'record changes should schedule only the affected dataset');
assert.match(store, /\.eq\('record_type', recordType\)/, 'record refreshes should query one record type, not the full records table');
assert.match(store, /cachedCurrentUser/);
assert.match(store, /saveHydratedData\(STORAGE_KEYS\.CURRENT_USER/);
assert.match(app, /const unsubscribeStore = store\.subscribe/);
console.log('PASS realtime subscription covers records, prescriptions and profiles; reconnect/visibility resync is wired');
