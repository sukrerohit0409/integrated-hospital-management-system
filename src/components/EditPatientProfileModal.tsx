import React, { useEffect, useState } from 'react';
import { CheckCircle2, ShieldAlert, UserRoundPen, X } from 'lucide-react';
import type { User } from '../types';
import { store } from '../data/store';
import { supabase } from '../lib/supabase';
import { IndianPhoneInput } from './IndianPhoneInput';
import {
  BLOOD_GROUPS,
  INPUT_LIMITS,
  isValidGmailAddress,
  isValidIndianMobile,
  normalizeIndianMobile,
} from '../utils/validation';

type PatientGender = NonNullable<User['gender']>;

interface EditPatientProfileModalProps {
  isOpen: boolean;
  currentUser: User | null;
  onClose: () => void;
}

function announceError(message: string) {
  window.dispatchEvent(new CustomEvent('ihms:data-error', { detail: message }));
}

function announceSuccess(message: string) {
  window.dispatchEvent(new CustomEvent('ihms:data-success-message', { detail: message }));
}

export const EditPatientProfileModal: React.FC<EditPatientProfileModalProps> = ({
  isOpen,
  currentUser,
  onClose,
}) => {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<PatientGender | ''>('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !currentUser) return;
    setEmail(currentUser.email || '');
    setPhone(normalizeIndianMobile(currentUser.phone || ''));
    setAge(currentUser.age == null ? '' : String(currentUser.age));
    setGender(currentUser.gender || '');
    setBloodGroup(currentUser.bloodGroup || '');
    setError('');
  }, [isOpen, currentUser?.id]);

  if (!isOpen || !currentUser || currentUser.role !== 'patient') return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    setError('');

    const nextEmail = email.trim().toLowerCase();
    const nextPhone = normalizeIndianMobile(phone);
    const nextAge = age.trim() ? Number(age) : null;
    const nextGender = gender || null;
    const nextBloodGroup = bloodGroup || null;

    const validationError = !isValidGmailAddress(nextEmail)
      ? 'Enter a valid Gmail address ending in @gmail.com.'
      : !isValidIndianMobile(nextPhone)
        ? 'Enter a valid 10-digit Indian mobile number beginning with 6, 7, 8, or 9.'
        : age.trim() && (!Number.isInteger(nextAge) || Number(nextAge) < 1 || Number(nextAge) > INPUT_LIMITS.age)
          ? `Age must be a whole number between 1 and ${INPUT_LIMITS.age}, or left blank.`
          : nextGender && !(['Male', 'Female', 'Other'] as string[]).includes(nextGender)
            ? 'Select a valid gender or leave it blank.'
            : nextBloodGroup && !(BLOOD_GROUPS as readonly string[]).includes(nextBloodGroup)
              ? 'Select a valid blood group or leave it blank.'
              : '';

    if (validationError) {
      setError(validationError);
      announceError(validationError);
      return;
    }

    setIsSaving(true);
    const profileUpdates: Partial<User> = {
      phone: nextPhone,
      age: nextAge ?? undefined,
      gender: nextGender ?? undefined,
      bloodGroup: nextBloodGroup ?? undefined,
    };

    try {
      if (supabase) {
        const { error: profileError } = await supabase.rpc('update_my_patient_profile', {
          p_phone: nextPhone,
          p_age: nextAge,
          p_gender: nextGender,
          p_blood_group: nextBloodGroup,
        });
        if (profileError) {
          console.error('Patient profile update failed:', profileError);
          throw new Error('Unable to save your profile details. Please review your information and try again.');
        }
      }

      // Keep the current tab responsive while the database/Reatime subscription
      // catches up with the server-confirmed profile change.
      store.updateUser(currentUser.id, profileUpdates);

      const emailChanged = nextEmail !== currentUser.email.trim().toLowerCase();
      if (supabase && emailChanged) {
        const { error: emailError } = await supabase.auth.updateUser({ email: nextEmail });
        if (emailError) {
          console.error('Patient email change could not be started:', emailError);
          const message = 'Your phone and demographic details were saved, but the email change could not be started. Check whether this email is already registered, then try again.';
          setError(message);
          announceError(message);
          return;
        }
        announceSuccess(`Profile details saved. Check ${nextEmail} for the verification link; your sign-in email changes after you confirm it.`);
      } else {
        if (!supabase && emailChanged) {
          store.updateUser(currentUser.id, { email: nextEmail });
        }
        announceSuccess('Patient profile updated successfully.');
      }

      onClose();
    } catch (caughtError) {
      console.error('Patient profile could not be updated:', caughtError);
      const message = caughtError instanceof Error
        ? caughtError.message
        : 'Unable to update your profile. Please try again.';
      setError(message);
      announceError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-patient-profile-title"
        className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center">
              <UserRoundPen className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="edit-patient-profile-title" className="text-base font-bold text-slate-900">Edit Patient Profile</h2>
              <p className="text-xs text-slate-500">Keep your contact and medical details up to date.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close profile editor" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 text-sm overflow-y-auto">
          {error && (
            <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-800 text-xs">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
            <p className="text-xs text-slate-500">Patient</p>
            <p className="font-semibold text-slate-900">{currentUser.name}</p>
            <p className="text-[11px] text-slate-500">UHID #{currentUser.id.slice(-6).toUpperCase()}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="patient-profile-email" className="block text-xs font-semibold text-slate-700 mb-1.5">Email address *</label>
              <input
                id="patient-profile-email"
                type="email"
                required
                maxLength={INPUT_LIMITS.email}
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value.slice(0, INPUT_LIMITS.email))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
              <p className="mt-1 text-[11px] text-slate-500">Changing your sign-in email requires confirmation from your new inbox.</p>
            </div>

            <div>
              <label htmlFor="patient-profile-phone" className="block text-xs font-semibold text-slate-700 mb-1.5">Mobile number *</label>
              <IndianPhoneInput
                id="patient-profile-phone"
                required
                value={phone}
                onChange={setPhone}
                placeholder="10-digit mobile number"
                className="w-full rounded-r-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </div>

            <div>
              <label htmlFor="patient-profile-age" className="block text-xs font-semibold text-slate-700 mb-1.5">Age <span className="font-normal text-slate-400">(optional)</span></label>
              <input
                id="patient-profile-age"
                type="number"
                min={1}
                max={INPUT_LIMITS.age}
                step={1}
                inputMode="numeric"
                value={age}
                onChange={(event) => setAge(event.target.value.slice(0, 3))}
                placeholder="Enter age"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </div>

            <div>
              <label htmlFor="patient-profile-gender" className="block text-xs font-semibold text-slate-700 mb-1.5">Gender <span className="font-normal text-slate-400">(optional)</span></label>
              <select
                id="patient-profile-gender"
                value={gender}
                onChange={(event) => setGender(event.target.value as PatientGender | '')}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              >
                <option value="">Not provided</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="patient-profile-blood-group" className="block text-xs font-semibold text-slate-700 mb-1.5">Blood group <span className="font-normal text-slate-400">(optional)</span></label>
              <select
                id="patient-profile-blood-group"
                value={bloodGroup}
                onChange={(event) => setBloodGroup(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              >
                <option value="">Not provided</option>
                {BLOOD_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} disabled={isSaving} className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={isSaving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60">
              {isSaving ? 'Saving profile…' : 'Save profile'}
              {!isSaving && <CheckCircle2 className="w-4 h-4" aria-hidden="true" />}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
