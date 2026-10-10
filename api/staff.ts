import { createClient } from '@supabase/supabase-js';
import { getClientIp, isRateLimited } from './rateLimiter';

const validStaffRoles = new Set([
  'admin', 'manager', 'doctor', 'receptionist',
  'nurse', 'cleaner', 'ward_boy', 'other',
]);

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

async function parseBody(req: any): Promise<Record<string, unknown> | null> {
  try {
    let body = req.body;
    if (body === undefined && typeof req.json === 'function') {
      body = await req.json();
    } else if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
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

function isValidEmail(email: string): boolean {
  return email.length >= 5 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
  return phone.length >= 7 && phone.length <= 25 && /^[+]?[0-9\s\-()]+$/.test(phone);
}

function sanitizeText(value: unknown, maxLen = 100): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLen) : undefined;
}

export default async function handler(req: any, res: any) {
  const method = req.method || (req instanceof Request ? req.method : 'GET');
  if (method !== 'POST') {
    return sendResponse(res, 405, { error: 'Method not allowed' });
  }

  const reqHeaders = req.headers || {};
  const clientIp = getClientIp(reqHeaders);
  const authHeader = getHeader(reqHeaders, 'authorization');
  const token = typeof authHeader === 'string' ? authHeader.match(/^Bearer (.+)$/i)?.[1] : undefined;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return sendResponse(res, 503, { error: 'Staff account provisioning is not configured on the server.' });
  }
  if (!token) return sendResponse(res, 401, { error: 'Authentication is required.' });

  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. IP-level rate limiting (max 60 requests per 5 minutes per IP)
  const ipCheck = await isRateLimited(adminClient, `staff_ip:${clientIp}`, 60, 300);
  if (ipCheck.limited) {
    return sendResponse(res, 429, { error: 'Too many staff management requests from this IP. Please try again later.' }, {
      'Retry-After': String(ipCheck.retryAfter),
    });
  }

  const { data: { user }, error: authError } = await publicClient.auth.getUser(token);
  if (authError || !user) return sendResponse(res, 401, { error: 'Your session is invalid or expired.' });

  // 2. User-level rate limiting (max 20 staff modifications per 5 minutes per authenticated user)
  const userCheck = await isRateLimited(adminClient, `staff_user:${user.id}`, 20, 300);
  if (userCheck.limited) {
    return sendResponse(res, 429, { error: 'Account management limit exceeded. Please wait a few minutes before trying again.' }, {
      'Retry-After': String(userCheck.retryAfter),
    });
  }

  const { data: actor, error: actorError } = await adminClient
    .from('profiles')
    .select('role,details')
    .eq('id', user.id)
    .single();
  if (actorError) return sendResponse(res, 403, { error: 'Could not verify your hospital role.' });
  if (actor.details?.status === 'inactive') {
    return sendResponse(res, 403, { error: 'Inactive accounts cannot manage staff.' });
  }

  const body = await parseBody(req);
  if (!body) {
    return sendResponse(res, 400, { error: 'A valid JSON request body is required.' });
  }

  if (!['admin', 'manager', 'receptionist'].includes(actor.role)) {
    return sendResponse(res, 403, { error: 'Your hospital role cannot manage accounts.' });
  }
  if (actor.role === 'receptionist' && body.action !== 'invitePatient') {
    return sendResponse(res, 403, { error: 'Reception can only invite patient portal accounts.' });
  }
  if (body.action === 'invite') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const role = typeof body.role === 'string' ? body.role : '';
    const password = typeof body.password === 'string' ? body.password.trim() : '';
    if (
      !name || name.length < 2 || name.length > 100 ||
      !isValidEmail(email) ||
      !isValidPhone(phone) ||
      !validStaffRoles.has(role) ||
      password.length < 8 || password.length > 72
    ) {
      return sendResponse(res, 400, {
        error: 'Name (2-100 chars), valid email, valid phone, permitted staff role, and a password of 8-72 characters are required.',
      });
    }
    if (actor.role === 'manager' && ['admin', 'manager'].includes(role)) {
      return sendResponse(res, 403, { error: 'Managers cannot create admin or manager accounts.' });
    }

    const rawAge = Number(body.age);
    const validAge = Number.isInteger(rawAge) && rawAge >= 1 && rawAge <= 125 ? rawAge : undefined;

    const details = {
      customRoleTitle: sanitizeText(body.customRoleTitle),
      department: sanitizeText(body.department),
      specialty: sanitizeText(body.specialty),
      qualification: sanitizeText(body.qualification),
      age: validAge,
      gender: ['Male', 'Female', 'Other'].includes(String(body.gender)) ? body.gender : undefined,
      status: 'active',
    };
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, phone, age: details.age, gender: details.gender },
    });
    if (error || !data.user) {
      return sendResponse(res, 400, { error: error?.message || 'Could not create the account in Supabase Auth.' });
    }

    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert({
        id: data.user.id,
        name,
        email,
        phone,
        role,
        details,
      }, { onConflict: 'id' });
    if (profileError) {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(data.user.id);
      if (cleanupError) console.error('Could not clean up unassigned user:', cleanupError);
      return sendResponse(res, 500, { error: 'Account was not completed because the profile could not be assigned.' });
    }
    return sendResponse(res, 201, {
      id: data.user.id,
      email,
      message: 'Staff account created and confirmed.',
    });
  }

  if (body.action === 'invitePatient') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const isPatientInvite = body.action === 'invitePatient';
    const role = 'patient';
    if (
      !name || name.length < 2 || name.length > 100 ||
      !isValidEmail(email) ||
      !isValidPhone(phone)
    ) {
      return sendResponse(res, 400, { error: 'Name (2-100 chars), valid email, and valid phone are required.' });
    }
    if (isPatientInvite && !['admin', 'manager', 'receptionist'].includes(actor.role)) {
      return sendResponse(res, 403, { error: 'Your hospital role cannot invite patient accounts.' });
    }

    const rawPatientAge = Number(body.age);
    const validPatientAge = Number.isInteger(rawPatientAge) && rawPatientAge >= 1 && rawPatientAge <= 125 ? rawPatientAge : undefined;

    const details = {
      customRoleTitle: sanitizeText(body.customRoleTitle),
      department: sanitizeText(body.department),
      specialty: sanitizeText(body.specialty),
      qualification: sanitizeText(body.qualification),
      age: validPatientAge,
      gender: ['Male', 'Female', 'Other'].includes(String(body.gender)) ? body.gender : undefined,
      status: 'active',
    };
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { name, phone, age: details.age, gender: details.gender, mustSetPassword: true },
    });
    if (error || !data.user) {
      return sendResponse(res, 400, { error: error?.message || 'Could not create the account in Supabase Auth.' });
    }

    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert({
        id: data.user.id,
        name,
        email: email.toLowerCase(),
        phone,
        role,
        details,
      }, { onConflict: 'id' });
    if (profileError) {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(data.user.id);
      if (cleanupError) console.error('Could not clean up unassigned user:', cleanupError);
      return sendResponse(res, 500, { error: 'Account was not completed because the profile could not be assigned.' });
    }
    return sendResponse(res, 201, {
      id: data.user.id,
      email,
      message: 'Patient invitation sent.',
    });
  }

  if (body.action === 'status') {
    const id = typeof body.id === 'string' ? body.id : '';
    const status = body.status;
    if (!id || !['active', 'inactive', 'on_leave'].includes(String(status))) {
      return sendResponse(res, 400, { error: 'A staff id and valid status are required.' });
    }
    if (id === user.id) return sendResponse(res, 400, { error: 'You cannot change your own account status.' });
    const { data: target, error: targetError } = await adminClient
      .from('profiles')
      .select('role,details')
      .eq('id', id)
      .single();
    if (targetError || !target || target.role === 'patient') {
      return sendResponse(res, 404, { error: 'Staff account not found.' });
    }
    if (actor.role === 'manager' && ['admin', 'manager'].includes(target.role)) {
      return sendResponse(res, 403, { error: 'Managers cannot change admin or manager accounts.' });
    }
    const { error } = await adminClient.from('profiles')
      .update({ details: { ...target.details, status } })
      .eq('id', id);
    if (error) return sendResponse(res, 500, { error: 'Could not update staff status.' });
    return sendResponse(res, 200, { message: 'Staff status updated.' });
  }

  if (body.action === 'remove') {
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id || id === user.id) {
      return sendResponse(res, 400, { error: 'A different staff account id is required.' });
    }
    const { data: target, error: targetError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', id)
      .single();
    if (targetError || !target || target.role === 'patient') {
      return sendResponse(res, 404, { error: 'Staff account not found.' });
    }
    if (actor.role === 'manager' && ['admin', 'manager'].includes(target.role)) {
      return sendResponse(res, 403, { error: 'Managers cannot remove admin or manager accounts.' });
    }
    if (target.role === 'doctor') {
      const activeAppointments: Array<{ record_id: string; payload: unknown }> = [];
      for (let from = 0; ; from += 1000) {
        const { data, error: appointmentsError } = await adminClient
          .from('ihms_records')
          .select('record_id,payload')
          .eq('record_type', 'appointments')
          .eq('doctor_id', id)
          .order('record_id')
          .range(from, from + 999);
        if (appointmentsError) {
          return sendResponse(res, 500, { error: "Could not verify the doctor's appointment schedule." });
        }
        activeAppointments.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const hasActiveAppointments = activeAppointments.some((row) => {
        const payload = row.payload as { status?: string; date?: string } | null;
        return Boolean(payload
          && payload.date
          && payload.date >= today
          && ['scheduled', 'waiting', 'in_consultation'].includes(payload.status || ''));
      });
      if (hasActiveAppointments) {
        return sendResponse(res, 409, {
          error: 'This doctor still has active or upcoming appointments. Mark the doctor inactive instead of removing the account.',
        });
      }
    }
    // auth.users has a cascade to profiles, so remove the auth account first.
    const { error } = await adminClient.auth.admin.deleteUser(id);
    if (error) return sendResponse(res, 500, { error: 'Could not remove the staff account.' });
    return sendResponse(res, 200, { message: 'Staff account removed.' });
  }

  return sendResponse(res, 400, { error: 'Unsupported staff account action.' });
}
