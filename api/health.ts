import { getClientIp, isRateLimited } from './rateLimiter';

/**
 * Vercel Serverless Function compatible health & status route with rate limiting
 */
export default async function handler(req: any, res: any) {
  const headers = req.headers || {};
  const clientIp = getClientIp(headers);

  // Rate limit: 120 requests per minute per IP for ping endpoint
  const ipCheck = await isRateLimited(null, `health_ip:${clientIp}`, 120, 60);
  if (ipCheck.limited) {
    if (res && typeof res.status === 'function') {
      if (typeof res.setHeader === 'function') res.setHeader('Retry-After', String(ipCheck.retryAfter));
      return res.status(429).json({ error: 'Too many health check requests. Please slow down.' });
    }
    return new Response(JSON.stringify({ error: 'Too many health check requests. Please slow down.' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(ipCheck.retryAfter),
      },
    });
  }

  const payload = {
    status: 'healthy',
    system: 'PulseCare Integrated Hospital Management System (IHMS)',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  };

  if (res && typeof res.status === 'function') {
    if (typeof res.setHeader === 'function') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    return res.status(200).json(payload);
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
