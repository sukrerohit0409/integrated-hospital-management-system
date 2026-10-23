import {
  User,
  UserRole,
  Appointment,
  Prescription,
  AttendanceRecord,
  RevenueItem,
  ExpenseItem,
  LeaveRequest,
  HospitalStats,
  MedicalCharge,
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_APPOINTMENTS,
  INITIAL_ATTENDANCE,
  INITIAL_REVENUE,
  INITIAL_EXPENSES,
  INITIAL_LEAVES,
  LOCAL_DEMO_PASSWORD,
} from './mockData';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import './tabSession';
import { getHospitalDate, getHospitalDateTime, getHospitalTime } from '../utils/hospitalDate';
import { calculateWorkingHours, getShiftClockInError, getShiftEndTimestamp, isStaffShift, type StaffShiftAssignment } from '../utils/staffShifts';
import { getUserDisplayName } from '../utils/userDisplay';

const STORAGE_KEYS = {
  USERS: 'ihms_users',
  CURRENT_USER: 'ihms_current_user',
  APPOINTMENTS: 'ihms_appointments',
  ATTENDANCE: 'ihms_attendance',
  REVENUE: 'ihms_revenue',
  EXPENSES: 'ihms_expenses',
  LEAVES: 'ihms_leaves',
};

type Listener = () => void;
type DoctorDirectoryRow = {
  id: string;
  name: string;
  department: string | null;
  specialty: string | null;
  qualification: string | null;
  shift: string | null;
};
type ManagedStaffDirectoryRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  created_at: string;
  custom_role_title: string | null;
  department: string | null;
  specialty: string | null;
  qualification: string | null;
  shift: string | null;
  status: string | null;
};
const listeners = new Set<Listener>();
let loadingSharedData = false;
let sharedWriteQueue: Promise<void> = Promise.resolve();
let sharedDataRefresher: (() => Promise<void>) | null = null;
let sharedChannel: RealtimeChannel | null = null;
let sharedChannelUsers = 0;
let realtimeFallbackTimer: number | null = null;
let sharedVisibilityHandler: (() => void) | null = null;
let sharedOnlineHandler: (() => void) | null = null;
const sharedWriteErrors: string[] = [];

const SHARED_DATASETS: Record<string, string> = {
  [STORAGE_KEYS.APPOINTMENTS]: 'appointments',
  [STORAGE_KEYS.ATTENDANCE]: 'attendance',
  [STORAGE_KEYS.REVENUE]: 'revenue',
  [STORAGE_KEYS.EXPENSES]: 'expenses',
  [STORAGE_KEYS.LEAVES]: 'leaves',
};
const demoSharedKeys = new Set([STORAGE_KEYS.USERS, ...Object.keys(SHARED_DATASETS)]);
const demoDataChannel = !supabase && typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('pulsecare-ihms-demo-data')
  : null;

function notify() {
  listeners.forEach((listener) => listener());
}

demoDataChannel?.addEventListener('message', (event: MessageEvent<{ key?: unknown; value?: unknown }>) => {
  const { key, value } = event.data || {};
  if (typeof key !== 'string' || !demoSharedKeys.has(key) || !Array.isArray(value)) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
    notify();
    window.dispatchEvent(new Event('ihms:data-success'));
  } catch (error) {
    console.error(`Could not apply demo data update for "${key}":`, error);
    window.dispatchEvent(new CustomEvent('ihms:data-error', {
      detail: 'A live demo update could not be applied in this tab.',
    }));
  }
});

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Local Storage helpers with fallback
function getStored<T>(key: string, fallback: T): T {
  try {
    const item = sessionStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (err) {
    console.error(`Error loading ${key}:`, err);
    return fallback;
  }
}

function setStored<T>(key: string, value: T): void {
  try {
    const previous = sessionStorage.getItem(key);
    sessionStorage.setItem(key, JSON.stringify(value));
    notify();
    if (!supabase) {
      window.dispatchEvent(new Event('ihms:data-success'));
      if (demoSharedKeys.has(key)) {
        demoDataChannel?.postMessage({ key, value });
      }
    }
    const dataset = SHARED_DATASETS[key];
    if (dataset && supabase && !loadingSharedData) {
      let actorId: string | null = null;
      try {
        const currentUser = sessionStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        actorId = currentUser ? (JSON.parse(currentUser) as User | null)?.id ?? null : null;
      } catch {
        actorId = null;
      }
      sharedWriteQueue = sharedWriteQueue.then(() =>
        persistSharedRecords(dataset, previous, value, actorId)
      );
    }
  } catch (err) {
    console.error(`Error saving ${key}:`, err);
  }
}

function recordOwner(dataset: string, record: Record<string, unknown>): string | null {
  if (dataset === 'appointments') return String(record.patientId || '');
  if (dataset === 'attendance' || dataset === 'leaves') return String(record.staffId || '');
  return null;
}

function createRecordId(prefix: string): string {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

function parseAttendanceClockIn(record: AttendanceRecord): Date | null {
  if (record.clockInAt) {
    const timestamp = new Date(record.clockInAt);
    return Number.isNaN(timestamp.getTime()) ? null : timestamp;
  }

  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(record.clockIn.trim());
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  const meridiem = match[4]?.toUpperCase();
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === 'PM' ? 12 : 0);
  }
  if (hours > 23 || minutes > 59 || seconds > 59) return null;

  const [year, month, day] = record.date.split('-').map(Number);
  if (!year || !month || !day) return null;
  const timestamp = new Date(year, month - 1, day, hours, minutes, seconds);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

async function persistSharedRecords(
  dataset: string,
  previousJson: string | null,
  value: unknown,
  actorId: string | null
): Promise<void> {
  const client = supabase;
  if (!client || !Array.isArray(value)) return;
  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    if (!actorId || user?.id !== actorId) {
      throw new Error('The signed-in account changed before this update could be saved.');
    }
    const previous = previousJson ? JSON.parse(previousJson) as Array<Record<string, unknown>> : [];
    const next = value as Array<Record<string, unknown>>;
    const previousById = new Map(previous.map((record) => [String(record.id), record]));
    const changed = next.filter((record) =>
      JSON.stringify(previousById.get(String(record.id))) !== JSON.stringify(record)
    );
    const toDatabaseRow = (record: Record<string, unknown>) => ({
      record_type: dataset,
      record_id: String(record.id),
      owner_id: recordOwner(dataset, record),
      doctor_id: dataset === 'appointments' ? String(record.doctorId || '') : null,
      payload: dataset === 'appointments'
        ? Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'prescription'))
        : record,
    });
    const inserted = changed.filter((record) => !previousById.has(String(record.id)));
    const updated = changed.filter((record) => previousById.has(String(record.id)));
    if (inserted.length) {
      const { error } = await client
        .from('ihms_records')
        .insert(inserted.map(toDatabaseRow));
      if (error) throw error;
    }

    const prescriptionChanges = dataset === 'appointments'
      ? changed.filter((record) =>
        JSON.stringify(previousById.get(String(record.id))?.prescription)
        !== JSON.stringify(record.prescription)
      )
      : [];
    const atomicallyUpdatedIds = new Set<string>();
    for (const record of prescriptionChanges) {
      const { error } = await client.rpc('save_ihms_consultation', {
        p_record_id: String(record.id),
        p_payload: toDatabaseRow(record).payload,
        p_prescription_payload: record.prescription ?? null,
      });
      if (error) throw error;
      atomicallyUpdatedIds.add(String(record.id));
    }

    const independentlyUpdated = updated.filter(
      (record) => !atomicallyUpdatedIds.has(String(record.id))
    );
    if (independentlyUpdated.length) {
      await Promise.all(independentlyUpdated.map(async (record) => {
        const { data, error } = await client
          .from('ihms_records')
          .update({ payload: toDatabaseRow(record).payload })
          .eq('record_type', dataset)
          .eq('record_id', String(record.id))
          .select('record_id')
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          throw new Error(`The ${dataset} record ${String(record.id)} no longer exists or cannot be updated.`);
        }
      }));
    }

    const nextIds = new Set(next.map((record) => String(record.id)));
    const removedIds = previous
      .map((record) => String(record.id))
      .filter((id) => !nextIds.has(id));
    if (removedIds.length) {
      const { error } = await client
        .from('ihms_records')
        .delete()
        .eq('record_type', dataset)
        .in('record_id', removedIds);
      if (error) throw error;
    }
    window.dispatchEvent(new Event('ihms:data-success'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const message = `Unable to save ${dataset.replace('_', ' ')}: ${detail}`;
    console.error(`Unable to save ${dataset} to Supabase:`, error);
    sharedWriteErrors.push(message);
    window.dispatchEvent(new CustomEvent('ihms:data-error', {
      detail: message,
    }));
    if (sharedDataRefresher) {
      try {
        await sharedDataRefresher();
      } catch (refreshError) {
        console.error('Could not reload the persisted hospital data after a failed save:', refreshError);
        window.dispatchEvent(new CustomEvent('ihms:data-error', {
          detail: 'The failed change could not be rolled back from the database. Reload before continuing.',
        }));
      }
    }
  }
}

function saveHydratedData(key: string, value: unknown): void {
  sessionStorage.setItem(key, JSON.stringify(value));
}

function clearCurrentUserStorage(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  } catch (error) {
    console.error('Error clearing current user session:', error);
  }
}

export function clearSharedStore(): void {
  sharedDataRefresher = null;
  for (const key of [STORAGE_KEYS.USERS, ...Object.keys(SHARED_DATASETS)]) {
    sessionStorage.removeItem(key);
  }
  clearCurrentUserStorage();
  notify();
}

export async function initializeSharedStore(): Promise<() => void> {
  if (!supabase) return () => undefined;

  const client = supabase;
  type RecordRefreshScope = 'appointments' | 'attendance' | 'revenue' | 'expenses' | 'leaves';
  type RefreshScope = '*' | 'profiles' | 'prescriptions' | RecordRefreshScope;
  const allRecordScopes: RecordRefreshScope[] = ['appointments', 'attendance', 'revenue', 'expenses', 'leaves'];
  const recordDatasetKeys: Record<RecordRefreshScope, string> = {
    appointments: STORAGE_KEYS.APPOINTMENTS,
    attendance: STORAGE_KEYS.ATTENDANCE,
    revenue: STORAGE_KEYS.REVENUE,
    expenses: STORAGE_KEYS.EXPENSES,
    leaves: STORAGE_KEYS.LEAVES,
  };

  const refresh = async (scopes: Set<RefreshScope>) => {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    if (!user) {
      clearSharedStore();
      return;
    }

    const refreshAll = scopes.has('*');
    const refreshProfiles = refreshAll || scopes.has('profiles');
    const refreshPrescriptions = refreshAll || scopes.has('prescriptions') || scopes.has('appointments');
    const recordTypes = new Set<RecordRefreshScope>(
      refreshAll ? allRecordScopes : [...scopes].filter((scope): scope is RecordRefreshScope => allRecordScopes.includes(scope as RecordRefreshScope)),
    );
    // Appointment objects embed their prescription, so prescription changes refresh
    // only that relationship instead of reloading all five datasets.
    if (scopes.has('prescriptions')) recordTypes.add('appointments');

    const pageSize = 1000;
    const fetchAllPages = async <T,>(
      fetchPage: (from: number, to: number) => PromiseLike<{
        data: T[] | null;
        error: { message: string } | null;
      }>,
    ): Promise<T[]> => {
      const allRows: T[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await fetchPage(from, from + pageSize - 1);
        if (error) throw error;
        const page = data || [];
        allRows.push(...page);
        if (page.length < pageSize) return allRows;
      }
    };

    const [recordGroups, prescriptionRows] = await Promise.all([
      Promise.all([...recordTypes].map(async (recordType) => {
        const rows = await fetchAllPages<{ record_type: string; record_id: string; payload: unknown }>((from, to) =>
          client.from('ihms_records').select('record_type,record_id,payload')
            .eq('record_type', recordType)
            .order('record_id').range(from, to),
        );
        return [recordType, rows.map((row) => row.payload)] as const;
      })),
      refreshPrescriptions
        ? fetchAllPages<{ appointment_id: string; payload: unknown }>((from, to) =>
          client.from('ihms_prescriptions').select('appointment_id,payload')
            .order('appointment_id').range(from, to),
        )
        : Promise.resolve([] as Array<{ appointment_id: string; payload: unknown }>),
    ]);

    if (refreshProfiles) {
      const [profiles, doctorDirectoryResult, managedStaffResult] = await Promise.all([
        fetchAllPages<{ id: string; name: string; email: string; phone: string; role: UserRole; details: unknown; created_at: string }>((from, to) =>
          client.from('profiles').select('id,name,email,phone,role,details,created_at')
            .order('id').range(from, to),
        ),
        client.rpc('get_ihms_doctor_directory'),
        client.rpc('get_ihms_managed_staff_directory'),
      ]);
      if (doctorDirectoryResult.error) throw doctorDirectoryResult.error;
      if (managedStaffResult.error) throw managedStaffResult.error;

      const profileUsers: User[] = profiles.map((profile) => {
        const details = profile.details && typeof profile.details === 'object' && !Array.isArray(profile.details)
          ? profile.details as Partial<User>
          : {};
        return {
          ...details,
          id: profile.id,
          name: getUserDisplayName(profile.name, profile.email, profile.role as UserRole),
          email: profile.email,
          phone: profile.phone,
          role: profile.role as UserRole,
          isOnline: false,
          status: details.status || 'active',
          createdAt: profile.created_at,
        };
      });
      const visibleUserIds = new Set(profileUsers.map((profile) => profile.id));
      const managedRows = (managedStaffResult.data || []) as ManagedStaffDirectoryRow[];
      const managedStaffUsers: User[] = managedRows
        .filter((staff) => !visibleUserIds.has(staff.id))
        .map((staff) => ({
          id: staff.id,
          name: getUserDisplayName(staff.name, staff.email, staff.role),
          email: staff.email,
          phone: staff.phone,
          role: staff.role,
          customRoleTitle: staff.custom_role_title || undefined,
          department: staff.department || undefined,
          specialty: staff.specialty || undefined,
          qualification: staff.qualification || undefined,
          shift: isStaffShift(staff.shift) ? staff.shift : 'unassigned',
          isOnline: false,
          status: staff.status === 'on_leave' || staff.status === 'inactive' ? staff.status : 'active',
          createdAt: staff.created_at,
        }));
      const rosterVisibleIds = new Set([...visibleUserIds, ...managedStaffUsers.map((staff) => staff.id)]);
      const directoryRows = (doctorDirectoryResult.data || []) as DoctorDirectoryRow[];
      const directoryUsers: User[] = directoryRows
        .filter((doctor) => !rosterVisibleIds.has(doctor.id))
        .map((doctor) => ({
          id: doctor.id,
          name: getUserDisplayName(doctor.name, null, 'doctor'),
          email: '',
          phone: '',
          role: 'doctor' as const,
          department: doctor.department || undefined,
          specialty: doctor.specialty || undefined,
          qualification: doctor.qualification || undefined,
          shift: isStaffShift(doctor.shift) ? doctor.shift : 'unassigned',
          isOnline: false,
          status: 'active' as const,
          createdAt: '',
        }));
      // Managers use a purpose-built whitelist directory; other roles receive only
      // profile rows allowed by RLS plus the restricted active-doctor directory.
      const users: User[] = [...profileUsers, ...managedStaffUsers, ...directoryUsers];
      loadingSharedData = true;
      try {
        saveHydratedData(STORAGE_KEYS.USERS, users);
        // Keep the active user's profile fields current without losing auth-only flags.
        const cachedCurrentUser = getStored<User | null>(STORAGE_KEYS.CURRENT_USER, null);
        if (cachedCurrentUser) {
          const currentProfile = users.find((candidate) => candidate.id === cachedCurrentUser.id);
          if (currentProfile) {
            saveHydratedData(STORAGE_KEYS.CURRENT_USER, {
              ...cachedCurrentUser,
              ...currentProfile,
              mustSetPassword: cachedCurrentUser.mustSetPassword,
            });
          }
        }
      } finally {
        loadingSharedData = false;
      }
    }

    const refreshedRecords = new Map<string, unknown[]>(recordGroups);
    const prescriptionByAppointment = new Map<string, unknown>(
      prescriptionRows.map((row) => [row.appointment_id, row.payload] as const),
    );
    if (recordTypes.has('appointments')) {
      const appointments = refreshedRecords.get('appointments') || [];
      refreshedRecords.set('appointments', appointments.map((record) => {
        const appointment = record as Record<string, unknown>;
        const prescription = prescriptionByAppointment.get(String(appointment.id));
        if (prescription !== undefined) return { ...appointment, prescription };
        const { prescription: _stalePrescription, ...withoutStalePrescription } = appointment;
        return withoutStalePrescription;
      }));
    }

    loadingSharedData = true;
    try {
      for (const [recordType, records] of refreshedRecords) {
        saveHydratedData(recordDatasetKeys[recordType as RecordRefreshScope], records);
      }
    } finally {
      loadingSharedData = false;
    }
    notify();
    window.dispatchEvent(new Event('ihms:data-success'));
  };

  let refreshInProgress = false;
  let refreshRequested = false;
  let refreshDebounceTimer: number | null = null;
  const pendingRefreshScopes = new Set<RefreshScope>();
  const debouncedRefreshScopes = new Set<RefreshScope>();
  const refreshLatest = async (requestedScopes: RefreshScope | RefreshScope[] = '*') => {
    const scopes = Array.isArray(requestedScopes) ? requestedScopes : [requestedScopes];
    if (scopes.includes('*')) {
      pendingRefreshScopes.clear();
      pendingRefreshScopes.add('*');
    } else if (!pendingRefreshScopes.has('*')) {
      scopes.forEach((scope) => pendingRefreshScopes.add(scope));
    }
    refreshRequested = true;
    if (refreshInProgress) return;
    refreshInProgress = true;
    try {
      while (refreshRequested) {
        refreshRequested = false;
        const currentScopes = new Set(pendingRefreshScopes);
        pendingRefreshScopes.clear();
        await refresh(currentScopes.size ? currentScopes : new Set<RefreshScope>(['*']));
      }
    } finally {
      refreshInProgress = false;
    }
  };
  const scheduleRefresh = (...requestedScopes: RefreshScope[]) => {
    const scopes: RefreshScope[] = requestedScopes.length ? requestedScopes : ['*'];
    if (scopes.includes('*')) {
      debouncedRefreshScopes.clear();
      debouncedRefreshScopes.add('*');
    } else if (!debouncedRefreshScopes.has('*')) {
      scopes.forEach((scope) => debouncedRefreshScopes.add(scope));
    }
    if (refreshDebounceTimer !== null) window.clearTimeout(refreshDebounceTimer);
    refreshDebounceTimer = window.setTimeout(() => {
      refreshDebounceTimer = null;
      const scopesToRefresh = [...debouncedRefreshScopes];
      debouncedRefreshScopes.clear();
      void refreshLatest(scopesToRefresh.length ? scopesToRefresh : '*').catch((error: unknown) => {
        console.error('Unable to refresh shared hospital data:', error);
        window.dispatchEvent(new CustomEvent('ihms:data-error', {
          detail: 'Could not refresh shared data. It will be reconciled when Realtime reconnects or the tab regains visibility.',
        }));
      });
    }, 150);
  };
  const startFallbackRefresh = () => {
    if (realtimeFallbackTimer !== null) return;
    realtimeFallbackTimer = window.setInterval(() => {
      // Realtime is the primary sync path; only reconcile visible tabs while disconnected.
      if (document.visibilityState !== 'visible') return;
      void refreshLatest('*').catch((error: unknown) => {
        console.error('Unable to refresh shared hospital data while live sync is reconnecting:', error);
        window.dispatchEvent(new CustomEvent('ihms:data-error', {
          detail: 'Live sync is unavailable and shared data could not be refreshed. Check the connection.',
        }));
      });
    }, 30_000);
  };
  const stopFallbackRefresh = () => {
    if (realtimeFallbackTimer === null) return;
    window.clearInterval(realtimeFallbackTimer);
    realtimeFallbackTimer = null;
  };

  sharedDataRefresher = () => refreshLatest('*');
  if (!sharedChannel) {
    const channel = client.channel(createRecordId('ihms-shared-records'));
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ihms_records' }, (payload) => {
        const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as { record_type?: unknown };
        const recordType = row?.record_type;
        if (typeof recordType === 'string' && allRecordScopes.includes(recordType as RecordRefreshScope)) {
          scheduleRefresh(recordType as RecordRefreshScope);
        } else {
          scheduleRefresh('*');
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ihms_prescriptions' }, () => scheduleRefresh('prescriptions'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => scheduleRefresh('profiles'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ihms_staff_directory_events' }, () => scheduleRefresh('profiles'));
    sharedChannel = channel;
    // Reconcile all datasets once when a tab becomes visible or regains connectivity;
    // realtime callbacks normally refresh only the affected dataset.
    sharedVisibilityHandler = () => {
      if (document.visibilityState === 'visible') scheduleRefresh('*');
    };
    sharedOnlineHandler = () => scheduleRefresh('*');
    document.addEventListener('visibilitychange', sharedVisibilityHandler);
    window.addEventListener('online', sharedOnlineHandler);
    startFallbackRefresh();
    channel.subscribe((status, error) => {
      if (sharedChannel !== channel) return;
      if (status === 'SUBSCRIBED') {
        stopFallbackRefresh();
        window.dispatchEvent(new Event('ihms:data-success'));
        scheduleRefresh('*');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        startFallbackRefresh();
        console.error(`Supabase Realtime subscription ${status.toLowerCase()}:`, error);
        window.dispatchEvent(new CustomEvent('ihms:data-error', {
          detail: 'Live sync is reconnecting. Shared data will refresh automatically while the connection is restored.',
        }));
      } else if (status === 'CLOSED') {
        startFallbackRefresh();
      }
    });
  }
  sharedChannelUsers += 1;

  let stopped = false;
  const stopSync = () => {
    if (stopped) return;
    stopped = true;
    sharedChannelUsers -= 1;
    if (refreshDebounceTimer !== null) {
      window.clearTimeout(refreshDebounceTimer);
      refreshDebounceTimer = null;
    }
    if (sharedChannelUsers === 0 && sharedChannel) {
      const channelToRemove = sharedChannel;
      sharedChannel = null;
      stopFallbackRefresh();
      if (sharedVisibilityHandler) {
        document.removeEventListener('visibilitychange', sharedVisibilityHandler);
        sharedVisibilityHandler = null;
      }
      if (sharedOnlineHandler) {
        window.removeEventListener('online', sharedOnlineHandler);
        sharedOnlineHandler = null;
      }
      void client.removeChannel(channelToRemove);
    }
  };

  try {
    await refreshLatest('*');
    return stopSync;
  } catch (error) {
    stopSync();
    throw error;
  }
}

// Store API
export const store = {
  subscribe: (listener: Listener) => subscribe(listener),
  flushPendingWrites: async () => {
    await sharedWriteQueue;
    if (sharedWriteErrors.length) {
      throw new Error(sharedWriteErrors.splice(0).join(' '));
    }
    window.dispatchEvent(new Event('ihms:data-success'));
  },

  // Reset all to fresh mock data
  resetAll: () => {
    sessionStorage.removeItem(STORAGE_KEYS.USERS);
    clearCurrentUserStorage();
    sessionStorage.removeItem(STORAGE_KEYS.APPOINTMENTS);
    sessionStorage.removeItem(STORAGE_KEYS.ATTENDANCE);
    sessionStorage.removeItem(STORAGE_KEYS.REVENUE);
    sessionStorage.removeItem(STORAGE_KEYS.EXPENSES);
    sessionStorage.removeItem(STORAGE_KEYS.LEAVES);
    notify();
  },

  // USERS
  getUsers: (): User[] => getStored<User[]>(STORAGE_KEYS.USERS, INITIAL_USERS).map((user) =>
    user.role === 'patient' ? user : { ...user, shift: 'general' }
  ),

  getCurrentUser: (): User | null => {
    let currentUser: string | null = null;
    try {
      currentUser = sessionStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    } catch (err) {
      console.error('Error reading current user session:', err);
      return null;
    }
    if (currentUser !== null) {
      try {
        const parsed = JSON.parse(currentUser) as User | null;
        if (parsed && parsed.role !== 'patient') return { ...parsed, shift: 'general' };
        return parsed;
      } catch (err) {
        console.error('Error loading current user:', err);
        return null;
      }
    }
    // No saved session means this tab is logged out.
    return null;
  },

  setCurrentUser: (user: User | null) => {
    try {
      if (user) {
        sessionStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
      } else {
        sessionStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      }
      notify();
    } catch (err) {
      console.error('Error saving current user session:', err);
    }
  },

  addUser: (userData: Omit<User, 'id' | 'createdAt' | 'isOnline'>): User => {
    const users = store.getUsers();
    const newUser: User = {
      ...userData,
      id: createRecordId('u'),
      createdAt: getHospitalDate(),
      isOnline: false,
      status: userData.status || 'active',
      password: userData.password || LOCAL_DEMO_PASSWORD,
    };
    const updated = [...users, newUser];
    setStored(STORAGE_KEYS.USERS, updated);
    return newUser;
  },

  updateUser: (id: string, updates: Partial<User>) => {
    const users = store.getUsers();
    const updated = users.map((u) => (u.id === id ? { ...u, ...updates } : u));
    setStored(STORAGE_KEYS.USERS, updated);

    // If updating currently logged in user
    const current = store.getCurrentUser();
    if (current && current.id === id) {
      store.setCurrentUser({ ...current, ...updates });
    }
  },

  deleteUser: (id: string) => {
    const users = store.getUsers();
    const updated = users.filter((u) => u.id !== id);
    setStored(STORAGE_KEYS.USERS, updated);
  },

  changePassword: (userId: string, newPassword: string): boolean => {
    const users = store.getUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx !== -1) {
      users[idx].password = newPassword;
      setStored(STORAGE_KEYS.USERS, users);
      const current = store.getCurrentUser();
      if (current && current.id === userId) {
        store.setCurrentUser({ ...current, password: newPassword });
      }
      return true;
    }
    return false;
  },

  // APPOINTMENTS
  getAppointments: (): Appointment[] =>
    getStored<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, INITIAL_APPOINTMENTS),

  addAppointment: (apt: Omit<Appointment, 'id' | 'tokenNumber' | 'createdAt'>): Appointment => {
    const appointments = store.getAppointments();
    const newApt: Appointment = {
      ...apt,
      id: createRecordId('apt'),
      tokenNumber: `T-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: getHospitalDateTime(),
      status: apt.status || 'scheduled',
      followUpStatus: 'pending',
    };
    const updated = [newApt, ...appointments];
    setStored(STORAGE_KEYS.APPOINTMENTS, updated);
    return newApt;
  },

  updateAppointmentStatus: (
    id: string,
    status: Appointment['status']
  ) => {
    const appointments = store.getAppointments();
    const updated = appointments.map((a) => (a.id === id ? { ...a, status } : a));
    setStored(STORAGE_KEYS.APPOINTMENTS, updated);
  },

  collectFee: (
    id: string,
    paymentMethod: 'Cash' | 'Card' | 'UPI',
    collectedBy: string,
    billReviewed = false
  ) => {
    const appointments = store.getAppointments();
    const nowStr = getHospitalDateTime();
    const dateStr = getHospitalDate();
    const timeStr = getHospitalTime();

    const targetApt = appointments.find((a) => a.id === id);
    if (
      !targetApt
      || targetApt.feeCollected
      || targetApt.status !== 'completed'
      || (targetApt.billingApproved === false && !billReviewed)
    ) return false;

    const collectedApt: Appointment = {
      ...targetApt,
      feeCollected: true,
      billingApproved: true,
      paymentMethod,
      paidAt: nowStr,
    };

    const updated = appointments.map((a) => (a.id === id ? collectedApt : a));
    setStored(STORAGE_KEYS.APPOINTMENTS, updated);

    // Automatically record revenue entry so it reflects to Admin & Manager in real-time
    if (!supabase) {
      const revenueItem: RevenueItem = {
        id: createRecordId('rev'),
        date: dateStr,
        time: timeStr,
        amount: collectedApt.feeAmount || 650,
        category: collectedApt.type === 'walk_in' ? 'Walk-in Registration' : 'Consultation Fee',
        patientName: collectedApt.patientName,
        patientId: collectedApt.patientId,
        paymentMethod,
        collectedBy,
        appointmentId: collectedApt.id,
      };
      store.addRevenue(revenueItem);
    }
    return true;
  },

  savePrescription: (
    appointmentId: string,
    prescriptionData: Omit<Prescription, 'id' | 'appointmentId'>,
    medicalCharges: MedicalCharge[] = []
  ): Prescription => {
    const appointments = store.getAppointments();
    const appointment = appointments.find((item) => item.id === appointmentId);
    const previousChargeTotal = appointment?.medicalCharges?.reduce((sum, charge) => sum + charge.amount, 0) || 0;
    const baseFee = Math.max(0, (appointment?.feeAmount || 650) - previousChargeTotal);
    const normalizedCharges = medicalCharges
      .filter((charge) => charge.name.trim() && Number.isFinite(charge.amount) && charge.amount > 0)
      .map((charge) => ({ name: charge.name.trim(), amount: Math.round(charge.amount * 100) / 100 }));
    const chargesChanged = JSON.stringify(appointment?.medicalCharges || []) !== JSON.stringify(normalizedCharges);
    const totalFee = baseFee + normalizedCharges.reduce((sum, charge) => sum + charge.amount, 0);
    const newRx: Prescription = {
      ...prescriptionData,
      id: createRecordId('rx'),
      appointmentId,
    };

    const updated = appointments.map((a) => {
      if (a.id === appointmentId) {
        return {
          ...a,
          status: 'completed' as Appointment['status'],
          prescription: newRx,
          medicalCharges: normalizedCharges,
          feeAmount: totalFee,
          billingApproved: chargesChanged ? false : appointment?.billingApproved ?? true,
        };
      }
      return a;
    });

    setStored(STORAGE_KEYS.APPOINTMENTS, updated);
    return newRx;
  },

  updateFollowUpStatus: (appointmentId: string, status: 'booked' | 'skipped') => {
    const appointments = store.getAppointments();
    const updated = appointments.map((a) =>
      a.id === appointmentId ? { ...a, followUpStatus: status } : a
    );
    setStored(STORAGE_KEYS.APPOINTMENTS, updated);
  },

  // ATTENDANCE
  getAttendance: (): AttendanceRecord[] =>
    getStored<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, INITIAL_ATTENDANCE),

  clockIn: (staffId: string, staffName: string, role: UserRole, customRoleTitle?: string, notes?: string, shift: StaffShiftAssignment = 'unassigned'): AttendanceRecord => {
    const records = store.getAttendance();
    const today = getHospitalDate();
    const now = new Date();

    // Do not allow overlapping active attendance or a duplicate attendance record on the same local date.
    const existingOpen = records
      .filter((record) => record.staffId === staffId && !record.clockOutAt && !record.clockOut)
      .sort((left, right) => String(right.clockInAt || '').localeCompare(String(left.clockInAt || '')))[0];
    if (existingOpen) return existingOpen;
    const existingToday = records.find((record) => record.staffId === staffId && record.date === today);
    if (existingToday) return existingToday;

    const shiftError = getShiftClockInError(shift, now);
    if (shiftError) throw new Error(shiftError);
    if (!isStaffShift(shift)) throw new Error('The General Shift must be assigned before clock-in.');
    const newRecord: AttendanceRecord = {
      id: createRecordId('att'),
      staffId,
      staffName,
      role,
      customRoleTitle,
      date: today,
      shift,
      shiftEndAt: getShiftEndTimestamp(shift, now),
      clockIn: getHospitalTime(now),
      clockInAt: now.toISOString(),
      hoursWorked: 0,
      status: 'present',
      notes: notes || 'Standard shift clock-in',
    };

    setStored(STORAGE_KEYS.ATTENDANCE, [newRecord, ...records]);
    return newRecord;
  },

  clockOut: (staffId: string, notes?: string): AttendanceRecord | null => {
    const records = store.getAttendance();
    const now = new Date();
    const active = records
      .filter((record) => record.staffId === staffId && !record.clockOutAt && !record.clockOut)
      .sort((left, right) => String(right.clockInAt || '').localeCompare(String(left.clockInAt || '')))[0];
    if (!active) return null;

    const clockInAt = parseAttendanceClockIn(active);
    if (!clockInAt || clockInAt > now) {
      const message = 'Could not calculate this shift duration from its clock-in time.';
      console.error(message, active);
      window.dispatchEvent(new CustomEvent('ihms:data-error', { detail: message }));
      return null;
    }

    // If checkout is delayed until after the scheduled end, never record more than the shift actually spans.
    const scheduledEnd = active.shiftEndAt ? new Date(active.shiftEndAt) : null;
    const effectiveClockOut = scheduledEnd && !Number.isNaN(scheduledEnd.getTime()) && scheduledEnd < now
      ? scheduledEnd
      : now;
    const updatedRecord: AttendanceRecord = {
      ...active,
      clockOut: getHospitalTime(effectiveClockOut),
      clockOutAt: effectiveClockOut.toISOString(),
      hoursWorked: calculateWorkingHours(clockInAt, effectiveClockOut, active.shift === 'general'),
      notes: notes ? `${active.notes || ''} | Out: ${notes}` : active.notes,
    };
    const updated = records.map((record) => record.id === active.id ? updatedRecord : record);
    setStored(STORAGE_KEYS.ATTENDANCE, updated);
    return updatedRecord;
  },

  // REVENUE
  getRevenue: (): RevenueItem[] =>
    getStored<RevenueItem[]>(STORAGE_KEYS.REVENUE, INITIAL_REVENUE),

  addRevenue: (item: Omit<RevenueItem, 'id'>): RevenueItem => {
    const list = store.getRevenue();
    const newItem: RevenueItem = {
      ...item,
      id: createRecordId('rev'),
    };
    setStored(STORAGE_KEYS.REVENUE, [newItem, ...list]);
    return newItem;
  },

  // EXPENSES
  getExpenses: (): ExpenseItem[] =>
    getStored<ExpenseItem[]>(STORAGE_KEYS.EXPENSES, INITIAL_EXPENSES),

  addExpense: (item: Omit<ExpenseItem, 'id'>): ExpenseItem => {
    const list = store.getExpenses();
    const newItem: ExpenseItem = {
      ...item,
      id: createRecordId('exp'),
    };
    setStored(STORAGE_KEYS.EXPENSES, [newItem, ...list]);
    return newItem;
  },

  // LEAVES
  getLeaves: (): LeaveRequest[] =>
    getStored<LeaveRequest[]>(STORAGE_KEYS.LEAVES, INITIAL_LEAVES),

  applyLeave: (leave: Omit<LeaveRequest, 'id' | 'status' | 'appliedAt'>): LeaveRequest => {
    const leaves = store.getLeaves();
    const newLeave: LeaveRequest = {
      ...leave,
      id: createRecordId('lv'),
      status: 'pending',
      appliedAt: getHospitalDateTime(),
    };
    setStored(STORAGE_KEYS.LEAVES, [newLeave, ...leaves]);
    return newLeave;
  },

  updateLeaveStatus: (
    id: string,
    status: 'approved' | 'rejected',
    reviewedBy: string
  ) => {
    const leaves = store.getLeaves();
    const updated = leaves.map((l) =>
      l.id === id ? { ...l, status, reviewedBy } : l
    );
    setStored(STORAGE_KEYS.LEAVES, updated);
  },

  // STATS CALCULATOR
  getStats: (): HospitalStats => {
    const users = store.getUsers();
    const appointments = store.getAppointments();
    const revenue = store.getRevenue();
    const expenses = store.getExpenses();
    const today = getHospitalDate();

    const patients = users.filter((u) => u.role === 'patient');
    const staff = users.filter((u) => u.role !== 'patient');
    const activeStaff = staff.filter((s) => s.status === 'active');

    const totalRev = revenue.reduce((sum, r) => sum + r.amount, 0);
    const totalExp = expenses.reduce((sum, e) => sum + e.amount, 0);

    const todayRev = revenue
      .filter((r) => r.date === today)
      .reduce((sum, r) => sum + r.amount, 0);

    const todayExp = expenses
      .filter((e) => e.date === today)
      .reduce((sum, e) => sum + e.amount, 0);

    const todayApts = appointments.filter((a) => a.date === today).length;

    return {
      totalPatients: patients.length,
      totalAppointments: appointments.length,
      totalRevenue: totalRev,
      totalExpense: totalExp,
      netIncome: totalRev - totalExp,
      staffCount: staff.length,
      activeStaffCount: activeStaff.length,
      todayAppointmentsCount: todayApts,
      todayRevenue: todayRev,
      todayExpense: todayExp,
    };
  },
};
