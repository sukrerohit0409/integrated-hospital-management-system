import React, { useState, useEffect, useRef } from 'react';
import { User } from './types';
import { store } from './data/store';
import { clearSharedStore, initializeSharedStore } from './data/store';
import { getSignedInProfile } from './data/auth';
import { supabase } from './lib/supabase';
import { Navbar } from './components/Navbar';
import { LoginModal } from './components/LoginModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { ManagerDashboard } from './components/manager/ManagerDashboard';
import { DoctorDashboard } from './components/doctor/DoctorDashboard';
import { ReceptionistDashboard } from './components/receptionist/ReceptionistDashboard';
import { StaffDashboard } from './components/staff/StaffDashboard';
import { PatientDashboard } from './components/patient/PatientDashboard';
import { PublicWebsite } from './components/PublicWebsite';

function hasPasswordRecoveryMarker(): boolean {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(window.location.search);
  return hashParams.get('type') === 'recovery' || searchParams.get('type') === 'recovery';
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(
    () => import.meta.env.DEV && !supabase ? store.getCurrentUser() : null
  );
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [pendingPostLoginAction, setPendingPostLoginAction] = useState<'book' | null>(null);
  const [openPatientBooking, setOpenPatientBooking] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(hasPasswordRecoveryMarker);
  const [isLoadingSharedData, setIsLoadingSharedData] = useState(Boolean(supabase));
  const [dataError, setDataError] = useState('');
  const stopSharedSync = useRef<(() => void) | null>(null);
  const sessionLoadId = useRef(0);
  const activeUserIdRef = useRef<string | null>(null);

  // Sync state if store changes externally
  useEffect(() => {
    if (supabase) {
      let active = true;
      const restoreSession = async () => {
        const loadId = ++sessionLoadId.current;
        setIsLoadingSharedData(true);
        setDataError('');
        try {
          const user = await getSignedInProfile();
          if (!active || loadId !== sessionLoadId.current) return;
          if (!user) {
            stopSharedSync.current?.();
            stopSharedSync.current = null;
            clearSharedStore();
            if (active) setCurrentUser(null);
            return;
          }
          store.setCurrentUser(user);
          setIsChangePasswordModalOpen(Boolean(user.mustSetPassword));
          activeUserIdRef.current = user.id;
          const stopSync = await initializeSharedStore();
          if (!active || loadId !== sessionLoadId.current) {
            stopSync();
            return;
          }
          stopSharedSync.current?.();
          stopSharedSync.current = stopSync;
          if (active) setCurrentUser(user);
        } catch (error) {
          if (loadId !== sessionLoadId.current) return;
          console.error('Unable to initialize shared hospital data:', error);
          if (active) {
            setCurrentUser(null);
            setDataError(error instanceof Error ? error.message : 'Could not load shared hospital data.');
          }
        } finally {
          if (active) setIsLoadingSharedData(false);
        }
      };
      void restoreSession();
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
          setIsLoginModalOpen(false);
          setIsChangePasswordModalOpen(true);
        }
        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') return;
        window.setTimeout(() => {
          if (!session) {
            sessionLoadId.current += 1;
            activeUserIdRef.current = null;
            stopSharedSync.current?.();
            stopSharedSync.current = null;
            clearSharedStore();
            if (active) {
              setCurrentUser(null);
              setIsChangePasswordModalOpen(false);
              setIsPasswordRecovery(false);
              setIsLoadingSharedData(false);
            }
            return;
          }
          if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY')
            && session.user.id !== activeUserIdRef.current) {
            void restoreSession();
          }
        }, 0);
      });
      return () => {
        active = false;
        sessionLoadId.current += 1;
        subscription.unsubscribe();
        stopSharedSync.current?.();
      };
    }
    if (import.meta.env.PROD) return;
    return store.subscribe ? store.subscribe(() => {
      setCurrentUser(store.getCurrentUser());
    }) : undefined;
  }, []);

  useEffect(() => {
    const onDataError = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setDataError(detail);
    };
    const onDataSuccess = () => setDataError('');

    window.addEventListener('ihms:data-error', onDataError);
    window.addEventListener('ihms:data-success', onDataSuccess);
    return () => {
      window.removeEventListener('ihms:data-error', onDataError);
      window.removeEventListener('ihms:data-success', onDataSuccess);
    };
  }, []);

  const handleLogout = async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        console.error('Unable to sign out:', error);
        return;
      }
    }
    activeUserIdRef.current = null;
    store.setCurrentUser(null);
    setCurrentUser(null);
    setIsChangePasswordModalOpen(false);
    setIsPasswordRecovery(false);
    setPendingPostLoginAction(null);
    setOpenPatientBooking(false);
    setIsLoginModalOpen(false);
  };

  const handleLoginSuccess = async (user: User) => {
    activeUserIdRef.current = user.id;
    store.setCurrentUser(user);
    setIsPasswordRecovery(false);
    if (pendingPostLoginAction === 'book' && user.role === 'patient') {
      setOpenPatientBooking(true);
    }
    setPendingPostLoginAction(null);
    setIsChangePasswordModalOpen(Boolean(user.mustSetPassword));
    if (supabase) {
      const loadId = ++sessionLoadId.current;
      setIsLoadingSharedData(true);
      setDataError('');
      try {
        const stopSync = await initializeSharedStore();
        if (loadId !== sessionLoadId.current) {
          stopSync();
          return;
        }
        stopSharedSync.current?.();
        stopSharedSync.current = stopSync;
        setCurrentUser(user);
      } catch (error) {
        if (loadId !== sessionLoadId.current) return;
        console.error('Unable to load shared hospital data after sign-in:', error);
        setDataError(error instanceof Error ? error.message : 'Could not load shared hospital data.');
        await supabase.auth.signOut({ scope: 'local' });
      } finally {
        if (loadId === sessionLoadId.current) setIsLoadingSharedData(false);
      }
    } else {
      setCurrentUser(user);
    }
  };

  const handlePasswordUpdated = () => {
    if (!currentUser) return;
    const updatedUser = { ...currentUser, mustSetPassword: false };
    store.setCurrentUser(updatedUser);
    setCurrentUser(updatedUser);
    if (isPasswordRecovery) {
      window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
      setIsPasswordRecovery(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {!currentUser ? (
        <PublicWebsite
          onOpenLogin={() => {
            setPendingPostLoginAction(null);
            setIsLoginModalOpen(true);
          }}
          onBookAppointment={() => {
            setPendingPostLoginAction('book');
            setIsLoginModalOpen(true);
          }}
          showLocalDoctors
        />
      ) : (
        <>
          <Navbar
            currentUser={currentUser}
            onOpenLogin={() => setIsLoginModalOpen(true)}
            onOpenChangePassword={() => setIsChangePasswordModalOpen(true)}
            onLogout={handleLogout}
          />
          <main className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-7xl grow flex-col px-4 py-6 sm:px-6 lg:px-8">
            {dataError && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{dataError}</div>}
            {isLoadingSharedData ? <div className="py-16 text-center text-sm text-slate-600" role="status">Loading your secure hospital workspace…</div> : currentUser.mustSetPassword ? <div className="mx-auto max-w-xl space-y-4 py-16 text-center"><h2 className="text-2xl font-bold text-slate-900">Set up your password</h2><p className="text-sm text-slate-600">Use the invitation link to choose a private password before entering the hospital workspace.</p></div> : <>
              {currentUser.role === 'admin' && <AdminDashboard currentUser={currentUser} />}
              {currentUser.role === 'manager' && <ManagerDashboard currentUser={currentUser} />}
              {currentUser.role === 'doctor' && <DoctorDashboard currentUser={currentUser} />}
              {currentUser.role === 'receptionist' && <ReceptionistDashboard currentUser={currentUser} />}
              {(currentUser.role === 'nurse' || currentUser.role === 'cleaner' || currentUser.role === 'ward_boy' || currentUser.role === 'other') && <StaffDashboard currentUser={currentUser} />}
              {currentUser.role === 'patient' && <PatientDashboard currentUser={currentUser} initialTab={openPatientBooking ? 'book' : 'history'} />}
            </>}
          </main>
        </>
      )}

      {/* Login & Registration Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen || isPasswordRecovery || Boolean(currentUser?.mustSetPassword)}
        onClose={() => {
          if (!currentUser?.mustSetPassword && !isPasswordRecovery) setIsChangePasswordModalOpen(false);
        }}
        currentUser={currentUser}
        onPasswordUpdated={handlePasswordUpdated}
        isPasswordRecovery={isPasswordRecovery}
      />
    </div>
  );
}
