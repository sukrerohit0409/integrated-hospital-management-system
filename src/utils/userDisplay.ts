import type { UserRole } from '../types';

export function getUserDisplayName(
  name: string | null | undefined,
  email: string | null | undefined,
  role?: UserRole
): string {
  const trimmedName = name?.trim();
  if (trimmedName) return trimmedName;

  const emailName = email?.split('@')[0]?.trim();
  if (emailName) {
    return emailName
      .split(/[._+-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  return role ? role.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'User';
}

export function getUserInitials(name: string): string {
  const cleaned = (name || '').replace(/\s*\([^)]*\)/g, '').trim();
  const rawWords = cleaned.split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) return 'U';

  const honorifics = new Set(['dr', 'dr.', 'sister', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'prof', 'prof.']);
  const words = rawWords.length > 1 && honorifics.has(rawWords[0].toLowerCase())
    ? rawWords.slice(1)
    : rawWords;

  const firstLetter = words[0].replace(/[^a-zA-Z0-9]/g, '').charAt(0);
  const lastWord = words[words.length - 1].replace(/[^a-zA-Z0-9]/g, '');
  const lastLetter = words.length > 1 ? lastWord.charAt(0) : '';

  const initials = `${firstLetter}${lastLetter}`.toUpperCase();
  return initials || 'U';
}

