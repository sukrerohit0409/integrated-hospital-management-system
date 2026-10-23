import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';

type Request = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  socket?: { remoteAddress?: string };
};

type Response = {
  status(code: number): Response;
  json(body: unknown): void;
};

type RecordPayload = Record<string, unknown>;

function hashKey(value: string, suffix: string): string {
  return `${createHash('sha256').update(value).digest('hex')}:${suffix}`;
}

async function checkRateLimit(
  adminClient: SupabaseClient<any, any, any>,
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<boolean | null> {
  const { data, error } = await adminClient.rpc('consume_ihms_api_rate_limit', {
    p_bucket_key: key,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error('Appointment email rate limiter is unavailable:', error.message);
    return null;
  }
  return data === true;
}

function getHeader(headers: Request['headers'], name: string): string | undefined {
  const key = Object.keys(headers || {}).find((header) => header.toLowerCase() === name.toLowerCase());
  const value = key ? headers[key] : undefined;
  return Array.isArray(value) ? value[0] : value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[character] || character));
}

function parseBody(body: unknown): RecordPayload | null {
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as RecordPayload
      : null;
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Appointment confirmation email could not be sent.';
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const authorization = getHeader(req.headers, 'authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const body = parseBody(req.body);
  const appointmentId = typeof body?.appointmentId === 'string' ? body.appointmentId.trim() : '';

  if (!token || !appointmentId) {
    return res.status(400).json({ error: 'Authentication and appointment details are required.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFromName = process.env.SMTP_FROM_NAME;
  const smtpFromEmail = process.env.SMTP_FROM_EMAIL;

  if (!supabaseUrl || !anonKey || !serviceRoleKey
    || !smtpHost || smtpPort !== 465 || !smtpUser || !smtpPass || !smtpFromName || !smtpFromEmail) {
    return res.status(503).json({ error: 'Appointment email delivery is not configured on the server.' });
  }

  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Once the SMTP provider accepts a message, a later database error is an
  // uncertain tracking outcome—not a safe reason to immediately mark it failed
  // and automatically resend it.
  let providerAccepted = false;
  let providerMessageId: string | null = null;

  const forwardedFor = getHeader(req.headers, 'x-forwarded-for');
  const clientIp = String(forwardedFor || getHeader(req.headers, 'x-real-ip') || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim().slice(0, 128);
  const ipAllowed = await checkRateLimit(adminClient, hashKey(`appointment-email-ip:${clientIp}`, 'appointment-email-ip'), 40, 300);
  if (ipAllowed === null) {
    return res.status(503).json({ error: 'Security rate limiting is unavailable. Apply the current database schema and try again.' });
  }
  if (!ipAllowed) {
    return res.status(429).json({ error: 'Too many email requests. Wait a few minutes before trying again.' });
  }

  try {
    const { data: { user }, error: authError } = await publicClient.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Your session is invalid or expired.' });
    }
    const userAllowed = await checkRateLimit(adminClient, hashKey(`appointment-email-user:${user.id}`, 'appointment-email-user'), 20, 900);
    if (userAllowed === null) {
      return res.status(503).json({ error: 'Security rate limiting is unavailable. Apply the current database schema and try again.' });
    }
    if (!userAllowed) {
      return res.status(429).json({ error: 'Too many appointment email requests for this account. Try again later.' });
    }

    const [{ data: profile, error: profileError }, { data: record, error: recordError }] = await Promise.all([
      adminClient
        .from('profiles')
        .select('email,role')
        .eq('id', user.id)
        .single(),
      adminClient
        .from('ihms_records')
        .select('payload')
        .eq('record_type', 'appointments')
        .eq('record_id', appointmentId)
        .single(),
    ]);

    if (profileError || recordError || !profile || !record || profile.role !== 'patient') {
      return res.status(403).json({ error: 'This appointment cannot be confirmed for the signed-in account.' });
    }

    const appointment = record.payload as RecordPayload;
    if (appointment.patientId !== user.id || typeof profile.email !== 'string' || !profile.email) {
      return res.status(403).json({ error: 'This appointment does not belong to the signed-in patient.' });
    }

    const patientName = typeof appointment.patientName === 'string' ? appointment.patientName : 'Patient';
    const tokenNumber = typeof appointment.tokenNumber === 'string' ? appointment.tokenNumber : appointmentId;
    const doctorName = typeof appointment.doctorName === 'string' ? appointment.doctorName : 'Assigned doctor';
    const department = typeof appointment.department === 'string' ? appointment.department : 'Outpatient Clinic';
    const appointmentDate = typeof appointment.date === 'string' ? appointment.date : 'To be confirmed';
    const timeSlot = typeof appointment.timeSlot === 'string' ? appointment.timeSlot : 'To be confirmed';
    const appointmentType = appointment.type === 'follow_up' ? 'Follow-up consultation' : 'Outpatient consultation';
    const reason = typeof appointment.reasonForVisit === 'string' ? appointment.reasonForVisit : 'Medical consultation';
    const feeAmount = typeof appointment.feeAmount === 'number' ? `₹${appointment.feeAmount}` : 'As advised by reception';

    const safePatientName = escapeHtml(patientName);
    const safeToken = escapeHtml(tokenNumber);
    const safeDoctorName = escapeHtml(doctorName);
    const safeDepartment = escapeHtml(department);
    const safeDate = escapeHtml(appointmentDate);
    const safeTimeSlot = escapeHtml(timeSlot);
    const safeType = escapeHtml(appointmentType);
    const safeReason = escapeHtml(reason);
    const safeFeeAmount = escapeHtml(feeAmount);

    const { data: claimed, error: claimError } = await adminClient.rpc(
      'claim_ihms_appointment_confirmation',
      {
        p_appointment_id: appointmentId,
        p_recipient_email: profile.email,
      },
    );
    if (claimError) {
      throw claimError;
    }
    if (!claimed) {
      const { data: notification, error: notificationLookupError } = await adminClient
        .from('ihms_email_notifications')
        .select('status')
        .eq('appointment_id', appointmentId)
        .eq('notification_type', 'appointment_confirmation')
        .maybeSingle();

      if (notificationLookupError) {
        console.error('Could not inspect the existing email delivery state:', notificationLookupError.message);
        return res.status(202).json({
          message: 'The existing email delivery state could not be verified. Do not retry automatically; check the provider logs.',
          deliveryStatus: 'unknown',
        });
      }

      if (notification?.status === 'unknown' || !notification || notification.status === 'failed') {
        return res.status(202).json({
          message: 'The confirmation email delivery state requires manual verification. Do not retry automatically; check the provider logs.',
          deliveryStatus: 'unknown',
        });
      }

      if (notification.status === 'sending') {
        return res.status(200).json({ message: 'Appointment confirmation email is currently being sent.' });
      }

      if (notification.status === 'sent') {
        return res.status(200).json({ message: 'Appointment confirmation email already sent.' });
      }

      return res.status(202).json({
        message: 'The confirmation email delivery state could not be verified. Do not retry automatically; check the provider logs.',
        deliveryStatus: 'unknown',
      });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const sendInfo = await transporter.sendMail({
      from: { name: smtpFromName, address: smtpFromEmail },
      to: profile.email,
      subject: `Appointment confirmed - ${tokenNumber}`,
      text: [
        `Dear ${patientName},`,
        '',
        'Your PulseCare hospital appointment has been confirmed.',
        `Token: ${tokenNumber}`,
        `Type: ${appointmentType}`,
        `Doctor: ${doctorName}`,
        `Department: ${department}`,
        `Date: ${appointmentDate}`,
        `Time: ${timeSlot}`,
        `Reason: ${reason}`,
        `Consultation fee: ${feeAmount}`,
        '',
        'Please arrive 15 minutes before your scheduled time.',
        '',
        'Integrated Hospital Management System',
      ].join('\n'),
      html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="max-width:640px;margin:24px auto;padding:0 16px;">
      <div style="background:#0f766e;color:#fff;padding:24px;border-radius:16px 16px 0 0;">
        <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.85;">Integrated Hospital Management System</div>
        <h1 style="margin:8px 0 0;font-size:24px;">Appointment Confirmed</h1>
      </div>
      <div style="background:#fff;padding:28px;border-radius:0 0 16px 16px;box-shadow:0 8px 24px rgba(15,23,42,.08);">
        <p style="font-size:16px;">Dear ${safePatientName},</p>
        <p style="color:#475569;line-height:1.6;">Your appointment has been successfully confirmed. Please keep the details below for your visit.</p>
        <div style="margin:24px 0;padding:18px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;">
          <div style="font-size:12px;color:#0f766e;text-transform:uppercase;font-weight:bold;">Token ${safeToken}</div>
          <h2 style="margin:8px 0 18px;font-size:20px;color:#134e4a;">${safeType}</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:7px 0;color:#64748b;">Doctor</td><td style="padding:7px 0;font-weight:bold;">${safeDoctorName}</td></tr>
            <tr><td style="padding:7px 0;color:#64748b;">Department</td><td style="padding:7px 0;">${safeDepartment}</td></tr>
            <tr><td style="padding:7px 0;color:#64748b;">Date</td><td style="padding:7px 0;font-weight:bold;">${safeDate}</td></tr>
            <tr><td style="padding:7px 0;color:#64748b;">Time</td><td style="padding:7px 0;font-weight:bold;">${safeTimeSlot}</td></tr>
            <tr><td style="padding:7px 0;color:#64748b;">Reason</td><td style="padding:7px 0;">${safeReason}</td></tr>
            <tr><td style="padding:7px 0;color:#64748b;">Consultation fee</td><td style="padding:7px 0;">${safeFeeAmount}</td></tr>
          </table>
        </div>
        <p style="color:#475569;line-height:1.6;">Please arrive 15 minutes before your scheduled time and bring any relevant medical documents.</p>
        <p style="margin-top:28px;color:#64748b;font-size:12px;">This is an automated message from the Integrated Hospital Management System. Please do not reply to this email.</p>
      </div>
    </div>
  </body>
</html>`,
    });
    if (!Array.isArray(sendInfo.accepted) || sendInfo.accepted.length === 0) {
      throw new Error('SMTP provider did not accept the recipient address.');
    }
    providerAccepted = true;
    providerMessageId = typeof sendInfo.messageId === 'string' ? sendInfo.messageId : null;

    const { error: sentUpdateError } = await adminClient
      .from('ihms_email_notifications')
      .update({
        status: 'sent',
        provider_message_id: providerMessageId,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('appointment_id', appointmentId)
      .eq('notification_type', 'appointment_confirmation');
    if (sentUpdateError) {
      throw sentUpdateError;
    }

    return res.status(200).json({ message: 'Appointment confirmation email sent.' });
  } catch (error) {
    if (providerAccepted) {
      const { error: uncertainUpdateError } = await adminClient
        .from('ihms_email_notifications')
        .update({
          status: 'unknown',
          provider_message_id: providerMessageId,
          updated_at: new Date().toISOString(),
        })
        .eq('appointment_id', appointmentId)
        .eq('notification_type', 'appointment_confirmation')
        .eq('status', 'sending');
      if (uncertainUpdateError) {
        console.error('Could not persist accepted-email tracking state:', uncertainUpdateError.message);
      }
      console.error('Appointment email was accepted but its sent status could not be saved:', getErrorMessage(error));
      return res.status(202).json({
        message: 'The email provider accepted the confirmation, but delivery tracking could not be saved. Do not retry automatically; verify the provider logs.',
        deliveryStatus: 'unknown',
      });
    }

    await adminClient
      .from('ihms_email_notifications')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('appointment_id', appointmentId)
      .eq('notification_type', 'appointment_confirmation')
      .eq('status', 'sending');
    console.error('Appointment confirmation email failed:', getErrorMessage(error));
    return res.status(502).json({ error: 'Appointment was saved, but the confirmation email could not be sent.' });
  }
}
