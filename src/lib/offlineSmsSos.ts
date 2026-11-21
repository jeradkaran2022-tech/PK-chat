/**
 * Offline SIM SMS + GPS SOS Fallback Utilities for PK CHAT.
 *
 * Works without internet connectivity:
 * 1) Inside native Android WebView/Wrapper (with SEND_SMS, READ_PHONE_STATE,
 *    ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION permissions), invokes the
 *    `window.PkChatAndroidBridge` SIM SMS dispatcher directly.
 * 2) In mobile browsers / installed PWA, constructs an RFC-compliant `sms:` URI
 *    pre-filled with trusted contact numbers, exact GPS coordinates, and map link
 *    so the device's standard SIM Messages app opens ready to send in 1 tap.
 */

export interface OfflineSmsSosPayload {
  senderName: string;
  recipients: string[];
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  locationLabel?: string;
  note?: string;
}

export interface OfflineSmsDispatchRecord {
  id: string;
  createdAt: string;
  recipientCount: number;
  recipients: string[];
  mode: 'android_native_sim' | 'device_sms_composer';
  hasGps: boolean;
  messagePreview: string;
}

interface PkChatAndroidNativeBridge {
  sendEmergencySms?: (recipientsCsv: string, messageBody: string) => boolean | string;
  hasSmsAndLocationPermissions?: () => boolean;
  requestSmsAndLocationPermissions?: () => void;
  getLastKnownGpsJson?: () => string;
}

declare global {
  interface Window {
    PkChatAndroidBridge?: PkChatAndroidNativeBridge;
  }
}

const OFFLINE_SMS_LOG_KEY = 'pk_offline_sms_sos_log';

export function sanitizeSmsPhoneNumber(raw: string): string {
  return raw.replace(/[^\d+]/g, '').trim();
}

export function buildEmergencySmsMessage(payload: OfflineSmsSosPayload): string {
  const who = (payload.senderName || 'PK CHAT User').trim();
  const lines: string[] = [`PK CHAT SOS EMERGENCY from ${who}!`];

  if (payload.note && payload.note.trim()) {
    lines.push(`Message: ${payload.note.trim().slice(0, 140)}`);
  } else {
    lines.push('Need urgent assistance. Please contact me immediately.');
  }

  if (typeof payload.latitude === 'number' && typeof payload.longitude === 'number') {
    const lat = payload.latitude.toFixed(5);
    const lng = payload.longitude.toFixed(5);
    const acc =
      typeof payload.accuracyMeters === 'number' && payload.accuracyMeters > 0
        ? ` (±${Math.round(payload.accuracyMeters)}m)`
        : '';
    lines.push(`GPS: ${lat}, ${lng}${acc}`);
    lines.push(`Map: https://maps.google.com/?q=${lat},${lng}`);
  } else if (payload.locationLabel && payload.locationLabel.trim()) {
    lines.push(`Area: ${payload.locationLabel.trim()}`);
  } else {
    lines.push('GPS: unavailable (please call or trace last known area).');
  }

  lines.push('Sent via PK CHAT Offline SIM SOS');
  return lines.join('\n');
}

export function buildSmsLaunchUri(
  recipients: string[],
  messageBody: string,
  userAgent?: string
): string | null {
  const cleaned = Array.from(
    new Set(recipients.map(sanitizeSmsPhoneNumber).filter((p) => p.length >= 3))
  );
  if (cleaned.length === 0) return null;

  const ua =
    userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const isAppleDevice = /iPad|iPhone|iPod/i.test(ua);
  // iOS Safari/Messages uses comma-separated recipients with `&body=`; Android uses `?body=`
  const recipientStr = cleaned.join(',');
  const separator = isAppleDevice ? '&' : '?';
  return `sms:${recipientStr}${separator}body=${encodeURIComponent(messageBody)}`;
}

export function buildTelDialUri(phoneNumber: string): string | null {
  const cleaned = sanitizeSmsPhoneNumber(phoneNumber);
  if (cleaned.length < 3) return null;
  return `tel:${cleaned}`;
}

export function triggerCellularDialFallback(phoneNumber: string): string | null {
  const telUri = buildTelDialUri(phoneNumber);
  if (!telUri) return null;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const anchor = document.createElement('a');
    anchor.href = telUri;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }
  return telUri;
}

export function isAndroidNativeSmsBridgeAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof window.PkChatAndroidBridge?.sendEmergencySms === 'function';
}

export function tryReadAndroidBridgeGps(): {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
} | null {
  if (typeof window === 'undefined') return null;
  const reader = window.PkChatAndroidBridge?.getLastKnownGpsJson;
  if (typeof reader !== 'function') return null;
  try {
    const raw = reader();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      latitude?: unknown;
      longitude?: unknown;
      accuracyMeters?: unknown;
    };
    if (typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
      return {
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        accuracyMeters:
          typeof parsed.accuracyMeters === 'number' ? parsed.accuracyMeters : undefined,
      };
    }
  } catch {
    // ignore malformed bridge JSON
  }
  return null;
}

export function getOfflineSmsDispatchLog(): OfflineSmsDispatchRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(OFFLINE_SMS_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordOfflineSmsDispatch(
  record: Omit<OfflineSmsDispatchRecord, 'id' | 'createdAt'>
): OfflineSmsDispatchRecord[] {
  const entry: OfflineSmsDispatchRecord = {
    ...record,
    id: `sms_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  const next = [entry, ...getOfflineSmsDispatchLog()].slice(0, 15);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(OFFLINE_SMS_LOG_KEY, JSON.stringify(next));
    }
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function triggerOfflineSimSmsSos(payload: OfflineSmsSosPayload): {
  dispatchedVia: 'android_native_sim' | 'device_sms_composer' | 'none';
  smsUri: string | null;
  messageBody: string;
  recipients: string[];
  error?: string;
} {
  const cleanedRecipients = Array.from(
    new Set(payload.recipients.map(sanitizeSmsPhoneNumber).filter((p) => p.length >= 3))
  );
  const messageBody = buildEmergencySmsMessage(payload);

  if (cleanedRecipients.length === 0) {
    return {
      dispatchedVia: 'none',
      smsUri: null,
      messageBody,
      recipients: [],
      error: 'Add at least one Trusted Emergency Contact phone number to send a SIM SMS SOS.',
    };
  }

  // Prefer native Android SmsManager bridge when running inside the signed Android app wrapper
  if (isAndroidNativeSmsBridgeAvailable()) {
    try {
      const bridge = window.PkChatAndroidBridge!;
      if (
        typeof bridge.hasSmsAndLocationPermissions === 'function' &&
        !bridge.hasSmsAndLocationPermissions()
      ) {
        bridge.requestSmsAndLocationPermissions?.();
      }
      const res = bridge.sendEmergencySms!(cleanedRecipients.join(','), messageBody);
      if (res === true || res === 'ok' || res === 'sent') {
        recordOfflineSmsDispatch({
          recipientCount: cleanedRecipients.length,
          recipients: cleanedRecipients,
          mode: 'android_native_sim',
          hasGps:
            typeof payload.latitude === 'number' && typeof payload.longitude === 'number',
          messagePreview: messageBody.slice(0, 160),
        });
        return {
          dispatchedVia: 'android_native_sim',
          smsUri: buildSmsLaunchUri(cleanedRecipients, messageBody),
          messageBody,
          recipients: cleanedRecipients,
        };
      }
    } catch {
      // Fall back cleanly to sms: URI composer below
    }
  }

  const smsUri = buildSmsLaunchUri(cleanedRecipients, messageBody);
  if (!smsUri) {
    return {
      dispatchedVia: 'none',
      smsUri: null,
      messageBody,
      recipients: [],
      error: 'Unable to build valid SMS recipient URI.',
    };
  }

  recordOfflineSmsDispatch({
    recipientCount: cleanedRecipients.length,
    recipients: cleanedRecipients,
    mode: 'device_sms_composer',
    hasGps:
      typeof payload.latitude === 'number' && typeof payload.longitude === 'number',
    messagePreview: messageBody.slice(0, 160),
  });

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const anchor = document.createElement('a');
    anchor.href = smsUri;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  return {
    dispatchedVia: 'device_sms_composer',
    smsUri,
    messageBody,
    recipients: cleanedRecipients,
  };
}
