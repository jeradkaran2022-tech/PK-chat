import type { MobileUserProfile } from '../types/models';

const rnEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
export const PKCHAT_SERVER_URL =
  rnEnv?.EXPO_PUBLIC_PKCHAT_SERVER_URL || 'http://localhost:3000';

export interface MobileQrProfilePayload {
  uid: string;
  fullName: string;
  phoneNumber: string;
  country: string;
  countryCode: string;
  preferredLanguage: string;
  preferredLanguageName: string;
  about: string;
  avatarUrl: string;
}

export interface MobileQrMatrix {
  size: number;
  data: number[];
}

export interface MobileQrTokenResponse {
  token: string;
  tokenId: string;
  issuedAt: string;
  expiresAt: string;
  scanCount: number;
  profile: MobileQrProfilePayload;
  qrMatrix?: MobileQrMatrix;
}

export interface MobileQrVerifyResponse {
  valid: boolean;
  tokenId: string;
  token: string;
  verifiedAt: string;
  scanCount: number;
  profile: MobileQrProfilePayload;
}

export async function issueMobileQrToken(
  profile: MobileUserProfile,
  idToken?: string,
  forceRefresh = false
): Promise<MobileQrTokenResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;

  const res = await fetch(`${PKCHAT_SERVER_URL}/api/qr/token`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      uid: profile.uid,
      fullName: profile.fullName,
      phoneNumber: profile.phoneNumber || '',
      country: profile.country || 'Sri Lanka',
      countryCode: 'LK',
      preferredLanguage: profile.preferredLanguageCode || 'en',
      preferredLanguageName: profile.preferredLanguageName || 'English',
      about: profile.about || 'Available on PK Chat',
      avatarUrl: profile.avatarUrl || '',
      forceRefresh,
      includeMatrix: true,
    }),
  });
  const data = (await res.json()) as MobileQrTokenResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Unable to generate PK Chat QR code.');
  }
  return data;
}

export async function verifyMobileQrCode(
  rawQrText: string,
  scannerUid: string
): Promise<MobileQrVerifyResponse> {
  const res = await fetch(`${PKCHAT_SERVER_URL}/api/qr/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rawQrText,
      scannerUid,
    }),
  });
  const data = (await res.json()) as MobileQrVerifyResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Unable to verify scanned QR code.');
  }
  return data;
}

export async function revokeMobileQrToken(
  profile: MobileUserProfile,
  idToken?: string
): Promise<MobileQrTokenResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;

  const res = await fetch(`${PKCHAT_SERVER_URL}/api/qr/revoke`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      uid: profile.uid,
      fullName: profile.fullName,
      phoneNumber: profile.phoneNumber,
      country: profile.country,
      preferredLanguage: profile.preferredLanguageCode,
      preferredLanguageName: profile.preferredLanguageName,
      about: profile.about,
    }),
  });
  const data = (await res.json()) as MobileQrTokenResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Unable to reset QR code.');
  }
  return issueMobileQrToken(profile, idToken, false);
}
