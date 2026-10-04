import { supabase } from '../lib/supabase';
import { getAuthErrorMessage } from './authErrors';

export type StaffAccountInput = {
  action: 'invite' | 'invitePatient';
  name: string;
  email: string;
  phone: string;
  role: string;
  customRoleTitle?: string;
  department?: string;
  age?: number;
  gender?: string;
  password?: string;
};

export async function manageStaffAccount(
  input: StaffAccountInput | { action: 'status' | 'remove'; id: string; status?: string }
): Promise<string | undefined> {
  if (!supabase) throw new Error('Staff accounts require a configured Supabase project.');
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) throw new Error('Sign in again to manage staff accounts.');

  const response = await fetch('/api/staff', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const responseText = await response.text();
  let result: { error?: string; id?: string };
  try {
    result = JSON.parse(responseText) as { error?: string; id?: string };
  } catch {
    if (response.status === 404) {
      throw new Error('The staff API is unavailable on the Vite development server. Stop it and run `npx vercel dev` instead.');
    }
    if (!response.ok) {
      throw new Error(`Staff account request failed (HTTP ${response.status}).`);
    }
    throw new Error('The staff API returned an invalid response.');
  }
  if (!response.ok) {
    throw new Error(getAuthErrorMessage(result.error || `Staff account request failed (HTTP ${response.status}).`));
  }
  return result.id;
}
