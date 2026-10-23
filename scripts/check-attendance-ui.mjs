import fs from 'node:fs';

const marker = fs.readFileSync(new URL('../src/components/AttendanceMarker.tsx', import.meta.url), 'utf8');
const staffDashboard = fs.readFileSync(new URL('../src/components/staff/StaffDashboard.tsx', import.meta.url), 'utf8');
const checks = [
  ['role attendance widget disables client checkout when Supabase is configured', /if \(supabase \|\| !currentUser\.id\) return;/.test(marker)],
  ['staff attendance page disables client checkout when Supabase is configured', /if \(supabase \|\| !currentUser\) return;/.test(staffDashboard)],
  ['client fallback only selects open rows that are past their recorded scheduled end', /!record\.clockOutAt && !record\.clockOut[\s\S]*?record\.shiftEndAt[\s\S]*?Date\.now\(\) >= new Date\(record\.shiftEndAt\)\.getTime\(\) \+ 120_000/.test(marker)],
];
for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Attendance UI contract check failed: ${label}`);
  console.log(`PASS ${label}`);
}
