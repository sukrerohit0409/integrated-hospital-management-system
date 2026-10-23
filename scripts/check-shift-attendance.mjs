import fs from 'node:fs';
import {
  calculateWorkingHours,
  getShiftClockInError,
  getShiftEndTimestamp,
  getShiftAppointmentSlots,
  getShiftLabel,
  getStaffShift,
  isStaffShift,
  isSlotWithinGeneralShift,
  STAFF_SHIFTS,
} from '../src/utils/staffShifts.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ist = (iso) => new Date(iso);
const earlyArrival = ist('2026-10-18T03:00:00.000Z'); // 08:30 IST
const shiftStart = ist('2026-10-18T03:30:00.000Z'); // 09:00 IST
const lunchStart = ist('2026-10-18T07:30:00.000Z'); // 13:00 IST
const lunchEnd = ist('2026-10-18T08:30:00.000Z'); // 14:00 IST
const shiftEnd = ist('2026-10-18T16:30:00.000Z'); // 22:00 IST

assert(Object.keys(STAFF_SHIFTS).length === 1, 'exactly one assignable shift must exist');
assert(STAFF_SHIFTS.general.start === '09:00 AM' && STAFF_SHIFTS.general.end === '10:00 PM', 'General Shift must be 09:00–22:00 IST');
assert(isStaffShift('general') && !isStaffShift('morning') && !isStaffShift('evening') && !isStaffShift('night'), 'only General Shift is assignable');
assert(getStaffShift({ role: 'doctor', shift: 'morning' }) === 'general', 'legacy morning assignments normalize to General Shift');
assert(getStaffShift({ role: 'nurse', shift: 'evening' }) === 'general', 'legacy evening assignments normalize to General Shift');
assert(getStaffShift({ role: 'cleaner', shift: undefined }) === 'general', 'missing non-patient shift normalizes to General Shift');
assert(getStaffShift({ role: 'patient', shift: undefined }) === 'unassigned', 'patients do not receive a staff shift');
assert(getShiftLabel('general') === 'General Shift', 'shift label should match the single schedule');
assert(getShiftLabel('night') === 'Night Shift (historical)' && getShiftLabel('evening') === 'Evening Shift (historical)', 'legacy attendance labels must remain truthful after roster migration');
assert(getShiftClockInError('general', ist('2026-10-18T02:59:00.000Z')) !== null, '08:29 IST must reject clock-in');
assert(getShiftClockInError('general', earlyArrival) === null, '08:30 IST must allow early arrival');
assert(getShiftClockInError('general', shiftStart) === null, '09:00 IST must allow clock-in');
assert(getShiftClockInError('general', lunchStart) !== null, 'clock-in should be blocked during lunch');
assert(getShiftClockInError('general', ist('2026-10-18T08:00:00.000Z')) !== null, '13:30 IST must reject clock-in during lunch');
assert(getShiftClockInError('general', lunchEnd) === null, '14:00 IST must allow clock-in after lunch');
assert(getShiftClockInError('general', ist('2026-10-18T16:29:00.000Z')) === null, '21:59 IST must allow clock-in in schedule window');
assert(getShiftClockInError('general', shiftEnd) !== null, '22:00 IST must reject clock-in');
assert(getShiftEndTimestamp('general', earlyArrival) === '2026-10-18T16:30:00.000Z', 'early arrival must still check out at 22:00 IST');
assert(getShiftEndTimestamp('general', shiftStart) === '2026-10-18T16:30:00.000Z', 'standard clock-in must check out at 22:00 IST');

const slots = getShiftAppointmentSlots('general');
assert(slots.length === 48, 'one general shift must expose 48 quarter-hour starts outside lunch');
assert(slots[0] === '09:00 AM' && slots[1] === '09:15 AM', 'appointments should start at 09:00 and continue every 15 minutes');
assert(slots.includes('12:45 PM') && !slots.includes('01:00 PM') && !slots.includes('01:15 PM') && !slots.includes('01:30 PM') && !slots.includes('01:45 PM'), 'lunch start slots must be excluded');
assert(slots.includes('02:00 PM') && slots.at(-1) === '09:45 PM', 'afternoon slots resume at 14:00 and final start is 21:45');
assert(getShiftAppointmentSlots('unassigned').length === 0 && getShiftAppointmentSlots('night').length === 0, 'unknown/unassigned roster values must not expose bookable slots');
assert(isSlotWithinGeneralShift('12:45 PM') && isSlotWithinGeneralShift('02:00 PM') && isSlotWithinGeneralShift('09:00 AM') && isSlotWithinGeneralShift('09:45 PM'), 'valid 15-minute slots should pass shared validation');
assert(!isSlotWithinGeneralShift('01:00 PM') && !isSlotWithinGeneralShift('01:45 PM') && !isSlotWithinGeneralShift('10:00 PM') && !isSlotWithinGeneralShift('09:10 AM'), 'lunch, end-boundary, and non-quarter-hour starts must be rejected');

assert(calculateWorkingHours(shiftStart, shiftEnd) === 12, '09:00–22:00 attendance must deduct one-hour lunch and total 12 working hours');
assert(calculateWorkingHours(shiftStart, shiftEnd, false) === 13, 'historic attendance must retain gross-hours behavior without retroactive lunch deductions');
assert(calculateWorkingHours(earlyArrival, shiftEnd) === 12.5, '08:30 early arrival must record 12.5 hours after lunch deduction');
assert(calculateWorkingHours(ist('2026-10-18T06:30:00.000Z'), ist('2026-10-18T08:00:00.000Z')) === 1, 'attendance ending during lunch deducts only overlapping lunch time');
assert(calculateWorkingHours(lunchStart, lunchEnd) === 0, 'a full lunch-only interval is not working time');
assert(calculateWorkingHours(shiftEnd, shiftStart) === 0, 'negative intervals must safely calculate as zero');

const managerUi = fs.readFileSync(new URL('../src/components/manager/ManagerDashboard.tsx', import.meta.url), 'utf8');
const adminUi = fs.readFileSync(new URL('../src/components/admin/AdminDashboard.tsx', import.meta.url), 'utf8');
const patientUi = fs.readFileSync(new URL('../src/components/patient/PatientDashboard.tsx', import.meta.url), 'utf8');
const receptionistUi = fs.readFileSync(new URL('../src/components/receptionist/ReceptionistDashboard.tsx', import.meta.url), 'utf8');
const staffApi = fs.readFileSync(new URL('../api/staff.ts', import.meta.url), 'utf8');
assert(managerUi.includes('General Shift') && adminUi.includes('General Shift'), 'manager/admin forms must explain the single assigned shift');
assert(!/option value="morning"|option value="evening"/.test(managerUi + adminUi), 'staff forms must not offer morning/evening assignment choices');
assert(patientUi.includes('getShiftAppointmentSlots') && receptionistUi.includes('getShiftAppointmentSlots'), 'patient/reception booking must use the shared slot generator');
assert(staffApi.includes("new Set(['general'])") && staffApi.includes("rpc('update_ihms_staff_shift'"), 'staff API must allow only General Shift and use the atomic database update');
const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
assert(schema.includes("v_slot_minutes >= 780 and v_slot_minutes < 840") && schema.includes("p_shift is distinct from 'general'"), 'database must enforce the one-shift lunch/slot boundaries');

console.log('Single-shift, lunch-break, 15-minute booking and working-hour tests passed.');
