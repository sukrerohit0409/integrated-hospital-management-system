import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

type Request = {
  method?: string;
  headers: { authorization?: string; [key: string]: string | string[] | undefined };
  socket?: { remoteAddress?: string };
  body?: unknown;
};

type Response = {
  status(code: number): Response;
  json(body: unknown): void;
};


const validShifts = new Set(['general']);
const validBloodGroups = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
const NAME_MAX_LENGTH = 80;
const EMAIL_MAX_LENGTH = 254;

function hashKey(value: string, suffix: string): string {
  return `${createHash('sha256').update(value).digest('hex')}:${suffix}`;
}

function validName(value: string): boolean {
  const name = value.trim();
  return name.length >= 2 && name.length <= NAME_MAX_LENGTH && /\p{L}/u.test(name);
}

function validPhone(value: string): boolean {
  return /^[6-9]\d{9}$/.test(value);
}

function validEmail(value: string): boolean {
  const email = value.trim();
  if (email.length > EMAIL_MAX_LENGTH) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (!/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;
  const labels = domain.split('.');
  return labels.length >= 2
    && labels.every((label) => label.length > 0 && label.length <= 63 && !label.startsWith('-') && !label.endsWith('-') && /^[A-Z0-9-]+$/i.test(label))
    && labels[labels.length - 1].length >= 2;
}

function validGmail(value: string): boolean {
  return validEmail(value) && value.trim().toLowerCase().endsWith('@gmail.com');
}

function validAge(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  const age = Number(value);
  return Number.isInteger(age) && age >= 1 && age <= 120;
}

function validOptionalText(value: unknown, maxLength: number): boolean {
  return value === undefined || value === null
    || (typeof value === 'string' && value.trim().length <= maxLength);
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
    console.error('The shared API rate limiter is unavailable:', error.message);
    return null;
  }
  return data === true;
}

const validStaffRoles = new Set([
  'admin', 'manager', 'doctor', 'receptionist',
  'nurse', 'cleaner', 'ward_boy', 'other',
]);

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = (req.headers as Record<string, string | undefined>)?.authorization
    || (req.headers as Record<string, string | undefined>)?.[Object.keys(req.headers || {}).find((k) => k.toLowerCase() === 'authorization') || ''];
  const token = typeof authHeader === 'string' ? authHeader.match(/^Bearer (.+)$/i)?.[1] : undefined;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return res.status(503).json({ error: 'Staff account provisioning is not configured on the server.' });
  }
  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const forwardedFor = req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'];
  const forwardedAddress = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const clientIp = String(forwardedAddress || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim().slice(0, 128);
  const ipAllowed = await checkRateLimit(adminClient, hashKey(`staff-api-ip:${clientIp}`, 'staff-ip'), 60, 300);
  if (ipAllowed === null) {
    return res.status(503).json({ error: 'Security rate limiting is unavailable. Apply the current database schema and try again.' });
  }
  if (!ipAllowed) return res.status(429).json({ error: 'Too many account-management requests. Wait a few minutes before trying again.' });
  if (!token) return res.status(401).json({ error: 'Authentication is required.' });

  const { data: { user }, error: authError } = await publicClient.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Your session is invalid or expired.' });

  const { data: actor, error: actorError } = await adminClient
    .from('profiles')
    .select('role,details')
    .eq('id', user.id)
    .single();
  if (actorError) return res.status(403).json({ error: 'Could not verify your hospital role.' });
  if (actor.details?.status === 'inactive') {
    return res.status(403).json({ error: 'Inactive accounts cannot manage staff.' });
  }
  const userAllowed = await checkRateLimit(adminClient, hashKey(`staff-api-user:${user.id}`, 'staff-user'), 120, 900);
  if (userAllowed === null) return res.status(503).json({ error: 'Security rate limiting is unavailable. Apply the current database schema and try again.' });
  if (!userAllowed) return res.status(429).json({ error: 'Too many account-management requests for this account. Try again later.' });
  let body: Record<string, unknown>;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body as Record<string, unknown>;
  } catch {
    return res.status(400).json({ error: 'Request body must be valid JSON.' });
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'A request body is required.' });
  }
  if (body.action === 'invite' || body.action === 'invitePatient') {
    const createAllowed = await checkRateLimit(adminClient, hashKey(`staff-api-create:${user.id}`, 'staff-create'), 10, 900);
    if (createAllowed === null) return res.status(503).json({ error: 'Security rate limiting is unavailable. Apply the current database schema and try again.' });
    if (!createAllowed) return res.status(429).json({ error: 'Account creation limit reached. Wait before creating or inviting more accounts.' });
  }

  if (!['admin', 'manager', 'receptionist'].includes(actor.role)) {
    return res.status(403).json({ error: 'Your hospital role cannot manage accounts.' });
  }
  if (actor.role === 'receptionist' && body.action !== 'invitePatient') {
    return res.status(403).json({ error: 'Reception can only invite patient portal accounts.' });
  }
  if (body.action === 'invite') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const role = typeof body.role === 'string' ? body.role : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const cleanPhone = phone.replace(/\D/g, '');
    if (!validName(name) || !validEmail(email) || !validPhone(cleanPhone) || phone !== cleanPhone || !validStaffRoles.has(role)
      || password.length < 8 || password.length > 128
      || !validAge(body.age)
      || !validShifts.has(String(body.shift))
      || !validOptionalText(body.department, 100) || !validOptionalText(body.customRoleTitle, 100)
      || !validOptionalText(body.specialty, 120) || !validOptionalText(body.qualification, 120)
      || (role === 'other' && (typeof body.customRoleTitle !== 'string' || body.customRoleTitle.trim().length < 2))
      || (body.gender !== undefined && !['Male', 'Female', 'Other'].includes(String(body.gender)))) {
      return res.status(400).json({
        error: 'Name, valid email, phone, permitted staff role, the General Shift schedule, and a password of at least 8 characters are required.',
      });
    }
    if (actor.role === 'manager' && ['admin', 'manager'].includes(role)) {
      return res.status(403).json({ error: 'Managers cannot create admin or manager accounts.' });
    }

    const details = {
      customRoleTitle: typeof body.customRoleTitle === 'string' ? body.customRoleTitle.trim() : undefined,
      department: typeof body.department === 'string' ? body.department.trim() : undefined,
      specialty: typeof body.specialty === 'string' ? body.specialty.trim() : undefined,
      qualification: typeof body.qualification === 'string' ? body.qualification.trim() : undefined,
      age: Number.isInteger(body.age) ? (body.age as number) : Number.isInteger(Number(body.age)) && Number(body.age) > 0 ? Number(body.age) : undefined,
      gender: ['Male', 'Female', 'Other'].includes(String(body.gender)) ? body.gender : undefined,
      status: 'active',
      shift: String(body.shift),
    };
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { ihmsAccountType: 'staff' },
      user_metadata: { name, phone, age: details.age, gender: details.gender },
    });
    if (error || !data.user) {
      return res.status(400).json({ error: error?.message || 'Could not create the account in Supabase Auth.' });
    }

    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert({
        id: data.user.id,
        name,
        email,
        phone: cleanPhone,
        role,
        details,
      }, { onConflict: 'id' });
    if (profileError) {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(data.user.id);
      if (cleanupError) console.error('Could not clean up unassigned user:', cleanupError);
      return res.status(500).json({ error: 'Account was not completed because the profile could not be assigned.' });
    }
    return res.status(201).json({
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
    const cleanPhone = phone.replace(/\D/g, '');
    const role = 'patient';
    if (!validName(name) || !validGmail(email) || !validPhone(cleanPhone) || phone !== cleanPhone
      || !validAge(body.age) || !validOptionalText(body.department, 100)
      || !validOptionalText(body.customRoleTitle, 100)
      || !validOptionalText(body.specialty, 120) || !validOptionalText(body.qualification, 120)
      || (body.gender !== undefined && !['Male', 'Female', 'Other'].includes(String(body.gender)))
      || (body.bloodGroup !== undefined && body.bloodGroup !== null && body.bloodGroup !== '' && !validBloodGroups.has(String(body.bloodGroup)))) {
      return res.status(400).json({ error: 'Enter a name of 2–80 characters, a valid Gmail address ending in @gmail.com, and a valid 10-digit Indian mobile number.' });
    }
    if (isPatientInvite && !['admin', 'manager', 'receptionist'].includes(actor.role)) {
      return res.status(403).json({ error: 'Your hospital role cannot invite patient accounts.' });
    }
    const details = {
      customRoleTitle: typeof body.customRoleTitle === 'string' ? body.customRoleTitle.trim() : undefined,
      department: typeof body.department === 'string' ? body.department.trim() : undefined,
      specialty: typeof body.specialty === 'string' ? body.specialty.trim() : undefined,
      qualification: typeof body.qualification === 'string' ? body.qualification.trim() : undefined,
      age: Number.isInteger(body.age) ? (body.age as number) : Number.isInteger(Number(body.age)) && Number(body.age) > 0 ? Number(body.age) : undefined,
      gender: ['Male', 'Female', 'Other'].includes(String(body.gender)) ? body.gender : undefined,
      status: 'active',
      bloodGroup: validBloodGroups.has(String(body.bloodGroup)) ? String(body.bloodGroup) : undefined,
    };
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { name, phone: cleanPhone, age: details.age, gender: details.gender, bloodGroup: details.bloodGroup, mustSetPassword: true },
    });
    if (error || !data.user) {
      return res.status(400).json({ error: error?.message || 'Could not create the account in Supabase Auth.' });
    }

    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert({
        id: data.user.id,
        name,
        email: email.toLowerCase(),
        phone: cleanPhone,
        role,
        details,
      }, { onConflict: 'id' });
    if (profileError) {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(data.user.id);
      if (cleanupError) console.error('Could not clean up unassigned user:', cleanupError);
      return res.status(500).json({ error: 'Account was not completed because the profile could not be assigned.' });
    }
    return res.status(201).json({
      id: data.user.id,
      email,
      message: 'Patient invitation sent.',
    });
  }

  if (body.action === 'shift') {
    const id = typeof body.id === 'string' ? body.id : '';
    const shift = typeof body.shift === 'string' ? body.shift : '';
    if (!id || !validShifts.has(shift)) {
      return res.status(400).json({ error: 'A staff id and the General Shift is required.' });
    }
    const { data: target, error: targetError } = await adminClient
      .from('profiles')
      .select('role,details')
      .eq('id', id)
      .single();
    if (targetError || !target || target.role === 'patient') {
      return res.status(404).json({ error: 'Staff account not found.' });
    }
    if (actor.role === 'manager' && ['admin', 'manager'].includes(target.role)) {
      return res.status(403).json({ error: 'Managers cannot change shifts for admin or manager accounts.' });
    }
    // The database RPC acquires the same per-doctor advisory lock as appointment
    // inserts, checks all conflicting future bookings, and updates the profile
    // inside one transaction. A client-side pre-check alone is race-prone.
    const { data: shiftResult, error: shiftError } = await adminClient.rpc('update_ihms_staff_shift', {
      p_staff_id: id,
      p_shift: shift,
    });
    if (shiftError) {
      console.error('Atomic staff shift update failed:', shiftError.message);
      return res.status(500).json({ error: 'Could not safely update the staff shift. Please try again.' });
    }
    const result = shiftResult as { updated?: boolean; conflicts?: number } | null;
    if (!result?.updated) {
      const count = result != null && Number.isInteger(result.conflicts) ? result.conflicts : 0;
      return res.status(409).json({
        error: `This doctor has ${count || 'one or more'} upcoming appointment(s) outside the selected shift. Reschedule those appointments before changing the shift.`,
      });
    }
    return res.status(200).json({ message: 'Staff shift updated.' });
  }

  if (body.action === 'status') {
    const id = typeof body.id === 'string' ? body.id : '';
    const status = body.status;
    if (!id || !['active', 'inactive', 'on_leave'].includes(String(status))) {
      return res.status(400).json({ error: 'A staff id and valid status are required.' });
    }
    if (id === user.id) return res.status(400).json({ error: 'You cannot change your own account status.' });
    const { data: target, error: targetError } = await adminClient
      .from('profiles')
      .select('role,details')
      .eq('id', id)
      .single();
    if (targetError || !target || target.role === 'patient') {
      return res.status(404).json({ error: 'Staff account not found.' });
    }
    if (actor.role === 'manager' && ['admin', 'manager'].includes(target.role)) {
      return res.status(403).json({ error: 'Managers cannot change admin or manager accounts.' });
    }
    const { error } = await adminClient.from('profiles')
      .update({ details: { ...target.details, status } })
      .eq('id', id);
    if (error) return res.status(500).json({ error: 'Could not update staff status.' });
    return res.status(200).json({ message: 'Staff status updated.' });
  }

  if (body.action === 'remove') {
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id || id === user.id) {
      return res.status(400).json({ error: 'A different staff account id is required.' });
    }
    const { data: target, error: targetError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', id)
      .single();
    if (targetError || !target || target.role === 'patient') {
      return res.status(404).json({ error: 'Staff account not found.' });
    }
    if (actor.role === 'manager' && ['admin', 'manager'].includes(target.role)) {
      return res.status(403).json({ error: 'Managers cannot remove admin or manager accounts.' });
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
          return res.status(500).json({ error: "Could not verify the doctor's appointment schedule." });
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
        return res.status(409).json({
          error: 'This doctor still has active or upcoming appointments. Mark the doctor inactive instead of removing the account.',
        });
      }
    }
    // auth.users has a cascade to profiles, so remove the auth account first.
    const { error } = await adminClient.auth.admin.deleteUser(id);
    if (error) return res.status(500).json({ error: 'Could not remove the staff account.' });
    return res.status(200).json({ message: 'Staff account removed.' });
  }

  return res.status(400).json({ error: 'Unsupported staff account action.' });
}
