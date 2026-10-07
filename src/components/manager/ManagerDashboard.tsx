import React, { useState, useMemo } from 'react';
import { User, AttendanceRecord, LeaveRequest, UserRole } from '../../types';
import { store } from '../../data/store';
import { manageStaffAccount } from '../../data/staffAccounts';
import { supabase } from '../../lib/supabase';
import { getHospitalDate } from '../../utils/hospitalDate';
import {
  Eye,
  Users,
  Clock,
  Calendar,
  UserPlus,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  CheckCircle2,
  Activity
} from 'lucide-react';

export const ManagerDashboard: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'eyes_on_staff' | 'attendance' | 'staff_control' | 'leaves'>('eyes_on_staff');

  const [users, setUsers] = useState<User[]>(() => store.getUsers());
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => store.getAttendance());
  const [leaves, setLeaves] = useState<LeaveRequest[]>(() => store.getLeaves());

  const [staffSearch, setStaffSearch] = useState('');
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);

  // New staff form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('nurse');
  const [customRoleTitle, setCustomRoleTitle] = useState('');
  const [department, setDepartment] = useState('Nursing & Emergency');
  const [age, setAge] = useState('28');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Female');
  const [staffPassword, setStaffPassword] = useState('');

  // Attendance filter
  const [attendanceDate, setAttendanceDate] = useState('');

  React.useEffect(() => {
    return store.subscribe ? store.subscribe(() => {
      setUsers(store.getUsers());
      setAttendance(store.getAttendance());
      setLeaves(store.getLeaves());
    }) : undefined;
  }, []);

  const todayStr = getHospitalDate();
  const staffMembers = users.filter((u) => u.role !== 'patient');

  // Staff working hours & working days calculation
  const staffStatsMap = useMemo(() => {
    const map: Record<string, { totalHours: number; daysWorked: number; isClockedInToday: boolean }> = {};
    staffMembers.forEach((s) => {
      map[s.id] = { totalHours: 0, daysWorked: 0, isClockedInToday: false };
    });

    attendance.forEach((att) => {
      if (!map[att.staffId]) {
        map[att.staffId] = { totalHours: 0, daysWorked: 0, isClockedInToday: false };
      }
      map[att.staffId].totalHours += att.hoursWorked || 0;
      map[att.staffId].daysWorked += 1;
      if (att.date === todayStr && !att.clockOut) {
        map[att.staffId].isClockedInToday = true;
      }
    });

    return map;
  }, [attendance, staffMembers]);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('ihms:data-error', {
      detail: 'Staff invitations are disabled. Contact the system administrator to onboard staff.',
    }));
  };

  const handleDeleteStaff = (id: string, staffName: string) => {
    if (confirm(`Remove staff member ${staffName}?`)) {
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

  const handleUpdateStatus = (id: string, status: User['status']) => {
    if (supabase) {
      void manageStaffAccount({ action: 'status', id, status }).catch((error: unknown) => {
        console.error('Could not update staff status:', error);
        window.dispatchEvent(new CustomEvent('ihms:data-error', {
          detail: error instanceof Error ? error.message : 'Could not update staff status.',
        }));
      });
    } else {
      store.updateUser(id, { status });
    }
  };

  const handleApproveLeave = async (id: string) => {
    store.updateLeaveStatus(id, 'approved', currentUser.name);
    try {
      await store.flushPendingWrites();
    } catch (error) {
      console.error('Leave approval did not reach the shared database:', error);
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: error instanceof Error ? error.message : 'Leave approval could not be saved.',
      }));
    }
  };

  const handleRejectLeave = async (id: string) => {
    store.updateLeaveStatus(id, 'rejected', currentUser.name);
    try {
      await store.flushPendingWrites();
    } catch (error) {
      console.error('Leave rejection did not reach the shared database:', error);
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: error instanceof Error ? error.message : 'Leave decision could not be saved.',
      }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Manager Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Hospital Operations Manager Workspace
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 font-semibold">
              Workforce Controller
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time staff surveillance, working hours tracking, leave governance, and workforce roster management.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto w-full md:w-auto shrink-0">
          <button
            onClick={() => setActiveTab('eyes_on_staff')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'eyes_on_staff'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5 text-blue-600" />
            <span>Eyes On All Staff</span>
          </button>
          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'attendance'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-teal-600" />
            <span>Attendance & Working Hours</span>
          </button>
          <button
            onClick={() => setActiveTab('staff_control')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'staff_control'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-indigo-600" />
            <span>Staff Management</span>
          </button>
          <button
            onClick={() => setActiveTab('leaves')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'leaves'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-amber-600" />
            <span>Leave Management ({leaves.filter((l) => l.status === 'pending').length})</span>
          </button>
        </div>
      </div>

      {/* EYES ON ALL STAFF (Live active/inactive status and shift presence) */}
      {activeTab === 'eyes_on_staff' && (
        <div className="space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-medium text-slate-500">Total Hospital Workforce</span>
              <p className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
                {staffMembers.length} Members
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Excludes outpatients</p>
            </div>

            <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200 shadow-2xs">
              <span className="text-xs font-semibold text-emerald-800">Currently Active / On Duty</span>
              <p className="text-2xl font-bold font-mono text-emerald-950 mt-1 tabular-nums">
                {staffMembers.filter((s) => s.status === 'active').length} Active
              </p>
              <p className="text-[11px] text-emerald-700 mt-1">Clocked in or available in hospital</p>
            </div>

            <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 shadow-2xs">
              <span className="text-xs font-semibold text-amber-800">On Leave / Inactive</span>
              <p className="text-2xl font-bold font-mono text-amber-950 mt-1 tabular-nums">
                {staffMembers.filter((s) => s.status !== 'active').length} Away
              </p>
              <p className="text-[11px] text-amber-700 mt-1">Approved leaves or inactive roster</p>
            </div>
          </div>

          {/* Eyes on All Staff Live Surveillance Grid */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                <h2 className="text-sm font-bold text-slate-900">
                  Live Workforce Presence & Status Control
                </h2>
              </div>
              <p className="text-xs text-slate-500">
                Managers have real-time oversight to toggle status and inspect active shifts
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
              {staffMembers.map((staff) => {
                const stat = staffStatsMap[staff.id] || { totalHours: 0, daysWorked: 0, isClockedInToday: false };
                return (
                  <div
                    key={staff.id}
                    className={`p-4 rounded-xl border transition-all text-xs space-y-3 ${
                      staff.status === 'active'
                        ? 'bg-white border-slate-200 hover:border-emerald-300'
                        : staff.status === 'on_leave'
                        ? 'bg-amber-50/40 border-amber-200'
                        : 'bg-slate-100/60 border-slate-200 opacity-70'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-800 font-bold flex items-center justify-center text-sm border border-slate-200">
                            {staff.name.charAt(0)}
                          </div>
                          <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                            staff.status === 'active' ? 'bg-emerald-500' : staff.status === 'on_leave' ? 'bg-amber-500' : 'bg-slate-400'
                          }`}></span>
                        </div>

                        <div>
                          <p className="font-bold text-slate-900 text-sm leading-tight">{staff.name}</p>
                          <span className="capitalize inline-block text-[11px] font-medium text-slate-600">
                            {staff.customRoleTitle || staff.role}
                          </span>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                        staff.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : staff.status === 'on_leave'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}>
                        {staff.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="space-y-1 text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-[11px]">
                      <p><span className="text-slate-400">Department:</span> {staff.department || 'General'}</p>
                      <p><span className="text-slate-400">Phone:</span> {staff.phone}</p>
                      <div className="flex items-center justify-between pt-1 text-slate-700 font-mono">
                        <span>Work: <strong>{stat.totalHours.toFixed(1)} hrs</strong></span>
                        <span>Days: <strong>{stat.daysWorked} d</strong></span>
                      </div>
                    </div>

                    {/* Manager Status Switcher Action */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
                      <span className="text-[11px] font-semibold text-slate-500">Update Status:</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleUpdateStatus(staff.id, 'active')}
                          className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                            staff.status === 'active'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Active
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(staff.id, 'on_leave')}
                          className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                            staff.status === 'on_leave'
                              ? 'bg-amber-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          On Leave
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(staff.id, 'inactive')}
                          className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                            staff.status === 'inactive'
                              ? 'bg-slate-700 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Inactive
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ATTENDANCE & WORKING HOURS TAB */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Staff Attendance, Hours & Working Days Tracker
                </h2>
                <p className="text-xs text-slate-500">
                  Calculate working hours and working days across all hospital shifts
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                />
                {attendanceDate && (
                  <button
                    onClick={() => setAttendanceDate('')}
                    className="text-xs text-slate-500 underline"
                  >
                    Clear Filter
                  </button>
                )}
              </div>
            </div>

            {/* Aggregated Totals Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
              {staffMembers.map((staff) => {
                const stat = staffStatsMap[staff.id] || { totalHours: 0, daysWorked: 0, isClockedInToday: false };
                return (
                  <div key={staff.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{staff.name}</span>
                      <span className="capitalize px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white border border-slate-200 text-slate-700">
                        {staff.customRoleTitle || staff.role}
                      </span>
                    </div>

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

          {/* Full Shift Log Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Shift Log Entries
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {attendance.length} Total Logs Recorded
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
                    <th className="py-2.5 px-4">Duty Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendance
                    .filter((r) => !attendanceDate || r.date === attendanceDate)
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

      {/* STAFF ADD/DELETE CONTROL TAB */}
      {activeTab === 'staff_control' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Workforce Management</h2>
                <p className="text-xs text-slate-500">
                  View and manage existing staff accounts. New staff invitations are disabled.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search staff..."
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-teal-600"
                  />
                </div>

                <button
                  type="button"
                  disabled
                  title="Staff invitations are disabled"
                  className="px-3.5 py-1.5 bg-slate-200 text-slate-500 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-not-allowed"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Staff Invitations Disabled</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
              {staffMembers
                .filter(
                  (s) =>
                    s.name.toLowerCase().includes(staffSearch.toLowerCase()) ||
                    s.email.toLowerCase().includes(staffSearch.toLowerCase())
                )
                .map((staff) => (
                  <div key={staff.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{staff.name}</p>
                        <span className="capitalize inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white border border-slate-200 text-teal-800 mt-0.5">
                          {staff.customRoleTitle || staff.role}
                        </span>
                      </div>

                      {staff.role !== 'admin' && staff.role !== 'manager' && (
                        <button
                          onClick={() => handleDeleteStaff(staff.id, staff.name)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                          title="Delete staff member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="space-y-1 text-slate-600 pt-2 border-t border-slate-200">
                      <p className="text-[11px]"><span className="text-slate-400">Email:</span> {staff.email}</p>
                      <p className="text-[11px]"><span className="text-slate-400">Phone:</span> {staff.phone}</p>
                      <p className="text-[11px]"><span className="text-slate-400">Department:</span> {staff.department || 'General'}</p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-[11px]">
                      <span className="text-slate-500">Status: <strong className="capitalize text-slate-800">{staff.status}</strong></span>
                      <span className="text-[11px] text-slate-500 font-mono">Verified Member</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* LEAVE MANAGEMENT TAB */}
      {activeTab === 'leaves' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="pb-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">Hospital Staff Leave Requests & Approvals</h2>
              <p className="text-xs text-slate-500">
                Review and approve leave applications submitted by clinical and support staff
              </p>
            </div>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">Staff Member</th>
                    <th className="py-2.5 px-4">Role</th>
                    <th className="py-2.5 px-4">Leave Duration</th>
                    <th className="py-2.5 px-4">Reason</th>
                    <th className="py-2.5 px-4">Applied On</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Manager Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaves.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-semibold text-slate-900">{l.staffName}</td>
                      <td className="py-2.5 px-4 capitalize text-slate-600">{l.role}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-700">
                        {l.startDate} to {l.endDate}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 max-w-xs">{l.reason}</td>
                      <td className="py-2.5 px-4 text-slate-400 font-mono text-[11px]">{l.appliedAt}</td>
                      <td className="py-2.5 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
                          l.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : l.status === 'rejected'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        {l.status === 'pending' ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleApproveLeave(l.id)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectLeave(l.id)}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-semibold transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">
                            Processed {l.reviewedBy ? `by ${l.reviewedBy}` : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {leaves.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No leave applications currently submitted.
                      </td>
                    </tr>
                  )}
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
              <h3 className="text-sm font-bold text-slate-900">Add Hospital Staff Member</h3>
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
                  placeholder="e.g. Sister Kavita / Ward Attendant Raju"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="staff@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Mobile Phone *</label>
                  <input
                    type="tel"
                    required
                    placeholder="9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Role *</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600 capitalize"
                  >
                    {!supabase && <option value="manager">Manager</option>}
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
                    placeholder="e.g. ICU, General Ward, OPD"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  />
                </div>
              </div>

              {role === 'other' && (
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Custom Role Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Pharmacist, Medical Social Worker"
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
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {!supabase && (
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Demo Login Password (Optional)</label>
                  <input
                    type="password"
                    placeholder="Demo account password"
                    value={staffPassword}
                    onChange={(e) => setStaffPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600 font-mono text-xs"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Hosted accounts receive a password-setup invitation by email.
                  </p>
                </div>
              )}

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
                  Add Staff Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
