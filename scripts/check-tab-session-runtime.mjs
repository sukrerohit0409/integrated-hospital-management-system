import assert from 'node:assert/strict';

function memoryStorage(initial = new Map()) {
  const values = new Map(initial);
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
    snapshot() { return new Map(values); },
  };
}

const sharedLocalStorage = memoryStorage();
function setBrowserEnvironment(sessionStorage, navigationType) {
  globalThis.window = {
    sessionStorage,
    localStorage: sharedLocalStorage,
    setInterval: () => 1, // Keep the smoke test deterministic and avoid a live timer.
    addEventListener: () => undefined,
  };
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener: () => undefined,
  };
  globalThis.performance = {
    getEntriesByType: () => [{ type: navigationType }],
  };
}

const session = memoryStorage();
setBrowserEnvironment(session, 'navigate');
const moduleUrl = new URL('../src/data/tabSession.ts', import.meta.url);
const firstLoad = await import(`${moduleUrl.href}?runtime-check-initial`);
const originalTabId = firstLoad.tabSessionId;
const authKey = `pulsecare-ihms-auth-${originalTabId}`;
session.setItem(authKey, 'test-session-token');
session.setItem('ihms_current_user', '{"id":"demo-test-user"}');

// Simulate the next document load following a normal same-tab refresh.
setBrowserEnvironment(session, 'reload');
const reloaded = await import(`${moduleUrl.href}?runtime-check-reload`);
assert.equal(reloaded.tabSessionId, originalTabId, 'a hard refresh must keep the same tab auth key');
assert.equal(session.getItem(authKey), 'test-session-token', 'a hard refresh must not delete the auth token');
assert.ok(session.getItem('ihms_current_user'), 'a hard refresh must not clear the tab-local user');

// Simulate a duplicated tab whose sessionStorage was copied but whose document is a new navigation.
const duplicatedSession = memoryStorage(session.snapshot());
setBrowserEnvironment(duplicatedSession, 'navigate');
const duplicated = await import(`${moduleUrl.href}?runtime-check-duplicate`);
assert.notEqual(duplicated.tabSessionId, originalTabId, 'a duplicated tab should receive a separate tab ID');
assert.equal(duplicatedSession.getItem(authKey), null, 'a duplicated tab must not reuse the copied auth token');
assert.equal(session.getItem(authKey), 'test-session-token', 'isolating a duplicate must not delete the original tab token');

console.log('PASS runtime session test: same-tab refresh retains Supabase auth; duplicated tab is isolated');
