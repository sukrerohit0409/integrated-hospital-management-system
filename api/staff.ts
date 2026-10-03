import { createClient } from '@supabase/supabase-js';

type Request = {
  method?: string;
  headers: { authorization?: string };
  body?: unknown;
};

type Response = {
  status(code: number): Response;
  json(body: unknown): void;
};

const validRoles = new Set([
  'admin', 'manager', 'doctor', 'receptionist',
  'nurse', 'cleaner', 'ward_boy', 'other',
]);

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return res.status(503).json({ error: 'Staff account provisioning is not configured on the server.' });
  }
  if (!token) return res.status(401).json({ error: 'Authentication is required.' });

  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
  let body: Record<string, unknown>;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body as Record<string, unknown>;
  } catch {
    return res.status(400).json({ error: 'Request body must be valid JSON.' });
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'A request body is required.' });
  }

  if (!['admin', 'manager', 'receptionist'].includes(actor.role)) {
    return res.status(403).json({ error: 'Your hospital role cannot manage accounts.' });
  }
  if (actor.role === 'receptionist' && body.action !== 'invitePatient') {
    return res.status(403).json({ error: 'Reception can only invite patient portal accounts.' });
  }

  if (body.action === 'invite' || body.action === 'invitePatient') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const isPatientInvite = body.action === 'invitePatient';
    const role = isPatientInvite ? 'patient' : typeof body.role === 'string' ? body.role : '';
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone
      || (!isPatientInvite && !validRoles.has(role))) {
      return res.status(400).json({ error: 'Name, valid email, phone, and a permitted staff role are required.' });
    }
    if (isPatientInvite && !['admin', 'manager', 'receptionist'].includes(actor.role)) {
      return res.status(403).json({ error: 'Your hospital role cannot invite patient accounts.' });
    }
    if (actor.role === 'manager' && ['admin', 'manager'].includes(role)) {
      return res.status(403).json({ error: 'Managers cannot create admin or manager accounts.' });
    }
    const details = {
      customRoleTitle: typeof body.customRoleTitle === 'string' ? body.customRoleTitle.trim() : undefined,
      department: typeof body.department === 'string' ? body.department.trim() : undefined,
      age: Number.isInteger(body.age) ? body.age : undefined,
      gender: ['Male', 'Female', 'Other'].includes(String(body.gender)) ? body.gender : undefined,
      status: 'active',
    };
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { name, phone, age: details.age, gender: details.gender },
    });
    if (error || !data.user) {
      return res.status(400).json({ error: error?.message || 'Could not create the staff account.' });
    }

    const { error: profileError } = await adminClient
      .from('profiles')
      .update({ name, phone, role, details })
      .eq('id', data.user.id);
    if (profileError) {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(data.user.id);
      if (cleanupError) console.error('Could not clean up unassigned invited user:', cleanupError);
      return res.status(500).json({ error: 'Invitation was not completed because the staff profile could not be assigned.' });
    }
    return res.status(201).json({
      id: data.user.id,
      email,
      message: isPatientInvite ? 'Patient invitation email sent.' : 'Staff invitation email sent.',
    });
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
    const { error } = await adminClient.auth.admin.deleteUser(id);
    if (error) return res.status(500).json({ error: 'Could not remove the staff account.' });
    return res.status(200).json({ message: 'Staff account removed.' });
  }

  return res.status(400).json({ error: 'Unsupported staff account action.' });
}
