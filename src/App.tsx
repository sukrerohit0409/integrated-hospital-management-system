import React, { useState, useEffect } from 'react';
import { User, UserRole } from './types';
import { store } from './data/store';
import { Navbar } from './components/Navbar';
import { LoginModal } from './components/LoginModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { ManagerDashboard } from './components/manager/ManagerDashboard';
import { DoctorDashboard } from './components/doctor/DoctorDashboard';
import { ReceptionistDashboard } from './components/receptionist/ReceptionistDashboard';
import { StaffDashboard } from './components/staff/StaffDashboard';
import { PatientDashboard } from './components/patient/PatientDashboard';
import { Building2, Phone, ShieldCheck, HeartHandshake, Stethoscope, Clock } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => store.getCurrentUser());
  const [syncError, setSyncError] = useState<string | null>(() => store.getSyncError());
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);

  // Sync state if store changes externally
  useEffect(() => {
    return store.subscribe ? store.subscribe(() => {
      setCurrentUser(store.getCurrentUser());
      setSyncError(store.getSyncError());
    }) : undefined;
  }, []);

  const handleLogout = () => {
    store.setCurrentUser(null);
    setCurrentUser(null);
    setIsLoginModalOpen(true);
  };

  const handleLoginSuccess = (user: User) => {
    store.setCurrentUser(user);
    setCurrentUser(user);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Navbar */}
      <Navbar
        currentUser={currentUser}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        onOpenChangePassword={() => setIsChangePasswordModalOpen(true)}
        onLogout={handleLogout}
      />

      {syncError && (
        <div role="alert" className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          Shared demo data sync issue: {syncError}
        </div>
      )}

      {/* Main Hospital Workspace */}
      <main className="grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentUser ? (
          <>
            {currentUser.role === 'admin' && <AdminDashboard />}
            {currentUser.role === 'manager' && <ManagerDashboard />}
            {currentUser.role === 'doctor' && <DoctorDashboard currentUser={currentUser} />}
            {currentUser.role === 'receptionist' && <ReceptionistDashboard />}
            {(currentUser.role === 'nurse' ||
              currentUser.role === 'cleaner' ||
              currentUser.role === 'ward_boy' ||
              currentUser.role === 'other') && (
              <StaffDashboard currentUser={currentUser} />
            )}
            {currentUser.role === 'patient' && <PatientDashboard currentUser={currentUser} />}
          </>
        ) : (
          <div className="py-16 text-center max-w-xl mx-auto space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-teal-600 text-white flex items-center justify-center mx-auto shadow-md">
              <Building2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              Integrated Hospital Management System
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Please sign in to access your designated hospital workspace.
            </p>
            <div className="pt-2">
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Sign In to Portal
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 px-4 text-xs text-slate-500 no-print mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-teal-700 text-white flex items-center justify-center font-bold text-xs">
              +
            </div>
            <span className="font-bold text-slate-800">PulseCare IHMS</span>
            <span>·</span>
            <span>Integrated Hospital Management System</span>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-1 text-teal-800 font-semibold">
              <Phone className="w-3.5 h-3.5 text-teal-600" />
              24/7 Emergency: +91 1122334455
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
              NABH & ISO 9001 Certified Clinical Center
            </span>
          </div>
        </div>
      </footer>

      {/* Login & Registration Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
        currentUser={currentUser}
      />
    </div>
  );
}
