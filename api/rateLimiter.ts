import type { SupabaseClient } from '@supabase/supabase-js';

// In-memory sliding-window fallback for local demo mode or database connectivity hiccups
const memoryRateLimits = new Map<string, { count: number; resetAt: number }>();

export function getClientIp(headers: Record<string, string | string[] | undefined>): string {
  const forwarded = headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  } else if (Array.isArray(forwarded) && forwarded[0]) {
    const first = forwarded[0].split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  return '127.0.0.1';
}

export async function isRateLimited(
  supabaseAdmin: SupabaseClient | null,
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ limited: boolean; retryAfter: number }> {
  const now = Date.now();

  // 1. Primary Distributed Enforcement: Supabase PostgreSQL atomic check
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.rpc('check_ihms_rate_limit', {
        p_key: key,
        p_max_requests: maxRequests,
        p_window_seconds: windowSeconds,
      });
      if (!error && typeof data === 'boolean') {
        return { limited: !data, retryAfter: windowSeconds };
      }
    } catch {
      // Graceful fallback to memory limiter on database communication failure
    }
  }

  // 2. In-Memory Defense-in-Depth Fallback
  const entry = memoryRateLimits.get(key);
  if (!entry || entry.resetAt <= now) {
    memoryRateLimits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { limited: false, retryAfter: windowSeconds };
  }

  if (entry.count >= maxRequests) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { limited: true, retryAfter };
  }

  entry.count += 1;
  return { limited: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
}
