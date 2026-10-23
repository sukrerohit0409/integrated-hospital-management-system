import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hospitalApi = readFileSync(new URL('../api/hospital.ts', import.meta.url), 'utf8');
const prescription = readFileSync(new URL('../src/components/PrintPrescriptionModal.tsx', import.meta.url), 'utf8');
const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

assert.doesNotMatch(hospitalApi, /1122334455|IHMS-MH\/2026\/8941/i, 'the public hospital API must not advertise fabricated contact/registration data');
assert.match(hospitalApi, /HOSPITAL_EMERGENCY_CONTACT\?\.trim\(\)/, 'emergency contact must come from explicit server configuration');
assert.match(prescription, /VITE_HOSPITAL_REGISTRATION_NUMBER/, 'prescription registration must be configured by the deployer');
assert.match(prescription, /VITE_HOSPITAL_HELPLINE/, 'prescription helpline must be configured by the deployer');
assert.doesNotMatch(prescription, /1122334455|IHMS-MH\/2026\/8941|MCI-849302/i, 'prescriptions must not contain invented identity data');
assert.match(envExample, /HOSPITAL_EMERGENCY_CONTACT=/);
assert.match(envExample, /VITE_HOSPITAL_REGISTRATION_NUMBER=/);
assert.match(envExample, /VITE_HOSPITAL_HELPLINE=/);

console.log('public hospital contact and prescription identity checks passed');
