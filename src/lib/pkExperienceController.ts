/**
 * PK Chat - Default English, Custom Ringtone & Notification Tone,
 * and Firebase Auth / Login Controller
 */

export const PK_APP_EXPERIENCE = Object.freeze({
  appName: 'PK Chat',
  defaultLanguage: 'en', // Starts in clean WhatsApp-like English; user can switch anytime
  optionalLanguages: Object.freeze(['en', 'ta', 'tanglish']),
  audio: Object.freeze({
    ringtoneVolume: 1.0, // Full clear call ring level
    notificationVolume: 0.85, // Crisp distinct notification level
    ringtoneToneId: 'pk_signature_ring_v2',
    notificationToneId: 'pk_signature_notify_v2',
  }),
});

export interface PKSoundNote {
  freq: number;
  start: number;
  duration: number;
  type?: OscillatorType;
}

/**
 * Generates distinct PK Chat audio tones (Ringtone & Notification Tone)
 * using Web Audio API so they work reliably in web/APK previews without
 * relying on missing external sound files or copying WhatsApp's exact sound.
 */
export class PKSoundEngine {
  ctx: AudioContext | null = null;
  ringTimer: ReturnType<typeof setInterval> | null = null;
  isRinging = false;

  ensureContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
        } catch {
          this.ctx = null;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playTonePattern(notes: ReadonlyArray<PKSoundNote>, volume = 0.9): boolean {
    const ctx = this.ensureContext();
    if (!ctx) return false;

    const now = ctx.currentTime;
    const gainLevel = Math.max(0.05, Math.min(1, volume));

    notes.forEach(({ freq, start, duration, type = 'sine' }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + start);

      gain.gain.setValueAtTime(0.001, now + start);
      gain.gain.exponentialRampToValueAtTime(gainLevel, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + start);
      osc.stop(now + start + duration + 0.02);
    });
    return true;
  }

  /** Crisp 2-note chime distinct to PK Chat (messages/login notifications) */
  playNotificationTone(): boolean {
    return this.playTonePattern(
      [
        { freq: 587.33, start: 0.0, duration: 0.14, type: 'triangle' }, // D5
        { freq: 880.0, start: 0.12, duration: 0.24, type: 'sine' }, // A5
      ],
      PK_APP_EXPERIENCE.audio.notificationVolume
    );
  }

  /** Distinct PK Chat incoming call ringtone cadence (continuous loop until answered/declined) */
  startRingtone(): boolean {
    if (this.isRinging) return true;
    this.isRinging = true;

    const melody: readonly PKSoundNote[] = [
      { freq: 523.25, start: 0.0, duration: 0.18, type: 'sine' }, // C5
      { freq: 659.25, start: 0.2, duration: 0.18, type: 'sine' }, // E5
      { freq: 783.99, start: 0.4, duration: 0.22, type: 'triangle' }, // G5
      { freq: 659.25, start: 0.68, duration: 0.16, type: 'sine' }, // E5
      { freq: 987.77, start: 0.88, duration: 0.34, type: 'sine' }, // B5
    ];

    this.playTonePattern(melody, PK_APP_EXPERIENCE.audio.ringtoneVolume);
    this.ringTimer = setInterval(() => {
      if (this.isRinging) {
        this.playTonePattern(melody, PK_APP_EXPERIENCE.audio.ringtoneVolume);
      }
    }, 2200);
    return true;
  }

  stopRingtone(): void {
    this.isRinging = false;
    if (this.ringTimer !== null) {
      clearInterval(this.ringTimer);
      this.ringTimer = null;
    }
  }
}

export const pkSound = new PKSoundEngine();

export interface FirebaseLoginRequest<TAuth, TCredential, TUser> {
  authInstance: TAuth | null | undefined;
  signInFn?: ((auth: TAuth, credential: TCredential) => Promise<TUser>) | null;
  credential?: TCredential;
}

export type FirebaseLoginResult<TUser = unknown> =
  | { ok: true; user: TUser; language: string }
  | { ok: false; code: string; message: string };

/**
 * Safe error-handled Firebase login controller so users never get stuck on login errors
 */
export async function loginWithFirebasePhoneOrEmail<
  TAuth = unknown,
  TCredential = unknown,
  TUser = unknown,
>({
  authInstance,
  signInFn,
  credential,
}: FirebaseLoginRequest<TAuth, TCredential, TUser>): Promise<FirebaseLoginResult<TUser>> {
  if (!authInstance || typeof signInFn !== 'function') {
    return {
      ok: false,
      code: 'FIREBASE_NOT_READY',
      message: 'Firebase Auth is not initialized yet.',
    };
  }
  try {
    const user = await signInFn(authInstance, credential as TCredential);
    pkSound.playNotificationTone();
    return { ok: true, user, language: PK_APP_EXPERIENCE.defaultLanguage };
  } catch (err: unknown) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err && typeof (err as { code?: unknown }).code === 'string'
        ? (err as { code: string }).code
        : 'AUTH_ERROR';
    const message =
      err instanceof Error && err.message
        ? err.message
        : 'Unable to sign in. Please check Firebase config / network.';
    return {
      ok: false,
      code,
      message,
    };
  }
}
