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
} from './mockData';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
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
const listeners = new Set<Listener>();
let loadingSharedData = false;
let sharedWriteQueue: Promise<void> = Promise.resolve();
let sharedDataRefresher: (() => Promise<void>) | null = null;
let sharedChannel: RealtimeChannel | null = null;
let sharedChannelUsers = 0;
const sharedWriteErrors: string[] = [];

const SHARED_DATASETS: Record<string, string> = {
  [STORAGE_KEYS.APPOINTMENTS]: 'appointments',
  [STORAGE_KEYS.ATTENDANCE]: 'attendance',
  [STORAGE_KEYS.REVENUE]: 'revenue',
  [STORAGE_KEYS.EXPENSES]: 'expenses',
  [STORAGE_KEYS.LEAVES]: 'leaves',
};

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Local Storage helpers with fallback
function getStored<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (err) {
    console.error(`Error loading ${key}:`, err);
    return fallback;
  }
}

function setStored<T>(key: string, value: T): void {
  try {
    const previous = localStorage.getItem(key);
    localStorage.setItem(key, JSON.stringify(value));
    notify();
    const dataset = SHARED_DATASETS[key];
    if (dataset && supabase && !loadingSharedData) {
      const actorId = getStored<User | null>(STORAGE_KEYS.CURRENT_USER, null)?.id;
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
  actorId: string | undefined
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
      if (dataset === 'appointments') {
        const prescriptions = changed
          .filter((record) =>
            record.prescription
            && JSON.stringify(previousById.get(String(record.id))?.prescription)
              !== JSON.stringify(record.prescription)
          )
          .map((record) => ({
            appointment_id: String(record.id),
            patient_id: String(record.patientId),
            doctor_id: String(record.doctorId),
            payload: record.prescription,
          }));
        if (prescriptions.length) {
          const { error } = await client.from('ihms_prescriptions').upsert(prescriptions, {
            onConflict: 'appointment_id',
          });
          if (error) throw error;
        }
        const removedPrescriptions = changed
          .filter((record) => !record.prescription && previousById.get(String(record.id))?.prescription)
          .map((record) => String(record.id));
        if (removedPrescriptions.length) {
          const { error } = await client
            .from('ihms_prescriptions')
            .delete()
            .in('appointment_id', removedPrescriptions);
          if (error) throw error;
        }
      }
      if (changed.length) {
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
        if (updated.length) {
          await Promise.all(updated.map(async (record) => {
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
    localStorage.setItem(key, JSON.stringify(value));
}

export function clearSharedStore(): void {
  sharedDataRefresher = null;
    for (const key of [STORAGE_KEYS.USERS, STORAGE_KEYS.CURRENT_USER, ...Object.keys(SHARED_DATASETS)]) {
      localStorage.removeItem(key);
    }
    notify();
}

export async function initializeSharedStore(): Promise<() => void> {
    if (!supabase) return () => undefined;

    const client = supabase;
    const refresh = async () => {
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        clearSharedStore();
        return;
      }

      const [recordsResult, profilesResult, prescriptionsResult] = await Promise.all([
        client.from('ihms_records').select('record_type,record_id,payload'),
        client.from('profiles').select('id,name,email,phone,role,details,created_at'),
        client.from('ihms_prescriptions').select('appointment_id,payload'),
      ]);
      if (recordsResult.error) throw recordsResult.error;
      if (profilesResult.error) throw profilesResult.error;
      if (prescriptionsResult.error) throw prescriptionsResult.error;

      const users: User[] = (profilesResult.data || []).map((profile) => ({
        ...(profile.details as Partial<User>),
        id: profile.id,
        name: getUserDisplayName(profile.name, profile.email, profile.role as UserRole),
        email: profile.email,
        phone: profile.phone,
        role: profile.role as UserRole,
        isOnline: false,
        status: (profile.details as Partial<User>).status || 'active',
        createdAt: profile.created_at,
      }));
      const rows = recordsResult.data || [];
      const datasets: Array<[string, string]> = [
        [STORAGE_KEYS.APPOINTMENTS, 'appointments'],
        [STORAGE_KEYS.ATTENDANCE, 'attendance'],
        [STORAGE_KEYS.REVENUE, 'revenue'],
        [STORAGE_KEYS.EXPENSES, 'expenses'],
        [STORAGE_KEYS.LEAVES, 'leaves'],
      ];

      loadingSharedData = true;
      try {
        saveHydratedData(STORAGE_KEYS.USERS, users);
        for (const [key, dataset] of datasets) {
          let records = rows
            .filter((row) => row.record_type === dataset)
            .map((row) => row.payload);
          if (dataset === 'appointments') {
            const prescriptions = new Map(
              (prescriptionsResult.data || []).map((row) => [row.appointment_id, row.payload])
            );
            records = records.map((record) => ({
              ...(record as Record<string, unknown>),
              ...(prescriptions.has(String((record as Record<string, unknown>).id))
                ? { prescription: prescriptions.get(String((record as Record<string, unknown>).id)) }
                : {}),
            }));
          }
          saveHydratedData(key, records);
        }
      } finally {
        loadingSharedData = false;
      }
      notify();
    };

    sharedDataRefresher = refresh;
    await refresh();
    if (!sharedChannel) {
      const channel = client.channel(createRecordId('ihms-shared-records'));
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ihms_records' }, () => {
          void refresh().catch((error: unknown) => {
            console.error('Unable to refresh shared hospital data:', error);
            window.dispatchEvent(new CustomEvent('ihms:data-error', {
              detail: 'Could not refresh shared hospital data. Reload the page and try again.',
            }));
          });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ihms_prescriptions' }, () => {
          void refresh().catch((error: unknown) => {
            console.error('Unable to refresh prescriptions:', error);
            window.dispatchEvent(new CustomEvent('ihms:data-error', {
              detail: 'Could not refresh shared prescriptions. Reload the page and try again.',
            }));
          });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
          void refresh().catch((error: unknown) => console.error('Unable to refresh profiles:', error));
        });
      sharedChannel = channel;
      channel.subscribe();
    }
    sharedChannelUsers += 1;

    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      sharedChannelUsers -= 1;
      if (sharedChannelUsers === 0 && sharedChannel) {
        const channelToRemove = sharedChannel;
        sharedChannel = null;
        void client.removeChannel(channelToRemove);
      }
    };
}

// Store API
export const store = {
  subscribe: (listener: Listener) => subscribe(listener),
  flushPendingWrites: async () => {
    await sharedWriteQueue;
    if (sharedWriteErrors.length) {
      throw new Error(sharedWriteErrors.splice(0).join(' '));
    }
  },

  // Reset all to fresh mock data
  resetAll: () => {
    localStorage.removeItem(STORAGE_KEYS.USERS);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    localStorage.removeItem(STORAGE_KEYS.APPOINTMENTS);
    localStorage.removeItem(STORAGE_KEYS.ATTENDANCE);
    localStorage.removeItem(STORAGE_KEYS.REVENUE);
    localStorage.removeItem(STORAGE_KEYS.EXPENSES);
    localStorage.removeItem(STORAGE_KEYS.LEAVES);
    notify();
  },

  // USERS
  getUsers: (): User[] => getStored<User[]>(STORAGE_KEYS.USERS, INITIAL_USERS),

  getCurrentUser: (): User | null => {
    const currentUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (currentUser !== null) {
      try {
        return JSON.parse(currentUser) as User | null;
      } catch (err) {
        console.error('Error loading current user:', err);
        return null;
      }
    }
    // Default to admin for convenience
    const users = store.getUsers();
    return users.find((u) => u.role === 'admin') || users[0];
  },

  setCurrentUser: (user: User | null) => {
    setStored(STORAGE_KEYS.CURRENT_USER, user);
  },

  addUser: (userData: Omit<User, 'id' | 'createdAt' | 'isOnline'>): User => {
    const users = store.getUsers();
    const newUser: User = {
      ...userData,
      id: createRecordId('u'),
      createdAt: new Date().toISOString().split('T')[0],
      isOnline: false,
      status: userData.status || 'active',
      password: userData.password || userData.email, // default password is email as requested
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
      setStored(STORAGE_KEYS.CURRENT_USER, { ...current, ...updates });
    }
  },

  deleteUser: (id: string) => {
    const users = store.getUsers();
    const updated = users.filter((u) => u.id !== id);
    setStored(STORAGE_KEYS.USERS, updated);
  },

  changePassword: (userId: string, newPassword: string):boolean => {
    const users = store.getUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx !== -1) {
      users[idx].password = newPassword;
      setStored(STORAGE_KEYS.USERS, users);
      const current = store.getCurrentUser();
      if (current && current.id === userId) {
        setStored(STORAGE_KEYS.CURRENT_USER, { ...current, password: newPassword });
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
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
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
    collectedBy: string
  ) => {
    const appointments = store.getAppointments();
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const targetApt = appointments.find((a) => a.id === id);
    if (!targetApt) return;

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
    const revenueItem: RevenueItem = {
      id: `rev-${Date.now().toString(36)}`,
      date: dateStr,
      time: timeStr,
      amount: collectedApt.feeAmount || 650,
      category: (collectedApt.type === 'walk_in' ? 'Walk-in Registration' : 'Consultation Fee') as RevenueItem['category'],
      patientName: collectedApt.patientName,
      patientId: collectedApt.patientId,
      paymentMethod,
      collectedBy,
      appointmentId: collectedApt.id,
    };
    store.addRevenue(revenueItem);
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

  clockIn: (staffId: string, staffName: string, role: UserRole, customRoleTitle?: string, notes?: string): AttendanceRecord => {
    const records = store.getAttendance();
    const today = new Date().toISOString().split('T')[0];
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Check if already clocked in today
    const existing = records.find((r) => r.staffId === staffId && r.date === today);
    if (existing) {
      return existing;
    }

    const newRecord: AttendanceRecord = {
      id: createRecordId('att'),
      staffId,
      staffName,
      role,
      customRoleTitle,
      date: today,
      clockIn: timeNow,
      clockInAt: new Date().toISOString(),
      hoursWorked: 0,
      status: 'present',
      notes: notes || 'Standard shift clock-in',
    };

    setStored(STORAGE_KEYS.ATTENDANCE, [newRecord, ...records]);
    return newRecord;
  },

  clockOut: (staffId: string, notes?: string): AttendanceRecord | null => {
    const records = store.getAttendance();
    const today = new Date().toISOString().split('T')[0];
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const clockOutAt = new Date();

    let updatedRecord: AttendanceRecord | null = null;
    const updated = records.map((r) => {
      if (r.staffId === staffId && r.date === today && !r.clockOut) {
        const clockInAt = parseAttendanceClockIn(r);
        if (!clockInAt || clockInAt > clockOutAt) {
          const message = 'Could not calculate this shift duration from its clock-in time.';
          console.error(message, r);
          window.dispatchEvent(new CustomEvent('ihms:data-error', { detail: message }));
          return r;
        }
        updatedRecord = {
          ...r,
          clockOut: timeNow,
          clockOutAt: clockOutAt.toISOString(),
          hoursWorked: Math.round((clockOutAt.getTime() - clockInAt.getTime()) / 36_000) / 100,
          notes: notes ? `${r.notes || ''} | Out: ${notes}` : r.notes,
        };
        return updatedRecord;
      }
      return r;
    });

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
      appliedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
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
    const today = new Date().toISOString().split('T')[0];

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
