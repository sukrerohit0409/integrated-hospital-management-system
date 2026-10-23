import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { getIndianPhoneLookupVariants, normalizeIndianLoginPhone } from '../src/utils/validation';

type Request = {
  method?: string;
  headers: { [key: string]: string | string[] | undefined };
  socket?: { remoteAddress?: string };
  body?: unknown;
};

type Response = {
  status(code: number): Response;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
};

const GENERIC_LOGIN_ERROR = 'Sign in failed. Check your registered email/mobile number and password.';

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
    console.error('Mobile sign-in rate limiter is unavailable:', error.message);
    return null;
  }
  return data === true;
}

function getHeader(req: Request, name: string): string | undefined {
  const found = Object.entries(req.headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  return Array.isArray(found) ? found[0] : found;
}

export default async function handler(req: Request, res: Response) {
  // This endpoint may return Auth tokens; never let a proxy/browser cache its responses.
  res.setHeader?.('Cache-Control', 'no-store, max-age=0');
  res.setHeader?.('Pragma', 'no-cache');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return res.status(503).json({ error: 'Mobile-number sign in is not configured on the server.' });
  }

  let body: Record<string, unknown>;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body as Record<string, unknown>;
  } catch {
    return res.status(400).json({ error: 'Request body must be valid JSON.' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'A phone number and password are required.' });
  }

  const phone = typeof body.phone === 'string' ? normalizeIndianLoginPhone(body.phone) : null;
  const password = typeof body.password === 'string' ? body.password : '';
  if (!phone || password.length < 1 || password.length > 128) {
    return res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number and password.' });
  }

  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const forwarded = getHeader(req, 'x-forwarded-for') || getHeader(req, 'x-real-ip') || req.socket?.remoteAddress || 'unknown';
  const clientIp = String(forwarded).split(',')[0].trim().slice(0, 128) || 'unknown';
  const ipAllowed = await checkRateLimit(adminClient, hashKey(clientIp, 'ihms-login-ip'), 30, 300);
  if (ipAllowed === null) {
    return res.status(503).json({ error: 'Secure sign in is temporarily unavailable. Verify that the latest Supabase schema is installed, then try again.' });
  }
  if (!ipAllowed) {
    return res.status(429).json({ error: 'Too many sign-in attempts. Wait a few minutes before trying again.' });
  }

  const phoneAllowed = await checkRateLimit(adminClient, hashKey(phone, 'ihms-login-phone'), 8, 900);
  if (phoneAllowed === null) {
    return res.status(503).json({ error: 'Secure sign in is temporarily unavailable. Try again later.' });
  }
  if (!phoneAllowed) {
    return res.status(429).json({ error: 'Too many attempts for this mobile number. Wait 15 minutes before trying again.' });
  }

  try {
    // Profile lookup stays server-side. Do not grant anon users broad profile access or return
    // an email address from this endpoint. Normalize common legacy phone formats and refuse
    // ambiguous duplicate numbers rather than choosing an arbitrary account.
    const phoneVariants = getIndianPhoneLookupVariants(phone);
    const { data: profiles, error: profileError } = await adminClient
      .from('profiles')
      .select('id,email,phone,details')
      .in('phone', phoneVariants)
      .limit(2);

    if (profileError) {
      console.error('Mobile sign-in profile lookup failed:', profileError.message);
      return res.status(503).json({ error: 'Mobile-number sign in is temporarily unavailable. Please try again later.' });
    }
    if (!profiles || profiles.length !== 1) {
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    }

    const profile = profiles[0] as { id: string; email: string; phone: string; details: Record<string, unknown> | null };
    if (profile.details?.status === 'inactive' || !profile.email) {
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    }

    // Supabase Auth remains responsible for password verification and email-confirmation policy.
    const { data, error } = await publicClient.auth.signInWithPassword({
      email: profile.email,
      password,
    });
    if (error || !data.user || !data.session || data.user.id !== profile.id) {
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    }

    // Return only the tokens the browser needs. Never return password, profile lookup data, or email.
    return res.status(200).json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  } catch (error) {
    console.error('Mobile-number sign-in failed unexpectedly:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(500).json({ error: 'Could not complete sign in. Please try again.' });
  }
}
