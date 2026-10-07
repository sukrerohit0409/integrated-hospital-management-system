const TAB_ID_KEY = 'ihms_tab_id';
const CURRENT_USER_KEY = 'ihms_current_user';
const AUTH_STORAGE_PREFIX = 'pulsecare-ihms-auth-';
const LEASE_PREFIX = 'ihms_tab_lease_';
const LEASE_REFRESH_MS = 15_000;

function createId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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
      if (lease.instanceId !== instanceId) {
        clearCopiedSession(tabId);
        tabId = createId();
      }
    } catch (error) {
      console.error('Could not parse the browser tab session lease:', error);
      clearCopiedSession(tabId);
      tabId = createId();
    }
  }

  window.sessionStorage.setItem(TAB_ID_KEY, tabId);
  const activeLeaseKey = `${LEASE_PREFIX}${tabId}`;
  const writeLease = () => {
    window.localStorage.setItem(activeLeaseKey, JSON.stringify({
      instanceId,
      updatedAt: Date.now(),
    }));
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
  console.error('Could not isolate this browser tab session:', error);
  const copiedTabId = tabId;
  tabId = createId();
  clearCopiedSession(copiedTabId);
  try {
    window.sessionStorage.setItem(TAB_ID_KEY, tabId);
  } catch (storageError) {
    console.error('Could not clear the copied browser tab session:', storageError);
  }
}

export const tabSessionId = tabId;
