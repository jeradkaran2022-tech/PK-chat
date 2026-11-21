import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Lock, ShieldAlert, Timer } from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { usePkChat } from '../context/PkChatContext';
import { db } from '../lib/firebase';
import { securityShield, SecurityShieldStatus } from '../lib/securityShield';

export function SecurityShieldOverlay() {
  const { userProfile, languagePref, logSecurityEvent } = usePkChat();
  const preferredLang = languagePref?.primaryLanguage || userProfile?.preferredLanguage || 'ta';

  const [shieldStatus, setShieldStatus] = useState<SecurityShieldStatus>(() =>
    securityShield.checkSecurityStatus(preferredLang)
  );
  const [confirmClear, setConfirmClear] = useState(false);
  const [screenshotBlockedNotice, setScreenshotBlockedNotice] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setShieldStatus(securityShield.checkSecurityStatus(preferredLang));
    };
    sync();
    const unsub = securityShield.subscribe(sync);
    const interval = window.setInterval(sync, 1000);
    return () => {
      unsub();
      window.clearInterval(interval);
    };
  }, [preferredLang]);

  // Anti-Screenshot & Screen-Capture Key Guard (PrintScreen / Ctrl+Shift+S / Cmd+Shift+S)
  useEffect(() => {
    if (!securityShield.isAntiDebugEnabled()) return;
    let dismissTimer: number | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isPrintScreen = e.key === 'PrintScreen';
      const isShiftS = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's';
      if (isPrintScreen || isShiftS) {
        e.preventDefault();
        setScreenshotBlockedNotice(
          '⚠️ பாதுகாப்பு எச்சரிக்கை: PK Chat செயலியில் ஸ்கிரீன்ஷாட் எடுக்க அனுமதி இல்லை! · Screenshot capture blocked for privacy.'
        );
        if (userProfile?.uid) {
          void logSecurityEvent(
            'SCREENSHOT_ATTEMPT_BLOCKED',
            'warning',
            `Blocked client screenshot shortcut (${isPrintScreen ? 'PrintScreen' : 'Shift+S'}).`
          ).catch(() => {});
        }
        if (dismissTimer) window.clearTimeout(dismissTimer);
        dismissTimer = window.setTimeout(() => setScreenshotBlockedNotice(null), 5000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (dismissTimer) window.clearTimeout(dismissTimer);
    };
  }, [logSecurityEvent, userProfile?.uid]);

  // Real-time Anti-Debugging / Inspection Guard on resize (top-level window safe check)
  useEffect(() => {
    if (shieldStatus.isLocked || !securityShield.isAntiDebugEnabled()) {
      return;
    }

    const handleDevToolsCheck = () => {
      if (securityShield.isDevToolsViewportAnomaly(160)) {
        const reason = 'வெளிப்படையான ஆய்வு / ஹேக்கிங் முயற்சி கண்டறியப்பட்டுள்ளது.';
        void securityShield.triggerSecurityLockdown(reason, {
          onDispatchAlert: async (alertMessage, lockReason) => {
            const uid = userProfile?.uid;
            if (uid) {
              await setDoc(doc(db, 'notifications', `sec_${Date.now()}`), {
                userId: uid,
                category: 'security',
                title: 'PK Chat பாதுகாப்புப் பூட்டு (Anti-Debug)',
                body: alertMessage.slice(0, 295),
                read: false,
                createdAt: serverTimestamp(),
              });
              await logSecurityEvent('SECURITY_SHIELD_LOCKDOWN', 'critical', lockReason);
            }
          },
        });
      }
    };

    window.addEventListener('resize', handleDevToolsCheck);
    return () => window.removeEventListener('resize', handleDevToolsCheck);
  }, [logSecurityEvent, shieldStatus.isLocked, userProfile?.uid]);

  if (!shieldStatus.isLocked) {
    if (!screenshotBlockedNotice) return null;
    return (
      <div
        role="alert"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[95] max-w-md w-[calc(100vw-2rem)] rounded-2xl bg-slate-900 text-white border border-rose-500/60 shadow-2xl px-4 py-3 flex items-center justify-between gap-3 text-xs"
      >
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="font-medium leading-snug">{screenshotBlockedNotice}</span>
        </div>
        <button
          type="button"
          onClick={() => setScreenshotBlockedNotice(null)}
          className="text-slate-300 hover:text-white font-semibold shrink-0"
        >
          Dismiss
        </button>
      </div>
    );
  }

  const mm = String(shieldStatus.minutes).padStart(2, '0');
  const ss = String(shieldStatus.seconds).padStart(2, '0');

  const handleVerifiedResume = async () => {
    setConfirmClear(false);
    securityShield.clearLockdown();
    try {
      await logSecurityEvent(
        'SECURITY_SHIELD_CLEARED',
        'info',
        '10-minute Security Shield lockout cleared after user verification.'
      );
    } catch {
      // Non-fatal audit write
    }
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="pk-security-shield-title"
      className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="max-w-lg w-full rounded-3xl bg-slate-900 border border-rose-500/40 shadow-2xl p-6 sm:p-8 text-white space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-6 h-6 text-rose-400" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
                PK CHAT Security Shield
              </p>
              <h2 id="pk-security-shield-title" className="text-lg sm:text-xl font-bold leading-snug">
                🔒 PK Chat பாதுகாப்புப் பூட்டு (Lockdown)
              </h2>
            </div>
          </div>
          <span className="px-3 py-1 rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-300 font-mono text-sm font-bold tabular-nums flex items-center gap-1.5 shrink-0">
            <Timer className="w-4 h-4" />
            <span>
              {mm}:{ss}
            </span>
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-rose-950/50 border border-rose-800/60 space-y-2 text-xs sm:text-sm">
          <p className="font-semibold text-rose-100 leading-relaxed">
            {shieldStatus.message}
          </p>
          {shieldStatus.reason && (
            <p className="text-xs text-rose-200/90 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>காரணம் / Reason:</strong> {shieldStatus.reason}
              </span>
            </p>
          )}
        </div>

        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs text-slate-300">
          <p className="flex items-center gap-2 font-semibold text-sky-400">
            <Lock className="w-4 h-4 shrink-0" />
            <span>Your chats, encrypted messages, and account data remain completely safe.</span>
          </p>
          {shieldStatus.alertSent && (
            <p className="flex items-center gap-2 text-amber-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Automated Security Alert has been dispatched to account notifications.
              </span>
            </p>
          )}
          <p className="text-slate-400">
            பாதுகாப்பு காரணங்களுக்காக இந்த 10 நிமிட இடைநிறுத்தம் நடைமுறையில் உள்ளது. நேரம் முடிந்ததும் ஆப் தானாகவே இயங்க ஆரம்பிக்கும்.
          </p>
        </div>

        <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
            >
              Verify Device Integrity &amp; Resume Early
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 w-full justify-between p-3 rounded-2xl bg-sky-950/50 border border-sky-700/50">
              <span className="text-xs text-sky-200 font-medium">
                Confirm this session is authorized to end the 10-minute shield?
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleVerifiedResume}
                  className="px-3 py-1.5 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold"
                >
                  Confirm &amp; Resume
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
