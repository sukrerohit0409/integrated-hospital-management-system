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
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'U';
  return words.length === 1
    ? words[0].charAt(0).toUpperCase()
    : `${words[0].charAt(0)}${words[words.length - 1].charAt(0)}`.toUpperCase();
}
