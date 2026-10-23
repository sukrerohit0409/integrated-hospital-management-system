import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formatAttendanceDay, groupAttendanceByDay } from '../src/utils/attendancePresentation.ts';

const patientDashboard = fs.readFileSync(new URL('../src/components/patient/PatientDashboard.tsx', import.meta.url), 'utf8');
const adminDashboard = fs.readFileSync(new URL('../src/components/admin/AdminDashboard.tsx', import.meta.url), 'utf8');
const managerDashboard = fs.readFileSync(new URL('../src/components/manager/ManagerDashboard.tsx', import.meta.url), 'utf8');

assert.equal(formatAttendanceDay('2026-10-18'), 'Sunday, 18 October 2026');
assert.equal(formatAttendanceDay('not-a-date'), 'not-a-date');

const createRecord = (id, date, clockIn, clockInAt) => ({
  id,
  staffId: `staff-${id}`,
  staffName: `Staff ${id}`,
  role: 'nurse',
  date,
  clockIn,
  clockInAt,
  status: 'present',
});
const groups = groupAttendanceByDay([
  createRecord('older', '2026-10-17', '09:00 AM', '2026-10-17T03:30:00.000Z'),
  createRecord('morning', '2026-10-18', '09:00 AM', '2026-10-18T03:30:00.000Z'),
  createRecord('afternoon', '2026-10-18', '02:00 PM', '2026-10-18T08:30:00.000Z'),
]);
assert.deepEqual(groups.map((group) => group.date), ['2026-10-18', '2026-10-17']);
assert.deepEqual(groups[0].records.map((record) => record.id), ['afternoon', 'morning']);
assert.equal(groups[0].records.length, 2);

assert.doesNotMatch(patientDashboard, /Select blood group|handleSaveBloodGroup|aria-label="Patient blood group"/);
assert.match(patientDashboard, /currentUser\?\.age != null \? `\$\{currentUser\.age\} Yrs` : '-'/);
assert.match(patientDashboard, /currentUser\?\.gender \|\| '-'/);
assert.match(patientDashboard, /currentUser\?\.bloodGroup \|\| '-'/);
const navbar = fs.readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const patientProfile = fs.readFileSync(new URL('../src/components/EditPatientProfileModal.tsx', import.meta.url), 'utf8');
assert.match(navbar, /currentUser\.role === 'patient'[\s\S]*?Edit Profile/);
assert.match(patientProfile, /update_my_patient_profile/);
assert.match(adminDashboard, /groupAttendanceByDay\(attendance\.filter/);
assert.match(managerDashboard, /groupAttendanceByDay\(attendance/);
assert.match(adminDashboard, /colSpan=\{7\}/);
assert.match(managerDashboard, /colSpan=\{6\}/);
console.log('PASS optional patient profile placeholders, profile editor entry point, and day-grouped attendance display for Admin/Manager');
