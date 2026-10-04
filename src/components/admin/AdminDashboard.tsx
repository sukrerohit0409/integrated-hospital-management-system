import React, { useState, useMemo } from 'react';
import { User, Appointment, AttendanceRecord, RevenueItem, ExpenseItem, UserRole } from '../../types';
import { store } from '../../data/store';
import { manageStaffAccount } from '../../data/staffAccounts';
import { supabase } from '../../lib/supabase';
import { getUserDisplayName, getUserInitials } from '../../utils/userDisplay';
import { addCalendarDays, getHospitalDate, getHospitalTime } from '../../utils/hospitalDate';
import { 
  IndianRupee, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Calendar, 
  Clock, 
  UserPlus, 
  Trash2, 
  Filter, 
  Search, 
  PlusCircle, 
  CheckCircle2, 
  AlertCircle, 
  CreditCard,
  Building,
  ShieldCheck,
  FileSpreadsheet
} from 'lucide-react';

interface AdminDashboardProps {
  currentUser: User;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'revenue' | 'expense' | 'attendance' | 'staff' | 'appointments'>('overview');
  
  // State from store
  const [users, setUsers] = useState<User[]>(() => store.getUsers());
  const [appointments, setAppointments] = useState<Appointment[]>(() => store.getAppointments());
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => store.getAttendance());
  const [revenue, setRevenue] = useState<RevenueItem[]>(() => store.getRevenue());
  const [expenses, setExpenses] = useState<ExpenseItem[]>(() => store.getExpenses());

  // Filters for Revenue and Expense
  const [revFilter, setRevFilter] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('month');
  const [revStartDate, setRevStartDate] = useState('');
  const [revEndDate, setRevEndDate] = useState('');

  const [expFilter, setExpFilter] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('month');
  const [expStartDate, setExpStartDate] = useState('');
  const [expEndDate, setExpEndDate] = useState('');

  // Staff Search & Attendance Filters
  const [staffSearch, setStaffSearch] = useState('');
  const [attendanceDateFilter, setAttendanceDateFilter] = useState('');
  const [attendanceRoleFilter, setAttendanceRoleFilter] = useState<string>('all');

  // Modals
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);

  // New Staff Form
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<UserRole>('nurse');
  const [customRoleTitle, setCustomRoleTitle] = useState('');
  const [newStaffDept, setNewStaffDept] = useState('Nursing & Emergency');
  const [newStaffAge, setNewStaffAge] = useState('28');
  const [newStaffGender, setNewStaffGender] = useState<'Male' | 'Female' | 'Other'>('Female');

  // New Expense Form
  const [expCategory, setExpCategory] = useState<ExpenseItem['category']>('Medicines & Supplies');
  const [expAmount, setExpAmount] = useState('');
  const [expDescription, setExpDescription] = useState('');
  const [expVendor, setExpVendor] = useState('');

  // Re-sync on store changes
  React.useEffect(() => {
    return store.subscribe ? store.subscribe(() => {
      setUsers(store.getUsers());
      setAppointments(store.getAppointments());
      setAttendance(store.getAttendance());
      setRevenue(store.getRevenue());
      setExpenses(store.getExpenses());
    }) : undefined;
  }, []);

  const todayStr = getHospitalDate();
  const weekStartStr = addCalendarDays(todayStr, -6);

  // Revenue filtering logic
  const filteredRevenue = useMemo(() => {
    return revenue.filter((item) => {
      const itemDate = item.date;
      if (revFilter === 'today') {
        return itemDate === todayStr;
      }
      if (revFilter === 'week') {
        // Last 7 days
        return itemDate >= weekStartStr && itemDate <= todayStr;
      }
      if (revFilter === 'month') {
        // Current month (October)
        return itemDate.startsWith(todayStr.slice(0, 7));
      }
      if (revFilter === 'year') {
        return itemDate.startsWith(todayStr.slice(0, 4));
      }
      if (revFilter === 'custom') {
        if (revStartDate && itemDate < revStartDate) return false;
        if (revEndDate && itemDate > revEndDate) return false;
        return true;
      }
      return true;
    });
  }, [revenue, revFilter, revStartDate, revEndDate, todayStr, weekStartStr]);

  const totalFilteredRevenue = filteredRevenue.reduce((acc, cur) => acc + cur.amount, 0);

  // Revenue Breakdown by Method
  const revByMethod = useMemo(() => {
    const res = { Cash: 0, Card: 0, UPI: 0 };
    filteredRevenue.forEach((r) => {
      if (res[r.paymentMethod] !== undefined) {
        res[r.paymentMethod] += r.amount;
      }
    });
    return res;
  }, [filteredRevenue]);

  // Revenue Breakdown by Category
  const revByCategory = useMemo(() => {
    const res: Record<string, number> = {};
    filteredRevenue.forEach((r) => {
      res[r.category] = (res[r.category] || 0) + r.amount;
    });
    return res;
  }, [filteredRevenue]);

  // Expense filtering logic
  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => {
      const itemDate = item.date;
      if (expFilter === 'today') {
        return itemDate === todayStr;
      }
      if (expFilter === 'week') {
        return itemDate >= weekStartStr && itemDate <= todayStr;
      }
      if (expFilter === 'month') {
        return itemDate.startsWith(todayStr.slice(0, 7));
      }
      if (expFilter === 'year') {
        return itemDate.startsWith(todayStr.slice(0, 4));
      }
      if (expFilter === 'custom') {
        if (expStartDate && itemDate < expStartDate) return false;
        if (expEndDate && itemDate > expEndDate) return false;
        return true;
      }
      return true;
    });
  }, [expenses, expFilter, expStartDate, expEndDate, todayStr, weekStartStr]);

  const totalFilteredExpense = filteredExpenses.reduce((acc, cur) => acc + cur.amount, 0);

  // Expense Category Breakdown
  const expByCategory = useMemo(() => {
    const res: Record<string, number> = {};
    filteredExpenses.forEach((e) => {
      res[e.category] = (res[e.category] || 0) + e.amount;
    });
    return res;
  }, [filteredExpenses]);

  // Overall calculations
  const patientsCount = users.filter((u) => u.role === 'patient').length;
  const staffMembers = users.filter((u) => u.role !== 'patient');
  const totalAppointmentsCount = appointments.length;

  // Staff Working Hours & Days Aggregation
  const staffHoursMap = useMemo(() => {
    const map: Record<string, { totalHours: number; daysWorked: number; latestDate: string }> = {};
    attendance.forEach((att) => {
      if (!map[att.staffId]) {
        map[att.staffId] = { totalHours: 0, daysWorked: 0, latestDate: att.date };
      }
      map[att.staffId].totalHours += att.hoursWorked || 0;
      map[att.staffId].daysWorked += 1;
      if (att.date > map[att.staffId].latestDate) {
        map[att.staffId].latestDate = att.date;
      }
    });
    return map;
  }, [attendance]);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName || !newStaffEmail || !newStaffPhone) return;

    try {
      if (supabase) {
        await manageStaffAccount({
          action: 'invite',
          name: newStaffName,
          email: newStaffEmail,
          phone: newStaffPhone,
          role: newStaffRole,
          customRoleTitle: newStaffRole === 'other' ? customRoleTitle : undefined,
          department: newStaffDept,
          age: parseInt(newStaffAge, 10) || 30,
          gender: newStaffGender,
        });
      } else {
        store.addUser({
          name: newStaffName,
          email: newStaffEmail,
          phone: newStaffPhone,
          role: newStaffRole,
          customRoleTitle: newStaffRole === 'other' ? customRoleTitle : undefined,
          department: newStaffDept,
          age: parseInt(newStaffAge, 10) || 30,
          gender: newStaffGender,
          status: 'active',
          password: newStaffEmail,
        });
      }
    } catch (error) {
      console.error('Could not create staff account:', error);
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: error instanceof Error ? error.message : 'Could not create the staff account.',
      }));
      return;
    }

    setShowAddStaffModal(false);
    setNewStaffName('');
    setNewStaffEmail('');
    setNewStaffPhone('');
    setCustomRoleTitle('');
  };

  const handleDeleteStaff = (id: string, name: string) => {
    if (confirm(`Are you sure you want to remove staff member: ${name}?`)) {
      if (supabase) {
        void manageStaffAccount({ action: 'remove', id }).catch((error: unknown) => {
          console.error('Could not remove staff account:', error);
          window.dispatchEvent(new CustomEvent('ihms:data-error', {
            detail: error instanceof Error ? error.message : 'Could not remove the staff account.',
          }));
        });
      } else {
        store.deleteUser(id);
      }
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(expAmount);
    if (!Number.isFinite(amt) || amt <= 0 || !expDescription.trim()) {
      const message = 'Enter a positive expense amount and a description.';
      if (supabase) {
        window.dispatchEvent(new CustomEvent('ihms:data-error', { detail: message }));
      } else {
        window.alert(message);
      }
      return;
    }

    store.addExpense({
      date: todayStr,
      time: getHospitalTime(),
      amount: amt,
      category: expCategory,
      description: expDescription,
      vendor: expVendor || 'Authorized Vendor',
      approvedBy: currentUser.name,
      status: 'paid',
    });

    try {
      await store.flushPendingWrites();
    } catch (error) {
      console.error('Expense did not reach the shared database:', error);
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: error instanceof Error ? error.message : 'Expense could not be saved.',
      }));
      return;
    }
    setShowAddExpenseModal(false);
    setExpAmount('');
    setExpDescription('');
    setExpVendor('');
  };

  return (
    <div className="space-y-6">
      {/* Admin Title and Sub-Tabs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Admin Master Control Panel
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold">
              Root Authority
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Full governance of hospital finances, staff attendance & hours calculation, workforce roles, and clinical volume.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto w-full md:w-auto shrink-0">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeTab === 'overview'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('revenue')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeTab === 'revenue'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Revenue Tracking
          </button>
          <button
            onClick={() => setActiveTab('expense')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeTab === 'expense'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Expense Tracking
          </button>
          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeTab === 'attendance'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Staff Attendance & Hours
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeTab === 'staff'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Staff & Roles Control
          </button>
          <button
            onClick={() => setActiveTab('appointments')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeTab === 'appointments'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Patients & Appointments ({totalAppointmentsCount})
          </button>
        </div>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Total Hospital Revenue</span>
                <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600">
                  <IndianRupee className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold font-mono text-slate-900 mt-2 tabular-nums">
                ₹{store.getStats().totalRevenue.toLocaleString()}
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
                <span className="text-emerald-700 font-semibold">Today: ₹{store.getStats().todayRevenue.toLocaleString()}</span>
                <span>·</span>
                <span>{revenue.length} transactions</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Total Hospital Expenses</span>
                <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
                  <TrendingDown className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold font-mono text-slate-900 mt-2 tabular-nums">
                ₹{store.getStats().totalExpense.toLocaleString()}
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
                <span className="text-rose-700 font-semibold">Today: ₹{store.getStats().todayExpense.toLocaleString()}</span>
                <span>·</span>
                <span>Net: ₹{store.getStats().netIncome.toLocaleString()}</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Registered Patients</span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold font-mono text-slate-900 mt-2 tabular-nums">
                {patientsCount}
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
                <span>Active patient profiles on IHMS</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Appointments Booked</span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold font-mono text-slate-900 mt-2 tabular-nums">
                {totalAppointmentsCount}
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
                <span className="text-amber-700 font-semibold">
                  {appointments.filter((a) => a.date === todayStr).length} Today
                </span>
                <span>·</span>
                <span>Staff: {staffMembers.length} active</span>
              </div>
            </div>
          </div>

          {/* Quick Shortcuts & Live Activity Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Today's Clinical Queue Status */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Today's Appointment Queue Status</h3>
                  <p className="text-xs text-slate-500">Real-time patient flow across chambers</p>
                </div>
                <button
                  onClick={() => setActiveTab('appointments')}
                  className="text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline"
                >
                  View All &rarr;
                </button>
              </div>

              <div className="space-y-3">
                {appointments.slice(0, 4).map((apt) => (
                  <div key={apt.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono font-bold text-teal-800 bg-teal-100/70 px-1.5 py-0.5 rounded text-[10px] shrink-0">
                          {apt.tokenNumber}
                        </span>
                        <span className="font-semibold text-slate-900 truncate">{apt.patientName}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500 text-[11px] truncate">{apt.department}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        {apt.reasonForVisit}
                      </p>
                    </div>

                    <div className="flex items-center sm:flex-col sm:items-end justify-between sm:justify-center gap-1 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-200/60">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold capitalize whitespace-nowrap shrink-0 ${
                        apt.status === 'in_consultation'
                          ? 'bg-amber-100 text-amber-800'
                          : apt.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : apt.status === 'waiting'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}>
                        {apt.status.replace('_', ' ')}
                      </span>
                      <p className="text-[10px] font-mono text-slate-500">{apt.timeSlot}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Staff Attendance Summary */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Hospital Duty Roster & Attendance</h3>
                  <p className="text-xs text-slate-500">Who is clocked in today</p>
                </div>
                <button
                  onClick={() => setActiveTab('attendance')}
                  className="text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline"
                >
                  View Details &rarr;
                </button>
              </div>

              <div className="space-y-3">
                {attendance.filter((att) => att.date === todayStr).slice(0, 4).map((att) => (
                  <div key={att.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-900 truncate">{att.staffName}</span>
                        <span className="capitalize px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] font-medium shrink-0">
                          {att.customRoleTitle || att.role}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">{att.notes || 'Duty shift'}</p>
                    </div>

                    <div className="flex items-center sm:flex-col sm:items-end justify-between sm:justify-center gap-1 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-200/60">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 shrink-0">
                        <Clock className="w-3 h-3" />
                        In: {att.clockIn}
                      </span>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {att.clockOut ? `Out: ${att.clockOut}` : 'Shift Ongoing'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REVENUE TAB (With interactive filter: today, week, month, year, custom) */}
      {activeTab === 'revenue' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Hospital Revenue Tracking & Ledger</h2>
                <p className="text-xs text-slate-500">
                  Real-time entries from reception billing, doctor fees, walk-ins, and diagnostics
                </p>
              </div>

              {/* Filter controls */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-slate-500 font-medium mr-1">Period:</span>
                {(['today', 'week', 'month', 'year', 'custom'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setRevFilter(mode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                      revFilter === mode
                        ? 'bg-teal-700 text-white font-semibold'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Range Picker */}
            {revFilter === 'custom' && (
              <div className="flex items-center gap-3 pt-3 text-xs bg-slate-50 p-3 rounded-lg mt-3 border border-slate-200">
                <span className="font-semibold text-slate-700">Custom Date Range:</span>
                <input
                  type="date"
                  value={revStartDate}
                  onChange={(e) => setRevStartDate(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                />
                <span>to</span>
                <input
                  type="date"
                  value={revEndDate}
                  onChange={(e) => setRevEndDate(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                />
              </div>
            )}

            {/* Revenue Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-5">
              <div className="bg-teal-50/60 p-4 rounded-xl border border-teal-200">
                <span className="text-xs font-semibold text-teal-800">Filtered Revenue Total</span>
                <p className="text-2xl font-bold font-mono text-teal-950 mt-1 tabular-nums">
                  ₹{totalFilteredRevenue.toLocaleString()}
                </p>
                <p className="text-[11px] text-teal-700 mt-1">
                  {filteredRevenue.length} recorded payments
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-600">UPI Collections</span>
                <p className="text-lg font-bold font-mono text-slate-900 mt-1 tabular-nums">
                  ₹{revByMethod.UPI.toLocaleString()}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Instant QR / Online</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-600">Card POS</span>
                <p className="text-lg font-bold font-mono text-slate-900 mt-1 tabular-nums">
                  ₹{revByMethod.Card.toLocaleString()}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Debit & Credit Cards</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-600">Cash Counter</span>
                <p className="text-lg font-bold font-mono text-slate-900 mt-1 tabular-nums">
                  ₹{revByMethod.Cash.toLocaleString()}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Physical Counter Cash</p>
              </div>
            </div>

            {/* Revenue Category Breakdown */}
            <div className="mt-6">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">
                Revenue by Stream & Category
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {Object.entries(revByCategory).map(([cat, amount]) => (
                  <div key={cat} className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                    <p className="text-slate-500 text-[11px] truncate">{cat}</p>
                    <p className="text-sm font-bold font-mono text-slate-900 mt-0.5">
                      ₹{amount.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Detailed Revenue Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Transactions Ledger
              </span>
              <span className="text-xs text-slate-500 font-mono">
                Showing {filteredRevenue.length} entries
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">Date & Time</th>
                    <th className="py-2.5 px-4">Patient Name</th>
                    <th className="py-2.5 px-4">Category</th>
                    <th className="py-2.5 px-4">Payment Mode</th>
                    <th className="py-2.5 px-4">Amount</th>
                    <th className="py-2.5 px-4">Collected By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRevenue.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono text-slate-600">
                        {item.date} <span className="text-slate-400 text-[11px]">{item.time}</span>
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-slate-900">{item.patientName}</td>
                      <td className="py-2.5 px-4 text-slate-700">{item.category}</td>
                      <td className="py-2.5 px-4">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 border border-slate-200 text-slate-800">
                          {item.paymentMethod}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-bold font-mono text-teal-800 tabular-nums">
                        ₹{item.amount.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 text-[11px]">{item.collectedBy}</td>
                    </tr>
                  ))}
                  {filteredRevenue.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No revenue entries found for this filter period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* EXPENSE TAB (With interactive filter: today, week, month, year, custom) */}
      {activeTab === 'expense' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Hospital Expense Tracking & Auditing</h2>
                <p className="text-xs text-slate-500">
                  Monitor operational outflows, payroll, clinical supplies, and equipment costs
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* Filter controls */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(['today', 'week', 'month', 'year', 'custom'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setExpFilter(mode)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                        expFilter === mode
                          ? 'bg-rose-700 text-white font-semibold'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowAddExpenseModal(true)}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>+ Record Expense</span>
                </button>
              </div>
            </div>

            {/* Custom Range Picker */}
            {expFilter === 'custom' && (
              <div className="flex items-center gap-3 pt-3 text-xs bg-slate-50 p-3 rounded-lg mt-3 border border-slate-200">
                <span className="font-semibold text-slate-700">Custom Date Range:</span>
                <input
                  type="date"
                  value={expStartDate}
                  onChange={(e) => setExpStartDate(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                />
                <span>to</span>
                <input
                  type="date"
                  value={expEndDate}
                  onChange={(e) => setExpEndDate(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                />
              </div>
            )}

            {/* Expense Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
              <div className="bg-rose-50/60 p-4 rounded-xl border border-rose-200">
                <span className="text-xs font-semibold text-rose-800">Filtered Expenses Total</span>
                <p className="text-2xl font-bold font-mono text-rose-950 mt-1 tabular-nums">
                  ₹{totalFilteredExpense.toLocaleString()}
                </p>
                <p className="text-[11px] text-rose-700 mt-1">
                  {filteredExpenses.length} operational disbursements
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-600">Net Period Balance</span>
                <p className={`text-xl font-bold font-mono mt-1 tabular-nums ${
                  totalFilteredRevenue - totalFilteredExpense >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  ₹{(totalFilteredRevenue - totalFilteredExpense).toLocaleString()}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Operating Surplus / Deficit</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-600">Largest Outflow Category</span>
                <p className="text-base font-bold text-slate-900 mt-1 truncate">
                  {Object.keys(expByCategory)[0] || 'Staff Payroll'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Regular budget governance</p>
              </div>
            </div>

            {/* Expense Categories */}
            <div className="mt-6">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">
                Expense Distribution by Head
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(expByCategory).map(([cat, amount]) => (
                  <div key={cat} className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                    <p className="text-slate-500 text-[11px] truncate">{cat}</p>
                    <p className="text-sm font-bold font-mono text-slate-900 mt-0.5">
                      ₹{amount.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Detailed Expense Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Expense Disbursements
              </span>
              <span className="text-xs text-slate-500 font-mono">
                Showing {filteredExpenses.length} entries
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">Date & Time</th>
                    <th className="py-2.5 px-4">Category</th>
                    <th className="py-2.5 px-4">Description</th>
                    <th className="py-2.5 px-4">Vendor / Payee</th>
                    <th className="py-2.5 px-4">Amount</th>
                    <th className="py-2.5 px-4">Approved By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpenses.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono text-slate-600">
                        {item.date} <span className="text-slate-400 text-[11px]">{item.time}</span>
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-slate-800">{item.category}</td>
                      <td className="py-2.5 px-4 text-slate-700 max-w-xs">{item.description}</td>
                      <td className="py-2.5 px-4 text-slate-600">{item.vendor || 'N/A'}</td>
                      <td className="py-2.5 px-4 font-bold font-mono text-rose-700 tabular-nums">
                        ₹{item.amount.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 text-[11px]">{item.approvedBy}</td>
                    </tr>
                  ))}
                  {filteredExpenses.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No expense entries recorded for this filter period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ATTENDANCE & HOURS TRACKER TAB */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Staff Attendance & Working Hours Calculator
                </h2>
                <p className="text-xs text-slate-500">
                  Calculates cumulative working hours, working days, clock-in timestamps, and shift presence
                </p>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={attendanceDateFilter}
                  onChange={(e) => setAttendanceDateFilter(e.target.value)}
                  placeholder="Filter by date"
                  className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                />

                <select
                  value={attendanceRoleFilter}
                  onChange={(e) => setAttendanceRoleFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg capitalize"
                >
                  <option value="all">All Roles</option>
                  <option value="doctor">Doctor</option>
                  <option value="receptionist">Receptionist</option>
                  <option value="nurse">Nurse</option>
                  <option value="ward_boy">Ward Boy</option>
                  <option value="cleaner">Cleaner</option>
                  <option value="manager">Manager</option>
                </select>

                {attendanceDateFilter && (
                  <button
                    onClick={() => setAttendanceDateFilter('')}
                    className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 underline"
                  >
                    Clear Date
                  </button>
                )}
              </div>
            </div>

            {/* Aggregated Staff Hours Summary Cards */}
            <div className="mt-5">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">
                Calculated Working Hours & Days Per Staff Member
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {staffMembers.map((staff) => {
                  const stat = staffHoursMap[staff.id] || { totalHours: 0, daysWorked: 0, latestDate: 'N/A' };
                  return (
                    <div key={staff.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{staff.name}</span>
                        <span className="capitalize px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white border border-slate-200 text-slate-700">
                          {staff.customRoleTitle || staff.role}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{staff.department || 'General'}</p>

                      <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-slate-200">
                        <div>
                          <span className="text-[10px] text-slate-500 block">Total Working Hours</span>
                          <span className="text-sm font-bold font-mono text-teal-800 tabular-nums">
                            {stat.totalHours.toFixed(1)} hrs
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Total Working Days</span>
                          <span className="text-sm font-bold font-mono text-slate-900 tabular-nums">
                            {stat.daysWorked} days
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Attendance Log Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Daily Shift Attendance Records
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {attendance.length} Total Logs
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Staff Name</th>
                    <th className="py-2.5 px-4">Role</th>
                    <th className="py-2.5 px-4">Clock In</th>
                    <th className="py-2.5 px-4">Clock Out</th>
                    <th className="py-2.5 px-4">Calculated Shift Hours</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Shift Duty Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendance
                    .filter((r) => {
                      if (attendanceDateFilter && r.date !== attendanceDateFilter) return false;
                      if (attendanceRoleFilter !== 'all' && r.role !== attendanceRoleFilter) return false;
                      return true;
                    })
                    .map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 font-mono text-slate-600">{item.date}</td>
                        <td className="py-2.5 px-4 font-semibold text-slate-900">{item.staffName}</td>
                        <td className="py-2.5 px-4 capitalize text-slate-700">
                          {item.customRoleTitle || item.role}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-emerald-700 font-semibold">
                          {item.clockIn}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">
                          {item.clockOut || (
                            <span className="text-teal-600 font-sans italic text-[11px]">On Duty</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-900 tabular-nums">
                          {item.hoursWorked ? `${item.hoursWorked.toFixed(1)} hrs` : 'In Progress'}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-emerald-100 text-emerald-800">
                            {item.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-500 text-[11px] max-w-xs truncate">
                          {item.notes || 'Normal clinical shift'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STAFF & ROLES CONTROL TAB */}
      {activeTab === 'staff' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Hospital Staff Workforce & Role Management</h2>
                <p className="text-xs text-slate-500">
                  Full staff add/delete control with role assignment (Manager, Receptionist, Doctor, Nurse, Cleaner, Ward Boy, and Custom Roles)
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search staff name/email..."
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-teal-600"
                  />
                </div>

                <button
                  onClick={() => setShowAddStaffModal(true)}
                  className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Add Hospital Staff</span>
                </button>
              </div>
            </div>

            {/* Staff Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
              {staffMembers
                .filter(
                  (s) =>
                    s.name.toLowerCase().includes(staffSearch.toLowerCase()) ||
                    s.email.toLowerCase().includes(staffSearch.toLowerCase()) ||
                    (s.customRoleTitle && s.customRoleTitle.toLowerCase().includes(staffSearch.toLowerCase()))
                )
                .map((member) => (
                  <div
                    key={member.id}
                    className="p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-slate-300 transition-all text-xs space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-sm">
                          {getUserInitials(getUserDisplayName(member.name, member.email, member.role))}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">
                            {getUserDisplayName(member.name, member.email, member.role)}
                          </p>
                          <span className="capitalize inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white border border-slate-200 text-teal-800 mt-0.5">
                            {member.customRoleTitle || member.role}
                          </span>
                        </div>
                      </div>

                      {member.role !== 'admin' && (
                        <button
                          onClick={() => handleDeleteStaff(member.id, member.name)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                          title="Delete staff member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="space-y-1 text-slate-600 pt-2 border-t border-slate-200/80">
                      <p className="text-[11px]"><span className="text-slate-400">Email:</span> {member.email}</p>
                      <p className="text-[11px]"><span className="text-slate-400">Phone:</span> {member.phone}</p>
                      <p className="text-[11px]"><span className="text-slate-400">Department:</span> {member.department || 'General'}</p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 text-[11px]">
                      <span className="text-slate-500">Status: <strong className="capitalize text-slate-800">{member.status}</strong></span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Active Personnel
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* PATIENTS & APPOINTMENTS TAB */}
      {activeTab === 'appointments' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Hospital Appointments & Patient Directory</h2>
                <p className="text-xs text-slate-500">
                  Track total appointment flow, doctor allocation, fee statuses, and consultation outcomes
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold px-3 py-1 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg">
                  Total Patients: {patientsCount}
                </span>
                <span className="text-xs font-semibold px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg">
                  Total Appointments: {totalAppointmentsCount}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">Token #</th>
                    <th className="py-2.5 px-4">Patient Name</th>
                    <th className="py-2.5 px-4">Doctor / Specialty</th>
                    <th className="py-2.5 px-4">Date & Slot</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Fee Status</th>
                    <th className="py-2.5 px-4">Clinical Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {appointments.map((apt) => (
                    <tr key={apt.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono font-bold text-teal-800">{apt.tokenNumber}</td>
                      <td className="py-2.5 px-4">
                        <p className="font-semibold text-slate-900">{apt.patientName}</p>
                        <p className="text-[11px] text-slate-500">{apt.patientPhone}</p>
                      </td>
                      <td className="py-2.5 px-4">
                        <p className="font-semibold text-slate-800">{apt.doctorName}</p>
                        <p className="text-[11px] text-slate-500">{apt.department}</p>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-600">
                        {apt.date} <span className="text-slate-400 text-[11px]">{apt.timeSlot}</span>
                      </td>
                      <td className="py-2.5 px-4 capitalize text-slate-600">
                        {apt.type.replace('_', ' ')}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
                          apt.status === 'in_consultation'
                            ? 'bg-amber-100 text-amber-800'
                            : apt.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : apt.status === 'waiting'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {apt.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        {apt.feeCollected ? (
                          <span className="text-emerald-700 font-semibold text-[11px] flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            ₹{apt.feeAmount} ({apt.paymentMethod})
                          </span>
                        ) : (
                          <span className="text-amber-700 font-semibold text-[11px]">
                            Pending ₹{apt.feeAmount}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        {apt.prescription ? (
                          <span className="text-teal-700 font-semibold text-[11px]">
                            Rx Generated
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Consulting</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ADD STAFF MODAL */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-auto max-h-[90vh] flex flex-col">
            <div className="px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-slate-900">Add New Hospital Staff Member</h3>
              <button
                onClick={() => setShowAddStaffModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddStaff} className="p-5 sm:p-6 space-y-3.5 text-xs overflow-y-auto grow">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Rajesh Khanna / Sister Sunita"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="staff@gmail.com"
                    value={newStaffEmail}
                    onChange={(e) => setNewStaffEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="9876543210"
                    value={newStaffPhone}
                    onChange={(e) => setNewStaffPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Assign Role *</label>
                  <select
                    value={newStaffRole}
                    onChange={(e) => setNewStaffRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600 capitalize"
                  >
                    <option value="manager">Manager</option>
                    <option value="doctor">Doctor</option>
                    <option value="receptionist">Receptionist</option>
                    <option value="nurse">Nurse</option>
                    <option value="cleaner">Cleaner</option>
                    <option value="ward_boy">Ward Boy</option>
                    <option value="other">Other (Custom Role)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Department</label>
                  <input
                    type="text"
                    placeholder="e.g. ICU, Emergency, OPD"
                    value={newStaffDept}
                    onChange={(e) => setNewStaffDept(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  />
                </div>
              </div>

              {/* If "other", show custom role title input */}
              {newStaffRole === 'other' && (
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Custom Role Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Lab Technician, Pharmacist, Security Head"
                    value={customRoleTitle}
                    onChange={(e) => setCustomRoleTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Age</label>
                  <input
                    type="number"
                    value={newStaffAge}
                    onChange={(e) => setNewStaffAge(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Gender</label>
                  <select
                    value={newStaffGender}
                    onChange={(e) => setNewStaffGender(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg shadow-2xs"
                >
                  Confirm & Add Staff
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD EXPENSE MODAL */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-auto max-h-[90vh] flex flex-col">
            <div className="px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-slate-900">Record Hospital Operational Expense</h3>
              <button
                onClick={() => setShowAddExpenseModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="p-5 sm:p-6 space-y-3.5 text-xs overflow-y-auto grow">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Expense Category *</label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                >
                  <option value="Medicines & Supplies">Medicines & Supplies</option>
                  <option value="Medical Equipment">Medical Equipment</option>
                  <option value="Staff Payroll">Staff Payroll</option>
                  <option value="Maintenance & Repairs">Maintenance & Repairs</option>
                  <option value="Utility Bills">Utility Bills</option>
                  <option value="Sanitation & Hygiene">Sanitation & Hygiene</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Disbursement Amount (₹) *</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  placeholder="e.g. 2500"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Description / Bill Purpose *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Detail items purchased or service rendered"
                  value={expDescription}
                  onChange={(e) => setExpDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Vendor / Payee</label>
                <input
                  type="text"
                  placeholder="e.g. Apex Lifesciences Ltd."
                  value={expVendor}
                  onChange={(e) => setExpVendor(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddExpenseModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg shadow-2xs"
                >
                  Record Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
