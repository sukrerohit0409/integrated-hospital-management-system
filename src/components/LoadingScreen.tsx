import React from 'react';

interface LoadingScreenProps {
  title?: string;
  description?: string;
  showSkeleton?: boolean;
}

/** Shared accessible loading state for session restoration and lazy-loaded workspaces. */
export function LoadingScreen({
  title = 'Loading your secure hospital workspace…',
  description = 'Verifying your session and preparing the latest data.',
  showSkeleton = true,
}: LoadingScreenProps) {
  return (
    <section
      className="mx-auto w-full max-w-5xl py-12 sm:py-16"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center text-center">
        <span className="pulsecare-spinner" aria-hidden="true" />
        <h1 className="mt-4 text-base font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>
      </div>
      {showSkeleton && (
        <div className="mt-8 grid gap-4 sm:grid-cols-3" aria-hidden="true">
          {[0, 1, 2].map((item) => (
            <div key={item} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="pulsecare-skeleton h-3 w-24 rounded" />
              <div className="pulsecare-skeleton mt-4 h-7 w-20 rounded" />
              <div className="pulsecare-skeleton mt-4 h-2.5 w-full rounded" />
              <div className="pulsecare-skeleton mt-2 h-2.5 w-2/3 rounded" />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
