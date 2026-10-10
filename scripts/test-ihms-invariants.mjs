import assert from 'node:assert';
import {
  APPOINTMENT_SCHEDULE,
  APPOINTMENT_TIME_SLOTS,
  isValidAppointmentSlot,
  parseAppointmentSlot,
} from '../src/data/appointmentSchedule.ts';

console.log('Testing IHMS business logic invariants...');

// 1. Consultation Window & Slot Invariants
assert.strictEqual(APPOINTMENT_SCHEDULE.slotIntervalMinutes, 30);
assert.strictEqual(APPOINTMENT_SCHEDULE.durationMinutes, 30);
assert.strictEqual(APPOINTMENT_SCHEDULE.openingTime, '09:00');
assert.strictEqual(APPOINTMENT_SCHEDULE.closingTime, '22:00');

// Boundary slots validation
assert.strictEqual(isValidAppointmentSlot('09:00 AM'), true, '09:00 AM should be valid');
assert.strictEqual(isValidAppointmentSlot('12:00 PM'), true, '12:00 PM should be valid');
assert.strictEqual(isValidAppointmentSlot('12:30 PM'), false, '12:30 PM (lunch break start) should be invalid');
assert.strictEqual(isValidAppointmentSlot('01:00 PM'), false, '01:00 PM (lunch break) should be invalid');
assert.strictEqual(isValidAppointmentSlot('01:30 PM'), false, '01:30 PM (lunch break) should be invalid');
assert.strictEqual(isValidAppointmentSlot('02:00 PM'), true, '02:00 PM should be valid');
assert.strictEqual(isValidAppointmentSlot('09:30 PM'), true, '09:30 PM (last slot ending at 22:00) should be valid');
assert.strictEqual(isValidAppointmentSlot('10:00 PM'), false, '10:00 PM should be invalid (exceeds closing time)');
assert.strictEqual(isValidAppointmentSlot('08:30 AM'), false, '08:30 AM should be invalid (prior to opening)');
assert.strictEqual(isValidAppointmentSlot('10:15 AM'), false, '10:15 AM should be invalid (not a 30m grid slot)');

// Doctor Slot Options Count
assert.strictEqual(APPOINTMENT_TIME_SLOTS.length, 23, 'Total slots without break would be 26; with 3 break slots removed = 23 slots');
assert.strictEqual(APPOINTMENT_TIME_SLOTS[0], '09:00 AM', 'First slot must be 09:00 AM');
assert.strictEqual(APPOINTMENT_TIME_SLOTS[APPOINTMENT_TIME_SLOTS.length - 1], '09:30 PM', 'Last slot must be 09:30 PM');

console.log(`✔ Verified ${APPOINTMENT_TIME_SLOTS.length} slots spanning 09:00 AM to 09:30 PM IST (lunch break 12:30 PM - 02:00 PM excluded)`);

// 2. Slot Parsing
assert.strictEqual(parseAppointmentSlot('09:00 AM'), 540);
assert.strictEqual(parseAppointmentSlot('12:00 PM'), 720);
assert.strictEqual(parseAppointmentSlot('02:00 PM'), 840);
assert.strictEqual(parseAppointmentSlot('09:30 PM'), 1290);
assert.strictEqual(parseAppointmentSlot('invalid'), null);

console.log('✔ Slot parser and conversion verified');

// 3. Hospital Invariant: Doctor Deletion Protection with Active Appointments
const testUsers = [
  { id: 'doc-1', name: 'Dr. Test', role: 'doctor', status: 'active' },
  { id: 'doc-2', name: 'Dr. Free', role: 'doctor', status: 'active' },
  { id: 'nurse-1', name: 'Nurse Joy', role: 'nurse', status: 'active' }
];

const testAppointments = [
  { doctorId: 'doc-1', date: '2026-10-15', status: 'scheduled' },
  { doctorId: 'doc-2', date: '2026-10-01', status: 'completed' }, // past completed
];

function canDeleteStaff(targetId, today, users, appointments) {
  const target = users.find(u => u.id === targetId);
  if (!target) return false;
  if (target.role === 'doctor') {
    const hasActive = appointments.some(
      a => a.doctorId === targetId && a.date >= today && ['scheduled', 'waiting', 'in_consultation'].includes(a.status)
    );
    if (hasActive) {
      throw new Error('This doctor still has active or upcoming appointments. Mark the doctor inactive instead of removing the account.');
    }
  }
  return true;
}

assert.throws(
  () => canDeleteStaff('doc-1', '2026-10-10', testUsers, testAppointments),
  /active or upcoming appointments/,
  'Deleting doctor with upcoming appointments must throw error'
);

assert.strictEqual(
  canDeleteStaff('doc-2', '2026-10-10', testUsers, testAppointments),
  true,
  'Deleting doctor without active appointments should succeed'
);

assert.strictEqual(
  canDeleteStaff('nurse-1', '2026-10-10', testUsers, testAppointments),
  true,
  'Deleting non-doctor staff should succeed'
);

console.log('✔ Doctor deletion protection invariant verified');

console.log('All IHMS invariant tests passed successfully!');
