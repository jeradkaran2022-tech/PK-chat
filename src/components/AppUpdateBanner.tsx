import React, { useEffect, useState } from 'react';
import { DownloadCloud, RefreshCw, X } from 'lucide-react';
import { appUpdater, AppUpdateState } from '../lib/appUpdater';

export function AppUpdateBanner() {
  const [updateState, setUpdateState] = useState<AppUpdateState>(() => appUpdater.getState());

  useEffect(() => {
    const unsub = appUpdater.subscribe(setUpdateState);
    // Run automatic background update check on app boot
    void appUpdater.checkForAppUpdates();
    return unsub;
  }, []);

  if (!updateState.updateAvailable) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[90] max-w-sm w-[calc(100vw-2rem)] rounded-2xl bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white border border-sky-300/50 shadow-2xl p-4 space-y-2.5 backdrop-blur-xl"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <DownloadCloud className="w-5 h-5 text-sky-100" />
          </div>
          <div>
            <p className="text-xs font-bold leading-tight">
              PK Chat Update Available · புதிய பதிப்பு ({updateState.latestVersion})
            </p>
            <p className="text-[11px] text-sky-100 mt-0.5 leading-snug">
              {updateState.releaseNotes || 'Tap Update Now for the latest features and security fixes.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => appUpdater.dismissBanner()}
          className="p-1 rounded-lg hover:bg-white/15 text-sky-100"
          aria-label="Dismiss update notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void appUpdater.startUpdateFlow('immediate')}
          disabled={updateState.updating}
          className="flex-1 py-2 px-3 rounded-xl bg-[#e0f2fe]/90 text-[#01123A] hover:bg-[#bae6fd] border border-sky-200/80 disabled:opacity-60 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${updateState.updating ? 'animate-spin' : ''}`} />
          <span>{updateState.updating ? 'Updating...' : 'Update Now · உடனே புதுப்பி'}</span>
        </button>
        <button
          type="button"
          onClick={() => appUpdater.dismissBanner()}
          className="py-2 px-3 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-medium transition-colors"
        >
          Later
        </button>
      </div>
    </div>
  );
}
