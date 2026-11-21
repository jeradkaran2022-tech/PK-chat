import {
  ConfirmationResult,
  RecaptchaVerifier,
  UserCredential,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  signInWithPhoneNumber,
} from 'firebase/auth';
import { auth } from './firebase';

export type RecaptchaMode = 'invisible' | 'normal';

export const WEB_PREVIEW_TEST_PHONE = '+94717868693';
export const WEB_PREVIEW_TEST_OTP = '123456';

/**
 * Enables deterministic Web Preview test-mode bypass for +94717868693
 * (bypasses reCAPTCHA and directly accepts test code 123456 without manual copy-paste).
 */
export function isWebPreviewTestPhoneBypass(phoneE164: string): boolean {
  const normalized = normalizePhoneToE164(phoneE164);
  if (normalized !== WEB_PREVIEW_TEST_PHONE) return false;
  if (typeof window === 'undefined') return false;
  const host = (window.location?.hostname || '').toLowerCase();
  const isPreviewHost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.run.app') ||
    host.endsWith('.web.app') ||
    host.endsWith('.firebaseapp.com');
  const isDevEnv =
    typeof import.meta !== 'undefined' &&
    Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
  return isPreviewHost || isDevEnv;
}

export interface MappedPhoneAuthError {
  code: string;
  message: string;
  sessionInvalidated: boolean;
}

/**
 * Detects an ISO-3166 alpha-2 country code from the browser/device locale
 * (used strictly for dialing country-code defaults, never for translation language).
 */
export function detectInitialCountryCodeFromLocale(localeOverride?: string): string {
  const candidates: string[] = [];
  if (localeOverride) {
    candidates.push(localeOverride);
  } else if (typeof navigator !== 'undefined') {
    if (Array.isArray(navigator.languages)) {
      candidates.push(...navigator.languages);
    }
    if (navigator.language) {
      candidates.push(navigator.language);
    }
  }

  for (const tag of candidates) {
    const parts = tag.replace(/_/g, '-').split('-');
    if (parts.length >= 2) {
      const region = parts[parts.length - 1].toUpperCase();
      if (/^[A-Z]{2}$/.test(region)) {
        return region;
      }
    }
  }
  return 'LK';
}

/**
 * Normalizes a local or international phone string to strict E.164 format (e.g. +94717860693).
 */
export function normalizePhoneToE164(rawInput: string, defaultDialCode = '+94'): string {
  const trimmed = rawInput.trim();
  if (trimmed.startsWith('+')) {
    return '+' + trimmed.replace(/\D/g, '');
  }
  const digits = trimmed.replace(/\D/g, '').replace(/^0+/, '');
  const dialDigits = defaultDialCode.replace(/\D/g, '');
  if (digits.startsWith(dialDigits) && digits.length > dialDigits.length + 5) {
    return `+${digits}`;
  }
  return `${defaultDialCode}${digits}`;
}

export interface OperatingCountryContext {
  countryCode: string;
  dialCode: string;
  countryName: string;
  source: 'timezone' | 'locale' | 'default';
}

const TIMEZONE_TO_COUNTRY: Record<
  string,
  { countryCode: string; dialCode: string; countryName: string }
> = {
  'Asia/Colombo': { countryCode: 'LK', dialCode: '+94', countryName: 'Sri Lanka' },
  'Asia/Kolkata': { countryCode: 'IN', dialCode: '+91', countryName: 'India' },
  'Asia/Calcutta': { countryCode: 'IN', dialCode: '+91', countryName: 'India' },
  'Europe/London': { countryCode: 'GB', dialCode: '+44', countryName: 'United Kingdom' },
  'America/New_York': { countryCode: 'US', dialCode: '+1', countryName: 'United States' },
  'America/Chicago': { countryCode: 'US', dialCode: '+1', countryName: 'United States' },
  'America/Denver': { countryCode: 'US', dialCode: '+1', countryName: 'United States' },
  'America/Los_Angeles': { countryCode: 'US', dialCode: '+1', countryName: 'United States' },
  'America/Toronto': { countryCode: 'CA', dialCode: '+1', countryName: 'Canada' },
  'Asia/Singapore': { countryCode: 'SG', dialCode: '+65', countryName: 'Singapore' },
  'Asia/Kuala_Lumpur': { countryCode: 'MY', dialCode: '+60', countryName: 'Malaysia' },
  'Asia/Dubai': { countryCode: 'AE', dialCode: '+971', countryName: 'United Arab Emirates' },
  'Australia/Sydney': { countryCode: 'AU', dialCode: '+61', countryName: 'Australia' },
  'Europe/Paris': { countryCode: 'FR', dialCode: '+33', countryName: 'France' },
  'Europe/Berlin': { countryCode: 'DE', dialCode: '+49', countryName: 'Germany' },
  'Europe/Zurich': { countryCode: 'CH', dialCode: '+41', countryName: 'Switzerland' },
  'Asia/Tokyo': { countryCode: 'JP', dialCode: '+81', countryName: 'Japan' },
};

const COUNTRY_DIAL_MAP: Record<string, { dialCode: string; countryName: string }> = {
  LK: { dialCode: '+94', countryName: 'Sri Lanka' },
  IN: { dialCode: '+91', countryName: 'India' },
  GB: { dialCode: '+44', countryName: 'United Kingdom' },
  US: { dialCode: '+1', countryName: 'United States' },
  CA: { dialCode: '+1', countryName: 'Canada' },
  SG: { dialCode: '+65', countryName: 'Singapore' },
  MY: { dialCode: '+60', countryName: 'Malaysia' },
  AE: { dialCode: '+971', countryName: 'United Arab Emirates' },
  AU: { dialCode: '+61', countryName: 'Australia' },
  FR: { dialCode: '+33', countryName: 'France' },
  DE: { dialCode: '+49', countryName: 'Germany' },
  CH: { dialCode: '+41', countryName: 'Switzerland' },
  JP: { dialCode: '+81', countryName: 'Japan' },
};

/**
 * Detects the operating country & dialing code from device timezone first,
 * then browser locale, so phone verification stays matched to the user's real operating country/network.
 */
export function detectOperatingCountryContext(
  timezoneOverride?: string,
  localeOverride?: string
): OperatingCountryContext {
  let tz = timezoneOverride || '';
  if (!tz && typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
      tz = '';
    }
  }
  if (tz && TIMEZONE_TO_COUNTRY[tz]) {
    return { ...TIMEZONE_TO_COUNTRY[tz], source: 'timezone' };
  }

  const localeCountry = detectInitialCountryCodeFromLocale(localeOverride);
  if (localeCountry && COUNTRY_DIAL_MAP[localeCountry]) {
    return {
      countryCode: localeCountry,
      dialCode: COUNTRY_DIAL_MAP[localeCountry].dialCode,
      countryName: COUNTRY_DIAL_MAP[localeCountry].countryName,
      source: 'locale',
    };
  }

  return {
    countryCode: 'LK',
    dialCode: '+94',
    countryName: 'Sri Lanka',
    source: 'default',
  };
}

export interface CountryPhoneValidationResult {
  valid: boolean;
  e164: string;
  reason?: string;
}

/**
 * Validates that an entered phone number is a valid E.164 mobile number AND matches both
 * the selected country dial code and the device's active operating country/network region.
 */
export function validatePhoneMatchesOperatingCountry(params: {
  rawPhone: string;
  selectedCountryCode: string;
  selectedDialCode: string;
  operatingContext?: OperatingCountryContext;
}): CountryPhoneValidationResult {
  const raw = params.rawPhone.trim();
  const selectedDial = params.selectedDialCode.trim();
  const e164 = normalizePhoneToE164(raw, selectedDial);
  const digits = e164.replace(/\D/g, '');

  if (digits.length < 8 || digits.length > 15) {
    return {
      valid: false,
      e164,
      reason: 'Enter a valid mobile number (8 to 15 digits including country code).',
    };
  }

  if (isWebPreviewTestPhoneBypass(e164)) {
    return { valid: true, e164 };
  }

  const dialDigits = selectedDial.replace(/\D/g, '');
  if (raw.startsWith('+') && !digits.startsWith(dialDigits)) {
    return {
      valid: false,
      e164,
      reason: `Entered international prefix does not match selected country code (${selectedDial}).`,
    };
  }

  const operating = params.operatingContext;
  if (
    operating &&
    operating.source === 'timezone' &&
    params.selectedCountryCode !== operating.countryCode
  ) {
    return {
      valid: false,
      e164,
      reason: `Please verify with a phone number from your operating country/network (${operating.countryName} ${operating.dialCode}), not a mismatched foreign code (${selectedDial}).`,
    };
  }

  if (selectedDial === '+94') {
    const national = digits.slice(2);
    if (!/^7\d{8}$/.test(national)) {
      return {
        valid: false,
        e164,
        reason: 'Enter a valid 9-digit Sri Lanka (+94) mobile number starting with 7 (e.g. 77 123 4567).',
      };
    }
  }

  return { valid: true, e164 };
}

/**
 * Creates and renders a Firebase RecaptchaVerifier mounted onto a fresh child node
 * so repeated send/resend attempts never collide with existing reCAPTCHA DOM widgets.
 */
export async function createAndRenderRecaptcha(params: {
  containerId: string;
  size: RecaptchaMode;
  previousVerifier?: RecaptchaVerifier | null;
  onExpired?: () => void;
  onError?: () => void;
}): Promise<RecaptchaVerifier> {
  if (params.previousVerifier) {
    try {
      params.previousVerifier.clear();
    } catch {
      // Ignore cleanup failures if DOM node already unmounted
    }
  }

  const host = document.getElementById(params.containerId);
  if (!host) {
    throw new Error('reCAPTCHA verification container is not mounted. Please try again.');
  }

  const widgetEl = document.createElement('div');
  widgetEl.id = `${params.containerId}_widget_${Date.now()}`;
  host.replaceChildren(widgetEl);

  auth.useDeviceLanguage();

  const verifier = new RecaptchaVerifier(auth, widgetEl, {
    size: params.size,
    'expired-callback': () => {
      params.onExpired?.();
    },
    'error-callback': () => {
      params.onError?.();
    },
  });

  await verifier.render();
  return verifier;
}

/**
 * Initiates Firebase Phone Authentication via signInWithPhoneNumber() and reCAPTCHA.
 */
export async function sendFirebasePhoneOtp(params: {
  phoneE164: string;
  containerId: string;
  recaptchaSize: RecaptchaMode;
  trustDevice: boolean;
  previousVerifier?: RecaptchaVerifier | null;
  onExpired?: () => void;
  onError?: () => void;
}): Promise<{ confirmationResult: ConfirmationResult; verifier: RecaptchaVerifier }> {
  await setPersistence(
    auth,
    params.trustDevice ? browserLocalPersistence : browserSessionPersistence
  ).catch(() => {
    // Fallback to Firebase Auth default persistence if storage APIs are restricted
  });

  const verifier = await createAndRenderRecaptcha({
    containerId: params.containerId,
    size: params.recaptchaSize,
    previousVerifier: params.previousVerifier,
    onExpired: params.onExpired,
    onError: params.onError,
  });

  try {
    const confirmationResult = await signInWithPhoneNumber(auth, params.phoneE164, verifier);
    return { confirmationResult, verifier };
  } catch (err) {
    try {
      verifier.clear();
    } catch {
      // Ignore cleanup errors if DOM already unmounted
    }
    throw err;
  }
}

/**
 * Verifies the user-entered 6-digit SMS code against Firebase's ConfirmationResult.
 */
export async function confirmFirebasePhoneOtp(
  confirmationResult: ConfirmationResult,
  code: string
): Promise<UserCredential> {
  return confirmationResult.confirm(code.trim());
}

/**
 * Translates Firebase Phone Auth error codes into clear, actionable user messages.
 */
export function mapFirebasePhoneAuthError(
  err: unknown,
  phoneE164?: string
): MappedPhoneAuthError {
  const fbErr = err as { code?: string; message?: string };
  const code = fbErr?.code || 'auth/unknown';
  let message = fbErr?.message || 'Firebase Phone Authentication error.';
  let sessionInvalidated = false;

  switch (code) {
    case 'auth/operation-not-allowed':
      if (
        (fbErr?.message || '').toLowerCase().includes('region') ||
        (fbErr?.message || '').toLowerCase().includes('sms unable to be sent')
      ) {
        message =
          'SMS Region Policy in Firebase Console (pk-chhat) is blocking this country. Open Authentication → Settings → SMS region policy and enable Sri Lanka (+94) / your target countries.';
      } else {
        message =
          'Firebase Phone Authentication is currently OFF in Firebase Console (pk-chhat). Enable Authentication → Sign-in method → Phone → Save.';
      }
      break;
    case 'auth/unauthorized-domain':
      message = `This domain (${window.location.hostname}) is not in Firebase Authorized Domains. Add it under Authentication → Settings → Authorized domains.`;
      break;
    case 'auth/billing-not-enabled':
      message =
        'Real carrier SMS requires Firebase Blaze billing on pk-chhat, or add your phone under "Phone numbers for testing" in Firebase Console.';
      break;
    case 'auth/captcha-check-failed':
    case 'auth/missing-client-identifier':
    case 'auth/invalid-app-credential':
    case 'auth/missing-app-credential':
      message =
        'reCAPTCHA verification failed in this preview window. Switch to "Visible reCAPTCHA", verify Authorized Domains includes this hostname, and retry.';
      break;
    case 'auth/invalid-phone-number':
      message = `Invalid phone number format (${phoneE164 || ''}). Verify country code and remove any leading 0.`;
      break;
    case 'auth/invalid-verification-code':
      message = 'Incorrect 6-digit OTP code. Please check your SMS and try again.';
      break;
    case 'auth/code-expired':
    case 'auth/session-expired':
      message = 'This SMS OTP session has expired. Click "Resend OTP" to receive a new code.';
      sessionInvalidated = true;
      break;
    case 'auth/too-many-requests':
    case 'auth/quota-exceeded':
      message =
        'Too many SMS/verification attempts. Wait for the cooldown timer before retrying.';
      break;
    case 'auth/internal-error':
      message =
        'Firebase Phone Auth returned an internal error. Verify Phone sign-in is enabled and this domain is listed in Authorized domains.';
      break;
  }

  return { code, message, sessionInvalidated };
}

/**
 * Computes an irreversible 64-character lowercase SHA-256 hex digest for E.164 phone lookup
 * so raw phone numbers are never stored or leaked in discoverable directory records.
 */
export async function hashPhoneE164(phoneE164: string): Promise<string> {
  const clean = phoneE164.trim();
  const data = new TextEncoder().encode(`pkchat_phone_v1:${clean}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Maps Google / Apple OAuth popup errors into clear, user-friendly guidance.
 */
export function mapOAuthSignInError(err: unknown, providerName: 'Google' | 'Apple'): string {
  const fbErr = err as { code?: string; message?: string };
  const code = fbErr?.code || '';
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return `${providerName} sign-in window was closed before completing login.`;
    case 'auth/popup-blocked':
      return `Your browser blocked the ${providerName} sign-in popup. Allow popups for this site and retry.`;
    case 'auth/network-request-failed':
      return 'Network error during sign-in. Please check your internet connection and retry.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts detected. Wait a minute and try again.';
    case 'auth/operation-not-allowed':
      return `${providerName} Sign-In is not enabled yet in Firebase Console (pk-chhat → Authentication → Sign-in method → ${providerName}).`;
    case 'auth/unauthorized-domain':
      return `Domain ${window.location.hostname} is not authorized in Firebase Console.`;
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method. Sign in with your original method.';
    default:
      return fbErr?.message || `${providerName} sign-in failed. Please try again.`;
  }
}

/**
 * Maps Email/Password Firebase Auth errors into friendly, actionable text.
 */
export function mapFirebaseEmailAuthError(err: unknown): string {
  const fbErr = err as { code?: string; message?: string };
  const code = fbErr?.code || '';
  switch (code) {
    case 'auth/network-request-failed':
      return 'Network error while connecting to authentication server. Check your internet and try again.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait briefly before trying again.';
    case 'auth/email-already-in-use':
      return 'An account already exists for this email. Switch to Sign In or use Gmail / Apple ID.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password. Please verify and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled for security protection.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 6 characters.';
    default:
      return fbErr?.message || 'Email sign-in failed. Please try again.';
  }
}
