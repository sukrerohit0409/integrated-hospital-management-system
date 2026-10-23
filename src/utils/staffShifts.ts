import type { User } from '../types';

/** The single regular hospital roster. Emergency response is a separate operational process. */
export type StaffShift = 'general';
export type StaffShiftAssignment = StaffShift | 'unassigned';

export const GENERAL_SHIFT: StaffShift = 'general';
export const HOSPITAL_TIME_ZONE = 'Asia/Kolkata';
export const APPOINTMENT_SLOT_INTERVAL_MINUTES = 15;
export const LUNCH_BREAK_START_MINUTES = 13 * 60;
export const LUNCH_BREAK_END_MINUTES = 14 * 60;

export const STAFF_SHIFTS: Record<StaffShift, { label: string; start: string; end: string; range: string }> = {
  general: {
    label: 'General Shift',
    start: '09:00 AM',
    end: '10:00 PM',
    range: '09:00 AM – 10:00 PM (Lunch 01:00–02:00 PM)',
  },
};

export function isStaffShift(value: unknown): value is StaffShift {
  return value === GENERAL_SHIFT;
}

/**
 * Profiles from earlier releases may still say morning/evening/night/unassigned.
 * The current one-shift policy intentionally normalizes all staff to the general roster.
 * Patients never need a workforce shift.
 */
export function getStaffShift(user?: Pick<User, 'shift' | 'role'> | null): StaffShiftAssignment {
  if (user?.role === 'patient') return 'unassigned';
  return GENERAL_SHIFT;
}

function formatTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hour12 = hours % 12 || 12;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${String(hour12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function parseTimeSlot(timeSlot: string): number | null {
  const match = /^(0[1-9]|1[0-2]):(00|15|30|45) (AM|PM)$/.exec(timeSlot);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return ((hour % 12) + (match[3] === 'PM' ? 12 : 0)) * 60 + minute;
}

export function isHospitalLunchBreakMinute(minutes: number): boolean {
  return minutes >= LUNCH_BREAK_START_MINUTES && minutes < LUNCH_BREAK_END_MINUTES;
}

/** Generate all 15-minute starts from 09:00–22:00, excluding the 13:00–14:00 lunch break. */
export function getShiftAppointmentSlots(shiftValue?: StaffShift | string | null): string[] {
  if (!isStaffShift(shiftValue)) return [];
  const slots: string[] = [];
  for (let minute = 9 * 60; minute < 22 * 60; minute += APPOINTMENT_SLOT_INTERVAL_MINUTES) {
    if (!isHospitalLunchBreakMinute(minute)) slots.push(formatTime(minute));
  }
  return slots;
}

export function isSlotWithinGeneralShift(timeSlot: unknown): boolean {
  if (typeof timeSlot !== 'string') return false;
  const minutes = parseTimeSlot(timeSlot);
  return minutes !== null && minutes >= 9 * 60 && minutes < 22 * 60 && !isHospitalLunchBreakMinute(minutes);
}

export function getShiftLabel(shiftValue?: StaffShift | string | null): string {
  // Preserve truthful labels for stored attendance history from earlier releases.
  if (shiftValue === 'morning') return 'Morning Shift (historical)';
  if (shiftValue === 'evening') return 'Evening Shift (historical)';
  if (shiftValue === 'night') return 'Night Shift (historical)';
  return STAFF_SHIFTS.general.label;
}

function hospitalDateParts(value: Date): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HOSPITAL_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  const date = `${values.year}-${values.month}-${values.day}`;
  let hour = Number(values.hour);
  if (hour === 24) hour = 0;
  return { date, minutes: hour * 60 + Number(values.minute) };
}

/** Clock-in is permitted from 08:30 until 22:00, except the scheduled lunch period. */
export function getShiftClockInError(shiftValue: StaffShift | string | null | undefined, now = new Date()): string | null {
  if (shiftValue !== GENERAL_SHIFT) return 'The hospital uses one General Shift. Ask an administrator to refresh or update this staff profile.';
  const { minutes } = hospitalDateParts(now);
  const valid = minutes >= 8 * 60 + 30 && minutes < 22 * 60 && !isHospitalLunchBreakMinute(minutes);
  return valid ? null : 'Clock-in is available from 08:30 AM to 10:00 PM hospital time, excluding the 01:00–02:00 PM lunch break.';
}

/** Calculate the single General Shift end in India Standard Time for a clock-in on this date. */
export function getShiftEndTimestamp(shiftValue: StaffShift, now = new Date()): string {
  if (!isStaffShift(shiftValue)) throw new Error('The General Shift is required to calculate scheduled checkout.');
  const { date } = hospitalDateParts(now);
  return new Date(`${date}T22:00:00+05:30`).toISOString();
}

/**
 * Calculate working hours in hospital time, subtracting only the portion of 13:00–14:00
 * that overlaps the recorded attendance. This also safely handles historical overnight rows.
 */
export function calculateWorkingHours(clockInAt: string | Date, clockOutAt: string | Date, deductLunchBreak = true): number {
  const start = typeof clockInAt === 'string' ? new Date(clockInAt) : clockInAt;
  const end = typeof clockOutAt === 'string' ? new Date(clockOutAt) : clockOutAt;
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return 0;

  let lunchOverlapMs = 0;
  if (!deductLunchBreak) return Math.round((end.getTime() - start.getTime()) / 36_000) / 100;
  const firstDate = hospitalDateParts(start).date;
  const lastDate = hospitalDateParts(end).date;
  const dayCursor = new Date(`${firstDate}T00:00:00Z`);
  const lastDay = new Date(`${lastDate}T00:00:00Z`);
  while (dayCursor <= lastDay) {
    const date = dayCursor.toISOString().slice(0, 10);
    const lunchStart = new Date(`${date}T13:00:00+05:30`);
    const lunchEnd = new Date(`${date}T14:00:00+05:30`);
    const overlapStart = Math.max(start.getTime(), lunchStart.getTime());
    const overlapEnd = Math.min(end.getTime(), lunchEnd.getTime());
    lunchOverlapMs += Math.max(0, overlapEnd - overlapStart);
    dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
  }

  const workingMs = Math.max(0, end.getTime() - start.getTime() - lunchOverlapMs);
  return Math.round(workingMs / 36_000) / 100;
}
