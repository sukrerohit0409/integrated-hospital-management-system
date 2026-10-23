import {
  formatVisitDate,
  getAppointmentTimeMinutes,
  sortAppointmentsByVisitDateTime,
} from '../src/utils/appointmentSorting.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const appointments = [
  { id: 'older-afternoon', date: '2026-10-16', timeSlot: '03:00 PM', createdAt: '2026-10-15T10:00:00.000Z' },
  { id: 'today-morning', date: '2026-10-18', timeSlot: '09:00 AM', createdAt: '2026-10-17T10:00:00.000Z' },
  { id: 'today-afternoon', date: '2026-10-18', timeSlot: '02:00 PM', createdAt: '2026-10-17T11:00:00.000Z' },
  { id: 'older-morning', date: '2026-10-16', timeSlot: '09:30 AM', createdAt: '2026-10-15T09:00:00.000Z' },
];

assert(
  sortAppointmentsByVisitDateTime(appointments).map((item) => item.id).join(',')
    === 'today-afternoon,today-morning,older-afternoon,older-morning',
  'history ordering should put the latest visit date and time first',
);
assert(
  sortAppointmentsByVisitDateTime(appointments, 'oldest-first').map((item) => item.id).join(',')
    === 'older-morning,older-afternoon,today-morning,today-afternoon',
  'queue ordering should put the earliest visit date and time first',
);
assert(appointments[0].id === 'older-afternoon', 'sorting must not mutate the original array');
assert(getAppointmentTimeMinutes('12:00 AM') === 0, '12:00 AM should map to midnight');
assert(getAppointmentTimeMinutes('12:00 PM') === 720, '12:00 PM should map to noon');
assert(getAppointmentTimeMinutes('02:30 PM') === 870, 'afternoon times should sort after morning times');
assert(getAppointmentTimeMinutes('invalid') === null, 'invalid legacy times should be safely handled');
assert(formatVisitDate('2026-10-18') === '18 Oct 2026', 'visit date should be readable and timezone-stable');
assert(formatVisitDate('2026-02-30') === '2026-02-30', 'invalid dates should be left unchanged');
assert(formatVisitDate('unknown') === 'unknown', 'unknown date values should be preserved');

console.log('appointment sorting checks passed');
