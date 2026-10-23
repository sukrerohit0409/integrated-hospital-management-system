import React from 'react';
import { normalizeIndianMobile } from '../utils/validation';

type IndianPhoneInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'maxLength'> & {
  value: string;
  onChange: (value: string) => void;
};

/** Keeps the country code fixed and stores exactly the national 10-digit number. */
export const IndianPhoneInput: React.FC<IndianPhoneInputProps> = ({
  value,
  onChange,
  className = 'w-full px-3 py-2 border border-slate-300 rounded-r-lg focus:outline-teal-600',
  ...inputProps
}) => (
  <div className="flex w-full min-w-0">
    <span aria-hidden="true" className="flex items-center px-3 border border-r-0 border-slate-300 rounded-l-lg bg-slate-50 text-slate-600 text-xs font-semibold">+91</span>
    <input
      {...inputProps}
      type="tel"
      inputMode="numeric"
      autoComplete="tel-national"
      maxLength={10}
      minLength={10}
      pattern="[6-9][0-9]{9}"
      value={value}
      onChange={(event) => onChange(normalizeIndianMobile(event.target.value))}
      className={className}
    />
  </div>
);
