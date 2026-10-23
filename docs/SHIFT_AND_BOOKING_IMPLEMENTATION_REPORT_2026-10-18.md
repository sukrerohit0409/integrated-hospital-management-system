# IHMS One-Shift, Lunch Break, Booking and Auto-Checkout Implementation Report

## Current policy

- All non-patient accounts—doctors, receptionists and other staff—use one fixed **General Shift, 09:00 AM–10:00 PM Asia/Kolkata**.
- One fixed lunch break is **01:00–02:00 PM**. Clock-in is allowed from 08:30 AM until 10:00 PM, excluding lunch.
- Every new General Shift attendance record stores 10:00 PM as its scheduled `shiftEndAt`, regardless of early clock-in. Supabase Cron performs server/database-authoritative checkout using the saved timestamp.
- Working hours for new General Shift records are calculated from actual clock-in to effective checkout minus the overlap with the 01:00–02:00 PM lunch interval. A full 09:00–22:00 day therefore records 12 working hours; an 08:30 early arrival records 12.5 hours.
- Existing attendance records keep their saved end timestamp and retain their previous gross-duration calculation, so reapplying the schema does not rewrite historical attendance semantics.
- Appointment start slots are every 15 minutes from 09:00–12:45, then 14:00–21:45. Lunch-break and post-22:00 starts are excluded consistently in the shared frontend utility, staff API checks, and Supabase validation trigger.
- `schema.sql` migrates existing non-patient profiles from morning/evening/night/unassigned to `general`. It does not change appointment records or attendance snapshots.

## Implementation areas

- `src/utils/staffShifts.ts`: one-shift constants, 48 quarter-hour appointment starts, lunch exclusion, clock-in restrictions, 22:00 checkout timestamp and local/demo working-hours calculation.
- `src/data/mockData.ts` and `src/data/store.ts`: demo staff seed assignments are General Shift; cached non-patient users are normalized; local/demo checkout deducts lunch only on new General Shift attendance rows.
- `src/components/admin/AdminDashboard.tsx` and `src/components/manager/ManagerDashboard.tsx`: staff shift is no longer selected per person; forms assign the single schedule automatically and roster cards display the fixed operating schedule.
- `src/components/patient/PatientDashboard.tsx` and `src/components/receptionist/ReceptionistDashboard.tsx`: keep using the shared slot generator, which excludes lunch.
- `api/staff.ts`: accepts only General Shift assignment and blocks future doctor shift edits if appointments conflict with the new schedule, including its lunch break.
- `supabase/schema.sql`: migration to General Shift; shift-end snapshot at 22:00; 13.5-hour max saved-end validity (08:30–22:00); lunch-aware working-hours helper for new General Shift records; appointment and attendance rules enforce the fixed schedule.
- `supabase/attendance-auto-checkout-cron.sql`: remains a separate script and continues to run the server-side automatic checkout each minute.

## Existing lunch-window bookings

Future appointment records previously booked in the 13:00–14:00 break are intentionally not deleted or silently changed by schema migration. Before rollout, inspect and reschedule these appointments deliberately. After applying the schema, new/edited appointment writes in the lunch window are rejected.

## Verification performed

- `npm run check:shifts`: passed, including the 48 valid starts, lunch exclusions, 08:30/22:00 boundaries, 12/12.5-hour working-time calculations, and preservation of historical gross-hour calculations.
- `npm run check:attendance-sql`: passed its static SQL contract checks for profile migration, saved checkout end, lunch deduction, new booking validation, auto-checkout privileges, Cron schedule and run-history retention.
- The full suite and complete production build must also be run after dependencies are available. Static SQL contract tests do not execute PostgreSQL; apply the schema to a backed-up staging project first and verify real Cron runs before production.

## Deployment order

1. Back up Supabase and use the lunch-window audit query in `docs/SQL_EXECUTION_ORDER.md` to identify future bookings needing a deliberate reschedule.
2. Review and apply `supabase/schema.sql` to staging. This migrates non-patient profiles to General Shift while preserving attendance timestamps and existing appointment records.
3. Enable Supabase Cron / `pg_cron`, then run `supabase/attendance-auto-checkout-cron.sql` separately.
4. Run smoke, lint, and production-build checks; perform end-to-end booking, manual/automatic checkout, login, and role workflow tests.
