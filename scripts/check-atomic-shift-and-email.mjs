import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const schema = read('../supabase/schema.sql');
const migration = read('../supabase/migrations/20261019130000_atomic_shift_and_profile_privacy.sql');
const staffApi = read('../api/staff.ts');
const emailApi = read('../api/appointment-confirmation.ts');

assert.match(schema, /create trigger a_lock_ihms_appointment_schedule[\s\S]*?before insert or update on public\.ihms_records/i,
  'appointment writes must acquire the shared doctor schedule lock');
assert.match(schema, /function public\.lock_ihms_appointment_schedule[\s\S]*?pg_advisory_xact_lock[\s\S]*?ihms-doctor-schedule:/i);
assert.match(schema, /function public\.update_ihms_staff_shift[\s\S]*?pg_advisory_xact_lock[\s\S]*?select count\(\*\)::integer[\s\S]*?return jsonb_build_object\('updated', false, 'conflicts', v_conflicts\)[\s\S]*?update public\.profiles/i,
  'shift conflict check and profile update must run in the same database transaction');
assert.match(schema, /grant execute on function public\.update_ihms_staff_shift\(uuid, text\) to service_role/i);
assert.match(staffApi, /rpc\('update_ihms_staff_shift'/);
assert.doesNotMatch(staffApi, /from\('profiles'\)\s*\n\s*\.update\(\{ details: \{ \.\.\.target\.details, shift \}\}\)/,
  'the API must not update shift details outside the atomic RPC');
assert.match(migration, /update_ihms_staff_shift/);

assert.match(schema, /status text not null check \(status in \('sending', 'sent', 'failed', 'unknown'\)\)/);
assert.match(migration, /check \(status in \('sending', 'sent', 'failed', 'unknown'\)\)/);

assert.match(schema, /function public\.get_ihms_managed_staff_directory[\s\S]*?p\.role not in \('admin', 'manager', 'patient'\)/i,
  'the manager roster must exclude administrator, manager, and patient accounts');
assert.match(migration, /function public\.get_ihms_managed_staff_directory[\s\S]*?p\.role not in \('admin', 'manager', 'patient'\)/i,
  'incremental migration must apply the same least-privilege manager roster');
assert.doesNotMatch(read('../supabase/migrations/20261018_privacy_and_attendance_guards.sql'),
  /current_ihms_role\(\) = 'manager'[\s\S]{0,100}role not in \('admin', 'patient'\)/i,
  'the first incremental migration must not temporarily grant broad manager profile reads');

assert.match(schema, /status = 'failed'[\s\S]*?return true[\s\S]*?status = 'unknown'[\s\S]*?updated_at < now\(\) - interval '10 minutes'/i,
  'stale in-flight email notifications must become unknown instead of being auto-retried');
assert.match(migration, /status = 'failed'[\s\S]*?status = 'unknown'[\s\S]*?updated_at < now\(\) - interval '10 minutes'/i,
  'existing deployments must receive the stale-email retry safeguard');
assert.match(emailApi, /select\('status'\)[\s\S]*?deliveryStatus: 'unknown'/i,
  'the API must distinguish uncertain delivery from sent/in-progress states');

assert.match(emailApi, /providerAccepted = true/);
assert.match(emailApi, /status: 'unknown'/);
assert.match(emailApi, /deliveryStatus: 'unknown'/);
assert.match(emailApi, /Do not retry automatically/);
console.log('PASS atomic doctor schedule updates and uncertain email-delivery state safeguards');
