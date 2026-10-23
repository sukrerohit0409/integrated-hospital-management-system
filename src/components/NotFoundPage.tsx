import React from 'react';
import { ArrowLeft, House } from 'lucide-react';

type NotFoundPageProps = {
  onGoHome: () => void;
  homeLabel?: string;
};

/** Prevents unknown URLs from appearing as a blank or indefinitely loading workspace. */
export function NotFoundPage({ onGoHome, homeLabel = 'Go to home page' }: NotFoundPageProps) {
  return (
    <section className="flex min-h-[55vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-800">
          <House className="h-8 w-8" aria-hidden="true" />
        </div>
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.18em] text-teal-700">Error 404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This page may have moved, or the address may be incorrect. Your account and hospital records have not been changed.
        </p>
        <button
          type="button"
          onClick={onGoHome}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {homeLabel}
        </button>
      </div>
    </section>
  );
}
