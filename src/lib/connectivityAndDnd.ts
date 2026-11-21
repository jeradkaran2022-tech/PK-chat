import { tryReadAndroidBridgeGps } from './offlineSmsSos';

export type DataPackageMode = 'standard' | 'social_saver' | 'zero_data_continuity';

export interface AccurateGpsFix {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  source: 'live_gps' | 'android_bridge' | 'cached_gps' | 'profile_region';
  capturedAtMs: number;
}

export interface EmergencySirenAlertPayload {
  alertId: string;
  senderUid: string;
  senderName: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  locationLabel?: string;
  recipientUids: string[];
  recipientPhones: string[];
  createdAtMs: number;
  mode: 'urgent_siren' | 'quick_tap';
}

export const CONNECTIVITY_DND_EVENT = 'pkchat-connectivity-dnd-changed';
export const EMERGENCY_SIREN_EVENT = 'pkchat-emergency-siren-incoming';
export const EMERGENCY_SIREN_CHANNEL = 'pkchat_emergency_siren_v1';

const INTENTIONAL_DATA_OFF_KEY = 'pk_intentional_data_off';
const DATA_PACKAGE_MODE_KEY = 'pk_data_package_mode';
const PK_CHAT_DND_KEY = 'pk_chat_dnd_enabled';
const PK_CHAT_DND_UNTIL_KEY = 'pk_chat_dnd_until_ms';
const PK_LIVE_CLASS_DND_KEY = 'pk_live_class_dnd_enabled';
const LEGACY_ZOOM_CLASS_DND_KEY = 'pk_zoom_class_dnd_enabled';
const CACHED_GPS_KEY = 'pk_last_accurate_gps_v1';

function readStorage(key: string): string | null {
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

function writeStorage(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    } else if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      (globalThis as unknown as { localStorage: Storage }).localStorage.setItem(key, value);
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(CONNECTIVITY_DND_EVENT));
    }
  } catch {
    // ignore storage quota errors
  }
}

export function isIntentionalDataOff(): boolean {
  return readStorage(INTENTIONAL_DATA_OFF_KEY) === 'true';
}

export function setIntentionalDataOff(dataOff: boolean): boolean {
  writeStorage(INTENTIONAL_DATA_OFF_KEY, dataOff ? 'true' : 'false');
  return dataOff;
}

export function getDataPackageMode(): DataPackageMode {
  const raw = readStorage(DATA_PACKAGE_MODE_KEY);
  if (raw === 'social_saver' || raw === 'zero_data_continuity' || raw === 'standard') {
    return raw;
  }
  return 'standard';
}

export function setDataPackageMode(mode: DataPackageMode): DataPackageMode {
  writeStorage(DATA_PACKAGE_MODE_KEY, mode);
  return mode;
}

export function isLowDataPackageActive(): boolean {
  const mode = getDataPackageMode();
  return mode === 'social_saver' || mode === 'zero_data_continuity';
}

export function getPkChatDndUntilMs(): number | null {
  const raw = readStorage(PK_CHAT_DND_UNTIL_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= Date.now()) {
    writeStorage(PK_CHAT_DND_UNTIL_KEY, '');
    return null;
  }
  return parsed;
}

export function isPkChatDndEnabled(): boolean {
  if (readStorage(PK_CHAT_DND_KEY) === 'true') return true;
  return getPkChatDndUntilMs() !== null;
}

export function setPkChatDndEnabled(enabled: boolean): boolean {
  if (!enabled) {
    writeStorage(PK_CHAT_DND_UNTIL_KEY, '');
  }
  writeStorage(PK_CHAT_DND_KEY, enabled ? 'true' : 'false');
  return enabled;
}

export function setPkChatDndOvernight(hourMorning: number = 7): number {
  const target = new Date();
  target.setHours(hourMorning, 0, 0, 0);
  if (target.getTime() <= Date.now() + 60_000) {
    target.setDate(target.getDate() + 1);
  }
  const untilMs = target.getTime();
  writeStorage(PK_CHAT_DND_UNTIL_KEY, String(untilMs));
  writeStorage(PK_CHAT_DND_KEY, 'true');
  return untilMs;
}

export function isPkLiveClassDndEnabled(): boolean {
  return (
    readStorage(PK_LIVE_CLASS_DND_KEY) === 'true' ||
    readStorage(LEGACY_ZOOM_CLASS_DND_KEY) === 'true'
  );
}

export function setPkLiveClassDndEnabled(enabled: boolean): boolean {
  writeStorage(LEGACY_ZOOM_CLASS_DND_KEY, enabled ? 'true' : 'false');
  writeStorage(PK_LIVE_CLASS_DND_KEY, enabled ? 'true' : 'false');
  return enabled;
}

export function isZoomClassDndEnabled(): boolean {
  return isPkLiveClassDndEnabled();
}

export function setZoomClassDndEnabled(enabled: boolean): boolean {
  return setPkLiveClassDndEnabled(enabled);
}

/**
 * Determines whether incoming ringtone or notification sound should be silenced.
 * Emergency 1-second long-press SOS Sirens ALWAYS override both DND modes.
 */
export function shouldSuppressIncomingAudio(params: {
  isLiveClassCall?: boolean;
  isZoomClassCall?: boolean;
  isSosOverride?: boolean;
}): boolean {
  if (params.isSosOverride) return false;
  if (isIntentionalDataOff()) return true;
  if (params.isLiveClassCall || params.isZoomClassCall) {
    return isPkChatDndEnabled();
  }
  return isPkChatDndEnabled() || isPkLiveClassDndEnabled();
}

export type OutgoingCallConnectionLabel = 'Offline' | 'Calling...' | 'Ringing...';

export interface OutgoingCallEvaluation {
  label: OutgoingCallConnectionLabel;
  canRingDevice: boolean;
  allowZeroDataFallback: boolean;
  reason: string;
}

/**
 * Evaluates clean WhatsApp-accurate outgoing call display & zero-data continuity rules:
 * - Target has intentionally switched Mobile Data Off -> show "Offline", DO NOT disturb via GPS/SMS.
 * - Target does not have Data Off & is unreachable/offline -> show "Calling...", allow zero-data SIM/GPS fallback if local data is exhausted & local Data isn't Off.
 * - Target is online -> show "Ringing..." cleanly.
 */
export function evaluateOutgoingCallState(params: {
  targetOnlineStatus?: 'online' | 'offline';
  targetIntentionalDataOff?: boolean;
  localNetworkOnline: boolean;
  localIntentionalDataOff?: boolean;
}): OutgoingCallEvaluation {
  if (params.targetIntentionalDataOff) {
    return {
      label: 'Offline',
      canRingDevice: false,
      allowZeroDataFallback: false,
      reason: 'Recipient switched Mobile Data Off — marked Offline and will not be disturbed.',
    };
  }

  const localDataOff = params.localIntentionalDataOff ?? isIntentionalDataOff();
  const isTargetOnline = params.targetOnlineStatus === 'online';

  if (isTargetOnline && params.localNetworkOnline && !localDataOff) {
    return {
      label: 'Ringing...',
      canRingDevice: true,
      allowZeroDataFallback: false,
      reason: 'Recipient is online and ringing.',
    };
  }

  return {
    label: 'Calling...',
    canRingDevice: true,
    allowZeroDataFallback: !localDataOff && !params.localNetworkOnline,
    reason: !localDataOff && !params.localNetworkOnline
      ? 'Internet unavailable — standard SIM SMS or Cellular Carrier Dialer fallback ready.'
      : 'Ringing via PK Chat internet signaling until recipient answers.',
  };
}

export function getCachedGpsFix(): AccurateGpsFix | null {
  const raw = readStorage(CACHED_GPS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AccurateGpsFix>;
    if (typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
      return {
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        accuracyMeters: parsed.accuracyMeters,
        source: parsed.source || 'cached_gps',
        capturedAtMs: typeof parsed.capturedAtMs === 'number' ? parsed.capturedAtMs : Date.now(),
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function saveCachedGpsFix(fix: AccurateGpsFix): void {
  writeStorage(CACHED_GPS_KEY, JSON.stringify(fix));
}

/**
 * Resolves accurate GPS cleanly within `timeoutMs` (default 2800ms) for zero-lag SOS dispatch,
 * falling back immediately to Android native GPS bridge, cached GPS fix, or consented location.
 */
export async function getFastAccurateGps(
  fallbackRegion?: { latitude?: number; longitude?: number },
  timeoutMs = 2800
): Promise<AccurateGpsFix | null> {
  const bridge = tryReadAndroidBridgeGps();
  const cached = getCachedGpsFix();

  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    const liveFix = await new Promise<AccurateGpsFix | null>((resolve) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, timeoutMs);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          const fix: AccurateGpsFix = {
            latitude: Number(pos.coords.latitude.toFixed(5)),
            longitude: Number(pos.coords.longitude.toFixed(5)),
            accuracyMeters: Math.round(pos.coords.accuracy || 15),
            source: 'live_gps',
            capturedAtMs: Date.now(),
          };
          saveCachedGpsFix(fix);
          resolve(fix);
        },
        () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 20_000,
          timeout: Math.max(1200, timeoutMs - 200),
        }
      );
    });

    if (liveFix) return liveFix;
  }

  if (bridge) {
    const bridgeFix: AccurateGpsFix = {
      latitude: Number(bridge.latitude.toFixed(5)),
      longitude: Number(bridge.longitude.toFixed(5)),
      accuracyMeters: bridge.accuracyMeters,
      source: 'android_bridge',
      capturedAtMs: Date.now(),
    };
    saveCachedGpsFix(bridgeFix);
    return bridgeFix;
  }

  if (cached) return cached;

  if (typeof fallbackRegion?.latitude === 'number' && typeof fallbackRegion?.longitude === 'number') {
    return {
      latitude: Number(fallbackRegion.latitude.toFixed(5)),
      longitude: Number(fallbackRegion.longitude.toFixed(5)),
      source: 'profile_region',
      capturedAtMs: Date.now(),
    };
  }

  return null;
}

const SOS_SIREN_TAG = '[PK_SOS_SIREN]';
const SOS_ACK_TAG = '[PK_SOS_ACK]';

export function formatSosSirenChatPayload(payload: {
  senderName: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  alertId: string;
}): string {
  const latStr = typeof payload.latitude === 'number' ? payload.latitude.toFixed(5) : '';
  const lngStr = typeof payload.longitude === 'number' ? payload.longitude.toFixed(5) : '';
  const accStr = typeof payload.accuracyMeters === 'number' ? String(Math.round(payload.accuracyMeters)) : '';
  return `${SOS_SIREN_TAG}|${payload.alertId}|${payload.senderName.replace(/\|/g, ' ')}|${latStr}|${lngStr}|${accStr}`;
}

export function parseSosSirenChatPayload(text: string): {
  alertId: string;
  senderName: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
} | null {
  if (!text || !text.startsWith(`${SOS_SIREN_TAG}|`)) return null;
  const parts = text.split('|');
  if (parts.length < 4) return null;
  const alertId = parts[1] || `sos_${Date.now()}`;
  const senderName = parts[2] || 'PK Chat Contact';
  const lat = parts[3] ? Number(parts[3]) : NaN;
  const lng = parts[4] ? Number(parts[4]) : NaN;
  const acc = parts[5] ? Number(parts[5]) : NaN;
  return {
    alertId,
    senderName,
    latitude: Number.isFinite(lat) ? lat : undefined,
    longitude: Number.isFinite(lng) ? lng : undefined,
    accuracyMeters: Number.isFinite(acc) ? acc : undefined,
  };
}

export function formatSosOnTheWayMessage(responderName: string): string {
  return `${SOS_ACK_TAG} I Am On The Way! 🚗📍 (${responderName} has acknowledged your Emergency SOS and is heading to your GPS location.)`;
}

export function dispatchLocalEmergencySirenBroadcast(payload: EmergencySirenAlertPayload): void {
  if (typeof window === 'undefined') return;
  try {
    if ('BroadcastChannel' in window) {
      const ch = new BroadcastChannel(EMERGENCY_SIREN_CHANNEL);
      ch.postMessage(payload);
      ch.close();
    }
  } catch {
    // ignore BroadcastChannel failures
  }
  window.dispatchEvent(new CustomEvent<EmergencySirenAlertPayload>(EMERGENCY_SIREN_EVENT, { detail: payload }));
}
