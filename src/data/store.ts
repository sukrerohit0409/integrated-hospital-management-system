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
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_APPOINTMENTS,
  INITIAL_ATTENDANCE,
  INITIAL_REVENUE,
  INITIAL_EXPENSES,
  INITIAL_LEAVES,
} from './mockData';

const STORAGE_KEYS = {
  USERS: 'ihms_users',
  CURRENT_USER: 'ihms_current_user',
  APPOINTMENTS: 'ihms_appointments',
  ATTENDANCE: 'ihms_attendance',
  REVENUE: 'ihms_revenue',
  EXPENSES: 'ihms_expenses',
  LEAVES: 'ihms_leaves',
};

const SYNCED_COLLECTIONS = [
  STORAGE_KEYS.USERS,
  STORAGE_KEYS.APPOINTMENTS,
  STORAGE_KEYS.ATTENDANCE,
  STORAGE_KEYS.REVENUE,
  STORAGE_KEYS.EXPENSES,
  STORAGE_KEYS.LEAVES,
] as const;

const SHARED_DATA_ENABLED = import.meta.env.VITE_SHARED_DEMO_DATA === 'true';

type SharedRecord = {
  collection: string;
  record_id: string;
  data: { id: string };
  updated_at: string;
};

let pendingSyncWrites = 0;
let refreshInProgress = false;
let sharedDataError: string | null = null;
let syncWriteQueue: Promise<void> = Promise.resolve();

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

function setSharedDataError(message: string | null): void {
  sharedDataError = message;
  notify();
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

    if (SHARED_DATA_ENABLED && SYNCED_COLLECTIONS.includes(key as typeof SYNCED_COLLECTIONS[number])) {
      const oldRecords = previous ? JSON.parse(previous) as { id: string }[] : [];
      const newRecords = Array.isArray(value) ? value as { id: string }[] : [];
      const oldById = new Map(oldRecords.map((record) => [record.id, JSON.stringify(record)]));
      const newIds = new Set(newRecords.map((record) => record.id));
      const changedRecords = newRecords.filter(
        (record) => oldById.get(record.id) !== JSON.stringify(record),
      );
      const deletedIds = oldRecords
        .filter((record) => !newIds.has(record.id))
        .map((record) => record.id);

      if (changedRecords.length > 0 || deletedIds.length > 0) {
        queueSharedUpdate(key, changedRecords, deletedIds);
      }
    }
  } catch (err) {
    console.error(`Error saving ${key}:`, err);
  }
}

async function loadSharedRecords(): Promise<SharedRecord[]> {
  const response = await fetch('/api/demo-state');
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Shared-data load failed (${response.status}).`);
  }
  return response.json() as Promise<SharedRecord[]>;
}

function setLocalCollection(key: string, records: { id: string }[]): void {
  localStorage.setItem(key, JSON.stringify(records));
}

function queueSharedUpdate(
  collection: string,
  records: { id: string }[],
  deletedIds: string[],
): void {
  pendingSyncWrites += 1;
  syncWriteQueue = syncWriteQueue
    .then(async () => {
      const response = await fetch('/api/demo-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection, records, deletedIds }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Shared-data update failed (${response.status}).`);
      }
      setSharedDataError(null);
    })
    .catch((error: unknown) => {
      console.error(`Could not sync ${collection} with the shared database:`, error);
      setSharedDataError(
        error instanceof Error
          ? error.message
          : `Could not sync ${collection} with the shared database.`,
      );
    })
    .finally(() => {
      pendingSyncWrites -= 1;
    });
}

async function refreshSharedData(seedMissingCollections: boolean): Promise<void> {
  if (!SHARED_DATA_ENABLED || refreshInProgress || pendingSyncWrites > 0) return;
  refreshInProgress = true;

  try {
    const remoteRecords = await loadSharedRecords();
    if (pendingSyncWrites > 0) return;
    const grouped = new Map<string, SharedRecord[]>();
    for (const key of SYNCED_COLLECTIONS) grouped.set(key, []);
    for (const record of remoteRecords) {
      grouped.get(record.collection)?.push(record);
    }

    const initialized = remoteRecords.some((record) => record.collection === 'ihms_settings');
    for (const key of SYNCED_COLLECTIONS) {
      const records = grouped.get(key) || [];
      if (records.length === 0 && seedMissingCollections && !initialized) {
        const fallback = getStored(key, getInitialCollection(key));
        setLocalCollection(key, fallback);
        await fetch('/api/demo-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            collection: key,
            records: fallback,
            deletedIds: [],
          }),
        }).then(async (response) => {
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `Could not initialize ${key} (${response.status}).`);
          }
        });
      } else {
        setLocalCollection(
          key,
          records.map((record) => record.data),
        );
      }
    }

    if (!initialized) {
      const response = await fetch('/api/demo-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection: 'ihms_settings',
          records: [{ id: 'initialized' }],
          deletedIds: [],
        }),
      });
      if (!response.ok) throw new Error('Could not mark shared demo data as initialized.');
    }

    setSharedDataError(null);
    notify();
  } finally {
    refreshInProgress = false;
  }
}

function getInitialCollection(key: string): { id: string }[] {
  switch (key) {
    case STORAGE_KEYS.USERS: return INITIAL_USERS;
    case STORAGE_KEYS.APPOINTMENTS: return INITIAL_APPOINTMENTS;
    case STORAGE_KEYS.ATTENDANCE: return INITIAL_ATTENDANCE;
    case STORAGE_KEYS.REVENUE: return INITIAL_REVENUE;
    case STORAGE_KEYS.EXPENSES: return INITIAL_EXPENSES;
    case STORAGE_KEYS.LEAVES: return INITIAL_LEAVES;
    default: return [];
  }
}

// Store API
export const store = {
  subscribe: (listener: Listener) => subscribe(listener),
  getSyncError: () => sharedDataError,

  initialize: async () => {
    if (!SHARED_DATA_ENABLED) return;
    await refreshSharedData(true);
    window.setInterval(() => {
      void refreshSharedData(false).catch((error: unknown) => {
        console.error('Could not refresh shared demo data:', error);
        setSharedDataError(
          error instanceof Error ? error.message : 'Could not refresh shared demo data.',
        );
      });
    }, 4000);
  },

  // Reset all to fresh mock data
  resetAll: () => {
    setStored(STORAGE_KEYS.USERS, INITIAL_USERS);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    setStored(STORAGE_KEYS.APPOINTMENTS, INITIAL_APPOINTMENTS);
    setStored(STORAGE_KEYS.ATTENDANCE, INITIAL_ATTENDANCE);
    setStored(STORAGE_KEYS.REVENUE, INITIAL_REVENUE);
    setStored(STORAGE_KEYS.EXPENSES, INITIAL_EXPENSES);
    setStored(STORAGE_KEYS.LEAVES, INITIAL_LEAVES);
  },

  // USERS
  getUsers: (): User[] => getStored<User[]>(STORAGE_KEYS.USERS, INITIAL_USERS),

  getCurrentUser: (): User | null =>
    getStored<User | null>(STORAGE_KEYS.CURRENT_USER, null),

  setCurrentUser: (user: User | null) => {
    setStored(STORAGE_KEYS.CURRENT_USER, user);
  },

  addUser: (userData: Omit<User, 'id' | 'createdAt' | 'isOnline'>): User => {
    const users = store.getUsers();
    const newUser: User = {
      ...userData,
      id: `u-${Date.now().toString(36)}`,
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
    const countToday = appointments.length + 1;
    const newApt: Appointment = {
      ...apt,
      id: `apt-${Date.now().toString(36)}`,
      tokenNumber: `T-${100 + countToday}`,
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
    prescriptionData: Omit<Prescription, 'id' | 'appointmentId'>
  ): Prescription => {
    const appointments = store.getAppointments();
    const newRx: Prescription = {
      ...prescriptionData,
      id: `rx-${Date.now().toString(36)}`,
      appointmentId,
    };

    const updated = appointments.map((a) => {
      if (a.id === appointmentId) {
        return {
          ...a,
          status: 'completed' as Appointment['status'],
          prescription: newRx,
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
      id: `att-${Date.now().toString(36)}`,
      staffId,
      staffName,
      role,
      customRoleTitle,
      date: today,
      clockIn: timeNow,
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

    let updatedRecord: AttendanceRecord | null = null;
    const updated = records.map((r) => {
      if (r.staffId === staffId && r.date === today && !r.clockOut) {
        // Calculate rough hours
        const diffHours = 7.5; // realistic full/partial shift calculated
        updatedRecord = {
          ...r,
          clockOut: timeNow,
          hoursWorked: r.hoursWorked && r.hoursWorked > 0 ? r.hoursWorked : diffHours,
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
      id: `rev-${Date.now().toString(36)}`,
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
      id: `exp-${Date.now().toString(36)}`,
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
      id: `lv-${Date.now().toString(36)}`,
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
