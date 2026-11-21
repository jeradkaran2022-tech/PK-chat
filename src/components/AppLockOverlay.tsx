import React, { useState } from 'react';
import { Fingerprint, Lock, ShieldAlert } from 'lucide-react';
import { usePkChat } from '../context/PkChatContext';
import { BRAND_LOGO_URL } from '../data/constants';

export function AppLockOverlay() {
  const { isAppLocked, unlockWithPin, unlockWithBiometric, userSettings, logoutUser, userProfile } = usePkChat();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isAppLocked) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const ok = await unlockWithPin(pin);
      if (!ok) {
        setError('Incorrect PIN. Please try again.');
        setPin('');
      } else {
        setPin('');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleBiometricAttempt = async () => {
    setError('');
    if (!window.PublicKeyCredential) {
      setError('Biometric hardware API is not available in this browser. Enter your PIN.');
      return;
    }
    setBusy(true);
    try {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!available) {
        setError('No Face Unlock or Fingerprint authenticator detected on this device. Enter your PIN.');
        return;
      }

      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const enrolledBase64 = (() => {
        try {
          return localStorage.getItem('pk_biometric_cred_id');
        } catch {
          return null;
        }
      })();

      let verifiedCredBase64 = '';
      if (enrolledBase64) {
        const binary = atob(enrolledBase64);
        const rawId = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) rawId[i] = binary.charCodeAt(i);
        const assertion = (await navigator.credentials.get({
          publicKey: {
            challenge,
            allowCredentials: [{ id: rawId, type: 'public-key' }],
            userVerification: 'required',
            timeout: 30000,
          },
        })) as PublicKeyCredential | null;
        if (!assertion) throw new Error('Verification cancelled');
        const bytes = new Uint8Array(assertion.rawId);
        let binStr = '';
        for (let i = 0; i < bytes.length; i += 1) binStr += String.fromCharCode(bytes[i]);
        verifiedCredBase64 = btoa(binStr);
      } else {
        const created = (await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: 'PK CHAT App Lock' },
            user: {
              id: new TextEncoder().encode(userProfile?.uid || 'pk_user'),
              name: userProfile?.fullName || 'PK CHAT User',
              displayName: userProfile?.fullName || 'PK CHAT User',
            },
            pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              userVerification: 'required',
            },
            timeout: 30000,
          },
        })) as PublicKeyCredential | null;
        if (!created) throw new Error('Registration cancelled');
        const bytes = new Uint8Array(created.rawId);
        let binStr = '';
        for (let i = 0; i < bytes.length; i += 1) binStr += String.fromCharCode(bytes[i]);
        verifiedCredBase64 = btoa(binStr);
      }

      const unlocked = await unlockWithBiometric(verifiedCredBase64);
      if (!unlocked) {
        setError('Biometric credential mismatch. Use your PIN to unlock.');
      }
    } catch {
      setError('Biometric verification cancelled or unavailable. Use your PIN to unlock.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-sky-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="max-w-sm w-full rounded-3xl bg-[#e3f3ff]/88 dark:bg-slate-900/90 backdrop-blur-2xl border border-[#7dd3fc] dark:border-slate-800 p-7 text-center shadow-xl">
        <div className="w-20 h-20 rounded-2xl mx-auto mb-4 bg-[#01123A] p-0.5 ring-2 ring-[#38bdf8]/80 shadow-[0_0_24px_rgba(56,189,248,0.45)]">
          <img
            src={BRAND_LOGO_URL}
            alt="PK CHAT"
            className="w-full h-full rounded-[14px] object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0284c7] dark:text-[#38bdf8] mb-2">
          <Lock className="w-3.5 h-3.5" />
          <span>PK CHAT Locked</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Unlock your messages
        </h2>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Enter your security PIN{userSettings?.biometricEnabled ? ' or verify biometrics' : ''}.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Enter PIN"
            className="w-full py-3.5 text-center text-xl font-mono tracking-[0.4em] rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc] dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
          />

          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center justify-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={busy || pin.length < 4}
            className="w-full py-3 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            {busy ? 'Verifying...' : 'Unlock with PIN'}
          </button>

          {userSettings?.biometricEnabled && (
            <button
              type="button"
              onClick={handleBiometricAttempt}
              className="w-full py-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Fingerprint className="w-4 h-4" />
              <span>Use Fingerprint / Face Unlock</span>
            </button>
          )}
        </form>

        <button
          type="button"
          onClick={logoutUser}
          className="mt-5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
        >
          Sign out and switch account
        </button>
      </div>
    </div>
  );
}
