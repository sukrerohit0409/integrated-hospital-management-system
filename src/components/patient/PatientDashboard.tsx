import React, { useState, useMemo } from 'react';
import { User, Appointment, Prescription } from '../../types';
import { store } from '../../data/store';
import { sendAppointmentConfirmation } from '../../data/appointmentEmails';
import { supabase } from '../../lib/supabase';
import {
  Calendar,
  Clock,
  FileText,
  Stethoscope,
  CheckCircle2,
  AlertCircle,
  Printer,
  ChevronRight,
  UserCheck,
  CalendarCheck,
  XCircle,
  Pill,
  HeartPulse,
  ArrowLeft
} from 'lucide-react';
import { PrintPrescriptionModal } from '../PrintPrescriptionModal';
import { firstOpenHospitalSlot, getHospitalDate, isHospitalTimeSlotPast } from '../../utils/hospitalDate';
import { getUserInitials } from '../../utils/userDisplay';

interface PatientDashboardProps {
  currentUser: User | null;
}

function isBookedSlot(value: unknown): value is { time_slot: string } {
  return typeof value === 'object'
    && value !== null
    && 'time_slot' in value
    && typeof value.time_slot === 'string';
}

export const PatientDashboard: React.FC<PatientDashboardProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'history' | 'book' | 'follow_ups' | 'profile'>('history');

  const [appointments, setAppointments] = useState<Appointment[]>(() => store.getAppointments());
  const [users, setUsers] = useState<User[]>(() => store.getUsers());

  // Booking Flow State
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('All');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [bookingDate, setBookingDate] = useState<string>(() => getHospitalDate());
  const [bookingSlot, setBookingSlot] = useState<string>('10:00 AM');
  const [bookingReason, setBookingReason] = useState<string>('');
  const [bookingSuccessToken, setBookingSuccessToken] = useState<string | null>(null);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);

  // Print Prescription Modal
  const [printPrescription, setPrintPrescription] = useState<Prescription | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  React.useEffect(() => {
    return store.subscribe ? store.subscribe(() => {
      setAppointments(store.getAppointments());
      setUsers(store.getUsers());
    }) : undefined;
  }, []);

  const patientId = currentUser?.id || 'u-pat-1';
  const doctors = users.filter((u) => u.role === 'doctor' && u.status === 'active');

  React.useEffect(() => {
    if (!doctors.some((doctor) => doctor.id === selectedDoctorId) && doctors.length > 0) {
      setSelectedDoctorId(doctors[0].id);
    }
  }, [doctors, selectedDoctorId]);

  React.useEffect(() => {
    const client = supabase;
    if (!client || !selectedDoctorId || !bookingDate) {
      setBookedSlots([]);
      return;
    }
    let active = true;
    const refreshBookedSlots = async () => {
      const { data, error } = await client.rpc('get_booked_slots', {
        p_doctor_id: selectedDoctorId,
        p_date: bookingDate,
      });
      if (!active) return;
      if (error) {
        console.error('Could not load appointment availability:', error);
        window.dispatchEvent(new CustomEvent('ihms:data-error', {
          detail: 'Could not load the selected doctor’s available slots.',
        }));
        return;
      }
      window.dispatchEvent(new Event('ihms:data-success'));
      const rows: unknown = data;
      if (!Array.isArray(rows) || !rows.every(isBookedSlot)) {
        console.error('Appointment availability returned an unexpected response.');
        window.dispatchEvent(new CustomEvent('ihms:data-error', {
          detail: 'Appointment availability returned an invalid response.',
        }));
        return;
      }
      setBookedSlots(rows.map((row) => row.time_slot));
    };
    void refreshBookedSlots();
    const interval = activeTab === 'book' ? window.setInterval(refreshBookedSlots, 15000) : undefined;
    return () => {
      active = false;
      if (interval) window.clearInterval(interval);
    };
  }, [selectedDoctorId, bookingDate, activeTab]);

  // Filter patient's appointments
  const myAppointments = useMemo(() => {
    return appointments.filter(
      (a) =>
        a.patientId === patientId ||
        (currentUser && a.patientEmail.toLowerCase() === currentUser.email.toLowerCase()) ||
        (currentUser && a.patientPhone === currentUser.phone)
    );
  }, [appointments, patientId, currentUser]);

  // Appointments with pending follow-ups
  const activeFollowUps = useMemo(() => {
    return myAppointments.filter(
      (a) =>
        a.prescription?.followUpDate &&
        a.followUpStatus !== 'booked' &&
        a.followUpStatus !== 'skipped'
    );
  }, [myAppointments]);

  // Available Time Slots for booking
  const TIME_SLOTS = [
    '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
    '11:00 AM', '11:30 AM', '12:00 PM', '02:00 PM',
    '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM',
    '04:30 PM', '05:00 PM'
  ];


  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (bookingDate < getHospitalDate() || isHospitalTimeSlotPast(bookingDate, bookingSlot)) {
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: 'Please choose today or a future date for the appointment.',
      }));
      return;
    }

    const samePatientTimeAlreadyBooked = appointments.some((appointment) =>
      appointment.patientId === currentUser.id
      && appointment.date === bookingDate
      && appointment.timeSlot === bookingSlot
      && appointment.status !== 'cancelled'
    );

    const sameSlotAlreadyBooked = appointments.some((appointment) =>
      appointment.doctorId === selectedDoctorId
      && appointment.date === bookingDate
      && appointment.timeSlot === bookingSlot
      && appointment.status !== 'cancelled'
      && appointment.type !== 'walk_in'
    );

    if (samePatientTimeAlreadyBooked || (supabase && bookedSlots.includes(bookingSlot)) || sameSlotAlreadyBooked) {
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: 'That appointment slot has just been reserved. Choose another time.',
      }));
      return;
    }

    const assignedDoctor = doctors.find((d) => d.id === selectedDoctorId) || doctors[0];
    if (!assignedDoctor) {
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: 'No doctors are available for booking. Contact the hospital.',
      }));
      return;
    }

    const newApt = store.addAppointment({
      patientId: currentUser.id,
      patientName: currentUser.name,
      patientPhone: currentUser.phone,
      patientEmail: currentUser.email,
      patientAge: currentUser.age || 32,
      patientGender: currentUser.gender || 'Male',
      doctorId: assignedDoctor.id,
      doctorName: assignedDoctor.name,
      department: assignedDoctor.department || 'Outpatient Clinic',
      date: bookingDate,
      timeSlot: bookingSlot,
      type: 'online_booking',
      status: 'scheduled',
      reasonForVisit: bookingReason || 'General medical consultation',
      feeCollected: false,
      feeAmount: 650,
    });

    try {
      await store.flushPendingWrites();
    } catch (error) {
      console.error('Appointment booking did not reach the shared database:', error);
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: error instanceof Error ? error.message : 'Appointment could not be saved.',
      }));
      return;
    }
    if (supabase) {
      try {
        await sendAppointmentConfirmation(newApt.id);
      } catch (error) {
        console.error('Appointment was saved, but the confirmation email failed:', error);
        window.dispatchEvent(new CustomEvent('ihms:data-error', {
          detail: 'Appointment confirmed, but the confirmation email could not be sent.',
        }));
      }
    }
    setBookingSuccessToken(newApt.tokenNumber);
    setBookingReason('');
  };

  // Follow-up direct booking action (as requested: "they patient have access to book appointment on that date or skip follow up")
  const handleBookFollowUp = async (apt: Appointment) => {
    if (!currentUser || !apt.prescription?.followUpDate) return;
    const followUpDate = apt.prescription.followUpDate;
    if (followUpDate < getHospitalDate()) {
      window.dispatchEvent(new CustomEvent('ihms:data-error', { detail: 'The recommended follow-up date has already passed. Ask the doctor for a new date.' }));
      return;
    }

    let followUp = appointments.find(
      (appointment) => appointment.followUpForAppointmentId === apt.id
    );

    let createdFollowUp = false;
    if (!followUp) {
      const isLocallyTaken = (slot: string) => appointments.some((existing) =>
        existing.doctorId === apt.doctorId
        && existing.date === followUpDate
        && existing.timeSlot === slot
        && existing.status !== 'cancelled'
      );
      let timeSlot = firstOpenHospitalSlot(TIME_SLOTS, followUpDate, isLocallyTaken) || '';
      if (!timeSlot) {
        window.dispatchEvent(new CustomEvent('ihms:data-error', { detail: 'No appointment slots are available on the recommended follow-up date.' }));
        return;
      }
      if (supabase) {
        const { data, error } = await supabase.rpc('get_booked_slots', {
          p_doctor_id: apt.doctorId,
          p_date: followUpDate,
        });
        if (error) {
          console.error('Could not load follow-up appointment availability:', error);
          window.dispatchEvent(new CustomEvent('ihms:data-error', {
            detail: 'Could not load availability for this follow-up appointment.',
          }));
          return;
        }
        if (!Array.isArray(data) || !data.every(isBookedSlot)) {
          console.error('Follow-up availability returned an unexpected response.');
          window.dispatchEvent(new CustomEvent('ihms:data-error', {
            detail: 'Follow-up availability returned an invalid response.',
          }));
          return;
        }
        const availableSlot = firstOpenHospitalSlot(
          TIME_SLOTS,
          followUpDate,
          (slot) => data.some((booked) => booked.time_slot === slot),
        );
        if (!availableSlot) {
          window.dispatchEvent(new CustomEvent('ihms:data-error', {
            detail: 'No appointment slots are available on the recommended follow-up date.',
          }));
          return;
        }
        timeSlot = availableSlot;
      }

      followUp = store.addAppointment({
        patientId: currentUser.id,
        patientName: currentUser.name,
        patientPhone: currentUser.phone,
        patientEmail: currentUser.email,
        patientAge: currentUser.age || 32,
        patientGender: currentUser.gender || 'Male',
        doctorId: apt.doctorId,
        doctorName: apt.doctorName,
        department: apt.department,
        date: followUpDate,
        timeSlot,
        type: 'follow_up',
        followUpForAppointmentId: apt.id,
        status: 'scheduled',
        reasonForVisit: `Follow-up visit for ${apt.prescription.diagnosis}`,
        feeCollected: false,
        feeAmount: 500,
      });

      try {
        await store.flushPendingWrites();
      } catch (error) {
        console.error('Follow-up booking did not reach the shared database:', error);
        window.dispatchEvent(new CustomEvent('ihms:data-error', {
          detail: error instanceof Error ? error.message : 'Follow-up could not be saved.',
        }));
        return;
      }
      createdFollowUp = true;
    }

    if (supabase && createdFollowUp && followUp) {
      try {
        await sendAppointmentConfirmation(followUp.id);
      } catch (error) {
        console.error('Follow-up appointment was saved, but the confirmation email failed:', error);
        window.dispatchEvent(new CustomEvent('ihms:data-error', {
          detail: 'Follow-up appointment confirmed, but the confirmation email could not be sent.',
        }));
      }
    }

    store.updateFollowUpStatus(apt.id, 'booked');
    try {
      await store.flushPendingWrites();
    } catch (error) {
      console.error('Could not mark the follow-up as booked:', error);
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: error instanceof Error ? error.message : 'Follow-up status could not be updated.',
      }));
      return;
    }
    alert(`Follow-up appointment booked with ${apt.doctorName} on ${followUpDate}!`);
    setActiveTab('history');
  };

  const handleSkipFollowUp = async (aptId: string) => {
    store.updateFollowUpStatus(aptId, 'skipped');
    try {
      await store.flushPendingWrites();
      setActiveTab('history');
    } catch (error) {
      console.error('Could not mark the follow-up as skipped:', error);
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: error instanceof Error ? error.message : 'Follow-up status could not be updated.',
      }));
    }
  };

  const handleViewPrescription = (rx: Prescription) => {
    setPrintPrescription(rx);
    setIsPrintModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Patient Profile Banner */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center text-lg sm:text-xl shadow-xs shrink-0">
            {getUserInitials(currentUser?.name || 'Patient')}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">{currentUser?.name}</h1>
              <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold shrink-0">
                UHID #{currentUser?.id.slice(-6).toUpperCase() || 'P-8921'}
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-500 mt-1 flex-wrap">
              <span>Age: <strong className="text-slate-700">{currentUser?.age || 34} Yrs</strong></span>
              <span>·</span>
              <span>Gender: <strong className="text-slate-700">{currentUser?.gender || 'Male'}</strong></span>
              <span>·</span>
              <span>Blood Group: <strong className="text-teal-700">{currentUser?.bloodGroup || 'B+'}</strong></span>
              <span>·</span>
              <span>Phone: <strong className="text-slate-700">{currentUser?.phone}</strong></span>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-100 p-1 rounded-xl overflow-x-auto w-full lg:w-auto shrink-0">
          <button
            onClick={() => setActiveTab('history')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${activeTab === 'history'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            <FileText className="w-3.5 h-3.5 text-teal-600" />
            <span>Visit History & Rx ({myAppointments.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('book')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${activeTab === 'book'
                ? 'bg-teal-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>+ Book Slot</span>
          </button>

          <button
            onClick={() => setActiveTab('follow_ups')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${activeTab === 'follow_ups'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            <CalendarCheck className="w-3.5 h-3.5 text-amber-600" />
            <span>Follow-Ups ({activeFollowUps.length})</span>
          </button>
        </div>
      </div>

      {/* ACTIVE FOLLOW-UP BANNER IF ANY */}
      {activeFollowUps.length > 0 && activeTab !== 'follow_ups' && (
        <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <HeartPulse className="w-5 h-5 text-teal-600 shrink-0" />
            <div>
              <p className="font-bold text-teal-950">
                You have a scheduled medical follow-up recommended by {activeFollowUps[0].doctorName}
              </p>
              <p className="text-teal-800 text-[11px]">
                Recommended Date: <strong>{activeFollowUps[0].prescription?.followUpDate}</strong> for condition: {activeFollowUps[0].prescription?.diagnosis}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBookFollowUp(activeFollowUps[0])}
              className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white font-semibold rounded-lg text-xs transition-colors"
            >
              Book for {activeFollowUps[0].prescription?.followUpDate}
            </button>
            <button
              onClick={() => handleSkipFollowUp(activeFollowUps[0].id)}
              className="px-2.5 py-1.5 bg-white border border-teal-300 text-teal-800 hover:bg-teal-100 rounded-lg text-xs transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* VISIT HISTORY & PRESCRIPTION TAB */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Medical Consultation & Prescription History
                </h2>
                <p className="text-xs text-slate-500">
                  Access your clinical diagnoses, doctor prescriptions, dosage tables, and print pharmacy slips
                </p>
              </div>
              <button
                onClick={() => setActiveTab('book')}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors"
              >
                + Book Another Visit
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {myAppointments.map((apt) => (
                <div key={apt.id} className="p-5 hover:bg-slate-50/60 transition-colors space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded text-xs">
                        Token #{apt.tokenNumber}
                      </span>
                      <span className="font-bold text-slate-900 text-sm">{apt.doctorName}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-xs text-slate-600">{apt.department}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-500">
                        {apt.date} at {apt.timeSlot}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${apt.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : apt.status === 'in_consultation'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                        {apt.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-700">
                    <span className="font-semibold text-slate-800">Chief Symptoms / Reason:</span> {apt.reasonForVisit}
                  </p>

                  {/* If Prescription Attached */}
                  {apt.prescription ? (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wide">
                            Doctor Diagnosis
                          </span>
                          <p className="font-bold text-slate-900 text-sm mt-0.5">
                            {apt.prescription.diagnosis}
                          </p>
                        </div>

                        <button
                          onClick={() => handleViewPrescription(apt.prescription!)}
                          className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 shadow-2xs transition-colors"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>View & Print Prescription</span>
                        </button>
                      </div>

                      {/* Tablets Preview */}
                      <div>
                        <span className="text-[11px] font-bold text-slate-700 block mb-1">
                          Prescribed Tablets Schedule:
                        </span>
                        <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white">
                          <table className="w-full text-left text-xs min-w-[480px]">
                            <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                              <tr>
                                <th className="py-1.5 px-3">Medicine</th>
                                <th className="py-1.5 px-3">Dosage</th>
                                <th className="py-1.5 px-3">Frequency</th>
                                <th className="py-1.5 px-3">Duration</th>
                                <th className="py-1.5 px-3">Instructions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {apt.prescription.tablets.map((tab, i) => (
                                <tr key={i}>
                                  <td className="py-1.5 px-3 font-semibold text-slate-900">{tab.name}</td>
                                  <td className="py-1.5 px-3 font-mono">{tab.dosage}</td>
                                  <td className="py-1.5 px-3">{tab.frequency}</td>
                                  <td className="py-1.5 px-3">{tab.duration}</td>
                                  <td className="py-1.5 px-3 text-slate-500 italic">{tab.instructions}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Things to Avoid */}
                      {apt.prescription.thingsToAvoid && apt.prescription.thingsToAvoid.length > 0 && (
                        <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-lg text-[11px] text-amber-900">
                          <span className="font-bold block mb-0.5">Things to Avoid / Dietary Advice:</span>
                          <ul className="list-disc list-inside space-y-0.5 ml-1">
                            {apt.prescription.thingsToAvoid.map((t, idx) => (
                              <li key={idx}>{t}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Follow-up Date */}
                      {apt.prescription.followUpDate && (
                        <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <Calendar className="w-3.5 h-3.5 text-teal-600" />
                            <span>
                              Follow-up Date: <strong className="font-mono text-teal-800">{apt.prescription.followUpDate}</strong>
                            </span>
                          </div>

                          {apt.followUpStatus !== 'booked' && apt.followUpStatus !== 'skipped' && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleBookFollowUp(apt)}
                                className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded text-[11px] font-semibold transition-colors"
                              >
                                Book Appointment for {apt.prescription.followUpDate}
                              </button>
                              <button
                                onClick={() => handleSkipFollowUp(apt.id)}
                                className="px-2 py-1 text-slate-500 hover:text-slate-800 text-[11px] underline"
                              >
                                Skip Follow-up
                              </button>
                            </div>
                          )}

                          {apt.followUpStatus === 'booked' && (
                            <span className="text-emerald-700 font-semibold text-[11px] flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Follow-up Booked
                            </span>
                          )}

                          {apt.followUpStatus === 'skipped' && (
                            <span className="text-slate-400 text-[11px]">Follow-up Skipped</span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-500">
                      Prescription pending completion of doctor consultation.
                    </div>
                  )}
                </div>
              ))}

              {myAppointments.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No consultation records yet. Book your first appointment below!
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BOOK NEW APPOINTMENT TAB */}
      {activeTab === 'book' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs max-w-3xl">
            <div className="pb-4 border-b border-slate-100 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Book Outpatient Consultation Slot
                </h2>
                <p className="text-xs text-slate-500">
                  Choose your specialist according to health concern, check real-time availability, and confirm slot
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Appointments</span>
              </button>
            </div>

            {bookingSuccessToken && (
              <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Appointment Confirmed! Token #{bookingSuccessToken}</span>
                </div>
                <p>
                  Your slot has been reserved for <strong>{bookingDate} at {bookingSlot}</strong>. Please arrive 15 minutes prior at the hospital reception.
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => {
                      setBookingSuccessToken(null);
                      setActiveTab('history');
                    }}
                    className="px-3.5 py-1.5 bg-emerald-700 text-white rounded-lg font-semibold hover:bg-emerald-800 transition-colors"
                  >
                    View in My Visits
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleBookAppointment} className="mt-5 space-y-5 text-xs">
              {/* Doctor Selection */}
              <div>
                <label className="block text-slate-800 font-bold mb-2">
                  1. Choose Doctor & Specialty *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {doctors.map((doc) => (
                    <label
                      key={doc.id}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${selectedDoctorId === doc.id
                          ? 'border-teal-600 bg-teal-50/60 shadow-2xs ring-1 ring-teal-600'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                    >
                      <input
                        type="radio"
                        name="doctorChoice"
                        value={doc.id}
                        checked={selectedDoctorId === doc.id}
                        onChange={() => setSelectedDoctorId(doc.id)}
                        className="mt-1 text-teal-600 focus:ring-teal-500"
                      />
                      <div className="space-y-0.5">
                        <p className="font-bold text-slate-900 text-sm">{doc.name}</p>
                        <p className="text-teal-700 font-semibold text-xs">{doc.department}</p>
                        <p className="text-slate-500 text-[11px]">{doc.specialty}</p>
                        <p className="text-slate-400 text-[10px]">{doc.qualification} · Consultation Fee ₹650</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Date & Reason */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-800 font-bold mb-1">
                    2. Select Appointment Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    min={getHospitalDate()}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-800 font-bold mb-1">
                    3. Reason for Visit / Primary Symptoms *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Chest pain, recurring cough, migraine"
                    value={bookingReason}
                    onChange={(e) => setBookingReason(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600 bg-white"
                  />
                </div>
              </div>

              {/* Slot Availability Matrix (Requested by user: "see doctor available while booking, when patient book appointment they confirm if slot is available") */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-slate-800 font-bold">
                    4. Select Available Time Slot on {bookingDate} *
                  </label>
                  <span className="text-[11px] text-slate-500">Green = Available · Red = Reserved</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  {TIME_SLOTS.map((slot) => {
                    const isPast = isHospitalTimeSlotPast(bookingDate, slot);
                    const isBooked = supabase
                      ? bookedSlots.includes(slot)
                      : appointments.some(
                        (a) =>
                          a.doctorId === selectedDoctorId &&
                          a.date === bookingDate &&
                          a.timeSlot === slot &&
                          a.status !== 'cancelled'
                      );

                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={isBooked || isPast}
                        onClick={() => setBookingSlot(slot)}
                        className={`p-2.5 rounded-lg border text-center transition-all text-xs font-mono font-medium ${isPast
                            ? 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
                            : isBooked
                              ? 'bg-rose-50 border-rose-200 text-rose-400 cursor-not-allowed line-through'
                              : bookingSlot === slot
                                ? 'bg-teal-600 border-teal-600 text-white font-bold shadow-2xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-teal-500 hover:bg-teal-50/50'
                          }`}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg shadow-2xs transition-colors flex items-center justify-center gap-2 mt-4"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Slot & Book Token</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* FOLLOW-UP PLANNER TAB */}
      {activeTab === 'follow_ups' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="pb-4 border-b border-slate-100 flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Physician Recommended Follow-Up Schedule
                </h2>
                <p className="text-xs text-slate-500">
                  Review and act on next-visit schedules prescribed by your doctors
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Appointments</span>
              </button>
            </div>

            <div className="space-y-4">
              {myAppointments
                .filter((a) => a.prescription?.followUpDate)
                .map((apt) => (
                  <div
                    key={apt.id}
                    className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{apt.doctorName}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-600">{apt.department}</span>
                      </div>
                      <p className="text-slate-500 mt-0.5">
                        Consultation Condition: <strong>{apt.prescription?.diagnosis}</strong>
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="px-2 py-0.5 bg-teal-100/70 text-teal-800 font-mono font-bold rounded text-xs">
                          Follow-up Date: {apt.prescription?.followUpDate}
                        </span>
                        <span className="capitalize text-slate-500 text-[11px]">
                          Status: {apt.followUpStatus || 'pending'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {apt.followUpStatus !== 'booked' && apt.followUpStatus !== 'skipped' ? (
                        <>
                          <button
                            onClick={() => handleBookFollowUp(apt)}
                            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg text-xs transition-colors"
                          >
                            Book on {apt.prescription?.followUpDate}
                          </button>
                          <button
                            onClick={() => handleSkipFollowUp(apt.id)}
                            className="px-3 py-2 bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 rounded-lg text-xs transition-colors"
                          >
                            Skip Follow-up
                          </button>
                        </>
                      ) : (
                        <span className="text-slate-500 italic text-xs">
                          {apt.followUpStatus === 'booked' ? '✓ Appointment Reserved' : 'Skipped by patient'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

              {myAppointments.filter((a) => a.prescription?.followUpDate).length === 0 && (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No pending doctor follow-up dates on record.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Official Print Prescription Modal */}
      <PrintPrescriptionModal
        prescription={printPrescription}
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
      />
    </div>
  );
};
