import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { getClientIp, isRateLimited } from './rateLimiter';

type RecordPayload = Record<string, unknown>;

function getHeader(headers: any, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') {
    const val = headers.get(name);
    return val || undefined;
  }
  const key = Object.keys(headers).find((header) => header.toLowerCase() === name.toLowerCase());
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

async function parseBody(req: any): Promise<RecordPayload | null> {
  try {
    let body = req.body;
    if (body === undefined && typeof req.json === 'function') {
      body = await req.json();
    } else if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as RecordPayload)
      : null;
  } catch {
    return null;
  }
}

function sendResponse(res: any, status: number, data: unknown, headers?: Record<string, string>) {
  if (res && typeof res.status === 'function') {
    if (headers && typeof res.setHeader === 'function') {
      Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    }
    return res.status(status).json(data);
  }
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Appointment confirmation email could not be sent.';
}

export default async function handler(req: any, res: any) {
  const method = req.method || (req instanceof Request ? req.method : 'GET');
  if (method !== 'POST') {
    return sendResponse(res, 405, { error: 'Method not allowed.' });
  }

  const reqHeaders = req.headers || {};
  const clientIp = getClientIp(reqHeaders);
  const authorization = getHeader(reqHeaders, 'authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const body = await parseBody(req);
  const appointmentId = typeof body?.appointmentId === 'string' ? body.appointmentId.trim() : '';

  if (!token || !appointmentId || appointmentId.length > 64 || !/^[a-zA-Z0-9_\-]+$/.test(appointmentId)) {
    return sendResponse(res, 400, { error: 'Authentication and valid appointment details are required.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPortStr = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const rawSmtpPass = process.env.SMTP_PASS;
  const smtpFromName = process.env.SMTP_FROM_NAME || 'PulseCare Integrated Hospital';
  const smtpFromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !smtpHost || !smtpUser || !rawSmtpPass || !smtpFromEmail) {
    return sendResponse(res, 503, {
      error: 'Appointment email delivery is not configured on the server. Please verify SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.',
    });
  }

  const parsedPort = smtpPortStr ? parseInt(smtpPortStr, 10) : 465;
  const smtpPort = Number.isNaN(parsedPort) ? 465 : parsedPort;
  // If user pasted a Google App Password with space groups ("xxxx xxxx xxxx xxxx"), remove them
  const smtpPass = (smtpHost.includes('gmail') || smtpUser.endsWith('@gmail.com'))
    ? rawSmtpPass.replace(/\s+/g, '')
    : rawSmtpPass;

  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. IP-level email dispatch rate limit (max 15 requests per 5 minutes per IP)
  const ipCheck = await isRateLimited(adminClient, `email_ip:${clientIp}`, 15, 300);
  if (ipCheck.limited) {
    return sendResponse(res, 429, { error: 'Too many email requests from this IP. Please wait before retrying.' }, {
      'Retry-After': String(ipCheck.retryAfter),
    });
  }

  try {
    const { data: { user }, error: authError } = await publicClient.auth.getUser(token);
    if (authError || !user) {
      return sendResponse(res, 401, { error: 'Your session is invalid or expired.' });
    }

    // 2. Patient-level email dispatch rate limit (max 5 emails per 5 minutes per user)
    const userCheck = await isRateLimited(adminClient, `email_user:${user.id}`, 5, 300);
    if (userCheck.limited) {
      return sendResponse(res, 429, { error: 'Email confirmation rate limit exceeded for this account. Please wait before requesting another confirmation.' }, {
        'Retry-After': String(userCheck.retryAfter),
      });
    }

    // Query profile and appointment record with retry to allow for eventual consistency after client write
    let profile: { email?: string; role?: string } | null = null;
    let record: { payload?: RecordPayload } | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const [profileRes, recordRes] = await Promise.all([
        adminClient
          .from('profiles')
          .select('email,role')
          .eq('id', user.id)
          .maybeSingle(),
        adminClient
          .from('ihms_records')
          .select('payload')
          .eq('record_type', 'appointments')
          .eq('record_id', appointmentId)
          .maybeSingle(),
      ]);

      if (profileRes.data) profile = profileRes.data;
      if (recordRes.data) {
        record = recordRes.data;
        break;
      }
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }

    if (!record) {
      return sendResponse(res, 404, { error: 'Appointment record could not be found to confirm.' });
    }

    const appointment = (record.payload || {}) as RecordPayload;
    if (appointment.patientId !== user.id) {
      return sendResponse(res, 403, { error: 'This appointment does not belong to the signed-in patient.' });
    }

    if (profile?.role && profile.role !== 'patient') {
      return sendResponse(res, 403, { error: 'This appointment cannot be confirmed for this account type.' });
    }

    const recipientEmail = (
      profile?.email ||
      user.email ||
      (typeof appointment.patientEmail === 'string' ? appointment.patientEmail : '')
    ).trim().toLowerCase();

    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return sendResponse(res, 400, { error: 'No valid recipient email address found for this patient account.' });
    }

    const patientName = typeof appointment.patientName === 'string' ? appointment.patientName : (user.user_metadata?.name || 'Patient');
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

    let claimed = true;
    try {
      const { data: claimData, error: claimError } = await adminClient.rpc(
        'claim_ihms_appointment_confirmation',
        {
          p_appointment_id: appointmentId,
          p_recipient_email: recipientEmail,
        },
      );
      if (claimError) {
        console.warn('claim_ihms_appointment_confirmation RPC warning:', claimError.message);
      } else if (claimData === false) {
        claimed = false;
      }
    } catch (rpcErr) {
      console.warn('claim_ihms_appointment_confirmation execution fallback:', rpcErr);
    }

    if (!claimed) {
      return sendResponse(res, 200, { message: 'Appointment confirmation email already sent or is currently being sent.' });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    const sendInfo = await transporter.sendMail({
      from: { name: smtpFromName, address: smtpFromEmail },
      to: recipientEmail,
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

    try {
      await adminClient
        .from('ihms_email_notifications')
        .upsert({
          appointment_id: appointmentId,
          notification_type: 'appointment_confirmation',
          recipient_email: recipientEmail,
          status: 'sent',
          provider_message_id: sendInfo.messageId || null,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
    } catch (auditErr) {
      console.warn('Could not record sent notification status:', auditErr);
    }

    return sendResponse(res, 200, { message: 'Appointment confirmation email sent.' });
  } catch (error) {
    try {
      await adminClient
        .from('ihms_email_notifications')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('appointment_id', appointmentId)
        .eq('notification_type', 'appointment_confirmation')
        .eq('status', 'sending');
    } catch (statusUpdateError) {
      console.error('Could not mark notification as failed:', statusUpdateError);
    }
    const errDetail = getErrorMessage(error);
    console.error('Appointment confirmation email failed:', errDetail);
    return sendResponse(res, 502, { error: `Appointment confirmed, but email delivery failed: ${errDetail}` });
  }
}
