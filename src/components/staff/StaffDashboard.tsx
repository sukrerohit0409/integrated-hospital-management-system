import React, { useState, useMemo } from 'react';
import { User, AttendanceRecord, LeaveRequest } from '../../types';
import { store } from '../../data/store';
import { 
  Clock, 
  Calendar, 
  CheckCircle2, 
  LogOut, 
  LogIn, 
  ShieldCheck, 
  Send,
  AlertCircle
} from 'lucide-react';

interface StaffDashboardProps {
  currentUser: User | null;
}

export const StaffDashboard: React.FC<StaffDashboardProps> = ({ currentUser }) => {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => store.getAttendance());
  const [leaves, setLeaves] = useState<LeaveRequest[]>(() => store.getLeaves());

  const [shiftNote, setShiftNote] = useState('');
  const [activeTab, setActiveTab] = useState<'attendance' | 'leave'>('attendance');

  // Leave application form
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveSuccess, setLeaveSuccess] = useState(false);

  React.useEffect(() => {
    return store.subscribe ? store.subscribe(() => {
      setAttendance(store.getAttendance());
      setLeaves(store.getLeaves());
    }) : undefined;
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];
  const staffId = currentUser?.id || 'u-nurse-1';

  // "staff has access for attendance of only that user and working hour ,day tracking"
  const myAttendance = useMemo(() => {
    return attendance.filter((a) => a.staffId === staffId);
  }, [attendance, staffId]);

  const myLeaves = useMemo(() => {
    return leaves.filter((l) => l.staffId === staffId);
  }, [leaves, staffId]);

  const todayRecord = myAttendance.find((a) => a.date === todayStr);

  // Calculations of working hours and working days for ONLY that user
  const totalWorkingHours = myAttendance.reduce((acc, cur) => acc + (cur.hoursWorked || 0), 0);
  const totalWorkingDays = myAttendance.length;
  const avgShiftHours = totalWorkingDays > 0 ? (totalWorkingHours / totalWorkingDays).toFixed(1) : '0';

  const handleClockIn = () => {
    if (!currentUser) return;
    store.clockIn(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      currentUser.customRoleTitle,
      shiftNote || 'Morning shift self-check-in'
    );
    setShiftNote('');
  };

  const handleClockOut = () => {
    if (!currentUser) return;
    store.clockOut(currentUser.id, shiftNote || 'Shift end clock-out');
    setShiftNote('');
  };

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !leaveStart || !leaveEnd || !leaveReason) return;
    if (leaveEnd < leaveStart) {
      window.alert('The leave end date must be on or after the start date.');
      return;
    }

    store.applyLeave({
      staffId: currentUser.id,
      staffName: currentUser.name,
      role: currentUser.role,
      startDate: leaveStart,
      endDate: leaveEnd,
      reason: leaveReason,
    });
    try {
      await store.flushPendingWrites();
    } catch (error) {
      console.error('Leave application did not reach the shared database:', error);
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: error instanceof Error ? error.message : 'Leave application could not be saved.',
      }));
      return;
    }

    setLeaveStart('');
    setLeaveEnd('');
    setLeaveReason('');
    setLeaveSuccess(true);
    setTimeout(() => setLeaveSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Staff Self-Service Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-teal-600 text-white font-bold flex items-center justify-center text-base sm:text-lg shrink-0">
            {currentUser?.name.charAt(0) || 'S'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">{currentUser?.name}</h1>
              <span className="capitalize px-2 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-800 text-[10px] sm:text-xs font-semibold shrink-0">
                {currentUser?.customRoleTitle || currentUser?.role}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 truncate">
              Department: {currentUser?.department || 'Clinical Support'} · Hospital Staff Portal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto shrink-0">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'attendance'
                ? 'bg-teal-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            My Attendance & Hours
          </button>
          <button
            onClick={() => setActiveTab('leave')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'leave'
                ? 'bg-teal-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Request Leave ({myLeaves.length})
          </button>
        </div>
      </div>

      {activeTab === 'attendance' && (
        <div className="space-y-6">
          {/* Working Hour & Day Tracking Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-medium text-slate-500">Total Working Hours</span>
              <p className="text-2xl font-bold font-mono text-teal-900 mt-1 tabular-nums">
                {totalWorkingHours.toFixed(1)} hrs
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Cumulative recorded shift hours</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-medium text-slate-500">Total Working Days</span>
              <p className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
                {totalWorkingDays} Days
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Recorded duty sessions</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-medium text-slate-500">Average Daily Shift</span>
              <p className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
                {avgShiftHours} hrs/day
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Normal hospital shift 8 hrs</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-medium text-slate-500">Today's Duty Status</span>
              <p className="text-base font-bold text-slate-900 mt-1">
                {todayRecord ? (
                  todayRecord.clockOut ? (
                    <span className="text-slate-600">Shift Completed</span>
                  ) : (
                    <span className="text-emerald-700">Currently On Duty</span>
                  )
                ) : (
                  <span className="text-amber-700">Not Clocked In Yet</span>
                )}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{todayStr}</p>
            </div>
          </div>

          {/* Interactive Shift Clock-In / Clock-Out Control Card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900 mb-1">
              Duty Attendance Marker
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Punch in when commencing your ward duty or hospital shift and clock out upon handover
            </p>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="grow">
                <input
                  type="text"
                  placeholder="Optional duty handover note (e.g. ICU cart checked, ward 3 handed over)..."
                  value={shiftNote}
                  onChange={(e) => setShiftNote(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-teal-600"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!todayRecord ? (
                  <button
                    onClick={handleClockIn}
                    className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-xs flex items-center gap-2 shadow-2xs transition-colors"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Clock In for Duty Today</span>
                  </button>
                ) : !todayRecord.clockOut ? (
                  <button
                    onClick={handleClockOut}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs flex items-center gap-2 shadow-2xs transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Clock Out (End Shift)</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-semibold bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Today's shift completed ({todayRecord.clockIn} to {todayRecord.clockOut})</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* User Attendance History (ONLY That User) */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  My Personal Attendance & Working Hour Records
                </h3>
                <p className="text-[11px] text-slate-500">
                  Strictly your personal shift logs as mandated by hospital policy
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500">
                {myAttendance.length} Logged Shifts
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Clock In</th>
                    <th className="py-2.5 px-4">Clock Out</th>
                    <th className="py-2.5 px-4">Calculated Shift Hours</th>
                    <th className="py-2.5 px-4">Attendance Status</th>
                    <th className="py-2.5 px-4">Shift Duty Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {myAttendance.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">{rec.date}</td>
                      <td className="py-2.5 px-4 font-mono text-emerald-700 font-bold">{rec.clockIn}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-700">
                        {rec.clockOut || <span className="text-teal-600 font-sans italic">Ongoing</span>}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-900 tabular-nums">
                        {rec.clockOut
                          ? `${(rec.hoursWorked ?? 0).toFixed(1)} hrs`
                          : 'In Progress'}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                          {rec.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 max-w-sm truncate">{rec.notes}</td>
                    </tr>
                  ))}
                  {myAttendance.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No previous shift logs found. Clock in to record your first duty session!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* LEAVE MANAGEMENT TAB */}
      {activeTab === 'leave' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Apply Form */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900 mb-1">
              Submit Staff Leave Application
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Your leave request will be routed to the Hospital Operations Manager for review
            </p>

            {leaveSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Leave application sent to Operations Manager!</span>
              </div>
            )}

            <form onSubmit={handleApplyLeave} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Start Date *</label>
                <input
                  type="date"
                  required
                  value={leaveStart}
                  onChange={(e) => setLeaveStart(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">End Date *</label>
                <input
                  type="date"
                  required
                  value={leaveEnd}
                  onChange={(e) => setLeaveEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Reason for Leave *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Medical reason, family event, continuing education..."
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg shadow-2xs transition-colors flex items-center justify-center gap-2 mt-2"
              >
                <Send className="w-4 h-4" />
                <span>Submit Leave to Manager</span>
              </button>
            </form>
          </div>

          {/* Leave History Table */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                My Leave Application History
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">Duration</th>
                    <th className="py-2.5 px-4">Reason</th>
                    <th className="py-2.5 px-4">Applied Date</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Manager Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {myLeaves.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                        {l.startDate} to {l.endDate}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 max-w-xs">{l.reason}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-500 text-[11px]">{l.appliedAt}</td>
                      <td className="py-2.5 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                          l.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : l.status === 'rejected'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 text-[11px]">
                        {l.reviewedBy ? `Reviewed by ${l.reviewedBy}` : 'Awaiting Review'}
                      </td>
                    </tr>
                  ))}
                  {myLeaves.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No leave requests submitted.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
