import React from 'react';
import { User, UserRole } from '../types';
import { 
  Building2, 
  UserCheck, 
  LogOut, 
  KeyRound, 
  Users, 
  Stethoscope, 
  CalendarClock, 
  HeartHandshake, 
  ShieldCheck,
  ChevronDown
} from 'lucide-react';

interface NavbarProps {
  currentUser: User | null;
  onOpenLogin: () => void;
  onOpenChangePassword: () => void;
  onLogout: () => void;
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
  navTabs?: { id: string; label: string }[];
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onOpenLogin,
  onOpenChangePassword,
  onLogout,
  activeTab,
  onSelectTab,
  navTabs = [],
}) => {
  const [roleMenuOpen, setRoleMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Auto-close user profile chip when clicking outside anywhere on the web app or pressing Escape
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setRoleMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRoleMenuOpen(false);
      }
    };

    if (roleMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside, true);
      document.addEventListener('touchstart', handleClickOutside, true);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('touchstart', handleClickOutside, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [roleMenuOpen]);

  const roleLabels: Record<UserRole, { label: string; icon: React.ReactNode; color: string }> = {
    admin: { label: 'Hospital Admin', icon: <ShieldCheck className="w-3.5 h-3.5" />, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
    manager: { label: 'Operations Manager', icon: <Users className="w-3.5 h-3.5" />, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    doctor: { label: 'Consultant Doctor', icon: <Stethoscope className="w-3.5 h-3.5" />, color: 'text-teal-600 bg-teal-50 border-teal-200' },
    receptionist: { label: 'Front Desk / Reception', icon: <CalendarClock className="w-3.5 h-3.5" />, color: 'text-amber-600 bg-amber-50 border-amber-200' },
    nurse: { label: 'Clinical Staff (Nurse)', icon: <HeartHandshake className="w-3.5 h-3.5" />, color: 'text-rose-600 bg-rose-50 border-rose-200' },
    cleaner: { label: 'Sanitation Staff', icon: <HeartHandshake className="w-3.5 h-3.5" />, color: 'text-slate-600 bg-slate-50 border-slate-200' },
    ward_boy: { label: 'Ward Staff', icon: <HeartHandshake className="w-3.5 h-3.5" />, color: 'text-slate-600 bg-slate-50 border-slate-200' },
    other: { label: 'Hospital Staff', icon: <HeartHandshake className="w-3.5 h-3.5" />, color: 'text-slate-600 bg-slate-50 border-slate-200' },
    patient: { label: 'Patient Portal', icon: <UserCheck className="w-3.5 h-3.5" />, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      {/* Main Top Bar - 3 Zone Contract */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-teal-600 flex items-center justify-center text-white shadow-xs font-bold text-lg shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <a href="/" className="text-base sm:text-lg font-bold tracking-tight text-slate-900 block leading-tight truncate">
              PulseCare IHMS
            </a>
            <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium truncate hidden xs:block">Integrated Hospital Management System</p>
          </div>
        </div>

        {/* Zone 2: Contextual Navigation Links / Tabs */}
        {navTabs.length > 0 && onSelectTab && (
          <nav className="hidden lg:flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            {navTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}

        {/* Zone 3: Account & Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {currentUser ? (
            <div className="flex items-center gap-2">
              {/* Role badge */}
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-slate-50 border-slate-200">
                {roleLabels[currentUser.role]?.icon}
                <span className="capitalize">{currentUser.customRoleTitle || currentUser.role}</span>
              </div>

              {/* User Dropdown Profile Chip */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setRoleMenuOpen(!roleMenuOpen)}
                  className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center text-xs font-bold shrink-0">
                    {currentUser.name.charAt(0)}
                  </div>
                  <div className="text-left hidden sm:block">
                    <p className="text-xs font-semibold text-slate-900 leading-none truncate max-w-[100px] lg:max-w-[120px]">
                      {currentUser.name}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[100px] lg:max-w-[120px]">
                      {currentUser.email}
                    </p>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                {/* Transparent overlay for instant click-away detection on touch and click */}
                {roleMenuOpen && (
                  <div
                    className="fixed inset-0 z-40 bg-transparent"
                    onClick={() => setRoleMenuOpen(false)}
                    aria-hidden="true"
                  />
                )}

                {roleMenuOpen && (
                  <div 
                    className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
                    onClick={() => setRoleMenuOpen(false)}
                  >
                    <div className="px-3 py-2 border-b border-slate-100">
                      <p className="font-semibold text-slate-900">{currentUser.name}</p>
                      <p className="text-slate-500 text-[11px] truncate">{currentUser.email}</p>
                      <p className="text-teal-600 font-medium text-[11px] capitalize mt-0.5">
                        Role: {currentUser.customRoleTitle || currentUser.role}
                      </p>
                    </div>

                    <button
                      onClick={onOpenChangePassword}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                    >
                      <KeyRound className="w-4 h-4 text-slate-500" />
                      <span>Change Password</span>
                    </button>

                    <div className="border-t border-slate-100 my-1"></div>

                    <button
                      onClick={onLogout}
                      className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600"
                    >
                      <LogOut className="w-4 h-4 text-red-500" />
                      <span>Log Out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={onOpenLogin}
              className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap shadow-xs"
            >
              Sign In
            </button>
          )}
        </div>
      </div>

      {/* Mobile nav tabs if present */}
      {navTabs.length > 0 && onSelectTab && (
        <div className="lg:hidden border-t border-slate-100 px-4 py-2 overflow-x-auto flex items-center gap-1.5 bg-slate-50">
          {navTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-teal-600 text-white font-semibold'
                  : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
};
