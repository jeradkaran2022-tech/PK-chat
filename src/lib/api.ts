import {
  AdFulfillmentRequest,
  AdFulfillmentType,
  AdReportCategory,
  AdSafetyEvaluationResult,
  AdViolationWarningNotice,
  AdvertiserUnlimitedPassStatus,
  AllowlistedRemediationAction,
  BusinessAdCardProfile,
  DisasterAlert,
  GlobalSecurityState,
  GmailApprovalRequest,
  GuardianScanResult,
  LanguageOption,
  RemoteAdPricingConfig,
  SecurityAuditLog,
  SecurityIncident,
  SpeakingSpeedOption,
  SponsoredPublicAd,
  TranslationConfidenceLevel,
} from '../types/pkchat';

/**
 * Returns true when running on a purely static frontend host (e.g., GitHub Pages)
 * where Express /api/* endpoints are not mounted, preventing noisy HTTP 404 errors.
 */
export function isStaticHostedWithoutApi(): boolean {
  if (typeof window === 'undefined') return false;
  const host = (window.location?.hostname || '').toLowerCase();
  return host.endsWith('.github.io') || window.location?.protocol === 'file:';
}

const DEFAULT_STATIC_AD_CONFIG: RemoteAdPricingConfig = {
  billingLibraryVersion: '8.0.0',
  smallAdPriceUsd: 5,
  largeAdPriceUsd: 10,
  unlimitedAdPriceUsd: 100,
  unlimitedAdDurationDays: 365,
  annualProPriceUsd: 10,
  freeTrialDays: 90,
  smallAdSku: 'pkchat_sponsored_small_5usd',
  largeAdSku: 'pkchat_sponsored_large_10usd',
  unlimitedAdSku: 'pkchat_unlimited_ads_annual_100usd',
  annualProSku: 'pkchat_annual_pro_10usd',
  updatedAt: new Date(0).toISOString(),
};

async function apiFetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 18000,
  fallbackError = 'Service temporarily unavailable. Please try again.'
): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('No internet connection. Please check your network and retry.');
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    const rawText = await res.text();
    let data: Record<string, unknown> = {};
    if (rawText) {
      try {
        data = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        if (!res.ok) {
          throw new Error(
            `Network/server temporary error (HTTP ${res.status}). Please retry in a moment.`
          );
        }
        throw new Error('Received an unexpected server response. Please retry.');
      }
    }

    if (!res.ok) {
      const serverErr =
        typeof data.error === 'string' && data.error.trim() ? data.error : fallbackError;
      throw new Error(serverErr);
    }

    return data as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out. Your connection seems slow — please try again.');
    }
    if (err instanceof TypeError) {
      throw new Error('Unable to reach PK CHAT server. Check your internet connection and retry.');
    }
    throw err;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export interface TranslationResult {
  detectedLanguageCode: string;
  detectedLanguageName: string;
  translatedText: string;
  supported: boolean;
  unsupportedReason?: string;
  confidenceScore?: number;
  confidenceLevel?: TranslationConfidenceLevel;
  clarificationNeeded?: boolean;
  clarificationPrompt?: string;
  preservedEntities?: string[];
  engine: string;
}

export async function translateText(params: {
  text: string;
  targetLanguage: string;
  targetLanguageName: string;
  sourceLanguage?: string;
  accentHint?: string;
  speakingSpeed?: SpeakingSpeedOption;
  lowBandwidth?: boolean;
  contextHistory?: Array<{ speaker: string; text: string }>;
}): Promise<TranslationResult> {
  return apiFetchJson<TranslationResult>(
    '/api/translate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    20000,
    'Translation service error'
  );
}

export async function translateBatch(params: {
  text: string;
  targets: Array<{ code: string; name: string }>;
}): Promise<{
  detectedLanguageCode: string;
  detectedLanguageName: string;
  translations: Array<{ targetLanguage: string; translatedText: string; supported: boolean }>;
  engine: string;
}> {
  return apiFetchJson(
    '/api/translate/batch',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    22000,
    'Batch translation error'
  );
}

export async function transcribeAndTranslateAudio(params: {
  audioBase64: string;
  mimeType: string;
  targetLanguage: string;
  targetLanguageName: string;
  accentHint?: string;
  speakingSpeed?: SpeakingSpeedOption;
  contextHistory?: Array<{ speaker: string; text: string }>;
}): Promise<{
  transcript: string;
  detectedLanguageCode: string;
  detectedLanguageName: string;
  translatedText: string;
  confidenceScore?: number;
  confidenceLevel?: TranslationConfidenceLevel;
  clarificationNeeded?: boolean;
  clarificationPrompt?: string;
  preservedEntities?: string[];
  engine: string;
}> {
  return apiFetchJson(
    '/api/speech/transcribe',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    45000,
    'Audio transcription failed'
  );
}

export async function validateProfileImageUpload(params: {
  idToken: string;
  dataUrl: string;
  kind: 'avatar' | 'cover';
  profileText?: string;
}): Promise<{ valid: boolean; mimeType: string; byteLength: number; sha256: string }> {
  return apiFetchJson(
    '/api/profile/validate-image',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.idToken}`,
      },
      body: JSON.stringify({
        dataUrl: params.dataUrl,
        kind: params.kind,
        profileText: params.profileText,
      }),
    },
    18000,
    'Unable to validate profile image'
  );
}

export async function synthesizeTranslatedSpeech(params: {
  text: string;
  voiceName: string;
  languageName: string;
}): Promise<{ audioBase64: string; mimeType: string; voice: string; engine: string }> {
  return apiFetchJson(
    '/api/speech/tts',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    20000,
    'Speech synthesis failed'
  );
}

export async function fetchOfficialDisasters(params?: {
  lat?: number;
  lng?: number;
  country?: string;
}): Promise<{
  alerts: DisasterAlert[];
  sourcesChecked: string[];
  feedErrors: string[];
  fetchedAt: string;
}> {
  const qs = new URLSearchParams();
  if (typeof params?.lat === 'number' && typeof params?.lng === 'number') {
    qs.set('lat', String(params.lat));
    qs.set('lng', String(params.lng));
  }
  if (params?.country) qs.set('country', params.country);
  const path = qs.toString() ? `/api/disasters/official?${qs.toString()}` : '/api/disasters/official';
  return apiFetchJson(path, {}, 14000, 'Failed to fetch official disaster feeds');
}

export async function fetchWorldLanguagesCatalog(params?: {
  search?: string;
  category?: string;
  includeUnsupported?: boolean;
}): Promise<{
  languages: LanguageOption[];
  version: string;
  updatedAt: string;
  totalSupported: number;
  totalCount: number;
}> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.category) qs.set('category', params.category);
  if (params?.includeUnsupported !== undefined) {
    qs.set('includeUnsupported', String(params.includeUnsupported));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetchJson(`/api/languages${suffix}`, {}, 10000, 'Unable to load dynamic language catalog');
}

export async function refreshWorldLanguagesCatalog(): Promise<{
  refreshed: boolean;
  version: string;
  updatedAt: string;
  totalSupported: number;
}> {
  return apiFetchJson(
    '/api/languages/refresh',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
    10000,
    'Unable to refresh dynamic language catalog'
  );
}

export async function fetchTranslationUsageMetrics(): Promise<{
  cacheEntries: number;
  cacheHits: number;
  cacheMisses: number;
  uiPackCacheEntries: number;
  dailyCharsUsed: number;
  dailyCharBudget: number;
  apiCallsToday: number;
  catalogVersion: string;
  totalSupportedLanguages: number;
}> {
  return apiFetchJson('/api/languages/usage', {}, 8000, 'Unable to read translation usage metrics');
}

export async function fetchCloudHealth(): Promise<{
  service: string;
  status: string;
  uptimeSeconds: number;
  translationReady: boolean;
  paymentMode: string;
  timestamp: string;
  recentErrors: Array<{ id: string; endpoint: string; status: number; message: string; timestamp: string }>;
}> {
  return apiFetchJson('/api/health', {}, 10000, 'Health check failed');
}

export async function validateSubscriptionAction(params: {
  action: 'start_trial' | 'subscribe_monthly' | 'subscribe_annual' | 'cancel' | 'verify_vip_founder';
  provider: string;
  phoneNumber?: string;
}) {
  return apiFetchJson<{
    valid: boolean;
    vipFounderBypass?: boolean;
    plan?: string;
    status: string;
    monthlyPriceUsd?: number;
    annualPriceUsd?: number;
    autoRenew: boolean;
    paymentMode: string;
    provider?: string;
    trialStartAt?: string;
    trialEndAt?: string;
    currentPeriodEnd?: string;
    amountChargedUsd?: number;
    description: string;
  }>(
    '/api/subscriptions/validate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    15000,
    'Subscription validation failed'
  );
}

export interface OtpReadinessStatus {
  projectId: string;
  probedDialCode?: string;
  firebasePhoneEnabled: boolean;
  firebaseBillingRequired: boolean;
  firebaseRegionBlocked?: boolean;
  firebaseRateLimited?: boolean;
  firebaseProbeCode: string;
  gateways: {
    twilioConfigured: boolean;
    twilioVoiceConfigured: boolean;
    twilioVerifyConfigured: boolean;
    whatsappConfigured: boolean;
    httpGatewayConfigured: boolean;
  };
  anyAutomatedChannelReady: boolean;
  checkedAt: string;
}

export async function fetchOtpStatus(dialCode = '+94'): Promise<OtpReadinessStatus> {
  const qs = `?dialCode=${encodeURIComponent(dialCode)}`;
  return apiFetchJson<OtpReadinessStatus>(
    `/api/otp/status${qs}`,
    {},
    12000,
    'Unable to inspect OTP status'
  );
}

export async function requestSmsGatewayOtp(
  phoneNumber: string
): Promise<{ sent: boolean; channel: string; expiresInSeconds: number }> {
  return apiFetchJson(
    '/api/otp/gateway/send',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, deliveryMethod: 'sms' }),
    },
    18000,
    'Unable to send SMS gateway OTP'
  );
}

export async function requestVoiceCallOtp(
  phoneNumber: string
): Promise<{ sent: boolean; channel: string; expiresInSeconds: number }> {
  return apiFetchJson(
    '/api/otp/gateway/send',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, deliveryMethod: 'call' }),
    },
    18000,
    'Unable to place voice call OTP'
  );
}

export async function verifyGatewayOtp(
  phoneNumber: string,
  code: string
): Promise<{ verified: boolean; phoneNumber: string }> {
  return apiFetchJson(
    '/api/otp/gateway/verify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, code }),
    },
    12000,
    'Unable to verify gateway OTP code'
  );
}

export interface SecurityStatusPayload {
  state: GlobalSecurityState;
  incidents: SecurityIncident[];
  auditLogs: SecurityAuditLog[];
  approvals: GmailApprovalRequest[];
}

export async function fetchSecurityStatus(): Promise<SecurityStatusPayload> {
  if (isStaticHostedWithoutApi()) {
    return {
      state: {
        stateId: 'global',
        status: 'NORMAL',
        threatLevel: 'low',
        reasonCode: 'SYSTEM_HEALTHY',
        restrictLogin: false,
        restrictMessages: false,
        restrictAccountChanges: false,
        restrictCalls: false,
        recheckIntervalSeconds: 60,
        threatResolved: true,
        updatedBy: 'static_client_guard',
        updatedAt: new Date().toISOString(),
      },
      incidents: [],
      auditLogs: [],
      approvals: [],
    };
  }
  return apiFetchJson<SecurityStatusPayload>(
    '/api/security/status',
    {},
    10000,
    'Unable to fetch security status'
  );
}

export async function recheckSecurityStatus(): Promise<{
  state: GlobalSecurityState;
  recovered: boolean;
  recheckPerformedAt: string;
}> {
  return apiFetchJson(
    '/api/security/recheck',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
    10000,
    'Security recheck failed'
  );
}

export async function triggerAdminTestIncident(params: {
  idToken: string;
  category?: SecurityIncident['category'];
  summary?: string;
}): Promise<{ state: GlobalSecurityState; incidents: SecurityIncident[]; auditLogs: SecurityAuditLog[] }> {
  return apiFetchJson(
    '/api/security/admin/trigger-test-incident',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.idToken}`,
      },
      body: JSON.stringify({
        category: params.category || 'anomalous_flood',
        summary: params.summary,
      }),
    },
    15000,
    'Unable to trigger test security incident'
  );
}

export async function resolveAdminThreat(params: {
  idToken: string;
  immediateNormal?: boolean;
}): Promise<{ state: GlobalSecurityState; incidents: SecurityIncident[]; auditLogs: SecurityAuditLog[] }> {
  return apiFetchJson(
    '/api/security/admin/resolve-threat',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.idToken}`,
      },
      body: JSON.stringify({ immediateNormal: Boolean(params.immediateNormal) }),
    },
    15000,
    'Unable to resolve threat'
  );
}

export async function runGuardianAudit(idToken: string): Promise<GuardianScanResult> {
  return apiFetchJson<GuardianScanResult>(
    '/api/security/guardian/audit',
    {
      headers: { Authorization: `Bearer ${idToken}` },
    },
    18000,
    'Security Shield scan failed'
  );
}

export async function sendGmailApprovalRequest(params: {
  idToken: string;
  gmailAccessToken: string;
  incidentId: string;
  riskLevel: 'HIGH' | 'CRITICAL' | 'MEDIUM';
  explanation: string;
  proposedChanges: string;
  proposedCodeDiff: string;
  testResults: string;
  actionId: AllowlistedRemediationAction;
}): Promise<{ approval: GmailApprovalRequest; instructions: string }> {
  return apiFetchJson(
    '/api/security/approvals/request',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.idToken}`,
        'X-Gmail-Access-Token': params.gmailAccessToken,
      },
      body: JSON.stringify({
        incidentId: params.incidentId,
        riskLevel: params.riskLevel,
        explanation: params.explanation,
        proposedChanges: params.proposedChanges,
        proposedCodeDiff: params.proposedCodeDiff,
        testResults: params.testResults,
        actionId: params.actionId,
      }),
    },
    18000,
    'Failed to dispatch Gmail approval email'
  );
}

export async function verifyGmailApprovalReply(params: {
  idToken: string;
  gmailAccessToken: string;
  approvalId: string;
}): Promise<{
  verified: boolean;
  decision?: 'APPROVE' | 'REJECT';
  message?: string;
  approval?: GmailApprovalRequest;
  state?: GlobalSecurityState;
  auditLogs?: SecurityAuditLog[];
}> {
  return apiFetchJson(
    '/api/security/approvals/check-reply',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.idToken}`,
        'X-Gmail-Access-Token': params.gmailAccessToken,
      },
      body: JSON.stringify({ approvalId: params.approvalId }),
    },
    18000,
    'Unable to verify Gmail approval reply'
  );
}

export async function generateCelebrationGreeting(params: {
  festivalTitle: string;
  languageCode?: string;
  languageName?: string;
  recipientName?: string;
  isMidnightNewYear?: boolean;
}): Promise<{
  greetingText: string;
  festivalTitle: string;
  languageCode: string;
  engine: string;
}> {
  return apiFetchJson(
    '/api/greetings/ai-auto',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    15000,
    'Unable to generate celebration greeting'
  );
}

export interface ServerQrProfile {
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

export interface ServerQrTokenResponse {
  token: string;
  tokenId: string;
  issuedAt: string;
  expiresAt: string;
  scanCount: number;
  profile: ServerQrProfile;
  serverTimestamp: string;
}

export interface ServerQrVerifyResponse {
  valid: boolean;
  tokenId: string;
  token: string;
  issuedAt: string;
  expiresAt: string;
  verifiedAt: string;
  scanCount: number;
  profile: ServerQrProfile;
}

export async function issueServerQrToken(params: {
  uid: string;
  fullName: string;
  phoneNumber?: string;
  country?: string;
  countryCode?: string;
  preferredLanguage?: string;
  preferredLanguageName?: string;
  about?: string;
  avatarUrl?: string;
  forceRefresh?: boolean;
  idToken?: string;
}): Promise<ServerQrTokenResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (params.idToken) {
    headers.Authorization = `Bearer ${params.idToken}`;
  }
  return apiFetchJson<ServerQrTokenResponse>(
    '/api/qr/token',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        uid: params.uid,
        fullName: params.fullName,
        phoneNumber: params.phoneNumber || '',
        country: params.country || 'Sri Lanka',
        countryCode: params.countryCode || 'LK',
        preferredLanguage: params.preferredLanguage || 'en',
        preferredLanguageName: params.preferredLanguageName || 'English',
        about: params.about || 'Available on PK Chat',
        avatarUrl: params.avatarUrl || '',
        forceRefresh: Boolean(params.forceRefresh),
      }),
    },
    10000,
    'Unable to generate server QR code.'
  );
}

export async function verifyServerQrToken(params: {
  rawQrText: string;
  scannerUid?: string;
}): Promise<ServerQrVerifyResponse> {
  return apiFetchJson<ServerQrVerifyResponse>(
    '/api/qr/verify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawQrText: params.rawQrText,
        scannerUid: params.scannerUid || '',
      }),
    },
    8000,
    'Unable to verify QR code on server.'
  );
}

export async function revokeServerQrToken(params: {
  uid: string;
  currentToken?: string;
  fullName?: string;
  phoneNumber?: string;
  country?: string;
  countryCode?: string;
  preferredLanguage?: string;
  preferredLanguageName?: string;
  about?: string;
  idToken?: string;
}): Promise<ServerQrTokenResponse & { revokedTokenId?: string | null }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (params.idToken) {
    headers.Authorization = `Bearer ${params.idToken}`;
  }
  return apiFetchJson(
    '/api/qr/revoke',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        uid: params.uid,
        currentToken: params.currentToken,
        fullName: params.fullName,
        phoneNumber: params.phoneNumber,
        country: params.country,
        countryCode: params.countryCode,
        preferredLanguage: params.preferredLanguage,
        preferredLanguageName: params.preferredLanguageName,
        about: params.about,
      }),
    },
    10000,
    'Unable to reset QR code.'
  );
}

export function subscribeQrServerStream(
  uid: string,
  handlers: {
    onScanned?: (payload: { tokenId: string; scanCount: number; verifiedAt: string }) => void;
    onRevoked?: (payload: { newTokenId: string; rotatedAt: string }) => void;
  }
): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined' || !uid) {
    return () => {};
  }
  const source = new EventSource(`/api/qr/stream?uid=${encodeURIComponent(uid)}`);
  const handleScanned = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as { tokenId: string; scanCount: number; verifiedAt: string };
      handlers.onScanned?.(data);
    } catch {
      // ignore malformed SSE packet
    }
  };
  const handleRevoked = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as { newTokenId: string; rotatedAt: string };
      handlers.onRevoked?.(data);
    } catch {
      // ignore malformed SSE packet
    }
  };
  source.addEventListener('qr_scanned', handleScanned as EventListener);
  source.addEventListener('qr_revoked', handleRevoked as EventListener);
  return () => {
    source.removeEventListener('qr_scanned', handleScanned as EventListener);
    source.removeEventListener('qr_revoked', handleRevoked as EventListener);
    source.close();
  };
}

export interface MasterCoreVaultItem {
  alertId: string;
  hazardType: string;
  title: string;
  officialSource: string;
  location: string;
  regionCode: string;
  severity: 'advisory' | 'watch' | 'warning' | 'extreme';
  routingStage: 'LOCKED_IN_ADMIN_CORE' | 'VERIFIED_DISPATCHED' | 'BLOCKED';
  isVerifiedByAdmin: boolean;
  adminCoreId: string;
  coreSealHash: string;
  interceptedAt: string;
  clearedAt?: string;
  clearedBy?: string;
}

export async function fetchMasterCoreAlertQueue(idToken: string): Promise<{
  adminCoreId: string;
  strictManualHold: boolean;
  lockedCount: number;
  dispatchedCount: number;
  blockedCount: number;
  items: MasterCoreVaultItem[];
}> {
  return apiFetchJson(
    '/api/disasters/master-core/queue',
    {
      headers: { Authorization: `Bearer ${idToken}` },
    },
    10000,
    'Unable to load Master Admin Core alert queue.'
  );
}

export async function setMasterCoreStrictPolicy(
  idToken: string,
  strictManualHold: boolean
): Promise<{ adminCoreId: string; strictManualHold: boolean }> {
  return apiFetchJson(
    '/api/disasters/master-core/policy',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ strictManualHold }),
    },
    8000,
    'Unable to update Master Core policy.'
  );
}

export async function interceptGlobalDisastersToMasterCore(params: {
  idToken?: string;
  holdForManualClearance?: boolean;
}): Promise<{
  routedToAdminCoreFirst: boolean;
  adminCoreId: string;
  interceptedCount?: number;
  lockedCount?: number;
}> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (params.idToken) headers.Authorization = `Bearer ${params.idToken}`;
  return apiFetchJson(
    '/api/disasters/master-core/intercept',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ holdForManualClearance: Boolean(params.holdForManualClearance) }),
    },
    14000,
    'Unable to intercept global disaster feeds.'
  );
}

export async function dispatchMasterCoreAlert(params: {
  idToken: string;
  alertId: string;
  regionCode: string;
}): Promise<{ dispatched: boolean; alert: MasterCoreVaultItem }> {
  return apiFetchJson(
    '/api/disasters/master-core/dispatch',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.idToken}`,
      },
      body: JSON.stringify({
        alertId: params.alertId,
        regionCode: params.regionCode,
        isVerifiedByAdmin: true,
      }),
    },
    8000,
    'Unable to dispatch verified alert.'
  );
}

export async function blockMasterCoreAlert(params: {
  idToken: string;
  alertId: string;
}): Promise<{ blocked: boolean; alert: MasterCoreVaultItem }> {
  return apiFetchJson(
    '/api/disasters/master-core/block',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.idToken}`,
      },
      body: JSON.stringify({ alertId: params.alertId }),
    },
    8000,
    'Unable to block alert in Master Core.'
  );
}

// =========================================================================
// Sponsored Public Status & Business Ad System API (Play Store Compliant)
// =========================================================================

export async function fetchAdPlatformConfig(): Promise<RemoteAdPricingConfig> {
  if (isStaticHostedWithoutApi()) {
    return DEFAULT_STATIC_AD_CONFIG;
  }
  return apiFetchJson<RemoteAdPricingConfig>(
    '/api/ads/config',
    {},
    10000,
    'Unable to load ad billing configuration'
  );
}

export async function updateAdPlatformConfig(params: {
  smallAdPriceUsd?: number;
  largeAdPriceUsd?: number;
  annualProPriceUsd?: number;
  freeTrialDays?: number;
  billingLibraryVersion?: string;
  idToken?: string;
}): Promise<RemoteAdPricingConfig> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (params.idToken) headers.Authorization = `Bearer ${params.idToken}`;
  return apiFetchJson<RemoteAdPricingConfig>(
    '/api/ads/config',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    },
    10000,
    'Unable to update ad billing configuration'
  );
}

export async function saveBusinessProfileCard(params: {
  ownerUid: string;
  businessName: string;
  category: string;
  tagline: string;
  city: string;
  country: string;
  countryCode: string;
  primaryLanguage: string;
  enableDirectCall: boolean;
  enableLiveClass: boolean;
  privatePhone?: string;
  privateEmail?: string;
}): Promise<{ profile: BusinessAdCardProfile }> {
  return apiFetchJson(
    '/api/ads/business-profile',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    12000,
    'Unable to save Business Ad Card profile'
  );
}

export async function fetchBusinessProfileCard(
  uid: string
): Promise<{ profile: BusinessAdCardProfile | null }> {
  if (isStaticHostedWithoutApi()) {
    return { profile: null };
  }
  return apiFetchJson(
    `/api/ads/business-profile/${encodeURIComponent(uid)}`,
    {},
    10000,
    'Unable to load Business Ad Card profile'
  );
}

export async function verifyAdvertiserLiveSelfie(params: {
  ownerUid: string;
  selfieDataUrl: string;
  phoneNumber?: string;
  email?: string;
}): Promise<{
  verified: boolean;
  selfieVerificationHash: string;
  verifiedAt: string;
  profile: BusinessAdCardProfile;
}> {
  return apiFetchJson(
    '/api/ads/verify-selfie',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    15000,
    'Unable to complete live photo verification'
  );
}

export async function fetchAdvertiserUnlimitedPassStatus(
  uid: string,
  phone?: string
): Promise<AdvertiserUnlimitedPassStatus> {
  if (isStaticHostedWithoutApi()) {
    return {
      active: false,
      vipFree: false,
      sku: 'pkchat_unlimited_ads_annual_100usd',
      pricePaidUsd: 0,
    };
  }
  const qs = phone ? `?phone=${encodeURIComponent(phone)}` : '';
  return apiFetchJson(
    `/api/ads/unlimited/status/${encodeURIComponent(uid)}${qs}`,
    {},
    10000,
    'Unable to check Unlimited Ads & Videos pass status'
  );
}

export async function activateAdvertiserUnlimitedPass(params: {
  uid: string;
  sellerPhone?: string;
  playBillingPurchaseToken?: string;
}): Promise<AdvertiserUnlimitedPassStatus> {
  return apiFetchJson(
    '/api/ads/unlimited/activate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    12000,
    'Unable to activate $100/year Unlimited Ads & Videos pass'
  );
}

export async function evaluateAdSafetyAndTier(params: {
  businessName: string;
  category: string;
  title: string;
  description: string;
  mediaType: 'image' | 'video';
  durationSeconds?: number;
  targetCountry?: string;
  targetCountries?: string[];
  enableLiveClass?: boolean;
}): Promise<AdSafetyEvaluationResult> {
  return apiFetchJson<AdSafetyEvaluationResult>(
    '/api/ads/evaluate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    18000,
    'Pre-publish AI ad safety evaluation failed'
  );
}

export async function publishSponsoredAd(params: {
  sellerUid: string;
  sellerPhone?: string;
  businessName: string;
  category: string;
  title: string;
  description: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  mediaMimeType: string;
  durationSeconds?: number;
  targetCountry: string;
  targetCountries?: string[];
  targetLanguage: string;
  enableDirectCall: boolean;
  enableLiveClass: boolean;
  city?: string;
  playBillingPurchaseToken?: string;
  playBillingSku: string;
  amountUsd: number;
}): Promise<{ ad: SponsoredPublicAd; billingVerified: boolean }> {
  return apiFetchJson(
    '/api/ads/publish',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    20000,
    'Unable to publish Sponsored Public Status ad'
  );
}

export async function fetchPublicSponsoredAds(params?: {
  country?: string;
  language?: string;
  page?: number;
  pageSize?: number;
  viewerUid?: string;
  excludeSellers?: string[];
  includeUnderReviewForOwner?: string;
}): Promise<{
  ads: SponsoredPublicAd[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  config: RemoteAdPricingConfig;
}> {
  if (isStaticHostedWithoutApi()) {
    return {
      ads: [],
      page: params?.page || 1,
      pageSize: params?.pageSize || 6,
      total: 0,
      totalPages: 1,
      hasMore: false,
      config: DEFAULT_STATIC_AD_CONFIG,
    };
  }
  const qs = new URLSearchParams();
  if (params?.country) qs.set('country', params.country);
  if (params?.language) qs.set('language', params.language);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
  if (params?.viewerUid) qs.set('viewerUid', params.viewerUid);
  if (params?.excludeSellers && params.excludeSellers.length > 0) {
    qs.set('excludeSellers', params.excludeSellers.join(','));
  }
  if (params?.includeUnderReviewForOwner) {
    qs.set('ownerUid', params.includeUnderReviewForOwner);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetchJson(
    `/api/ads/public${suffix}`,
    {},
    12000,
    'Unable to fetch Sponsored Public Status feed'
  );
}

export async function createAdFulfillmentRequest(params: {
  adId: string;
  buyerUid: string;
  buyerName: string;
  fulfillmentType: AdFulfillmentType;
  deliveryNote?: string;
  scheduledDateTime?: string;
  buyerLocation?: { latitude: number; longitude: number; displayAddress?: string } | null;
}): Promise<{ request: AdFulfillmentRequest }> {
  return apiFetchJson(
    `/api/ads/${encodeURIComponent(params.adId)}/request`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    12000,
    'Unable to send private buyer request'
  );
}

export async function fetchMyAdRequests(uid: string): Promise<{
  requests: AdFulfillmentRequest[];
}> {
  if (isStaticHostedWithoutApi()) {
    return { requests: [] };
  }
  return apiFetchJson(
    `/api/ads/requests/mine?uid=${encodeURIComponent(uid)}`,
    {},
    10000,
    'Unable to load private buyer/seller requests'
  );
}

export async function confirmAdProductReceived(params: {
  requestId: string;
  buyerUid: string;
}): Promise<{ request: AdFulfillmentRequest; feeUsd: 0 }> {
  return apiFetchJson(
    `/api/ads/requests/${encodeURIComponent(params.requestId)}/received`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerUid: params.buyerUid }),
    },
    10000,
    'Unable to confirm Product Received'
  );
}

export async function reportSponsoredAd(params: {
  adId: string;
  reporterUid: string;
  category: AdReportCategory;
  reason?: string;
}): Promise<{
  reported: boolean;
  adStatus: 'active' | 'under_review' | 'suspended';
  reportCount: number;
  autoBanPrevented: boolean;
  message: string;
}> {
  return apiFetchJson(
    `/api/ads/${encodeURIComponent(params.adId)}/report`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    10000,
    'Unable to submit UGC report'
  );
}

export async function fetchAdsReviewQueueAdmin(idToken: string): Promise<{
  items: SponsoredPublicAd[];
}> {
  return apiFetchJson(
    '/api/ads/admin/review-queue',
    {
      headers: { Authorization: `Bearer ${idToken}` },
    },
    10000,
    'Unable to load Sponsored Ads review queue'
  );
}

export async function verifyAdViolationAdmin(params: {
  adId: string;
  confirmedViolation: boolean;
  violationCategory?: AdReportCategory;
  evidenceSummary?: string;
  policyClause?: string;
  idToken?: string;
}): Promise<{
  ad: SponsoredPublicAd;
  warningNotice?: AdViolationWarningNotice | null;
}> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (params.idToken) headers.Authorization = `Bearer ${params.idToken}`;
  return apiFetchJson(
    `/api/ads/${encodeURIComponent(params.adId)}/verify-violation`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    },
    12000,
    'Unable to verify ad violation status'
  );
}

export async function fetchMyAdViolationWarnings(
  uid: string
): Promise<{ warnings: AdViolationWarningNotice[] }> {
  if (isStaticHostedWithoutApi()) {
    return { warnings: [] };
  }
  return apiFetchJson(
    `/api/ads/warnings/${encodeURIComponent(uid)}`,
    {},
    10000,
    'Unable to load official Violation Warning Notices'
  );
}
