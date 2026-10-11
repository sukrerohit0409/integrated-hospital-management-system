import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, LogIn, LogOut } from 'lucide-react';
import { store } from '../data/store';
import { AttendanceRecord, User } from '../types';
import { useHospitalDate } from '../hooks/useHospitalDate';

export const AttendanceMarker: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => store.getAttendance());
  const [shiftNote, setShiftNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const today = useHospitalDate();

  useEffect(() => store.subscribe(() => {
    setAttendance(store.getAttendance());
  }), []);

  const myAttendance = useMemo(
    () => attendance.filter((record) => record.staffId === currentUser.id),
    [attendance, currentUser.id]
  );
  const todayRecord = myAttendance.find((record) => record.date === today);
  const totalHours = myAttendance.reduce((total, record) => total + (record.hoursWorked || 0), 0);

  const saveAttendance = async (action: 'in' | 'out') => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (action === 'in') {
        store.clockIn(
          currentUser.id,
          currentUser.name,
          currentUser.role,
          currentUser.customRoleTitle,
          shiftNote || 'Shift clock-in'
        );
      } else {
        const updated = store.clockOut(currentUser.id, shiftNote || 'Shift clock-out');
        if (!updated) {
          throw new Error('Could not clock out because there is no active shift for today.');
        }
      }
      await store.flushPendingWrites();
      setShiftNote('');
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
            {todayRecord
              ? todayRecord.clockOut
                ? `Today's shift: ${todayRecord.clockIn}–${todayRecord.clockOut}`
                : `On duty since ${todayRecord.clockIn}`
              : `No shift recorded today · ${today}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs text-slate-600">
            <span className="font-semibold">{myAttendance.length}</span> working days
            <span className="mx-2 text-slate-300">|</span>
            <span className="font-semibold">{totalHours.toFixed(1)}</span> recorded hours
          </div>
          {!todayRecord ? (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void saveAttendance('in')}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:cursor-wait disabled:opacity-60"
            >
              <LogIn className="h-4 w-4" />
              {isSaving ? 'Saving…' : 'Clock In'}
            </button>
          ) : !todayRecord.clockOut ? (
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
              Shift complete
            </span>
          )}
        </div>
      </div>

      {!todayRecord && (
        <div className="mt-3">
          <label className="sr-only" htmlFor={`attendance-note-${currentUser.id}`}>Shift note</label>
          <input
            id={`attendance-note-${currentUser.id}`}
            type="text"
            value={shiftNote}
            onChange={(event) => setShiftNote(event.target.value)}
            placeholder="Optional shift note"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-teal-600 sm:max-w-lg"
          />
        </div>
      )}
    </section>
  );
};
