import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getIndianPhoneLookupVariants, matchesDemoLoginIdentifier, normalizeDemoLoginPhone, normalizeIndianLoginPhone } from '../src/utils/validation.ts';

const publicHome = fs.readFileSync(new URL('../src/components/PublicHospitalHome.tsx', import.meta.url), 'utf8');
const navbar = fs.readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const loginModal = fs.readFileSync(new URL('../src/components/LoginModal.tsx', import.meta.url), 'utf8');
const loginApi = fs.readFileSync(new URL('../api/auth-login.ts', import.meta.url), 'utf8');
const adminDashboard = fs.readFileSync(new URL('../src/components/admin/AdminDashboard.tsx', import.meta.url), 'utf8');
const managerDashboard = fs.readFileSync(new URL('../src/components/manager/ManagerDashboard.tsx', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const loginRateLimitMigration = fs.readFileSync(new URL('../supabase/migrations/20261019140000_mobile_login_rate_limit.sql', import.meta.url), 'utf8');
const cron = fs.readFileSync(new URL('../supabase/attendance-auto-checkout-cron.sql', import.meta.url), 'utf8');

const phoneCases = [
  ['9876543210', '9876543210'],
  ['+91 9876543210', '9876543210'],
  ['919876543210', '9876543210'],
  ['98765', null],
  ['19876543210', null],
  ['+91 5876543210', null],
  ['name9876543210', null],
  ['', null],
];
for (const [value, expected] of phoneCases) {
  assert.equal(normalizeIndianLoginPhone(value), expected, `phone normalize case: ${value}`);
}
console.log(`PASS production phone normalization (${phoneCases.length} cases)`);

const demoPhoneCases = [
  ['1122334455', '1122334455'],
  ['+91 1122334455', '1122334455'],
  ['91-5544332211', '5544332211'],
  ['9988776655', '9988776655'],
  ['91 12345', null],
  ['account9988776655', null],
];
for (const [value, expected] of demoPhoneCases) {
  assert.equal(normalizeDemoLoginPhone(value), expected, `demo phone normalization case: ${value}`);
}
assert.equal(normalizeIndianLoginPhone('1122334455'), null, 'strict production validation must reject demo fixture numbers');
console.log(`PASS local demo fixture phone normalization (${demoPhoneCases.length} cases) without weakening production validation`);
assert.deepEqual(getIndianPhoneLookupVariants('+91 98765 43210'), [
  '9876543210', '+919876543210', '+91 9876543210', '919876543210', '91 9876543210',
  '98765 43210', '98765-43210', '+91 98765 43210', '+91-98765-43210',
]);
assert.deepEqual(getIndianPhoneLookupVariants('invalid'), [], 'invalid phone lookup must not search profiles');
assert.equal(matchesDemoLoginIdentifier({ email: 'admin@gmail.com', phone: '1122334455' }, '+91 1122334455'), true);
assert.equal(matchesDemoLoginIdentifier({ email: 'admin@gmail.com', phone: '1122334455' }, 'admin@gmail.com'), true);
assert.equal(matchesDemoLoginIdentifier({ email: 'admin@gmail.com', phone: '1122334455' }, '9122334455'), false);
console.log('PASS demo account matching supports email, stored phone, and +91 phone input');

assert.doesNotMatch(publicHome, /Patient & Staff Sign In|onSignIn/);
assert.doesNotMatch(navbar, /\bSign In\b|onOpenLogin/);
console.log('PASS public patient page contains no staff/generic sign-in button');

assert.match(loginModal, /Email Address/);
assert.match(loginModal, /signInWithPassword/);
assert.match(loginModal, /useEffect\(\(\) => \{/);
assert.match(loginModal, /setIdentifier\(''\)/);
assert.match(loginModal, /setPassword\(''\)/);
assert.match(loginModal, /Enter your email address/);
console.log('PASS login UI supports email login via Supabase Auth');

assert.match(loginApi, /Cache-Control/);
assert.match(loginApi, /consume_ihms_api_rate_limit/);
assert.match(loginApi, /getIndianPhoneLookupVariants/);
assert.match(loginApi, /\.in\('phone', phoneVariants\)/);
assert.match(loginApi, /\.limit\(2\)/);
assert.match(loginApi, /signInWithPassword/);
assert.match(loginApi, /access_token: data\.session\.access_token/);
assert.doesNotMatch(loginApi, /json\(\{[^}]*email:\s*profile\.email/s);
console.log('PASS server login keeps profile lookup private and rate-limits attempts');

assert.match(adminDashboard, /const \[newStaffRole, setNewStaffRole\] = useState<UserRole \| ''>\(''\)/);
assert.match(managerDashboard, /const \[role, setRole\] = useState<UserRole \| ''>\(''\)/);
assert.match(adminDashboard, /setNewStaffDept\(''\)/);
assert.match(managerDashboard, /setDepartment\(''\)/);
assert.match(adminDashboard, /useState<StaffShift>\('general'\)/);
assert.match(managerDashboard, /useState<StaffShift>\('general'\)/);
assert.match(adminDashboard, /Assigned schedule: General Shift/);
assert.match(managerDashboard, /Assigned schedule: General Shift/);
assert.doesNotMatch(adminDashboard + managerDashboard, /option value="morning"|option value="evening"/);
assert.match(loginModal, /useState<\'Male\' \| \'Female\' \| \'Other\' \| \'\'>\(''\)/);
assert.match(loginModal, /const \[regBloodGroup, setRegBloodGroup\] = useState\(''\)/);
assert.match(loginModal, /placeholder="Enter your Gmail address"/);
assert.match(loginModal, /placeholder="Enter age \(optional\)"/);
assert.match(loginModal, /Select gender \(optional\)/);
console.log('PASS new staff demographic/role fields start blank, General Shift is assigned automatically, and forms clear after close');

assert.match(schema, /create or replace function public\.consume_ihms_api_rate_limit/);
assert.match(loginRateLimitMigration, /create table if not exists public\.ihms_api_rate_limits/);
assert.match(loginRateLimitMigration, /create or replace function public\.consume_ihms_api_rate_limit/);
assert.match(loginRateLimitMigration, /grant execute on function public\.consume_ihms_api_rate_limit\(text, integer, integer\) to service_role/i);
assert.match(cron, /ihms-attendance-auto-checkout/);
assert.match(cron, /public\.auto_checkout_due_ihms_attendance\(\)/);
console.log('PASS schema and Cron scripts remain separate with explicit dependency');
