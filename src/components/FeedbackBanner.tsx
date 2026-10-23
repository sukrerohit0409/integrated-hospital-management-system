import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

type FeedbackBannerProps = {
  kind: 'error' | 'success';
  message: string;
  onDismiss: () => void;
};

/** Prominent, keyboard-accessible toast for completed or failed app actions. */
export function FeedbackBanner({ kind, message, onDismiss }: FeedbackBannerProps) {
  const isError = kind === 'error';
  const Icon = isError ? AlertTriangle : CheckCircle2;

  return (
    <div
      className={`fixed right-4 top-20 z-[100] flex w-[calc(100vw-2rem)] max-w-lg items-start gap-3 rounded-2xl border px-5 py-4 shadow-2xl sm:right-6 sm:top-20 sm:px-5 sm:py-4 animate-in fade-in slide-in-from-top-2 duration-200 ${
        isError
          ? 'border-rose-200 bg-white text-rose-950'
          : 'border-emerald-200 bg-white text-emerald-950'
      }`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isError ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-bold">{isError ? 'Action could not be completed' : 'Success'}</p>
        <p className="mt-1 break-words text-sm leading-5 text-slate-700">{message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Dismiss ${isError ? 'error' : 'success'} message`}
        className="-mr-1 -mt-1 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
