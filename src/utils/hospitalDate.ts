import { APPOINTMENT_SCHEDULE } from '../data/appointmentSchedule.ts';

export const HOSPITAL_TIME_ZONE = APPOINTMENT_SCHEDULE.timeZone;

export function getHospitalDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HOSPITAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getHospitalTime(date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: HOSPITAL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function getHospitalDateTime(date = new Date()): string {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: HOSPITAL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return `${getHospitalDate(date)} ${time}`;
}

export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}


export function isHospitalTimeSlotPast(date: string, slot: string, now = new Date()): boolean {
  const today = getHospitalDate(now);
  if (date < today) return true;
  if (date > today) return false;
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/i.exec(slot.trim());
  if (!match) return false;

  let slotHours = Number(match[1]);
  const slotMinutes = Number(match[2]);
  if (slotHours < 1 || slotHours > 12 || slotMinutes > 59) return false;
  if (slotHours === 12) slotHours = 0;
  if (match[3].toUpperCase() === 'PM') slotHours += 12;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: HOSPITAL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  let currentHour = Number(values.hour);
  if (currentHour === 24) currentHour = 0;
  const currentMinutes = currentHour * 60 + Number(values.minute);
  return slotHours * 60 + slotMinutes <= currentMinutes;
}

export function firstOpenHospitalSlot(
  slots: readonly string[],
  date: string,
  isTaken: (slot: string) => boolean,
  now = new Date(),
): string | undefined {
  return slots.find((slot) => !isHospitalTimeSlotPast(date, slot, now) && !isTaken(slot));
}
