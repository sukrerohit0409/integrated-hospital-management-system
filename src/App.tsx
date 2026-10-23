import React, { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { User, UserRole } from './types';
import { clearSharedStore, initializeSharedStore, store } from './data/store';
import { getSignedInProfile } from './data/auth';
import { supabase } from './lib/supabase';
import { Navbar } from './components/Navbar';
import { LoginModal } from './components/LoginModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { PublicHospitalHome } from './components/PublicHospitalHome';
import { LoadingScreen } from './components/LoadingScreen';
import { FeedbackBanner } from './components/FeedbackBanner';
import { ButtonActivityFeedback } from './components/ButtonActivityFeedback';
import { EditPatientProfileModal } from './components/EditPatientProfileModal';
import { NotFoundPage } from './components/NotFoundPage';
import { canAccessWorkspaceRoute, defaultWorkspacePath, getAuthorizedDestination, getWorkspaceRoute, navigateTo } from './utils/workspaceRoutes';

const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard').then((module) => ({ default: module.AdminDashboard })));
const ManagerDashboard = lazy(() => import('./components/manager/ManagerDashboard').then((module) => ({ default: module.ManagerDashboard })));
const DoctorDashboard = lazy(() => import('./components/doctor/DoctorDashboard').then((module) => ({ default: module.DoctorDashboard })));
const ReceptionistDashboard = lazy(() => import('./components/receptionist/ReceptionistDashboard').then((module) => ({ default: module.ReceptionistDashboard })));
const StaffDashboard = lazy(() => import('./components/staff/StaffDashboard').then((module) => ({ default: module.StaffDashboard })));
const PatientDashboard = lazy(() => import('./components/patient/PatientDashboard').then((module) => ({ default: module.PatientDashboard })));

function hasPasswordRecoveryMarker(): boolean {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(window.location.search);
  return hashParams.get('type') === 'recovery' || searchParams.get('type') === 'recovery';
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(
    () => import.meta.env.DEV && !supabase ? store.getCurrentUser() : null
  );
  const [routeLocation, setRouteLocation] = useState(() => `${window.location.pathname}${window.location.search}`);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isPatientProfileModalOpen, setIsPatientProfileModalOpen] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(hasPasswordRecoveryMarker);
  const [isLoadingSharedData, setIsLoadingSharedData] = useState(Boolean(supabase));
  const [dataError, setDataError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const stopSharedSync = useRef<(() => void) | null>(null);
  const sessionLoadId = useRef(0);
  const activeUserIdRef = useRef<string | null>(null);
  const successMessageTimer = useRef<number | null>(null);

  useEffect(() => {
    setIsPatientProfileModalOpen(false);
  }, [currentUser?.id]);

  useEffect(() => {
    const updateLocation = () => setRouteLocation(`${window.location.pathname}${window.location.search}`);
    window.addEventListener('popstate', updateLocation);
    return () => window.removeEventListener('popstate', updateLocation);
  }, []);

  // Sync state if store changes externally
  useEffect(() => {
    if (supabase) {
      let active = true;
      // Keep the app shell in sync with profile refreshes and logout cleanup.
      // Dashboards subscribe separately for appointments, attendance and other datasets.
      const unsubscribeStore = store.subscribe(() => {
        const cachedUser = store.getCurrentUser();
        setCurrentUser((current) => {
          if (!cachedUser) return current === null ? current : null;
          if (current && current.id === cachedUser.id && JSON.stringify(current) === JSON.stringify(cachedUser)) {
            return current;
          }
          return cachedUser;
        });
      });

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
        unsubscribeStore();
        stopSharedSync.current?.();
      };
    }
    if (import.meta.env.PROD) return;
    return store.subscribe ? store.subscribe(() => {
      setCurrentUser(store.getCurrentUser());
    }) : undefined;
  }, []);

  // Route authorization is fail-closed: protected dashboards do not render until both
  // the signed-in profile and the user's role match the requested workspace route.
  useEffect(() => {
    if (isLoadingSharedData) return;

    const location = new URL(routeLocation, window.location.origin);
    const path = location.pathname;
    const route = getWorkspaceRoute(path);

    if (path === '/login') {
      if (currentUser) {
        const intendedPath = location.searchParams.get('redirect');
        navigateTo(getAuthorizedDestination(intendedPath, currentUser), true);
        setIsLoginModalOpen(false);
      } else {
        setIsLoginModalOpen(!isPasswordRecovery);
      }
      return;
    }

    if (route) {
      if (!currentUser) {
        setIsLoginModalOpen(true);
        navigateTo(`/login?redirect=${encodeURIComponent(route.path)}`, true);
        return;
      }
      setIsLoginModalOpen(false);
      if (!canAccessWorkspaceRoute(currentUser, route)) {
        navigateTo(defaultWorkspacePath(currentUser), true);
        return;
      }
      if (path !== route.path) navigateTo(route.path, true);
      return;
    }

    if (path === '/') {
      setIsLoginModalOpen(false);
      if (currentUser) navigateTo(defaultWorkspacePath(currentUser), true);
      return;
    }

    // Unknown URLs render an explicit 404 page instead of silently redirecting.
    // Known protected URLs still pass through the role checks above.
    setIsLoginModalOpen(false);
  }, [routeLocation, currentUser, isLoadingSharedData, isPasswordRecovery]);

  useEffect(() => {
    const onDataError = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setSuccessMessage('');
      if (successMessageTimer.current !== null) {
        window.clearTimeout(successMessageTimer.current);
        successMessageTimer.current = null;
      }
      setDataError(detail || 'Something went wrong. Please try again.');
    };
    const onDataSuccess = () => setDataError('');
    const onDataSuccessMessage = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (!detail) return;
      setDataError('');
      setSuccessMessage(detail);
      if (successMessageTimer.current !== null) window.clearTimeout(successMessageTimer.current);
      successMessageTimer.current = window.setTimeout(() => {
        setSuccessMessage((current) => current === detail ? '' : current);
        successMessageTimer.current = null;
      }, 6000);
    };

    window.addEventListener('ihms:data-error', onDataError);
    window.addEventListener('ihms:data-success', onDataSuccess);
    window.addEventListener('ihms:data-success-message', onDataSuccessMessage);
    return () => {
      window.removeEventListener('ihms:data-error', onDataError);
      window.removeEventListener('ihms:data-success', onDataSuccess);
      window.removeEventListener('ihms:data-success-message', onDataSuccessMessage);
      if (successMessageTimer.current !== null) {
        window.clearTimeout(successMessageTimer.current);
        successMessageTimer.current = null;
      }
    };
  }, []);

  const handleLogout = async () => {
    try {
      if (supabase) {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) throw error;
      }
    } catch (error) {
      console.error('Unable to sign out:', error);
      window.dispatchEvent(new CustomEvent('ihms:data-error', {
        detail: 'Unable to sign out right now. Please try again.',
      }));
      return;
    }
    // Stop listeners and clear tab-local shared records immediately on logout.
    // The auth-state listener may also observe SIGNED_OUT; these cleanup calls are idempotent.
    sessionLoadId.current += 1;
    stopSharedSync.current?.();
    stopSharedSync.current = null;
    activeUserIdRef.current = null;
    // Supabase caches include another user's authorized database snapshot and are
    // discarded on logout. Keep local demo datasets intact for the next demo login.
    if (supabase) clearSharedStore();
    store.setCurrentUser(null);
    setCurrentUser(null);
    setIsChangePasswordModalOpen(false);
    setIsPasswordRecovery(false);
    setIsLoginModalOpen(false);
    setIsPatientProfileModalOpen(false);
    navigateTo('/');
    window.dispatchEvent(new CustomEvent('ihms:data-success-message', {
      detail: 'You have been signed out successfully.',
    }));
  };

  const handleLoginSuccess = async (user: User) => {
    activeUserIdRef.current = user.id;
    store.setCurrentUser(user);
    setIsPasswordRecovery(false);
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

  const resolvedLocation = new URL(routeLocation, window.location.origin);
  const currentPath = resolvedLocation.pathname;
  const activeWorkspaceRoute = getWorkspaceRoute(currentPath);
  const hasAuthorizedWorkspace = Boolean(
    currentUser
    && activeWorkspaceRoute
    && currentPath === activeWorkspaceRoute.path
    && canAccessWorkspaceRoute(currentUser, activeWorkspaceRoute)
  );
  const showPublicHome = !currentUser && (currentPath === '/' || currentPath === '/login');

  const handleCloseLogin = () => {
    setIsLoginModalOpen(false);
    // LoginModal calls onLoginSuccess before onClose. Store state is updated synchronously
    // in that callback, so only discard the intended return path when the user truly
    // closed the modal without authenticating.
    if (window.location.pathname === '/login' && !store.getCurrentUser()) navigateTo('/');
  };

  const handleBookAppointment = () => {
    navigateTo(`/login?redirect=${encodeURIComponent('/portal/patient/book-appointment')}`);
    setIsLoginModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Navbar */}
      <ButtonActivityFeedback />
      <Navbar
        currentUser={currentUser}
        onOpenChangePassword={() => setIsChangePasswordModalOpen(true)}
        onOpenEditProfile={() => setIsPatientProfileModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Hospital Workspace */}
      <main className="grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {!isLoginModalOpen && !isChangePasswordModalOpen && !isPasswordRecovery && !currentUser?.mustSetPassword && dataError && (
          <FeedbackBanner kind="error" message={dataError} onDismiss={() => setDataError('')} />
        )}
        {!isLoginModalOpen && !isChangePasswordModalOpen && !isPasswordRecovery && !currentUser?.mustSetPassword && successMessage && (
          <FeedbackBanner kind="success" message={successMessage} onDismiss={() => {
            setSuccessMessage('');
            if (successMessageTimer.current !== null) {
              window.clearTimeout(successMessageTimer.current);
              successMessageTimer.current = null;
            }
          }} />
        )}
        {isLoadingSharedData ? (
          <LoadingScreen />
        ) : currentPath !== '/' && currentPath !== '/login' && !activeWorkspaceRoute ? (
          <NotFoundPage
            onGoHome={() => navigateTo(currentUser ? defaultWorkspacePath(currentUser) : '/')}
            homeLabel={currentUser ? 'Go to your dashboard' : 'Go to home page'}
          />
        ) : currentUser?.mustSetPassword ? (
          <div className="py-16 text-center max-w-xl mx-auto space-y-4">
            <h2 className="text-2xl font-bold text-slate-900">Set up your password</h2>
            <p className="text-sm text-slate-600">
              Use the invitation link to choose a private password before entering the hospital workspace.
            </p>
          </div>
        ) : hasAuthorizedWorkspace && currentUser ? (
          <Suspense fallback={<LoadingScreen title="Preparing your workspace…" description="Loading the tools for your role." />}>
            {currentUser.role === 'admin' && <AdminDashboard currentUser={currentUser} />}
            {currentUser.role === 'manager' && <ManagerDashboard currentUser={currentUser} />}
            {currentUser.role === 'doctor' && <DoctorDashboard currentUser={currentUser} />}
            {currentUser.role === 'receptionist' && <ReceptionistDashboard currentUser={currentUser} />}
            {(currentUser.role === 'nurse' || currentUser.role === 'cleaner' || currentUser.role === 'ward_boy' || currentUser.role === 'other') && <StaffDashboard currentUser={currentUser} />}
            {currentUser.role === 'patient' && <PatientDashboard currentUser={currentUser} />}
          </Suspense>
        ) : showPublicHome ? (
          <PublicHospitalHome onBookAppointment={handleBookAppointment} />
        ) : (
          <LoadingScreen title="Checking your workspace…" description="Confirming the requested page and access permissions." showSkeleton={false} />
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
            <span className="font-semibold text-teal-800">Hospital Services & Departments</span>
            <span>·</span>
            <span>Role-based access</span>
          </div>
        </div>
      </footer>

      {/* Login & Registration Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={handleCloseLogin}
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

      <EditPatientProfileModal
        isOpen={isPatientProfileModalOpen}
        currentUser={currentUser}
        onClose={() => setIsPatientProfileModalOpen(false)}
      />
    </div>
  );
}
