import { firstOpenHospitalSlot, isHospitalTimeSlotPast } from '../src/utils/hospitalDate.ts';
import { APPOINTMENT_TIME_SLOTS, isValidAppointmentSlot } from '../src/data/appointmentSchedule.ts';

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
assert(APPOINTMENT_TIME_SLOTS[0] === '09:00 AM', 'consultation window must open at 09:00 AM');
assert(APPOINTMENT_TIME_SLOTS.includes('09:30 PM'), '09:30 PM must be the final valid 30-minute slot');
assert(!APPOINTMENT_TIME_SLOTS.includes('10:00 PM'), '10:00 PM is the closing boundary, not a start time');
assert(!APPOINTMENT_TIME_SLOTS.includes('12:30 PM'), 'existing midday break must remain unavailable');
assert(isValidAppointmentSlot('09:00 AM'), '09:00 AM must be valid');
assert(isValidAppointmentSlot('09:30 PM'), '09:30 PM must be valid and end at 10:00 PM');
assert(!isValidAppointmentSlot('08:30 AM'), 'pre-opening slot must be invalid');
assert(!isValidAppointmentSlot('10:00 PM'), '10:00 PM start must be invalid');
assert(!isValidAppointmentSlot('09:45 PM'), 'off-interval slot must be invalid');

const taken = new Set(['02:30 PM']);
assert(
  firstOpenHospitalSlot(APPOINTMENT_TIME_SLOTS, '2026-10-07', (slot) => taken.has(slot), afternoon) === '03:00 PM',
  'same-day follow-up must skip elapsed slots and taken slots',
);

// Midnight IST: hourCycle h23 should not treat every remaining slot as past
const midnight = new Date('2026-10-06T18:30:00.000Z');
assert(!isHospitalTimeSlotPast('2026-10-07', '09:00 AM', midnight), '09:00 AM must remain bookable just after midnight IST');

import { getUserInitials } from '../src/utils/userDisplay.ts';

assert(getUserInitials('Dr. Rohan Sharma (Cardiology)') === 'RS', 'Doctor with specialty must show initials RS, not D(');
assert(getUserInitials('Dr. Ananya Iyer (Pediatrics)') === 'AI', 'Doctor with specialty must show initials AI, not D(');
assert(getUserInitials('Vikram Mehta (Manager)') === 'VM', 'Manager with role title must show initials VM, not V(');
assert(getUserInitials('Rohit') === 'R', 'Single name must show first letter');
assert(getUserInitials('Ravi Gupta') === 'RG', 'Two names must show first and last initials');
assert(getUserInitials('Sister Priya Sharma') === 'PS', 'Sister title must skip honorific and show PS');

console.log('hospitalDate and userDisplay checks passed');
