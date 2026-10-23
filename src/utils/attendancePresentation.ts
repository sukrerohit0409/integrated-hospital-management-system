import type { AttendanceRecord } from '../types';

export interface AttendanceDayGroup {
  date: string;
  label: string;
  records: AttendanceRecord[];
}

/** Format a YYYY-MM-DD hospital date without local-timezone date drift. */
export function formatAttendanceDay(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date || 'Unknown date';

  const parsedDate = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsedDate.getTime())) return date;

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(parsedDate);
}

function getClockInMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value.trim());
  if (!match) return -1;
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hours += 12;
  return hours * 60 + Number(match[2]);
}

/** Sort newest days first and collect their logs under a readable day heading. */
export function groupAttendanceByDay(records: readonly AttendanceRecord[]): AttendanceDayGroup[] {
  const sortedRecords = [...records].sort((left, right) => {
    const dateOrder = right.date.localeCompare(left.date);
    if (dateOrder !== 0) return dateOrder;

    const leftInstant = left.clockInAt ? Date.parse(left.clockInAt) : Number.NaN;
    const rightInstant = right.clockInAt ? Date.parse(right.clockInAt) : Number.NaN;
    if (Number.isFinite(leftInstant) && Number.isFinite(rightInstant) && leftInstant !== rightInstant) {
      return rightInstant - leftInstant;
    }

    return getClockInMinutes(right.clockIn) - getClockInMinutes(left.clockIn);
  });

  const groups = new Map<string, AttendanceRecord[]>();
  for (const record of sortedRecords) {
    const dayRecords = groups.get(record.date);
    if (dayRecords) dayRecords.push(record);
    else groups.set(record.date, [record]);
  }

  return [...groups.entries()].map(([date, dayRecords]) => ({
    date,
    label: formatAttendanceDay(date),
    records: dayRecords,
  }));
}
