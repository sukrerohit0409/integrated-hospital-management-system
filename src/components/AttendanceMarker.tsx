import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, LogIn, LogOut } from 'lucide-react';
import { store } from '../data/store';
import { supabase } from '../lib/supabase';
import { AttendanceRecord, User } from '../types';
import { useHospitalDate } from '../hooks/useHospitalDate';
import { getShiftLabel, isStaffShift } from '../utils/staffShifts';

export const AttendanceMarker: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => store.getAttendance());
  const [shiftNote, setShiftNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const today = useHospitalDate();

  useEffect(() => store.subscribe(() => {
    setAttendance(store.getAttendance());
  }), []);

  useEffect(() => {
    // Supabase production checkout is owned by pg_cron. Avoid racing it with a stale client write.
    if (supabase || !currentUser.id) return;
    const checkForDueCheckout = () => {
      if (document.visibilityState !== 'visible') return;
      const open = store.getAttendance().find((record) =>
        record.staffId === currentUser.id && !record.clockOutAt && !record.clockOut
        && record.shiftEndAt && Number.isFinite(new Date(record.shiftEndAt).getTime())
        && Date.now() >= new Date(record.shiftEndAt).getTime() + 120_000
      );
      if (!open) return;
      const closed = store.clockOut(currentUser.id, 'Automatic checkout safety fallback at scheduled shift end');
      if (closed) void store.flushPendingWrites().catch((error: unknown) => {
        console.error('Scheduled attendance checkout fallback failed:', error);
      });
    };
    const intervalId = window.setInterval(checkForDueCheckout, 30_000);
    document.addEventListener('visibilitychange', checkForDueCheckout);
    checkForDueCheckout();
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', checkForDueCheckout);
    };
  }, [currentUser.id]);

  const myAttendance = useMemo(
    () => attendance.filter((record) => record.staffId === currentUser.id),
    [attendance, currentUser.id]
  );
  const activeRecord = useMemo(() => myAttendance
    .filter((record) => !record.clockOutAt && !record.clockOut)
    .sort((left, right) => String(right.clockInAt || '').localeCompare(String(left.clockInAt || '')))[0], [myAttendance]);
  const todayClosedRecord = myAttendance.find((record) => record.date === today);
  const todayRecord = activeRecord || todayClosedRecord;
  const hasRecordForToday = Boolean(todayClosedRecord);
  const totalHours = myAttendance.reduce((total, record) => total + (record.hoursWorked || 0), 0);
  const isClockInBlocked = currentUser.status !== 'active';
  const scheduledEndLabel = activeRecord?.shiftEndAt
    ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(activeRecord.shiftEndAt))
    : null;

  const saveAttendance = async (action: 'in' | 'out') => {
    if (isSaving) return;
    if (action === 'in' && currentUser.status !== 'active') {
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: 'Your account is not marked Active. Ask a manager to update your status before clocking in.',
      }));
      return;
    }
    setIsSaving(true);
    try {
      if (action === 'in') {
        store.clockIn(
          currentUser.id,
          currentUser.name,
          currentUser.role,
          currentUser.customRoleTitle,
          shiftNote || 'Shift clock-in',
          currentUser.shift ?? 'unassigned'
        );
      } else {
        const updated = store.clockOut(currentUser.id, shiftNote || 'Shift clock-out');
        if (!updated) {
          throw new Error('There is no active shift to clock out. Refresh the page if your shift ended automatically.');
        }
      }
      await store.flushPendingWrites();
      setShiftNote('');
      window.dispatchEvent(new CustomEvent('ihms:data-success-message', {
        detail: action === 'in' ? 'Clock-in recorded successfully.' : 'Clock-out recorded successfully.',
      }));
    } catch (error) {
      console.error('Attendance could not be saved:', error);
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: error instanceof Error ? error.message : 'Attendance could not be saved.',
      }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Clock className="h-4 w-4 text-teal-600" />
            My Attendance & Working Hours
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {activeRecord
              ? `On duty since ${activeRecord.clockIn} · ${getShiftLabel(activeRecord.shift || currentUser.shift)}${scheduledEndLabel ? ` · scheduled end ${scheduledEndLabel}` : ''}`
              : todayRecord?.clockOut
                ? `Today's shift: ${todayRecord.clockIn}–${todayRecord.clockOut}`
                : `No shift recorded today · ${today}`}
          </p>
          {!activeRecord && currentUser.status === 'on_leave' && (
            <p className="mt-1 text-xs font-medium text-amber-700">Your account is marked On Leave. Clock-in is disabled until a manager restores Active status.</p>
          )}
          {!activeRecord && currentUser.status === 'inactive' && (
            <p className="mt-1 text-xs font-medium text-rose-700">Your account is inactive. Contact a hospital administrator.</p>
          )}
          {!activeRecord && !isClockInBlocked && !isStaffShift(currentUser.shift) && (
            <p className="mt-1 text-xs font-medium text-amber-700">Your shift is not assigned yet. Ask a manager to assign your shift before clocking in.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs text-slate-600">
            <span className="font-semibold">{myAttendance.length}</span> working days
            <span className="mx-2 text-slate-300">|</span>
            <span className="font-semibold">{totalHours.toFixed(1)}</span> recorded hours
          </div>
          {!activeRecord && !hasRecordForToday ? (
            <button
              type="button"
              disabled={isSaving || isClockInBlocked || !isStaffShift(currentUser.shift)}
              onClick={() => void saveAttendance('in')}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:cursor-wait disabled:opacity-60"
            >
              <LogIn className="h-4 w-4" />
              {isSaving ? 'Saving…' : 'Clock In'}
            </button>
          ) : activeRecord ? (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void saveAttendance('out')}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              {isSaving ? 'Saving…' : 'Clock Out'}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              {activeRecord ? 'On duty' : 'Shift complete'}
            </span>
          )}
        </div>
      </div>

      {!activeRecord && !hasRecordForToday && currentUser.status === 'active' && (
        <div className="mt-3">
          <label className="sr-only" htmlFor={`attendance-note-${currentUser.id}`}>Shift note</label>
          <input
            id={`attendance-note-${currentUser.id}`}
            type="text"
            value={shiftNote}
            maxLength={2000}
            onChange={(event) => setShiftNote(event.target.value.slice(0, 2000))}
            placeholder="Enter shift note (optional)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-teal-600 sm:max-w-lg"
          />
        </div>
      )}
    </section>
  );
};
