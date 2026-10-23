import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

/** Prevents an unexpected render-time exception from leaving a blank application screen. */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Diagnostic details stay in the developer console, not in the patient-facing UI.
    console.error('Unhandled application render error:', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
          <section role="alert" className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-xl font-bold text-slate-900">This page could not be displayed</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              An unexpected application error occurred. Reload the page to try again. If the issue continues, contact the hospital system administrator.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
            >
              Reload application
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
