export interface RingtoneConfig {
  loopIntervalMs: number;
  masterGain: number;
}

/**
 * PK Chat Signature Marimba Ringtone & Notification Engine
 * - Pure instrumental marimba synthesis (no human voice/speech)
 * - Rhythmic phrasing inspired by the shared marimba reference style,
 *   composed as a distinct sequence for PK Chat.
 */
export class PKChatSignatureAudioEngine {
  private audioCtx: AudioContext | null = null;
  private ringIntervalId: ReturnType<typeof setInterval> | null = null;
  private isPlayingRingtone = false;

  private readonly config: RingtoneConfig = {
    loopIntervalMs: 2100,
    masterGain: 0.24,
  };

  public get isRinging(): boolean {
    return this.isPlayingRingtone;
  }

  public getConfig(): Readonly<RingtoneConfig> {
    return this.config;
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    if (!this.audioCtx) {
      this.audioCtx = new AudioContextClass();
    }

    if (this.audioCtx.state === 'suspended' && typeof this.audioCtx.resume === 'function') {
      this.audioCtx.resume().catch(() => {
        // Ignore resume errors before user gesture
      });
    }

    return this.audioCtx;
  }

  /**
   * Plays a single crisp marimba-like note with a clean attack and natural decay.
   */
  private triggerMarimbaNote(
    frequencyHz: number,
    startOffsetSec: number,
    durationSec: number,
    peakGain: number
  ): void {
    const ctx = this.getAudioContext();
    if (!ctx) {
      return;
    }

    const startTime = ctx.currentTime + startOffsetSec;
    const endTime = startTime + durationSec;

    const fundamentalOsc = ctx.createOscillator();
    const harmonicOsc = ctx.createOscillator();

    const fundamentalGain = ctx.createGain();
    const harmonicGain = ctx.createGain();
    const envelopeGain = ctx.createGain();

    // Warm marimba fundamental + soft wooden overtone
    fundamentalOsc.type = 'sine';
    fundamentalOsc.frequency.setValueAtTime(frequencyHz, startTime);

    harmonicOsc.type = 'triangle';
    harmonicOsc.frequency.setValueAtTime(frequencyHz * 2, startTime);

    fundamentalGain.gain.setValueAtTime(1.0, startTime);
    harmonicGain.gain.setValueAtTime(0.18, startTime);

    // Crisp mallet strike (10ms attack) + smooth release
    envelopeGain.gain.setValueAtTime(0.0001, startTime);
    envelopeGain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, peakGain),
      startTime + 0.01
    );
    envelopeGain.gain.exponentialRampToValueAtTime(0.0001, endTime);

    fundamentalOsc.connect(fundamentalGain);
    harmonicOsc.connect(harmonicGain);

    fundamentalGain.connect(envelopeGain);
    harmonicGain.connect(envelopeGain);

    envelopeGain.connect(ctx.destination);

    fundamentalOsc.start(startTime);
    harmonicOsc.start(startTime);

    fundamentalOsc.stop(endTime + 0.02);
    harmonicOsc.stop(endTime + 0.02);
  }

  /**
   * Plays one rhythmic phrase of the PK Chat marimba ringtone.
   * Two-note motif ("PK" -> "Chat") repeated with a short musical pause.
   */
  public playRingtonePhraseOnce(): void {
    const gain = this.config.masterGain;

    // Phrase 1: "PK" (G5) -> "Chat" (C6)
    this.triggerMarimbaNote(783.99, 0.0, 0.16, gain * 0.9);
    this.triggerMarimbaNote(1046.5, 0.15, 0.28, gain);

    // Short pause, then Phrase 2: "PK" (A5) -> "Chat" (D6)
    this.triggerMarimbaNote(880.0, 0.62, 0.16, gain * 0.9);
    this.triggerMarimbaNote(1174.66, 0.77, 0.34, gain);
  }

  /**
   * Starts looping the incoming call ringtone until stopIncomingRingtone() is called.
   */
  public startIncomingRingtone(): void {
    this.stopIncomingRingtone();
    this.isPlayingRingtone = true;

    this.playRingtonePhraseOnce();

    const setTimer =
      typeof window !== 'undefined' && typeof window.setInterval === 'function'
        ? window.setInterval.bind(window)
        : setInterval;

    this.ringIntervalId = setTimer(() => {
      if (this.isPlayingRingtone) {
        this.playRingtonePhraseOnce();
      }
    }, this.config.loopIntervalMs);
  }

  /**
   * Stops the incoming call ringtone immediately.
   */
  public stopIncomingRingtone(): void {
    this.isPlayingRingtone = false;

    if (this.ringIntervalId !== null) {
      if (typeof window !== 'undefined' && typeof window.clearInterval === 'function') {
        window.clearInterval(this.ringIntervalId as unknown as number);
      } else {
        clearInterval(this.ringIntervalId);
      }
      this.ringIntervalId = null;
    }
  }

  /**
   * Plays a short, clear marimba notification chime for incoming messages.
   */
  public playNotificationTone(): void {
    const gain = this.config.masterGain * 0.85;
    this.triggerMarimbaNote(783.99, 0.0, 0.14, gain * 0.9);
    this.triggerMarimbaNote(1046.5, 0.13, 0.22, gain);
  }

  /**
   * Cleans up audio timers and AudioContext resources.
   */
  public dispose(): void {
    this.stopIncomingRingtone();
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {
        // Ignore close errors
      });
      this.audioCtx = null;
    }
  }
}

export const pkSignatureAudio = new PKChatSignatureAudioEngine();
