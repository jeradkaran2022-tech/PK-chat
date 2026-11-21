import React from 'react';
import {
  AlertTriangle,
  Lock,
  RefreshCw,
  ShieldCheck,
  Volume2,
  WifiOff,
} from 'lucide-react';
import { usePkChat } from '../context/PkChatContext';
import { useOnlineStatus } from '../hooks/usePWAInstall';
import { getSecurityCopyForLanguage } from '../lib/securityTranslations';

export function GlobalSecurityOverlay({ showNormalBadge = false }: { showNormalBadge?: boolean }) {
  const {
    globalSecurityState,
    recheckCountdown,
    userProfile,
    languagePref,
    userSettings,
    isVoiceSpeaking,
    playCurrentSecurityVoiceAlert,
    refreshSecurityStatus,
    networkError,
    clearNetworkError,
    retryConnection,
  } = usePkChat();
  const isOnline = useOnlineStatus();

  // Strictly read ONLY the user's explicit PK CHAT preferred language (never inferred from country)
  const selectedLangCode =
    languagePref?.primaryLanguage || userProfile?.preferredLanguage || 'en';
  const copy = getSecurityCopyForLanguage(selectedLangCode);
  const status = globalSecurityState.status;

  if (!isOnline && status === 'NORMAL') {
    return (
      <div className="w-full bg-amber-600 text-white px-4 py-2 text-xs font-medium flex items-center justify-center gap-2">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span>Offline mode: queued chats and local cache active. Cloud sync will resume automatically.</span>
      </div>
    );
  }

  if (networkError && status === 'NORMAL') {
    return (
      <div
        role="status"
        className="w-full bg-amber-50 dark:bg-amber-950/90 border-b border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100 px-4 py-2 text-xs font-medium flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2 min-w-0">
          <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="truncate">{networkError}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void retryConnection()}
            className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry Sync</span>
          </button>
          <button
            type="button"
            onClick={clearNetworkError}
            className="px-2 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-xs font-medium"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (status === 'NORMAL' && !showNormalBadge) {
    return null;
  }

  if (status === 'NORMAL' && showNormalBadge) {
    return (
      <div className="mx-4 lg:mx-6 mt-3 px-4 py-2.5 rounded-2xl bg-sky-50/90 dark:bg-sky-950/40 border border-[#bae6fd] dark:border-sky-900 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-[#0369a1] dark:text-sky-200">
          <ShieldCheck className="w-4 h-4 text-[#0284c7] shrink-0" />
          <span className="font-semibold">{copy.normalTitle}:</span>
          <span>{copy.normalSummary}</span>
        </div>
        <button
          type="button"
          onClick={playCurrentSecurityVoiceAlert}
          disabled={isVoiceSpeaking || userSettings?.voiceSecurityAlertsEnabled === false}
          className="px-2.5 py-1 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-white font-semibold flex items-center gap-1.5"
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>{isVoiceSpeaking ? copy.speakingLabel : copy.speakButtonLabel}</span>
        </button>
      </div>
    );
  }

  const isLockdown = status === 'LOCKDOWN';
  const countdownText = copy.recheckCountdownTemplate.replace(
    '{seconds}',
    String(recheckCountdown)
  );

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`w-full border-b px-4 lg:px-6 py-3.5 transition-colors ${
        isLockdown
          ? 'bg-rose-50 dark:bg-rose-950/90 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-100'
          : 'bg-amber-50 dark:bg-amber-950/90 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100'
      }`}
    >
      <div className="max-w-6xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isLockdown ? (
              <Lock className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            <span className="text-sm font-bold tracking-tight">
              {isLockdown ? copy.lockdownTitle : copy.recoveringTitle}
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-black/10 dark:bg-white/10">
              {copy.languageName} ({copy.languageCode.toUpperCase()})
            </span>
          </div>

          <p className="text-xs leading-relaxed opacity-90">
            {isLockdown ? copy.lockdownSummary : copy.recoveringSummary}
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium">
            <span className="font-semibold">
              {copy.restrictedActionsLabel}:
            </span>
            <span>{copy.restrictions.login}</span>
            <span>·</span>
            <span>{copy.restrictions.messages}</span>
            <span>·</span>
            <span>{copy.restrictions.account}</span>
            <span>·</span>
            <span>{copy.restrictions.calls}</span>
          </div>

          <p className="text-[11px] font-semibold text-[#0284c7] dark:text-[#38bdf8]">
            {copy.dataSafeGuarantee}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="px-3 py-1.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 text-xs font-mono font-semibold tabular-nums">
            {countdownText}
          </span>

          <button
            type="button"
            onClick={() => refreshSecurityStatus()}
            className="px-3 py-1.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 hover:bg-white text-xs font-semibold flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Recheck</span>
          </button>

          <button
            type="button"
            onClick={playCurrentSecurityVoiceAlert}
            disabled={isVoiceSpeaking}
            className={`px-3.5 py-1.5 rounded-xl text-white text-xs font-semibold flex items-center gap-1.5 ${
              isLockdown
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{isVoiceSpeaking ? copy.speakingLabel : copy.speakButtonLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
