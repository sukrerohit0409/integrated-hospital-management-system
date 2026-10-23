import { supabase } from '../lib/supabase';

export type AppointmentConfirmationResult = 'sent' | 'already_handled' | 'unknown';

type ConfirmationResponse = {
  error?: string;
  message?: string;
  deliveryStatus?: string;
};

export async function sendAppointmentConfirmation(appointmentId: string): Promise<AppointmentConfirmationResult> {
  if (!supabase) return 'sent';

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
  let result: ConfirmationResponse = {};
  try {
    result = JSON.parse(responseText) as ConfirmationResponse;
  } catch {
    if (!response.ok) {
      throw new Error(`Appointment confirmation email failed (HTTP ${response.status}).`);
    }
  }

  if (!response.ok) {
    throw new Error(result.error || `Appointment confirmation email failed (HTTP ${response.status}).`);
  }

  if (result.deliveryStatus === 'unknown') return 'unknown';
  if (result.message?.toLowerCase().includes('already sent') || result.message?.toLowerCase().includes('currently being sent')) {
    return 'already_handled';
  }
  return 'sent';
}
