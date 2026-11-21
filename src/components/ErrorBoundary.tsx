import React from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { BRAND_LOGO_URL } from '../data/constants';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected network or rendering interruption.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('PK CHAT UI Recovery Boundary caught error:', error, info);
  }

  private handleRecover = () => {
    this.setState({ hasError: false, message: '' });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-[#d5eeff] via-[#e6f5ff] to-[#bfe4ff] dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#e3f3ff]/82 dark:bg-slate-900/90 backdrop-blur-2xl border border-[#7dd3fc] dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-[#01123A] p-0.5 ring-2 ring-[#38bdf8]/75 shadow-[0_0_24px_rgba(56,189,248,0.4)]">
            <img
              src={BRAND_LOGO_URL}
              alt="PK CHAT"
              className="w-full h-full rounded-[14px] object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-semibold">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Connection &amp; Safety Recovery</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            PK CHAT paused safely
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            A temporary network interruption occurred. Your chats, phone number, and account remain completely safe.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-2 justify-center">
            <button
              type="button"
              onClick={this.handleRecover}
              className="px-4 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Now</span>
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold"
            >
              Reload App
            </button>
          </div>
        </div>
      </div>
    );
  }
}
