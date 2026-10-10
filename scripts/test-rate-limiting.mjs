import assert from 'node:assert';
import { getClientIp, isRateLimited } from '../api/rateLimiter.ts';

console.log('Testing IHMS Rate Limiting & Abuse Prevention...');

// 1. Client IP Extraction
const ip1 = getClientIp({ 'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178' });
assert.strictEqual(ip1, '203.0.113.195', 'Should extract primary client IP from forwarded list');

const ip2 = getClientIp({ 'x-real-ip': '198.51.100.42' });
assert.strictEqual(ip2, '198.51.100.42', 'Should extract real IP when forwarded-for is absent');

const ip3 = getClientIp({});
assert.strictEqual(ip3, '127.0.0.1', 'Should default to loopback when no IP header present');

console.log('✔ Client IP extraction verified');

// 2. Sliding Window Rate Limiting (In-Memory Fallback Test)
const testKey = 'test_action_' + Date.now();
const maxAllowed = 3;
const windowSec = 2; // 2 seconds

// First 3 requests should pass
const r1 = await isRateLimited(null, testKey, maxAllowed, windowSec);
assert.strictEqual(r1.limited, false, 'Request 1 must be permitted');

const r2 = await isRateLimited(null, testKey, maxAllowed, windowSec);
assert.strictEqual(r2.limited, false, 'Request 2 must be permitted');

const r3 = await isRateLimited(null, testKey, maxAllowed, windowSec);
assert.strictEqual(r3.limited, false, 'Request 3 must be permitted');

// 4th request must be rate limited!
const r4 = await isRateLimited(null, testKey, maxAllowed, windowSec);
assert.strictEqual(r4.limited, true, 'Request 4 must be rate-limited (429)');
assert.ok(r4.retryAfter > 0, 'Retry-After must be positive');

console.log('✔ Rate limiting correctly rejected request at threshold with Retry-After');

// Wait for window to expire
await new Promise((res) => setTimeout(res, 2100));

// After window expiry, request should be allowed again
const r5 = await isRateLimited(null, testKey, maxAllowed, windowSec);
assert.strictEqual(r5.limited, false, 'Request after window expiry must be allowed again');

console.log('✔ Window expiration and counter reset verified');
console.log('All Rate Limiting tests passed successfully!');
