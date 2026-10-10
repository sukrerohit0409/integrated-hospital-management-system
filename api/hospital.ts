import { createClient } from '@supabase/supabase-js';
import { getClientIp, isRateLimited } from './rateLimiter';

type PublicDoctor = {
  id: string;
  name: string;
  department?: string;
  specialty?: string;
  qualification?: string;
  gender?: string;
};

async function loadPublicDoctors(): Promise<PublicDoctor[] | null> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await adminClient
    .from('profiles')
    .select('id,name,role,details')
    .eq('role', 'doctor')
    .order('name');

  if (error) {
    console.error('Could not load the public doctor directory:', error);
    return null;
  }

  return (data || [])
    .filter((profile) => profile.role === 'doctor' && profile.details?.status !== 'inactive')
    .map((profile) => {
      const details = (profile.details || {}) as Record<string, unknown>;
      return {
        id: profile.id,
        name: profile.name,
        department: typeof details.department === 'string' ? details.department : undefined,
        specialty: typeof details.specialty === 'string' ? details.specialty : undefined,
        qualification: typeof details.qualification === 'string' ? details.qualification : undefined,
        gender: typeof details.gender === 'string' ? details.gender : undefined,
      };
    });
}

export default async function handler(req: any, res: any) {
  const method = req.method || 'GET';

  if (method === 'GET') {
    const headers = req.headers || {};
    const clientIp = getClientIp(headers);

    // Rate limiting: Max 60 requests per minute per IP
    const ipCheck = await isRateLimited(null, `hospital_ip:${clientIp}`, 60, 60);
    if (ipCheck.limited) {
      if (res && typeof res.status === 'function') {
        if (typeof res.setHeader === 'function') res.setHeader('Retry-After', String(ipCheck.retryAfter));
        return res.status(429).json({ error: 'Too many requests. Please slow down.' });
      }
      return new Response(JSON.stringify({ error: 'Too many requests. Please slow down.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(ipCheck.retryAfter) }
      });
    }

    const data: Record<string, unknown> = {
      hospitalName: 'PulseCare Integrated Hospital',
      emergencyContact: '+91-8261998094',
      hospitalPhone: '+91 82619 98094',
      hospitalEmail: 'hospital.management.system.demo@gmail.com',
      hospitalAddress: 'Deccan, Pune, Maharashtra, India',
      departments: [
        'Cardiology & Internal Medicine',
        'Pediatrics & Neonatology',
        'Orthopedics & Joint Care',
        'Gynecology & Obstetrics',
        'Neurology',
        'General Surgery'
      ],
      operationalHours: 'Doctor consultations (09:00 AM - 10:00 PM IST)',
      consultationWindow: {
        timeZone: 'Asia/Kolkata',
        openingTime: '09:00',
        closingTime: '22:00',
        slotIntervalMinutes: 30,
        durationMinutes: 30,
      },
      slotIntervalMinutes: 30
    };

    const doctors = await loadPublicDoctors();
    if (doctors) data.doctors = doctors;

    if (res && typeof res.status === 'function') {
      if (typeof res.setHeader === 'function') {
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      }
      return res.status(200).json(data);
    }
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
      }
    });
  }

  if (res && typeof res.status === 'function') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
}
