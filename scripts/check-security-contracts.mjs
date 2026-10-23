import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const schema = read('../supabase/schema.sql');
const migration = read('../supabase/migrations/20261018_privacy_and_attendance_guards.sql');
const store = read('../src/data/store.ts');
const patientProfileMigration = read('../supabase/migrations/20261023170000_patient_profile_edit.sql');

assert.doesNotMatch(schema, /create policy "Staff can read the hospital directory"/i,
  'full profile rows must not be made readable through the old doctor-directory policy');
assert.match(schema, /create policy "Privileged staff can read managed profiles"[\s\S]*?using \(public\.current_ihms_role\(\) in \('admin', 'receptionist'\)\)/i);
assert.match(schema, /function public\.get_ihms_managed_staff_directory\(\)[\s\S]*?custom_role_title text[\s\S]*?status text[\s\S]*?where public\.current_ihms_role\(\) = 'manager'[\s\S]*?p\.role not in \('admin', 'manager', 'patient'\)/i);
const managerDirectoryReturnContract = schema.match(/function public\.get_ihms_managed_staff_directory\(\)[\s\S]*?returns table \(([\s\S]*?)\)[\s\S]*?language sql/i)?.[1] || '';
assert.doesNotMatch(managerDirectoryReturnContract, /bloodgroup|gender|age|details jsonb/i, 'manager directory must not return demographics or raw details JSON');
assert.match(schema, /create or replace function public\.get_ihms_doctor_directory\(\)[\s\S]*?returns table \([\s\S]*?department text[\s\S]*?specialty text[\s\S]*?qualification text[\s\S]*?shift text/i);
const directoryReturnContract = schema.match(/create or replace function public\.get_ihms_doctor_directory\(\)[\s\S]*?returns table \(([\s\S]*?)\)[\s\S]*?language sql/i)?.[1] || '';
assert.doesNotMatch(directoryReturnContract, /email|phone|gender|age|bloodgroup|details/i,
  'doctor directory must not return private contact/demographic fields or raw details JSON');
assert.match(schema, /revoke all on function public\.get_ihms_doctor_directory\(\) from public, anon/i);
assert.match(schema, /grant execute on function public\.get_ihms_doctor_directory\(\) to authenticated/i);
assert.match(schema, /ihms_active_doctor_directory_idx/);
assert.match(store, /rpc\('get_ihms_doctor_directory'\)/);
assert.match(store, /Managers use a purpose-built whitelist directory/);
assert.match(store, /rpc\('get_ihms_managed_staff_directory'\)/);
assert.match(store, /table: 'ihms_staff_directory_events'/);
assert.match(schema, /tablename = 'ihms_staff_directory_events'/);
assert.match(migration, /drop policy if exists "Staff can read the hospital directory"/i);
assert.match(migration, /guard_ihms_attendance_account_status/);
assert.match(patientProfileMigration, /public\.current_ihms_role\(\) is distinct from 'patient'/);
assert.match(patientProfileMigration, /v_phone !~ '[^']*6-9[^']*0-9[^']*9/);
assert.match(patientProfileMigration, /p_age < 1 or p_age > 120/);
assert.match(patientProfileMigration, /p_blood_group not in \('A\+', 'A-', 'B\+', 'B-', 'AB\+', 'AB-', 'O\+', 'O-'\)/);
assert.match(patientProfileMigration, /revoke all on function public\.update_my_patient_profile\(text, integer, text, text\) from public, anon/i);
assert.match(patientProfileMigration, /grant execute on function public\.update_my_patient_profile\(text, integer, text, text\) to authenticated/i);
assert.match(patientProfileMigration, /create trigger on_auth_user_email_updated[\s\S]*?after update of email on auth\.users/i);
assert.match(patientProfileMigration, /update public\.profiles[\s\S]*?set email = lower\(new\.email\)/i);
console.log('PASS profile directory privacy, attendance guards, and patient-owned profile/email update policies');
