export const APPOINTMENT_SCHEDULE = {
  timeZone: 'Asia/Kolkata',
  openingTime: '09:00',
  closingTime: '22:00',
  slotIntervalMinutes: 30,
  durationMinutes: 30,
  // Preserve the existing midday break in the slot checker.
  breaks: [{ start: '12:30', end: '14:00' }],
} as const;

function parse24HourTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatAppointmentSlot(totalMinutes: number): string {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${meridiem}`;
}

const openingMinutes = parse24HourTime(APPOINTMENT_SCHEDULE.openingTime) ?? 540;
const closingMinutes = parse24HourTime(APPOINTMENT_SCHEDULE.closingTime) ?? 1320;
const breakRanges = APPOINTMENT_SCHEDULE.breaks.map((range) => ({
  start: parse24HourTime(range.start) ?? 0,
  end: parse24HourTime(range.end) ?? 0,
}));

function overlapsExistingBreak(startMinutes: number, endMinutes: number): boolean {
  return breakRanges.some((range) => startMinutes < range.end && endMinutes > range.start);
}

export const APPOINTMENT_TIME_SLOTS = Object.freeze(
  Array.from(
    { length: Math.ceil((closingMinutes - openingMinutes) / APPOINTMENT_SCHEDULE.slotIntervalMinutes) },
    (_, index) => openingMinutes + index * APPOINTMENT_SCHEDULE.slotIntervalMinutes,
  )
    .filter((startMinutes) => !overlapsExistingBreak(startMinutes, startMinutes + APPOINTMENT_SCHEDULE.durationMinutes))
    .map(formatAppointmentSlot),
);

export function parseAppointmentSlot(slot: string): number | null {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/i.exec(slot.trim());
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 1 || hours > 12 || minutes > 59) return null;
  if (hours === 12) hours = 0;
  if (match[3].toUpperCase() === 'PM') hours += 12;
  return hours * 60 + minutes;
}

export function isValidAppointmentSlot(slot: string): boolean {
  const startMinutes = parseAppointmentSlot(slot);
  if (startMinutes === null) return false;
  const endMinutes = startMinutes + APPOINTMENT_SCHEDULE.durationMinutes;
  return startMinutes >= openingMinutes
    && endMinutes <= closingMinutes
    && (startMinutes - openingMinutes) % APPOINTMENT_SCHEDULE.slotIntervalMinutes === 0
    && !overlapsExistingBreak(startMinutes, endMinutes);
}
