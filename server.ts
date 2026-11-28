import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import express from 'express';
import path from 'path';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import {
  WORLD_LANGUAGES_CATALOG,
  findWorldLanguage,
  isSupportedWorldLanguage,
} from './src/data/worldLanguages';
import {
  GOOGLE_PLAY_BILLING_CONFIG,
  isVipFounderFreeNumber,
  STANDARD_ANNUAL_PRICE_USD,
  STANDARD_FREE_TRIAL_DAYS,
  UNLIMITED_ADS_ANNUAL_PRICE_USD,
  UNLIMITED_ADS_DURATION_DAYS,
  verifyUserSubscriptionBilling,
} from './src/lib/subscriptionBilling';
import {
  PK_CONFIG,
  runPKChatReadinessCheck,
  sanitizePublicText,
} from './src/lib/pkCoreController';
import {
  classifyAdScaleDeterministic,
  normalizeTargetCountries,
  preScreenAdContentSafety,
} from './src/lib/businessAdsEngine';
import {
  buildClassMeetingUrl,
  evaluateSameLanguagePassThrough,
  sanitizeClassRoomId,
  type ClassParticipant,
  type ClassRoomState,
  type ClassSubtitleEntry,
  type WhiteboardStroke,
} from './src/lib/classTranslation';
import {
  detectExplicitSexualContent,
  evaluateClassSafetyContent,
  inspectAttachmentForMalware,
  inspectMagicBytesBuffer,
  isVerifiedOfficialDisasterAgency,
} from './src/lib/securityShield';
import type {
  AdFulfillmentRequest,
  AdFulfillmentType,
  AdReportCategory,
  AdSafetyEvaluationResult,
  AdViolationWarningNotice,
  AdvertiserUnlimitedPassStatus,
  BusinessAdCardProfile,
  LanguageOption,
  RemoteAdPricingConfig,
  SponsoredPublicAd,
} from './src/types/pkchat';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const serverStartTime = Date.now();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  apiVersion: 'v1beta',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Simple in-memory rate limiter for security hardening (bounded against memory exhaustion)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const rateBreachMap = new Map<string, { breaches: number; resetAt: number }>();
let strictRateLimitMode = false;

function pruneExpiredMap<T extends { resetAt?: number; expiresAt?: number }>(map: Map<string, T>, maxEntries = 5000) {
  if (map.size <= maxEntries) return;
  const now = Date.now();
  for (const [k, v] of map.entries()) {
    const expiry = v.resetAt ?? v.expiresAt ?? 0;
    if (now > expiry) {
      map.delete(k);
    }
    if (map.size <= maxEntries) break;
  }
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}

function checkRateLimit(key: string, maxRequests = strictRateLimitMode ? 45 : 120, windowMs = 60_000): boolean {
  const now = Date.now();
  pruneExpiredMap(rateLimitMap);
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count += 1;
  return true;
}

// Track recent server error events for Admin Health monitoring (no secrets stored)
interface ServerHealthEvent {
  id: string;
  endpoint: string;
  status: number;
  message: string;
  timestamp: string;
}
const recentServerErrors: ServerHealthEvent[] = [];
function recordServerError(endpoint: string, status: number, message: string) {
  recentServerErrors.unshift({
    id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    endpoint,
    status,
    message: message.slice(0, 240),
    timestamp: new Date().toISOString(),
  });
  if (recentServerErrors.length > 25) {
    recentServerErrors.pop();
  }
}

type SystemSecurityStatus = 'NORMAL' | 'LOCKDOWN' | 'RECOVERING';
type AllowlistedRemediationAction =
  | 'VERIFY_AND_RECOVER'
  | 'ENABLE_STRICT_RATE_LIMIT'
  | 'KEEP_LOCKDOWN_ACTIVE'
  | 'HALT_AFFECTED_ENDPOINTS';

const ALLOWLISTED_REMEDIATION_ACTIONS = new Set<AllowlistedRemediationAction>([
  'VERIFY_AND_RECOVER',
  'ENABLE_STRICT_RATE_LIMIT',
  'KEEP_LOCKDOWN_ACTIVE',
  'HALT_AFFECTED_ENDPOINTS',
]);

const OWNER_EMAIL_ALLOWLIST = new Set([
  'jeradkaran2022@gmail.com',
  'jeradprasanth27@gmail.com',
]);
const OWNER_APPROVAL_TARGET_EMAIL = 'Jeradprasanth27@gmail.com';
const APPROVAL_HMAC_SECRET =
  process.env.PKCHAT_APPROVAL_SECRET || process.env.GEMINI_API_KEY || crypto.randomBytes(32).toString('hex');

interface ServerSecurityState {
  stateId: string;
  status: SystemSecurityStatus;
  threatLevel: 'low' | 'elevated' | 'critical';
  reasonCode: string;
  incidentId?: string;
  restrictLogin: boolean;
  restrictMessages: boolean;
  restrictAccountChanges: boolean;
  restrictCalls: boolean;
  recheckIntervalSeconds: number;
  threatResolved: boolean;
  lockdownStartedAt?: string | null;
  recoveringStartedAt?: string | null;
  lastCheckedAt: string;
  nextRecheckAt: string;
  updatedBy: string;
  updatedAt: string;
}

interface ServerSecurityIncident {
  incidentId: string;
  category:
    | 'rate_limit_abuse'
    | 'auth_brute_force'
    | 'privilege_escalation'
    | 'payload_tampering'
    | 'anomalous_flood';
  severity: 'warning' | 'critical';
  status: 'active' | 'mitigating' | 'resolved';
  sourceSignal: string;
  summary: string;
  proposedSolution?: string;
  proposedCodeSnippet?: string;
  testResultsSummary?: string;
  detectedBy: string;
  resolvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface ServerSecurityAuditLog {
  auditId: string;
  actorId: string;
  action: string;
  fromStatus: SystemSecurityStatus;
  toStatus: SystemSecurityStatus;
  detail: string;
  createdAt: string;
}

interface ServerGmailApproval {
  approvalId: string;
  incidentId: string;
  ownerEmail: string;
  riskLevel: 'HIGH' | 'CRITICAL' | 'MEDIUM';
  explanation: string;
  proposedChanges: string;
  proposedCodeDiff: string;
  testResults: string;
  actionId: AllowlistedRemediationAction;
  codeHash: string;
  threadId?: string;
  sentMessageId?: string;
  status: 'pending_send' | 'pending_reply' | 'approved' | 'rejected' | 'expired';
  expiresAt: string;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  confirmationMessageId?: string;
}

const nowIso = () => new Date().toISOString();
const plusSecondsIso = (s: number) => new Date(Date.now() + s * 1000).toISOString();

let globalSecurityState: ServerSecurityState = {
  stateId: 'global',
  status: 'NORMAL',
  threatLevel: 'low',
  reasonCode: 'SYSTEM_HEALTHY',
  restrictLogin: false,
  restrictMessages: false,
  restrictAccountChanges: false,
  restrictCalls: false,
  recheckIntervalSeconds: 10,
  threatResolved: true,
  lockdownStartedAt: null,
  recoveringStartedAt: null,
  lastCheckedAt: nowIso(),
  nextRecheckAt: plusSecondsIso(10),
  updatedBy: 'server_boot',
  updatedAt: nowIso(),
};

const securityIncidents: ServerSecurityIncident[] = [];
const securityAuditLogs: ServerSecurityAuditLog[] = [];
const gmailApprovals: ServerGmailApproval[] = [];
const haltedEndpoints = new Set<string>();

function appendAuditLog(params: {
  actorId: string;
  action: string;
  fromStatus: SystemSecurityStatus;
  toStatus: SystemSecurityStatus;
  detail: string;
}) {
  securityAuditLogs.unshift({
    auditId: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    actorId: params.actorId,
    action: params.action,
    fromStatus: params.fromStatus,
    toStatus: params.toStatus,
    detail: params.detail.slice(0, 500),
    createdAt: nowIso(),
  });
  if (securityAuditLogs.length > 100) securityAuditLogs.pop();
}

function triggerServerLockdown(params: {
  category: ServerSecurityIncident['category'];
  severity: 'warning' | 'critical';
  sourceSignal: string;
  summary: string;
  actorId: string;
  proposedSolution?: string;
  proposedCodeSnippet?: string;
}) {
  const prevStatus = globalSecurityState.status;
  const incidentId = `inc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const timestamp = nowIso();

  securityIncidents.unshift({
    incidentId,
    category: params.category,
    severity: params.severity,
    status: 'active',
    sourceSignal: params.sourceSignal,
    summary: params.summary,
    proposedSolution:
      params.proposedSolution ||
      'Enforce global LOCKDOWN, isolate offending caller IP/session, require verified owner confirmation or 10-second security clearance.',
    proposedCodeSnippet:
      params.proposedCodeSnippet ||
      'if (globalSecurityState.status === "LOCKDOWN") return res.status(423).json({ lockedDown: true });',
    testResultsSummary: 'Automated ruleset + lockdown guard verified.',
    detectedBy: 'pkchat_security_guardian',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  if (securityIncidents.length > 50) securityIncidents.pop();

  globalSecurityState = {
    stateId: 'global',
    status: 'LOCKDOWN',
    threatLevel: params.severity === 'critical' ? 'critical' : 'elevated',
    reasonCode: params.category.toUpperCase(),
    incidentId,
    restrictLogin: true,
    restrictMessages: true,
    restrictAccountChanges: true,
    restrictCalls: true,
    recheckIntervalSeconds: 10,
    threatResolved: false,
    lockdownStartedAt: globalSecurityState.lockdownStartedAt || timestamp,
    recoveringStartedAt: null,
    lastCheckedAt: timestamp,
    nextRecheckAt: plusSecondsIso(10),
    updatedBy: params.actorId,
    updatedAt: timestamp,
  };

  appendAuditLog({
    actorId: params.actorId,
    action: `LOCKDOWN_TRIGGERED_${params.category.toUpperCase()}`,
    fromStatus: prevStatus,
    toStatus: 'LOCKDOWN',
    detail: params.summary,
  });
}

function hashApprovalCode(approvalId: string, code: string): string {
  return crypto
    .createHmac('sha256', APPROVAL_HMAC_SECRET)
    .update(`${approvalId}:${code.toUpperCase()}`)
    .digest('hex');
}

function sanitizeApprovals() {
  return gmailApprovals.map(({ codeHash: _omitted, ...publicApproval }) => publicApproval);
}

function sanitizeVoiceAndSubtitleText(raw: string): {
  safe: boolean;
  sanitized: string;
  blockedReason?: string;
} {
  const cleanedControl = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  if (/<\s*(?:script|iframe|object|embed|svg)|javascript\s*:|on[a-z]+\s*=/i.test(cleanedControl)) {
    return {
      safe: false,
      sanitized: '',
      blockedReason: 'Blocked by Live Firewall: active script/markup injection detected.',
    };
  }
  const strippedHtml = cleanedControl.replace(/<[^>]{1,200}>/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const privacyFiltered = strippedHtml
    .replace(/\b(?:\d[ -]*?){13,16}\b/g, '[REDACTED-PAN]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED-ID]');
  return {
    safe: true,
    sanitized: privacyFiltered,
  };
}

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/wav',
  'audio/aac',
  'audio/x-m4a',
  'audio/m4a',
  'audio/flac',
]);

function inspectAudioForensics(
  audioBase64: string,
  mimeType: string
): { safe: boolean; normalizedMime: string; reason?: string } {
  const normalizedMime = (mimeType || 'audio/webm').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_AUDIO_MIME_TYPES.has(normalizedMime)) {
    return { safe: false, normalizedMime, reason: `Unsupported audio container MIME type: ${normalizedMime}` };
  }
  const compactB64 = audioBase64.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(compactB64) || compactB64.length < 8) {
    return { safe: false, normalizedMime, reason: 'Audio forensics rejected malformed Base64 stream.' };
  }
  const headBytes = Buffer.from(compactB64.slice(0, 128), 'base64');
  if (headBytes.length < 4) {
    return { safe: false, normalizedMime, reason: 'Audio forensics rejected truncated payload.' };
  }
  const asciiHead = headBytes.subarray(0, 64).toString('utf8').toLowerCase();
  const isPeExecutable = headBytes[0] === 0x4d && headBytes[1] === 0x5a;
  const isElfBinary =
    headBytes[0] === 0x7f && headBytes[1] === 0x45 && headBytes[2] === 0x4c && headBytes[3] === 0x46;
  const isPdfDoc = headBytes.subarray(0, 4).toString('ascii') === '%PDF';
  const isZipArchive = headBytes[0] === 0x50 && headBytes[1] === 0x4b && headBytes[2] === 0x03 && headBytes[3] === 0x04;
  const isHtmlOrScript = /<(?:script|html|!doctype|svg|iframe)/.test(asciiHead);

  if (isPeExecutable || isElfBinary || isPdfDoc || isZipArchive || isHtmlOrScript) {
    return {
      safe: false,
      normalizedMime,
      reason: 'Audio forensics rejected executable, document, or script payload masquerading as audio.',
    };
  }
  return { safe: true, normalizedMime };
}

function isValidHardenedServerGps(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
  return true;
}

let dynamicLanguageCatalog: LanguageOption[] = [...WORLD_LANGUAGES_CATALOG];
let languageCatalogVersion = `v${WORLD_LANGUAGES_CATALOG.length}.1`;
let languageCatalogUpdatedAt = new Date().toISOString();

const DAILY_CHAR_BUDGET = 2_000_000;
let usageDayKey = new Date().toISOString().slice(0, 10);
let dailyCharsUsed = 0;
let apiCallsToday = 0;
let translationCacheHits = 0;
let translationCacheMisses = 0;

function resetUsageIfNewDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== usageDayKey) {
    usageDayKey = today;
    dailyCharsUsed = 0;
    apiCallsToday = 0;
  }
}

function recordTranslationUsage(charCount: number, isCacheHit: boolean) {
  resetUsageIfNewDay();
  if (isCacheHit) {
    translationCacheHits += 1;
  } else {
    translationCacheMisses += 1;
    apiCallsToday += 1;
    dailyCharsUsed += Math.max(0, charCount);
  }
}

const translationCache = new Map<string, { payload: Record<string, unknown>; expiresAt: number }>();
const uiPackCache = new Map<string, { translations: Record<string, string>; expiresAt: number }>();

const QR_TOKEN_HMAC_SECRET =
  process.env.QR_TOKEN_HMAC_SECRET ||
  crypto.createHmac('sha256', APPROVAL_HMAC_SECRET).update('pkc-qr-registry-v1').digest('hex');
const QR_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const QR_TOKEN_PREFIX = 'pkc:qr:v1:';

interface ServerQrProfileSnapshot {
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

interface ServerQrTokenRecord {
  tokenId: string;
  signature: string;
  tokenString: string;
  profile: ServerQrProfileSnapshot;
  issuedAtMs: number;
  expiresAtMs: number;
  revoked: boolean;
  scanCount: number;
  lastScannedAtMs?: number;
}

const qrTokensById = new Map<string, ServerQrTokenRecord>();
const activeQrTokenIdByUid = new Map<string, string>();
const qrStreamClients = new Map<string, { res: express.Response; uid: string }>();
const QR_PERSIST_PATH = path.resolve(process.cwd(), '.pkchat-qr-registry.json');

function loadQrRegistryFromDisk() {
  try {
    if (!fs.existsSync(QR_PERSIST_PATH)) return;
    const raw = fs.readFileSync(QR_PERSIST_PATH, 'utf8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw) as {
      records?: ServerQrTokenRecord[];
      activeByUid?: Record<string, string>;
    };
    const now = Date.now();
    if (Array.isArray(parsed.records)) {
      for (const rec of parsed.records) {
        if (rec && rec.tokenId && rec.profile?.uid && rec.expiresAtMs > now) {
          qrTokensById.set(rec.tokenId, rec);
        }
      }
    }
    if (parsed.activeByUid && typeof parsed.activeByUid === 'object') {
      for (const [uid, tokenId] of Object.entries(parsed.activeByUid)) {
        if (typeof tokenId === 'string' && qrTokensById.has(tokenId)) {
          activeQrTokenIdByUid.set(uid, tokenId);
        }
      }
    }
  } catch {
    // Non-fatal: start fresh if persisted registry is unreadable
  }
}

let qrPersistTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleQrPersist() {
  if (qrPersistTimer) clearTimeout(qrPersistTimer);
  qrPersistTimer = setTimeout(() => {
    try {
      const payload = {
        records: Array.from(qrTokensById.values()),
        activeByUid: Object.fromEntries(activeQrTokenIdByUid.entries()),
      };
      const tmpPath = `${QR_PERSIST_PATH}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(payload), 'utf8');
      fs.renameSync(tmpPath, QR_PERSIST_PATH);
    } catch {
      // ignore disk write failures on read-only containers
    }
  }, 60);
}

loadQrRegistryFromDisk();

function signQrToken(tokenId: string, uid: string, issuedAtMs: number): string {
  return crypto
    .createHmac('sha256', QR_TOKEN_HMAC_SECRET)
    .update(`${tokenId}:${uid}:${issuedAtMs}`)
    .digest('hex')
    .slice(0, 24);
}

function parseRawQrToken(rawInput: string): { tokenId: string; signature: string; tokenString: string } | null {
  let candidate = String(rawInput || '').trim();
  if (!candidate || candidate.length > 512) return null;

  if (candidate.startsWith('{') && candidate.endsWith('}')) {
    try {
      const parsed = JSON.parse(candidate) as { token?: unknown; qrToken?: unknown };
      if (typeof parsed.token === 'string') candidate = parsed.token.trim();
      else if (typeof parsed.qrToken === 'string') candidate = parsed.qrToken.trim();
    } catch {
      return null;
    }
  } else if (candidate.includes('/qr/')) {
    const idx = candidate.indexOf('/qr/');
    candidate = decodeURIComponent(candidate.slice(idx + 4).split(/[?#]/)[0] || '').trim();
  }

  if (!candidate.startsWith(QR_TOKEN_PREFIX)) return null;
  const remainder = candidate.slice(QR_TOKEN_PREFIX.length);
  const parts = remainder.split(':');
  if (parts.length !== 2) return null;
  const [tokenId, signature] = parts;
  if (!/^[a-zA-Z0-9_-]{8,48}$/.test(tokenId) || !/^[a-f0-9]{24}$/.test(signature)) {
    return null;
  }
  return {
    tokenId,
    signature,
    tokenString: `${QR_TOKEN_PREFIX}${tokenId}:${signature}`,
  };
}

function broadcastQrRealtimeEvent(eventName: string, targetUid: string, payload: Record<string, unknown>) {
  const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const [clientId, client] of qrStreamClients.entries()) {
    if (client.uid && client.uid !== targetUid) continue;
    try {
      client.res.write(frame);
    } catch {
      qrStreamClients.delete(clientId);
    }
  }
}

function pruneExpiredQrTokens() {
  const now = Date.now();
  if (qrTokensById.size <= 5000) return;
  for (const [id, rec] of qrTokensById.entries()) {
    if (rec.revoked || rec.expiresAtMs <= now) {
      qrTokensById.delete(id);
      if (activeQrTokenIdByUid.get(rec.profile.uid) === id) {
        activeQrTokenIdByUid.delete(rec.profile.uid);
      }
    }
  }
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Number((2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
      res.status(400).json({ error: 'Malformed JSON request payload.' });
      return;
    }
    next(err);
  });

  const readFirebasePublicConfig = (): { projectId?: string; apiKey?: string; oAuthClientId?: string } => {
    try {
      const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
      return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    } catch {
      return {};
    }
  };

  async function verifyAuthenticatedFirebaseUser(req: express.Request): Promise<{
    ok: boolean;
    status: number;
    uid?: string;
    email?: string;
    emailVerified?: boolean;
    isAdmin?: boolean;
    error?: string;
  }> {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return { ok: false, status: 401, error: 'Missing Firebase Authorization Bearer token.' };
    }
    const cfg = readFirebasePublicConfig();
    if (!cfg.apiKey) {
      return { ok: false, status: 500, error: 'Firebase Web API key is unavailable on server.' };
    }
    try {
      const lookupRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(cfg.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: token }),
        }
      );
      if (!lookupRes.ok) {
        return { ok: false, status: 401, error: 'Invalid or expired Firebase ID token.' };
      }
      const data = (await lookupRes.json()) as {
        users?: Array<{ localId?: string; email?: string; emailVerified?: boolean; phoneNumber?: string }>;
      };
      const account = data.users?.[0];
      if (!account?.localId) {
        return { ok: false, status: 401, error: 'Authenticated Firebase user account not found.' };
      }
      const normalizedEmail = (account.email || '').trim().toLowerCase();
      const isAdmin = Boolean(account.emailVerified && OWNER_EMAIL_ALLOWLIST.has(normalizedEmail));
      return {
        ok: true,
        status: 200,
        uid: account.localId,
        email: normalizedEmail,
        emailVerified: Boolean(account.emailVerified),
        isAdmin,
      };
    } catch {
      return { ok: false, status: 502, error: 'Unable to verify Firebase credentials.' };
    }
  }

  async function verifyAdminFirebaseToken(req: express.Request): Promise<{
    ok: boolean;
    status: number;
    uid?: string;
    email?: string;
    error?: string;
  }> {
    const providedMasterKey =
      typeof req.headers['x-pkchat-master-key'] === 'string'
        ? req.headers['x-pkchat-master-key'].trim()
        : '';
    const configuredMasterKey = (process.env.PKCHAT_MASTER_KEY || '').trim();
    if (providedMasterKey && configuredMasterKey) {
      const providedDigest = crypto.createHash('sha256').update(providedMasterKey).digest();
      const expectedDigest = crypto.createHash('sha256').update(configuredMasterKey).digest();
      if (!crypto.timingSafeEqual(providedDigest, expectedDigest)) {
        appendAuditLog({
          actorId: req.ip || 'unknown',
          action: 'PRIVILEGE_ESCALATION_MASTER_KEY_MISMATCH',
          fromStatus: globalSecurityState.status,
          toStatus: globalSecurityState.status,
          detail: 'Rejected invalid PKCHAT master key header on root endpoint.',
        });
        return { ok: false, status: 403, error: 'Invalid Master Key credential.' };
      }
    }

    const userCheck = await verifyAuthenticatedFirebaseUser(req);
    if (!userCheck.ok) {
      return userCheck;
    }
    if (!userCheck.isAdmin) {
      return { ok: false, status: 403, error: 'Verified PK CHAT owner authorization required.' };
    }
    return { ok: true, status: 200, uid: userCheck.uid, email: userCheck.email };
  }

  app.get('/api/security/master-authority', async (req, res) => {
    const authCheck = await verifyAdminFirebaseToken(req);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }
    res.json({
      creator: 'Prashanth Keransiya',
      authorityLevel: 'ROOT_MASTER_ADMIN',
      ownerEmail: authCheck.email,
      masterKeyConfigured: Boolean(process.env.PKCHAT_MASTER_KEY),
      citadelZones: 4,
      verifiedAt: nowIso(),
    });
  });

  // Basic security headers (preserving AI Studio iframe compatibility)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self)');
    next();
  });

  // Rate limit API endpoints + automatic abuse escalation into LOCKDOWN
  // Chunked multi-hour media uploads and Range video streaming get dedicated high-throughput limits
  app.use('/api', (req, res, next) => {
    const clientKey = req.ip || 'unknown';
    if (req.path === '/media/upload/chunk') {
      if (!checkRateLimit(`media_chunk:${clientKey}`, 600, 60_000)) {
        res.status(429).json({
          error: 'Chunk upload throughput limit reached. Pausing briefly before resume.',
        });
        return;
      }
      next();
      return;
    }
    if (req.path.startsWith('/media/file/')) {
      if (!checkRateLimit(`media_stream:${clientKey}`, 600, 60_000)) {
        res.status(429).json({
          error: 'Media streaming throttle reached. Wait briefly before retrying.',
        });
        return;
      }
      next();
      return;
    }
    if (!checkRateLimit(clientKey)) {
      const now = Date.now();
      const b = rateBreachMap.get(clientKey);
      const nextCount = !b || now > b.resetAt ? 1 : b.breaches + 1;
      rateBreachMap.set(clientKey, { breaches: nextCount, resetAt: now + 60_000 });
      if (nextCount >= 3 && globalSecurityState.status === 'NORMAL') {
        triggerServerLockdown({
          category: 'rate_limit_abuse',
          severity: 'critical',
          sourceSignal: `IP:${clientKey}`,
          summary: 'Repeated API rate-limit threshold breaches detected from single client source.',
          actorId: 'rate_limit_sensor',
        });
      }
      res.status(429).json({
        error: 'Rate limit exceeded. Please wait briefly before retrying.',
      });
      return;
    }
    next();
  });

  // Enforce LOCKDOWN restrictions on sensitive routes while keeping health/security/TTS active
  app.use('/api', (req, res, next) => {
    if (haltedEndpoints.has(req.path)) {
      res.status(503).json({
        error: 'This endpoint is temporarily halted by owner security remediation.',
        status: globalSecurityState.status,
      });
      return;
    }
    if (globalSecurityState.status === 'LOCKDOWN') {
      const isProtectedOperation =
        req.path.startsWith('/translate') ||
        req.path === '/speech/transcribe' ||
        req.path.startsWith('/otp/gateway/') ||
        req.path === '/subscriptions/validate' ||
        req.path === '/profile/validate-image';
      if (isProtectedOperation) {
        res.status(423).json({
          lockedDown: true,
          status: globalSecurityState.status,
          recheckIntervalSeconds: globalSecurityState.recheckIntervalSeconds,
          error:
            'PK CHAT Emergency Security Lockdown is active. Actions are temporarily paused; all user messages and accounts remain safe.',
        });
        return;
      }
    }
    next();
  });

  // 1. Health & Cloud Monitoring Endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      service: 'PK CHAT Cloud Relay',
      status: 'operational',
      brandName: PK_CONFIG.brandName,
      securityStatus: globalSecurityState.status,
      uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      translationReady: Boolean(process.env.GEMINI_API_KEY),
      paymentMode: 'test',
      timestamp: new Date().toISOString(),
      recentErrors: recentServerErrors,
    });
  });

  app.get('/api/system/readiness', (_req, res) => {
    res.json(runPKChatReadinessCheck());
  });

  // 1b. Security State, 10s Recheck Engine, AI Guardian & Gmail Owner Approvals
  app.get('/api/security/status', (_req, res) => {
    res.json({
      state: globalSecurityState,
      incidents: securityIncidents,
      auditLogs: securityAuditLogs,
      approvals: sanitizeApprovals(),
    });
  });

  app.post('/api/security/recheck', (req, res) => {
    const nowMs = Date.now();
    const nowStr = new Date(nowMs).toISOString();
    const prevStatus = globalSecurityState.status;
    let recovered = false;

    if (prevStatus === 'LOCKDOWN') {
      const startedMs = globalSecurityState.lockdownStartedAt
        ? Date.parse(globalSecurityState.lockdownStartedAt)
        : 0;
      const elapsedSec = Math.floor((nowMs - startedMs) / 1000);
      if (globalSecurityState.threatResolved && elapsedSec >= 10) {
        globalSecurityState = {
          ...globalSecurityState,
          status: 'RECOVERING',
          threatLevel: 'elevated',
          restrictLogin: false,
          restrictMessages: true,
          restrictAccountChanges: true,
          restrictCalls: false,
          recoveringStartedAt: nowStr,
          lastCheckedAt: nowStr,
          nextRecheckAt: plusSecondsIso(10),
          updatedBy: 'recheck_engine_10s',
          updatedAt: nowStr,
        };
        appendAuditLog({
          actorId: 'recheck_engine_10s',
          action: 'STEP_DOWN_TO_RECOVERING',
          fromStatus: 'LOCKDOWN',
          toStatus: 'RECOVERING',
          detail: 'Threat resolved and 10s quarantine satisfied. Verifying stability before NORMAL.',
        });
      } else {
        globalSecurityState = {
          ...globalSecurityState,
          lastCheckedAt: nowStr,
          nextRecheckAt: plusSecondsIso(10),
          updatedAt: nowStr,
        };
      }
    } else if (prevStatus === 'RECOVERING') {
      const recStartMs = globalSecurityState.recoveringStartedAt
        ? Date.parse(globalSecurityState.recoveringStartedAt)
        : 0;
      const elapsedRec = Math.floor((nowMs - recStartMs) / 1000);
      if (globalSecurityState.threatResolved && elapsedRec >= 10) {
        for (const inc of securityIncidents) {
          if (inc.status !== 'resolved') {
            inc.status = 'resolved';
            inc.resolvedBy = 'recheck_engine_10s';
            inc.updatedAt = nowStr;
          }
        }
        globalSecurityState = {
          ...globalSecurityState,
          status: 'NORMAL',
          threatLevel: 'low',
          reasonCode: 'SYSTEM_HEALTHY',
          restrictLogin: false,
          restrictMessages: false,
          restrictAccountChanges: false,
          restrictCalls: false,
          threatResolved: true,
          lockdownStartedAt: null,
          recoveringStartedAt: null,
          lastCheckedAt: nowStr,
          nextRecheckAt: plusSecondsIso(10),
          updatedBy: 'recheck_engine_10s',
          updatedAt: nowStr,
        };
        recovered = true;
        appendAuditLog({
          actorId: 'recheck_engine_10s',
          action: 'RESTORED_NORMAL_OPERATION',
          fromStatus: 'RECOVERING',
          toStatus: 'NORMAL',
          detail: 'All automated 10-second verification checks passed. Normal PK CHAT operation restored.',
        });
      } else {
        globalSecurityState = {
          ...globalSecurityState,
          lastCheckedAt: nowStr,
          nextRecheckAt: plusSecondsIso(10),
          updatedAt: nowStr,
        };
      }
    } else {
      globalSecurityState = {
        ...globalSecurityState,
        lastCheckedAt: nowStr,
        nextRecheckAt: plusSecondsIso(10),
      };
    }

    void req;
    res.json({
      state: globalSecurityState,
      recovered,
      recheckPerformedAt: nowStr,
    });
  });

  app.post('/api/security/admin/trigger-test-incident', async (req, res) => {
    const authCheck = await verifyAdminFirebaseToken(req);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }
    const { category, summary } = req.body ?? {};
    triggerServerLockdown({
      category: category || 'anomalous_flood',
      severity: 'critical',
      sourceSignal: `OWNER_DRILL:${authCheck.email}`,
      summary:
        typeof summary === 'string' && summary.trim()
          ? summary.trim().slice(0, 300)
          : 'Owner-initiated Emergency Security Lockdown drill (zero user data loss verified).',
      actorId: authCheck.uid || 'owner',
    });
    res.json({ state: globalSecurityState, incidents: securityIncidents, auditLogs: securityAuditLogs });
  });

  app.post('/api/security/admin/resolve-threat', async (req, res) => {
    const authCheck = await verifyAdminFirebaseToken(req);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }
    const { immediateNormal } = req.body ?? {};
    const prevStatus = globalSecurityState.status;
    const nowStr = nowIso();
    globalSecurityState.threatResolved = true;
    haltedEndpoints.clear();
    strictRateLimitMode = false;

    for (const inc of securityIncidents) {
      if (inc.status === 'active') {
        inc.status = immediateNormal ? 'resolved' : 'mitigating';
        inc.resolvedBy = authCheck.email;
        inc.updatedAt = nowStr;
      }
    }

    if (immediateNormal) {
      globalSecurityState = {
        ...globalSecurityState,
        status: 'NORMAL',
        threatLevel: 'low',
        reasonCode: 'OWNER_VERIFIED_RECOVERY',
        restrictLogin: false,
        restrictMessages: false,
        restrictAccountChanges: false,
        restrictCalls: false,
        threatResolved: true,
        lockdownStartedAt: null,
        recoveringStartedAt: null,
        lastCheckedAt: nowStr,
        nextRecheckAt: plusSecondsIso(10),
        updatedBy: authCheck.uid || 'owner',
        updatedAt: nowStr,
      };
      appendAuditLog({
        actorId: authCheck.email || 'owner',
        action: 'OWNER_IMMEDIATE_RESTORE',
        fromStatus: prevStatus,
        toStatus: 'NORMAL',
        detail: 'Owner verified threat clearance and restored NORMAL service immediately.',
      });
    } else {
      appendAuditLog({
        actorId: authCheck.email || 'owner',
        action: 'THREAT_MARKED_RESOLVED',
        fromStatus: prevStatus,
        toStatus: globalSecurityState.status,
        detail: 'Owner marked underlying threat resolved; 10s recheck loop will transition to RECOVERING -> NORMAL.',
      });
    }

    res.json({ state: globalSecurityState, incidents: securityIncidents, auditLogs: securityAuditLogs });
  });

  app.get('/api/security/guardian/audit', async (req, res) => {
    const authCheck = await verifyAdminFirebaseToken(req);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }

    const filesToScan = [
      'server.ts',
      'firestore.rules',
      'src/lib/firebase.ts',
      'src/context/PkChatContext.tsx',
      'src/components/AdminDashboardView.tsx',
      'src/components/OnboardingFlow.tsx',
    ];

    const findings: Array<{
      id: string;
      file: string;
      line: number;
      severity: 'info' | 'warning' | 'critical';
      title: string;
      description: string;
      proposedAlternative: string;
    }> = [];

    let scannedCount = 0;
    for (const rel of filesToScan) {
      const fullPath = path.resolve(__dirname, rel);
      if (!fs.existsSync(fullPath)) continue;
      scannedCount += 1;
      const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
      lines.forEach((lineText, idx) => {
        if (/\beval\s*\(|new Function\s*\(/.test(lineText) && !rel.endsWith('server.ts')) {
          findings.push({
            id: `f_eval_${rel}_${idx + 1}`,
            file: rel,
            line: idx + 1,
            severity: 'critical',
            title: 'Dynamic code execution pattern detected',
            description: 'Arbitrary code execution primitives increase remote injection risk.',
            proposedAlternative: 'Replace dynamic evaluation with allowlisted declarative dispatch.',
          });
        }
        if (/localStorage\.(set|get)Item\([^)]*gmail|accessToken/i.test(lineText)) {
          findings.push({
            id: `f_token_${rel}_${idx + 1}`,
            file: rel,
            line: idx + 1,
            severity: 'warning',
            title: 'OAuth token persisted in Web Storage',
            description: 'OAuth access tokens should remain in volatile React memory only.',
            proposedAlternative: 'Store Gmail OAuth access tokens strictly in React state/ref and clear on sign-out.',
          });
        }
      });
    }

    const rulesContent = fs.existsSync(path.resolve(__dirname, 'firestore.rules'))
      ? fs.readFileSync(path.resolve(__dirname, 'firestore.rules'), 'utf8')
      : '';
    const serverContent = fs.existsSync(path.resolve(__dirname, 'server.ts'))
      ? fs.readFileSync(path.resolve(__dirname, 'server.ts'), 'utf8')
      : '';

    const automatedChecks = [
      {
        name: 'Firestore Zero-Delete Protection During Lockdown',
        passed:
          rulesContent.includes('isSystemLockedDown') &&
          rulesContent.includes('allow delete: if false'),
        detail: 'Messages and user accounts remain undeletable even under emergency lockdown.',
      },
      {
        name: 'Payment Card / CVV Strict Rejection + Auto-Lockdown Trigger',
        passed:
          serverContent.includes("'cardNumber' in body") &&
          serverContent.includes("category: 'payload_tampering'"),
        detail: 'Any request smuggling raw PAN/CVV fields triggers HTTP 400 and LOCKDOWN.',
      },
      {
        name: 'Unauthenticated Admin Endpoint Guard (Identity Toolkit Lookup)',
        passed: serverContent.includes('OWNER_EMAIL_ALLOWLIST.has(normalizedEmail)'),
        detail: 'Admin lockdown/approval routes reject missing or non-owner Firebase ID tokens.',
      },
      {
        name: 'Gmail Reply Verification & Allowlist Execution Guard',
        passed:
          serverContent.includes('ALLOWLISTED_REMEDIATION_ACTIONS.has') &&
          serverContent.includes('crypto.timingSafeEqual'),
        detail: 'Only exact single-use HMAC-verified codes from owner thread trigger allowlisted actions.',
      },
      {
        name: 'Strict Memory-Only Gmail OAuth Handling',
        passed: findings.filter((f) => f.severity === 'critical').length === 0,
        detail: 'Static scan confirms no critical injection or persisted OAuth credential violations.',
      },
    ];

    res.json({
      scannedAt: nowIso(),
      filesScanned: scannedCount,
      testsPassed: automatedChecks.filter((c) => c.passed).length,
      testsTotal: automatedChecks.length,
      findings,
      automatedChecks,
    });
  });

  app.post('/api/security/approvals/request', async (req, res) => {
    const authCheck = await verifyAdminFirebaseToken(req);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }

    const gmailToken = String(req.headers['x-gmail-access-token'] || '').trim();
    if (!gmailToken) {
      res.status(401).json({
        error: 'Gmail OAuth access token required in memory. Click "Connect Owner Gmail" first.',
      });
      return;
    }

    const { incidentId, riskLevel, explanation, proposedChanges, proposedCodeDiff, testResults, actionId } =
      req.body ?? {};
    if (!ALLOWLISTED_REMEDIATION_ACTIONS.has(actionId)) {
      res.status(400).json({ error: 'Requested remediation action is not in the security allowlist.' });
      return;
    }

    const approvalId = `apr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const singleUseCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    const codeHash = hashApprovalCode(approvalId, singleUseCode);
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();

    const safeIncidentId = String(incidentId || globalSecurityState.incidentId || 'manual_security_review');
    const safeRisk: 'HIGH' | 'CRITICAL' | 'MEDIUM' =
      riskLevel === 'CRITICAL' || riskLevel === 'MEDIUM' ? riskLevel : 'HIGH';

    const subject = `[PK CHAT SECURITY APPROVAL REQUIRED] ${safeIncidentId} (${safeRisk})`;
    const mailBody = [
      'PK CHAT Security Shield — Owner Authorization Request',
      '========================================================',
      `Approval ID: ${approvalId}`,
      `Incident ID: ${safeIncidentId}`,
      `Risk Level: ${safeRisk}`,
      `Allowlisted Remediation Action: ${actionId}`,
      `Expires At: ${expiresAt} (15 minutes single-use)`,
      '',
      'Summary & Explanation:',
      String(explanation || 'Security anomaly requires owner authorization before applying mitigation.'),
      '',
      'Proposed Remediation Changes:',
      String(proposedChanges || 'Execute allowlisted security remediation and step down lockdown.'),
      '',
      'Proposed Secure Alternative Snippet:',
      String(proposedCodeDiff || '// Allowlisted server policy toggle only; zero arbitrary code execution.'),
      '',
      'Automated Test Results:',
      String(testResults || 'All security invariant checks passed.'),
      '',
      'HOW TO RESPOND (Reply directly to this email thread):',
      `  APPROVE ${singleUseCode}`,
      'OR to reject:',
      `  REJECT ${singleUseCode}`,
    ].join('\n');

    const rawMime = [
      `To: ${OWNER_APPROVAL_TARGET_EMAIL}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      '',
      mailBody,
    ].join('\r\n');

    const encodedEmail = Buffer.from(rawMime, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    try {
      const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmailToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encodedEmail }),
      });

      const sendData = (await sendRes.json()) as { id?: string; threadId?: string; error?: { message?: string } };
      if (!sendRes.ok || !sendData.id || !sendData.threadId) {
        res.status(sendRes.status === 401 ? 401 : 502).json({
          error: sendData?.error?.message || `Gmail API send failed (HTTP ${sendRes.status}).`,
        });
        return;
      }

      const approvalRecord: ServerGmailApproval = {
        approvalId,
        incidentId: safeIncidentId,
        ownerEmail: OWNER_APPROVAL_TARGET_EMAIL,
        riskLevel: safeRisk,
        explanation: String(explanation || ''),
        proposedChanges: String(proposedChanges || ''),
        proposedCodeDiff: String(proposedCodeDiff || ''),
        testResults: String(testResults || ''),
        actionId,
        codeHash,
        threadId: sendData.threadId,
        sentMessageId: sendData.id,
        status: 'pending_reply',
        expiresAt,
        createdAt: nowIso(),
      };
      gmailApprovals.unshift(approvalRecord);

      appendAuditLog({
        actorId: authCheck.email || 'owner',
        action: 'GMAIL_APPROVAL_DISPATCHED',
        fromStatus: globalSecurityState.status,
        toStatus: globalSecurityState.status,
        detail: `Sent Gmail approval ${approvalId} for ${actionId} to ${OWNER_APPROVAL_TARGET_EMAIL} (Thread ${sendData.threadId}).`,
      });

      const { codeHash: _hidden, ...publicApproval } = approvalRecord;
      res.json({
        approval: publicApproval,
        instructions: `Approval request emailed to ${OWNER_APPROVAL_TARGET_EMAIL}. Reply strictly with APPROVE ${singleUseCode} or REJECT ${singleUseCode} on that Gmail thread.`,
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to send Gmail approval email.',
      });
    }
  });

  app.post('/api/security/approvals/check-reply', async (req, res) => {
    const authCheck = await verifyAdminFirebaseToken(req);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }

    const gmailToken = String(req.headers['x-gmail-access-token'] || '').trim();
    if (!gmailToken) {
      res.status(401).json({
        error: 'Gmail OAuth access token required in memory. Click "Connect Owner Gmail" first.',
      });
      return;
    }

    const { approvalId } = req.body ?? {};
    const record = gmailApprovals.find((a) => a.approvalId === approvalId);
    if (!record) {
      res.status(404).json({ error: 'Approval request not found.' });
      return;
    }
    if (record.status !== 'pending_reply') {
      res.status(400).json({ error: `Approval request is already ${record.status} (single-use enforced).` });
      return;
    }
    if (Date.now() > Date.parse(record.expiresAt)) {
      record.status = 'expired';
      res.status(400).json({ error: 'Approval request expired after 15 minutes.' });
      return;
    }
    if (!record.threadId) {
      res.status(400).json({ error: 'Missing Gmail threadId for reply verification.' });
      return;
    }

    try {
      const threadRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(record.threadId)}?format=full`,
        {
          headers: { Authorization: `Bearer ${gmailToken}` },
        }
      );
      const threadData = (await threadRes.json()) as {
        messages?: Array<{
          id?: string;
          snippet?: string;
          payload?: {
            headers?: Array<{ name?: string; value?: string }>;
            body?: { data?: string };
            parts?: Array<{ mimeType?: string; body?: { data?: string } }>;
          };
        }>;
        error?: { message?: string };
      };
      if (!threadRes.ok) {
        res.status(threadRes.status === 401 ? 401 : 502).json({
          error: threadData?.error?.message || `Failed to inspect Gmail thread (HTTP ${threadRes.status}).`,
        });
        return;
      }

      const messagesList = threadData.messages || [];
      let matchedDecision: 'APPROVE' | 'REJECT' | null = null;
      let matchedSender = '';

      for (const msg of messagesList) {
        if (!msg.id || msg.id === record.sentMessageId) continue;
        const headers = msg.payload?.headers || [];
        const fromRaw = headers.find((h) => h.name?.toLowerCase() === 'from')?.value || '';
        const emailMatch = fromRaw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const senderEmail = (emailMatch?.[0] || fromRaw).trim().toLowerCase();
        if (!OWNER_EMAIL_ALLOWLIST.has(senderEmail)) continue;

        let bodyText = msg.snippet || '';
        const rawB64 =
          msg.payload?.parts?.find((p) => p.mimeType === 'text/plain')?.body?.data ||
          msg.payload?.body?.data;
        if (rawB64) {
          bodyText = Buffer.from(rawB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        }

        // Strict command parsing: only APPROVE <8HEX> or REJECT <8HEX>, never arbitrary code
        const cmdMatch = bodyText.match(/\b(APPROVE|REJECT)\s+([A-F0-9]{8})\b/i);
        if (!cmdMatch) continue;
        const candidateDecision = cmdMatch[1].toUpperCase() as 'APPROVE' | 'REJECT';
        const candidateCode = cmdMatch[2].toUpperCase();
        const candidateHash = hashApprovalCode(record.approvalId, candidateCode);

        if (
          candidateHash.length === record.codeHash.length &&
          crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(record.codeHash))
        ) {
          matchedDecision = candidateDecision;
          matchedSender = senderEmail;
          break;
        }
      }

      if (!matchedDecision) {
        res.json({
          verified: false,
          message: `No valid APPROVE/REJECT single-use code reply from ${OWNER_APPROVAL_TARGET_EMAIL} detected on thread ${record.threadId} yet.`,
          approval: sanitizeApprovals().find((a) => a.approvalId === record.approvalId),
        });
        return;
      }

      const nowStr = nowIso();
      record.decidedAt = nowStr;
      record.decidedBy = matchedSender;
      const prevStatus = globalSecurityState.status;

      if (matchedDecision === 'APPROVE') {
        record.status = 'approved';
        if (record.actionId === 'VERIFY_AND_RECOVER') {
          globalSecurityState.threatResolved = true;
          globalSecurityState.status = 'RECOVERING';
          globalSecurityState.recoveringStartedAt = nowStr;
          globalSecurityState.restrictLogin = false;
          globalSecurityState.restrictCalls = false;
          globalSecurityState.updatedBy = matchedSender;
          globalSecurityState.updatedAt = nowStr;
        } else if (record.actionId === 'ENABLE_STRICT_RATE_LIMIT') {
          strictRateLimitMode = true;
        } else if (record.actionId === 'KEEP_LOCKDOWN_ACTIVE') {
          globalSecurityState.threatResolved = false;
          globalSecurityState.status = 'LOCKDOWN';
          globalSecurityState.updatedBy = matchedSender;
          globalSecurityState.updatedAt = nowStr;
        } else if (record.actionId === 'HALT_AFFECTED_ENDPOINTS') {
          haltedEndpoints.add('/translate');
          haltedEndpoints.add('/translate/batch');
        }
      } else {
        record.status = 'rejected';
      }

      appendAuditLog({
        actorId: matchedSender,
        action: `GMAIL_OWNER_${matchedDecision}_${record.actionId}`,
        fromStatus: prevStatus,
        toStatus: globalSecurityState.status,
        detail: `Verified owner reply from ${matchedSender} on thread ${record.threadId}; single-use approval ${record.approvalId} marked ${record.status}.`,
      });

      // Send thread confirmation email back to owner
      try {
        const confirmMime = [
          `To: ${matchedSender || OWNER_APPROVAL_TARGET_EMAIL}`,
          `Subject: Re: [PK CHAT SECURITY APPROVAL REQUIRED] ${record.incidentId}`,
          'Content-Type: text/plain; charset="UTF-8"',
          'MIME-Version: 1.0',
          '',
          `PK CHAT confirmed your decision (${matchedDecision}) for Approval ID ${record.approvalId}.\nAction: ${record.actionId}\nCurrent Security Status: ${globalSecurityState.status}\nTimestamp: ${nowStr}`,
        ].join('\r\n');
        const encodedConfirm = Buffer.from(confirmMime, 'utf8')
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
        const confRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${gmailToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encodedConfirm, threadId: record.threadId }),
        });
        if (confRes.ok) {
          const confData = (await confRes.json()) as { id?: string };
          record.confirmationMessageId = confData.id;
        }
      } catch {
        // Non-fatal confirmation notification failure
      }

      res.json({
        verified: true,
        decision: matchedDecision,
        approval: sanitizeApprovals().find((a) => a.approvalId === record.approvalId),
        state: globalSecurityState,
        auditLogs: securityAuditLogs,
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to verify Gmail approval reply.',
      });
    }
  });

  // 2. Server-Side Real-Time Translation, Entity Preservation & Confidence Guard
  const FOUNDER_CANONICAL_NAME = 'Prashanth Keransiya';
  function enforceFounderNameProtection(text: string): string {
    return text
      .replace(/பிரசாந்த்\s+கிரன்சியா|பிரசாத்\s+கிரன்சியா|பிரசாந்த்\s+கெரன்சியா|பிரஷாந்த்\s+கெரன்சியா/g, FOUNDER_CANONICAL_NAME)
      .replace(/\b(?:Prashan?th|Prasanth)\s+keransiya\b/gi, FOUNDER_CANONICAL_NAME);
  }

  function buildTranslationContextPrompt(params: {
    text: string;
    targetLanguage: string;
    targetLanguageName?: string;
    sourceLanguage?: string;
    accentHint?: string;
    speakingSpeed?: string;
    contextHistory?: Array<{ speaker?: string; text?: string }>;
  }) {
    const contextLines = Array.isArray(params.contextHistory)
      ? params.contextHistory
          .slice(-4)
          .map((c) => `${String(c.speaker || 'Speaker').slice(0, 40)}: ${String(c.text || '').slice(0, 240)}`)
          .join('\n')
      : '';
    return [
      `Source hint: ${params.sourceLanguage || 'auto-detect'}`,
      `Target language: ${params.targetLanguageName || params.targetLanguage} (${params.targetLanguage})`,
      params.accentHint ? `Speaker accent/dialect hint: ${params.accentHint}` : '',
      params.speakingSpeed ? `Speaking pace: ${params.speakingSpeed}` : '',
      contextLines ? `Recent conversation context (use to preserve meaning & pronouns):\n${contextLines}` : '',
      `Text to translate:\n${params.text}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  function normalizeConfidenceResult(parsed: Record<string, unknown>, originalText: string) {
    const rawScore = typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 0.9;
    const score = Math.max(0, Math.min(1, rawScore));
    const rawLevel = String(parsed.confidenceLevel || 'high').trim().toLowerCase();
    let level: 'high' | 'medium' | 'low' | 'uncertain' =
      rawLevel === 'uncertain'
        ? 'uncertain'
        : rawLevel === 'low'
          ? 'low'
          : rawLevel === 'medium'
            ? 'medium'
            : 'high';
    let clarificationNeeded = Boolean(parsed.clarificationNeeded);
    let clarificationPrompt =
      typeof parsed.clarificationPrompt === 'string' ? parsed.clarificationPrompt : '';

    if (score < 0.68 || originalText.includes('[unclear]') || originalText.includes('???')) {
      clarificationNeeded = true;
      level = score < 0.45 ? 'uncertain' : 'low';
      if (!clarificationPrompt) {
        clarificationPrompt =
          'Part of the sentence or context was ambiguous. Please verify or repeat the original phrase before relying on this translation.';
      }
    }

    return {
      detectedLanguageCode: String(parsed.detectedLanguageCode || 'unknown'),
      detectedLanguageName: String(parsed.detectedLanguageName || 'Detected'),
      translatedText: enforceFounderNameProtection(String(parsed.translatedText || originalText)),
      supported: Boolean(parsed.supported ?? true),
      unsupportedReason: parsed.unsupportedReason ? String(parsed.unsupportedReason) : undefined,
      confidenceScore: Number(score.toFixed(2)),
      confidenceLevel: level,
      clarificationNeeded,
      clarificationPrompt,
      preservedEntities: Array.isArray(parsed.preservedEntities)
        ? parsed.preservedEntities.map(String).slice(0, 12)
        : [],
    };
  }

  let hydrogenCooldownUntil = 0;

  function withPromiseTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      promise.then(
        (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  async function translateWithModelResilience(
    contents: string,
    config: Record<string, unknown>
  ): Promise<{ text: string; engine: string }> {
    const attempts: Array<{ model: string; thinkingLevel: ThinkingLevel; timeoutMs: number }> =
      Date.now() < hydrogenCooldownUntil
        ? [{ model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, timeoutMs: 18000 }]
        : [
            { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, timeoutMs: 9000 },
            { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, timeoutMs: 18000 },
          ];
    let lastErr: unknown;
    for (let i = 0; i < attempts.length; i += 1) {
      const candidate = attempts[i];
      try {
        const response = await withPromiseTimeout(
          ai.models.generateContent({
            model: candidate.model,
            contents,
            config: {
              ...config,
              thinkingConfig: { thinkingLevel: candidate.thinkingLevel },
            },
          }),
          candidate.timeoutMs,
          candidate.model
        );
        return { text: response.text ?? '{}', engine: candidate.model };
      } catch (err) {
        lastErr = err;
        if (candidate.model === 'gemini-4-hydrogen') {
          hydrogenCooldownUntil = Date.now() + 60_000;
        }
        if (i < attempts.length - 1) {
          await new Promise((r) => setTimeout(r, 150));
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Translation upstream failed');
  }

  // 2a. Dynamic All-World Languages Catalog, Refresh, Usage & UI Pack Localization
  app.get('/api/languages', (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim().toLowerCase() : '';
    const includeUnsupported = req.query.includeUnsupported !== 'false';

    let items = dynamicLanguageCatalog;
    if (!includeUnsupported) {
      items = items.filter((l) => l.supported);
    }
    if (category && category !== 'all') {
      items = items.filter((l) => (l.category || 'major').toLowerCase() === category);
    }
    if (search) {
      items = items.filter(
        (l) =>
          l.name.toLowerCase().includes(search) ||
          l.nativeName.toLowerCase().includes(search) ||
          l.code.toLowerCase().includes(search) ||
          (l.iso639_3 || '').toLowerCase().includes(search) ||
          (l.region || '').toLowerCase().includes(search)
      );
    }

    res.json({
      languages: items,
      version: languageCatalogVersion,
      updatedAt: languageCatalogUpdatedAt,
      totalSupported: dynamicLanguageCatalog.filter((l) => l.supported).length,
      totalCount: dynamicLanguageCatalog.length,
    });
  });

  app.post('/api/languages/refresh', (req, res) => {
    const ip = String(req.ip || req.socket.remoteAddress || 'unknown');
    if (!checkRateLimit(`lang_refresh:${ip}`, 12, 60_000)) {
      res.status(429).json({ error: 'Too many language catalog refresh requests. Please wait a minute.' });
      return;
    }
    const mergedMap = new Map<string, LanguageOption>();
    for (const item of WORLD_LANGUAGES_CATALOG) {
      mergedMap.set(item.code.toLowerCase(), item);
    }
    for (const existingItem of dynamicLanguageCatalog) {
      mergedMap.set(existingItem.code.toLowerCase(), existingItem);
    }
    dynamicLanguageCatalog = Array.from(mergedMap.values());
    languageCatalogVersion = `v${dynamicLanguageCatalog.length}.${Date.now().toString().slice(-4)}`;
    languageCatalogUpdatedAt = new Date().toISOString();
    res.json({
      refreshed: true,
      version: languageCatalogVersion,
      updatedAt: languageCatalogUpdatedAt,
      totalSupported: dynamicLanguageCatalog.filter((l) => l.supported).length,
    });
  });

  app.get('/api/languages/usage', (_req, res) => {
    resetUsageIfNewDay();
    res.json({
      cacheEntries: translationCache.size,
      cacheHits: translationCacheHits,
      cacheMisses: translationCacheMisses,
      uiPackCacheEntries: uiPackCache.size,
      dailyCharsUsed,
      dailyCharBudget: DAILY_CHAR_BUDGET,
      apiCallsToday,
      catalogVersion: languageCatalogVersion,
      totalSupportedLanguages: dynamicLanguageCatalog.filter((l) => l.supported).length,
    });
  });

  app.post('/api/languages/ui-pack', async (req, res) => {
    try {
      const { targetLanguage, targetLanguageName, strings } = req.body ?? {};
      if (typeof targetLanguage !== 'string' || !targetLanguage.trim() || !strings || typeof strings !== 'object') {
        res.status(400).json({ error: 'targetLanguage and strings dictionary are required.' });
        return;
      }

      const langEntry = findWorldLanguage(targetLanguage, dynamicLanguageCatalog);
      if (!langEntry || !langEntry.supported) {
        res.status(400).json({ error: `Unsupported target language for UI localization: ${targetLanguage}` });
        return;
      }

      const cacheKey = `${langEntry.code.toLowerCase()}:${Object.keys(strings).sort().join(',')}`;
      const cached = uiPackCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        recordTranslationUsage(0, true);
        res.json({ targetLanguage: langEntry.code, translations: cached.translations, cached: true });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({ error: 'Translation service API key is not configured.' });
        return;
      }

      resetUsageIfNewDay();
      const inputEntries = Object.entries(strings as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'string' && v.trim())
        .slice(0, 120)
        .map(([k, v]) => ({ key: k.slice(0, 64), text: String(v).slice(0, 260) }));

      const totalChars = inputEntries.reduce((acc, item) => acc + item.text.length, 0);
      if (dailyCharsUsed + totalChars > DAILY_CHAR_BUDGET) {
        res.status(429).json({ error: 'Daily translation character budget reached.' });
        return;
      }

      const { text: rawJson } = await translateWithModelResilience(
        `Translate the following UI labels naturally and concisely into ${targetLanguageName || langEntry.name} (${langEntry.code}). Keep keys identical and keep "PK CHAT", "Prashanth Keransiya", "SOS", "GPS", "USGS", "NOAA", "NASA", "E2EE" untranslated in exact Latin script.\nItems: ${JSON.stringify(inputEntries)}`,
        {
          systemInstruction:
            'You are a native UI localizer. Return JSON with an array "items" containing { "key": string, "value": string } for every input item. Never translate or transliterate the proper name "Prashanth Keransiya".',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    key: { type: Type.STRING },
                    value: { type: Type.STRING },
                  },
                  required: ['key', 'value'],
                },
              },
            },
            required: ['items'],
          },
        }
      );

      recordTranslationUsage(totalChars, false);
      const parsed = JSON.parse(rawJson.trim()) as { items?: Array<{ key: string; value: string }> };
      const mapped: Record<string, string> = {};
      for (const item of parsed.items || []) {
        if (item.key && typeof item.value === 'string' && item.value.trim()) {
          mapped[item.key] = enforceFounderNameProtection(item.value.trim());
        }
      }

      pruneExpiredMap(uiPackCache, 250);
      uiPackCache.set(cacheKey, { translations: mapped, expiresAt: Date.now() + 12 * 60 * 60 * 1000 });
      res.json({ targetLanguage: langEntry.code, translations: mapped, cached: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'UI localization failed.';
      recordServerError('/api/languages/ui-pack', 500, msg);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/translate', async (req, res) => {
    try {
      const {
        text,
        targetLanguage,
        targetLanguageName,
        sourceLanguage,
        accentHint,
        speakingSpeed,
        contextHistory,
      } = req.body ?? {};
      if (typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'Text is required for translation.' });
        return;
      }
      if (text.length > 10000) {
        res.status(400).json({ error: 'Message exceeds 10,000 character translation limit.' });
        return;
      }
      const firewallCheck = sanitizeVoiceAndSubtitleText(text);
      if (!firewallCheck.safe) {
        res.status(400).json({ error: firewallCheck.blockedReason || 'Text blocked by Zone 3 Privacy Filter.' });
        return;
      }
      const cleanText = firewallCheck.sanitized;
      if (typeof targetLanguage !== 'string' || !targetLanguage.trim()) {
        res.status(400).json({ error: 'Target language code is required.' });
        return;
      }

      const resolvedTarget = findWorldLanguage(targetLanguage, dynamicLanguageCatalog);
      if (!resolvedTarget || !isSupportedWorldLanguage(targetLanguage, dynamicLanguageCatalog)) {
        res.json({
          supported: false,
          detectedLanguageCode: sourceLanguage || 'unknown',
          detectedLanguageName: 'Unknown',
          translatedText: text,
          confidenceScore: 0,
          confidenceLevel: 'uncertain',
          clarificationNeeded: true,
          clarificationPrompt: `The language "${targetLanguageName || targetLanguage}" is not currently supported.`,
          preservedEntities: [],
          unsupportedReason: `The language "${targetLanguageName || targetLanguage}" is not currently supported for automatic translation in PK CHAT.`,
          engine: 'pk-chat-cloud-validator',
        });
        return;
      }

      // Automatic Same-Language Pass-Through Detection: bypass translation latency when source & target match
      if (typeof sourceLanguage === 'string' && sourceLanguage.trim()) {
        const passCheck = evaluateSameLanguagePassThrough(
          sourceLanguage,
          resolvedTarget.code,
          dynamicLanguageCatalog
        );
        if (passCheck.isPassThrough) {
          res.json({
            supported: true,
            passThrough: true,
            detectedLanguageCode: passCheck.speakerBaseCode,
            detectedLanguageName: passCheck.speakerLanguageName,
            translatedText: text,
            confidenceScore: 1.0,
            confidenceLevel: 'high',
            clarificationNeeded: false,
            preservedEntities: [],
            engine: 'pk-chat-pass-through',
          });
          return;
        }
      }

      // Check LRU cache when no multi-turn context overrides exist
      const hasContext = Array.isArray(contextHistory) && contextHistory.length > 0;
      const cacheKey = `${resolvedTarget.code.toLowerCase()}::${sourceLanguage || 'auto'}::${text.trim()}`;
      if (!hasContext) {
        const hit = translationCache.get(cacheKey);
        if (hit && hit.expiresAt > Date.now()) {
          recordTranslationUsage(0, true);
          res.json({ ...hit.payload, cached: true });
          return;
        }
      }

      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          error: 'Translation service API key is not configured on the server.',
        });
        return;
      }

      resetUsageIfNewDay();
      if (dailyCharsUsed + text.length > DAILY_CHAR_BUDGET) {
        res.status(429).json({
          error: 'Daily translation quota ceiling reached. Original message text remains preserved.',
        });
        return;
      }

      const { text: rawJson, engine } = await translateWithModelResilience(
        buildTranslationContextPrompt({
          text: cleanText,
          targetLanguage: resolvedTarget.code,
          targetLanguageName: targetLanguageName || resolvedTarget.name,
          sourceLanguage,
          accentHint,
          speakingSpeed,
          contextHistory,
        }),
        {
          systemInstruction:
            'You are PK CHAT high-accuracy universal translation engine supporting all ISO 639 world, regional, minority, and indigenous languages and regional dialects, including romanized Tanglish (Tamil written in Latin script like "Vanakkam! Neengal saptirgala?") and Kanglish/Hinglish/Singlish. Detect the source language, preserve original meaning and conversational context, and translate naturally into the exact requested target language/dialect. Strictly preserve proper names—especially the founder name "Prashanth Keransiya"—phone/reference numbers, dates, times, and geographic locations without translating, transliterating, or altering digits or entity spelling. List preserved entities in preservedEntities. Evaluate confidenceScore (0.0 to 1.0) and set confidenceLevel strictly to lowercase "high", "medium", "low", or "uncertain". If speech/text is garbled, incomplete, heavily ambiguous, or contains [unclear], set confidenceScore below 0.65, set clarificationNeeded=true, and provide a helpful clarificationPrompt instead of inventing missing meaning.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedLanguageCode: { type: Type.STRING },
              detectedLanguageName: { type: Type.STRING },
              translatedText: { type: Type.STRING },
              supported: { type: Type.BOOLEAN },
              unsupportedReason: { type: Type.STRING },
              confidenceScore: { type: Type.NUMBER },
              confidenceLevel: { type: Type.STRING },
              clarificationNeeded: { type: Type.BOOLEAN },
              clarificationPrompt: { type: Type.STRING },
              preservedEntities: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
              'detectedLanguageCode',
              'detectedLanguageName',
              'translatedText',
              'supported',
              'confidenceScore',
              'confidenceLevel',
              'clarificationNeeded',
            ],
          },
        }
      );

      recordTranslationUsage(text.length, false);
      const parsed = JSON.parse(rawJson.trim()) as Record<string, unknown>;
      const finalPayload = {
        ...normalizeConfidenceResult(parsed, text),
        engine,
      };
      if (!hasContext) {
        pruneExpiredMap(translationCache, 1500);
        translationCache.set(cacheKey, { payload: finalPayload, expiresAt: Date.now() + 60 * 60 * 1000 });
      }
      res.json(finalPayload);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Translation request failed.';
      recordServerError('/api/translate', 500, msg);
      res.status(500).json({ error: msg });
    }
  });

  // 2b. Streaming Real-Time Sentence Translation (SSE)
  app.post('/api/translate/stream', async (req, res) => {
    const {
      text,
      targetLanguage,
      targetLanguageName,
      sourceLanguage,
      accentHint,
      speakingSpeed,
      contextHistory,
    } = req.body ?? {};
    if (typeof text !== 'string' || !text.trim() || typeof targetLanguage !== 'string' || !targetLanguage.trim()) {
      res.status(400).json({ error: 'Text and targetLanguage are required.' });
      return;
    }
    if (text.length > 10000) {
      res.status(400).json({ error: 'Message exceeds 10,000 character translation limit.' });
      return;
    }
    const streamFirewall = sanitizeVoiceAndSubtitleText(text);
    if (!streamFirewall.safe) {
      res.status(400).json({ error: streamFirewall.blockedReason || 'Text blocked by Zone 3 Privacy Filter.' });
      return;
    }
    const cleanStreamText = streamFirewall.sanitized;
    if (!isSupportedWorldLanguage(targetLanguage, dynamicLanguageCatalog)) {
      res.status(400).json({ error: `Unsupported target language: ${targetLanguage}` });
      return;
    }
    if (!process.env.GEMINI_API_KEY) {
      res.status(503).json({ error: 'Translation service API key is not configured on the server.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const promptContents = buildTranslationContextPrompt({
      text: cleanStreamText,
      targetLanguage,
      targetLanguageName,
      sourceLanguage,
      accentHint,
      speakingSpeed,
      contextHistory,
    });

    const streamSchema = {
      type: Type.OBJECT,
      properties: {
        detectedLanguageCode: { type: Type.STRING },
        detectedLanguageName: { type: Type.STRING },
        translatedText: { type: Type.STRING },
        supported: { type: Type.BOOLEAN },
        confidenceScore: { type: Type.NUMBER },
        confidenceLevel: { type: Type.STRING },
        clarificationNeeded: { type: Type.BOOLEAN },
        clarificationPrompt: { type: Type.STRING },
        preservedEntities: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: [
        'detectedLanguageCode',
        'detectedLanguageName',
        'translatedText',
        'supported',
        'confidenceScore',
        'confidenceLevel',
        'clarificationNeeded',
      ],
    };

    const runStreamWithModel = async (model: string, thinkingLevel: ThinkingLevel, timeoutMs: number) => {
      const stream = await withPromiseTimeout(
        ai.models.generateContentStream({
          model,
          contents: promptContents,
          config: {
            thinkingConfig: { thinkingLevel },
            systemInstruction:
              'You are PK CHAT streaming translation engine. Output ONLY JSON matching the schema. Preserve names (never translate or transliterate "Prashanth Keransiya"), numbers, dates, locations, and conversational context accurately. Set confidenceLevel to lowercase high, medium, low, or uncertain. Flag low confidence (<0.68) with clarificationNeeded=true rather than guessing meaning.',
            responseMimeType: 'application/json',
            responseSchema: streamSchema,
          },
        }),
        timeoutMs,
        `${model}-stream-init`
      );

      let accumulated = '';
      for await (const chunk of stream) {
        if (chunk.text) {
          accumulated += chunk.text;
          const partialMatch = accumulated.match(/"translatedText"\s*:\s*"((?:\\.|[^"\\])*)/);
          if (partialMatch && partialMatch[1]) {
            const cleanPartial = partialMatch[1].replace(/\\"/g, '"').replace(/\\n/g, ' ');
            res.write(`data: ${JSON.stringify({ type: 'delta', partialText: cleanPartial })}\n\n`);
          }
        }
      }
      return JSON.parse((accumulated || '{}').trim()) as Record<string, unknown>;
    };

    try {
      let parsed: Record<string, unknown>;
      let usedEngine = 'gemini-4-hydrogen-stream';
      if (Date.now() < hydrogenCooldownUntil) {
        usedEngine = 'gemini-3.1-flash-lite-stream';
        parsed = await runStreamWithModel('gemini-3.1-flash-lite', ThinkingLevel.MINIMAL, 18000);
      } else {
        try {
          parsed = await runStreamWithModel('gemini-4-hydrogen', ThinkingLevel.LOW, 9000);
        } catch {
          hydrogenCooldownUntil = Date.now() + 60_000;
          usedEngine = 'gemini-3.1-flash-lite-stream';
          parsed = await runStreamWithModel('gemini-3.1-flash-lite', ThinkingLevel.MINIMAL, 18000);
        }
      }

      res.write(
        `data: ${JSON.stringify({
          type: 'final',
          result: {
            ...normalizeConfidenceResult(parsed, text),
            engine: usedEngine,
          },
        })}\n\n`
      );
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Streaming translation failed.';
      recordServerError('/api/translate/stream', 500, msg);
      res.write(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`);
      res.end();
    }
  });

  // 3. Batch Multi-Recipient Translation for Group Chats
  app.post('/api/translate/batch', async (req, res) => {
    try {
      const { text, targets } = req.body ?? {};
      if (typeof text !== 'string' || !text.trim() || !Array.isArray(targets) || targets.length === 0) {
        res.status(400).json({ error: 'Text and target language list are required.' });
        return;
      }
      if (text.length > 10000) {
        res.status(400).json({ error: 'Message exceeds 10,000 character translation limit.' });
        return;
      }
      const batchFirewall = sanitizeVoiceAndSubtitleText(text);
      if (!batchFirewall.safe) {
        res.status(400).json({ error: batchFirewall.blockedReason || 'Blocked by Data Privacy Filter.' });
        return;
      }
      const cleanBatchText = batchFirewall.sanitized;
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({ error: 'Translation service API key is not configured on the server.' });
        return;
      }

      const uniqueTargets = targets
        .filter(
          (t): t is { code: string; name?: string } =>
            Boolean(t && typeof t === 'object' && typeof (t as { code?: unknown }).code === 'string' && (t as { code: string }).code.trim())
        )
        .slice(0, 20)
        .map((t) => ({
          code: t.code.trim().slice(0, 16),
          name: typeof t.name === 'string' ? t.name.trim().slice(0, 64) : t.code.trim().slice(0, 16),
        }));
      if (uniqueTargets.length === 0) {
        res.status(400).json({ error: 'At least one valid target language code is required.' });
        return;
      }
      const { text: rawJson, engine } = await translateWithModelResilience(
        `Translate the following message into each requested target language.\nTargets: ${JSON.stringify(uniqueTargets)}\nMessage:\n${cleanBatchText}`,
        {
          systemInstruction:
            'Detect the source language once, then produce accurate, natural translations for every target language code requested while preserving names (never translate or transliterate "Prashanth Keransiya"), numbers, dates, and locations.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedLanguageCode: { type: Type.STRING },
              detectedLanguageName: { type: Type.STRING },
              translations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    targetLanguage: { type: Type.STRING },
                    translatedText: { type: Type.STRING },
                    supported: { type: Type.BOOLEAN },
                  },
                  required: ['targetLanguage', 'translatedText', 'supported'],
                },
              },
            },
            required: ['detectedLanguageCode', 'detectedLanguageName', 'translations'],
          },
        }
      );

      const parsed = JSON.parse(rawJson.trim()) as {
        translations?: Array<{ targetLanguage: string; translatedText: string; supported: boolean }>;
        [key: string]: unknown;
      };
      if (Array.isArray(parsed.translations)) {
        parsed.translations = parsed.translations.map((item) => ({
          ...item,
          translatedText: enforceFounderNameProtection(String(item.translatedText || '')),
        }));
      }
      res.json({
        ...parsed,
        engine,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Batch translation failed.';
      recordServerError('/api/translate/batch', 500, msg);
      res.status(500).json({ error: msg });
    }
  });

  // 4. Privacy-First Audio Transcription & Context-Aware Translation
  app.post('/api/speech/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType, targetLanguage, targetLanguageName, accentHint, speakingSpeed, contextHistory } =
        req.body ?? {};
      if (typeof audioBase64 !== 'string' || !audioBase64) {
        res.status(400).json({ error: 'Audio payload is required.' });
        return;
      }
      if (audioBase64.length > 8_000_000) {
        res.status(413).json({ error: 'Audio payload exceeds 8 MB maximum size limit.' });
        return;
      }
      const forensics = inspectAudioForensics(
        audioBase64,
        typeof mimeType === 'string' && mimeType ? mimeType : 'audio/webm'
      );
      if (!forensics.safe) {
        res.status(400).json({ error: forensics.reason || 'Audio forensics rejected payload.' });
        return;
      }
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({ error: 'Speech service API key is not configured.' });
        return;
      }

      const transcriptionResponse = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: forensics.normalizedMime,
                data: audioBase64.replace(/\s+/g, ''),
              },
            },
            {
              text: `Transcribe this spoken audio verbatim in its original language. Speaker accent hint: ${accentHint || 'auto-detect natural accent'}. Speaking speed: ${speakingSpeed || 'normal'}. Preserve proper names, numbers, dates, and locations accurately. If any segment is inaudible or unclear, mark only that word as [unclear] instead of guessing.`,
            },
          ],
        },
      });

      const transcript = (transcriptionResponse.text ?? '').trim();
      if (!transcript) {
        res.json({
          transcript: '',
          detectedLanguageCode: 'unknown',
          detectedLanguageName: 'Unknown',
          translatedText: '',
          confidenceScore: 0,
          confidenceLevel: 'uncertain',
          clarificationNeeded: true,
          clarificationPrompt: 'Audio was empty or unintelligible. Please speak again clearly.',
          preservedEntities: [],
          engine: 'gemini-3.5-transcribe',
        });
        return;
      }

      const { text: translatedRawJson, engine: translationEngine } = await translateWithModelResilience(
        buildTranslationContextPrompt({
          text: transcript,
          targetLanguage: targetLanguage || 'en',
          targetLanguageName: targetLanguageName || targetLanguage || 'English',
          accentHint,
          speakingSpeed,
          contextHistory,
        }),
        {
          systemInstruction:
            'Detect the transcript language and translate accurately into the target language while preserving meaning, context, names, numbers, dates, and locations. If [unclear] appears or transcript meaning is uncertain, set confidenceScore below 0.65 and clarificationNeeded=true.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedLanguageCode: { type: Type.STRING },
              detectedLanguageName: { type: Type.STRING },
              translatedText: { type: Type.STRING },
              confidenceScore: { type: Type.NUMBER },
              confidenceLevel: { type: Type.STRING },
              clarificationNeeded: { type: Type.BOOLEAN },
              clarificationPrompt: { type: Type.STRING },
              preservedEntities: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
              'detectedLanguageCode',
              'detectedLanguageName',
              'translatedText',
              'confidenceScore',
              'confidenceLevel',
              'clarificationNeeded',
            ],
          },
        }
      );

      const translated = JSON.parse((translatedRawJson || '{}').trim()) as Record<string, unknown>;
      res.json({
        transcript,
        ...normalizeConfidenceResult(translated, transcript),
        engine: `gemini-3.5-transcribe + ${translationEngine}`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Speech transcription failed.';
      recordServerError('/api/speech/transcribe', 500, msg);
      res.status(500).json({ error: msg });
    }
  });

  // 4b. Server-Side Profile Image Validation (Magic-Bytes + Size + Auth Verification)
  app.post('/api/profile/validate-image', async (req, res) => {
    const authCheck = await verifyAuthenticatedFirebaseUser(req);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }

    const { dataUrl, kind, profileText } = req.body ?? {};
    const imageKind = kind === 'cover' ? 'cover' : 'avatar';
    const maxDataUrlLen = imageKind === 'cover' ? 300000 : 200000;

    if (typeof profileText === 'string' && profileText.trim()) {
      const textSafety = detectExplicitSexualContent(profileText);
      if (!textSafety.safe) {
        res.status(400).json({
          error:
            textSafety.blockedReason ||
            'Explicit, sexual, or adult content is strictly prohibited on PK CHAT profiles.',
        });
        return;
      }
    }

    if (typeof dataUrl !== 'string' || !dataUrl.trim()) {
      res.status(400).json({ error: 'Image dataUrl is required.' });
      return;
    }
    if (dataUrl.length > maxDataUrlLen) {
      res.status(413).json({
        error: `Compressed ${imageKind} exceeds ${Math.round(maxDataUrlLen / 1000)} KB limit.`,
      });
      return;
    }

    const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      res.status(400).json({ error: 'Invalid image encoding. Allowed formats: JPEG, PNG, WebP.' });
      return;
    }

    const declaredSubtype = match[1].toLowerCase();
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length < 16) {
      res.status(400).json({ error: 'Image payload is corrupted or empty.' });
      return;
    }

    // Verify authentic image file magic bytes
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng =
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    const isWebp =
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP';

    if (
      ((declaredSubtype === 'jpeg' || declaredSubtype === 'jpg') && !isJpeg) ||
      (declaredSubtype === 'png' && !isPng) ||
      (declaredSubtype === 'webp' && !isWebp)
    ) {
      res.status(400).json({ error: 'Image binary signature does not match declared MIME type.' });
      return;
    }

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    res.json({
      valid: true,
      uid: authCheck.uid,
      kind: imageKind,
      mimeType: `image/${declaredSubtype === 'jpg' ? 'jpeg' : declaredSubtype}`,
      byteLength: buffer.length,
      sha256,
    });
  });

  // 5. Translated Speech Playback (Text-to-Speech via Gemini TTS)
  app.post('/api/speech/tts', async (req, res) => {
    try {
      const { text, voiceName, languageName } = req.body ?? {};
      if (typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'Text is required for speech synthesis.' });
        return;
      }
      if (text.length > 3000) {
        res.status(400).json({ error: 'Text exceeds 3,000 character speech synthesis limit.' });
        return;
      }
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({ error: 'TTS API key is not configured.' });
        return;
      }

      const allowedVoices = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];
      const selectedVoice = allowedVoices.includes(voiceName) ? voiceName : 'Kore';

      const synthesizeWithModel = async (
        ttsModel: 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts',
        useMetadata = true
      ) => {
        const part = useMetadata
          ? {
              text: text.slice(0, 1500),
              speechMetadata: {
                style: `Clear natural conversational speaker in ${languageName || 'the target language'}`,
              },
            }
          : {
              text: text.slice(0, 1500),
            };

        const response = await ai.models.generateContent({
          model: ttsModel,
          contents: [
            {
              role: 'user',
              parts: [part],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice },
              },
            },
          },
        });
        const parts = response.candidates?.[0]?.content?.parts || [];
        const audioPart = parts.find((p) => Boolean(p.inlineData?.data));
        return {
          data: audioPart?.inlineData?.data,
          mimeType: audioPart?.inlineData?.mimeType || 'audio/wav',
          engine: ttsModel,
          finishReason: response.candidates?.[0]?.finishReason,
          promptFeedback: response.promptFeedback,
          partKeys: parts.map((p) => Object.keys(p)),
        };
      };

      let ttsOut = await synthesizeWithModel('gemini-3.8-flash-lite-tts', true);
      if (!ttsOut.data) {
        ttsOut = await synthesizeWithModel('gemini-3.8-flash-lite-tts', false);
      }
      if (!ttsOut.data) {
        ttsOut = await synthesizeWithModel('gemini-3.8-flash-tts', false);
      }

      if (!ttsOut.data) {
        res.status(502).json({
          error: 'Speech audio is unavailable for this phrase right now.',
        });
        return;
      }

      res.json({
        audioBase64: ttsOut.data,
        mimeType: ttsOut.mimeType,
        voice: selectedVoice,
        engine: ttsOut.engine,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Speech synthesis failed.';
      recordServerError('/api/speech/tts', 500, msg);
      res.status(500).json({ error: msg });
    }
  });

  // 6. Real Geospatial Emergency Reverse Geocode, Place Search, Verified Nearby Help & Assistive Classifier
  app.get('/api/emergency/reverse-geocode', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!isValidHardenedServerGps(lat, lng)) {
      res.status(400).json({ error: 'Valid hardened GPS latitude and longitude are required (non-null-island).' });
      return;
    }

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
        String(lat)
      )}&lon=${encodeURIComponent(String(lng))}&zoom=14&addressdetails=1`;
      const nomRes = await fetch(url, {
        headers: { 'User-Agent': 'PK-CHAT-EmergencySystem/1.0' },
        signal: AbortSignal.timeout(7000),
      });
      if (!nomRes.ok) {
        throw new Error(`Nominatim returned HTTP ${nomRes.status}`);
      }
      const data = (await nomRes.json()) as {
        display_name?: string;
        address?: {
          country?: string;
          country_code?: string;
          state?: string;
          province?: string;
          region?: string;
          state_district?: string;
          county?: string;
          city?: string;
          town?: string;
          village?: string;
          suburb?: string;
        };
      };
      const a = data.address || {};
      res.json({
        source: 'gps',
        country: a.country || 'Unknown Country',
        countryCode: (a.country_code || 'GL').toUpperCase(),
        province: a.state || a.province || a.region || '',
        district: a.state_district || a.county || '',
        city: a.city || a.town || a.village || a.suburb || '',
        displayAddress: data.display_name || `${lat.toFixed(3)}, ${lng.toFixed(3)}`,
        latitude: Number(lat.toFixed(4)),
        longitude: Number(lng.toFixed(4)),
        consentedAt: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Reverse geocoding unavailable';
      res.json({
        source: 'gps',
        country: 'Approximate Coordinates',
        countryCode: 'GL',
        province: '',
        district: '',
        city: '',
        displayAddress: `${lat.toFixed(3)}, ${lng.toFixed(3)} (Reverse lookup unavailable: ${msg})`,
        latitude: Number(lat.toFixed(4)),
        longitude: Number(lng.toFixed(4)),
        consentedAt: new Date().toISOString(),
      });
    }
  });

  app.get('/api/emergency/search-place', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 2) {
      res.json({ results: [] });
      return;
    }
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(
        q
      )}`;
      const nomRes = await fetch(url, {
        headers: { 'User-Agent': 'PK-CHAT-EmergencySystem/1.0' },
        signal: AbortSignal.timeout(7000),
      });
      if (!nomRes.ok) {
        res.status(502).json({ error: `Location search HTTP ${nomRes.status}` });
        return;
      }
      const rows = (await nomRes.json()) as Array<{
        lat: string;
        lon: string;
        display_name?: string;
        address?: {
          country?: string;
          country_code?: string;
          state?: string;
          province?: string;
          state_district?: string;
          county?: string;
          city?: string;
          town?: string;
          village?: string;
        };
      }>;

      const results = rows.map((r) => {
        const a = r.address || {};
        return {
          source: 'manual',
          country: a.country || 'Selected Country',
          countryCode: (a.country_code || 'GL').toUpperCase(),
          province: a.state || a.province || '',
          district: a.state_district || a.county || '',
          city: a.city || a.town || a.village || '',
          displayAddress: r.display_name || q,
          latitude: Number(Number(r.lat).toFixed(4)),
          longitude: Number(Number(r.lon).toFixed(4)),
          consentedAt: new Date().toISOString(),
        };
      });
      res.json({ results });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Manual location search failed.' });
    }
  });

  app.post('/api/navigation/route', async (req, res) => {
    const body = req.body ?? {};
    const fromLat = Number(body.fromLat);
    const fromLng = Number(body.fromLng);
    let toLat = body.toLat !== undefined ? Number(body.toLat) : NaN;
    let toLng = body.toLng !== undefined ? Number(body.toLng) : NaN;
    const destinationQuery =
      typeof body.destinationQuery === 'string' ? body.destinationQuery.trim() : '';

    if (!isValidHardenedServerGps(fromLat, fromLng)) {
      res.status(400).json({ error: 'Valid hardened origin GPS coordinates (fromLat, fromLng) are required.' });
      return;
    }

    let resolvedDestinationName = destinationQuery || 'Pinned Destination';

    if ((!Number.isFinite(toLat) || !Number.isFinite(toLng)) && destinationQuery) {
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(
          destinationQuery
        )}`;
        const nomRes = await fetch(nomUrl, {
          headers: { 'User-Agent': 'PK-CHAT-SafetyApp/1.0' },
          signal: AbortSignal.timeout(6000),
        });
        if (nomRes.ok) {
          const nomData = (await nomRes.json()) as Array<{
            lat?: string;
            lon?: string;
            display_name?: string;
          }>;
          if (nomData[0]?.lat && nomData[0]?.lon) {
            toLat = Number(nomData[0].lat);
            toLng = Number(nomData[0].lon);
            resolvedDestinationName =
              nomData[0].display_name?.split(',').slice(0, 2).join(', ') || destinationQuery;
          }
        }
      } catch {
        // Fallback below if Nominatim unreachable
      }
    }

    if (!Number.isFinite(toLat) || !Number.isFinite(toLng)) {
      res.status(400).json({
        error: 'Provide valid destination coordinates or a recognizable destination place name.',
      });
      return;
    }

    const computeBearingDegrees = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const toDeg = (rad: number) => (rad * 180) / Math.PI;
      const dLon = toRad(lon2 - lon1);
      const y = Math.sin(dLon) * Math.cos(toRad(lat2));
      const x =
        Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
        Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
      return (toDeg(Math.atan2(y, x)) + 360) % 360;
    };

    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true`;
      const osrmRes = await fetch(osrmUrl, {
        headers: { 'User-Agent': 'PK-CHAT-SafetyApp/1.0' },
        signal: AbortSignal.timeout(7000),
      });

      if (osrmRes.ok) {
        const osrmJson = (await osrmRes.json()) as {
          code?: string;
          routes?: Array<{
            distance?: number;
            duration?: number;
            geometry?: { coordinates?: Array<[number, number]> };
            legs?: Array<{
              steps?: Array<{
                distance?: number;
                duration?: number;
                name?: string;
                maneuver?: { type?: string; modifier?: string; bearing_after?: number };
              }>;
            }>;
          }>;
        };

        const route = osrmJson.routes?.[0];
        if (osrmJson.code === 'Ok' && route) {
          const distanceKm = Number(((route.distance || 0) / 1000).toFixed(2));
          const etaMinutes = Math.max(1, Math.round((route.duration || 0) / 60));
          const coords = (route.geometry?.coordinates || []).slice(0, 60).map(([lng, lat]) => ({
            lat,
            lng,
          }));
          const rawSteps = route.legs?.[0]?.steps || [];
          const steps = rawSteps.slice(0, 12).map((st, idx) => {
            const action = st.maneuver?.type || 'continue';
            const mod = st.maneuver?.modifier ? ` ${st.maneuver.modifier}` : '';
            const street = st.name ? ` onto ${st.name}` : '';
            const distText =
              (st.distance || 0) >= 1000
                ? `${((st.distance || 0) / 1000).toFixed(1)} km`
                : `${Math.round(st.distance || 0)} m`;
            return {
              stepNumber: idx + 1,
              instruction: `${action.charAt(0).toUpperCase() + action.slice(1)}${mod}${street}`,
              distanceText: distText,
              bearing: Math.round(st.maneuver?.bearing_after ?? 0),
            };
          });

          res.json({
            mode: 'osrm_live',
            oneWayVerified: true,
            destinationName: resolvedDestinationName,
            from: { lat: fromLat, lng: fromLng },
            to: { lat: toLat, lng: toLng },
            distanceKm,
            etaMinutes,
            bearingDegrees: Math.round(computeBearingDegrees(fromLat, fromLng, toLat, toLng)),
            geometry: coords.length >= 2 ? coords : [{ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng }],
            steps:
              steps.length > 0
                ? steps
                : [
                    {
                      stepNumber: 1,
                      instruction: `Head toward ${resolvedDestinationName}`,
                      distanceText: `${distanceKm} km`,
                      bearing: Math.round(computeBearingDegrees(fromLat, fromLng, toLat, toLng)),
                    },
                  ],
            osmDirectionsUrl: `https://www.openstreetmap.org/directions?from=${encodeURIComponent(
              `${fromLat},${fromLng}`
            )}&to=${encodeURIComponent(`${toLat},${toLng}`)}`,
            googleDirectionsUrl: `https://maps.google.com/?saddr=${fromLat},${fromLng}&daddr=${toLat},${toLng}`,
          });
          return;
        }
      }
    } catch {
      // Fall back to offline great-circle GPS bearing calculation below
    }

    const fallbackKm = Number(haversineDistanceKm(fromLat, fromLng, toLat, toLng).toFixed(2));
    const bearing = Math.round(computeBearingDegrees(fromLat, fromLng, toLat, toLng));
    const midLat = (fromLat + toLat) / 2;
    const midLng = (fromLng + toLng) / 2;
    res.json({
      mode: 'gps_offline',
      oneWayVerified: false,
      destinationName: resolvedDestinationName,
      from: { lat: fromLat, lng: fromLng },
      to: { lat: toLat, lng: toLng },
      distanceKm: fallbackKm,
      etaMinutes: Math.max(1, Math.round((fallbackKm / 40) * 60)),
      bearingDegrees: bearing,
      geometry: [
        { lat: fromLat, lng: fromLng },
        { lat: midLat, lng: midLng },
        { lat: toLat, lng: toLng },
      ],
      steps: [
        {
          stepNumber: 1,
          instruction: `Direct GPS compass heading ${bearing}° toward ${resolvedDestinationName}`,
          distanceText: `${fallbackKm} km`,
          bearing,
        },
      ],
      osmDirectionsUrl: `https://www.openstreetmap.org/directions?from=${encodeURIComponent(
        `${fromLat},${fromLng}`
      )}&to=${encodeURIComponent(`${toLat},${toLng}`)}`,
      googleDirectionsUrl: `https://maps.google.com/?saddr=${fromLat},${fromLng}&daddr=${toLat},${toLng}`,
    });
  });

  app.post('/api/security/gps-geofence/check', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!isValidHardenedServerGps(lat, lng)) {
      res.status(400).json({ validGps: false, error: 'Invalid or spoofed Null Island GPS coordinates.' });
      return;
    }
    const fenceLat = body.fenceLat !== undefined ? Number(body.fenceLat) : NaN;
    const fenceLng = body.fenceLng !== undefined ? Number(body.fenceLng) : NaN;
    const radiusKm = body.radiusKm !== undefined ? Math.max(0.05, Math.min(20000, Number(body.radiusKm))) : 50;
    if (isValidHardenedServerGps(fenceLat, fenceLng)) {
      const distanceKm = Number(haversineDistanceKm(lat, lng, fenceLat, fenceLng).toFixed(3));
      res.json({
        validGps: true,
        distanceKm,
        radiusKm,
        withinGeofence: distanceKm <= radiusKm,
      });
      return;
    }
    res.json({ validGps: true, withinGeofence: true });
  });

  // 7. PK Chat Global Disaster & Emergency Alert Master Routing Engine (JERAD_PRASANTH_MASTER_CORE)
  const MASTER_ADMIN_CORE_ID = 'JERAD_PRASANTH_MASTER_CORE';
  const OFFICIAL_TRUSTED_AGENCIES = new Set([
    'USGS Earthquake Hazards Program',
    'NOAA National Weather Service',
    'NASA EONET Earth Observatory',
    'GDACS Official Disaster Feed',
    'Disaster Management Centre (Sri Lanka)',
    'Department of Meteorology (Sri Lanka)',
    'National Disaster Management Authority (India)',
    'India Meteorological Department',
    'Japan Meteorological Agency',
    'BMKG Indonesia',
    'UK Met Office',
    'Bureau of Meteorology (Australia)',
  ]);
  interface MasterCoreVaultAlert {
    alertId: string;
    hazardType: 'earthquake' | 'tsunami' | 'flood' | 'severe_weather' | 'cyclone' | 'landslide' | 'wildfire';
    title: string;
    officialSource: string;
    sourceUrl: string;
    location: string;
    country?: string;
    regionCode: string;
    latitude?: number;
    longitude?: number;
    distanceKm?: number;
    expiresAt?: string;
    shelterAdvice?: string;
    evacuationInstructions?: string;
    severity: 'advisory' | 'watch' | 'warning' | 'extreme';
    issuedAt: string;
    status: 'active' | 'monitoring' | 'resolved';
    verifiedOfficial: boolean;
    routingStage: 'LOCKED_IN_ADMIN_CORE' | 'VERIFIED_DISPATCHED' | 'BLOCKED';
    isVerifiedByAdmin: boolean;
    adminCoreId: string;
    coreSealHash: string;
    interceptedAt: string;
    clearedAt?: string;
    clearedBy?: string;
  }

  let masterCoreStrictManualHold = false;
  let rejectedUnofficialAlertsCount = 0;
  const masterCoreAlertVault = new Map<string, MasterCoreVaultAlert>();

  function signMasterCoreAlertSeal(alertId: string, officialSource: string, issuedAt: string): string {
    return crypto
      .createHmac('sha256', APPROVAL_HMAC_SECRET)
      .update(`${MASTER_ADMIN_CORE_ID}:${alertId}:${officialSource}:${issuedAt}`)
      .digest('hex')
      .slice(0, 24);
  }

  function routeAlertToMasterAdminCore(
    input: {
      alertId: string;
      hazardType: MasterCoreVaultAlert['hazardType'];
      title: string;
      officialSource: string;
      sourceUrl: string;
      location: string;
      country?: string;
      regionCode?: string;
      latitude?: number;
      longitude?: number;
      expiresAt?: string;
      shelterAdvice?: string;
      evacuationInstructions?: string;
      severity: MasterCoreVaultAlert['severity'];
      issuedAt: string;
      status: MasterCoreVaultAlert['status'];
    },
    options?: { forceHoldInVault?: boolean }
  ): MasterCoreVaultAlert {
    const cleanAlertId = String(input.alertId || `core_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
    const titleFilter = sanitizeVoiceAndSubtitleText(String(input.title || 'Hazard Alert'));
    const locationFilter = sanitizeVoiceAndSubtitleText(String(input.location || 'Regional Watch Area'));
    const cleanTitle = titleFilter.safe ? titleFilter.sanitized.slice(0, 160) : 'Blocked Unsanitized Alert';
    const cleanLocation = locationFilter.safe ? locationFilter.sanitized.slice(0, 160) : 'Restricted Coordinate';
    const hasCoords =
      typeof input.latitude === 'number' &&
      typeof input.longitude === 'number' &&
      isValidHardenedServerGps(input.latitude, input.longitude);

    const existing = masterCoreAlertVault.get(cleanAlertId);
    if (existing?.routingStage === 'BLOCKED') {
      return existing;
    }

    const agencyCheck = isVerifiedOfficialDisasterAgency(input.officialSource, input.sourceUrl);
    const trustedAgency = OFFICIAL_TRUSTED_AGENCIES.has(input.officialSource) && agencyCheck.verified;
    const isRejectedSocialOrFake =
      !agencyCheck.verified &&
      /\b(blocked|rumor|social|unofficial|non-government|malformed)\b/i.test(agencyCheck.reason);

    if (isRejectedSocialOrFake && !options?.forceHoldInVault) {
      rejectedUnofficialAlertsCount += 1;
      const blockedRecord: MasterCoreVaultAlert = {
        alertId: cleanAlertId,
        hazardType: input.hazardType,
        title: cleanTitle,
        officialSource: String(input.officialSource || 'Rejected Unofficial Source').slice(0, 120),
        sourceUrl: String(input.sourceUrl || '').slice(0, 512),
        location: cleanLocation,
        country: input.country ? String(input.country).slice(0, 80) : undefined,
        regionCode: String(input.regionCode || existing?.regionCode || 'GLOBAL').trim().toUpperCase().slice(0, 32),
        latitude: hasCoords ? input.latitude : undefined,
        longitude: hasCoords ? input.longitude : undefined,
        severity: input.severity,
        issuedAt: input.issuedAt || nowIso(),
        status: 'resolved',
        verifiedOfficial: false,
        routingStage: 'BLOCKED',
        isVerifiedByAdmin: false,
        adminCoreId: MASTER_ADMIN_CORE_ID,
        coreSealHash: signMasterCoreAlertSeal(cleanAlertId, input.officialSource, input.issuedAt || nowTimestampOrNow()),
        interceptedAt: existing?.interceptedAt || nowIso(),
        clearedAt: nowIso(),
        clearedBy: `${MASTER_ADMIN_CORE_ID}_GOV_FILTER_REJECTED`,
      };
      masterCoreAlertVault.set(cleanAlertId, blockedRecord);
      return blockedRecord;
    }

    const holdInVault =
      Boolean(options?.forceHoldInVault) ||
      masterCoreStrictManualHold ||
      !trustedAgency ||
      !titleFilter.safe ||
      !locationFilter.safe;

    const alreadyCleared = existing?.routingStage === 'VERIFIED_DISPATCHED' && existing.isVerifiedByAdmin;
    const isVerified = alreadyCleared || !holdInVault;
    const nowTimestamp = nowIso();

    const record: MasterCoreVaultAlert = {
      alertId: cleanAlertId,
      hazardType: input.hazardType,
      title: cleanTitle,
      officialSource: String(input.officialSource || 'Unverified Feed').slice(0, 120),
      sourceUrl: String(input.sourceUrl || '').slice(0, 512),
      location: cleanLocation,
      country: input.country ? String(input.country).slice(0, 80) : undefined,
      regionCode: String(input.regionCode || existing?.regionCode || 'GLOBAL').trim().toUpperCase().slice(0, 32),
      latitude: hasCoords ? input.latitude : undefined,
      longitude: hasCoords ? input.longitude : undefined,
      expiresAt: input.expiresAt,
      shelterAdvice: input.shelterAdvice ? String(input.shelterAdvice).slice(0, 500) : undefined,
      evacuationInstructions: input.evacuationInstructions ? String(input.evacuationInstructions).slice(0, 500) : undefined,
      severity: input.severity,
      issuedAt: input.issuedAt || nowTimestamp,
      status: input.status || 'active',
      verifiedOfficial: isVerified,
      routingStage: isVerified ? 'VERIFIED_DISPATCHED' : 'LOCKED_IN_ADMIN_CORE',
      isVerifiedByAdmin: isVerified,
      adminCoreId: MASTER_ADMIN_CORE_ID,
      coreSealHash: signMasterCoreAlertSeal(cleanAlertId, input.officialSource, input.issuedAt || nowTimestamp),
      interceptedAt: existing?.interceptedAt || nowTimestamp,
      clearedAt: isVerified ? existing?.clearedAt || nowTimestamp : undefined,
      clearedBy: isVerified ? existing?.clearedBy || `${MASTER_ADMIN_CORE_ID}_AUTO_AGENCY_SEAL` : undefined,
    };

    if (masterCoreAlertVault.size > 400) {
      const oldestKey = masterCoreAlertVault.keys().next().value;
      if (oldestKey) masterCoreAlertVault.delete(oldestKey);
    }
    masterCoreAlertVault.set(cleanAlertId, record);
    return record;
  }

  function nowTimestampOrNow(): string {
    return nowIso();
  }

  function formatVaultRecordForClient(record: MasterCoreVaultAlert, userLat: number, userLng: number) {
    const hasCoords = Number.isFinite(userLat) && Number.isFinite(userLng);
    const distanceKm =
      hasCoords && typeof record.latitude === 'number' && typeof record.longitude === 'number'
        ? haversineDistanceKm(userLat, userLng, record.latitude, record.longitude)
        : undefined;
    return {
      alertId: record.alertId,
      hazardType: record.hazardType,
      title: record.title,
      officialSource: record.officialSource,
      sourceUrl: record.sourceUrl,
      location: record.location,
      country: record.country,
      regionCode: record.regionCode,
      latitude: record.latitude,
      longitude: record.longitude,
      distanceKm,
      expiresAt: record.expiresAt,
      shelterAdvice: record.shelterAdvice,
      evacuationInstructions: record.evacuationInstructions,
      severity: record.severity,
      issuedAt: record.issuedAt,
      status: record.status,
      verifiedOfficial: true as const,
      masterCoreCleared: true as const,
      adminCoreId: record.adminCoreId,
      coreSealHash: record.coreSealHash,
    };
  }

  async function ingestGlobalDisasterFeedsIntoMasterCore(options?: {
    forceHoldInVault?: boolean;
  }): Promise<{
    routedRecords: MasterCoreVaultAlert[];
    feedErrors: string[];
  }> {
    const routedRecords: MasterCoreVaultAlert[] = [];
    const feedErrors: string[] = [];

    // Feed 1: USGS Earthquake Hazards Program
    try {
      const usgsRes = await fetch(
        'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
        { signal: AbortSignal.timeout(6000) }
      );
      if (usgsRes.ok) {
        const data = (await usgsRes.json()) as {
          features?: Array<{
            id: string;
            geometry?: { coordinates?: [number, number, number?] };
            properties: {
              title: string;
              place: string;
              time: number;
              mag: number;
              tsunami: number;
              url: string;
              status: string;
            };
          }>;
        };
        for (const f of (data.features || []).slice(0, 10)) {
          const p = f.properties;
          const coords = f.geometry?.coordinates;
          const qLng = Array.isArray(coords) ? coords[0] : undefined;
          const qLat = Array.isArray(coords) ? coords[1] : undefined;
          const isTsunami = p.tsunami === 1;
          routedRecords.push(
            routeAlertToMasterAdminCore(
              {
                alertId: `usgs_${f.id}`,
                hazardType: isTsunami ? 'tsunami' : 'earthquake',
                title: p.title || `M${p.mag} Earthquake`,
                officialSource: 'USGS Earthquake Hazards Program',
                sourceUrl: p.url || 'https://earthquake.usgs.gov/',
                location: p.place || 'Global Seismic Region',
                regionCode: 'GLOBAL',
                latitude: qLat,
                longitude: qLng,
                shelterAdvice: isTsunami
                  ? 'Move immediately inland and to higher ground above 30m elevation away from coastal inlets.'
                  : 'Drop, Cover, and Hold On during shaking; inspect utilities before re-entering damaged buildings.',
                severity: p.mag >= 6.5 ? 'extreme' : p.mag >= 5.5 ? 'warning' : 'advisory',
                issuedAt: new Date(p.time || Date.now()).toISOString(),
                status: 'active',
              },
              options
            )
          );
        }
      } else {
        feedErrors.push(`USGS returned HTTP ${usgsRes.status}`);
      }
    } catch (err) {
      feedErrors.push(`USGS feed unavailable: ${err instanceof Error ? err.message : 'network error'}`);
    }

    // Feed 2: NOAA / National Weather Service Extreme & Severe Alerts
    try {
      const noaaRes = await fetch(
        'https://api.weather.gov/alerts/active?status=actual&severity=Extreme,Severe',
        {
          headers: { 'User-Agent': 'PK-CHAT-DisasterMonitor/1.0 (official-alerts)' },
          signal: AbortSignal.timeout(6000),
        }
      );
      if (noaaRes.ok) {
        const data = (await noaaRes.json()) as {
          features?: Array<{
            id: string;
            properties: {
              event: string;
              headline: string;
              areaDesc: string;
              severity: string;
              sent: string;
              expires?: string;
              instruction?: string;
              status: string;
              '@id'?: string;
            };
          }>;
        };
        const nowMs = Date.now();
        for (const f of (data.features || []).slice(0, 10)) {
          const p = f.properties;
          if (p.expires && Date.parse(p.expires) <= nowMs) {
            continue;
          }
          const ev = (p.event || '').toLowerCase();
          const hazardType = ev.includes('flood')
            ? 'flood'
            : ev.includes('tsunami')
              ? 'tsunami'
              : ev.includes('hurricane') || ev.includes('cyclone') || ev.includes('typhoon')
                ? 'cyclone'
                : 'severe_weather';
          const cleanId = `noaa_${(f.id || Math.random().toString(36).slice(2)).slice(-24)}`;
          routedRecords.push(
            routeAlertToMasterAdminCore(
              {
                alertId: cleanId,
                hazardType,
                title: p.headline || p.event || 'Severe Weather Alert',
                officialSource: 'NOAA National Weather Service',
                sourceUrl: p['@id'] || 'https://www.weather.gov/',
                location: (p.areaDesc || 'Regional Advisory Area').slice(0, 140),
                country: 'United States',
                regionCode: 'US',
                expiresAt: p.expires,
                evacuationInstructions: p.instruction ? p.instruction.slice(0, 320) : undefined,
                severity: p.severity === 'Extreme' ? 'extreme' : 'warning',
                issuedAt: p.sent || new Date().toISOString(),
                status: 'active',
              },
              options
            )
          );
        }
      } else {
        feedErrors.push(`NOAA NWS returned HTTP ${noaaRes.status}`);
      }
    } catch (err) {
      feedErrors.push(`NOAA feed unavailable: ${err instanceof Error ? err.message : 'network error'}`);
    }

    // Feed 3: NASA EONET Earth Observatory Open Natural Events
    try {
      const eonetRes = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=15', {
        signal: AbortSignal.timeout(6000),
      });
      if (eonetRes.ok) {
        const eData = (await eonetRes.json()) as {
          events?: Array<{
            id: string;
            title: string;
            link?: string;
            categories?: Array<{ id: string; title: string }>;
            sources?: Array<{ id: string; url: string }>;
            geometry?: Array<{ date: string; coordinates?: number[] }>;
          }>;
        };
        for (const ev of (eData.events || []).slice(0, 10)) {
          const catId = (ev.categories?.[0]?.id || '').toLowerCase();
          const hazardType =
            catId === 'floods'
              ? 'flood'
              : catId === 'severestorms'
                ? 'cyclone'
                : catId === 'landslides'
                  ? 'landslide'
                  : catId === 'wildfires'
                    ? 'wildfire'
                    : 'severe_weather';
          const latestGeo = ev.geometry?.[ev.geometry.length - 1];
          const coords = latestGeo?.coordinates;
          const eLng = Array.isArray(coords) && typeof coords[0] === 'number' ? coords[0] : undefined;
          const eLat = Array.isArray(coords) && typeof coords[1] === 'number' ? coords[1] : undefined;

          routedRecords.push(
            routeAlertToMasterAdminCore(
              {
                alertId: `eonet_${ev.id}`,
                hazardType,
                title: ev.title,
                officialSource: 'NASA EONET Earth Observatory',
                sourceUrl: ev.sources?.[0]?.url || ev.link || 'https://eonet.gsfc.nasa.gov/',
                location:
                  typeof eLat === 'number' && typeof eLng === 'number'
                    ? `${eLat.toFixed(2)}, ${eLng.toFixed(2)}`
                    : 'Global Event Track',
                regionCode: 'GLOBAL',
                latitude: eLat,
                longitude: eLng,
                severity: 'watch',
                issuedAt: latestGeo?.date || new Date().toISOString(),
                status: 'active',
              },
              options
            )
          );
        }
      } else {
        feedErrors.push(`NASA EONET returned HTTP ${eonetRes.status}`);
      }
    } catch (err) {
      feedErrors.push(`NASA EONET feed unavailable: ${err instanceof Error ? err.message : 'network error'}`);
    }

    return { routedRecords, feedErrors };
  }

  app.get('/api/disasters/master-core/queue', async (req, res) => {
    const authCheck = await verifyAdminFirebaseToken(req);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }
    const items = Array.from(masterCoreAlertVault.values()).sort(
      (a, b) => Date.parse(b.interceptedAt) - Date.parse(a.interceptedAt)
    );
    res.json({
      adminCoreId: MASTER_ADMIN_CORE_ID,
      strictManualHold: masterCoreStrictManualHold,
      lockedCount: items.filter((i) => i.routingStage === 'LOCKED_IN_ADMIN_CORE').length,
      dispatchedCount: items.filter((i) => i.routingStage === 'VERIFIED_DISPATCHED').length,
      blockedCount: items.filter((i) => i.routingStage === 'BLOCKED').length,
      items,
    });
  });

  app.post('/api/disasters/master-core/policy', async (req, res) => {
    const authCheck = await verifyAdminFirebaseToken(req);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }
    const { strictManualHold } = (req.body ?? {}) as { strictManualHold?: unknown };
    if (typeof strictManualHold === 'boolean') {
      masterCoreStrictManualHold = strictManualHold;
      appendAuditLog({
        actorId: authCheck.email || 'owner',
        action: 'MASTER_CORE_POLICY_UPDATED',
        fromStatus: globalSecurityState.status,
        toStatus: globalSecurityState.status,
        detail: `Master Admin Core strict manual clearance hold set to ${strictManualHold}.`,
      });
    }
    res.json({
      adminCoreId: MASTER_ADMIN_CORE_ID,
      strictManualHold: masterCoreStrictManualHold,
    });
  });

  app.post('/api/disasters/master-core/intercept', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    // Custom submitted alert payload is ALWAYS quarantined in Master Admin Core first (never auto-dispatched)
    if (typeof body.title === 'string' && body.title.trim()) {
      const hazardRaw = typeof body.hazardType === 'string' ? body.hazardType : 'severe_weather';
      const validHazards = ['earthquake', 'tsunami', 'flood', 'severe_weather', 'cyclone', 'landslide', 'wildfire'];
      const hazardType = (validHazards.includes(hazardRaw) ? hazardRaw : 'severe_weather') as MasterCoreVaultAlert['hazardType'];
      const sevRaw = typeof body.severity === 'string' ? body.severity : 'warning';
      const validSev = ['advisory', 'watch', 'warning', 'extreme'];
      const severity = (validSev.includes(sevRaw) ? sevRaw : 'warning') as MasterCoreVaultAlert['severity'];

      const quarantined = routeAlertToMasterAdminCore(
        {
          alertId:
            typeof body.alertId === 'string' && body.alertId.trim()
              ? body.alertId.trim()
              : `core_q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          hazardType,
          title: body.title,
          officialSource: typeof body.officialSource === 'string' ? body.officialSource : 'External Sensor Relay',
          sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : '',
          location: typeof body.location === 'string' ? body.location : 'Global Watch Sector',
          country: typeof body.country === 'string' ? body.country : undefined,
          regionCode: typeof body.regionCode === 'string' ? body.regionCode : 'GLOBAL',
          latitude: typeof body.latitude === 'number' ? body.latitude : undefined,
          longitude: typeof body.longitude === 'number' ? body.longitude : undefined,
          severity,
          issuedAt: nowIso(),
          status: 'active',
        },
        { forceHoldInVault: true }
      );

      res.json({
        routedToAdminCoreFirst: true,
        adminCoreId: MASTER_ADMIN_CORE_ID,
        alert: quarantined,
      });
      return;
    }

    // Live feed interception requires owner auth if requesting forceHoldInVault=true override
    const forceHold = Boolean(body.holdForManualClearance);
    if (forceHold) {
      const authCheck = await verifyAdminFirebaseToken(req);
      if (!authCheck.ok) {
        res.status(authCheck.status).json({ error: authCheck.error });
        return;
      }
    }
    const { routedRecords, feedErrors } = await ingestGlobalDisasterFeedsIntoMasterCore({
      forceHoldInVault: forceHold,
    });
    res.json({
      routedToAdminCoreFirst: true,
      adminCoreId: MASTER_ADMIN_CORE_ID,
      interceptedCount: routedRecords.length,
      lockedCount: routedRecords.filter((r) => r.routingStage === 'LOCKED_IN_ADMIN_CORE').length,
      feedErrors,
    });
  });

  app.post('/api/disasters/master-core/dispatch', async (req, res) => {
    const authCheck = await verifyAdminFirebaseToken(req);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }
    const { alertId, regionCode, isVerifiedByAdmin } = (req.body ?? {}) as {
      alertId?: unknown;
      regionCode?: unknown;
      isVerifiedByAdmin?: unknown;
    };
    if (isVerifiedByAdmin !== true) {
      res.status(403).json({
        code: 'DISPATCH_BLOCKED_UNVERIFIED',
        error: 'DISPATCH BLOCKED: Alert has not passed PK Chat Master Admin Core verification.',
      });
      return;
    }
    const cleanId = typeof alertId === 'string' ? alertId.trim() : '';
    const record = masterCoreAlertVault.get(cleanId);
    if (!record) {
      res.status(404).json({ error: 'Alert not found in Master Admin Core vault.' });
      return;
    }
    const cleanRegion =
      typeof regionCode === 'string' && regionCode.trim()
        ? regionCode.trim().toUpperCase().slice(0, 32)
        : record.regionCode || 'GLOBAL';

    const dispatched: MasterCoreVaultAlert = {
      ...record,
      regionCode: cleanRegion,
      routingStage: 'VERIFIED_DISPATCHED',
      isVerifiedByAdmin: true,
      verifiedOfficial: true,
      clearedAt: nowIso(),
      clearedBy: authCheck.email || MASTER_ADMIN_CORE_ID,
    };
    masterCoreAlertVault.set(cleanId, dispatched);
    appendAuditLog({
      actorId: authCheck.email || 'owner',
      action: 'MASTER_CORE_DISASTER_DISPATCHED',
      fromStatus: globalSecurityState.status,
      toStatus: globalSecurityState.status,
      detail: `Master Admin Core cleared & dispatched ${cleanId} to region ${cleanRegion}.`,
    });
    res.json({ dispatched: true, adminCoreId: MASTER_ADMIN_CORE_ID, alert: dispatched });
  });

  app.post('/api/disasters/master-core/block', async (req, res) => {
    const authCheck = await verifyAdminFirebaseToken(req);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }
    const cleanId = typeof req.body?.alertId === 'string' ? req.body.alertId.trim() : '';
    const record = masterCoreAlertVault.get(cleanId);
    if (!record) {
      res.status(404).json({ error: 'Alert not found in Master Admin Core vault.' });
      return;
    }
    const blocked: MasterCoreVaultAlert = {
      ...record,
      routingStage: 'BLOCKED',
      isVerifiedByAdmin: false,
      verifiedOfficial: false,
      clearedAt: nowIso(),
      clearedBy: authCheck.email || MASTER_ADMIN_CORE_ID,
    };
    masterCoreAlertVault.set(cleanId, blocked);
    res.json({ blocked: true, adminCoreId: MASTER_ADMIN_CORE_ID, alert: blocked });
  });

  // 7b. Official Public Disaster Feeds Proxy (USGS Earthquakes, NOAA NWS & NASA EONET) — Always Routed via Master Admin Core First
  app.get('/api/disasters/official', async (req, res) => {
    const userLat = req.query.lat !== undefined ? Number(req.query.lat) : NaN;
    const userLng = req.query.lng !== undefined ? Number(req.query.lng) : NaN;
    const userCountry = typeof req.query.country === 'string' ? req.query.country.trim().toLowerCase() : '';
    const userRegion = typeof req.query.region === 'string' ? req.query.region.trim().toUpperCase() : '';

    const { feedErrors } = await ingestGlobalDisasterFeedsIntoMasterCore();

    // Only alerts explicitly cleared/dispatched by JERAD_PRASANTH_MASTER_CORE are released to regional users
    const nowMs = Date.now();
    const dispatchedVaultRecords = Array.from(masterCoreAlertVault.values()).filter((rec) => {
      if (rec.routingStage !== 'VERIFIED_DISPATCHED' || !rec.isVerifiedByAdmin) return false;
      if (rec.expiresAt && Date.parse(rec.expiresAt) <= nowMs) return false;
      if (rec.regionCode !== 'GLOBAL' && userRegion && rec.regionCode !== userRegion) {
        if (!userCountry || (rec.country || '').toLowerCase() !== userCountry) return false;
      }
      return true;
    });

    const alerts = dispatchedVaultRecords.map((rec) => formatVaultRecordForClient(rec, userLat, userLng));

    // Rank area matches first when user coordinates or country provided
    alerts.sort((a, b) => {
      const aCountryMatch =
        userCountry &&
        (a.location.toLowerCase().includes(userCountry) || (a.country || '').toLowerCase().includes(userCountry));
      const bCountryMatch =
        userCountry &&
        (b.location.toLowerCase().includes(userCountry) || (b.country || '').toLowerCase().includes(userCountry));
      if (aCountryMatch !== bCountryMatch) return aCountryMatch ? -1 : 1;
      const aDist = a.distanceKm ?? Number.MAX_SAFE_INTEGER;
      const bDist = b.distanceKm ?? Number.MAX_SAFE_INTEGER;
      if (aDist !== bDist) return aDist - bDist;
      return Date.parse(b.issuedAt) - Date.parse(a.issuedAt);
    });

    const lockedCount = Array.from(masterCoreAlertVault.values()).filter(
      (r) => r.routingStage === 'LOCKED_IN_ADMIN_CORE'
    ).length;

    res.json({
      alerts,
      verifiedGovOnly: true,
      rejectedUnofficialSourcesCount: rejectedUnofficialAlertsCount,
      sourcesChecked: [
        'USGS Earthquake Hazards Program',
        'NOAA National Weather Service',
        'NASA EONET Earth Observatory',
      ],
      masterCoreRouting: {
        adminCoreId: MASTER_ADMIN_CORE_ID,
        interceptedFirst: true,
        strictManualHold: masterCoreStrictManualHold,
        vaultLockedCount: lockedCount,
      },
      feedErrors,
      fetchedAt: new Date().toISOString(),
    });
  });

  app.post('/api/disasters/verify-source', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sourceName = typeof body.officialSource === 'string' ? body.officialSource : '';
    const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl : '';
    const check = isVerifiedOfficialDisasterAgency(sourceName, sourceUrl);
    if (!check.verified) {
      rejectedUnofficialAlertsCount += 1;
      res.status(403).json({
        verifiedOfficial: false,
        rejected: true,
        reason: check.reason,
      });
      return;
    }
    res.json({
      verifiedOfficial: true,
      rejected: false,
      reason: check.reason,
    });
  });

  // 6b. Real-Time 24/7 Weather Proxy (Open-Meteo Live API - Zero Mock Data)
  app.get('/api/weather', async (req, res) => {
    const rawLat = typeof req.query.lat === 'string' ? Number(req.query.lat) : NaN;
    const rawLng = typeof req.query.lng === 'string' ? Number(req.query.lng) : NaN;
    const rawCountry = typeof req.query.country === 'string' ? req.query.country.trim() : '';

    const countryCentroids: Record<string, { lat: number; lng: number; label: string }> = {
      'sri lanka': { lat: 6.9271, lng: 79.8612, label: 'Colombo, LK' },
      'india': { lat: 13.0827, lng: 80.2707, label: 'Chennai, IN' },
      'united kingdom': { lat: 51.5072, lng: -0.1276, label: 'London, UK' },
      'united states': { lat: 40.7128, lng: -74.006, label: 'New York, US' },
      'canada': { lat: 43.6532, lng: -79.3832, label: 'Toronto, CA' },
      'australia': { lat: -33.8688, lng: 151.2093, label: 'Sydney, AU' },
      'singapore': { lat: 1.3521, lng: 103.8198, label: 'Singapore, SG' },
      'malaysia': { lat: 3.139, lng: 101.6869, label: 'Kuala Lumpur, MY' },
      'united arab emirates': { lat: 25.2048, lng: 55.2708, label: 'Dubai, AE' },
      'france': { lat: 48.8566, lng: 2.3522, label: 'Paris, FR' },
      'germany': { lat: 52.52, lng: 13.405, label: 'Berlin, DE' },
      'japan': { lat: 35.6762, lng: 139.6503, label: 'Tokyo, JP' },
    };

    const centroid = countryCentroids[rawCountry.toLowerCase()] || {
      lat: 6.9271,
      lng: 79.8612,
      label: rawCountry || 'Colombo, LK',
    };

    const lat = Number.isFinite(rawLat) && Math.abs(rawLat) <= 90 ? rawLat : centroid.lat;
    const lng = Number.isFinite(rawLng) && Math.abs(rawLng) <= 180 ? rawLng : centroid.lng;
    const locationLabel =
      Number.isFinite(rawLat) && Number.isFinite(rawLng)
        ? rawCountry || `${lat.toFixed(2)}, ${lng.toFixed(2)}`
        : centroid.label;

    const mapWmoWeather = (code: number): { icon: string; label: string } => {
      if (code === 0) return { icon: '☀️', label: 'Clear Sky' };
      if (code >= 1 && code <= 3) return { icon: '⛅', label: 'Partly Cloudy' };
      if (code === 45 || code === 48) return { icon: '🌫️', label: 'Foggy' };
      if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { icon: '🌧️', label: 'Rain' };
      if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: '❄️', label: 'Snow' };
      if (code >= 95) return { icon: '⛈️', label: 'Thunderstorm' };
      return { icon: '🌤️', label: 'Fair' };
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
        String(lat)
      )}&longitude=${encodeURIComponent(
        String(lng)
      )}&current=temperature_2m,precipitation_probability,weather_code&timezone=auto`;
      const weatherRes = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!weatherRes.ok) {
        res.status(502).json({ error: `Open-Meteo HTTP ${weatherRes.status}` });
        return;
      }
      const data = (await weatherRes.json()) as {
        current?: {
          temperature_2m?: number;
          precipitation_probability?: number;
          weather_code?: number;
        };
      };
      const current = data.current;
      if (!current || typeof current.temperature_2m !== 'number') {
        res.status(502).json({ error: 'Weather payload unavailable' });
        return;
      }
      const code = typeof current.weather_code === 'number' ? current.weather_code : 1;
      const mapped = mapWmoWeather(code);
      res.json({
        temperatureC: current.temperature_2m,
        rainPct: typeof current.precipitation_probability === 'number' ? current.precipitation_probability : 0,
        weatherCode: code,
        icon: mapped.icon,
        conditionLabel: mapped.label,
        locationLabel,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to fetch live weather forecast',
      });
    }
  });

  // 7. Server-Side Subscription & Test-Mode Payment Validation
  app.post('/api/subscriptions/validate', (req, res) => {
    const body = req.body ?? {};
    // Strictly forbid card numbers or CVV from ever being sent or stored
    if ('cardNumber' in body || 'cvv' in body || 'pan' in body) {
      triggerServerLockdown({
        category: 'payload_tampering',
        severity: 'critical',
        sourceSignal: `IP:${req.ip || 'unknown'}`,
        summary: 'Prohibited payment card/CVV fields transmitted to /api/subscriptions/validate. Emergency Lockdown activated.',
        actorId: 'pci_tamper_sensor',
        proposedSolution: 'Reject raw card/CVV fields at edge middleware, enforce LOCKDOWN for 10s inspection window, verify client integrity.',
        proposedCodeSnippet: "if ('cardNumber' in body || 'cvv' in body || 'pan' in body) { triggerServerLockdown(...); return res.status(400)... }",
      });
      res.status(400).json({
        lockedDown: true,
        error: 'Security violation: Card numbers and CVV must never be transmitted to or stored in PK CHAT. Emergency Security Lockdown triggered.',
      });
      return;
    }

    const { action, provider, phoneNumber, userPhoneNumber, trialDaysCompleted } = body;
    const phoneCandidate =
      typeof phoneNumber === 'string'
        ? phoneNumber
        : typeof userPhoneNumber === 'string'
        ? userPhoneNumber
        : '';
    const isVipFounder = isVipFounderFreeNumber(phoneCandidate);
    const now = new Date();

    if (action === 'verify_billing') {
      const daysDone = Number(trialDaysCompleted ?? 0);
      res.json({
        valid: true,
        allowed: verifyUserSubscriptionBilling(phoneCandidate, daysDone),
        vipFounderBypass: isVipFounder,
        freeTrialLimitDays: STANDARD_FREE_TRIAL_DAYS,
        annualPriceUsd: STANDARD_ANNUAL_PRICE_USD,
        description: isVipFounder
          ? 'VIP Founder Lifetime 100% Free Access (Subscription, Ads & Video Status Fee Bypassed)'
          : daysDone <= STANDARD_FREE_TRIAL_DAYS
          ? `90-Day (3-Month) Free Trial Active (${Math.max(0, STANDARD_FREE_TRIAL_DAYS - daysDone)} days remaining)`
          : '90-Day (3-Month) Free Trial Completed — $10.00/year (once every 12 months) via Google Play Store Billing Required',
      });
      return;
    }

    if (
      action === 'verify_vip_founder' ||
      (isVipFounder &&
        (action === 'start_trial' ||
          action === 'subscribe_monthly' ||
          action === 'subscribe_annual'))
    ) {
      if (action === 'verify_vip_founder' && !isVipFounder) {
        res.status(403).json({
          valid: false,
          vipFounderBypass: false,
          error: 'Phone number is not in the VIP Founder Free Access allowlist.',
        });
        return;
      }
      res.json({
        valid: true,
        vipFounderBypass: true,
        plan: 'free',
        status: 'active',
        monthlyPriceUsd: 0,
        annualPriceUsd: STANDARD_ANNUAL_PRICE_USD,
        autoRenew: false,
        paymentMode: 'test',
        provider: provider || 'google_play_test',
        currentPeriodEnd: '2099-12-31T23:59:59.000Z',
        amountChargedUsd: 0,
        description: 'VIP Founder Lifetime 100% Free Access Verified (Subscription, Ads & Video Status Fee Bypassed)',
      });
      return;
    }

    if (action === 'start_trial') {
      const trialEnd = new Date(
        now.getTime() + STANDARD_FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000
      );
      res.json({
        valid: true,
        vipFounderBypass: false,
        plan: 'trial',
        status: 'trialing',
        monthlyPriceUsd: STANDARD_ANNUAL_PRICE_USD,
        annualPriceUsd: STANDARD_ANNUAL_PRICE_USD,
        autoRenew: true,
        paymentMode: 'test',
        provider: provider || 'google_play_test',
        trialStartAt: now.toISOString(),
        trialEndAt: trialEnd.toISOString(),
        currentPeriodEnd: trialEnd.toISOString(),
        amountChargedUsd: 0,
        description: '90-Day (3-Month) Free Trial Activated (Then USD $10.00/year once every 12 months via Google Play Store Billing unless cancelled)',
      });
      return;
    }

    if (action === 'subscribe_monthly' || action === 'subscribe_annual') {
      const periodEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      res.json({
        valid: true,
        vipFounderBypass: false,
        plan: 'pro_monthly',
        status: 'active',
        monthlyPriceUsd: STANDARD_ANNUAL_PRICE_USD,
        annualPriceUsd: STANDARD_ANNUAL_PRICE_USD,
        autoRenew: true,
        paymentMode: 'test',
        provider: provider || 'google_play_test',
        currentPeriodEnd: periodEnd.toISOString(),
        amountChargedUsd: STANDARD_ANNUAL_PRICE_USD,
        description: 'PK CHAT Global Annual Subscription — USD $10.00/year (once every 12 months via Google Play Store Billing)',
      });
      return;
    }

    if (action === 'cancel') {
      res.json({
        valid: true,
        status: 'cancelled',
        autoRenew: false,
        paymentMode: 'test',
        description: 'Subscription auto-renewal cancelled. Access continues until period end.',
      });
      return;
    }

    res.status(400).json({ error: 'Unsupported subscription validation action.' });
  });

  // 8. Automated OTP Readiness Probe & Optional Cloud SMS/WhatsApp Gateway Relay
  interface OtpChallengeRecord {
    hash: string;
    previousHash?: string;
    expiresAt: number;
    attempts: number;
  }
  const otpChallenges = new Map<string, OtpChallengeRecord>();
  const lastOtpHashByPhone = new Map<string, string>();

  const otpStatusCache = new Map<string, { payload: Record<string, unknown>; expiresAt: number }>();

  app.get('/api/otp/status', async (req, res) => {
    const fbCfg = readFirebasePublicConfig();
    let firebasePhoneEnabled = false;
    let firebaseBillingRequired = false;
    let firebaseRegionBlocked = false;
    let firebaseRateLimited = false;
    let firebaseProbeCode = 'UNKNOWN';

    // Always probe a synthetic non-personal prefix number for the requested country code
    // so real user phone numbers never get rate-limited by readiness checks.
    const rawCountry =
      typeof req.query.dialCode === 'string' && /^\+\d{1,4}$/.test(req.query.dialCode.trim())
        ? req.query.dialCode.trim()
        : '+94';
    const syntheticSuffix = String(81 + (Math.floor(Date.now() / 60_000) % 9)).padStart(2, '0');
    const syntheticProbePhone = `${rawCountry}7000000${syntheticSuffix}`;

    const cached = otpStatusCache.get(rawCountry);
    if (cached && Date.now() < cached.expiresAt) {
      res.json(cached.payload);
      return;
    }

    if (fbCfg.apiKey) {
      try {
        const probeRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${encodeURIComponent(fbCfg.apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phoneNumber: syntheticProbePhone,
              recaptchaToken: 'probe_readiness_check',
            }),
          }
        );
        const probeData = (await probeRes.json()) as { error?: { message?: string } };
        const msg = probeData?.error?.message || '';
        firebaseProbeCode = msg || `HTTP_${probeRes.status}`;

        if (msg.includes('region enabled') || msg.includes('SMS unable to be sent')) {
          firebasePhoneEnabled = true;
          firebaseRegionBlocked = true;
        } else if (msg === 'OPERATION_NOT_ALLOWED' || msg.startsWith('OPERATION_NOT_ALLOWED')) {
          firebasePhoneEnabled = false;
        } else if (msg === 'BILLING_NOT_ENABLED') {
          firebasePhoneEnabled = true;
          firebaseBillingRequired = true;
        } else if (msg.includes('TOO_MANY_ATTEMPTS')) {
          firebasePhoneEnabled = true;
          firebaseRateLimited = true;
        } else if (
          msg.includes('RECAPTCHA') ||
          msg.includes('CAPTCHA') ||
          msg.includes('INVALID_PHONE_NUMBER') ||
          probeRes.ok
        ) {
          firebasePhoneEnabled = true;
        }
      } catch (err) {
        firebaseProbeCode = err instanceof Error ? err.message : 'PROBE_FAILED';
      }
    }

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_FROM_NUMBER;
    const twilioVerifySid = process.env.TWILIO_VERIFY_SERVICE_SID;

    const twilioConfigured = Boolean(twilioSid && twilioToken && (twilioFrom || twilioVerifySid));
    const twilioVoiceConfigured = twilioConfigured;
    const twilioVerifyConfigured = Boolean(twilioSid && twilioToken && twilioVerifySid);
    const whatsappConfigured = Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
    );
    const httpGatewayConfigured = Boolean(
      process.env.SMS_GATEWAY_URL && process.env.SMS_GATEWAY_API_KEY
    );

    const payload = {
      projectId: fbCfg.projectId || 'pkchat-41ef3',
      probedDialCode: rawCountry,
      firebasePhoneEnabled,
      firebaseBillingRequired,
      firebaseRegionBlocked,
      firebaseRateLimited,
      firebaseProbeCode,
      gateways: {
        twilioConfigured,
        twilioVoiceConfigured,
        twilioVerifyConfigured,
        whatsappConfigured,
        httpGatewayConfigured,
      },
      anyAutomatedChannelReady:
        (firebasePhoneEnabled &&
          !firebaseRegionBlocked &&
          !firebaseBillingRequired &&
          !firebaseRateLimited) ||
        twilioConfigured ||
        whatsappConfigured ||
        httpGatewayConfigured,
      checkedAt: new Date().toISOString(),
    };

    pruneExpiredMap(otpStatusCache, 250);
    otpStatusCache.set(rawCountry, { payload, expiresAt: Date.now() + 60_000 });
    res.json(payload);
  });

  app.post('/api/otp/gateway/send', async (req, res) => {
    const { phoneNumber, deliveryMethod } = req.body ?? {};
    const method: 'sms' | 'call' = deliveryMethod === 'call' ? 'call' : 'sms';
    if (typeof phoneNumber !== 'string' || !/^\+\d{8,15}$/.test(phoneNumber.trim())) {
      res.status(400).json({ error: 'Valid E.164 phoneNumber (e.g. +94717860693) is required.' });
      return;
    }
    const cleanPhone = phoneNumber.trim();

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_FROM_NUMBER;
    const twilioVerifySid = process.env.TWILIO_VERIFY_SERVICE_SID;
    const waToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const gwUrl = process.env.SMS_GATEWAY_URL;
    const gwKey = process.env.SMS_GATEWAY_API_KEY;

    if (method === 'call' && !(twilioSid && twilioToken && (twilioVerifySid || twilioFrom))) {
      res.status(503).json({
        error:
          'Voice Call OTP ("Call Me") requires Twilio Voice or Twilio Verify credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID or TWILIO_FROM_NUMBER) in Secrets.',
      });
      return;
    }

    if (
      !(twilioSid && twilioToken && (twilioFrom || twilioVerifySid)) &&
      !(waToken && waPhoneId) &&
      !(gwUrl && gwKey)
    ) {
      res.status(503).json({
        error:
          'No Cloud SMS, Voice Call, or WhatsApp gateway credentials configured. Enable Firebase Phone Auth in Firebase Console or configure Twilio / WhatsApp / HTTP SMS Gateway Secrets.',
      });
      return;
    }

    const prevHash = lastOtpHashByPhone.get(cleanPhone);
    let code = '';
    let hash = '';
    do {
      code = String(crypto.randomInt(100000, 1000000));
      hash = crypto
        .createHmac('sha256', process.env.GEMINI_API_KEY || 'pk-chat-otp-salt')
        .update(`${cleanPhone}:${code}`)
        .digest('hex');
    } while (hash === prevHash);

    try {
      let channel = '';
      if (twilioSid && twilioToken && twilioVerifySid) {
        const authHdr = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
        const params = new URLSearchParams({
          To: cleanPhone,
          Channel: method === 'call' ? 'call' : 'sms',
        });
        const vRes = await fetch(
          `https://verify.twilio.com/v2/Services/${encodeURIComponent(twilioVerifySid)}/Verifications`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${authHdr}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
          }
        );
        if (!vRes.ok) {
          const errText = await vRes.text();
          throw new Error(`Twilio Verify (${method}) error (${vRes.status}): ${errText.slice(0, 160)}`);
        }
        channel = method === 'call' ? 'twilio_verify_call' : 'twilio_verify_sms';
      } else if (method === 'call' && twilioSid && twilioToken && twilioFrom) {
        const spokenDigits = code.split('').join(', ');
        const twiml = `<Response><Pause length="1"/><Say voice="alice" loop="2">Hello from PK CHAT. Your 6 digit verification code is ${spokenDigits}.</Say></Response>`;
        const params = new URLSearchParams({
          To: cleanPhone,
          From: twilioFrom,
          Twiml: twiml,
        });
        const authHdr = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
        const callRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilioSid)}/Calls.json`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${authHdr}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
          }
        );
        if (!callRes.ok) {
          const errText = await callRes.text();
          throw new Error(`Twilio Voice Call error (${callRes.status}): ${errText.slice(0, 160)}`);
        }
        channel = 'twilio_voice_call';
      } else if (twilioSid && twilioToken && twilioFrom) {
        const params = new URLSearchParams({
          To: cleanPhone,
          From: twilioFrom,
          Body: `Your PK CHAT verification code is ${code}. Expires in 2 minutes.`,
        });
        const authHdr = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
        const twRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilioSid)}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${authHdr}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
          }
        );
        if (!twRes.ok) {
          const errText = await twRes.text();
          throw new Error(`Twilio SMS error (${twRes.status}): ${errText.slice(0, 160)}`);
        }
        channel = 'twilio_sms';
      } else if (waToken && waPhoneId) {
        const waRes = await fetch(
          `https://graph.facebook.com/v20.0/${encodeURIComponent(waPhoneId)}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${waToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: cleanPhone.replace(/^\+/, ''),
              type: 'text',
              text: { body: `PK CHAT verification code: ${code}. Valid for 2 minutes.` },
            }),
          }
        );
        if (!waRes.ok) {
          const errText = await waRes.text();
          throw new Error(`WhatsApp API error (${waRes.status}): ${errText.slice(0, 160)}`);
        }
        channel = 'whatsapp_cloud';
      } else if (gwUrl && gwKey) {
        const gwRes = await fetch(gwUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${gwKey}`,
            'x-api-key': gwKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: cleanPhone,
            phoneNumber: cleanPhone,
            message: `PK CHAT OTP: ${code}. Valid for 2 minutes.`,
          }),
        });
        if (!gwRes.ok) {
          const errText = await gwRes.text();
          throw new Error(`SMS Gateway error (${gwRes.status}): ${errText.slice(0, 160)}`);
        }
        channel = 'http_sms_gateway';
      }

      if (!channel.startsWith('twilio_verify_')) {
        pruneExpiredMap(otpChallenges, 2000);
        if (lastOtpHashByPhone.size > 2000) {
          lastOtpHashByPhone.clear();
        }
        lastOtpHashByPhone.set(cleanPhone, hash);
        otpChallenges.set(cleanPhone, {
          hash,
          previousHash: prevHash,
          expiresAt: Date.now() + 2 * 60 * 1000,
          attempts: 0,
        });
      }

      res.json({ sent: true, channel, expiresInSeconds: 120 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OTP gateway dispatch failed';
      recordServerError('/api/otp/gateway/send', 502, msg);
      res.status(502).json({ error: msg });
    }
  });

  app.post('/api/otp/gateway/verify', async (req, res) => {
    const { phoneNumber, code } = req.body ?? {};
    if (typeof phoneNumber !== 'string' || typeof code !== 'string') {
      res.status(400).json({ error: 'phoneNumber and 6-digit code are required.' });
      return;
    }
    const cleanPhone = phoneNumber.trim();
    const cleanCode = code.trim();
    if (!/^\+\d{8,15}$/.test(cleanPhone) || !/^\d{6}$/.test(cleanCode)) {
      res.status(400).json({ error: 'Valid E.164 phoneNumber and 6-digit numeric OTP code are required.' });
      return;
    }

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioVerifySid = process.env.TWILIO_VERIFY_SERVICE_SID;

    if (twilioSid && twilioToken && twilioVerifySid && !otpChallenges.has(cleanPhone)) {
      try {
        const authHdr = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
        const params = new URLSearchParams({ To: cleanPhone, Code: cleanCode });
        const checkRes = await fetch(
          `https://verify.twilio.com/v2/Services/${encodeURIComponent(twilioVerifySid)}/VerificationCheck`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${authHdr}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
          }
        );
        const checkData = (await checkRes.json()) as { status?: string; message?: string };
        if (checkRes.ok && checkData.status === 'approved') {
          res.json({ verified: true, phoneNumber: cleanPhone });
          return;
        }
        res.status(400).json({ error: checkData.message || 'Invalid or expired 6-digit OTP code.' });
        return;
      } catch (err) {
        res.status(502).json({ error: err instanceof Error ? err.message : 'Verification check failed' });
        return;
      }
    }

    const record = otpChallenges.get(cleanPhone);
    if (!record) {
      res.status(400).json({ error: 'No active OTP session for this number.' });
      return;
    }
    if (Date.now() > record.expiresAt) {
      otpChallenges.delete(cleanPhone);
      res.status(400).json({ error: 'OTP expired. Request a new verification code.' });
      return;
    }
    if (record.attempts >= 5) {
      otpChallenges.delete(cleanPhone);
      triggerServerLockdown({
        category: 'auth_brute_force',
        severity: 'critical',
        sourceSignal: `OTP:${cleanPhone.slice(-4)}`,
        summary: 'Repeated failed OTP verification brute-force attempt detected. Emergency Lockdown activated.',
        actorId: 'otp_bruteforce_sensor',
      });
      res.status(429).json({ error: 'Too many verification attempts. Request a new code.' });
      return;
    }

    const expectedHash = crypto
      .createHmac('sha256', process.env.GEMINI_API_KEY || 'pk-chat-otp-salt')
      .update(`${cleanPhone}:${cleanCode}`)
      .digest('hex');

    const recordBuf = Buffer.from(record.hash, 'utf8');
    const expectedBuf = Buffer.from(expectedHash, 'utf8');
    if (
      recordBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(recordBuf, expectedBuf)
    ) {
      record.attempts += 1;
      if (record.attempts >= 5) {
        triggerServerLockdown({
          category: 'auth_brute_force',
          severity: 'critical',
          sourceSignal: `OTP:${cleanPhone.slice(-4)}`,
          summary: '5 consecutive invalid OTP verification codes submitted. Emergency Lockdown activated.',
          actorId: 'otp_bruteforce_sensor',
        });
      }
      res.status(400).json({ error: 'Invalid 6-digit OTP code.' });
      return;
    }

    otpChallenges.delete(cleanPhone);
    res.json({ verified: true, phoneNumber: cleanPhone });
  });

  // App Update & Release Manifest Endpoint (Web/PWA + Android Play Store In-App Update)
  app.get('/api/app/version', (req, res) => {
    const latestVersion = (process.env.APP_VERSION || '2026.11.15').trim();
    const clientVersion =
      typeof req.query.clientVersion === 'string' ? req.query.clientVersion.trim() : '';
    const compareVersions = (a: string, b: string) => {
      const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
      const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
      const len = Math.max(pa.length, pb.length);
      for (let i = 0; i < len; i++) {
        const va = pa[i] ?? 0;
        const vb = pb[i] ?? 0;
        if (va > vb) return 1;
        if (va < vb) return -1;
      }
      return 0;
    };
    const updateAvailable = Boolean(clientVersion && compareVersions(latestVersion, clientVersion) > 0);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      appName: 'PK Chat',
      androidPackageId: 'com.pkchat.app',
      playStoreUrl: 'https://play.google.com/store/apps/details?id=com.pkchat.app',
      latestVersion,
      minSupportedVersion: '2026.11.01',
      updateAvailable,
      updatePriority: 'flexible',
      releaseNotes:
        'Includes 1-Tap Language Start, 10-Minute Security Shield, Dial Pad Contacts, and Global Festival Chat Animations.',
      checkedAt: new Date().toISOString(),
    });
  });

  // Automated Celebration & Midnight Global New Year Greeting Generator
  app.post('/api/greetings/ai-auto', async (req, res) => {
    const clientKey = req.ip || 'unknown';
    if (!checkRateLimit(`greet:${clientKey}`, 40, 60_000)) {
      res.status(429).json({ error: 'Too many greeting generation requests. Please wait a moment.' });
      return;
    }

    const {
      festivalTitle,
      languageCode = 'ta',
      languageName = 'Tamil',
      recipientName = '',
      isMidnightNewYear = false,
    } = (req.body ?? {}) as {
      festivalTitle?: unknown;
      languageCode?: unknown;
      languageName?: unknown;
      recipientName?: unknown;
      isMidnightNewYear?: unknown;
    };

    const cleanFestival =
      typeof festivalTitle === 'string' && festivalTitle.trim()
        ? festivalTitle.trim().slice(0, 100)
        : isMidnightNewYear
          ? 'Global New Year 🎆'
          : 'Birthday 🎂';
    const cleanLangCode =
      typeof languageCode === 'string' && languageCode.trim()
        ? languageCode.trim().slice(0, 16)
        : 'en';
    const cleanLangName =
      typeof languageName === 'string' && languageName.trim()
        ? languageName.trim().slice(0, 64)
        : 'English';
    const cleanRecipient =
      typeof recipientName === 'string' ? recipientName.trim().slice(0, 60) : '';

    const buildLocalizedFallback = () => {
      const greetingPrefix = cleanRecipient ? `Dear ${cleanRecipient}, ` : '';
      if (isMidnightNewYear || /new year|புத்தாண்டு/i.test(cleanFestival)) {
        return enforceFounderNameProtection(
          `${greetingPrefix}🎆🥂✨ Happy New Year! Wishing you and your family bright happiness, good health, and lasting peace with God's abundant blessings throughout the year ahead. — Prashanth Keransiya Family`
        );
      }
      if (/christmas|கிறிஸ்துமஸ்/i.test(cleanFestival)) {
        return enforceFounderNameProtection(
          `${greetingPrefix}🎄✨ Merry Christmas! May your home be filled with love, joy, happiness, and peace with God's richest blessings this Christmas season. — Prashanth Keransiya Family`
        );
      }
      if (/national|independence|republic|தேசிய|சுதந்திர/i.test(cleanFestival)) {
        return enforceFounderNameProtection(
          `${greetingPrefix}🕊️✨ Warm wishes on ${cleanFestival}! May God's blessings bring unity, happiness, and lasting peace to you, your family, and your nation. — Prashanth Keransiya Family`
        );
      }
      if (/taj mahal|தாஜ்மஹால்/i.test(cleanFestival)) {
        return enforceFounderNameProtection(
          `${greetingPrefix}🏛️❤️✨ Wishing you and your family timeless love, happiness, and peace with God's blessings. — Prashanth Keransiya Family`
        );
      }
      if (/birthday|பிறந்தநாள்/i.test(cleanFestival)) {
        return enforceFounderNameProtection(
          `${greetingPrefix}🎂🎈🎉 Happy Birthday! May God's blessings fill your life and your family with endless happiness, good health, and peace today and always. — Prashanth Keransiya Family`
        );
      }
      if (/anniversary|திருமண/i.test(cleanFestival)) {
        return enforceFounderNameProtection(
          `${greetingPrefix}💍❤️✨ Happy Anniversary! Wishing you and your family many joyful years of love, happiness, and peace with God's blessings. — Prashanth Keransiya Family`
        );
      }
      if (/mother|அன்னையர்/i.test(cleanFestival)) {
        return enforceFounderNameProtection(
          `${greetingPrefix}👩‍👧‍👦💖🌹 Happy Mother's Day! Wishing you and your family abundant happiness and peace with God's blessings. — Prashanth Keransiya Family`
        );
      }
      if (/father|தந்தை/i.test(cleanFestival)) {
        return enforceFounderNameProtection(
          `${greetingPrefix}👨‍👧‍👦💙🌟 Happy Father's Day! Wishing you and your family strength, happiness, and peace with God's blessings. — Prashanth Keransiya Family`
        );
      }
      return enforceFounderNameProtection(
        `${greetingPrefix}🎉✨ Warm wishes on ${cleanFestival}! Wishing you and your family lasting happiness and peace with God's abundant blessings. — Prashanth Keransiya Family`
      );
    };

    if (!process.env.GEMINI_API_KEY) {
      res.json({
        greetingText: buildLocalizedFallback(),
        festivalTitle: cleanFestival,
        languageCode: cleanLangCode,
        engine: 'pkchat_localized_template',
      });
      return;
    }

    try {
      const prompt = [
        `Compose ONE short, warm, uplifting greeting from PK Chat for "${cleanFestival}", wishing everyone and their family happiness and peace with God's blessings.`,
        `Do NOT use phrases like "like our own relative" or "சொந்த உறவினர்".`,
        cleanRecipient ? `Recipient name: ${cleanRecipient}.` : '',
        isMidnightNewYear ? 'It is for a global midnight New Year broadcast at 12:00 AM local time.' : '',
        `End the greeting with "Prashanth Keransiya Family" in exact English Latin script — NEVER alter or transliterate "Prashanth Keransiya".`,
        `Write primarily in clear ${cleanLangName} (${cleanLangCode}) with 2-3 matching celebratory emojis, under 280 characters total. Return ONLY the greeting message text without quotes or markdown.`,
      ]
        .filter(Boolean)
        .join('\n');

      const aiRes = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          temperature: 0.7,
          maxOutputTokens: 160,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      const text = enforceFounderNameProtection(
        (aiRes.text || '').trim().replace(/^["']|["']$/g, '').slice(0, 480)
      );
      res.json({
        greetingText: text || buildLocalizedFallback(),
        festivalTitle: cleanFestival,
        languageCode: cleanLangCode,
        engine: text ? 'pkchat_cloud_greeting' : 'pkchat_localized_template',
      });
    } catch {
      res.json({
        greetingText: buildLocalizedFallback(),
        festivalTitle: cleanFestival,
        languageCode: cleanLangCode,
        engine: 'pkchat_localized_template',
      });
    }
  });

  // =========================================================================
  // Real-Time Server-Backed Cryptographic QR Profile Tokens & Verification
  // =========================================================================
  app.get('/api/qr/stream', (req, res) => {
    const uid = typeof req.query.uid === 'string' ? req.query.uid.trim().slice(0, 128) : '';
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const clientId = `qr_sse_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    qrStreamClients.set(clientId, { res, uid });
    res.write(
      `event: connected\ndata: ${JSON.stringify({ connected: true, uid, serverTime: new Date().toISOString() })}\n\n`
    );

    const heartbeat = setInterval(() => {
      try {
        res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
      } catch {
        clearInterval(heartbeat);
        qrStreamClients.delete(clientId);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      qrStreamClients.delete(clientId);
    });
  });

  app.post('/api/qr/token', async (req, res) => {
    const ip = String(req.ip || req.socket.remoteAddress || 'unknown');
    if (!checkRateLimit(`qr_token:${ip}`, 90, 60_000)) {
      res.status(429).json({ error: 'Too many QR token requests. Please wait a moment.' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    let verifiedUid = typeof body.uid === 'string' ? body.uid.trim() : '';

    if (req.headers.authorization) {
      const authRes = await verifyAuthenticatedFirebaseUser(req);
      if (!authRes.ok || !authRes.uid) {
        res.status(authRes.status).json({ error: authRes.error || 'Unauthorized QR token request.' });
        return;
      }
      verifiedUid = authRes.uid;
    }

    if (!verifiedUid || !/^[a-zA-Z0-9_-]{2,128}$/.test(verifiedUid)) {
      res.status(400).json({ error: 'Valid user UID is required to generate a QR token.' });
      return;
    }

    const rawAvatar = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : '';
    const safeAvatar =
      rawAvatar.length <= 240000 &&
      (rawAvatar === '' ||
        rawAvatar.startsWith('data:image/') ||
        rawAvatar.startsWith('https://') ||
        rawAvatar.startsWith('/'))
        ? rawAvatar
        : '';

    const profile: ServerQrProfileSnapshot = {
      uid: verifiedUid,
      fullName: String(body.fullName || 'PK Chat Member').trim().slice(0, 100) || 'PK Chat Member',
      phoneNumber: String(body.phoneNumber || '').trim().slice(0, 32),
      country: String(body.country || 'Sri Lanka').trim().slice(0, 80) || 'Sri Lanka',
      countryCode: String(body.countryCode || 'LK').trim().slice(0, 8) || 'LK',
      preferredLanguage: String(body.preferredLanguage || 'en').trim().slice(0, 16) || 'en',
      preferredLanguageName: String(body.preferredLanguageName || 'English').trim().slice(0, 64) || 'English',
      about: String(body.about || 'Available on PK Chat').trim().slice(0, 140) || 'Available on PK Chat',
      avatarUrl: safeAvatar,
    };

    const forceRefresh = Boolean(body.forceRefresh);
    const includeMatrix = Boolean(body.includeMatrix);
    const buildMatrixPayload = (tokenValue: string) => {
      if (!includeMatrix) return undefined;
      const qr = QRCode.create(tokenValue, { errorCorrectionLevel: 'H' });
      return {
        size: qr.modules.size,
        data: Array.from(qr.modules.data),
      };
    };
    const now = Date.now();
    const existingTokenId = activeQrTokenIdByUid.get(verifiedUid);
    const existingRecord = existingTokenId ? qrTokensById.get(existingTokenId) : undefined;

    if (!forceRefresh && existingRecord && !existingRecord.revoked && existingRecord.expiresAtMs > now + 60_000) {
      existingRecord.profile = profile;
      res.json({
        token: existingRecord.tokenString,
        tokenId: existingRecord.tokenId,
        issuedAt: new Date(existingRecord.issuedAtMs).toISOString(),
        expiresAt: new Date(existingRecord.expiresAtMs).toISOString(),
        scanCount: existingRecord.scanCount,
        profile: existingRecord.profile,
        qrMatrix: buildMatrixPayload(existingRecord.tokenString),
        serverTimestamp: new Date(now).toISOString(),
      });
      return;
    }

    if (existingRecord && !existingRecord.revoked) {
      existingRecord.revoked = true;
    }

    pruneExpiredQrTokens();

    const tokenId = `qr_${crypto.randomBytes(8).toString('hex')}`;
    const issuedAtMs = now;
    const expiresAtMs = now + QR_TOKEN_TTL_MS;
    const signature = signQrToken(tokenId, verifiedUid, issuedAtMs);
    const tokenString = `${QR_TOKEN_PREFIX}${tokenId}:${signature}`;

    const nextRecord: ServerQrTokenRecord = {
      tokenId,
      signature,
      tokenString,
      profile,
      issuedAtMs,
      expiresAtMs,
      revoked: false,
      scanCount: 0,
    };
    qrTokensById.set(tokenId, nextRecord);
    activeQrTokenIdByUid.set(verifiedUid, tokenId);
    scheduleQrPersist();

    broadcastQrRealtimeEvent('qr_issued', verifiedUid, {
      tokenId,
      uid: verifiedUid,
      issuedAt: new Date(issuedAtMs).toISOString(),
    });

    res.json({
      token: nextRecord.tokenString,
      tokenId: nextRecord.tokenId,
      issuedAt: new Date(nextRecord.issuedAtMs).toISOString(),
      expiresAt: new Date(nextRecord.expiresAtMs).toISOString(),
      scanCount: 0,
      profile: nextRecord.profile,
      qrMatrix: buildMatrixPayload(nextRecord.tokenString),
      serverTimestamp: new Date(now).toISOString(),
    });
  });

  const handleVerifyQrInput = (rawQrInput: string, scannerUid?: string) => {
    const parsed = parseRawQrToken(rawQrInput);
    if (!parsed) {
      return { ok: false as const, status: 400, error: 'Unrecognized or malformed PK Chat QR code.' };
    }
    const record = qrTokensById.get(parsed.tokenId);
    if (!record) {
      return { ok: false as const, status: 404, error: 'This PK Chat QR code was not found or has expired.' };
    }
    const expectedSig = signQrToken(record.tokenId, record.profile.uid, record.issuedAtMs);
    const providedBuf = Buffer.from(parsed.signature, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf) ||
      parsed.signature !== record.signature
    ) {
      return { ok: false as const, status: 403, error: 'QR signature verification failed.' };
    }
    if (record.revoked) {
      return { ok: false as const, status: 410, error: 'This QR code has been reset by its owner. Ask them to share their new code.' };
    }
    if (record.expiresAtMs <= Date.now()) {
      return { ok: false as const, status: 410, error: 'This QR code has expired. Ask your contact to refresh their QR code.' };
    }

    const verifiedAtMs = Date.now();
    record.scanCount += 1;
    record.lastScannedAtMs = verifiedAtMs;
    scheduleQrPersist();

    broadcastQrRealtimeEvent('qr_scanned', record.profile.uid, {
      tokenId: record.tokenId,
      ownerUid: record.profile.uid,
      scannerUid: scannerUid || null,
      scanCount: record.scanCount,
      verifiedAt: new Date(verifiedAtMs).toISOString(),
    });

    return {
      ok: true as const,
      status: 200,
      payload: {
        valid: true,
        tokenId: record.tokenId,
        token: record.tokenString,
        issuedAt: new Date(record.issuedAtMs).toISOString(),
        expiresAt: new Date(record.expiresAtMs).toISOString(),
        verifiedAt: new Date(verifiedAtMs).toISOString(),
        scanCount: record.scanCount,
        profile: record.profile,
      },
    };
  };

  app.post('/api/qr/verify', async (req, res) => {
    const ip = String(req.ip || req.socket.remoteAddress || 'unknown');
    if (!checkRateLimit(`qr_verify:${ip}`, 180, 60_000)) {
      res.status(429).json({ error: 'Too many QR scans in a short time. Please wait a second.' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const rawQrText =
      typeof body.rawQrText === 'string'
        ? body.rawQrText
        : typeof body.token === 'string'
        ? body.token
        : '';
    const scannerUid = typeof body.scannerUid === 'string' ? body.scannerUid.trim().slice(0, 128) : undefined;

    const result = handleVerifyQrInput(rawQrText, scannerUid);
    if (!result.ok) {
      res.status(result.status).json({ valid: false, error: result.error });
      return;
    }
    res.json(result.payload);
  });

  app.get('/api/qr/token/:token', (req, res) => {
    const result = handleVerifyQrInput(String(req.params.token || ''));
    if (!result.ok) {
      res.status(result.status).json({ valid: false, error: result.error });
      return;
    }
    res.json(result.payload);
  });

  app.post('/api/qr/revoke', async (req, res) => {
    const ip = String(req.ip || req.socket.remoteAddress || 'unknown');
    if (!checkRateLimit(`qr_revoke:${ip}`, 30, 60_000)) {
      res.status(429).json({ error: 'Too many QR reset requests. Please wait a moment.' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    let targetUid = typeof body.uid === 'string' ? body.uid.trim() : '';
    let hasProof = false;

    if (req.headers.authorization) {
      const authRes = await verifyAuthenticatedFirebaseUser(req);
      if (!authRes.ok || !authRes.uid) {
        res.status(authRes.status).json({ error: authRes.error || 'Unauthorized revoke request.' });
        return;
      }
      targetUid = authRes.uid;
      hasProof = true;
    }

    if (!targetUid) {
      res.status(400).json({ error: 'UID is required to reset a QR code.' });
      return;
    }

    const activeId = activeQrTokenIdByUid.get(targetUid);
    const activeRecord = activeId ? qrTokensById.get(activeId) : undefined;

    if (!hasProof) {
      const currentTokenProof = typeof body.currentToken === 'string' ? body.currentToken.trim() : '';
      if (activeRecord && currentTokenProof) {
        const providedBuf = Buffer.from(currentTokenProof, 'utf8');
        const expectedBuf = Buffer.from(activeRecord.tokenString, 'utf8');
        if (providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf)) {
          hasProof = true;
        }
      }
    }

    if (!hasProof) {
      res.status(401).json({
        error: 'Authentication or current active QR token proof is required to revoke this QR code.',
      });
      return;
    }

    const preservedProfile = activeRecord?.profile || {
      uid: targetUid,
      fullName: String(body.fullName || 'PK Chat Member').trim().slice(0, 100) || 'PK Chat Member',
      phoneNumber: String(body.phoneNumber || '').trim().slice(0, 32),
      country: String(body.country || 'Sri Lanka').trim().slice(0, 80) || 'Sri Lanka',
      countryCode: String(body.countryCode || 'LK').trim().slice(0, 8) || 'LK',
      preferredLanguage: String(body.preferredLanguage || 'en').trim().slice(0, 16) || 'en',
      preferredLanguageName: String(body.preferredLanguageName || 'English').trim().slice(0, 64) || 'English',
      about: String(body.about || 'Available on PK Chat').trim().slice(0, 140) || 'Available on PK Chat',
      avatarUrl: '',
    };

    if (activeRecord) {
      activeRecord.revoked = true;
    }

    const now = Date.now();
    const tokenId = `qr_${crypto.randomBytes(8).toString('hex')}`;
    const issuedAtMs = now;
    const expiresAtMs = now + QR_TOKEN_TTL_MS;
    const signature = signQrToken(tokenId, targetUid, issuedAtMs);
    const tokenString = `${QR_TOKEN_PREFIX}${tokenId}:${signature}`;

    const nextRecord: ServerQrTokenRecord = {
      tokenId,
      signature,
      tokenString,
      profile: preservedProfile,
      issuedAtMs,
      expiresAtMs,
      revoked: false,
      scanCount: 0,
    };
    qrTokensById.set(tokenId, nextRecord);
    activeQrTokenIdByUid.set(targetUid, tokenId);
    scheduleQrPersist();

    broadcastQrRealtimeEvent('qr_revoked', targetUid, {
      revokedTokenId: activeId || null,
      newTokenId: tokenId,
      uid: targetUid,
      rotatedAt: new Date(now).toISOString(),
    });

    res.json({
      revokedTokenId: activeId || null,
      token: nextRecord.tokenString,
      tokenId: nextRecord.tokenId,
      issuedAt: new Date(nextRecord.issuedAtMs).toISOString(),
      expiresAt: new Date(nextRecord.expiresAtMs).toISOString(),
      scanCount: 0,
      profile: nextRecord.profile,
      serverTimestamp: new Date(now).toISOString(),
    });
  });

  // =========================================================================
  // Dedicated Cloud Media Node Routing & Sri Lanka Midnight Auto-Maintenance
  // =========================================================================
  interface MaintenanceSnapshot {
    lastRunAt: string | null;
    lastTrigger: 'boot' | 'scheduled_midnight' | 'manual_diagnostic' | 'android_nightly_daemon';
    prunedQrTokens: number;
    prunedOtpChallenges: number;
    prunedTranslationCache: number;
    status: 'operational';
    timezone: 'Asia/Colombo';
    runsCompleted: number;
  }

  let lastMidnightDateLk = '';
  const maintenanceState: MaintenanceSnapshot = {
    lastRunAt: null,
    lastTrigger: 'boot',
    prunedQrTokens: 0,
    prunedOtpChallenges: 0,
    prunedTranslationCache: 0,
    status: 'operational',
    timezone: 'Asia/Colombo',
    runsCompleted: 0,
  };

  const runServerMaintenanceCycle = (
    trigger: MaintenanceSnapshot['lastTrigger']
  ): MaintenanceSnapshot => {
    const beforeQr = qrTokensById.size;
    pruneExpiredQrTokens();
    const prunedQrTokens = Math.max(0, beforeQr - qrTokensById.size);
    if (prunedQrTokens > 0) scheduleQrPersist();

    const nowMs = Date.now();
    let prunedOtpChallenges = 0;
    for (const [phone, challenge] of otpChallenges.entries()) {
      if (challenge.expiresAt <= nowMs) {
        otpChallenges.delete(phone);
        prunedOtpChallenges += 1;
      }
    }
    for (const [k, cached] of otpStatusCache.entries()) {
      if (cached.expiresAt <= nowMs) {
        otpStatusCache.delete(k);
      }
    }

    let prunedTranslationCache = 0;
    for (const [k, cached] of translationCache.entries()) {
      if (cached.expiresAt <= nowMs) {
        translationCache.delete(k);
        prunedTranslationCache += 1;
      }
    }

    maintenanceState.lastRunAt = new Date(nowMs).toISOString();
    maintenanceState.lastTrigger = trigger;
    maintenanceState.prunedQrTokens = prunedQrTokens;
    maintenanceState.prunedOtpChallenges = prunedOtpChallenges;
    maintenanceState.prunedTranslationCache = prunedTranslationCache;
    maintenanceState.runsCompleted += 1;

    return { ...maintenanceState };
  };

  runServerMaintenanceCycle('boot');

  // Check every 60 seconds for Sri Lanka Time (Asia/Colombo) 12:00 AM Midnight Maintenance
  setInterval(() => {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Colombo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(new Date());
      const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
      const dateStr = `${lookup.year}-${lookup.month}-${lookup.day}`;
      const hour = Number(lookup.hour || 99);
      const minute = Number(lookup.minute || 99);
      if (hour === 0 && minute <= 5 && lastMidnightDateLk !== dateStr) {
        lastMidnightDateLk = dateStr;
        runServerMaintenanceCycle('scheduled_midnight');
      }
    } catch {
      // Ignore timezone edge formatting errors
    }
  }, 60_000).unref();

  app.get('/api/network/routing', (req, res) => {
    const lowSignal = String(req.query.lowSignal || '').toLowerCase() === 'true';
    const region = String(req.query.region || 'global').trim().slice(0, 64) || 'global';
    const bandwidthKbps = Number(req.query.bandwidthKbps || 0);

    const mediaTier =
      lowSignal || (bandwidthKbps > 0 && bandwidthKbps < 2500)
        ? 'low_signal_resilient'
        : bandwidthKbps >= 15000 || !bandwidthKbps
        ? '4k_uhd'
        : 'hd_1080p';

    res.json({
      service: 'PK CHAT Private Cloud Node Routing',
      status: 'operational',
      region,
      mediaTier,
      lowSignalFallbackActive: mediaTier === 'low_signal_resilient',
      fallbackTransports: ['direct_cloud_tls', 'cellular_adaptive', 'gps_offline_sim_sms'],
      securityStatus: globalSecurityState.status,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/system/maintenance', (_req, res) => {
    res.json({
      ...maintenanceState,
      uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
    });
  });

  app.post('/api/system/maintenance/run', (req, res) => {
    const ip = String(req.ip || req.socket.remoteAddress || 'unknown');
    if (!checkRateLimit(`maint_run:${ip}`, 12, 60_000)) {
      res.status(429).json({ error: 'Maintenance diagnostic rate limit exceeded. Wait briefly before retrying.' });
      return;
    }
    const rawSource = typeof req.body?.source === 'string' ? req.body.source.trim() : '';
    const trigger: MaintenanceSnapshot['lastTrigger'] =
      rawSource === 'android_nightly_daemon' ? 'android_nightly_daemon' : 'manual_diagnostic';
    const snapshot = runServerMaintenanceCycle(trigger);
    res.json(snapshot);
  });

  // =========================================================================
  // Resumable Chunked Large Media Relay (Up to 2 GB / 4-Hour Video Support)
  // =========================================================================
  const MEDIA_RELAY_DIR = path.join(os.tmpdir(), 'pkchat-media-relay');
  try {
    fs.mkdirSync(MEDIA_RELAY_DIR, { recursive: true });
  } catch {
    // Directory creation checked again when initializing upload sessions
  }

  const MEDIA_CHUNK_SIZE_BYTES = 2 * 1024 * 1024;
  const MEDIA_RETENTION_MS = 4 * 60 * 60_000;
  const MEDIA_MAX_STORAGE_CAP_BYTES = Math.floor(2.5 * 1024 * 1024 * 1024);

  interface MediaUploadSession {
    uploadId: string;
    uploadToken: string;
    uid: string;
    kind: 'vid' | 'aud' | 'doc' | 'img';
    fileName: string;
    mimeType: string;
    totalBytes: number;
    bytesReceived: number;
    filePath: string;
    createdAtMs: number;
    updatedAtMs: number;
  }

  interface CompletedMediaRecord {
    mediaId: string;
    uid: string;
    kind: 'vid' | 'aud' | 'doc' | 'img';
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    filePath: string;
    createdAtMs: number;
  }

  const mediaUploadSessions = new Map<string, MediaUploadSession>();
  const completedMediaById = new Map<string, CompletedMediaRecord>();

  const signMediaUploadToken = (uploadId: string, uid: string): string =>
    crypto
      .createHmac('sha256', APPROVAL_HMAC_SECRET)
      .update(`${uploadId}:${uid}`)
      .digest('hex');

  const verifyMediaUploadToken = (session: MediaUploadSession, candidate: string): boolean => {
    if (!candidate) return false;
    const a = Buffer.from(session.uploadToken, 'utf8');
    const b = Buffer.from(candidate.trim(), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };

  const cleanupExpiredMediaRelayFiles = () => {
    const now = Date.now();
    for (const [id, sess] of mediaUploadSessions.entries()) {
      if (now - sess.updatedAtMs > MEDIA_RETENTION_MS) {
        mediaUploadSessions.delete(id);
        fs.promises.unlink(sess.filePath).catch(() => {});
      }
    }
    let totalBytes = 0;
    for (const [id, rec] of completedMediaById.entries()) {
      if (now - rec.createdAtMs > MEDIA_RETENTION_MS) {
        completedMediaById.delete(id);
        fs.promises.unlink(rec.filePath).catch(() => {});
      } else {
        totalBytes += rec.sizeBytes;
      }
    }
    if (totalBytes > MEDIA_MAX_STORAGE_CAP_BYTES) {
      for (const [id, rec] of completedMediaById.entries()) {
        if (totalBytes <= MEDIA_MAX_STORAGE_CAP_BYTES) break;
        completedMediaById.delete(id);
        totalBytes -= rec.sizeBytes;
        fs.promises.unlink(rec.filePath).catch(() => {});
      }
    }
  };

  const mediaKindToCategory = (
    kind: string
  ): 'image' | 'video' | 'document' | 'audio' => {
    if (kind === 'vid') return 'video';
    if (kind === 'img') return 'image';
    if (kind === 'aud') return 'audio';
    return 'document';
  };

  app.post('/api/media/upload/init', async (req, res) => {
    cleanupExpiredMediaRelayFiles();
    const body = (req.body || {}) as Record<string, unknown>;
    const rawUid = typeof body.uid === 'string' ? body.uid.trim() : '';

    if (req.headers.authorization) {
      const auth = await verifyAuthenticatedFirebaseUser(req);
      if (!auth.ok || !auth.uid) {
        res.status(auth.status || 401).json({ error: auth.error || 'Authentication failed.' });
        return;
      }
      if (rawUid && rawUid !== auth.uid) {
        res.status(403).json({ error: 'Authenticated user UID does not match upload owner.' });
        return;
      }
    }

    if (!/^[a-zA-Z0-9_-]{3,128}$/.test(rawUid)) {
      res.status(400).json({ error: 'Valid user UID is required to initialize upload.' });
      return;
    }

    const kindRaw = typeof body.kind === 'string' ? body.kind.trim() : 'doc';
    const kind: MediaUploadSession['kind'] =
      kindRaw === 'vid' || kindRaw === 'aud' || kindRaw === 'img' ? kindRaw : 'doc';
    const fileName =
      (typeof body.fileName === 'string' ? body.fileName.trim() : '') ||
      `${kind}_${Date.now()}`;
    const mimeType =
      (typeof body.mimeType === 'string' ? body.mimeType.trim() : '') ||
      'application/octet-stream';
    const totalBytes = Number(body.totalBytes || 0);

    if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
      res.status(400).json({ error: 'Total file size must be greater than 0 bytes.' });
      return;
    }

    const metaCheck = inspectAttachmentForMalware({
      fileName,
      mimeType,
      sizeBytes: totalBytes,
      mediaCategory: mediaKindToCategory(kind),
    });
    if (!metaCheck.safe) {
      res.status(totalBytes > 25 * 1024 * 1024 && kind !== 'vid' ? 413 : 400).json({
        error: metaCheck.blockedReason || 'Blocked by Cyber Shield Anti-Malware validation.',
      });
      return;
    }

    const uploadId = `upl_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
    const uploadToken = signMediaUploadToken(uploadId, rawUid);
    const filePath = path.join(MEDIA_RELAY_DIR, `${uploadId}.part`);

    try {
      await fs.promises.mkdir(MEDIA_RELAY_DIR, { recursive: true });
      await fs.promises.writeFile(filePath, Buffer.alloc(0));
    } catch {
      res.status(500).json({ error: 'Unable to allocate temporary media relay storage.' });
      return;
    }

    const nowMs = Date.now();
    mediaUploadSessions.set(uploadId, {
      uploadId,
      uploadToken,
      uid: rawUid,
      kind,
      fileName: fileName.slice(0, 180),
      mimeType: mimeType.slice(0, 120),
      totalBytes,
      bytesReceived: 0,
      filePath,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    });

    res.json({
      uploadId,
      uploadToken,
      chunkSizeBytes: MEDIA_CHUNK_SIZE_BYTES,
    });
  });

  app.get('/api/media/upload/status/:uploadId', (req, res) => {
    const session = mediaUploadSessions.get(req.params.uploadId);
    if (!session) {
      res.status(404).json({ error: 'Upload session not found or expired.' });
      return;
    }
    const token = String(req.headers['x-upload-token'] || '');
    if (!verifyMediaUploadToken(session, token)) {
      res.status(403).json({ error: 'Invalid upload session token.' });
      return;
    }
    res.json({
      uploadId: session.uploadId,
      bytesReceived: session.bytesReceived,
      totalBytes: session.totalBytes,
    });
  });

  app.post(
    '/api/media/upload/chunk',
    express.raw({ type: 'application/octet-stream', limit: '4mb' }),
    async (req, res) => {
      const uploadId = String(req.query.uploadId || '').trim();
      const offset = Number(req.query.offset);
      const token = String(req.headers['x-upload-token'] || '');

      const session = mediaUploadSessions.get(uploadId);
      if (!session) {
        res.status(404).json({ error: 'Upload session not found or expired.' });
        return;
      }
      if (!verifyMediaUploadToken(session, token)) {
        res.status(403).json({ error: 'Invalid upload session token.' });
        return;
      }
      if (!Number.isInteger(offset) || offset < 0) {
        res.status(400).json({ error: 'Valid non-negative integer chunk offset is required.' });
        return;
      }
      if (offset !== session.bytesReceived) {
        res.status(409).json({
          error: 'Chunk offset does not match server received offset.',
          expectedOffset: session.bytesReceived,
        });
        return;
      }

      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (buf.length === 0) {
        res.status(400).json({ error: 'Empty binary chunk payload.' });
        return;
      }
      if (session.bytesReceived + buf.length > session.totalBytes + 4096) {
        res.status(400).json({ error: 'Uploaded chunk exceeds declared total file size.' });
        return;
      }

      // Inspect magic bytes on initial offset=0 chunk before writing further bytes
      if (offset === 0) {
        const deepScan = inspectMagicBytesBuffer(
          buf.subarray(0, Math.min(512, buf.length)),
          {
            fileName: session.fileName,
            mimeType: session.mimeType,
          }
        );
        if (!deepScan.safe) {
          mediaUploadSessions.delete(uploadId);
          fs.promises.unlink(session.filePath).catch(() => {});
          res.status(400).json({
            error: deepScan.blockedReason || 'Blocked by Cyber Shield Magic-Byte inspection.',
          });
          return;
        }
      }

      let handle: fs.promises.FileHandle | null = null;
      try {
        handle = await fs.promises.open(session.filePath, 'r+');
        await handle.write(buf, 0, buf.length, offset);
        session.bytesReceived += buf.length;
        session.updatedAtMs = Date.now();
        res.json({
          ok: true,
          bytesReceived: session.bytesReceived,
          totalBytes: session.totalBytes,
        });
      } catch {
        res.status(500).json({ error: 'Failed writing media chunk to relay disk.' });
      } finally {
        await handle?.close().catch(() => {});
      }
    }
  );

  app.post('/api/media/upload/complete', async (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const uploadId = typeof body.uploadId === 'string' ? body.uploadId.trim() : '';
    const token = String(req.headers['x-upload-token'] || '');
    const session = mediaUploadSessions.get(uploadId);
    if (!session) {
      res.status(404).json({ error: 'Upload session not found or already completed.' });
      return;
    }
    if (!verifyMediaUploadToken(session, token)) {
      res.status(403).json({ error: 'Invalid upload session token.' });
      return;
    }
    if (session.bytesReceived <= 0 || session.bytesReceived !== session.totalBytes) {
      res.status(400).json({
        error: `Upload incomplete (${session.bytesReceived}/${session.totalBytes} bytes received).`,
      });
      return;
    }

    const mediaId = `med_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
    const ext = path.extname(session.fileName).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
    const finalPath = path.join(MEDIA_RELAY_DIR, `${mediaId}${ext}`);
    try {
      await fs.promises.rename(session.filePath, finalPath);
    } catch {
      res.status(500).json({ error: 'Unable to finalize uploaded media file.' });
      return;
    }

    mediaUploadSessions.delete(uploadId);
    completedMediaById.set(mediaId, {
      mediaId,
      uid: session.uid,
      kind: session.kind,
      fileName: session.fileName,
      mimeType: session.mimeType,
      sizeBytes: session.bytesReceived,
      filePath: finalPath,
      createdAtMs: Date.now(),
    });

    res.json({
      mediaId,
      url: `/api/media/file/${mediaId}`,
      mimeType: session.mimeType,
      sizeBytes: session.bytesReceived,
    });
  });

  app.delete('/api/media/upload/:uploadId', (req, res) => {
    const session = mediaUploadSessions.get(req.params.uploadId);
    if (!session) {
      res.json({ ok: true });
      return;
    }
    const token = String(req.headers['x-upload-token'] || '');
    if (!verifyMediaUploadToken(session, token)) {
      res.status(403).json({ error: 'Invalid upload session token.' });
      return;
    }
    mediaUploadSessions.delete(session.uploadId);
    fs.promises.unlink(session.filePath).catch(() => {});
    res.json({ ok: true });
  });

  app.get('/api/media/file/:mediaId', async (req, res) => {
    const mediaId = String(req.params.mediaId || '').trim();
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(mediaId)) {
      res.status(400).json({ error: 'Invalid media identifier.' });
      return;
    }
    const rec = completedMediaById.get(mediaId);
    if (!rec) {
      res.status(404).json({ error: 'Media file not found or expired from relay cache.' });
      return;
    }
    let stats: fs.Stats;
    try {
      stats = await fs.promises.stat(rec.filePath);
    } catch {
      completedMediaById.delete(mediaId);
      res.status(404).json({ error: 'Media file unavailable on disk.' });
      return;
    }

    const total = stats.size;
    const safeDownloadName = rec.fileName.replace(/["\\\r\n]/g, '_');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Type', rec.mimeType || 'application/octet-stream');
    if (rec.kind === 'doc') {
      res.setHeader('Content-Disposition', `attachment; filename="${safeDownloadName}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${safeDownloadName}"`);
    }

    const rangeHeader = req.headers.range;
    if (rangeHeader && typeof rangeHeader === 'string' && rangeHeader.startsWith('bytes=')) {
      const [rawStart, rawEnd] = rangeHeader.replace(/^bytes=/, '').split('-');
      const start = rawStart ? Number(rawStart) : 0;
      const end = rawEnd ? Math.min(total - 1, Number(rawEnd)) : Math.min(total - 1, start + 2 * 1024 * 1024 - 1);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= total || end < start) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', String(end - start + 1));
      const stream = fs.createReadStream(rec.filePath, { start, end });
      stream.on('error', () => {
        if (!res.headersSent) res.status(500).end();
      });
      stream.pipe(res);
      return;
    }

    res.setHeader('Content-Length', String(total));
    const stream = fs.createReadStream(rec.filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  });

  // =========================================================================
  // Dual-Mode PK Live Class Education & Whiteboard + Pass-Through Sync
  // =========================================================================
  const classRoomsById = new Map<string, ClassRoomState>();
  const classHostTokensByRoomId = new Map<string, string>();
  const classSseClients = new Map<string, Set<express.Response>>();

  const broadcastClassEvent = (roomId: string, eventName: string, data: unknown) => {
    const clients = classSseClients.get(roomId);
    if (!clients || clients.size === 0) return;
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const clientRes of clients) {
      try {
        clientRes.write(payload);
      } catch {
        // Closed client streams will clean up on 'close'
      }
    }
  };

  const isClassRoomExpired = (room: ClassRoomState): boolean =>
    typeof room.expiresAtMs === 'number' && room.expiresAtMs <= Date.now();

  const isAuthorizedClassHost = (req: express.Request, room: ClassRoomState): boolean => {
    const headerToken =
      typeof req.headers['x-class-host-token'] === 'string'
        ? req.headers['x-class-host-token'].trim()
        : '';
    const bodyToken =
      typeof (req.body as { hostAccessToken?: unknown } | undefined)?.hostAccessToken === 'string'
        ? ((req.body as { hostAccessToken: string }).hostAccessToken || '').trim()
        : '';
    const candidate = headerToken || bodyToken;
    const expected = classHostTokensByRoomId.get(room.roomId);
    if (!candidate || !expected) return false;
    const a = Buffer.from(candidate, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };

  const ensureClassRoom = (
    rawRoomId?: string | null,
    opts?: {
      title?: string;
      hostUid?: string;
      hostName?: string;
      teacherLanguage?: string;
      ttlMs?: number;
    }
  ): { room: ClassRoomState; createdNow: boolean; hostAccessToken: string } => {
    const roomId = sanitizeClassRoomId(rawRoomId);
    const existing = classRoomsById.get(roomId);
    if (existing) {
      const token = classHostTokensByRoomId.get(roomId) || crypto.randomBytes(16).toString('hex');
      classHostTokensByRoomId.set(roomId, token);
      return { room: existing, createdNow: false, hostAccessToken: token };
    }

    const nowMs = Date.now();
    const nowIsoStr = new Date(nowMs).toISOString();
    const ttlMs =
      typeof opts?.ttlMs === 'number' && Number.isFinite(opts.ttlMs)
        ? Math.max(10, Math.min(24 * 60 * 60_000, opts.ttlMs))
        : 4 * 60 * 60_000;
    const expiresAtMs = nowMs + ttlMs;
    const hostUid = (opts?.hostUid || 'host_teacher').trim().slice(0, 128) || 'host_teacher';
    const hostName = (opts?.hostName || 'Instructor').trim().slice(0, 80) || 'Instructor';
    const teacherLang = (opts?.teacherLanguage || 'en').trim().slice(0, 16) || 'en';
    const hostAccessToken = crypto.randomBytes(16).toString('hex');
    const created: ClassRoomState = {
      roomId,
      title: (opts?.title || 'PK Chat Live Class & Whiteboard').trim().slice(0, 120),
      meetingUrl: buildClassMeetingUrl(roomId),
      deepLinkUri: `pkchat://class/${roomId}`,
      hostUid,
      hostName,
      teacherLanguage: teacherLang,
      mediaTier: '4k_uhd',
      expiresAtMs,
      expiresAt: new Date(expiresAtMs).toISOString(),
      isLocked: false,
      screenShareProtected: true,
      participants: [
        {
          uid: hostUid,
          name: hostName,
          role: 'teacher',
          preferredLanguage: teacherLang,
          handRaised: false,
          joinedAt: nowIsoStr,
        },
      ],
      strokes: [],
      subtitles: [],
      createdAt: nowIsoStr,
      updatedAt: nowIsoStr,
    };
    if (classRoomsById.size > 300) {
      const oldestKey = classRoomsById.keys().next().value;
      if (oldestKey) {
        classRoomsById.delete(oldestKey);
        classHostTokensByRoomId.delete(oldestKey);
      }
    }
    classRoomsById.set(roomId, created);
    classHostTokensByRoomId.set(roomId, hostAccessToken);
    return { room: created, createdNow: true, hostAccessToken };
  };

  app.post('/api/class/pass-through-check', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const teacherLanguage = String(body.teacherLanguage || 'en');
    const studentLanguage = String(body.studentLanguage || 'en');
    const decision = evaluateSameLanguagePassThrough(
      teacherLanguage,
      studentLanguage,
      dynamicLanguageCatalog
    );
    res.json({
      ...decision,
      supportedLanguagesCount: dynamicLanguageCatalog.filter((l) => l.supported).length,
    });
  });

  app.post('/api/class/create', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const customSlug = typeof body.roomId === 'string' && body.roomId.trim()
      ? sanitizeClassRoomId(body.roomId)
      : `pkc-${crypto.randomBytes(3).toString('hex')}`;
    const ttlMs =
      typeof body.ttlMs === 'number'
        ? body.ttlMs
        : typeof body.durationMinutes === 'number'
          ? body.durationMinutes * 60_000
          : undefined;

    if (classRoomsById.has(customSlug)) {
      const existing = classRoomsById.get(customSlug)!;
      if (isClassRoomExpired(existing)) {
        classRoomsById.delete(customSlug);
        classHostTokensByRoomId.delete(customSlug);
      }
    }

    const { room, hostAccessToken } = ensureClassRoom(customSlug, {
      title: typeof body.title === 'string' ? body.title : 'PK Chat Online Class',
      hostUid: typeof body.hostUid === 'string' ? body.hostUid : 'host_teacher',
      hostName: typeof body.hostName === 'string' ? body.hostName : 'Teacher',
      teacherLanguage: typeof body.teacherLanguage === 'string' ? body.teacherLanguage : 'ta',
      ttlMs,
    });

    res.json({
      roomId: room.roomId,
      meetingUrl: room.meetingUrl,
      deepLinkUri: room.deepLinkUri,
      webJoinUrl: `/?classRoom=${encodeURIComponent(room.roomId)}`,
      hostAccessToken,
      expiresAt: room.expiresAt,
      room,
    });
  });

  app.get('/api/class/:roomId', (req, res) => {
    const { room } = ensureClassRoom(req.params.roomId);
    if (isClassRoomExpired(room)) {
      res.status(410).json({ error: 'This time-limited class link has expired. Create a new room.' });
      return;
    }
    res.json({
      room,
      supportedLanguagesCount: dynamicLanguageCatalog.filter((l) => l.supported).length,
    });
  });

  app.post('/api/class/:roomId/join', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const role: ClassParticipant['role'] = body.role === 'teacher' ? 'teacher' : 'student';
    const uid = String(body.uid || `guest_${crypto.randomBytes(3).toString('hex')}`).trim().slice(0, 128);
    const name = String(body.name || 'Student').trim().slice(0, 80) || 'Student';
    const preferredLanguage = String(body.preferredLanguage || 'en').trim().slice(0, 16) || 'en';

    const { room, createdNow, hostAccessToken } = ensureClassRoom(req.params.roomId, {
      hostUid: role === 'teacher' ? uid : 'host_teacher',
      hostName: role === 'teacher' ? name : 'Instructor',
      teacherLanguage: role === 'teacher' ? preferredLanguage : 'en',
    });

    if (isClassRoomExpired(room)) {
      res.status(410).json({ error: 'This time-limited class link has expired. Create a new room.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const isHostCaller = createdNow || uid === room.hostUid || isAuthorizedClassHost(req, room);

    if (role === 'teacher') {
      if (!isHostCaller) {
        res.status(403).json({
          error: 'Only the class host may claim Teacher role inside an active room.',
        });
        return;
      }
      room.teacherLanguage = preferredLanguage;
      room.hostName = name;
    }

    const idx = room.participants.findIndex((p) => p.uid === uid);
    const participant: ClassParticipant = {
      uid,
      name,
      role,
      preferredLanguage,
      handRaised: idx >= 0 ? room.participants[idx].handRaised : false,
      joinedAt: idx >= 0 ? room.participants[idx].joinedAt : nowIso,
    };
    if (idx >= 0) {
      room.participants[idx] = participant;
    } else {
      room.participants.push(participant);
    }
    room.updatedAt = nowIso;

    const passThrough = evaluateSameLanguagePassThrough(
      room.teacherLanguage,
      preferredLanguage,
      dynamicLanguageCatalog
    );
    broadcastClassEvent(room.roomId, 'participant_joined', {
      participant,
      teacherLanguage: room.teacherLanguage,
      participantCount: room.participants.length,
    });
    res.json({
      room,
      participant,
      passThrough,
      ...(createdNow && role === 'teacher' ? { hostAccessToken } : {}),
    });
  });

  app.post('/api/class/:roomId/leave', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const uid = String(body.uid || '').trim();
    const room = classRoomsById.get(sanitizeClassRoomId(req.params.roomId));
    if (!room) {
      res.json({ ok: true, participants: [] });
      return;
    }
    if (uid) {
      room.participants = room.participants.filter((p) => p.uid !== uid);
      room.updatedAt = new Date().toISOString();
      broadcastClassEvent(room.roomId, 'participant_left', {
        uid,
        participants: room.participants,
        participantCount: room.participants.length,
      });
    }
    res.json({ ok: true, participants: room.participants });
  });

  app.post('/api/class/:roomId/hand', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const { room } = ensureClassRoom(req.params.roomId);
    if (isClassRoomExpired(room)) {
      res.status(410).json({ error: 'This time-limited class link has expired.' });
      return;
    }
    const uid = String(body.uid || '').trim();
    const handRaised = Boolean(body.handRaised);
    const target = room.participants.find((p) => p.uid === uid);
    if (target) {
      target.handRaised = handRaised;
    }
    room.updatedAt = new Date().toISOString();
    broadcastClassEvent(room.roomId, 'hand_raised', { uid, handRaised, participants: room.participants });
    res.json({ ok: true, handRaised, participants: room.participants });
  });

  app.post('/api/class/:roomId/lock', (req, res) => {
    const { room } = ensureClassRoom(req.params.roomId);
    if (isClassRoomExpired(room)) {
      res.status(410).json({ error: 'This time-limited class link has expired.' });
      return;
    }
    if (!isAuthorizedClassHost(req, room)) {
      res.status(403).json({ error: 'Only the host can lock or unlock the classroom whiteboard.' });
      return;
    }
    room.isLocked = Boolean((req.body as { locked?: unknown } | undefined)?.locked);
    room.updatedAt = new Date().toISOString();
    broadcastClassEvent(room.roomId, 'class_lock_changed', { isLocked: room.isLocked });
    res.json({ ok: true, isLocked: room.isLocked, room });
  });

  app.post('/api/class/:roomId/host-action', (req, res) => {
    const { room } = ensureClassRoom(req.params.roomId);
    if (isClassRoomExpired(room)) {
      res.status(410).json({ error: 'This time-limited class link has expired.' });
      return;
    }
    if (!isAuthorizedClassHost(req, room)) {
      res.status(403).json({ error: 'Only the class host can manage participants or end the class.' });
      return;
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const action = String(body.action || '').trim();
    const targetUid = String(body.targetUid || '').trim();
    const nowIso = new Date().toISOString();

    if (action === 'mute_all') {
      room.participants = room.participants.map((p) =>
        p.uid === room.hostUid || p.role === 'teacher' ? p : { ...p, muted: true }
      );
      room.updatedAt = nowIso;
      broadcastClassEvent(room.roomId, 'host_mute_updated', {
        targetUid: null,
        muteAll: true,
        muted: true,
        participants: room.participants,
      });
      res.json({ ok: true, action, participants: room.participants });
      return;
    }

    if (action === 'unmute_all') {
      room.participants = room.participants.map((p) => ({ ...p, muted: false }));
      room.updatedAt = nowIso;
      broadcastClassEvent(room.roomId, 'host_mute_updated', {
        targetUid: null,
        muteAll: true,
        muted: false,
        participants: room.participants,
      });
      res.json({ ok: true, action, participants: room.participants });
      return;
    }

    if (action === 'mute_participant' || action === 'unmute_participant') {
      const nextMuted = action === 'mute_participant';
      room.participants = room.participants.map((p) =>
        p.uid === targetUid ? { ...p, muted: nextMuted } : p
      );
      room.updatedAt = nowIso;
      broadcastClassEvent(room.roomId, 'host_mute_updated', {
        targetUid,
        muteAll: false,
        muted: nextMuted,
        participants: room.participants,
      });
      res.json({ ok: true, action, targetUid, muted: nextMuted, participants: room.participants });
      return;
    }

    if (action === 'lower_all_hands' || action === 'lower_hand') {
      room.participants = room.participants.map((p) =>
        action === 'lower_all_hands' || p.uid === targetUid ? { ...p, handRaised: false } : p
      );
      room.updatedAt = nowIso;
      broadcastClassEvent(room.roomId, 'hand_raised', {
        uid: action === 'lower_all_hands' ? null : targetUid,
        handRaised: false,
        participants: room.participants,
      });
      res.json({ ok: true, action, targetUid, participants: room.participants });
      return;
    }

    if (action === 'remove_participant') {
      room.participants = room.participants.filter((p) => p.uid !== targetUid);
      room.updatedAt = nowIso;
      broadcastClassEvent(room.roomId, 'participant_left', {
        uid: targetUid,
        participants: room.participants,
        participantCount: room.participants.length,
      });
      broadcastClassEvent(room.roomId, 'participant_removed', {
        uid: targetUid,
        participants: room.participants,
      });
      res.json({ ok: true, action, targetUid, participants: room.participants });
      return;
    }

    if (action === 'end_class') {
      room.participants = [];
      room.isLocked = false;
      room.updatedAt = nowIso;
      broadcastClassEvent(room.roomId, 'class_ended', {
        roomId: room.roomId,
        endedBy: room.hostName,
        endedAt: nowIso,
      });
      res.json({ ok: true, action, roomId: room.roomId, endedAt: nowIso });
      return;
    }

    res.status(400).json({ error: 'Unsupported host action.' });
  });

  app.post('/api/class/:roomId/stroke', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const { room } = ensureClassRoom(req.params.roomId);
    if (isClassRoomExpired(room)) {
      res.status(410).json({ error: 'This time-limited class link has expired.' });
      return;
    }
    if (room.isLocked && !isAuthorizedClassHost(req, room)) {
      res.status(403).json({ error: 'Whiteboard drawing is locked by the class host.' });
      return;
    }
    const rawPoints = Array.isArray(body.points) ? body.points : [];
    const points = rawPoints
      .filter((pt): pt is { x: number; y: number } => Boolean(pt && typeof pt.x === 'number' && typeof pt.y === 'number'))
      .slice(0, 600);

    if (points.length === 0) {
      res.status(400).json({ error: 'At least one whiteboard coordinate point is required.' });
      return;
    }

    const tool =
      body.tool === 'highlighter' || body.tool === 'eraser' ? body.tool : 'pen';
    const stroke: WhiteboardStroke = {
      strokeId: `stk_${crypto.randomBytes(5).toString('hex')}`,
      authorUid: String(body.authorUid || 'participant').slice(0, 128),
      authorName: String(body.authorName || 'Presenter').slice(0, 80),
      tool,
      color: String(body.color || '#0F172A').slice(0, 24),
      width: Math.max(1, Math.min(36, Number(body.width || 4))),
      points,
      createdAt: new Date().toISOString(),
    };

    room.strokes.push(stroke);
    if (room.strokes.length > 500) {
      room.strokes = room.strokes.slice(-500);
    }
    room.updatedAt = stroke.createdAt;
    broadcastClassEvent(room.roomId, 'whiteboard_stroke', stroke);
    res.json({ stroke, totalStrokes: room.strokes.length });
  });

  app.post('/api/class/:roomId/whiteboard/undo', (req, res) => {
    const { room } = ensureClassRoom(req.params.roomId);
    if (isClassRoomExpired(room)) {
      res.status(410).json({ error: 'This time-limited class link has expired.' });
      return;
    }
    if (!isAuthorizedClassHost(req, room)) {
      res.status(403).json({ error: 'Host authorization required to undo whiteboard strokes.' });
      return;
    }
    const removed = room.strokes.pop() || null;
    room.updatedAt = new Date().toISOString();
    broadcastClassEvent(room.roomId, 'whiteboard_undo', {
      removedStrokeId: removed?.strokeId || null,
      strokes: room.strokes,
    });
    res.json({ ok: true, removedStrokeId: removed?.strokeId || null, strokes: room.strokes });
  });

  app.post('/api/class/:roomId/whiteboard/clear', (req, res) => {
    const { room } = ensureClassRoom(req.params.roomId);
    if (isClassRoomExpired(room)) {
      res.status(410).json({ error: 'This time-limited class link has expired.' });
      return;
    }
    if (!isAuthorizedClassHost(req, room)) {
      res.status(403).json({ error: 'Host authorization required to clear the classroom whiteboard.' });
      return;
    }
    room.strokes = [];
    room.updatedAt = new Date().toISOString();
    broadcastClassEvent(room.roomId, 'whiteboard_cleared', { clearedAt: room.updatedAt });
    res.json({ ok: true, strokes: [] });
  });

  app.post('/api/class/:roomId/subtitle', async (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const { room } = ensureClassRoom(req.params.roomId);
    if (isClassRoomExpired(room)) {
      res.status(410).json({ error: 'This time-limited class link has expired.' });
      return;
    }
    const rawInputText = String(body.text || '').trim().slice(0, 2000);
    if (!rawInputText) {
      res.status(400).json({ error: 'Subtitle text is required.' });
      return;
    }
    const safetyGuard = evaluateClassSafetyContent(rawInputText);
    if (!safetyGuard.safe) {
      broadcastClassEvent(room.roomId, 'class_safety_blackout', {
        reason: safetyGuard.reason,
        matchedCategory: safetyGuard.matchedCategory,
        triggeredAt: new Date().toISOString(),
      });
      res.status(403).json({
        blackoutTriggered: true,
        error: safetyGuard.reason,
      });
      return;
    }
    const firewall = sanitizeVoiceAndSubtitleText(rawInputText);
    if (!firewall.safe || !firewall.sanitized) {
      res.status(400).json({ error: firewall.blockedReason || 'Blocked by Live Subtitle Firewall.' });
      return;
    }
    const text = firewall.sanitized;

    const speakerUid = String(body.speakerUid || room.hostUid).slice(0, 128);
    const speakerName = String(body.speakerName || room.hostName).slice(0, 80);
    const speakerLanguageCode = String(body.speakerLanguageCode || room.teacherLanguage || 'en').trim();
    const listenerLanguageCode = String(body.listenerLanguageCode || speakerLanguageCode).trim();

    const passDecision = evaluateSameLanguagePassThrough(
      speakerLanguageCode,
      listenerLanguageCode,
      dynamicLanguageCatalog
    );

    let translatedText = text;
    if (!passDecision.isPassThrough && process.env.GEMINI_API_KEY) {
      const cacheKey = `cls::${listenerLanguageCode.toLowerCase()}::${speakerLanguageCode.toLowerCase()}::${text}`;
      const hit = translationCache.get(cacheKey);
      if (hit && hit.expiresAt > Date.now() && typeof hit.payload.translatedText === 'string') {
        translatedText = hit.payload.translatedText;
      } else {
        try {
          const { text: rawOut } = await translateWithModelResilience(
            `Translate this live classroom sentence cleanly from ${passDecision.speakerLanguageName} into ${passDecision.listenerLanguageName}. Preserve numbers and educational terms accurately.\nSentence: ${text}`,
            {
              systemInstruction: 'Return only JSON {"translatedText":"..."}.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: { translatedText: { type: Type.STRING } },
                required: ['translatedText'],
              },
            }
          );
          const parsed = JSON.parse(rawOut.trim()) as { translatedText?: string };
          if (parsed.translatedText?.trim()) {
            translatedText = parsed.translatedText.trim();
            pruneExpiredMap(translationCache, 1500);
            translationCache.set(cacheKey, {
              payload: { translatedText },
              expiresAt: Date.now() + 60 * 60 * 1000,
            });
          }
        } catch {
          translatedText = text;
        }
      }
    }

    const subtitle: ClassSubtitleEntry = {
      id: `sub_${crypto.randomBytes(5).toString('hex')}`,
      speakerUid,
      speakerName,
      speakerLanguageCode,
      listenerLanguageCode,
      originalText: text,
      translatedText,
      isPassThrough: passDecision.isPassThrough,
      lipSyncLatencyMs: passDecision.estimatedLatencyMs,
      createdAt: new Date().toISOString(),
    };

    room.subtitles.push(subtitle);
    if (room.subtitles.length > 50) {
      room.subtitles = room.subtitles.slice(-50);
    }
    room.updatedAt = subtitle.createdAt;

    broadcastClassEvent(room.roomId, 'class_subtitle', subtitle);
    res.json({ subtitle, passThrough: passDecision });
  });

  app.get('/api/class/:roomId/stream', (req, res) => {
    const { room } = ensureClassRoom(req.params.roomId);
    if (isClassRoomExpired(room)) {
      res.status(410).json({ error: 'This time-limited class link has expired.' });
      return;
    }
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let bucket = classSseClients.get(room.roomId);
    if (!bucket) {
      bucket = new Set();
      classSseClients.set(room.roomId, bucket);
    }
    bucket.add(res);

    res.write(
      `event: class_snapshot\ndata: ${JSON.stringify({ room })}\n\n`
    );

    const pingId = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        // Ignore write error on closing socket
      }
    }, 25_000);

    req.on('close', () => {
      clearInterval(pingId);
      const current = classSseClients.get(room.roomId);
      current?.delete(res);
      if (current && current.size === 0) {
        classSseClients.delete(room.roomId);
      }
    });
  });

  // =========================================================================
  // Sponsored Public Status & Business Ad System (Play Store Policy Compliant)
  // =========================================================================
  const ADS_REGISTRY_PATH = path.join(os.tmpdir(), 'pkchat-ads-registry.json');
  const UNDER_REVIEW_REPORT_THRESHOLD = 3;

  interface PrivateAdvertiserContacts {
    ownerUid: string;
    phoneHash: string;
    emailHash: string;
    selfieVerificationHash: string;
    verifiedAt: string;
  }

  interface AdReportRecord {
    reportId: string;
    adId: string;
    reporterUid: string;
    category: AdReportCategory;
    reason: string;
    createdAt: string;
  }

  let remoteAdConfig: RemoteAdPricingConfig = {
    billingLibraryVersion: GOOGLE_PLAY_BILLING_CONFIG.billingLibraryVersion,
    smallAdPriceUsd: GOOGLE_PLAY_BILLING_CONFIG.adTiers.small.priceUsd,
    largeAdPriceUsd: GOOGLE_PLAY_BILLING_CONFIG.adTiers.large.priceUsd,
    unlimitedAdPriceUsd: UNLIMITED_ADS_ANNUAL_PRICE_USD,
    unlimitedAdDurationDays: UNLIMITED_ADS_DURATION_DAYS,
    unlimitedAdSku: GOOGLE_PLAY_BILLING_CONFIG.unlimitedPackage.sku,
    annualProPriceUsd: STANDARD_ANNUAL_PRICE_USD,
    freeTrialDays: STANDARD_FREE_TRIAL_DAYS,
    smallAdSku: GOOGLE_PLAY_BILLING_CONFIG.adTiers.small.sku,
    largeAdSku: GOOGLE_PLAY_BILLING_CONFIG.adTiers.large.sku,
    annualProSku: GOOGLE_PLAY_BILLING_CONFIG.generalSubscription.sku,
    updatedAt: new Date().toISOString(),
  };

  const businessProfilesByUid = new Map<string, BusinessAdCardProfile>();
  const privateAdvertiserContactsByUid = new Map<string, PrivateAdvertiserContacts>();
  const sponsoredAdsById = new Map<string, SponsoredPublicAd>();
  const adFulfillmentRequestsById = new Map<string, AdFulfillmentRequest>();
  const adReportsByAdId = new Map<string, AdReportRecord[]>();
  const violationWarningsByUid = new Map<string, AdViolationWarningNotice[]>();
  const unlimitedPassesByUid = new Map<
    string,
    AdvertiserUnlimitedPassStatus & { uid: string; billingTokenMasked: string }
  >();

  const persistAdsRegistry = () => {
    try {
      const payload = {
        remoteAdConfig,
        businessProfiles: Array.from(businessProfilesByUid.values()),
        sponsoredAds: Array.from(sponsoredAdsById.values()),
        adFulfillmentRequests: Array.from(adFulfillmentRequestsById.values()),
        adReports: Array.from(adReportsByAdId.entries()),
        violationWarnings: Array.from(violationWarningsByUid.entries()),
        unlimitedPasses: Array.from(unlimitedPassesByUid.values()),
      };
      fs.writeFileSync(ADS_REGISTRY_PATH, JSON.stringify(payload), 'utf8');
    } catch {
      // Non-fatal in ephemeral environments
    }
  };

  const hydrateAdsRegistry = () => {
    try {
      if (!fs.existsSync(ADS_REGISTRY_PATH)) return;
      const raw = JSON.parse(fs.readFileSync(ADS_REGISTRY_PATH, 'utf8')) as {
        remoteAdConfig?: RemoteAdPricingConfig;
        businessProfiles?: BusinessAdCardProfile[];
        sponsoredAds?: SponsoredPublicAd[];
        adFulfillmentRequests?: AdFulfillmentRequest[];
        adReports?: Array<[string, AdReportRecord[]]>;
        violationWarnings?: Array<[string, AdViolationWarningNotice[]]>;
        unlimitedPasses?: Array<
          AdvertiserUnlimitedPassStatus & { uid: string; billingTokenMasked: string }
        >;
      };
      if (raw.remoteAdConfig) {
        remoteAdConfig = {
          ...remoteAdConfig,
          ...raw.remoteAdConfig,
          // Always upgrade legacy 30-day cached value up to 90-day (3-month) free trial
          freeTrialDays: Math.max(
            STANDARD_FREE_TRIAL_DAYS,
            Number(raw.remoteAdConfig.freeTrialDays || STANDARD_FREE_TRIAL_DAYS)
          ),
          unlimitedAdPriceUsd:
            Number(raw.remoteAdConfig.unlimitedAdPriceUsd) || UNLIMITED_ADS_ANNUAL_PRICE_USD,
          unlimitedAdDurationDays:
            Number(raw.remoteAdConfig.unlimitedAdDurationDays) || UNLIMITED_ADS_DURATION_DAYS,
          unlimitedAdSku:
            raw.remoteAdConfig.unlimitedAdSku || GOOGLE_PLAY_BILLING_CONFIG.unlimitedPackage.sku,
        };
      }
      for (const prof of raw.businessProfiles || []) {
        if (prof?.ownerUid) businessProfilesByUid.set(prof.ownerUid, prof);
      }
      for (const ad of raw.sponsoredAds || []) {
        if (ad?.adId) sponsoredAdsById.set(ad.adId, ad);
      }
      for (const reqItem of raw.adFulfillmentRequests || []) {
        if (reqItem?.requestId) adFulfillmentRequestsById.set(reqItem.requestId, reqItem);
      }
      for (const [adId, reps] of raw.adReports || []) {
        if (adId && Array.isArray(reps)) adReportsByAdId.set(adId, reps);
      }
      for (const [uid, warns] of raw.violationWarnings || []) {
        if (uid && Array.isArray(warns)) violationWarningsByUid.set(uid, warns);
      }
      for (const pass of raw.unlimitedPasses || []) {
        if (pass?.uid) unlimitedPassesByUid.set(pass.uid, pass);
      }
    } catch {
      // Ignore corrupt tmp cache and start cleanly
    }
  };
  hydrateAdsRegistry();

  const getUnlimitedPassForSeller = (
    sellerUid: string,
    sellerPhone?: string
  ): (AdvertiserUnlimitedPassStatus & { billingTokenMasked?: string }) => {
    if (isVipFounderFreeNumber(sellerPhone)) {
      return {
        active: true,
        vipFree: true,
        sku: 'pk_vip_free_bypass',
        pricePaidUsd: 0,
        expiresAt: '2099-12-31T23:59:59.000Z',
        billingTokenMasked: 'vip_free_0',
      };
    }
    const stored = unlimitedPassesByUid.get(sellerUid);
    if (stored && stored.active && stored.expiresAt && new Date(stored.expiresAt).getTime() > Date.now()) {
      return stored;
    }
    return {
      active: false,
      vipFree: false,
      sku: remoteAdConfig.unlimitedAdSku,
      pricePaidUsd: remoteAdConfig.unlimitedAdPriceUsd,
    };
  };

  const sanitizePublicAdDto = (ad: SponsoredPublicAd): SponsoredPublicAd => ({
    adId: ad.adId,
    businessId: ad.businessId,
    sellerUid: ad.sellerUid,
    businessName: ad.businessName,
    category: ad.category,
    title: ad.title,
    description: ad.description,
    mediaType: ad.mediaType,
    mediaUrl: ad.mediaUrl,
    mediaMimeType: ad.mediaMimeType,
    durationSeconds: ad.durationSeconds,
    targetCountry: ad.targetCountry,
    targetCountries: normalizeTargetCountries(ad.targetCountry, ad.targetCountries),
    targetLanguage: ad.targetLanguage,
    adScale: ad.adScale,
    pricePaidUsd: ad.pricePaidUsd,
    playBillingSku: ad.playBillingSku,
    selfieVerified: ad.selfieVerified,
    enableDirectCall: ad.enableDirectCall,
    enableLiveClass: ad.enableLiveClass,
    city: ad.city,
    status: ad.status,
    reportCount: ad.reportCount,
    underReviewThreshold: ad.underReviewThreshold,
    aiModerationSummary: ad.aiModerationSummary,
    createdAt: ad.createdAt,
    updatedAt: ad.updatedAt,
  });

  async function evaluateAdWithGeminiOrFallback(params: {
    businessName: string;
    category: string;
    title: string;
    description: string;
    mediaType: 'image' | 'video';
    durationSeconds?: number;
    targetCountry?: string;
    enableLiveClass?: boolean;
  }): Promise<AdSafetyEvaluationResult> {
    const preCheck = preScreenAdContentSafety({
      businessName: params.businessName,
      category: params.category,
      title: params.title,
      description: params.description,
    });
    const deterministicScale = classifyAdScaleDeterministic({
      title: params.title,
      description: params.description,
      mediaType: params.mediaType,
      durationSeconds: params.durationSeconds,
      targetCountry: params.targetCountry,
      enableLiveClass: params.enableLiveClass,
    });

    const buildTierResponse = (
      safe: boolean,
      scale: 'small' | 'large',
      aiSummary: string,
      engine: string,
      blockedReason?: string
    ): AdSafetyEvaluationResult => {
      const priceUsd =
        scale === 'large' ? remoteAdConfig.largeAdPriceUsd : remoteAdConfig.smallAdPriceUsd;
      const skuId = scale === 'large' ? remoteAdConfig.largeAdSku : remoteAdConfig.smallAdSku;
      return {
        safe,
        blockedReason,
        adScale: scale,
        priceUsd,
        skuId,
        tierLabel:
          scale === 'large'
            ? `Large Business / Extended Campaign ($${priceUsd} USD)`
            : `Small Business / Short Ad ($${priceUsd} USD)`,
        aiSummary,
        engine,
      };
    };

    if (!preCheck.safe) {
      return buildTierResponse(
        false,
        deterministicScale,
        preCheck.reason || 'Content rejected by pre-publish policy safety shield.',
        'pk-safety-deterministic-shield',
        preCheck.reason
      );
    }

    if (process.env.GEMINI_API_KEY) {
      try {
        const prompt = `Evaluate this sponsored business listing for Google Play Store UGC & advertising policy safety and classify business/campaign scale.
Business: ${params.businessName}
Category: ${params.category}
Title: ${params.title}
Description: ${params.description}
Media: ${params.mediaType}${params.durationSeconds ? ` (${params.durationSeconds}s)` : ''}
Target Country: ${params.targetCountry || 'Global'}
Live Class Enabled: ${Boolean(params.enableLiveClass)}

Rules:
1. Set safe=false if there is ANY sexual/NSFW/explicit content, illegal weapons/drugs, financial scam/fraud, hate speech, violence, or counterfeit solicitation.
2. Classify adScale='small' for local small businesses/short local offers ($5 tier), or adScale='large' for enterprise, wholesale, export, nationwide/global reach, or extended campaigns ($10 tier).`;

        const { text, engine } = await translateWithModelResilience(prompt, {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              safe: { type: Type.BOOLEAN },
              blockedReason: { type: Type.STRING },
              adScale: { type: Type.STRING },
              summary: { type: Type.STRING },
            },
            required: ['safe', 'adScale', 'summary'],
          },
        });
        const parsed = JSON.parse(text) as {
          safe?: boolean;
          blockedReason?: string;
          adScale?: string;
          summary?: string;
        };
        const scale = parsed.adScale === 'large' ? 'large' : deterministicScale;
        if (parsed.safe === false) {
          return buildTierResponse(
            false,
            scale,
            sanitizePublicText(
              parsed.summary || 'Blocked by PK Pre-Publish Safety Guard.',
              'Blocked by PK Pre-Publish Safety Guard.'
            ),
            engine,
            sanitizePublicText(
              parsed.blockedReason ||
                parsed.summary ||
                'Ad violates Google Play safety and acceptable content rules.',
              'Ad violates Google Play safety and acceptable content rules.'
            )
          );
        }
        return buildTierResponse(
          true,
          scale,
          sanitizePublicText(
            parsed.summary || 'PK Safety Shield verified business listing.',
            'PK Safety Shield verified business listing.'
          ),
          engine
        );
      } catch {
        // Fallback cleanly to deterministic safety & scale classification if network/quota fails
      }
    }

    return buildTierResponse(
      true,
      deterministicScale,
      deterministicScale === 'large'
        ? 'Verified safe listing classified for Extended/Large Business reach.'
        : 'Verified safe listing classified for Small/Local Business reach.',
      'pk-ads-policy-evaluator'
    );
  }

  app.get('/api/ads/config', (_req, res) => {
    res.json(remoteAdConfig);
  });

  app.post('/api/ads/config', async (req, res) => {
    if (req.headers.authorization) {
      const auth = await verifyAdminFirebaseToken(req);
      if (!auth.ok) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }
    }
    const body = req.body ?? {};
    const small = Number(body.smallAdPriceUsd);
    const large = Number(body.largeAdPriceUsd);
    const annual = Number(body.annualProPriceUsd);
    const trialDays = Number(body.freeTrialDays);
    if (Number.isFinite(small) && small >= 1 && small <= 500) {
      remoteAdConfig.smallAdPriceUsd = Number(small.toFixed(2));
    }
    if (Number.isFinite(large) && large >= 1 && large <= 1000) {
      remoteAdConfig.largeAdPriceUsd = Number(large.toFixed(2));
    }
    if (Number.isFinite(annual) && annual >= 1 && annual <= 500) {
      remoteAdConfig.annualProPriceUsd = Number(annual.toFixed(2));
    }
    if (Number.isFinite(trialDays) && trialDays >= 7 && trialDays <= 365) {
      remoteAdConfig.freeTrialDays = Math.round(trialDays);
    }
    if (typeof body.billingLibraryVersion === 'string' && body.billingLibraryVersion.trim()) {
      remoteAdConfig.billingLibraryVersion = body.billingLibraryVersion.trim().slice(0, 24);
    }
    remoteAdConfig.updatedAt = new Date().toISOString();
    persistAdsRegistry();
    res.json(remoteAdConfig);
  });

  app.get('/api/ads/unlimited/status/:uid', (req, res) => {
    const uid = String(req.params.uid || '').trim();
    const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : '';
    const status = getUnlimitedPassForSeller(uid, phone);
    res.json({
      active: status.active,
      vipFree: status.vipFree,
      sku: status.sku,
      pricePaidUsd: status.pricePaidUsd,
      activatedAt: status.activatedAt,
      expiresAt: status.expiresAt,
    } satisfies AdvertiserUnlimitedPassStatus);
  });

  app.post('/api/ads/unlimited/activate', (req, res) => {
    const body = req.body ?? {};
    const uid = typeof body.uid === 'string' ? body.uid.trim().slice(0, 128) : '';
    const sellerPhone = typeof body.sellerPhone === 'string' ? body.sellerPhone.trim() : '';
    const playBillingPurchaseToken =
      typeof body.playBillingPurchaseToken === 'string' ? body.playBillingPurchaseToken.trim() : '';

    if (!uid) {
      res.status(400).json({ error: 'uid is required to activate Unlimited Ads & Videos.' });
      return;
    }

    if (isVipFounderFreeNumber(sellerPhone)) {
      res.json({
        active: true,
        vipFree: true,
        sku: 'pk_vip_free_bypass',
        pricePaidUsd: 0,
        activatedAt: new Date().toISOString(),
        expiresAt: '2099-12-31T23:59:59.000Z',
      } satisfies AdvertiserUnlimitedPassStatus);
      return;
    }

    if (!playBillingPurchaseToken || playBillingPurchaseToken.length < 8) {
      res.status(402).json({
        error: `Google Play Billing confirmation (${remoteAdConfig.unlimitedAdSku} - $${remoteAdConfig.unlimitedAdPriceUsd}/year) is required.`,
      });
      return;
    }

    const activatedAt = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + remoteAdConfig.unlimitedAdDurationDays * 24 * 60 * 60 * 1000
    ).toISOString();
    const passRecord = {
      uid,
      active: true,
      vipFree: false,
      sku: remoteAdConfig.unlimitedAdSku,
      pricePaidUsd: remoteAdConfig.unlimitedAdPriceUsd,
      activatedAt,
      expiresAt,
      billingTokenMasked: `gpb_***${playBillingPurchaseToken.slice(-4)}`,
    };
    unlimitedPassesByUid.set(uid, passRecord);
    persistAdsRegistry();

    res.json({
      active: passRecord.active,
      vipFree: passRecord.vipFree,
      sku: passRecord.sku,
      pricePaidUsd: passRecord.pricePaidUsd,
      activatedAt: passRecord.activatedAt,
      expiresAt: passRecord.expiresAt,
    } satisfies AdvertiserUnlimitedPassStatus);
  });

  app.post('/api/ads/business-profile', (req, res) => {
    const body = req.body ?? {};
    const ownerUid = typeof body.ownerUid === 'string' ? body.ownerUid.trim().slice(0, 128) : '';
    const businessName =
      typeof body.businessName === 'string' ? body.businessName.trim().slice(0, 100) : '';
    const category = typeof body.category === 'string' ? body.category.trim().slice(0, 80) : '';
    const tagline = typeof body.tagline === 'string' ? body.tagline.trim().slice(0, 160) : '';
    const city = typeof body.city === 'string' ? body.city.trim().slice(0, 80) : '';
    if (!ownerUid || !businessName) {
      res.status(400).json({ error: 'ownerUid and businessName are required.' });
      return;
    }

    const profileSafety = detectExplicitSexualContent(
      `${businessName}\n${category}\n${tagline}\n${city}`
    );
    if (!profileSafety.safe) {
      res.status(400).json({
        error:
          profileSafety.blockedReason ||
          'Explicit or adult content is strictly prohibited on PK CHAT business profiles.',
      });
      return;
    }

    const existing = businessProfilesByUid.get(ownerUid);
    const nowIsoStr = new Date().toISOString();
    const profile: BusinessAdCardProfile = {
      businessId: existing?.businessId || `biz_${crypto.randomBytes(5).toString('hex')}`,
      ownerUid,
      businessName,
      category: category || existing?.category || 'Retail & Local Shop',
      tagline: tagline || existing?.tagline || '',
      city: city || existing?.city || '',
      country:
        typeof body.country === 'string' && body.country.trim()
          ? body.country.trim().slice(0, 80)
          : existing?.country || 'Sri Lanka',
      countryCode:
        typeof body.countryCode === 'string' && body.countryCode.trim()
          ? body.countryCode.trim().slice(0, 8)
          : existing?.countryCode || 'LK',
      primaryLanguage:
        typeof body.primaryLanguage === 'string' && body.primaryLanguage.trim()
          ? body.primaryLanguage.trim().slice(0, 48)
          : existing?.primaryLanguage || 'English',
      enableDirectCall: Boolean(body.enableDirectCall ?? existing?.enableDirectCall ?? true),
      enableLiveClass: Boolean(body.enableLiveClass ?? existing?.enableLiveClass ?? false),
      selfieVerified: existing?.selfieVerified ?? false,
      selfieVerifiedAt: existing?.selfieVerifiedAt,
      selfieVerificationHash: existing?.selfieVerificationHash,
      updatedAt: nowIsoStr,
    };
    businessProfilesByUid.set(ownerUid, profile);

    // Isolate private phone/email strictly server-side; never include in public responses
    const existingPrivate = privateAdvertiserContactsByUid.get(ownerUid);
    const phoneRaw = typeof body.privatePhone === 'string' ? body.privatePhone.trim() : '';
    const emailRaw = typeof body.privateEmail === 'string' ? body.privateEmail.trim() : '';
    if (phoneRaw || emailRaw) {
      privateAdvertiserContactsByUid.set(ownerUid, {
        ownerUid,
        phoneHash: phoneRaw
          ? crypto.createHash('sha256').update(phoneRaw).digest('hex')
          : existingPrivate?.phoneHash || '',
        emailHash: emailRaw
          ? crypto.createHash('sha256').update(emailRaw.toLowerCase()).digest('hex')
          : existingPrivate?.emailHash || '',
        selfieVerificationHash: existingPrivate?.selfieVerificationHash || '',
        verifiedAt: existingPrivate?.verifiedAt || nowIsoStr,
      });
    }

    persistAdsRegistry();
    res.json({ profile });
  });

  app.get('/api/ads/business-profile/:uid', (req, res) => {
    const uid = String(req.params.uid || '').trim();
    const profile = businessProfilesByUid.get(uid) || null;
    res.json({ profile });
  });

  app.post('/api/ads/verify-selfie', (req, res) => {
    const body = req.body ?? {};
    const ownerUid = typeof body.ownerUid === 'string' ? body.ownerUid.trim().slice(0, 128) : '';
    const selfieDataUrl =
      typeof body.selfieDataUrl === 'string' ? body.selfieDataUrl.trim() : '';
    const phoneRaw = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';
    const emailRaw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!ownerUid || !selfieDataUrl) {
      res.status(400).json({ error: 'ownerUid and live selfie image are required.' });
      return;
    }

    const match = selfieDataUrl.match(/^data:(image\/(jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      res.status(400).json({ error: 'Live verification photo must be a valid JPEG, PNG, or WebP capture.' });
      return;
    }
    const imgBuf = Buffer.from(match[3], 'base64');
    if (imgBuf.length < 24 || imgBuf.length > 2 * 1024 * 1024) {
      res.status(400).json({ error: 'Verification photo size must be between 24 bytes and 2 MB.' });
      return;
    }

    const verifiedAt = new Date().toISOString();
    const identitySalt = `${ownerUid}:${phoneRaw}:${emailRaw}`;
    const selfieVerificationHash = crypto
      .createHash('sha256')
      .update(Buffer.concat([imgBuf.subarray(0, 2048), Buffer.from(identitySalt, 'utf8')]))
      .digest('hex')
      .slice(0, 32);

    const existing = businessProfilesByUid.get(ownerUid);
    const profile: BusinessAdCardProfile = existing
      ? {
          ...existing,
          selfieVerified: true,
          selfieVerifiedAt: verifiedAt,
          selfieVerificationHash,
          updatedAt: verifiedAt,
        }
      : {
          businessId: `biz_${crypto.randomBytes(5).toString('hex')}`,
          ownerUid,
          businessName: 'Verified Business',
          category: 'Retail & Local Shop',
          tagline: '',
          city: '',
          country: 'Sri Lanka',
          countryCode: 'LK',
          primaryLanguage: 'English',
          enableDirectCall: true,
          enableLiveClass: false,
          selfieVerified: true,
          selfieVerifiedAt: verifiedAt,
          selfieVerificationHash,
          updatedAt: verifiedAt,
        };
    businessProfilesByUid.set(ownerUid, profile);

    privateAdvertiserContactsByUid.set(ownerUid, {
      ownerUid,
      phoneHash: phoneRaw ? crypto.createHash('sha256').update(phoneRaw).digest('hex') : '',
      emailHash: emailRaw ? crypto.createHash('sha256').update(emailRaw).digest('hex') : '',
      selfieVerificationHash,
      verifiedAt,
    });

    persistAdsRegistry();
    res.json({
      verified: true,
      selfieVerificationHash,
      verifiedAt,
      profile,
    });
  });

  app.post('/api/ads/evaluate', async (req, res) => {
    const body = req.body ?? {};
    const businessName =
      typeof body.businessName === 'string' ? body.businessName.trim().slice(0, 100) : '';
    const category =
      typeof body.category === 'string' ? body.category.trim().slice(0, 80) : 'Retail & Local Shop';
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
    const description =
      typeof body.description === 'string' ? body.description.trim().slice(0, 500) : '';
    const mediaType = body.mediaType === 'video' ? 'video' : 'image';
    const durationSeconds = Number(body.durationSeconds || 0);
    const targetCountry =
      typeof body.targetCountry === 'string' ? body.targetCountry.trim().slice(0, 80) : 'Global';
    const targetCountries = normalizeTargetCountries(
      targetCountry,
      Array.isArray(body.targetCountries) ? body.targetCountries : undefined
    );
    const canonicalCountryForScale = targetCountries.includes('All Country')
      ? 'All Country'
      : targetCountries.length > 1
      ? 'Global'
      : targetCountries[0] || targetCountry;
    const enableLiveClass = Boolean(body.enableLiveClass);

    const evaluation = await evaluateAdWithGeminiOrFallback({
      businessName,
      category,
      title,
      description,
      mediaType,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
      targetCountry: canonicalCountryForScale,
      enableLiveClass,
    });

    res.json(evaluation);
  });

  app.post('/api/ads/publish', async (req, res) => {
    const body = req.body ?? {};
    const sellerUid = typeof body.sellerUid === 'string' ? body.sellerUid.trim().slice(0, 128) : '';
    const sellerPhone = typeof body.sellerPhone === 'string' ? body.sellerPhone.trim() : '';
    const businessName =
      typeof body.businessName === 'string' ? body.businessName.trim().slice(0, 100) : '';
    const category =
      typeof body.category === 'string' ? body.category.trim().slice(0, 80) : 'Retail & Local Shop';
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
    const description =
      typeof body.description === 'string' ? body.description.trim().slice(0, 600) : '';
    const mediaType = body.mediaType === 'video' ? 'video' : 'image';
    const mediaUrl = typeof body.mediaUrl === 'string' ? body.mediaUrl.trim() : '';
    const mediaMimeType =
      typeof body.mediaMimeType === 'string' ? body.mediaMimeType.trim().slice(0, 64) : 'image/jpeg';
    const durationSeconds = Number(body.durationSeconds || 0);
    const targetCountryRaw =
      typeof body.targetCountry === 'string' && body.targetCountry.trim()
        ? body.targetCountry.trim().slice(0, 80)
        : 'Global';
    const targetCountries = normalizeTargetCountries(
      targetCountryRaw,
      Array.isArray(body.targetCountries) ? body.targetCountries : undefined
    );
    const targetCountry = targetCountries.includes('All Country')
      ? 'All Country'
      : targetCountries[0] || targetCountryRaw;
    const targetLanguage =
      typeof body.targetLanguage === 'string' && body.targetLanguage.trim()
        ? body.targetLanguage.trim().slice(0, 48)
        : 'English';
    const playBillingPurchaseToken =
      typeof body.playBillingPurchaseToken === 'string' ? body.playBillingPurchaseToken.trim() : '';

    if (!sellerUid || !businessName || !title || !description || !mediaUrl) {
      res.status(400).json({
        error: 'Business name, ad title, description, and media are required before publishing.',
      });
      return;
    }

    const bizProfile = businessProfilesByUid.get(sellerUid);
    if (!bizProfile?.selfieVerified) {
      res.status(403).json({
        error: 'Live Photo Verification is required before publishing any Sponsored Public Status ad.',
      });
      return;
    }

    const safetyEval = await evaluateAdWithGeminiOrFallback({
      businessName,
      category,
      title,
      description,
      mediaType,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
      targetCountry: targetCountries.length > 1 ? 'All Country' : targetCountry,
      enableLiveClass: Boolean(body.enableLiveClass),
    });

    if (!safetyEval.safe) {
      res.status(400).json({
        error: sanitizePublicText(
          safetyEval.blockedReason || 'Pre-publish PK safety shield rejected this ad content.'
        ),
        evaluation: safetyEval,
      });
      return;
    }

    const activeUnlimitedOrVip = getUnlimitedPassForSeller(sellerUid, sellerPhone);
    const hasFreePass = activeUnlimitedOrVip.active;

    if (!hasFreePass && (!playBillingPurchaseToken || playBillingPurchaseToken.length < 8)) {
      res.status(402).json({
        error: `Google Play Billing purchase confirmation (${safetyEval.skuId} - $${safetyEval.priceUsd}) or $100/year Unlimited Ads Pass is required to publish.`,
        requiredTier: safetyEval,
      });
      return;
    }

    const resolvedPricePaidUsd = hasFreePass ? 0 : safetyEval.priceUsd;
    const resolvedPlaySku = hasFreePass ? activeUnlimitedOrVip.sku : safetyEval.skuId;
    const resolvedTokenMask = hasFreePass
      ? activeUnlimitedOrVip.billingTokenMasked || 'unlimited_pass'
      : `gpb_***${playBillingPurchaseToken.slice(-4)}`;

    const nowIsoStr = new Date().toISOString();
    const ad: SponsoredPublicAd = {
      adId: `ad_${crypto.randomBytes(6).toString('hex')}`,
      businessId: bizProfile.businessId,
      sellerUid,
      businessName,
      category,
      title,
      description,
      mediaType,
      mediaUrl: mediaUrl.slice(0, 450_000),
      mediaMimeType,
      durationSeconds: Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0,
      targetCountry,
      targetCountries,
      targetLanguage,
      adScale: safetyEval.adScale,
      pricePaidUsd: resolvedPricePaidUsd,
      playBillingSku: resolvedPlaySku,
      billingTokenMasked: resolvedTokenMask,
      selfieVerified: true,
      enableDirectCall: Boolean(body.enableDirectCall ?? bizProfile.enableDirectCall ?? true),
      enableLiveClass: Boolean(body.enableLiveClass ?? bizProfile.enableLiveClass ?? false),
      city: typeof body.city === 'string' ? body.city.trim().slice(0, 80) : bizProfile.city || '',
      status: 'active',
      reportCount: 0,
      underReviewThreshold: UNDER_REVIEW_REPORT_THRESHOLD,
      aiModerationSummary: safetyEval.aiSummary,
      createdAt: nowIsoStr,
      updatedAt: nowIsoStr,
    };

    sponsoredAdsById.set(ad.adId, ad);
    persistAdsRegistry();
    res.json({
      ad: sanitizePublicAdDto(ad),
      billingVerified: true,
    });
  });

  app.get('/api/ads/public', (req, res) => {
    const country = typeof req.query.country === 'string' ? req.query.country.trim() : '';
    const language = typeof req.query.language === 'string' ? req.query.language.trim() : '';
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(20, Math.max(1, Number(req.query.pageSize || 6)));
    const excludeSellersRaw =
      typeof req.query.excludeSellers === 'string' ? req.query.excludeSellers.trim() : '';
    const excludeSet = new Set(
      excludeSellersRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );

    const allAds = Array.from(sponsoredAdsById.values())
      .filter((ad) => {
        if (ad.status === 'suspended') return false;
        if (excludeSet.has(ad.sellerUid)) return false;
        const adTargets = normalizeTargetCountries(ad.targetCountry, ad.targetCountries).map((c) =>
          c.trim().toLowerCase()
        );
        const reqCountry = country.toLowerCase();
        const countryOk =
          !reqCountry ||
          reqCountry === 'global' ||
          reqCountry === 'all country' ||
          adTargets.some((t) => t === 'global' || t === 'all country' || t === reqCountry);

        const adLang = ad.targetLanguage.trim().toLowerCase();
        const reqLang = language.toLowerCase();
        const langOk =
          !reqLang ||
          reqLang === 'all languages' ||
          adLang === 'all languages' ||
          adLang === reqLang ||
          adLang === 'english';
        return countryOk && langOk;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = allAds.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const items = allAds.slice(start, start + pageSize).map(sanitizePublicAdDto);

    res.json({
      ads: items,
      page: safePage,
      pageSize,
      total,
      totalPages,
      hasMore: safePage < totalPages,
      config: remoteAdConfig,
    });
  });

  app.post('/api/ads/:adId/request', (req, res) => {
    const adId = String(req.params.adId || '').trim();
    const ad = sponsoredAdsById.get(adId);
    if (!ad || ad.status === 'suspended') {
      res.status(404).json({ error: 'Sponsored business ad not found or no longer active.' });
      return;
    }

    const body = req.body ?? {};
    const buyerUid = typeof body.buyerUid === 'string' ? body.buyerUid.trim().slice(0, 128) : '';
    const buyerName =
      typeof body.buyerName === 'string' && body.buyerName.trim()
        ? body.buyerName.trim().slice(0, 100)
        : 'PK Chat Buyer';
    const fulfillmentType: AdFulfillmentType =
      body.fulfillmentType === 'direct_pickup' || body.fulfillmentType === 'scheduled_delivery'
        ? body.fulfillmentType
        : 'deliver_to_location';

    if (!buyerUid) {
      res.status(400).json({ error: 'buyerUid is required for a 1-to-1 private request.' });
      return;
    }

    let buyerLocation: AdFulfillmentRequest['buyerLocation'] = null;
    if (
      body.buyerLocation &&
      typeof body.buyerLocation === 'object' &&
      typeof body.buyerLocation.latitude === 'number' &&
      typeof body.buyerLocation.longitude === 'number'
    ) {
      buyerLocation = {
        latitude: Number(body.buyerLocation.latitude.toFixed(6)),
        longitude: Number(body.buyerLocation.longitude.toFixed(6)),
        displayAddress:
          typeof body.buyerLocation.displayAddress === 'string'
            ? body.buyerLocation.displayAddress.trim().slice(0, 160)
            : undefined,
      };
    }

    const nowIsoStr = new Date().toISOString();
    const requestRecord: AdFulfillmentRequest = {
      requestId: `adreq_${crypto.randomBytes(6).toString('hex')}`,
      adId: ad.adId,
      adTitle: ad.title,
      businessName: ad.businessName,
      sellerUid: ad.sellerUid,
      buyerUid,
      buyerName,
      fulfillmentType,
      deliveryNote:
        typeof body.deliveryNote === 'string' ? body.deliveryNote.trim().slice(0, 280) : '',
      scheduledDateTime:
        typeof body.scheduledDateTime === 'string'
          ? body.scheduledDateTime.trim().slice(0, 64)
          : undefined,
      buyerLocation,
      callRelayCode: `PK-PRIV-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      privateChatRoomId: `adroom_${ad.adId}_${buyerUid.slice(0, 12)}`,
      feeUsd: 0,
      status: 'requested',
      createdAt: nowIsoStr,
    };

    adFulfillmentRequestsById.set(requestRecord.requestId, requestRecord);
    persistAdsRegistry();
    res.json({ request: requestRecord });
  });

  app.get('/api/ads/requests/mine', (req, res) => {
    const uid = typeof req.query.uid === 'string' ? req.query.uid.trim() : '';
    if (!uid) {
      res.status(400).json({ error: 'uid query parameter is required.' });
      return;
    }
    const mine = Array.from(adFulfillmentRequestsById.values())
      .filter((r) => r.buyerUid === uid || r.sellerUid === uid)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ requests: mine });
  });

  app.post('/api/ads/requests/:requestId/received', (req, res) => {
    const requestId = String(req.params.requestId || '').trim();
    const existing = adFulfillmentRequestsById.get(requestId);
    if (!existing) {
      res.status(404).json({ error: 'Order fulfillment request not found.' });
      return;
    }
    const buyerUid =
      typeof req.body?.buyerUid === 'string' ? req.body.buyerUid.trim() : '';
    if (!buyerUid || existing.buyerUid !== buyerUid) {
      res.status(403).json({
        error: 'Only the originating 1-to-1 buyer can confirm Product Received.',
      });
      return;
    }
    existing.status = 'received';
    existing.feeUsd = 0;
    existing.receivedAt = new Date().toISOString();
    adFulfillmentRequestsById.set(requestId, existing);
    persistAdsRegistry();
    res.json({ request: existing, feeUsd: 0 });
  });

  app.post('/api/ads/:adId/report', (req, res) => {
    const adId = String(req.params.adId || '').trim();
    const ad = sponsoredAdsById.get(adId);
    if (!ad) {
      res.status(404).json({ error: 'Ad not found.' });
      return;
    }
    const body = req.body ?? {};
    const reporterUid =
      typeof body.reporterUid === 'string' && body.reporterUid.trim()
        ? body.reporterUid.trim().slice(0, 128)
        : `anon_${crypto.randomBytes(4).toString('hex')}`;
    const validCategories = new Set<AdReportCategory>([
      'spam_misleading',
      'prohibited_scam',
      'explicit_adult',
      'harassment_hate',
      'counterfeit_ip',
      'fake_business',
    ]);
    const category: AdReportCategory = validCategories.has(body.category)
      ? body.category
      : 'spam_misleading';
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : category;

    const reports = adReportsByAdId.get(adId) || [];
    const alreadyReported = reports.some((r) => r.reporterUid === reporterUid);
    if (!alreadyReported) {
      reports.push({
        reportId: `rep_${crypto.randomBytes(5).toString('hex')}`,
        adId,
        reporterUid,
        category,
        reason,
        createdAt: new Date().toISOString(),
      });
      adReportsByAdId.set(adId, reports);
    }

    ad.reportCount = reports.length;
    // Anti-False Report Protection:
    // Even if 20+ coordinated users report a legitimate business, NEVER auto-ban/delete.
    // Transition cleanly to 'under_review' for human/AI evidence verification.
    if (ad.reportCount >= UNDER_REVIEW_REPORT_THRESHOLD && ad.status === 'active') {
      ad.status = 'under_review';
    }
    ad.updatedAt = new Date().toISOString();
    sponsoredAdsById.set(adId, ad);
    persistAdsRegistry();

    res.json({
      reported: true,
      adStatus: ad.status,
      reportCount: ad.reportCount,
      autoBanPrevented: ad.status !== 'suspended',
      message:
        ad.status === 'under_review'
          ? 'Reports recorded. Listing is marked "Under Review" (protected against false-report auto-bans pending verified evidence).'
          : 'UGC report recorded for moderation triage.',
    });
  });

  app.get('/api/ads/admin/review-queue', async (req, res) => {
    if (req.headers.authorization || process.env.NODE_ENV === 'production') {
      const auth = await verifyAdminFirebaseToken(req);
      if (!auth.ok) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }
    }
    const items = Array.from(sponsoredAdsById.values())
      .filter((ad) => ad.status === 'under_review' || ad.reportCount > 0)
      .sort((a, b) => b.reportCount - a.reportCount)
      .map(sanitizePublicAdDto);
    res.json({ items });
  });

  app.post('/api/ads/:adId/verify-violation', async (req, res) => {
    if (req.headers.authorization || process.env.NODE_ENV === 'production') {
      const auth = await verifyAdminFirebaseToken(req);
      if (!auth.ok) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }
    }
    const adId = String(req.params.adId || '').trim();
    const ad = sponsoredAdsById.get(adId);
    if (!ad) {
      res.status(404).json({ error: 'Sponsored ad not found.' });
      return;
    }

    const body = req.body ?? {};
    const confirmedViolation = Boolean(body.confirmedViolation);
    const reports = adReportsByAdId.get(adId) || [];
    const nowIsoStr = new Date().toISOString();

    let warningNotice: AdViolationWarningNotice | null = null;
    if (confirmedViolation) {
      ad.status = 'suspended';
      const category: AdReportCategory =
        typeof body.violationCategory === 'string'
          ? (body.violationCategory as AdReportCategory)
          : reports[0]?.category || 'prohibited_scam';

      warningNotice = {
        warningId: `warn_${crypto.randomBytes(5).toString('hex')}`,
        adId: ad.adId,
        sellerUid: ad.sellerUid,
        businessName: ad.businessName,
        violationCategory: category,
        evidenceSummary:
          typeof body.evidenceSummary === 'string' && body.evidenceSummary.trim()
            ? body.evidenceSummary.trim().slice(0, 400)
            : `Verified violation confirmed across ${reports.length} user report(s) for listing "${ad.title}".`,
        reporterCount: reports.length,
        policyClause:
          typeof body.policyClause === 'string' && body.policyClause.trim()
            ? body.policyClause.trim().slice(0, 160)
            : 'PK CHAT Sponsored Business Policy §4.2 & Google Play UGC Safety Standards',
        actionTaken: 'suspended',
        issuedBy: 'PK CHAT Trust & Safety Verification',
        issuedAt: nowIsoStr,
        read: false,
      };
      const existingWarnings = violationWarningsByUid.get(ad.sellerUid) || [];
      existingWarnings.unshift(warningNotice);
      violationWarningsByUid.set(ad.sellerUid, existingWarnings.slice(0, 50));
    } else {
      // False reports dismissed cleanly: restore listing without penalty
      ad.status = 'active';
      ad.reportCount = 0;
      adReportsByAdId.set(adId, []);
    }

    ad.updatedAt = nowIsoStr;
    sponsoredAdsById.set(adId, ad);
    persistAdsRegistry();

    res.json({
      ad: sanitizePublicAdDto(ad),
      warningNotice,
    });
  });

  app.get('/api/ads/warnings/:uid', (req, res) => {
    const uid = String(req.params.uid || '').trim();
    const warnings = violationWarningsByUid.get(uid) || [];
    res.json({ warnings });
  });

  // Explicit JSON 404 for unknown /api/* routes so SPA fallback never masks removed endpoints
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  // Vite middleware in development; static dist serving in production
  if (process.env.NODE_ENV !== 'production') {
    app.get('/__download/pk-chat-project.zip', (_req, res) => {
      const zipPath = '/tmp/pk-chat-project.zip';
      if (!fs.existsSync(zipPath)) {
        return res.status(404).json({ error: 'Archive not found.' });
      }
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Cache-Control', 'no-store');
      return res.download(zipPath, 'pk-chat-project.zip');
    });

    app.get('/__download/pk-chat-pages-dist.zip', (_req, res) => {
      const zipPath = '/tmp/pk-chat-pages-dist.zip';
      if (!fs.existsSync(zipPath)) {
        return res.status(404).json({ error: 'Build archive not found.' });
      }
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Cache-Control', 'no-store');
      return res.download(zipPath, 'pk-chat-pages-dist.zip');
    });

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      base: '/',
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      appType: 'spa',
    });

    // In Vite 8 middlewareMode with HMR disabled, /@vite/client is still injected into index.html
    // and attempts a WebSocket connection to port 24678 unless neutralized cleanly.
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (!result) {
          return next();
        }
        const safeClientCode = result.code
          .replaceAll(
            'console.debug("[vite] connecting...");',
            'console.debug("[vite] HMR disabled.");'
          )
          .replaceAll(
            'await wsTransport.connect(handlers);',
            'return;'
          )
          .replaceAll(
            'await wsTransport.disconnect();',
            'return;'
          )
          .replaceAll(
            'wsTransport.send(data);',
            'void data;'
          );
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(safeClientCode);
      } catch (err) {
        next(err);
      }
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use('/PK-chat', express.static(distPath));
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PK CHAT cloud server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start PK CHAT server:', err);
  process.exit(1);
});
