import { supabase } from '../lib/supabase';

export async function sendAppointmentConfirmation(appointmentId: string): Promise<void> {
  if (!supabase) return;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  let token = sessionData.session?.access_token;
  if (!token) {
    const { data: refreshData } = await supabase.auth.refreshSession();
    token = refreshData.session?.access_token;
  }
  if (!token) throw new Error('Sign in again before sending the appointment confirmation email.');

  const response = await fetch('/api/appointment-confirmation', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ appointmentId }),
  });

  const responseText = await response.text();
  let result: { error?: string } = {};
  try {
    result = JSON.parse(responseText) as { error?: string };
  } catch {
    if (!response.ok) {
      throw new Error(`Appointment confirmation email failed (HTTP ${response.status}).`);
    }
  }

  if (!response.ok) {
    throw new Error(result.error || `Appointment confirmation email failed (HTTP ${response.status}).`);
  }
}
