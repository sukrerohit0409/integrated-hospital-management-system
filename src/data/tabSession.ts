/**
 * Keep a stable, per-tab auth storage key across hard refreshes and deployments.
 *
 * sessionStorage survives a reload of the same origin. The previous lease check
 * compared a random per-document ID and treated a legitimate refresh as a
 * duplicated tab, deleting the Supabase token before auth restoration could run.
 * We now preserve the key on normal reloads while still isolating a duplicated
 * tab when it opens as a new navigation and another live tab owns the lease.
 */
const TAB_ID_KEY = 'ihms_tab_id';
const CURRENT_USER_KEY = 'ihms_current_user';
const AUTH_STORAGE_PREFIX = 'pulsecare-ihms-auth-';
const LEASE_PREFIX = 'ihms_tab_lease_';
const LEASE_REFRESH_MS = 15_000;
const LEASE_STALE_MS = 90_000;

function createId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isReloadNavigation(): boolean {
  try {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return navigation?.type === 'reload';
  } catch {
    return false;
  }
}

const instanceId = createId();
let tabId = createId();

function clearCopiedSession(copiedTabId: string): void {
  for (const key of [CURRENT_USER_KEY, `${AUTH_STORAGE_PREFIX}${copiedTabId}`]) {
    try {
      window.sessionStorage.removeItem(key);
    } catch (error) {
      console.error(`Could not clear copied tab storage "${key}":`, error);
    }
  }
}

try {
  const storedTabId = window.sessionStorage.getItem(TAB_ID_KEY);
  if (storedTabId) tabId = storedTabId;

  const leaseKey = `${LEASE_PREFIX}${tabId}`;
  const existingLease = window.localStorage.getItem(leaseKey);
  if (existingLease) {
    try {
      const lease = JSON.parse(existingLease) as { instanceId?: string; updatedAt?: number };
      const lastSeen = Number(lease.updatedAt);
      const leaseIsStale = !Number.isFinite(lastSeen) || Date.now() - lastSeen > LEASE_STALE_MS;
      const sameTabReload = isReloadNavigation();
      if (lease.instanceId !== instanceId && !sameTabReload && !leaseIsStale) {
        // sessionStorage may be copied by a duplicated-tab action. Give the new
        // tab a fresh auth storage key; never do this on a normal page refresh.
        clearCopiedSession(tabId);
        tabId = createId();
      }
    } catch (error) {
      // A corrupt lease should not destroy a valid auth session during a reload.
      console.error('Could not parse the browser tab session lease; preserving the tab session:', error);
    }
  }

  window.sessionStorage.setItem(TAB_ID_KEY, tabId);
  const activeLeaseKey = `${LEASE_PREFIX}${tabId}`;
  const writeLease = () => {
    try {
      window.localStorage.setItem(activeLeaseKey, JSON.stringify({
        instanceId,
        updatedAt: Date.now(),
      }));
    } catch (error) {
      console.error('Could not update the browser tab session lease:', error);
    }
  };
  const releaseLease = () => {
    try {
      const lease = window.localStorage.getItem(activeLeaseKey);
      if (lease && (JSON.parse(lease) as { instanceId?: string }).instanceId === instanceId) {
        window.localStorage.removeItem(activeLeaseKey);
      }
    } catch (error) {
      console.error('Could not release the browser tab session lease:', error);
    }
  };

  writeLease();
  window.setInterval(writeLease, LEASE_REFRESH_MS);
  window.addEventListener('pagehide', releaseLease);
  window.addEventListener('beforeunload', releaseLease);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') writeLease();
  });
} catch (error) {
  // Storage may be disabled by browser policy. Do not proactively erase auth
  // tokens: Supabase will report persistence errors and the UI can explain them.
  console.error('Could not initialize per-tab session isolation:', error);
}

export const tabSessionId = tabId;
