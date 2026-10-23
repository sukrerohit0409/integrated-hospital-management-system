import React, { useState } from 'react';
import { User } from '../types';
import { store } from '../data/store';
import { supabase } from '../lib/supabase';
import { X, KeyRound, CheckCircle2, ShieldAlert, Eye, EyeOff } from 'lucide-react';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onPasswordUpdated: () => void;
  isPasswordRecovery?: boolean;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onPasswordUpdated,
  isPasswordRecovery = false,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  if (!isOpen || !currentUser) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    const mustSetPassword = Boolean(currentUser.mustSetPassword);
    const requiresCurrentPassword = !mustSetPassword && !isPasswordRecovery;
    const actualCurrentPass = currentUser.password || currentUser.email;
    if (!supabase && requiresCurrentPassword && currentPassword !== actualCurrentPass) {
      setError('Current password does not match our records.');
      return;
    }

    if (newPassword.length < (supabase || mustSetPassword ? 8 : 4)) {
      setError(`New password must be at least ${supabase || mustSetPassword ? 8 : 4} characters long.`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }

    if (supabase) {
      if (requiresCurrentPassword) {
        const { error: verificationError } = await supabase.auth.signInWithPassword({
          email: currentUser.email,
          password: currentPassword,
        });
        if (verificationError) {
          setError('Current password does not match our records.');
          return;
        }
      }
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
        ...(mustSetPassword ? { data: { mustSetPassword: false } } : {}),
      });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      onPasswordUpdated();
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1400);
      return;
    }

    const changed = store.changePassword(currentUser.id, newPassword);
    if (changed) {
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1400);
    } else {
      setError('Could not update password. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-auto max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-900">
              {isPasswordRecovery ? 'Reset Password' : 'Change Password'}
            </h3>
          </div>
          {!currentUser.mustSetPassword && !isPasswordRecovery && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 text-xs overflow-y-auto grow">
          <div className="p-3 bg-slate-50 rounded-lg text-slate-600 border border-slate-200">
            <p className="font-semibold text-slate-800">{currentUser.name}</p>
            <p className="text-[11px] text-slate-500">Account: {currentUser.email}</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Password updated successfully!</span>
            </div>
          )}

          {!currentUser.mustSetPassword && !isPasswordRecovery && (
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Current Password
              </label>
              <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                required
                placeholder="Enter your current password"
                value={currentPassword}
                maxLength={128}
                onChange={(e) => setCurrentPassword(e.target.value.slice(0, 128))}
                className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:outline-teal-600"
              />
              <button type="button" aria-label={showCurrentPassword ? 'Hide password' : 'Show password'} onClick={() => setShowCurrentPassword((visible) => !visible)} className="absolute inset-y-0 right-2 flex items-center text-slate-500 hover:text-slate-800">
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            </div>
          )}

          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              New Password
            </label>
            <div className="relative">
              <input
              type={showNewPassword ? 'text' : 'password'}
              required
              placeholder="Enter new password"
              value={newPassword}
              minLength={8}
              maxLength={128}
              onChange={(e) => setNewPassword(e.target.value.slice(0, 128))}
              className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:outline-teal-600"
            />
              <button type="button" aria-label={showNewPassword ? 'Hide password' : 'Show password'} onClick={() => setShowNewPassword((visible) => !visible)} className="absolute inset-y-0 right-2 flex items-center text-slate-500 hover:text-slate-800">
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Confirm New Password
            </label>
            <div className="relative">
              <input
              type={showConfirmPassword ? 'text' : 'password'}
              required
              placeholder="Re-type new password"
              value={confirmPassword}
              minLength={8}
              maxLength={128}
              onChange={(e) => setConfirmPassword(e.target.value.slice(0, 128))}
              className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:outline-teal-600"
            />
              <button type="button" aria-label={showConfirmPassword ? 'Hide password' : 'Show password'} onClick={() => setShowConfirmPassword((visible) => !visible)} className="absolute inset-y-0 right-2 flex items-center text-slate-500 hover:text-slate-800">
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            {!currentUser.mustSetPassword && !isPasswordRecovery && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg shadow-xs transition-colors"
            >
              {isPasswordRecovery
                ? 'Reset Password'
                : currentUser.mustSetPassword
                  ? 'Set Password'
                  : 'Save New Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
