import { firstOpenHospitalSlot, isHospitalTimeSlotPast } from '../src/utils/hospitalDate.ts';

const TIME_SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '12:00 PM', '02:00 PM',
  '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM',
  '04:30 PM', '05:00 PM',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// 2026-10-07 14:15 IST = 08:45 UTC
const afternoon = new Date('2026-10-07T08:45:00.000Z');
assert(isHospitalTimeSlotPast('2026-10-07', '09:00 AM', afternoon), 'morning slot must be past in the afternoon');
assert(isHospitalTimeSlotPast('2026-10-07', '02:00 PM', afternoon), 'current slot must be treated as past');
assert(!isHospitalTimeSlotPast('2026-10-07', '02:30 PM', afternoon), 'later slot must still be open');
assert(isHospitalTimeSlotPast('2026-10-06', '05:00 PM', afternoon), 'yesterday must be past');
assert(!isHospitalTimeSlotPast('2026-10-08', '09:00 AM', afternoon), 'tomorrow must stay open');

const taken = new Set(['02:30 PM']);
assert(
  firstOpenHospitalSlot(TIME_SLOTS, '2026-10-07', (slot) => taken.has(slot), afternoon) === '03:00 PM',
  'same-day follow-up must skip elapsed slots and taken slots',
);

// Midnight IST: hourCycle h23 should not treat every remaining slot as past
const midnight = new Date('2026-10-06T18:30:00.000Z');
assert(!isHospitalTimeSlotPast('2026-10-07', '09:00 AM', midnight), '09:00 AM must remain bookable just after midnight IST');

console.log('hospitalDate checks passed');
