import { shouldSuppressIncomingAudio } from './connectivityAndDnd';
import {
  PK_APP_EXPERIENCE,
  PKSoundEngine,
  pkSound,
  type PKSoundNote,
} from './pkExperienceController';
import {
  PKChatSoundEngine,
  pkChatMirrorSound,
} from './pkMirrorEngine';
import {
  PKChatSignatureAudioEngine,
  pkSignatureAudio,
  type RingtoneConfig,
} from './pkSignatureAudioEngine';

export {
  PK_APP_EXPERIENCE,
  PKChatSignatureAudioEngine,
  PKChatSoundEngine,
  PKSoundEngine,
  pkChatMirrorSound,
  pkSignatureAudio,
  pkSound,
  type PKSoundNote,
  type RingtoneConfig,
};

export type RingtonePresetId =
  | 'pk_signature_call'
  | 'pk_signature_ring_v2'
  | 'pk_group_call'
  | 'harbor_chimes'
  | 'sanctuary_harp'
  | 'ringtone_038'
  | 'classic_crystal'
  | 'custom'
  | 'silent';

export type NotificationTonePresetId =
  | 'pk_direct_chime'
  | 'pk_signature_notify_v2'
  | 'pk_group_chime'
  | 'dewdrop_pluck'
  | 'warm_bell'
  | 'notification_051'
  | 'soft_chime'
  | 'custom'
  | 'silent';

export type AudioChannelId =
  | 'direct_message'
  | 'group_message'
  | 'direct_call'
  | 'group_call';

export interface AudioToneOption<T extends string> {
  id: T;
  label: string;
  subtitle: string;
}

export interface CustomAudioTrackMeta {
  name: string;
  mimeType: string;
  dataUrl: string;
  sizeBytes: number;
}

export const DIRECT_CALL_PRESETS: AudioToneOption<RingtonePresetId>[] = [
  {
    id: 'pk_signature_call',
    label: 'PK Chat Default (Signature)',
    subtitle: 'Original soft marimba, gentle crystal bell & warm ambient notes',
  },
  {
    id: 'harbor_chimes',
    label: 'Calm Harbor Melody',
    subtitle: 'Soothing marimba & bell arpeggio in F major warmth',
  },
  {
    id: 'sanctuary_harp',
    label: 'Evening Sanctuary Pad',
    subtitle: 'Tranquil ambient pad & soft marimba bell cadence',
  },
  {
    id: 'silent',
    label: 'Silent',
    subtitle: 'Mute incoming 1-on-1 call audio alerts',
  },
  {
    id: 'custom',
    label: '+ Choose from Device (Custom Audio)',
    subtitle: 'Upload your own MP3, WAV, M4A, or OGG ringtone',
  },
];

export const GROUP_CALL_PRESETS: AudioToneOption<RingtonePresetId>[] = [
  {
    id: 'pk_group_call',
    label: 'PK Chat Default (Signature)',
    subtitle: 'Uplifting group marimba cascade with soft ambient bell harmony',
  },
  {
    id: 'harbor_chimes',
    label: 'Calm Harbor Ensemble',
    subtitle: 'Flowing multi-voice soothing marimba & bell melody',
  },
  {
    id: 'sanctuary_harp',
    label: 'Warm Horizon Ambient',
    subtitle: 'Gentle inviting ambient chord progression for group calls',
  },
  {
    id: 'silent',
    label: 'Silent',
    subtitle: 'Mute incoming group call audio alerts',
  },
  {
    id: 'custom',
    label: '+ Choose from Device (Custom Audio)',
    subtitle: 'Upload your own custom group call audio file',
  },
];

export const DIRECT_MESSAGE_PRESETS: AudioToneOption<NotificationTonePresetId>[] = [
  {
    id: 'pk_direct_chime',
    label: 'PK Chat Default (Signature)',
    subtitle: 'Exclusive 1.3s pleasant soft marimba & bell notification chime',
  },
  {
    id: 'dewdrop_pluck',
    label: 'Morning Marimba',
    subtitle: 'Soft two-step marimba & ambient sparkle',
  },
  {
    id: 'warm_bell',
    label: 'Warm Bell Glow',
    subtitle: 'Gentle soft resolving bell chime',
  },
  {
    id: 'silent',
    label: 'Silent',
    subtitle: 'Mute direct message notification sounds',
  },
  {
    id: 'custom',
    label: '+ Choose from Device (Custom Audio)',
    subtitle: 'Upload your own custom direct message chime',
  },
];

export const GROUP_MESSAGE_PRESETS: AudioToneOption<NotificationTonePresetId>[] = [
  {
    id: 'pk_group_chime',
    label: 'PK Chat Default (Signature)',
    subtitle: 'Distinct ascending three-note PK Chat group marimba chime',
  },
  {
    id: 'dewdrop_pluck',
    label: 'Lantern Ripple',
    subtitle: 'Gentle cascading group marimba notification',
  },
  {
    id: 'warm_bell',
    label: 'Ensemble Whisper',
    subtitle: 'Subtle warm ambient triad chime for group rooms',
  },
  {
    id: 'silent',
    label: 'Silent',
    subtitle: 'Mute group message notification sounds',
  },
  {
    id: 'custom',
    label: '+ Choose from Device (Custom Audio)',
    subtitle: 'Upload your own custom group notification tone',
  },
];

// Backward-compatible arrays preserved for callers expecting general ringtone/notification options
export const RINGTONE_PRESETS: AudioToneOption<RingtonePresetId>[] = DIRECT_CALL_PRESETS;
export const NOTIFICATION_TONE_PRESETS: AudioToneOption<NotificationTonePresetId>[] =
  DIRECT_MESSAGE_PRESETS;

const MASTER_SOUND_KEY = 'pk_master_sound_enabled';
const RINGTONE_STORAGE_KEY = 'pk_ringtone_preset';
const GROUP_RINGTONE_STORAGE_KEY = 'pk_group_ringtone_preset';
const NOTIFICATION_STORAGE_KEY = 'pk_notification_tone_preset';
const GROUP_NOTIFICATION_STORAGE_KEY = 'pk_group_notification_tone_preset';
const CUSTOM_AUDIO_PREFIX = 'pk_custom_audio_';

export const AUDIO_SETTINGS_CHANGED_EVENT = 'pkchat-audio-settings-changed';
export const RINGTONE_STATE_EVENT = 'pkchat-ringtone-state';
export const MAX_CUSTOM_AUDIO_BYTES = 2_500_000;
export const DEFAULT_RING_TIMEOUT_MS = 45_000;

let sharedAudioCtx: AudioContext | null = null;
let sharedCompressor: DynamicsCompressorNode | null = null;
let sharedMasterGain: GainNode | null = null;
let gestureUnlockInstalled = false;

let activeRingInterval: ReturnType<typeof setInterval> | null = null;
let ringingActive = false;
let activeCustomAudioEl: HTMLAudioElement | null = null;
let activeScheduledNodes: Array<{ stop?: (when?: number) => void; disconnect: () => void }> = [];

let activeRingbackInterval: ReturnType<typeof setInterval> | null = null;
let ringbackActive = false;
let ringbackSpeakerOn = false;
let ringbackNodes: Array<{ stop?: (when?: number) => void; disconnect: () => void }> = [];
let ringbackMasterGain: GainNode | null = null;

let activeSirenInterval: ReturnType<typeof setInterval> | null = null;
let sosSirenActive = false;
let sirenNodes: Array<{ stop?: (when?: number) => void; disconnect: () => void }> = [];

function emitRingtoneState(active: boolean): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(RINGTONE_STATE_EVENT, { detail: { active } }));
    } catch {
      // ignore
    }
  }
}

function safeGetStorage(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      return (globalThis as unknown as { localStorage: Storage }).localStorage.getItem(key);
    }
  } catch {
    return null;
  }
  return null;
}

function safeSetStorage(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    } else if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      (globalThis as unknown as { localStorage: Storage }).localStorage.setItem(key, value);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(AUDIO_SETTINGS_CHANGED_EVENT));
    }
  } catch {
    // ignore storage quota errors
  }
}

function safeRemoveStorage(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    } else if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      (globalThis as unknown as { localStorage: Storage }).localStorage.removeItem(key);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(AUDIO_SETTINGS_CHANGED_EVENT));
    }
  } catch {
    // ignore
  }
}

export function isMasterSoundEnabled(): boolean {
  const raw = safeGetStorage(MASTER_SOUND_KEY);
  return raw !== 'false';
}

export function setMasterSoundEnabled(enabled: boolean): boolean {
  safeSetStorage(MASTER_SOUND_KEY, enabled ? 'true' : 'false');
  if (!enabled) {
    stopRingingLoop();
  }
  return enabled;
}

function normalizeRingtoneId(
  raw: string | null,
  fallback: RingtonePresetId
): RingtonePresetId {
  if (!raw) return fallback;
  if (raw === 'ringtone_038' || raw === 'pk_signature_ring_v2') return 'pk_signature_call';
  if (raw === 'classic_crystal') return 'harbor_chimes';
  if (
    raw === 'pk_signature_call' ||
    raw === 'pk_group_call' ||
    raw === 'harbor_chimes' ||
    raw === 'sanctuary_harp' ||
    raw === 'custom' ||
    raw === 'silent'
  ) {
    return raw;
  }
  return fallback;
}

function normalizeNotificationId(
  raw: string | null,
  fallback: NotificationTonePresetId
): NotificationTonePresetId {
  if (!raw) return fallback;
  if (raw === 'notification_051') return fallback;
  if (raw === 'pk_signature_notify_v2') return 'pk_direct_chime';
  if (raw === 'soft_chime') return 'warm_bell';
  if (
    raw === 'pk_direct_chime' ||
    raw === 'pk_group_chime' ||
    raw === 'dewdrop_pluck' ||
    raw === 'warm_bell' ||
    raw === 'custom' ||
    raw === 'silent'
  ) {
    return raw;
  }
  return fallback;
}

export function getSelectedRingtonePreset(
  channel: 'direct_call' | 'group_call' = 'direct_call'
): RingtonePresetId {
  if (channel === 'group_call') {
    return normalizeRingtoneId(safeGetStorage(GROUP_RINGTONE_STORAGE_KEY), 'pk_group_call');
  }
  return normalizeRingtoneId(safeGetStorage(RINGTONE_STORAGE_KEY), 'pk_signature_call');
}

export function setSelectedRingtonePreset(
  preset: RingtonePresetId,
  channel: 'direct_call' | 'group_call' = 'direct_call'
): RingtonePresetId {
  const normalized = normalizeRingtoneId(
    preset,
    channel === 'group_call' ? 'pk_group_call' : 'pk_signature_call'
  );
  safeSetStorage(
    channel === 'group_call' ? GROUP_RINGTONE_STORAGE_KEY : RINGTONE_STORAGE_KEY,
    normalized
  );
  return normalized;
}

export function getSelectedNotificationTonePreset(
  channel: 'direct_message' | 'group_message' = 'direct_message'
): NotificationTonePresetId {
  if (channel === 'group_message') {
    return normalizeNotificationId(
      safeGetStorage(GROUP_NOTIFICATION_STORAGE_KEY),
      'pk_group_chime'
    );
  }
  return normalizeNotificationId(
    safeGetStorage(NOTIFICATION_STORAGE_KEY),
    'pk_direct_chime'
  );
}

export function setSelectedNotificationTonePreset(
  preset: NotificationTonePresetId,
  channel: 'direct_message' | 'group_message' = 'direct_message'
): NotificationTonePresetId {
  const normalized = normalizeNotificationId(
    preset,
    channel === 'group_message' ? 'pk_group_chime' : 'pk_direct_chime'
  );
  safeSetStorage(
    channel === 'group_message' ? GROUP_NOTIFICATION_STORAGE_KEY : NOTIFICATION_STORAGE_KEY,
    normalized
  );
  return normalized;
}

export function getCustomAudioTrack(channel: AudioChannelId): CustomAudioTrackMeta | null {
  const raw = safeGetStorage(`${CUSTOM_AUDIO_PREFIX}${channel}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CustomAudioTrackMeta>;
    if (
      typeof parsed?.dataUrl === 'string' &&
      parsed.dataUrl.startsWith('data:audio/') &&
      typeof parsed.name === 'string'
    ) {
      return {
        name: parsed.name,
        mimeType: parsed.mimeType || 'audio/mpeg',
        dataUrl: parsed.dataUrl,
        sizeBytes: typeof parsed.sizeBytes === 'number' ? parsed.sizeBytes : parsed.dataUrl.length,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function setCustomAudioTrack(
  channel: AudioChannelId,
  track: CustomAudioTrackMeta
): CustomAudioTrackMeta {
  if (!track.dataUrl.startsWith('data:audio/')) {
    throw new Error('Selected file must be a valid audio track (MP3, WAV, M4A, or OGG).');
  }
  if (track.sizeBytes > MAX_CUSTOM_AUDIO_BYTES) {
    throw new Error('Custom audio file must be under 2.5 MB.');
  }
  safeSetStorage(`${CUSTOM_AUDIO_PREFIX}${channel}`, JSON.stringify(track));
  if (channel === 'direct_call' || channel === 'group_call') {
    setSelectedRingtonePreset('custom', channel);
  } else {
    setSelectedNotificationTonePreset('custom', channel);
  }
  return track;
}

export function clearCustomAudioTrack(channel: AudioChannelId): void {
  safeRemoveStorage(`${CUSTOM_AUDIO_PREFIX}${channel}`);
  if (channel === 'direct_call') {
    if (getSelectedRingtonePreset('direct_call') === 'custom') {
      setSelectedRingtonePreset('pk_signature_call', 'direct_call');
    }
  } else if (channel === 'group_call') {
    if (getSelectedRingtonePreset('group_call') === 'custom') {
      setSelectedRingtonePreset('pk_group_call', 'group_call');
    }
  } else if (channel === 'direct_message') {
    if (getSelectedNotificationTonePreset('direct_message') === 'custom') {
      setSelectedNotificationTonePreset('pk_direct_chime', 'direct_message');
    }
  } else if (getSelectedNotificationTonePreset('group_message') === 'custom') {
    setSelectedNotificationTonePreset('pk_group_chime', 'group_message');
  }
}

export function getRingtoneLabel(
  preset?: RingtonePresetId,
  channel: 'direct_call' | 'group_call' = 'direct_call'
): string {
  const effective = preset ?? getSelectedRingtonePreset(channel);
  if (effective === 'custom') {
    const custom = getCustomAudioTrack(channel);
    return custom ? `Custom: ${custom.name}` : 'Custom Device Audio';
  }
  const list = channel === 'group_call' ? GROUP_CALL_PRESETS : DIRECT_CALL_PRESETS;
  return list.find((item) => item.id === effective)?.label ?? 'PK Chat Default (Signature)';
}

export function getNotificationToneLabel(
  preset?: NotificationTonePresetId,
  channel: 'direct_message' | 'group_message' = 'direct_message'
): string {
  const effective = preset ?? getSelectedNotificationTonePreset(channel);
  if (effective === 'custom') {
    const custom = getCustomAudioTrack(channel);
    return custom ? `Custom: ${custom.name}` : 'Custom Device Audio';
  }
  const list = channel === 'group_message' ? GROUP_MESSAGE_PRESETS : DIRECT_MESSAGE_PRESETS;
  return list.find((item) => item.id === effective)?.label ?? 'PK Chat Default (Signature)';
}

export function isRingingActive(): boolean {
  return ringingActive;
}

function installAudioGestureUnlock(): void {
  if (
    gestureUnlockInstalled ||
    typeof window === 'undefined' ||
    typeof window.addEventListener !== 'function'
  ) {
    return;
  }
  gestureUnlockInstalled = true;
  const unlock = () => {
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume().catch(() => {});
    }
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

function getAudioGraph(): { ctx: AudioContext; destination: AudioNode } | null {
  if (typeof window === 'undefined') return null;
  installAudioGestureUnlock();
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new Ctor();
    sharedCompressor = null;
    sharedMasterGain = null;
  }

  if (!sharedCompressor || !sharedMasterGain) {
    sharedMasterGain = sharedAudioCtx.createGain();
    sharedMasterGain.gain.setValueAtTime(
      PK_APP_EXPERIENCE.audio.ringtoneVolume,
      sharedAudioCtx.currentTime
    );

    sharedCompressor = sharedAudioCtx.createDynamicsCompressor();
    sharedCompressor.threshold.setValueAtTime(-14, sharedAudioCtx.currentTime);
    sharedCompressor.knee.setValueAtTime(16, sharedAudioCtx.currentTime);
    sharedCompressor.ratio.setValueAtTime(3.5, sharedAudioCtx.currentTime);
    sharedCompressor.attack.setValueAtTime(0.004, sharedAudioCtx.currentTime);
    sharedCompressor.release.setValueAtTime(0.18, sharedAudioCtx.currentTime);

    sharedMasterGain.connect(sharedCompressor);
    sharedCompressor.connect(sharedAudioCtx.destination);
  }

  return { ctx: sharedAudioCtx, destination: sharedMasterGain };
}

function runWhenAudioResumed(
  ctx: AudioContext,
  shouldStillRun: () => boolean,
  schedule: () => void
): void {
  if (ctx.state === 'running') {
    if (shouldStillRun()) schedule();
    return;
  }
  if (ctx.state === 'suspended') {
    void ctx
      .resume()
      .then(() => {
        if (shouldStillRun()) schedule();
      })
      .catch(() => {
        // Browser may still require direct user gesture before audio playback
      });
  }
}

function trackNode(node: { stop?: (when?: number) => void; disconnect: () => void }, isRing: boolean) {
  if (isRing) {
    if (activeScheduledNodes.length > 140) {
      activeScheduledNodes = activeScheduledNodes.slice(-70);
    }
    activeScheduledNodes.push(node);
  }
}

/**
 * Synthesizes a pleasant, soft wooden marimba note with gentle mallet warmth and natural decay.
 * Zero harsh buzz or sharp metallic clicks.
 */
function playWarmMarimbaNote(
  ctx: AudioContext,
  destination: AudioNode,
  freq: number,
  startOffsetSec: number,
  durationSec: number,
  peakGain: number,
  trackAsRing = false
): void {
  const t0 = ctx.currentTime + startOffsetSec;

  const fundamental = ctx.createOscillator();
  const malletHarm = ctx.createOscillator();
  const subWarmth = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const malletGain = ctx.createGain();
  const subGain = ctx.createGain();
  const env = ctx.createGain();

  fundamental.type = 'sine';
  fundamental.frequency.setValueAtTime(freq, t0);

  // Classic marimba 4th-harmonic wooden attack transient that fades out very softly
  malletHarm.type = 'sine';
  malletHarm.frequency.setValueAtTime(freq * 3.98, t0);
  malletGain.gain.setValueAtTime(0.14, t0);
  malletGain.gain.exponentialRampToValueAtTime(0.002, t0 + 0.09);

  // Subtle octave warmth
  subWarmth.type = 'sine';
  subWarmth.frequency.setValueAtTime(freq * 2, t0);
  subGain.gain.setValueAtTime(0.18, t0);
  subGain.gain.exponentialRampToValueAtTime(0.01, t0 + durationSec * 0.55);

  filter.type = 'lowpass';
  filter.Q.setValueAtTime(0.7, t0);
  filter.frequency.setValueAtTime(Math.min(freq * 4.5, 3600), t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.4, 340), t0 + durationSec);

  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(peakGain, t0 + 0.014);
  env.gain.exponentialRampToValueAtTime(peakGain * 0.42, t0 + Math.min(0.22, durationSec * 0.38));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

  fundamental.connect(filter);
  malletHarm.connect(malletGain);
  malletGain.connect(filter);
  subWarmth.connect(subGain);
  subGain.connect(filter);

  filter.connect(env);
  env.connect(destination);

  fundamental.start(t0);
  malletHarm.start(t0);
  subWarmth.start(t0);

  const stopAt = t0 + durationSec + 0.04;
  fundamental.stop(stopAt);
  malletHarm.stop(stopAt);
  subWarmth.stop(stopAt);

  if (trackAsRing) {
    trackNode(fundamental, true);
    trackNode(malletHarm, true);
    trackNode(subWarmth, true);
    trackNode(env, true);
  }
}

/**
 * Synthesizes a pure, radiant PK Chat soft crystal bell shimmer (zero harsh square-wave buzz).
 * Adds unmistakable crisp definition for incoming melodies and notification chimes.
 */
function playCrystalBellTone(
  ctx: AudioContext,
  destination: AudioNode,
  freq: number,
  startOffsetSec: number,
  durationSec: number,
  peakGain: number,
  trackAsRing = false
): void {
  const t0 = ctx.currentTime + startOffsetSec;
  const fund = ctx.createOscillator();
  const octave = ctx.createOscillator();
  const shimmer = ctx.createOscillator();
  const octGain = ctx.createGain();
  const shimGain = ctx.createGain();
  const env = ctx.createGain();

  fund.type = 'sine';
  fund.frequency.setValueAtTime(freq, t0);

  octave.type = 'sine';
  octave.frequency.setValueAtTime(freq * 2, t0);

  shimmer.type = 'sine';
  shimmer.frequency.setValueAtTime(freq * 3.01, t0);

  octGain.gain.setValueAtTime(0.22, t0);
  octGain.gain.exponentialRampToValueAtTime(0.03, t0 + durationSec);

  shimGain.gain.setValueAtTime(0.07, t0);
  shimGain.gain.exponentialRampToValueAtTime(0.003, t0 + Math.min(0.22, durationSec * 0.45));

  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(peakGain, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(peakGain * 0.36, t0 + Math.min(0.2, durationSec * 0.38));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

  fund.connect(env);
  octave.connect(octGain);
  octGain.connect(env);
  shimmer.connect(shimGain);
  shimGain.connect(env);
  env.connect(destination);

  fund.start(t0);
  octave.start(t0);
  shimmer.start(t0);

  const stopAt = t0 + durationSec + 0.03;
  fund.stop(stopAt);
  octave.stop(stopAt);
  shimmer.stop(stopAt);

  if (trackAsRing) {
    trackNode(fund, true);
    trackNode(octave, true);
    trackNode(shimmer, true);
    trackNode(env, true);
  }
}

/**
 * Synthesizes an airy, soothing ambient pad bloom for smooth harmonic depth under PK Chat melodies.
 */
function playAmbientPadTone(
  ctx: AudioContext,
  destination: AudioNode,
  freq: number,
  startOffsetSec: number,
  durationSec: number,
  peakGain: number,
  trackAsRing = false
): void {
  const t0 = ctx.currentTime + startOffsetSec;
  const base = ctx.createOscillator();
  const fifth = ctx.createOscillator();
  const fifthGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();

  base.type = 'sine';
  base.frequency.setValueAtTime(freq, t0);

  fifth.type = 'sine';
  fifth.frequency.setValueAtTime(freq * 1.498, t0);
  fifthGain.gain.setValueAtTime(0.24, t0);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1600, t0);

  const attack = Math.min(0.24, durationSec * 0.3);
  const release = Math.min(0.42, durationSec * 0.45);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(peakGain, t0 + attack);
  env.gain.setValueAtTime(peakGain * 0.85, Math.max(t0 + attack, t0 + durationSec - release));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

  base.connect(filter);
  fifth.connect(fifthGain);
  fifthGain.connect(filter);
  filter.connect(env);
  env.connect(destination);

  base.start(t0);
  fifth.start(t0);

  const stopAt = t0 + durationSec + 0.05;
  base.stop(stopAt);
  fifth.stop(stopAt);

  if (trackAsRing) {
    trackNode(base, true);
    trackNode(fifth, true);
    trackNode(env, true);
  }
}

function playCustomAudioFile(
  channel: AudioChannelId,
  options: { loop?: boolean; volume?: number } = {}
): boolean {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return false;
  const custom = getCustomAudioTrack(channel);
  if (!custom) return false;
  try {
    if (options.loop) {
      stopCustomAudioElement();
    }
    const audio = new Audio(custom.dataUrl);
    audio.loop = Boolean(options.loop);
    audio.volume = options.volume ?? 0.9;
    if (options.loop) {
      activeCustomAudioEl = audio;
    }
    void audio.play().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

function stopCustomAudioElement(): void {
  if (activeCustomAudioEl) {
    try {
      activeCustomAudioEl.pause();
      activeCustomAudioEl.currentTime = 0;
    } catch {
      // ignore
    }
    activeCustomAudioEl = null;
  }
}

const RINGTONE_LOOP_INTERVAL_MS = 2900;

function playRingtoneCycle(
  preset: RingtonePresetId,
  channel: 'direct_call' | 'group_call',
  isRingLoop: boolean
): boolean {
  if (!isMasterSoundEnabled() || preset === 'silent') return false;
  if (preset === 'custom') {
    return playCustomAudioFile(channel, { loop: false, volume: 0.9 });
  }

  const graph = getAudioGraph();
  if (!graph) return false;
  const { ctx, destination } = graph;

  const normalized = normalizeRingtoneId(
    preset,
    channel === 'group_call' ? 'pk_group_call' : 'pk_signature_call'
  );

  const scheduleCycle = () => {
    const pad = 0.02;
    // PK Chat Signature Ringtone: Gentle, original C-major9 marimba + soft bell + warm ambient shimmer (1.85s motif + 1.05s rest)
    if (normalized === 'pk_signature_call') {
      playAmbientPadTone(ctx, destination, 261.63, pad + 0.0, 1.95, 0.08, isRingLoop); // C4 airy foundation
      playWarmMarimbaNote(ctx, destination, 523.25, pad + 0.02, 0.46, 0.23, isRingLoop); // C5
      playCrystalBellTone(ctx, destination, 523.25, pad + 0.02, 0.44, 0.11, isRingLoop);
      playWarmMarimbaNote(ctx, destination, 659.25, pad + 0.22, 0.46, 0.22, isRingLoop); // E5
      playWarmMarimbaNote(ctx, destination, 783.99, pad + 0.42, 0.54, 0.24, isRingLoop); // G5
      playCrystalBellTone(ctx, destination, 1046.5, pad + 0.64, 0.72, 0.16, isRingLoop); // C6 soft bloom
      playWarmMarimbaNote(ctx, destination, 587.33, pad + 0.64, 0.62, 0.18, isRingLoop); // D5 gentle warmth
      playWarmMarimbaNote(ctx, destination, 880.0, pad + 1.08, 0.48, 0.2, isRingLoop); // A5
      playCrystalBellTone(ctx, destination, 783.99, pad + 1.32, 0.72, 0.17, isRingLoop); // G5 resolving sigh
      playWarmMarimbaNote(ctx, destination, 659.25, pad + 1.34, 0.68, 0.19, isRingLoop); // E5
      return;
    }

    // Distinct PK Chat Group Call Ringtone: Warm G-major6 gentle marimba cascade + airy ambient bloom
    if (normalized === 'pk_group_call') {
      playAmbientPadTone(ctx, destination, 196.0, pad + 0.0, 1.9, 0.08, isRingLoop); // G3 airy cushion
      playWarmMarimbaNote(ctx, destination, 392.0, pad + 0.02, 0.45, 0.21, isRingLoop); // G4
      playWarmMarimbaNote(ctx, destination, 493.88, pad + 0.2, 0.46, 0.21, isRingLoop); // B4
      playCrystalBellTone(ctx, destination, 587.33, pad + 0.38, 0.56, 0.15, isRingLoop); // D5
      playWarmMarimbaNote(ctx, destination, 659.25, pad + 0.58, 0.64, 0.22, isRingLoop); // E5
      playCrystalBellTone(ctx, destination, 783.99, pad + 0.96, 0.58, 0.17, isRingLoop); // G5
      playWarmMarimbaNote(ctx, destination, 587.33, pad + 1.24, 0.68, 0.19, isRingLoop); // D5
      return;
    }

    if (normalized === 'harbor_chimes') {
      playAmbientPadTone(ctx, destination, 174.61, pad + 0.0, 1.85, 0.075, isRingLoop); // F3 pad
      playWarmMarimbaNote(ctx, destination, 349.23, pad + 0.02, 0.52, 0.21, isRingLoop); // F4
      playCrystalBellTone(ctx, destination, 440.0, pad + 0.24, 0.56, 0.15, isRingLoop); // A4
      playWarmMarimbaNote(ctx, destination, 523.25, pad + 0.46, 0.62, 0.21, isRingLoop); // C5
      playCrystalBellTone(ctx, destination, 659.25, pad + 0.7, 0.7, 0.16, isRingLoop); // E5
      playWarmMarimbaNote(ctx, destination, 587.33, pad + 1.12, 0.56, 0.19, isRingLoop); // D5
      playCrystalBellTone(ctx, destination, 523.25, pad + 1.4, 0.68, 0.15, isRingLoop); // C5
      return;
    }

    // sanctuary_harp -> Evening Sanctuary Pad
    playAmbientPadTone(ctx, destination, 220.0, pad + 0.0, 1.85, 0.085, isRingLoop); // A3 gentle pad
    playWarmMarimbaNote(ctx, destination, 440.0, pad + 0.04, 0.6, 0.2, isRingLoop); // A4
    playCrystalBellTone(ctx, destination, 554.37, pad + 0.3, 0.62, 0.15, isRingLoop); // C#5
    playWarmMarimbaNote(ctx, destination, 659.25, pad + 0.58, 0.66, 0.21, isRingLoop); // E5
    playCrystalBellTone(ctx, destination, 880.0, pad + 0.92, 0.74, 0.16, isRingLoop); // A5
    playWarmMarimbaNote(ctx, destination, 659.25, pad + 1.38, 0.68, 0.18, isRingLoop); // E5
  };

  runWhenAudioResumed(
    ctx,
    () => !isRingLoop || ringingActive,
    scheduleCycle
  );
  return true;
}

/**
 * Plays a ringtone preview in Settings -> Notifications / Ringtones.
 * Defaults to a continuous repeating loop (like a real incoming call) until stopped or switched.
 */
export function playRingtonePreview(
  preset?: RingtonePresetId,
  channel: 'direct_call' | 'group_call' = 'direct_call',
  options?: { loop?: boolean }
): boolean {
  stopRingingLoop();
  if (!isMasterSoundEnabled()) return false;
  const effective = preset ?? getSelectedRingtonePreset(channel);
  if (effective === 'silent' || typeof window === 'undefined') return false;

  const shouldLoop = options?.loop !== false;

  if (effective === 'custom') {
    const started = playCustomAudioFile(channel, { loop: shouldLoop, volume: 0.9 });
    if (started && shouldLoop) {
      ringingActive = true;
      emitRingtoneState(true);
    }
    return started;
  }

  const graph = getAudioGraph();
  if (!graph) return false;

  ringingActive = shouldLoop;
  const played = playRingtoneCycle(effective, channel, shouldLoop);
  if (!played) {
    ringingActive = false;
    return false;
  }

  if (shouldLoop) {
    emitRingtoneState(true);
    activeRingInterval = setInterval(() => {
      if (!ringingActive) return;
      playRingtoneCycle(effective, channel, true);
    }, RINGTONE_LOOP_INTERVAL_MS);
  }
  return true;
}

export function startRingingLoop(
  preset?: RingtonePresetId,
  channel: 'direct_call' | 'group_call' = 'direct_call',
  options?: { isZoomClassCall?: boolean; isSosOverride?: boolean }
): void {
  // Always stop any prior ringtone immediately so ringtones never overlap
  stopRingingLoop();

  if (
    shouldSuppressIncomingAudio({
      isZoomClassCall: options?.isZoomClassCall,
      isSosOverride: options?.isSosOverride,
    })
  ) {
    return;
  }
  if (!isMasterSoundEnabled()) return;
  const effective = preset ?? getSelectedRingtonePreset(channel);
  if (effective === 'silent' || typeof window === 'undefined') return;

  if (effective === 'custom') {
    const started = playCustomAudioFile(channel, { loop: true, volume: 0.9 });
    if (started) {
      ringingActive = true;
      emitRingtoneState(true);
      return;
    }
    // Fallback cleanly to signature Web Audio ringtone if custom file missing
    const fallbackPreset = channel === 'group_call' ? 'pk_group_call' : 'pk_signature_call';
    ringingActive = true;
    if (!playRingtoneCycle(fallbackPreset, channel, true)) {
      ringingActive = false;
      return;
    }
    emitRingtoneState(true);
    activeRingInterval = setInterval(() => {
      if (!ringingActive) return;
      playRingtoneCycle(fallbackPreset, channel, true);
    }, RINGTONE_LOOP_INTERVAL_MS);
    return;
  }

  ringingActive = true;
  if (!playRingtoneCycle(effective, channel, true)) {
    ringingActive = false;
    return;
  }
  emitRingtoneState(true);
  activeRingInterval = setInterval(() => {
    if (!ringingActive) return;
    playRingtoneCycle(effective, channel, true);
  }, RINGTONE_LOOP_INTERVAL_MS);
}

export function stopRingingLoop(): void {
  const wasActive =
    ringingActive ||
    activeRingInterval !== null ||
    activeCustomAudioEl !== null ||
    pkSound.isRinging ||
    pkChatMirrorSound.isRinging ||
    pkSignatureAudio.isRinging;
  ringingActive = false;
  pkSound.stopRingtone();
  pkChatMirrorSound.stopIncomingRingtone();
  pkSignatureAudio.stopIncomingRingtone();
  if (activeRingInterval !== null) {
    clearInterval(activeRingInterval);
    activeRingInterval = null;
  }
  stopCustomAudioElement();
  if (activeScheduledNodes.length > 0) {
    for (const node of activeScheduledNodes) {
      try {
        node.stop?.(0);
      } catch {
        // node may already have stopped
      }
      try {
        node.disconnect();
      } catch {
        // ignore
      }
    }
    activeScheduledNodes = [];
  }
  if (wasActive) {
    emitRingtoneState(false);
  }
}

export function isRingbackActive(): boolean {
  return ringbackActive;
}

function playSingleMmmHumPulse(
  ctx: AudioContext,
  destination: AudioNode,
  offsetSec: number,
  durationSec: number
): void {
  const t0 = ctx.currentTime + offsetSec;
  const fund = ctx.createOscillator();
  const warmOct = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();

  // Gentle vocal/horn "mmm..." hum timbre (~225Hz + soft 450Hz overtone)
  fund.type = 'sine';
  fund.frequency.setValueAtTime(225, t0);
  fund.frequency.linearRampToValueAtTime(238, t0 + durationSec * 0.45);
  fund.frequency.linearRampToValueAtTime(228, t0 + durationSec);

  warmOct.type = 'triangle';
  warmOct.frequency.setValueAtTime(450, t0);

  const octGain = ctx.createGain();
  octGain.gain.setValueAtTime(0.18, t0);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(560, t0);

  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(0.85, t0 + 0.14);
  env.gain.setValueAtTime(0.82, Math.max(t0 + 0.14, t0 + durationSec - 0.18));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

  fund.connect(filter);
  warmOct.connect(octGain);
  octGain.connect(filter);
  filter.connect(env);
  env.connect(destination);

  fund.start(t0);
  warmOct.start(t0);
  const stopAt = t0 + durationSec + 0.04;
  fund.stop(stopAt);
  warmOct.stop(stopAt);

  if (ringbackNodes.length > 80) {
    ringbackNodes = ringbackNodes.slice(-40);
  }
  ringbackNodes.push(fund, warmOct, octGain, filter, env);
}

function playOutgoingMmmMmmCycle(): void {
  const graph = getAudioGraph();
  if (!graph) return;
  const { ctx, destination } = graph;
  runWhenAudioResumed(
    ctx,
    () => ringbackActive,
    () => {
      if (!ringbackMasterGain) {
        ringbackMasterGain = ctx.createGain();
        ringbackMasterGain.connect(destination);
      }
      const targetGain = ringbackSpeakerOn ? 0.56 : 0.18;
      ringbackMasterGain.gain.setValueAtTime(targetGain, ctx.currentTime);

      // Two smooth gentle "mmm... mmm..." outgoing ringback pulses
      playSingleMmmHumPulse(ctx, ringbackMasterGain, 0.02, 0.62);
      playSingleMmmHumPulse(ctx, ringbackMasterGain, 0.8, 0.68);
    }
  );
}

export function setRingbackSpeakerMode(speakerOn: boolean): boolean {
  ringbackSpeakerOn = speakerOn;
  if (sharedAudioCtx && ringbackMasterGain) {
    try {
      ringbackMasterGain.gain.setTargetAtTime(
        speakerOn ? 0.56 : 0.18,
        sharedAudioCtx.currentTime,
        0.04
      );
    } catch {
      // ignore gain adjustment failure
    }
  }
  return speakerOn;
}

export function startOutgoingRingbackLoop(options?: { speakerOn?: boolean }): void {
  stopOutgoingRingbackLoop();
  if (typeof window === 'undefined') return;
  ringbackSpeakerOn = Boolean(options?.speakerOn);
  ringbackActive = true;
  playOutgoingMmmMmmCycle();
  activeRingbackInterval = setInterval(() => {
    if (!ringbackActive) return;
    playOutgoingMmmMmmCycle();
  }, 2900);
}

export function stopOutgoingRingbackLoop(): void {
  ringbackActive = false;
  if (activeRingbackInterval !== null) {
    clearInterval(activeRingbackInterval);
    activeRingbackInterval = null;
  }
  if (ringbackNodes.length > 0) {
    for (const node of ringbackNodes) {
      try {
        node.stop?.(0);
      } catch {
        // ignore
      }
      try {
        node.disconnect();
      } catch {
        // ignore
      }
    }
    ringbackNodes = [];
  }
  if (ringbackMasterGain) {
    try {
      ringbackMasterGain.disconnect();
    } catch {
      // ignore
    }
    ringbackMasterGain = null;
  }
}

export function isSosSirenActive(): boolean {
  return sosSirenActive;
}

function playSosSirenPulse(): void {
  const graph = getAudioGraph();
  if (!graph) return;
  const { ctx, destination } = graph;
  const t0 = ctx.currentTime;

  const osc = ctx.createOscillator();
  const sub = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = 'triangle';
  sub.type = 'sine';

  // Unmistakable high-priority emergency dual-step alert cadence (never silenced by DND)
  osc.frequency.setValueAtTime(760, t0);
  osc.frequency.setValueAtTime(1020, t0 + 0.24);
  osc.frequency.setValueAtTime(760, t0 + 0.48);
  osc.frequency.setValueAtTime(1020, t0 + 0.72);

  sub.frequency.setValueAtTime(380, t0);
  sub.frequency.setValueAtTime(510, t0 + 0.24);
  sub.frequency.setValueAtTime(380, t0 + 0.48);
  sub.frequency.setValueAtTime(510, t0 + 0.72);

  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(0.36, t0 + 0.03);
  env.gain.setValueAtTime(0.34, t0 + 0.88);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.98);

  osc.connect(env);
  sub.connect(env);
  env.connect(destination);

  osc.start(t0);
  sub.start(t0);
  osc.stop(t0 + 1.0);
  sub.stop(t0 + 1.0);

  sirenNodes.push(osc, sub, env);
}

/**
 * Starts Urgent SOS Emergency Siren — ALWAYS bypasses PK Chat DND, PK Live Class DND, and Master Mute.
 */
export function startUrgentSosSiren(): void {
  stopUrgentSosSiren();
  if (typeof window === 'undefined') return;
  stopRingingLoop();
  stopOutgoingRingbackLoop();
  sosSirenActive = true;
  playSosSirenPulse();
  activeSirenInterval = setInterval(() => {
    if (!sosSirenActive) return;
    playSosSirenPulse();
  }, 1150);
}

export function stopUrgentSosSiren(): void {
  sosSirenActive = false;
  if (activeSirenInterval !== null) {
    clearInterval(activeSirenInterval);
    activeSirenInterval = null;
  }
  if (sirenNodes.length > 0) {
    for (const node of sirenNodes) {
      try {
        node.stop?.(0);
      } catch {
        // ignore
      }
      try {
        node.disconnect();
      } catch {
        // ignore
      }
    }
    sirenNodes = [];
  }
}

export function playNotificationTone(
  presetOrChannel?: NotificationTonePresetId | 'direct_message' | 'group_message',
  explicitChannel?: 'direct_message' | 'group_message',
  options?: { allowDuringPreview?: boolean; isZoomClassCall?: boolean; isSosOverride?: boolean }
): boolean {
  let channel: 'direct_message' | 'group_message' = explicitChannel || 'direct_message';
  let requestedPreset: NotificationTonePresetId | undefined;

  if (presetOrChannel === 'direct_message' || presetOrChannel === 'group_message') {
    channel = presetOrChannel;
  } else {
    requestedPreset = presetOrChannel;
  }

  // Respect PK Chat / PK Live Class DND unless explicitly previewing in Settings or SOS override
  if (
    !options?.allowDuringPreview &&
    shouldSuppressIncomingAudio({
      isZoomClassCall: options?.isZoomClassCall,
      isSosOverride: options?.isSosOverride,
    })
  ) {
    return false;
  }

  // Interruption-free call protection: incoming message chimes MUST NOT interrupt or play over an active call ringtone
  if ((ringingActive || ringbackActive || sosSirenActive) && !options?.allowDuringPreview) {
    return false;
  }
  if (!isMasterSoundEnabled()) return false;

  const effective = requestedPreset ?? getSelectedNotificationTonePreset(channel);
  if (effective === 'silent') return false;

  if (effective === 'custom') {
    return playCustomAudioFile(channel, {
      loop: false,
      volume: PK_APP_EXPERIENCE.audio.notificationVolume,
    });
  }

  const graph = getAudioGraph();
  if (!graph) return false;
  const { ctx, destination } = graph;

  const normalized = normalizeNotificationId(
    effective,
    channel === 'group_message' ? 'pk_group_chime' : 'pk_direct_chime'
  );

  runWhenAudioResumed(
    ctx,
    () => true,
    () => {
      const pad = 0.02;
      // Direct Message Default (Signature): Exclusive 1.3s soft marimba + crystal bell PK Chat chime
      if (normalized === 'pk_direct_chime') {
        playAmbientPadTone(ctx, destination, 261.63, pad + 0.0, 1.15, 0.055, false); // C4 subtle air
        playWarmMarimbaNote(ctx, destination, 523.25, pad + 0.0, 0.42, 0.24, false); // C5
        playCrystalBellTone(ctx, destination, 659.25, pad + 0.14, 0.48, 0.17, false); // E5
        playWarmMarimbaNote(ctx, destination, 783.99, pad + 0.28, 0.62, 0.24, false); // G5
        playCrystalBellTone(ctx, destination, 1046.5, pad + 0.3, 0.82, 0.18, false); // C6 soft bloom
        return;
      }

      // Group Message Default (Signature): Exclusive 1.4s ascending 3-note PK Chat group marimba + bell chord
      if (normalized === 'pk_group_chime') {
        playAmbientPadTone(ctx, destination, 196.0, pad + 0.0, 1.25, 0.055, false); // G3 air
        playWarmMarimbaNote(ctx, destination, 392.0, pad + 0.0, 0.36, 0.21, false); // G4
        playWarmMarimbaNote(ctx, destination, 587.33, pad + 0.13, 0.44, 0.22, false); // D5
        playCrystalBellTone(ctx, destination, 587.33, pad + 0.13, 0.44, 0.15, false);
        playWarmMarimbaNote(ctx, destination, 783.99, pad + 0.27, 0.68, 0.23, false); // G5
        playCrystalBellTone(ctx, destination, 987.77, pad + 0.29, 0.84, 0.17, false); // B5 shimmer
        return;
      }

      if (normalized === 'dewdrop_pluck') {
        playWarmMarimbaNote(ctx, destination, 659.25, pad + 0.0, 0.4, 0.22, false); // E5
        playCrystalBellTone(ctx, destination, 987.77, pad + 0.13, 0.56, 0.18, false); // B5
        playCrystalBellTone(ctx, destination, 1318.51, pad + 0.25, 0.72, 0.15, false); // E6
        return;
      }

      // warm_bell
      playWarmMarimbaNote(ctx, destination, 783.99, pad + 0.02, 0.48, 0.2, false); // G5
      playCrystalBellTone(ctx, destination, 1046.5, pad + 0.16, 0.72, 0.19, false); // C6
    }
  );
  return true;
}
