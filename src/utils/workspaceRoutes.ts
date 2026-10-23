import type { User, UserRole } from '../types';

export type WorkspaceGroup = 'admin' | 'manager' | 'doctor' | 'receptionist' | 'staff' | 'patient';

export interface WorkspaceRoute {
  path: string;
  group: WorkspaceGroup;
  tab: string;
  label: string;
}

export const ADMIN_ROUTES = {
  overview: '/portal/admin/overview',
  revenue: '/portal/admin/revenue',
  expense: '/portal/admin/expenses',
  attendance: '/portal/admin/attendance',
  staff: '/portal/admin/staff',
  appointments: '/portal/admin/appointments',
} as const;

export const MANAGER_ROUTES = {
  eyes_on_staff: '/portal/manager/overview',
  attendance: '/portal/manager/attendance',
  staff_control: '/portal/manager/staff',
  leaves: '/portal/manager/leaves',
} as const;

export const DOCTOR_ROUTES = {
  now: '/portal/doctor/now',
  upcoming: '/portal/doctor/upcoming',
  completed: '/portal/doctor/completed',
} as const;

export const RECEPTIONIST_ROUTES = {
  queue: '/portal/receptionist/queue',
  fee_collection: '/portal/receptionist/fees',
  today_collection: '/portal/receptionist/collections',
  walk_in: '/portal/receptionist/walk-in',
  slot_checker: '/portal/receptionist/slots',
} as const;

export const STAFF_ROUTES = {
  attendance: '/portal/staff/attendance',
  leave: '/portal/staff/leaves',
} as const;

export const PATIENT_ROUTES = {
  history: '/portal/patient/history',
  book: '/portal/patient/book-appointment',
  follow_ups: '/portal/patient/follow-ups',
} as const;

const ROUTE_DEFINITIONS: WorkspaceRoute[] = [
  { path: ADMIN_ROUTES.overview, group: 'admin', tab: 'overview', label: 'Admin overview' },
  { path: ADMIN_ROUTES.revenue, group: 'admin', tab: 'revenue', label: 'Revenue' },
  { path: ADMIN_ROUTES.expense, group: 'admin', tab: 'expense', label: 'Expenses' },
  { path: ADMIN_ROUTES.attendance, group: 'admin', tab: 'attendance', label: 'Attendance' },
  { path: ADMIN_ROUTES.staff, group: 'admin', tab: 'staff', label: 'Staff management' },
  { path: ADMIN_ROUTES.appointments, group: 'admin', tab: 'appointments', label: 'Appointments' },
  { path: MANAGER_ROUTES.eyes_on_staff, group: 'manager', tab: 'eyes_on_staff', label: 'Operations overview' },
  { path: MANAGER_ROUTES.attendance, group: 'manager', tab: 'attendance', label: 'Attendance' },
  { path: MANAGER_ROUTES.staff_control, group: 'manager', tab: 'staff_control', label: 'Staff management' },
  { path: MANAGER_ROUTES.leaves, group: 'manager', tab: 'leaves', label: 'Leave requests' },
  { path: DOCTOR_ROUTES.now, group: 'doctor', tab: 'now', label: 'Current queue' },
  { path: DOCTOR_ROUTES.upcoming, group: 'doctor', tab: 'upcoming', label: 'Upcoming appointments' },
  { path: DOCTOR_ROUTES.completed, group: 'doctor', tab: 'completed', label: 'Completed consultations' },
  { path: RECEPTIONIST_ROUTES.queue, group: 'receptionist', tab: 'queue', label: 'Appointment queue' },
  { path: RECEPTIONIST_ROUTES.fee_collection, group: 'receptionist', tab: 'fee_collection', label: 'Fee collection' },
  { path: RECEPTIONIST_ROUTES.today_collection, group: 'receptionist', tab: 'today_collection', label: 'Daily collections' },
  { path: RECEPTIONIST_ROUTES.walk_in, group: 'receptionist', tab: 'walk_in', label: 'Walk-in patients' },
  { path: RECEPTIONIST_ROUTES.slot_checker, group: 'receptionist', tab: 'slot_checker', label: 'Slot availability' },
  { path: STAFF_ROUTES.attendance, group: 'staff', tab: 'attendance', label: 'My attendance' },
  { path: STAFF_ROUTES.leave, group: 'staff', tab: 'leave', label: 'My leave requests' },
  { path: PATIENT_ROUTES.history, group: 'patient', tab: 'history', label: 'Appointment history' },
  { path: PATIENT_ROUTES.book, group: 'patient', tab: 'book', label: 'Book appointment' },
  { path: PATIENT_ROUTES.follow_ups, group: 'patient', tab: 'follow_ups', label: 'Follow-ups' },
];

const ROUTE_BY_PATH = new Map(ROUTE_DEFINITIONS.map((route) => [route.path, route]));
const STAFF_ROLES: ReadonlySet<UserRole> = new Set(['nurse', 'cleaner', 'ward_boy', 'other']);

export function getWorkspaceRoute(pathname: string): WorkspaceRoute | null {
  // Routes are path-only and exact-match; query strings never influence authorization.
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return ROUTE_BY_PATH.get(normalized) || null;
}

export function canAccessWorkspaceRoute(user: Pick<User, 'role'> | null | undefined, route: WorkspaceRoute | null): boolean {
  if (!user || !route) return false;
  if (route.group === 'staff') return STAFF_ROLES.has(user.role);
  return user.role === route.group;
}

export function defaultWorkspacePath(user: Pick<User, 'role'>): string {
  switch (user.role) {
    case 'admin': return ADMIN_ROUTES.overview;
    case 'manager': return MANAGER_ROUTES.eyes_on_staff;
    case 'doctor': return DOCTOR_ROUTES.now;
    case 'receptionist': return RECEPTIONIST_ROUTES.queue;
    case 'patient': return PATIENT_ROUTES.history;
    case 'nurse':
    case 'cleaner':
    case 'ward_boy':
    case 'other': return STAFF_ROUTES.attendance;
  }
}

export function getAuthorizedDestination(
  intendedPath: string | null | undefined,
  user: Pick<User, 'role'>,
): string {
  if (intendedPath && intendedPath.startsWith('/') && !intendedPath.startsWith('//')) {
    const route = getWorkspaceRoute(intendedPath);
    if (route && canAccessWorkspaceRoute(user, route)) return route.path;
  }
  return defaultWorkspacePath(user);
}

export function navigateTo(path: string, replace = false): void {
  // This navigation helper deliberately accepts only same-origin absolute paths.
  if (!path.startsWith('/') || path.startsWith('//')) return;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === path) {
    window.dispatchEvent(new PopStateEvent('popstate'));
    return;
  }
  if (replace) window.history.replaceState({}, '', path);
  else window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function workspaceRoutesForTests(): readonly WorkspaceRoute[] {
  return ROUTE_DEFINITIONS;
}
