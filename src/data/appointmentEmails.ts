import { supabase } from '../lib/supabase';

export async function sendAppointmentConfirmation(appointmentId: string): Promise<void> {
  if (!supabase) return;

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) throw new Error('Sign in again before sending the appointment confirmation email.');

  const response = await fetch('/api/appointment-confirmation', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
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
