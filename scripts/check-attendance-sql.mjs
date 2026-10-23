import fs from 'node:fs';

const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const cron = fs.readFileSync(new URL('../supabase/attendance-auto-checkout-cron.sql', import.meta.url), 'utf8');
const checks = [
  ['profile migration assigns all non-patient profiles to General Shift', /to_jsonb\('general'::text\)[\s\S]*?where role <> 'patient'[\s\S]*?is distinct from 'general'/.test(schema)],
  ['General Shift always snapshots 22:00 checkout', /v_shift = 'general'[\s\S]*?time '08:30'[\s\S]*?time '22:00'[\s\S]*?v_local_end := v_local_start::date \+ time '22:00'/.test(schema)],
  ['expected end accepts 13.5-hour window but retains saved short historical shifts', /v_saved_end <= v_clock_in \+ interval '13 hours 30 minutes'/.test(schema)],
  ['database has lunch-aware working-hours calculation', /function public\.ihms_attendance_working_hours[\s\S]*?p_deduct_lunch_break boolean default true[\s\S]*?time '13:00'[\s\S]*?time '14:00'[\s\S]*?v_elapsed_seconds - v_overlap_seconds/.test(schema)],
  ['automatic checkout computes net working hours using lunch helper', /public\.ihms_attendance_working_hours\(clock_in_time, clock_out_time, coalesce\(old\.payload ->> 'shift' = 'general', false\)\)/.test(schema)],
  ['manual checkout computes net working hours using lunch helper', /'{hoursWorked}'[\s\S]*?public\.ihms_attendance_working_hours\(clock_in_time, clock_out_time, coalesce\(old\.payload ->> 'shift' = 'general', false\)\)/.test(schema)],
  ['database appointment validation requires general schedule and rejects lunch', /v_doctor_shift <> 'general'[\s\S]*?v_slot_minutes < 540[\s\S]*?v_slot_minutes >= 1320[\s\S]*?v_slot_minutes >= 780 and v_slot_minutes < 840/.test(schema)],
  ['database clock-in validation blocks lunch and enforces general schedule', /v_attendance_shift <> 'general'[\s\S]*?time '08:30'[\s\S]*?time '22:00'[\s\S]*?time '13:00'[\s\S]*?time '14:00'/.test(schema)],
  ['database blocks clock-in when profile is on leave or inactive', /function public\.guard_ihms_attendance_account_status[\s\S]*?v_status is distinct from 'active'[\s\S]*?create trigger guard_ihms_attendance_account_status/i.test(schema)],
  ['auto-checkout uses saved expected end rather than worker execution time', /clock_out_time := public\.ihms_attendance_expected_end\(old\.payload\)/.test(schema)],
  ['auto-checkout function is hidden from ordinary users', /revoke all on function public\.auto_checkout_due_ihms_attendance\(\) from public, anon, authenticated/.test(schema)],
  ['auto-checkout RPC is available to service role', /grant execute on function public\.auto_checkout_due_ihms_attendance\(\) to service_role/.test(schema)],
  ['Cron runs every minute', /'\* \* \* \* \*'/.test(cron)],
  ['Cron invokes due-attendance function', /public\.auto_checkout_due_ihms_attendance\(\)/.test(cron)],
  ['Cron history is pruned to bounded retention period', /ihms-cron-history-cleanup[\s\S]*?delete from cron\.job_run_details where end_time < now\(\) - interval ''14 days''/i.test(cron)],
];
for (const [label, passed] of checks) {
  if (!passed) throw new Error(`SQL contract check failed: ${label}`);
  console.log(`PASS ${label}`);
}
