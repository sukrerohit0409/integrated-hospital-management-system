/** Shared client-side validation rules. The API/database must still validate untrusted input. */
export const INPUT_LIMITS = {
  personName: 80,
  email: 254,
  phoneDigits: 10,
  department: 100,
  shortText: 120,
  reason: 500,
  notes: 2000,
  password: 128,
  age: 120,
  customTitle: 100,
  dosage: 80,
  medicalTerm: 120,
} as const;

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export function normalizeIndianMobile(value: string): string {
  // Accept a pasted +91 number but store only the national 10-digit part.
  return value.replace(/\D/g, '').slice(-INPUT_LIMITS.phoneDigits);
}

export function isValidIndianMobile(value: string): boolean {
  return /^[6-9]\d{9}$/.test(value);
}

/** Normalize a login identifier to a national Indian mobile number, or null when invalid. */
export function normalizeIndianLoginPhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || !/^[+\d\s()-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return digits;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits.slice(2);
  return null;
}

/**
 * Candidate profile values for legacy records that stored the same Indian
 * mobile number with a country code or common formatting. The API still
 * refuses ambiguous matches, so this does not allow duplicate-phone accounts
 * to authenticate interchangeably.
 */
export function getIndianPhoneLookupVariants(value: string): string[] {
  const phone = normalizeIndianLoginPhone(value);
  if (!phone) return [];

  const firstFive = phone.slice(0, 5);
  const lastFive = phone.slice(5);
  return [...new Set([
    phone,
    `+91${phone}`,
    `+91 ${phone}`,
    `91${phone}`,
    `91 ${phone}`,
    `${firstFive} ${lastFive}`,
    `${firstFive}-${lastFive}`,
    `+91 ${firstFive} ${lastFive}`,
    `+91-${firstFive}-${lastFive}`,
  ])];
}

/**
 * Normalize seeded local-demo account numbers. Demo fixtures historically use
 * fictional 10-digit numbers that may not start with 6–9. This permissive
 * helper must only be used when Supabase is absent; production login continues
 * to use normalizeIndianLoginPhone and server-side validation.
 */
export function normalizeDemoLoginPhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || !/^[+\d\s()-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (/^\d{10}$/.test(digits)) return digits;
  if (/^91\d{10}$/.test(digits)) return digits.slice(2);
  return null;
}

/** Match a demo fixture by email or normalized fictional phone number. */
export function matchesDemoLoginIdentifier(
  account: { email: string; phone: string },
  identifier: string,
): boolean {
  const cleanIdentifier = identifier.trim().toLowerCase();
  const phone = normalizeDemoLoginPhone(identifier);
  const accountPhone = normalizeDemoLoginPhone(account.phone);
  return account.email.trim().toLowerCase() === cleanIdentifier
    || Boolean(phone && accountPhone && phone === accountPhone);
}

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  if (email.length > INPUT_LIMITS.email) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (!/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some((label) => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) return false;
  return labels.every((label) => /^[A-Z0-9-]+$/i.test(label))
    && labels[labels.length - 1].length >= 2;
}

export function isValidGmailAddress(value: string): boolean {
  const email = value.trim().toLowerCase();
  return isValidEmail(email) && email.endsWith('@gmail.com');
}

export function validatePersonName(value: string): string | null {
  const name = value.trim();
  if (!name) return 'Enter the person’s full name.';
  if (name.length < 2) return 'Name must contain at least 2 characters.';
  if (name.length > INPUT_LIMITS.personName) return `Name must be ${INPUT_LIMITS.personName} characters or fewer.`;
  if (!/[\p{L}]/u.test(name)) return 'Name must contain at least one letter.';
  return null;
}

export function validatePhone(value: string): string | null {
  if (!value) return 'Enter a 10-digit Indian mobile number.';
  if (!isValidIndianMobile(value)) return 'Enter a valid 10-digit Indian mobile number beginning with 6, 7, 8, or 9.';
  return null;
}
