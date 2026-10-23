# Supabase SQL execution order

Keep the application schema and automatic-checkout Cron configuration separate. For a new/staging database, apply the full schema first. For an already deployed database, apply the focused migrations in version order if you are not reapplying the full schema.

## 1. Run `supabase/schema.sql` first

Back up the current database, review the complete schema script, then run it in the target Supabase SQL Editor (staging first for an existing project). It creates/updates tables, RLS policies, validation functions, the shared server-only API rate-limiter table/function, and `public.auto_checkout_due_ihms_attendance()`. The new mobile-number login route depends on `public.consume_ihms_api_rate_limit()`; the focused login migration below also creates this dependency for incremental deployments. The current schema migrates all non-patient profiles to the single `general` shift, validates General Shift clock-in and 15-minute appointment starts, excludes the 13:00–14:00 lunch break, installs lunch-adjusted working-hour calculation for new attendance records, uses an atomic lock for shift-change/appointment-write coordination, and limits manager profile-directory disclosure to a sanitized operational roster. The updated store calls `get_ihms_doctor_directory()`, so apply the current schema or focused migration before deploying the matching frontend. Existing attendance rows keep their stored end timestamps and legacy gross-hour semantics. The migration does not delete or reschedule existing appointment records.

## Preflight duplicate checks before applying the schema to existing data

The schema creates uniqueness rules for appointment tokens, follow-up source appointments, active doctor/date/time slots, and revenue linked to an appointment. Creating those indexes can fail if a legacy database already contains duplicates. Run these read-only checks against the target database first, review every returned row, and resolve conflicts with the authorized hospital/data owner. Do not automatically delete or merge clinical/payment records.

```sql
-- Duplicate appointment tokens (NULL/empty tokens are intentionally excluded here).
select payload ->> 'tokenNumber' as token_number, count(*) as records
from public.ihms_records
where record_type = 'appointments'
  and payload ->> 'tokenNumber' is not null
group by payload ->> 'tokenNumber'
having count(*) > 1;

-- Duplicate active online/follow-up appointment slots.
select doctor_id, payload ->> 'date' as appointment_date,
       payload ->> 'timeSlot' as time_slot, count(*) as records
from public.ihms_records
where record_type = 'appointments'
  and payload ->> 'type' in ('online_booking', 'follow_up')
  and payload ->> 'status' <> 'cancelled'
  and doctor_id is not null
  and payload ->> 'date' is not null
  and payload ->> 'timeSlot' is not null
group by doctor_id, payload ->> 'date', payload ->> 'timeSlot'
having count(*) > 1;

-- Multiple follow-ups referencing the same source appointment.
select payload ->> 'followUpForAppointmentId' as source_appointment_id, count(*) as records
from public.ihms_records
where record_type = 'appointments'
  and payload ->> 'type' = 'follow_up'
  and payload ->> 'followUpForAppointmentId' is not null
group by payload ->> 'followUpForAppointmentId'
having count(*) > 1;

-- Multiple revenue records linked to one appointment.
select payload ->> 'appointmentId' as appointment_id, count(*) as records
from public.ihms_records
where record_type = 'revenue'
  and payload ->> 'appointmentId' is not null
group by payload ->> 'appointmentId'
having count(*) > 1;
```

If a query returns rows, do not apply the unique-index changes until each conflict has been reviewed and handled deliberately. Run the queries again afterward to confirm the result is clear.

## Existing deployment: apply focused migrations before deploying the matching code

For an existing database that already has the previous application schema, review and run these migrations in order in staging first, then production:

1. `supabase/migrations/20261018_privacy_and_attendance_guards.sql` removes the legacy full-profile directory policy, adds `get_ihms_doctor_directory()`, adds its partial index, and enforces active-account status for attendance inserts.
2. `supabase/migrations/20261019130000_atomic_shift_and_profile_privacy.sql` adds an atomic shift-update RPC sharing a doctor-specific transaction lock with appointment writes, restricts managers to a sanitized staff-directory RPC instead of full profile JSON, adds the minimal roster-change Realtime signal table, and adds the `unknown` email-notification status for uncertain delivery outcomes, prevents automatic retries of stale `sending` claims, and keeps those cases for provider-log reconciliation.
3. `supabase/migrations/20261019140000_mobile_login_rate_limit.sql` ensures the server-only API rate-limit table and RPC exist for rate-limited mobile-number sign-in, including deployments that use focused migrations instead of rerunning the full schema.
4. `supabase/migrations/20261023170000_patient_profile_edit.sql` adds the narrowly scoped patient self-profile update RPC and syncs confirmed Supabase Auth email changes into `public.profiles`. Email changes still require the Supabase email-confirmation workflow.

These focused migrations are additive and do not delete appointment, attendance, profile, or payment records. Apply them in the listed order before deploying code that uses their RPCs, policy changes, and email status. Do not treat these focused migrations as a replacement for missing earlier schema changes.

Keep migration versions unique. In particular, do not pair an 8-digit version such as `20261018` with a 14-digit version beginning with the same eight digits; some Supabase migration runners sort those versions inconsistently and report a false “Remote migration versions not found” error. The newer migrations here intentionally use `20261019…` versions to avoid that collision while preserving the already-used `20261018` version.

## 2. Enable Cron and run `supabase/attendance-auto-checkout-cron.sql` second

In Supabase Dashboard, enable Supabase Cron / `pg_cron` under **Integrations → Cron**. Then run the separate Cron script once in SQL Editor. It schedules the attendance checkout worker every minute and a daily cleanup of old Cron execution history. The script references the function from step 1, so it can fail if run before the schema or before Cron is enabled.

## Why not combine them?

`schema.sql` defines application schema and trusted database functions; the Cron script configures background execution in an optional extension. Keeping them separate makes the dependency/order explicit and lets operators review/apply the application schema without scheduling jobs unexpectedly. The Cron script is rerunnable: it removes/replaces its own named jobs before scheduling them.

## Verify

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname in ('ihms-attendance-auto-checkout', 'ihms-cron-history-cleanup');

select jobid, status, start_time, end_time, return_message
from cron.job_run_details
where jobid in (
  select jobid from cron.job
  where jobname in ('ihms-attendance-auto-checkout', 'ihms-cron-history-cleanup')
)
order by start_time desc
limit 20;
```

Do not assume automatic checkout is active until the job exists and successful runs are visible. The migration automatically changes every non-patient profile to `general`; no per-person shift selection is required. Before migration, run the lunch-window audit below and deliberately resolve existing future online/follow-up appointments during 13:00–13:59. Do not paste any service-role key into the browser or a `VITE_` environment variable.

## Audit existing appointments in the new lunch break

Run this query before applying the updated schema. It identifies future active online/follow-up bookings whose starts will fall in the new lunch break. Reschedule these deliberately with the hospital team; do not delete or silently rewrite medical scheduling data.

```sql
select
  record_id,
  payload ->> 'date' as appointment_date,
  payload ->> 'timeSlot' as time_slot,
  payload ->> 'doctorName' as doctor_name,
  payload ->> 'patientName' as patient_name,
  payload ->> 'status' as status
from public.ihms_records
where record_type = 'appointments'
  and payload ->> 'type' in ('online_booking', 'follow_up')
  and payload ->> 'status' in ('scheduled', 'waiting', 'in_consultation')
  and payload ->> 'date' >= (now() at time zone 'Asia/Kolkata')::date::text
  and payload ->> 'timeSlot' in ('01:00 PM', '01:15 PM', '01:30 PM', '01:45 PM')
order by appointment_date, time_slot;
```



Email retry safety: only records explicitly marked `failed` (where SMTP acceptance was not confirmed) can be automatically retried. If a notification remains `sending` for more than ten minutes, the claim RPC changes it to `unknown` and returns no claim; the endpoint returns an uncertain-delivery response. Verify the SMTP provider logs and reconcile the ledger manually before any retry. This favors avoiding duplicate confirmations over silently resending an ambiguous message.
