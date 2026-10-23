import React, { useEffect, useState } from 'react';
import { User, UserRole } from '../types';
import { store } from '../data/store';
import { getSignedInProfile } from '../data/auth';
import { getAuthErrorMessage } from '../data/authErrors';
import { supabase } from '../lib/supabase';
import { X, ShieldAlert, UserPlus, LogIn, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { IndianPhoneInput } from './IndianPhoneInput';
import { BLOOD_GROUPS, INPUT_LIMITS, isValidEmail, isValidGmailAddress, isValidIndianMobile, validatePersonName } from '../utils/validation';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [isRegister, setIsRegister] = useState(false);
  const [identifier, setIdentifier] = useState(''); // registered email address
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [error, setError] = useState('');
  const [registrationMessage, setRegistrationMessage] = useState('');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);

  // Register form states (for Patient registration)
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regAge, setRegAge] = useState('');
  const [regGender, setRegGender] = useState<'Male' | 'Female' | 'Other' | ''>('');
  const [regPassword, setRegPassword] = useState('');
  const [regBloodGroup, setRegBloodGroup] = useState('');

  // LoginModal stays mounted while hidden. Clear credentials and private form
  // values on close and again before every open, including after logout or a
  // delayed request finishing while the modal was hidden.
  useEffect(() => {
    setIsRegister(false);
    setIdentifier('');
    setPassword('');
    setShowPassword(false);
    setShowRegPassword(false);
    setError('');
    setRegistrationMessage('');
    setIsForgotPassword(false);
    setForgotEmail('');
    setIsResetSubmitting(false);
    setRegName('');
    setRegEmail('');
    setRegPhone('');
    setRegAge('');
    setRegGender('');
    setRegPassword('');
    setRegBloodGroup('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (import.meta.env.PROD && !supabase) {
      setError('Authentication is not configured. Contact the site administrator.');
      return;
    }

    if (supabase) {
      const cleanId = identifier.trim().toLowerCase();
      try {
        if (!isValidEmail(cleanId)) {
          setError('Enter a valid registered email address.');
          return;
        }

        const { error: authError } = await supabase.auth.signInWithPassword({
          email: cleanId,
          password,
        });
        if (authError) {
          setError('Sign in failed. Check your registered email and password.');
          return;
        }

        const user = await getSignedInProfile();
        if (!user) throw new Error('No profile is associated with this account.');
        onLoginSuccess(user);
        onClose();
      } catch (loginError) {
        console.error('Patient/staff sign-in failed:', loginError);
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        setError(loginError instanceof Error && /profile|inactive/i.test(loginError.message)
          ? loginError.message
          : 'Could not sign in. Check your credentials and internet connection, then try again.');
      }
      return;
    }

    const users = store.getUsers();
    const cleanId = identifier.trim().toLowerCase();
    const user = users.find((candidate) => candidate.email.toLowerCase() === cleanId);

    if (!user) {
      setError('User account not found with this email address.');
      return;
    }

    if (user.status === 'inactive') {
      setError('This account is inactive. Contact a hospital administrator.');
      return;
    }

    // Password check
    const expectedPass = user.password || user.email;
    if (password !== expectedPass) {
      setError(`Incorrect password. Please verify your credentials.`);
      return;
    }

    store.setCurrentUser(user);
    onLoginSuccess(user);
    onClose();
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRegistrationMessage('');

    if (import.meta.env.PROD && !supabase) {
      setError('Authentication is not configured. Contact the site administrator.');
      return;
    }

    if (!supabase) {
      setError('Email verification is unavailable in demo mode. Configure Supabase to register a patient account.');
      return;
    }

    const nameError = validatePersonName(regName);
    if (nameError) {
      setError(nameError);
      return;
    }
    if (!isValidGmailAddress(regEmail)) {
      setError('Enter a valid Gmail address ending in @gmail.com. The confirmation email cannot be sent to other or incorrectly formatted addresses.');
      return;
    }
    if (!isValidIndianMobile(regPhone)) {
      setError('Enter a valid 10-digit Indian mobile number beginning with 6, 7, 8, or 9.');
      return;
    }
    if (regAge && (!Number.isInteger(Number(regAge)) || Number(regAge) < 1 || Number(regAge) > 120)) {
      setError('Age must be a whole number between 1 and 120, or leave it blank.');
      return;
    }

    if (regPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    let hasRegisteredUser = false;
    let hasAuthSession = false;
    try {
      const result = await supabase.auth.signUp({
        email: regEmail.trim().toLowerCase(),
        password: regPassword,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            name: regName.trim(),
            phone: regPhone.trim(),
            age: regAge ? Number.parseInt(regAge, 10) : null,
            gender: regGender || null,
            bloodGroup: regBloodGroup || null,
          },
        },
      });
      if (result.error) {
        setError(getAuthErrorMessage(result.error.message));
        return;
      }
      hasRegisteredUser = Boolean(result.data.user);
      hasAuthSession = Boolean(result.data.session);
    } catch (registrationError) {
      console.error('Patient registration failed:', registrationError);
      setError('We could not send the verification email. Check your connection and email settings, then try again.');
      return;
    }
    if (!hasRegisteredUser) {
      setError('Supabase did not return the newly registered account. Please try again.');
      return;
    }

    if (hasAuthSession) {
      try {
        const user = await getSignedInProfile();
        if (user) {
          onLoginSuccess(user);
          onClose();
          return;
        }
      } catch (profileError) {
        console.error('Could not load profile immediately after registration:', profileError);
      }
      setRegistrationMessage('Account registered and confirmed. You may now sign in.');
      setIsRegister(false);
      setPassword('');
      return;
    }

    setRegistrationMessage(
      `Account created. Check ${regEmail.trim()} for the confirmation email, then return here to sign in.`
    );
    setIsRegister(false);
    setPassword('');
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRegistrationMessage('');

    if (!supabase) {
      setError('Password reset requires a configured Supabase project with email delivery enabled.');
      return;
    }

    const email = forgotEmail.trim().toLowerCase();
    if (!isValidGmailAddress(email)) {
      setError('Enter a valid Gmail address ending in @gmail.com to receive the password reset email.');
      return;
    }

    setIsResetSubmitting(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (resetError) {
        setError(getAuthErrorMessage(resetError.message));
        return;
      }
      setRegistrationMessage(
        'If an account uses this email address, a password reset link has been sent. Check your inbox and follow the link to choose a new password.'
      );
    } catch (resetError) {
      console.error('Password reset request failed:', resetError);
      setError('The reset email could not be sent. Check your connection and try again.');
    } finally {
      setIsResetSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-slate-50 shrink-0">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              {isRegister
                ? 'New Patient Registration'
                : isForgotPassword
                  ? 'Reset Your Password'
                  : 'IHMS Account Sign In'}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500">
              Integrated Hospital Management System
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto grow">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
              <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {registrationMessage && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800" role="status">
              {registrationMessage}
            </div>
          )}

          {isRegister ? (
            <form onSubmit={handleRegister} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Full Patient Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter your full name"
                  value={regName}
                  maxLength={INPUT_LIMITS.personName}
                  autoComplete="name"
                  onChange={(e) => setRegName(e.target.value.slice(0, INPUT_LIMITS.personName))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="Enter your Gmail address"
                    value={regEmail}
                    maxLength={INPUT_LIMITS.email}
                    autoComplete="email"
                    onChange={(e) => setRegEmail(e.target.value.slice(0, INPUT_LIMITS.email))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Mobile Number *
                  </label>
                  <IndianPhoneInput
                    required
                    aria-label="10-digit Indian mobile number"
                    placeholder="Enter 10-digit mobile number"
                    value={regPhone}
                    onChange={setRegPhone}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Age
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    step="1"
                    inputMode="numeric"
                    value={regAge}
                    placeholder="Enter age (optional)"
                    onChange={(e) => setRegAge(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Gender
                  </label>
                  <select
                    value={regGender}
                    onChange={(e) => setRegGender(e.target.value as 'Male' | 'Female' | 'Other' | '')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                  >
                    <option value="">Select gender (optional)</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Blood Group (if known)</label>
                <select
                  value={regBloodGroup}
                  onChange={(e) => setRegBloodGroup(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600 bg-white"
                >
                  <option value="">Select blood group (optional)</option>
                  {BLOOD_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
                </select>
                <p className="mt-1 text-[10px] text-slate-500">Leave blank if the blood group has not been confirmed.</p>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Create Password
                </label>
                <div className="relative">
                <input
                  type={showRegPassword ? 'text' : 'password'}
                  placeholder="Create your password (8+ characters)"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:outline-teal-600"
                />
                <button type="button" aria-label={showRegPassword ? 'Hide password' : 'Show password'} onClick={() => setShowRegPassword((visible) => !visible)} className="absolute inset-y-0 right-2 flex items-center text-slate-500 hover:text-slate-800">
                  {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                </div>
              </div>

              <p className={`text-[11px] ${supabase ? 'text-teal-800' : 'text-amber-800'}`}>
                {supabase
                  ? 'We will email you a confirmation link. You must confirm your email before signing in.'
                  : 'Email verification is unavailable in demo mode. Connect Supabase to register a patient account.'}
              </p>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 mt-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>Create Patient Account</span>
              </button>
            </form>
          ) : isForgotPassword ? (
            <form onSubmit={handleForgotPassword} className="space-y-3.5 text-xs">
              <p className="text-xs text-slate-600 leading-relaxed">
                Enter your account email and we will send a secure password reset link.
              </p>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Account Email Address *
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="Enter your Gmail address"
                  value={forgotEmail}
                  maxLength={INPUT_LIMITS.email}
                  onChange={(e) => setForgotEmail(e.target.value.slice(0, INPUT_LIMITS.email))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                />
              </div>
              <button
                type="submit"
                disabled={isResetSubmitting}
                className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 mt-4"
              >
                <span>{isResetSubmitting ? 'Sending Reset Link…' : 'Send Reset Link'}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="Enter your email address"
                  value={identifier}
                  maxLength={INPUT_LIMITS.email}
                  autoComplete="email"
                  onChange={(e) => setIdentifier(e.target.value.slice(0, INPUT_LIMITS.email))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-teal-600"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-700 font-semibold">Password</label>
                  {supabase && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPassword(true);
                        setError('');
                        setRegistrationMessage('');
                        setForgotEmail(identifier.includes('@') ? identifier.trim() : '');
                      }}
                      className="text-[11px] text-teal-700 font-semibold hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:outline-teal-600"
                  />
                  <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-2 flex items-center text-slate-500 hover:text-slate-800">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 mt-4"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In to System</span>
              </button>
            </form>
          )}

          {/* Toggle between Login and Register */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-center text-xs">
            <button
              type="button"
              onClick={() => {
                setError('');
                setRegistrationMessage('');
                setIsForgotPassword(false);
                setIsRegister(!isRegister);
              }}
              className="text-teal-700 font-semibold hover:underline"
            >
              {isForgotPassword
                ? 'Back to Sign In'
                : isRegister
                ? 'Already have an account? Sign In'
                : 'New patient? Register profile'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
