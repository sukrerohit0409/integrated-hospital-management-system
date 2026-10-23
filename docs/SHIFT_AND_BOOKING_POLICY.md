# One-shift and appointment policy

Effective policy in this source package: 2026-10-18.

## General Shift

All non-patient staff—doctors, receptionists, nurses and other staff—use one roster assignment: **General Shift, 09:00–22:00 Asia/Kolkata**. A fixed one-hour lunch break is scheduled **13:00–14:00**. Clock-in is available from 08:30 (up to 30 minutes early) through 22:00, but clock-in is blocked during lunch and at/after shift end. Automatic checkout is fixed at 22:00 local time for newly clocked-in records.

The roster span is 13 hours; after the one-hour lunch break, a full scheduled day records **12 working hours**. Early attendance from 08:30 through 22:00 records up to 12.5 working hours after the lunch deduction. Attendance duration uses actual clock-in and the effective checkout, minus only the portion overlapping 13:00–14:00.

## Appointment slots

Online and follow-up appointments use 15-minute start intervals from 09:00–22:00, excluding the lunch break. Valid starts are 09:00, 09:15, ... 12:45, then 14:00, 14:15, ... 21:45: **48 starts per doctor per day before existing reservations and past-time filtering**. Routine starts during 13:00–13:59 and starts at/after 22:00 are not allowed. The frontend, staff API, and database trigger enforce the same rules; walk-in queue entries remain a separate immediate-arrival workflow.

## Automatic checkout and historic attendance

At clock-in the database snapshots `shift = general` and `shiftEndAt = 22:00 Asia/Kolkata` into the attendance record. Supabase Cron checks due records every minute and checks out at the saved timestamp even if the worker runs late or the browser is closed. Both automatic and manual checkout use the same lunch-aware duration helper for General Shift records.

Existing open attendance records from the previous morning/evening/night policy retain their saved `shiftEndAt`. Their working-hour calculation is not retroactively changed to subtract lunch. Historic attendance remains intact; only newly created General Shift records apply the new lunch rule. The SQL migration converts every non-patient profile to `general` but does not rewrite appointment history or attendance snapshots.

## Lunch-break migration caution

Previously booked future online/follow-up appointments at 13:00–13:45 remain as existing records after migration so the migration never deletes clinical scheduling data. Review them before rollout and deliberately reschedule or resolve them with the patient/doctor. After migration, new or edited appointments cannot be placed in the lunch window.

## Required staging acceptance tests

1. Run the profile migration and confirm every non-patient profile is assigned `general`, while patient profiles have no workforce shift.
2. Confirm admin/manager staff forms show a fixed General Shift and new doctor, receptionist and staff accounts receive it automatically.
3. Verify 48 appointment starts: 09:00–12:45 and 14:00–21:45; reject 08:45, 13:00, 13:45, 22:00, and non-15-minute starts.
4. Verify clock-in at 08:30 and 09:00 is allowed, 13:00–13:59 is blocked, and 22:00 is blocked.
5. Manual checkout at 22:00 after 09:00 clock-in must report 12 hours; clock-in at 08:30 with checkout at 22:00 must report 12.5 hours. Old morning/evening records must keep their original end and gross-hour calculation.
6. With the browser closed, verify Cron automatically closes a General Shift record at 22:00 using its saved end timestamp. Repeated Cron runs must not duplicate or re-close attendance.
7. Run `npm run check:smoke`, `npm run lint`, `npm run build`, then repeat the above in a staging Supabase/Vercel environment.
