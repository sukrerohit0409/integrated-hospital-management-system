export function getAuthErrorMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('rate limit') && normalized.includes('email')) {
    return 'Supabase temporarily blocked authentication emails because its email rate limit was reached. Check Authentication → Users before retrying, wait for the limit to clear, and configure custom SMTP in Supabase for reliable registration and invitations.';
  }
  return message;
}
