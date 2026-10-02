import React, { useState, useMemo } from 'react';
import { User, Appointment, Prescription, Tablet } from '../../types';
import { store } from '../../data/store';
import { 
  Stethoscope, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  Plus, 
  Trash2, 
  Printer, 
  AlertTriangle, 
  FileText,
  UserCheck,
  Search,
  ArrowLeft
} from 'lucide-react';
import { PrintPrescriptionModal } from '../PrintPrescriptionModal';
import { getLocalDateString } from '../../utils/date';

interface DoctorDashboardProps {
  currentUser: User | null;
}

export const DoctorDashboard: React.FC<DoctorDashboardProps> = ({ currentUser }) => {
  // Filters: now, upcoming, completed
  const [filter, setFilter] = useState<'now' | 'upcoming' | 'completed'>('now');

  const [appointments, setAppointments] = useState<Appointment[]>(() => store.getAppointments());
  const [search, setSearch] = useState('');

  // Consultation Workspace Modal
  const [activeConsultationApt, setActiveConsultationApt] = useState<Appointment | null>(null);

  // Consultation Form State (Prescribed tablets default to 2 blank rows as requested)
  const [diagnosis, setDiagnosis] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [tablets, setTablets] = useState<Tablet[]>([
    { name: '', dosage: '', frequency: '', duration: '', instructions: '' },
    { name: '', dosage: '', frequency: '', duration: '', instructions: '' }
  ]);
  const [avoidList, setAvoidList] = useState<string[]>([
    'Avoid cold drinks, oily fried food, and ice creams',
    'Avoid heavy physical strain and irregular sleep'
  ]);
  const [newAvoidItem, setNewAvoidItem] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [doctorNotes, setDoctorNotes] = useState('');

  // Print Modal State
  const [printPrescription, setPrintPrescription] = useState<Prescription | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  React.useEffect(() => {
    return store.subscribe ? store.subscribe(() => {
      setAppointments(store.getAppointments());
    }) : undefined;
  }, []);

  const todayStr = getLocalDateString();
  const doctorId = currentUser?.id || 'u-doc-1';

  // Filter doctor's appointments
  const doctorAppointments = useMemo(() => {
    return appointments.filter((a) => {
      if (currentUser?.role === 'doctor') {
        return a.doctorId === doctorId;
      }
      return true;
    });
  }, [appointments, currentUser, doctorId]);

  // Specific 3 filters requested: now, upcoming, completed
  const filteredAppointments = useMemo(() => {
    return doctorAppointments.filter((a) => {
      const matchSearch =
        a.patientName.toLowerCase().includes(search.toLowerCase()) ||
        a.tokenNumber.toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;

      if (filter === 'now') {
        // Patients currently in consultation or waiting in lounge today
        return (a.status === 'in_consultation' || a.status === 'waiting') && a.date === todayStr;
      }
      if (filter === 'upcoming') {
        // Scheduled appointments for today later or future dates
        return a.status === 'scheduled' || (a.date > todayStr && a.status !== 'completed' && a.status !== 'cancelled');
      }
      if (filter === 'completed') {
        // Consulted patients with prescriptions
        return a.status === 'completed';
      }
      return true;
    });
  }, [doctorAppointments, filter, search, todayStr]);

  // Open Consultation
  const handleStartConsultation = (apt: Appointment) => {
    setActiveConsultationApt(apt);
    setDiagnosis(apt.prescription?.diagnosis || '');
    setSymptoms(apt.prescription?.symptoms || apt.reasonForVisit || '');
    
    // When doctor makes prescription, tablets table starts blank with exactly 2 blank rows
    setTablets(
      apt.prescription?.tablets && apt.prescription.tablets.length > 0
        ? apt.prescription.tablets
        : [
            { name: '', dosage: '', frequency: '', duration: '', instructions: '' },
            { name: '', dosage: '', frequency: '', duration: '', instructions: '' },
          ]
    );
    setAvoidList(
      apt.prescription?.thingsToAvoid || [
        'Avoid chilled beverages and processed sugars',
        'Avoid strenuous lifting and late-night exhaustion',
      ]
    );
    setFollowUpDate(apt.prescription?.followUpDate || getLocalDateString(7));
    setDoctorNotes(apt.prescription?.doctorNotes || 'Maintain adequate hydration and monitor symptoms.');

    // If waiting, update status to in_consultation
    if (apt.status === 'waiting' || apt.status === 'scheduled') {
      store.updateAppointmentStatus(apt.id, 'in_consultation');
    }
  };

  // Add Tablet Row (Blank row for doctor to fill)
  const handleAddTabletRow = () => {
    setTablets([
      ...tablets,
      { name: '', dosage: '', frequency: '', duration: '', instructions: '' },
    ]);
  };

  const handleUpdateTablet = (index: number, field: keyof Tablet, val: string) => {
    const updated = [...tablets];
    updated[index] = { ...updated[index], [field]: val };
    setTablets(updated);
  };

  const handleRemoveTablet = (index: number) => {
    setTablets(tablets.filter((_, i) => i !== index));
  };

  const handleAddAvoidItem = () => {
    if (newAvoidItem.trim()) {
      setAvoidList([...avoidList, newAvoidItem.trim()]);
      setNewAvoidItem('');
    }
  };

  const handleRemoveAvoidItem = (index: number) => {
    setAvoidList(avoidList.filter((_, i) => i !== index));
  };

  // Submit Consultation & Generate Prescription
  const handleSaveConsultation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConsultationApt) return;

    const validTablets = tablets.filter((t) => t.name.trim() !== '');

    const savedRx = store.savePrescription(activeConsultationApt.id, {
      doctorId: currentUser?.id || 'u-doc-1',
      doctorName: currentUser?.name || 'Dr. Aryan Sharma',
      doctorSpecialty: currentUser?.specialty || 'Consultant Physician',
      patientId: activeConsultationApt.patientId,
      patientName: activeConsultationApt.patientName,
      patientAge: activeConsultationApt.patientAge,
      patientGender: activeConsultationApt.patientGender,
      patientPhone: activeConsultationApt.patientPhone,
      patientEmail: activeConsultationApt.patientEmail,
      date: todayStr,
      diagnosis: diagnosis || 'General Clinical Evaluation & Consultation',
      symptoms,
      tablets: validTablets.length > 0 ? validTablets : [
        { name: 'Standard Medication', dosage: 'As directed', frequency: 'Once daily', duration: '5 Days', instructions: 'After meals' }
      ],
      thingsToAvoid: avoidList,
      followUpDate: followUpDate || undefined,
      doctorNotes,
    });

    setActiveConsultationApt(null);

    // Open print preview immediately with Back button and Print button
    setPrintPrescription(savedRx);
    setIsPrintModalOpen(true);
  };

  const handleOpenPrint = (apt: Appointment) => {
    if (apt.prescription) {
      setPrintPrescription(apt.prescription);
      setIsPrintModalOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Doctor Top Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-teal-100 border border-teal-200 shrink-0">
            {currentUser?.avatar ? (
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-teal-800 font-bold text-lg sm:text-xl">
                Dr
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {currentUser?.name || 'Dr. Aryan Sharma'}
              </h1>
              <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-800 font-semibold shrink-0">
                OPD Chamber 4
              </span>
            </div>
            <p className="text-xs text-teal-700 font-medium truncate">
              {currentUser?.specialty || 'Consultant Cardiologist & Physician'} · {currentUser?.qualification || 'MBBS, MD'}
            </p>
            <p className="text-[11px] text-slate-500 truncate">
              Department: {currentUser?.department || 'Internal Medicine'} · Available for consultations
            </p>
          </div>
        </div>

        {/* 3 Dedicated Filter Buttons requested: now, upcoming, completed */}
        <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-100 p-1 rounded-xl overflow-x-auto w-full lg:w-auto shrink-0">
          <button
            onClick={() => setFilter('now')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              filter === 'now'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Now / Queue ({doctorAppointments.filter((a) => (a.status === 'in_consultation' || a.status === 'waiting') && a.date === todayStr).length})</span>
          </button>

          <button
            onClick={() => setFilter('upcoming')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              filter === 'upcoming'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>Upcoming ({doctorAppointments.filter((a) => a.status === 'scheduled' || a.date > todayStr).length})</span>
          </button>

          <button
            onClick={() => setFilter('completed')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              filter === 'completed'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>Completed ({doctorAppointments.filter((a) => a.status === 'completed').length})</span>
          </button>
        </div>
      </div>

      {/* Appointment Cards / Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 capitalize">
              {filter === 'now' ? "Current Active Consultations & Patients Waiting" : `${filter} Patient Appointments`}
            </h2>
            <p className="text-xs text-slate-500">
              {filter === 'now'
                ? "Immediate clinical consultations in doctor chamber or next in lounge"
                : filter === 'upcoming'
                ? "Scheduled slots for upcoming hours and future dates"
                : "Finished consultations with generated prescriptions and follow-up schedules"}
            </p>
          </div>

          <div className="relative w-full sm:w-auto">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search patient name / token..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64 pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-teal-600"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {filteredAppointments.map((apt) => (
            <div
              key={apt.id}
              className={`p-4 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                apt.status === 'in_consultation' ? 'bg-amber-50/40' : 'hover:bg-slate-50/70'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-teal-800 bg-teal-100/70 px-2 py-0.5 rounded text-xs">
                    {apt.tokenNumber}
                  </span>
                  <span className="text-sm font-bold text-slate-900">{apt.patientName}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-xs text-slate-600 font-medium">
                    {apt.patientAge || '32'} Yrs · {apt.patientGender || 'Unspecified'}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
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
                </div>

                <div className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Reason / Chief Complaints:</span> {apt.reasonForVisit}
                </div>

                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span>Slot: <strong className="text-slate-700 font-mono">{apt.date} at {apt.timeSlot}</strong></span>
                  <span>·</span>
                  <span>Phone: <strong className="text-slate-700">{apt.patientPhone}</strong></span>
                  {apt.prescription?.followUpDate && (
                    <>
                      <span>·</span>
                      <span className="text-teal-700 font-semibold">
                        Follow-up: {apt.prescription.followUpDate}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Consultation and Prescription Action Buttons */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap w-full md:w-auto justify-end">
                {apt.status !== 'completed' ? (
                  <button
                    onClick={() => handleStartConsultation(apt)}
                    className="w-full md:w-auto px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
                  >
                    <Stethoscope className="w-3.5 h-3.5" />
                    <span>{apt.status === 'in_consultation' ? 'Resume Consultation' : 'Consult Patient'}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-end">
                    <button
                      onClick={() => handleStartConsultation(apt)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-xs flex items-center gap-1 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-500" />
                      <span>Edit Rx</span>
                    </button>

                    <button
                      onClick={() => handleOpenPrint(apt)}
                      className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 shadow-2xs transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Prescription</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {filteredAppointments.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-xs">
              No appointments found under the '{filter}' category.
            </div>
          )}
        </div>
      </div>

      {/* PATIENT CONSULTATION & PRESCRIPTION WORKSPACE MODAL */}
      {activeConsultationApt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[95vh] flex flex-col">
            {/* Header */}
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0 gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setActiveConsultationApt(null)}
                  className="px-2.5 sm:px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline">Back</span>
                </button>
                <div className="flex items-center gap-2 min-w-0">
                  <Stethoscope className="w-5 h-5 text-teal-600 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                      Doctor Consultation & Prescription
                    </h3>
                    <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                      Token #{activeConsultationApt.tokenNumber} · {activeConsultationApt.patientName}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveConsultationApt(null)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1 cursor-pointer"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveConsultation} className="p-4 sm:p-6 space-y-4 sm:space-y-5 text-xs overflow-y-auto grow">
              {/* Patient Banner */}
              <div className="p-4 bg-teal-50/70 border border-teal-200 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-800">
                <div>
                  <span className="text-[10px] text-teal-800 uppercase tracking-wide block">Patient Name</span>
                  <span className="font-bold text-sm text-slate-900">{activeConsultationApt.patientName}</span>
                </div>
                <div>
                  <span className="text-[10px] text-teal-800 uppercase tracking-wide block">Age / Gender</span>
                  <span className="font-semibold text-slate-900">
                    {activeConsultationApt.patientAge || '32'} Yrs · {activeConsultationApt.patientGender || 'Unspecified'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-teal-800 uppercase tracking-wide block">Phone</span>
                  <span className="font-semibold text-slate-900">{activeConsultationApt.patientPhone}</span>
                </div>
                <div>
                  <span className="text-[10px] text-teal-800 uppercase tracking-wide block">Email</span>
                  <span className="font-semibold text-slate-900 truncate block">{activeConsultationApt.patientEmail}</span>
                </div>
              </div>

              {/* Diagnosis and Symptoms */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Clinical Diagnosis *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Acute Bronchitis / Essential Hypertension"
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Presenting Symptoms & Examination Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Dry cough, chest discomfort, fever 101 F"
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  />
                </div>
              </div>

              {/* Tablets / Medications Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                    <span className="font-serif text-teal-700 text-sm">℞</span>
                    <span>Prescribed Tablets & Medications</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddTabletRow}
                    className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Tablet / Medicine</span>
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[580px]">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                      <tr>
                        <th className="py-2 px-3">Medicine / Tablet Name</th>
                        <th className="py-2 px-3">Dosage</th>
                        <th className="py-2 px-3">Frequency</th>
                        <th className="py-2 px-3">Duration</th>
                        <th className="py-2 px-3">Instructions</th>
                        <th className="py-2 px-2 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tablets.map((tab, idx) => (
                        <tr key={idx} className="bg-white">
                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="e.g. Tab Azithromycin"
                              value={tab.name}
                              onChange={(e) => handleUpdateTablet(idx, 'name', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-200 rounded focus:outline-teal-600 font-semibold text-slate-900"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="e.g. 500mg"
                              value={tab.dosage}
                              onChange={(e) => handleUpdateTablet(idx, 'dosage', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-200 rounded focus:outline-teal-600 font-mono"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="1-0-1"
                              value={tab.frequency}
                              onChange={(e) => handleUpdateTablet(idx, 'frequency', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-200 rounded focus:outline-teal-600"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="5 Days"
                              value={tab.duration}
                              onChange={(e) => handleUpdateTablet(idx, 'duration', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-200 rounded focus:outline-teal-600"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="After meals"
                              value={tab.instructions}
                              onChange={(e) => handleUpdateTablet(idx, 'instructions', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-200 rounded focus:outline-teal-600"
                            />
                          </td>
                          <td className="p-2 text-center">
                            {tablets.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveTablet(idx)}
                                className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Things to Avoid Section (Requested by user) */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Things to Avoid (Dietary, Physical & Lifestyle Restrictions)</span>
                </div>

                <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Add an item to avoid (e.g. Avoid dairy, cold drinks, heavy exercise)..."
                      value={newAvoidItem}
                      onChange={(e) => setNewAvoidItem(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddAvoidItem();
                        }
                      }}
                      className="grow px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddAvoidItem}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold"
                    >
                      Add
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {avoidList.map((item, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-amber-300 text-amber-900 rounded-md text-xs"
                      >
                        <span>{item}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAvoidItem(idx)}
                          className="text-amber-500 hover:text-amber-800 ml-1 font-bold"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Follow-up Date (Reflects to Patient Panel as requested) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="block text-slate-800 font-bold mb-1">
                    Next Follow-up Visit Date
                  </label>
                  <p className="text-[11px] text-slate-500 mb-2">
                    This follow-up date will reflect on the patient's panel where they can directly confirm appointment or skip it.
                  </p>
                  <input
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600 bg-white font-mono text-xs font-bold text-teal-800"
                  />
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="block text-slate-800 font-bold mb-1">
                    Doctor Advice & Special Instructions
                  </label>
                  <textarea
                    rows={3}
                    placeholder="General advice on hydration, resting, emergency triggers..."
                    value={doctorNotes}
                    onChange={(e) => setDoctorNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600 bg-white text-xs"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-200 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setActiveConsultationApt(null)}
                  className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Appointments</span>
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Prescription & Complete Visit</span>
                </button>
              </div>
            </form>
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
