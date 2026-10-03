import React, { useState, useMemo } from 'react';
import { User, Appointment, RevenueItem } from '../../types';
import { store } from '../../data/store';
import { manageStaffAccount } from '../../data/staffAccounts';
import { supabase } from '../../lib/supabase';
import { 
  Users, 
  CalendarClock, 
  ReceiptText, 
  UserPlus, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  Phone, 
  Printer, 
  CreditCard, 
  Smartphone, 
  Wallet,
  Search,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

export const ReceptionistDashboard: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'fee_collection' | 'today_collection' | 'walk_in' | 'slot_checker'>('queue');

  const [appointments, setAppointments] = useState<Appointment[]>(() => store.getAppointments());
  const [revenue, setRevenue] = useState<RevenueItem[]>(() => store.getRevenue());
  const [users, setUsers] = useState<User[]>(() => store.getUsers());

  // Search in queue
  const [queueSearch, setQueueSearch] = useState('');

  // Collect Fee Modal
  const [selectedAptForFee, setSelectedAptForFee] = useState<Appointment | null>(null);
  const [feeAmount, setFeeAmount] = useState('650');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Card' | 'UPI'>('Cash');

  // Walk-in Form State
  const [walkinName, setWalkinName] = useState('');
  const [walkinEmail, setWalkinEmail] = useState('');
  const [walkinPhone, setWalkinPhone] = useState('');
  const [walkinAge, setWalkinAge] = useState('32');
  const [walkinGender, setWalkinGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [walkinReason, setWalkinReason] = useState('');
  const [walkinDoctorId, setWalkinDoctorId] = useState('');
  const [createProfileAllowed, setCreateProfileAllowed] = useState(!supabase);
  const [walkinSuccessMsg, setWalkinSuccessMsg] = useState('');

  // Slot Checker State
  const [slotDoctorId, setSlotDoctorId] = useState('');
  const [slotDate, setSlotDate] = useState(() => new Date().toISOString().split('T')[0]);

  React.useEffect(() => {
    return store.subscribe ? store.subscribe(() => {
      setAppointments(store.getAppointments());
      setRevenue(store.getRevenue());
      setUsers(store.getUsers());
    }) : undefined;
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];
  const doctors = users.filter((u) => u.role === 'doctor');

  React.useEffect(() => {
    if (doctors.length > 0) {
      if (!doctors.some((doctor) => doctor.id === walkinDoctorId)) {
        setWalkinDoctorId(doctors[0].id);
      }
      if (!doctors.some((doctor) => doctor.id === slotDoctorId)) {
        setSlotDoctorId(doctors[0].id);
      }
    }
  }, [doctors, walkinDoctorId, slotDoctorId]);

  // Today's appointments
  const todayAppointments = useMemo(() => {
    return appointments
      .filter((a) => a.date === todayStr)
      .sort((a, b) => a.tokenNumber.localeCompare(b.tokenNumber));
  }, [appointments, todayStr]);

  // Today's revenue ONLY (specifically constrained for receptionist access)
  const todayRevenue = useMemo(() => {
    return revenue.filter((r) => r.date === todayStr);
  }, [revenue, todayStr]);

  const todayTotalCollected = todayRevenue.reduce((acc, cur) => acc + cur.amount, 0);

  const todayCollectionByMode = useMemo(() => {
    const res = { Cash: 0, Card: 0, UPI: 0 };
    todayRevenue.forEach((r) => {
      if (res[r.paymentMethod] !== undefined) {
        res[r.paymentMethod] += r.amount;
      }
    });
    return res;
  }, [todayRevenue]);

  // Status coordinators
  const handleUpdateStatus = (aptId: string, newStatus: Appointment['status']) => {
    store.updateAppointmentStatus(aptId, newStatus);
  };

  const handleOpenFeeModal = (apt: Appointment) => {
    setSelectedAptForFee(apt);
    setFeeAmount(String(apt.feeAmount || 650));
  };

  const handleConfirmFeeCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAptForFee) return;

    store.collectFee(
      selectedAptForFee.id,
      paymentMode,
      currentUser.name
    );

    try {
      await store.flushPendingWrites();
      setSelectedAptForFee(null);
    } catch (error) {
      console.error('Fee collection did not reach the shared database:', error);
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: error instanceof Error ? error.message : 'Fee collection could not be saved.',
      }));
    }
  };

  // Walk-in submission with IHMS profile creation
  const handleWalkInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkinName || !walkinPhone) return;

    let patientId = `walkin-${Date.now().toString(36)}`;
    const effectiveEmail = walkinEmail.trim();

    if (createProfileAllowed) {
      const existingUser = users.find(
        (u) =>
          u.role === 'patient' && (
            u.phone === walkinPhone.trim() ||
            (walkinEmail && u.email.toLowerCase() === walkinEmail.toLowerCase())
          )
      );

      if (existingUser) {
        patientId = existingUser.id;
      } else if (supabase) {
        if (!effectiveEmail) {
          window.dispatchEvent(new CustomEvent('ihms:data-error', {
            detail: 'Enter the patient email address to send a secure portal invitation.',
          }));
          return;
        }
        try {
          const invitedId = await manageStaffAccount({
            action: 'invitePatient',
            name: walkinName.trim(),
            email: effectiveEmail,
            phone: walkinPhone.trim(),
            role: 'patient',
            age: parseInt(walkinAge, 10) || 30,
            gender: walkinGender,
          });
          if (!invitedId) throw new Error('Patient invitation did not return an account id.');
          patientId = invitedId;
        } catch (error) {
          console.error('Could not invite walk-in patient:', error);
          window.dispatchEvent(new CustomEvent('ihms:data-error', {
            detail: error instanceof Error ? error.message : 'Could not create the patient account.',
          }));
          return;
        }
      } else {
        const newUser = store.addUser({
          name: walkinName.trim(),
          email: effectiveEmail,
          phone: walkinPhone.trim(),
          role: 'patient',
          age: parseInt(walkinAge) || 30,
          gender: walkinGender,
          department: 'Walk-in OPD',
          status: 'active',
          password: effectiveEmail || walkinPhone.trim(),
        });
        patientId = newUser.id;
      }
    }

    const assignedDoc = doctors.find((d) => d.id === walkinDoctorId) || doctors[0];
    if (!assignedDoc) {
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: 'No doctors are available. Add a doctor account before registering appointments.',
      }));
      return;
    }

    const newApt = store.addAppointment({
      patientId,
      patientName: walkinName.trim(),
      patientPhone: walkinPhone.trim(),
      patientEmail: effectiveEmail || `${walkinPhone.trim()}@walkin.invalid`,
      patientAge: parseInt(walkinAge) || 30,
      patientGender: walkinGender,
      doctorId: assignedDoc.id,
      doctorName: assignedDoc.name,
      department: assignedDoc.department || 'Outpatient Clinic',
      date: todayStr,
      timeSlot: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'walk_in',
      status: 'waiting', // immediately placed in waiting queue
      reasonForVisit: walkinReason || 'Walk-in immediate medical consultation',
      feeCollected: false,
      feeAmount: 650,
    });

    try {
      await store.flushPendingWrites();
    } catch (error) {
      console.error('Walk-in registration did not reach the shared database:', error);
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: error instanceof Error ? error.message : 'Walk-in appointment could not be saved.',
      }));
      return;
    }
    setWalkinSuccessMsg(
      `Walk-in patient registered successfully! Token Number: ${newApt.tokenNumber}. ${
        createProfileAllowed
          ? supabase
            ? 'A secure portal invitation was sent to the patient.'
            : 'Demo patient account created.'
          : ''
      }`
    );

    // Reset fields
    setWalkinName('');
    setWalkinEmail('');
    setWalkinPhone('');
    setWalkinReason('');

    setTimeout(() => {
      setWalkinSuccessMsg('');
      setActiveTab('queue');
    }, 3200);
  };

  // Standard Available Slots
  const ALL_SLOTS = [
    '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', 
    '11:00 AM', '11:30 AM', '12:00 PM', '02:00 PM', 
    '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM', 
    '04:30 PM', '05:00 PM'
  ];

  // Book from slot checker
  const handleQuickSlotBook = async (slot: string) => {
    const patientName = prompt('Enter Patient Full Name for slot confirmation:');
    if (!patientName) return;
    const patientPhone = prompt('Enter Patient Phone Number:') || '9900112233';

    const selectedDoc = doctors.find((d) => d.id === slotDoctorId) || doctors[0];
    if (!selectedDoc) {
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: 'No doctors are available for slot booking.',
      }));
      return;
    }

    store.addAppointment({
      patientId: `pat-slot-${Date.now().toString(36)}`,
      patientName,
      patientPhone,
      patientEmail: `${patientPhone}@pulsecare.patient`,
      doctorId: selectedDoc.id,
      doctorName: selectedDoc.name,
      department: selectedDoc.department || 'General Medicine',
      date: slotDate,
      timeSlot: slot,
      type: 'online_booking',
      status: 'scheduled',
      reasonForVisit: 'Confirmed appointment through Receptionist Slot Checker',
      feeCollected: false,
      feeAmount: 650,
    });

    try {
      await store.flushPendingWrites();
    } catch (error) {
      console.error('Slot booking did not reach the shared database:', error);
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: error instanceof Error ? error.message : 'Slot booking could not be saved.',
      }));
      return;
    }
    alert(`Slot ${slot} successfully confirmed for ${patientName} on ${slotDate}!`);
  };

  return (
    <div className="space-y-6">
      {/* Reception Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Reception & Patient Flow Coordinator
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
              Front Desk Operations
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Coordinate doctor-patient queues, register walk-in patients with IHMS accounts, collect fees, and inspect today's collection.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto w-full md:w-auto shrink-0">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'queue'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-teal-600" />
            <span>Today's Patient Queue ({todayAppointments.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('fee_collection')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'fee_collection'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ReceiptText className="w-3.5 h-3.5 text-emerald-600" />
            <span>Fee Collection Desk</span>
          </button>
          <button
            onClick={() => setActiveTab('today_collection')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'today_collection'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wallet className="w-3.5 h-3.5 text-blue-600" />
            <span>Today's Collection Only (₹{todayTotalCollected})</span>
          </button>
          <button
            onClick={() => setActiveTab('walk_in')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'walk_in'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
            <span>+ Walk-In Patient Registration</span>
          </button>
          <button
            onClick={() => setActiveTab('slot_checker')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'slot_checker'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5 text-amber-600" />
            <span>Slot Availability Checker</span>
          </button>
        </div>
      </div>

      {/* QUEUE & DOCTOR-PATIENT COORDINATION TAB */}
      {activeTab === 'queue' && (
        <div className="space-y-6">
          {/* Quick Queue Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-medium text-slate-500">Total Tokens Today</span>
              <p className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
                {todayAppointments.length}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Scheduled + Walk-in patients</p>
            </div>

            <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-200 shadow-2xs">
              <span className="text-xs font-semibold text-blue-800">Waiting in Lounge</span>
              <p className="text-2xl font-bold font-mono text-blue-950 mt-1 tabular-nums">
                {todayAppointments.filter((a) => a.status === 'waiting').length}
              </p>
              <p className="text-[11px] text-blue-700 mt-1">Ready for doctor chamber</p>
            </div>

            <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 shadow-2xs">
              <span className="text-xs font-semibold text-amber-800">In Doctor Chamber</span>
              <p className="text-2xl font-bold font-mono text-amber-950 mt-1 tabular-nums">
                {todayAppointments.filter((a) => a.status === 'in_consultation').length}
              </p>
              <p className="text-[11px] text-amber-700 mt-1">Consultation active now</p>
            </div>

            <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200 shadow-2xs">
              <span className="text-xs font-semibold text-emerald-800">Consultation Completed</span>
              <p className="text-2xl font-bold font-mono text-emerald-950 mt-1 tabular-nums">
                {todayAppointments.filter((a) => a.status === 'completed').length}
              </p>
              <p className="text-[11px] text-emerald-700 mt-1">Rx generated and closed</p>
            </div>
          </div>

          {/* Today's Queue Management Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Live Patient Queue & Doctor Chamber Dispatcher
                </h2>
                <p className="text-xs text-slate-500">
                  Update patient arrival, dispatch to doctor's chamber, or review fee collection
                </p>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search token / patient name..."
                  value={queueSearch}
                  onChange={(e) => setQueueSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-teal-600"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">Token #</th>
                    <th className="py-2.5 px-4">Patient Name & Contact</th>
                    <th className="py-2.5 px-4">Consultant Doctor</th>
                    <th className="py-2.5 px-4">Slot Time</th>
                    <th className="py-2.5 px-4">Current Queue Status</th>
                    <th className="py-2.5 px-4">Fee Entry</th>
                    <th className="py-2.5 px-4">Chamber Coordination Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {todayAppointments
                    .filter(
                      (a) =>
                        a.patientName.toLowerCase().includes(queueSearch.toLowerCase()) ||
                        a.tokenNumber.toLowerCase().includes(queueSearch.toLowerCase())
                    )
                    .map((apt) => (
                      <tr key={apt.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 font-mono font-bold text-teal-800">
                          {apt.tokenNumber}
                          {apt.type === 'walk_in' && (
                            <span className="block text-[10px] text-amber-700 font-sans font-medium">Walk-in</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          <p className="font-semibold text-slate-900">{apt.patientName}</p>
                          <p className="text-[11px] text-slate-500">{apt.patientPhone}</p>
                        </td>
                        <td className="py-2.5 px-4">
                          <p className="font-semibold text-slate-800">{apt.doctorName}</p>
                          <p className="text-[11px] text-slate-500">{apt.department}</p>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">{apt.timeSlot}</td>
                        <td className="py-2.5 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
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
                              Paid ₹{apt.feeAmount} ({apt.paymentMethod})
                            </span>
                          ) : (
                            <button
                              onClick={() => handleOpenFeeModal(apt)}
                              className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[10px] font-semibold transition-colors"
                            >
                              Collect ₹{apt.feeAmount}
                            </button>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-1.5">
                            {apt.status === 'scheduled' && (
                              <button
                                onClick={() => handleUpdateStatus(apt.id, 'waiting')}
                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-medium transition-colors"
                              >
                                Mark Arrived
                              </button>
                            )}
                            {apt.status === 'waiting' && (
                              <button
                                onClick={() => handleUpdateStatus(apt.id, 'in_consultation')}
                                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-medium flex items-center gap-1 transition-colors"
                              >
                                <span>Send to Doctor</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                            {apt.status === 'in_consultation' && (
                              <button
                                onClick={() => handleUpdateStatus(apt.id, 'completed')}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-medium transition-colors"
                              >
                                Complete Visit
                              </button>
                            )}
                            {apt.status === 'completed' && (
                              <span className="text-slate-400 text-[11px]">Visit Completed</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* FEE COLLECTION COUNTER TAB */}
      {activeTab === 'fee_collection' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="pb-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">
                Patient Fee Collection & Billing Entry Desk
              </h2>
              <p className="text-xs text-slate-500">
                Collect consultation fees, OPD walk-in registrations, and sync instantly with Admin revenue records
              </p>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">Token #</th>
                    <th className="py-2.5 px-4">Patient Name</th>
                    <th className="py-2.5 px-4">Phone</th>
                    <th className="py-2.5 px-4">Consultant Doctor</th>
                    <th className="py-2.5 px-4">Due Amount</th>
                    <th className="py-2.5 px-4">Billing Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {appointments
                    .filter((a) => !a.feeCollected)
                    .map((apt) => (
                      <tr key={apt.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 font-mono font-bold text-teal-800">{apt.tokenNumber}</td>
                        <td className="py-2.5 px-4 font-semibold text-slate-900">{apt.patientName}</td>
                        <td className="py-2.5 px-4 text-slate-600">{apt.patientPhone}</td>
                        <td className="py-2.5 px-4 text-slate-700">{apt.doctorName}</td>
                        <td className="py-2.5 px-4 font-bold font-mono text-amber-700 tabular-nums">
                          ₹{apt.feeAmount}
                        </td>
                        <td className="py-2.5 px-4">
                          <button
                            onClick={() => handleOpenFeeModal(apt)}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors"
                          >
                            <ReceiptText className="w-3.5 h-3.5" />
                            <span>Collect & Make Entry</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  {appointments.filter((a) => !a.feeCollected).length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        All patient consultation fees are up to date! No pending bills.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TODAY'S COLLECTION ONLY (Constrained Receptionist View as requested) */}
      {activeTab === 'today_collection' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Today's Reception Cash Drawer & Digital Collection
                </h2>
                <p className="text-xs text-slate-500">
                  Receptionist view constrained strictly to Today's Collection ({todayStr})
                </p>
              </div>

              <button
                onClick={() => window.print()}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Daily Counter Report</span>
              </button>
            </div>

            {/* Today's Mode Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-5">
              <div className="bg-teal-50/70 p-4 rounded-xl border border-teal-200">
                <span className="text-xs font-semibold text-teal-800">Total Collected Today</span>
                <p className="text-2xl font-bold font-mono text-teal-950 mt-1 tabular-nums">
                  ₹{todayTotalCollected.toLocaleString()}
                </p>
                <p className="text-[11px] text-teal-700 mt-1">
                  {todayRevenue.length} payments collected
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-600 text-xs font-semibold">
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Cash in Counter Drawer</span>
                </div>
                <p className="text-xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
                  ₹{todayCollectionByMode.Cash.toLocaleString()}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Physical currency to settle</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-600 text-xs font-semibold">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>UPI QR Receipts</span>
                </div>
                <p className="text-xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
                  ₹{todayCollectionByMode.UPI.toLocaleString()}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Direct bank credit</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-600 text-xs font-semibold">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>POS Card Swipe</span>
                </div>
                <p className="text-xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
                  ₹{todayCollectionByMode.Card.toLocaleString()}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Terminal batch settlement</p>
              </div>
            </div>
          </div>

          {/* Today's Transactions Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Today's Itemized Receipts ({todayStr})
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {todayRevenue.length} Entries Today
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">Receipt Time</th>
                    <th className="py-2.5 px-4">Patient Name</th>
                    <th className="py-2.5 px-4">Fee Category</th>
                    <th className="py-2.5 px-4">Payment Method</th>
                    <th className="py-2.5 px-4">Amount</th>
                    <th className="py-2.5 px-4">Counter Operator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {todayRevenue.map((rev) => (
                    <tr key={rev.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono text-slate-600">{rev.time}</td>
                      <td className="py-2.5 px-4 font-semibold text-slate-900">{rev.patientName}</td>
                      <td className="py-2.5 px-4 text-slate-700">{rev.category}</td>
                      <td className="py-2.5 px-4">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 border border-slate-200 text-slate-800">
                          {rev.paymentMethod}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-bold font-mono text-teal-800 tabular-nums">
                        ₹{rev.amount.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 text-[11px]">{rev.collectedBy}</td>
                    </tr>
                  ))}
                  {todayRevenue.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No payments collected yet today.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* WALK-IN PATIENT REGISTRATION WITH PROFILE CREATION TAB */}
      {activeTab === 'walk_in' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs max-w-2xl">
            <div className="pb-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">
                Walk-In Patient Registration & Account Provisioning
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Collect walk-in details and assign an OPD token; portal access is created only through a secure invitation
              </p>
            </div>

            {walkinSuccessMsg && (
              <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{walkinSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleWalkInSubmit} className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Patient Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kavita Sundaram"
                  value={walkinName}
                  onChange={(e) => setWalkinName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Mobile Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="9844556677"
                    value={walkinPhone}
                    onChange={(e) => setWalkinPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="patient@gmail.com"
                    value={walkinEmail}
                    onChange={(e) => setWalkinEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Age</label>
                  <input
                    type="number"
                    value={walkinAge}
                    onChange={(e) => setWalkinAge(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Gender</label>
                  <select
                    value={walkinGender}
                    onChange={(e) => setWalkinGender(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Reason for Hospital Visit *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Primary complaints / symptoms (e.g. Acute stomach pain, high fever)"
                  value={walkinReason}
                  onChange={(e) => setWalkinReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Assign Doctor Chamber *</label>
                <select
                  value={walkinDoctorId}
                  onChange={(e) => setWalkinDoctorId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                >
                  {doctors.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name} — {doc.department} ({doc.specialty})
                    </option>
                  ))}
                </select>
              </div>

              {/* Patient Permission for Profile Creation (Specific user requirement) */}
              <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-xl space-y-1.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createProfileAllowed}
                    onChange={(e) => setCreateProfileAllowed(e.target.checked)}
                    className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="font-bold text-teal-950">
                      Send the patient a secure IHMS portal invitation?
                    </span>
                    <p className="text-[11px] text-teal-800 mt-0.5">
                      If accepted: send an account invitation to the patient's email. They set their own password before accessing records.
                    </p>
                  </div>
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg shadow-2xs transition-colors flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>Register Walk-in Patient & Issue Token</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SLOT AVAILABILITY CHECKER & CONFIRMATION TAB */}
      {activeTab === 'slot_checker' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="pb-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Doctor Slot Availability Checker & Confirmation Matrix
                </h2>
                <p className="text-xs text-slate-500">
                  Check available consultation slots and confirm appointments directly for calling or in-person patients
                </p>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={slotDoctorId}
                  onChange={(e) => setSlotDoctorId(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                >
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.department})
                    </option>
                  ))}
                </select>

                <input
                  type="date"
                  value={slotDate}
                  onChange={(e) => setSlotDate(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {/* Slot Matrix Grid */}
            <div className="mt-5">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide block mb-3">
                Available Slots for {slotDate}
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                {ALL_SLOTS.map((slot) => {
                  const isBooked = appointments.some(
                    (a) =>
                      a.doctorId === slotDoctorId &&
                      a.date === slotDate &&
                      a.timeSlot === slot &&
                      a.status !== 'cancelled'
                  );

                  return (
                    <div
                      key={slot}
                      className={`p-3 rounded-xl border text-center text-xs transition-all ${
                        isBooked
                          ? 'bg-rose-50/60 border-rose-200 text-rose-800'
                          : 'bg-emerald-50/50 border-emerald-200 text-emerald-900 hover:border-emerald-500'
                      }`}
                    >
                      <span className="font-mono font-bold block">{slot}</span>
                      <span className="text-[10px] mt-1 block font-semibold uppercase">
                        {isBooked ? 'Booked' : 'Available'}
                      </span>

                      {!isBooked && (
                        <button
                          onClick={() => handleQuickSlotBook(slot)}
                          className="mt-2 w-full py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-semibold transition-colors"
                        >
                          Book Slot
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COLLECT FEE MODAL */}
      {selectedAptForFee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-auto max-h-[90vh] flex flex-col">
            <div className="px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-slate-900">
                Collect Consultation Fee & Record Entry
              </h3>
              <button
                onClick={() => setSelectedAptForFee(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmFeeCollection} className="p-5 sm:p-6 space-y-4 text-xs overflow-y-auto grow">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-teal-800">{selectedAptForFee.tokenNumber}</span>
                  <span className="text-slate-500">{selectedAptForFee.timeSlot}</span>
                </div>
                <p className="font-bold text-slate-900 text-sm">{selectedAptForFee.patientName}</p>
                <p className="text-slate-500">Doctor: {selectedAptForFee.doctorName}</p>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Fee Amount (₹)</label>
                <input
                  type="number"
                  required
                  value={feeAmount}
                  readOnly
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600 font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Cash', 'UPI', 'Card'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMode(mode)}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                        paymentMode === mode
                          ? 'bg-teal-600 text-white border-teal-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedAptForFee(null)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-2xs"
                >
                  Confirm ₹{feeAmount} Received
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
