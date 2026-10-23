import type { Appointment } from '../types';

export type AppointmentVisitOrder = 'newest-first' | 'oldest-first';

/** Convert the appointment slot to minutes after midnight. Invalid slots sort last. */
export function getAppointmentTimeMinutes(timeSlot: string): number | null {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(timeSlot.trim());
  if (!match) return null;

  const rawHours = Number(match[1]);
  const minutes = Number(match[2]);
  if (rawHours < 1 || rawHours > 12 || minutes < 0 || minutes > 59) return null;

  const hours = (rawHours % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return hours * 60 + minutes;
}

/**
 * Sorts a copy by the scheduled visit date and time, not by record insertion order.
 * Newest-first is intended for visit/history screens; oldest-first is intended for queues.
 */
export function sortAppointmentsByVisitDateTime<T extends Pick<Appointment, 'date' | 'timeSlot' | 'createdAt'>>(
  appointments: readonly T[],
  order: AppointmentVisitOrder = 'newest-first',
): T[] {
  const direction = order === 'newest-first' ? -1 : 1;

  return [...appointments].sort((left, right) => {
    const dateDifference = left.date.localeCompare(right.date);
    if (dateDifference !== 0) return dateDifference * direction;

    const leftMinutes = getAppointmentTimeMinutes(left.timeSlot);
    const rightMinutes = getAppointmentTimeMinutes(right.timeSlot);

    // Malformed/legacy time slots should not outrank records with a valid visit time.
    if (leftMinutes === null && rightMinutes !== null) return 1;
    if (leftMinutes !== null && rightMinutes === null) return -1;
    if (leftMinutes !== null && rightMinutes !== null && leftMinutes !== rightMinutes) {
      return (leftMinutes - rightMinutes) * direction;
    }

    const leftCreatedAt = Date.parse(left.createdAt);
    const rightCreatedAt = Date.parse(right.createdAt);
    const safeLeftCreatedAt = Number.isNaN(leftCreatedAt) ? 0 : leftCreatedAt;
    const safeRightCreatedAt = Number.isNaN(rightCreatedAt) ? 0 : rightCreatedAt;
    return (safeLeftCreatedAt - safeRightCreatedAt) * direction;
  });
}

/** Format an ISO calendar date without introducing browser timezone shifts. */
export function formatVisitDate(dateValue: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) return dateValue;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    month < 1 || month > 12 || day < 1
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return dateValue;

  const monthLabel = date.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' });
  return `${String(day).padStart(2, '0')} ${monthLabel} ${year}`;
}
