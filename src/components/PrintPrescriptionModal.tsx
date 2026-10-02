import React from 'react';
import { Prescription } from '../types';
import { X, Printer, Building2, Stethoscope, AlertTriangle, Calendar, Phone, Mail, ArrowLeft } from 'lucide-react';

interface PrintPrescriptionModalProps {
  prescription: Prescription | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PrintPrescriptionModal: React.FC<PrintPrescriptionModalProps> = ({
  prescription,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !prescription) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[95vh] flex flex-col">
        {/* Modal Action Bar (Hidden in Print) */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 bg-slate-100 no-print shrink-0 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={onClose}
              className="px-2.5 sm:px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg text-xs flex items-center gap-1.5 shadow-2xs transition-colors shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Back</span>
            </button>
            <div className="flex items-center gap-1.5 min-w-0">
              <Stethoscope className="w-4 h-4 text-teal-600 shrink-0" />
              <span className="text-[11px] sm:text-xs font-bold text-slate-800 uppercase tracking-wide truncate">
                Prescription Slip
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={handlePrint}
              className="print-include px-3 sm:px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
              title="Close and return"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Rx Document */}
        <div className="printable-area p-4 sm:p-8 bg-white text-slate-900 overflow-y-auto grow">
          {/* Hospital Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between pb-4 border-b-2 border-teal-700 gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-teal-700 text-white flex items-center justify-center font-bold text-lg sm:text-xl shrink-0">
                <Building2 className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div>
                <h1 className="text-base sm:text-xl font-extrabold tracking-tight text-slate-900 leading-tight">
                  PULSECARE INTEGRATED HOSPITAL
                </h1>
                <p className="text-[11px] sm:text-xs text-teal-800 font-semibold">
                  Multi-Specialty Clinical Center & Advanced Emergency Care
                </p>
                <p className="text-[10px] sm:text-[11px] text-slate-500">
                  Reg No: IHMS-MH/2026/8941 · 24/7 Helpline: +91 1122334455
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right shrink-0">
              <span className="inline-block px-2.5 py-1 bg-teal-50 border border-teal-200 text-teal-800 font-mono text-xs font-bold rounded">
                Rx Presc #{prescription.id.slice(-6).toUpperCase()}
              </span>
              <p className="text-[11px] text-slate-500 mt-1 font-mono">
                Date: {prescription.date}
              </p>
            </div>
          </div>

          {/* Doctor & Patient Metadata Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 py-4 border-b border-slate-200 text-xs">
            {/* Patient Info */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider">Patient Details</span>
              </div>
              <p className="font-bold text-slate-900 text-sm">{prescription.patientName}</p>
              <div className="flex items-center gap-3 text-slate-600 flex-wrap">
                <span>Age: <strong>{prescription.patientAge || '32'} Yrs</strong></span>
                <span>·</span>
                <span>Gender: <strong>{prescription.patientGender || 'Unspecified'}</strong></span>
              </div>
              <div className="flex items-center gap-3 text-slate-500 text-[11px] flex-wrap">
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3 text-slate-400" />
                  {prescription.patientPhone || 'N/A'}
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3 text-slate-400" />
                  {prescription.patientEmail || 'N/A'}
                </span>
              </div>
            </div>

            {/* Doctor Info */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1 text-left sm:text-right">
              <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider block">Attending Consultant</span>
              <p className="font-bold text-slate-900 text-sm">{prescription.doctorName}</p>
              <p className="text-teal-700 font-medium">{prescription.doctorSpecialty || 'Consultant Physician'}</p>
              <p className="text-slate-500 text-[11px]">Reg: MCI-849302 / Dept. of Medicine</p>
            </div>
          </div>

          {/* Clinical Findings / Diagnosis */}
          <div className="py-4 border-b border-slate-200 space-y-2">
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Clinical Diagnosis & Observations:
              </span>
              <p className="text-sm font-semibold text-slate-900 mt-0.5">
                {prescription.diagnosis}
              </p>
            </div>
            {prescription.symptoms && (
              <div className="text-xs text-slate-600">
                <span className="font-medium text-slate-500">Chief Symptoms:</span> {prescription.symptoms}
              </div>
            )}
          </div>

          {/* Prescribed Tablets / Medications Table */}
          <div className="py-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg font-serif font-bold text-teal-800">℞</span>
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Prescription & Medication Schedule
              </span>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[500px]">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Medicine / Tablet Name</th>
                    <th className="py-2.5 px-3">Dosage</th>
                    <th className="py-2.5 px-3">Frequency</th>
                    <th className="py-2.5 px-3">Duration</th>
                    <th className="py-2.5 px-3">Special Instructions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {prescription.tablets.map((tab, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{tab.name}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{tab.dosage}</td>
                      <td className="py-2.5 px-3 text-slate-700">{tab.frequency}</td>
                      <td className="py-2.5 px-3 text-slate-700">{tab.duration}</td>
                      <td className="py-2.5 px-3 text-slate-600 italic">{tab.instructions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Things to Avoid */}
          {prescription.thingsToAvoid && prescription.thingsToAvoid.length > 0 && (
            <div className="py-3 px-4 bg-amber-50/70 border border-amber-200 rounded-lg text-xs mb-4">
              <div className="flex items-center gap-1.5 text-amber-800 font-bold mb-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Things to Avoid / Dietary & Physical Restrictions:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-amber-900 ml-1">
                {prescription.thingsToAvoid.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Follow-up Date & Doctor Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 py-3 bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs">
            <div>
              <span className="font-bold text-slate-700 block mb-0.5">Next Follow-Up Visit:</span>
              {prescription.followUpDate ? (
                <div className="flex items-center gap-1.5 text-teal-800 font-bold font-mono text-sm">
                  <Calendar className="w-4 h-4 text-teal-600" />
                  <span>{prescription.followUpDate}</span>
                </div>
              ) : (
                <span className="text-slate-500">As needed (SOS)</span>
              )}
            </div>

            <div>
              <span className="font-bold text-slate-700 block mb-0.5">Physician Advice:</span>
              <p className="text-slate-600 text-[11px]">
                {prescription.doctorNotes || 'Maintain prescribed dosage strictly. Hydrate well and report if adverse reactions occur.'}
              </p>
            </div>
          </div>

          {/* Doctor Signature & Stamp Footer */}
          <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 text-xs">
            <div className="text-[10px] text-slate-400 space-y-0.5">
              <p>Pharmacist Verification: Valid only with hospital dispensing seal.</p>
              <p>Generated by PulseCare Integrated Hospital Management System</p>
            </div>

            <div className="text-center w-full sm:w-48">
              <div className="h-10 border-b border-dashed border-slate-400 flex items-center justify-center">
                <span className="font-serif italic text-slate-500 text-xs">{prescription.doctorName} (Signed)</span>
              </div>
              <p className="text-[11px] font-bold text-slate-800 mt-1">Authorized Doctor's Signature</p>
              <p className="text-[10px] text-slate-500">Medical Registration Seal</p>
            </div>
          </div>
        </div>

        {/* Bottom Action Bar for Quick Back and Print (no-print) */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between no-print text-xs">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg flex items-center gap-2 shadow-2xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>← Back to Dashboard</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Prescription (Rx)</span>
          </button>
        </div>
      </div>
    </div>
  );
};

