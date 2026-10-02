export type UserRole = 
  | 'admin' 
  | 'manager' 
  | 'doctor' 
  | 'receptionist' 
  | 'nurse' 
  | 'cleaner' 
  | 'ward_boy' 
  | 'other' 
  | 'patient';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  customRoleTitle?: string;
  password?: string;
  age?: number;
  gender?: 'Male' | 'Female' | 'Other';
  bloodGroup?: string;
  department?: string;
  specialty?: string;
  qualification?: string;
  isOnline: boolean;
  status: 'active' | 'on_leave' | 'inactive';
  avatar?: string;
  createdAt: string;
}

export interface Tablet {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface Prescription {
  id: string;
  appointmentId: string;
  doctorId: string;
  doctorName: string;
  doctorSpecialty?: string;
  patientId: string;
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  patientPhone?: string;
  patientEmail?: string;
  date: string;
  diagnosis: string;
  symptoms: string;
  tablets: Tablet[];
  thingsToAvoid: string[];
  followUpDate?: string;
  doctorNotes?: string;
}

export interface Appointment {
  id: string;
  tokenNumber: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  patientAge?: number;
  patientGender?: 'Male' | 'Female' | 'Other';
  doctorId: string;
  doctorName: string;
  department: string;
  date: string;
  timeSlot: string;
  type: 'online_booking' | 'walk_in' | 'follow_up';
  status: 'scheduled' | 'waiting' | 'in_consultation' | 'completed' | 'cancelled';
  reasonForVisit: string;
  feeCollected: boolean;
  feeAmount: number;
  paymentMethod?: 'Cash' | 'Card' | 'UPI';
  paidAt?: string;
  prescription?: Prescription;
  followUpStatus?: 'pending' | 'booked' | 'skipped';
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  staffId: string;
  staffName: string;
  role: UserRole;
  customRoleTitle?: string;
  date: string;
  clockIn: string;
  clockOut?: string;
  hoursWorked?: number;
  status: 'present' | 'half_day' | 'leave' | 'absent';
  notes?: string;
}

export interface RevenueItem {
  id: string;
  date: string;
  time: string;
  amount: number;
  category: 'Consultation Fee' | 'Walk-in Registration' | 'Diagnostic / Lab' | 'Pharmacy' | 'Emergency / Procedure';
  patientName: string;
  patientId?: string;
  paymentMethod: 'Cash' | 'Card' | 'UPI';
  collectedBy: string;
  appointmentId?: string;
}

export interface ExpenseItem {
  id: string;
  date: string;
  time: string;
  amount: number;
  category: 'Staff Payroll' | 'Medical Equipment' | 'Medicines & Supplies' | 'Maintenance & Repairs' | 'Utility Bills' | 'Sanitation & Hygiene' | 'Other';
  description: string;
  vendor?: string;
  approvedBy: string;
  status: 'paid' | 'pending';
}

export interface LeaveRequest {
  id: string;
  staffId: string;
  staffName: string;
  role: UserRole;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt: string;
  reviewedBy?: string;
}

export interface HospitalStats {
  totalPatients: number;
  totalAppointments: number;
  totalRevenue: number;
  totalExpense: number;
  netIncome: number;
  staffCount: number;
  activeStaffCount: number;
  todayAppointmentsCount: number;
  todayRevenue: number;
  todayExpense: number;
}
