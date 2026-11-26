import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

// Minimal Node environment polyfills for browser-targeted modules
if (!globalThis.crypto) {
  (globalThis as unknown as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}
const memStorage = new Map<string, string>();
if (!globalThis.localStorage) {
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    get length() {
      return memStorage.size;
    },
    clear() {
      memStorage.clear();
    },
    getItem(key: string) {
      return memStorage.has(key) ? memStorage.get(key)! : null;
    },
    key(index: number) {
      return Array.from(memStorage.keys())[index] ?? null;
    },
    removeItem(key: string) {
      memStorage.delete(key);
    },
    setItem(key: string, value: string) {
      memStorage.set(key, String(value));
    },
  };
}
if (typeof globalThis.window === 'undefined') {
  (globalThis as unknown as { window: Record<string, unknown> }).window = {
    location: { hostname: 'localhost' },
    setTimeout,
    clearTimeout,
  };
}
if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = (s: string) => Buffer.from(s, 'binary').toString('base64');
  globalThis.atob = (s: string) => Buffer.from(s, 'base64').toString('binary');
}

import {
  WEB_PREVIEW_TEST_OTP,
  WEB_PREVIEW_TEST_PHONE,
  detectInitialCountryCodeFromLocale,
  detectOperatingCountryContext,
  hashPhoneE164,
  isWebPreviewTestPhoneBypass,
  mapOAuthSignInError,
  normalizePhoneToE164,
  shouldFallbackToRedirect,
  validatePhoneMatchesOperatingCountry,
} from '../src/lib/phoneAuth';
import {
  GOOGLE_PLAY_BILLING_CONFIG,
  STANDARD_ANNUAL_PRICE_USD,
  STANDARD_ANNUAL_RENEWAL_DAYS,
  STANDARD_FREE_TRIAL_DAYS,
  UNLIMITED_ADS_ANNUAL_PRICE_USD,
  VIP_FOUNDER_FREE_ACCESS_NUMBERS,
  hasFreeVipStatusAndAdAccess,
  isVipFounderFreeNumber,
  verifyUserSubscriptionBilling,
} from '../src/lib/subscriptionBilling';
import {
  classifyAdScaleDeterministic,
  filterPublicAdsForViewer,
  formatTargetCountriesLabel,
  getAdsBySameSeller,
  normalizeTargetCountries,
  preScreenAdContentSafety,
} from '../src/lib/businessAdsEngine';
import {
  PK_CONFIG,
  createBusinessAd,
  getAdsForUserCountry,
  normalizePhoneNumber,
  resolveAccessProfile,
  runPKChatReadinessCheck,
  sanitizePublicText,
} from '../src/lib/pkCoreController';
import {
  PK_APP_EXPERIENCE,
  PKSoundEngine,
  loginWithFirebasePhoneOrEmail,
  pkSound,
} from '../src/lib/pkExperienceController';
import {
  PKChatSoundEngine,
  getVerifiedLocationAlerts,
  pkChatMirrorSound,
  resolveFestivalGreetings,
} from '../src/lib/pkMirrorEngine';
import { DEFAULT_RING_TIMEOUT_MS } from '../src/lib/audioTones';
import {
  hashPin,
  verifyPin,
  encryptE2eeText,
  decryptE2eeText,
  getOrCreateE2eeKeyPair,
  secureShredUint8Array,
  secureShredTextPayload,
  isMessageExpiredByBurnTimer,
} from '../src/lib/crypto';
import {
  STATUS_TTL_MS,
  toEpochMs,
  isStatusActive,
  getStatusRemainingLabel,
  formatStatusRelativeTime,
  computeAuthorizedViewerIds,
  canUserViewStatus,
  groupStatusesByAuthor,
} from '../src/lib/statusMedia';
import {
  formatDurationClock,
  formatFileSize,
  getDocExtensionBadge,
  validateVideoDurationSeconds,
} from '../src/lib/chatMediaUtils';
import { getSecurityCopyForLanguage } from '../src/lib/securityTranslations';
import {
  TAMIL_AREAS,
  filterRelevantMessengerAlerts,
  getPKFamilyCareMessage,
} from '../src/lib/messengerDisasterAlerts';
import {
  MAX_LARGE_VIDEO_BYTES,
  MAX_VIDEO_DURATION_SECONDS,
  SecurityShieldSystem,
  analyzeVideoFrameForUnsafeContent,
  detectExplicitSexualContent,
  evaluateClassSafetyContent,
  inspectAttachmentForMalware,
  inspectMagicBytesBuffer,
  isSafeMediaUrl,
  isVerifiedOfficialDisasterAgency,
  sanitizeChatPayload,
} from '../src/lib/securityShield';
import {
  buildOfficialInboxGreetings,
  computeUnreadOfficialInboxCount,
  localizeRedAlert,
  markOfficialIdsRead,
} from '../src/lib/officialInboxEngine';
import {
  buildEmergencySmsMessage,
  buildSmsLaunchUri,
  buildTelDialUri,
  sanitizeSmsPhoneNumber,
} from '../src/lib/offlineSmsSos';
import {
  clearOfflineOutbox,
  enqueueOfflineMessage,
  getOfflineOutbox,
  queuedRecordToChatMessage,
  removeOfflineOutboxItem,
} from '../src/lib/offlineOutbox';
import {
  CHAT_ANIMATION_META,
  FESTIVAL_3D_CARDS,
  detectChatKeywordAnimation,
  getUniversalBroadcastPresets,
  getUniversalCelebrationCards,
} from '../src/data/festivals';
import {
  autoDeleteCountryEmergencyData,
  clearLegacyCountryEmergencyLocalCache,
  clearLegacySosPreseedCaches,
  isPreseededNonUserSosNumber,
} from '../src/lib/countryEmergencyCleanup';
import { runPKChatSystemDiagnostics } from '../src/lib/pkDiagnostics';
import {
  DIRECT_CALL_PRESETS,
  DIRECT_MESSAGE_PRESETS,
  GROUP_CALL_PRESETS,
  GROUP_MESSAGE_PRESETS,
  NOTIFICATION_TONE_PRESETS,
  RINGTONE_PRESETS,
  clearCustomAudioTrack,
  getCustomAudioTrack,
  getNotificationToneLabel,
  getRingtoneLabel,
  getSelectedNotificationTonePreset,
  getSelectedRingtonePreset,
  isMasterSoundEnabled,
  isRingingActive,
  playNotificationTone,
  playRingtonePreview,
  setCustomAudioTrack,
  setMasterSoundEnabled,
  setSelectedNotificationTonePreset,
  setSelectedRingtonePreset,
  PKChatSignatureAudioEngine,
  pkSignatureAudio,
  stopRingingLoop,
} from '../src/lib/audioTones';
import { enforceCanonicalFounderName } from '../src/lib/i18n';
import {
  BRAND_THEME_STORAGE_KEY,
  PK_SIGNATURE_WALLPAPER_ID,
  PK_SIGNATURE_WALLPAPER_URL,
  PK_WORLD_PEACE_WALLPAPER_ID,
  WALLPAPER_FIT_STORAGE_KEY,
  getLightBrandTheme,
  getWallpaperFitMode,
  setLightBrandTheme,
  setWallpaperFitMode,
} from '../src/lib/appearanceTheme';
import { WORLD_LANGUAGES_CATALOG } from '../src/data/worldLanguages';
import {
  evaluateSameLanguagePassThrough,
  parseClassRoomFromInput,
} from '../src/lib/classTranslation';
import {
  evaluateOutgoingCallState,
  formatSosOnTheWayMessage,
  formatSosSirenChatPayload,
  getDataPackageMode,
  getPkChatDndUntilMs,
  isIntentionalDataOff,
  isPkChatDndEnabled,
  isPkLiveClassDndEnabled,
  parseSosSirenChatPayload,
  setDataPackageMode,
  setIntentionalDataOff,
  setPkChatDndEnabled,
  setPkChatDndOvernight,
  setPkLiveClassDndEnabled,
  setZoomClassDndEnabled,
  shouldSuppressIncomingAudio,
} from '../src/lib/connectivityAndDnd';
import {
  REMINDERS_STORAGE_KEY,
  collectDueReminders,
  computePresetRemindAtMs,
  deleteReminder,
  getActivePendingRemindersCount,
  getRemindersList,
  markReminderDone,
  saveReminder,
  snoozeReminder,
} from '../src/lib/rememberReminders';
import { readFileSync } from 'node:fs';
import { getInstantWeatherSnapshot } from '../src/lib/weatherService';
import {
  isRingbackActive,
  isSosSirenActive,
  setRingbackSpeakerMode,
} from '../src/lib/audioTones';
import type { StatusUpdate } from '../src/types/pkchat';

interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: TestResult[] = [];

async function runCase(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, detail: msg });
    console.error(`  FAIL  ${name}: ${msg}`);
  }
}

async function main() {
  console.log('\n=== PK CHAT Unit & Privacy Test Suite ===');

  await runCase('phoneAuth: normalizePhoneToE164 & detectInitialCountryCodeFromLocale handle global regions', () => {
    assert.equal(normalizePhoneToE164('077 123 4567', '+94'), '+94771234567');
    assert.equal(normalizePhoneToE164('+94 71 786 0693', '+94'), '+94717860693');
    assert.equal(normalizePhoneToE164('94771234567', '+94'), '+94771234567');
    assert.equal(detectInitialCountryCodeFromLocale('en-GB'), 'GB');
    assert.equal(detectInitialCountryCodeFromLocale('ta-IN'), 'IN');
    assert.equal(detectInitialCountryCodeFromLocale('en-US'), 'US');
    assert.equal(detectInitialCountryCodeFromLocale('en'), 'LK');
  });

  await runCase('phoneAuth: hashPhoneE164 produces deterministic 64-char SHA-256 hex digest', async () => {
    const h1 = await hashPhoneE164('+94771234567');
    const h2 = await hashPhoneE164('  +94771234567 ');
    const h3 = await hashPhoneE164('+94771234568');
    assert.equal(h1.length, 64);
    assert.match(h1, /^[a-f0-9]{64}$/);
    assert.equal(h1, h2);
    assert.notEqual(h1, h3);
  });

  await runCase('phoneAuth: Web Preview Test Mode bypass triggers strictly for +94717868693 with 123456', () => {
    assert.equal(WEB_PREVIEW_TEST_PHONE, '+94717868693');
    assert.equal(WEB_PREVIEW_TEST_OTP, '123456');
    assert.equal(isWebPreviewTestPhoneBypass('+94717868693'), true);
    assert.equal(isWebPreviewTestPhoneBypass('071 786 8693'), true);
    assert.equal(isWebPreviewTestPhoneBypass('+94771234567'), false);
    assert.equal(isWebPreviewTestPhoneBypass('+447700900123'), false);
  });

  await runCase('crypto: hashPin & verifyPin bind PIN strictly to uid', async () => {
    const hash = await hashPin('123456', 'user_alpha');
    assert.equal(await verifyPin('123456', 'user_alpha', hash), true);
    assert.equal(await verifyPin('654321', 'user_alpha', hash), false);
    assert.equal(await verifyPin('123456', 'user_beta', hash), false);
  });

  await runCase('crypto: encryptE2eeText & decryptE2eeText v1 + v2 ECDH round-trip', async () => {
    const kp = await getOrCreateE2eeKeyPair();
    assert.ok(kp.publicKeyBase64.length > 20);
    assert.ok(kp.fingerprint.length >= 16);

    const chatId = 'direct_u1_u2';
    const sample = 'Vanakkam PK CHAT — Tamil ❤️ 🔒 2026';
    const cipherV1 = await encryptE2eeText(sample, chatId);
    assert.notEqual(cipherV1, sample);
    assert.equal(await decryptE2eeText(cipherV1, chatId), sample);

    const cipherV2 = await encryptE2eeText(sample, chatId, kp.publicKeyBase64);
    assert.ok(cipherV2.startsWith('v2:'));
    assert.equal(await decryptE2eeText(cipherV2, chatId, kp.publicKeyBase64), sample);
  });

  await runCase('statusMedia: 24h expiry detection & labels work accurately', () => {
    const now = 1_760_000_000_000;
    assert.equal(isStatusActive({ expiresAt: now + 60_000 }, now), true);
    assert.equal(isStatusActive({ expiresAt: now - 1 }, now), false);
    assert.equal(isStatusActive({ expiresAt: now }, now), false);
    assert.equal(getStatusRemainingLabel(now - 500, now), 'Expired');
    assert.equal(getStatusRemainingLabel(now + 2 * 3600_000 + 15 * 60_000, now), '2h 15m left');
    assert.equal(formatStatusRelativeTime(now - 10_000, now), 'Just now');
    assert.equal(formatStatusRelativeTime(now - 5 * 60_000, now), '5m ago');
    assert.equal(toEpochMs({ seconds: 1700000000 }), 1700000000 * 1000);
    assert.equal(STATUS_TTL_MS, 24 * 60 * 60 * 1000);
  });

  await runCase('statusMedia: privacy filtering respects contacts, contacts_except, only_share_with, and blocks', () => {
    const owner = 'owner_1';
    const contacts = ['c1', 'c2', 'c3', 'blocked_user'];

    const allContacts = computeAuthorizedViewerIds({
      ownerUid: owner,
      privacyMode: 'contacts',
      contactUids: contacts,
      blockedUserIds: ['blocked_user'],
    });
    assert.deepEqual(allContacts.sort(), ['c1', 'c2', 'c3', 'owner_1'].sort());

    const exceptList = computeAuthorizedViewerIds({
      ownerUid: owner,
      privacyMode: 'contacts_except',
      contactUids: contacts,
      excludedIds: ['c2'],
      blockedUserIds: ['blocked_user'],
    });
    assert.deepEqual(exceptList.sort(), ['c1', 'c3', 'owner_1'].sort());

    const selectedOnly = computeAuthorizedViewerIds({
      ownerUid: owner,
      privacyMode: 'only_share_with',
      contactUids: contacts,
      allowedIds: ['c3', 'blocked_user'],
      excludedIds: ['c1'],
      blockedUserIds: ['blocked_user'],
    });
    assert.deepEqual(selectedOnly.sort(), ['c3', 'owner_1'].sort());
  });

  await runCase('statusMedia: canUserViewStatus & groupStatusesByAuthor split unseen vs viewed and hide expired', () => {
    const now = 1_760_000_000_000;
    const makeStatus = (partial: Partial<StatusUpdate>): StatusUpdate => ({
      statusId: partial.statusId || 's1',
      userId: partial.userId || 'u_other',
      authorName: partial.authorName || 'Nimal',
      mediaType: 'text',
      textContent: 'Hello',
      privacyMode: 'contacts',
      authorizedViewerIds: partial.authorizedViewerIds ?? ['me', 'u_other'],
      excludedViewerIds: partial.excludedViewerIds ?? [],
      allowedViewerIds: [],
      viewedByUids: partial.viewedByUids ?? [],
      viewers: [],
      reactions: [],
      createdAt: partial.createdAt ?? now - 10_000,
      expiresAt: partial.expiresAt ?? now + 100_000,
    });

    const activeUnseen = makeStatus({ statusId: 's_unseen', userId: 'u_a', authorName: 'Arun', createdAt: now - 5_000 });
    const activeSeen = makeStatus({
      statusId: 's_seen',
      userId: 'u_b',
      authorName: 'Bala',
      viewedByUids: ['me'],
      createdAt: now - 2_000,
    });
    const excluded = makeStatus({
      statusId: 's_excluded',
      userId: 'u_c',
      authorizedViewerIds: ['me', 'u_c'],
      excludedViewerIds: ['me'],
    });
    const expired = makeStatus({
      statusId: 's_expired',
      userId: 'u_a',
      expiresAt: now - 500,
    });
    const mine = makeStatus({
      statusId: 's_mine',
      userId: 'me',
      authorName: 'Me',
      authorizedViewerIds: ['me'],
    });

    assert.equal(canUserViewStatus(activeUnseen, 'me', now), true);
    assert.equal(canUserViewStatus(excluded, 'me', now), false);
    assert.equal(canUserViewStatus(expired, 'me', now), false);

    const grouped = groupStatusesByAuthor(
      [activeUnseen, activeSeen, excluded, expired, mine],
      'me',
      now
    );
    assert.equal(grouped.myStatuses.length, 1);
    assert.equal(grouped.recentGroups.length, 1);
    assert.equal(grouped.recentGroups[0].userId, 'u_a');
    assert.equal(grouped.recentGroups[0].unseenCount, 1);
    assert.equal(grouped.viewedGroups.length, 1);
    assert.equal(grouped.viewedGroups[0].userId, 'u_b');
  });

  await runCase('chatMediaUtils: formatFileSize & getDocExtensionBadge produce accurate metadata', () => {
    assert.equal(formatFileSize(512), '512 B');
    assert.equal(formatFileSize(4096), '4 KB');
    assert.equal(formatFileSize(2 * 1024 * 1024), '2.0 MB');
    assert.equal(getDocExtensionBadge('contract.pdf').ext, 'PDF');
    assert.equal(getDocExtensionBadge('sheet.xlsx').ext, 'XLSX');
    assert.equal(getDocExtensionBadge('report.docx').ext, 'DOCX');
  });

  await runCase('securityTranslations: localized copy exists for en, ta, si, hi, ar', () => {
    for (const code of ['en', 'ta', 'si', 'hi', 'ar']) {
      const copy = getSecurityCopyForLanguage(code);
      assert.equal(copy.languageCode, code);
      assert.ok(copy.lockdownTitle.length > 5);
    }
  });

  await runCase('securityShield: enforces 10-minute lockout, alert dispatch, and auto-clear', async () => {
    const shield = new SecurityShieldSystem();
    shield.clearLockdown();
    assert.equal(shield.checkSecurityStatus('ta').isLocked, false);

    let capturedAlert = '';
    const locked = await shield.triggerSecurityLockdown('Tamper test detected', {
      onDispatchAlert: async (alertMessage) => {
        capturedAlert = alertMessage;
      },
    });
    assert.equal(locked.isLocked, true);
    assert.ok(locked.remainingSeconds >= 595 && locked.remainingSeconds <= 600);
    assert.ok(locked.message?.includes('பாதுகாப்பு காரணங்களுக்காக'));
    assert.ok(capturedAlert.includes('Tamper test detected'));
    assert.ok(Boolean(localStorage.getItem(shield.STORAGE_KEY_ALERT_SENT)));

    // Anti-debug toggle & viewport check sanity
    assert.equal(shield.isAntiDebugEnabled(), true);
    shield.setAntiDebugEnabled(false);
    assert.equal(shield.isAntiDebugEnabled(), false);
    shield.setAntiDebugEnabled(true);
    assert.equal(shield.isDevToolsViewportAnomaly(160), false);

    // Expired timestamp should clear automatically
    localStorage.setItem(shield.STORAGE_KEY_LOCK_TIME, String(Date.now() - 1000));
    const resumed = shield.checkSecurityStatus('ta');
    assert.equal(resumed.isLocked, false);
    assert.equal(localStorage.getItem(shield.STORAGE_KEY_LOCK_TIME), null);
  });

  console.log('\n=== PK CHAT Live Backend Integration Tests (http://127.0.0.1:3000) ===');
  const baseUrl = 'http://127.0.0.1:3000';

  await runCase('HTTP GET /api/health returns 200 operational', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const json = (await res.json()) as { status?: string; securityStatus?: string };
    assert.equal(json.status, 'operational');
    assert.equal(json.securityStatus, 'NORMAL');
  });

  await runCase('HTTP GET /api/security/status returns NORMAL posture', async () => {
    const res = await fetch(`${baseUrl}/api/security/status`);
    assert.equal(res.status, 200);
    const json = (await res.json()) as { state?: { status?: string } };
    assert.equal(json.state?.status, 'NORMAL');
  });

  await runCase('HTTP GET /api/disasters/official returns structured feed', async () => {
    const res = await fetch(`${baseUrl}/api/disasters/official`);
    assert.equal(res.status, 200);
    const json = (await res.json()) as { alerts?: unknown[]; sourcesChecked?: unknown };
    assert.ok(Array.isArray(json.alerts));
  });

  await runCase('HTTP GET /api/otp/status returns gateway status', async () => {
    const res = await fetch(`${baseUrl}/api/otp/status`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(typeof json, 'object');
  });

  await runCase('HTTP POST /api/translate rejects empty payload with 400', async () => {
    const res = await fetch(`${baseUrl}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  await runCase('HTTP POST /api/profile/validate-image rejects unauthenticated request (401/403)', async () => {
    const res = await fetch(`${baseUrl}/api/profile/validate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: 'data:image/jpeg;base64,/9j/4AAQ' }),
    });
    assert.ok(res.status === 401 || res.status === 403, `Expected 401/403, got ${res.status}`);
  });

  await runCase('subscriptionBilling: all 4 canonical +94 VIP Founder numbers get lifetime free bypass & standard users get 90-day (3-month) trial', async () => {
    assert.deepEqual([...VIP_FOUNDER_FREE_ACCESS_NUMBERS], [
      '+94760852503',
      '+94712197111',
      '+94717860693',
      '+94753440226',
    ]);
    assert.equal(STANDARD_FREE_TRIAL_DAYS, 90);
    assert.equal(STANDARD_ANNUAL_RENEWAL_DAYS, 365);
    assert.equal(UNLIMITED_ADS_ANNUAL_PRICE_USD, 100);
    for (const num of VIP_FOUNDER_FREE_ACCESS_NUMBERS) {
      const local0 = `0${num.slice(3)}`;
      assert.equal(isVipFounderFreeNumber(num), true);
      assert.equal(isVipFounderFreeNumber(local0), true);
      assert.equal(isVipFounderFreeNumber(`00${num.slice(1)}`), true);
      assert.equal(hasFreeVipStatusAndAdAccess(num), true);
      assert.equal(hasFreeVipStatusAndAdAccess(local0), true);
      assert.equal(verifyUserSubscriptionBilling(num, 3650), true);
      assert.equal(verifyUserSubscriptionBilling(local0, 3650), true);
    }
    assert.equal(isVipFounderFreeNumber('+94770001111'), false);
    assert.equal(hasFreeVipStatusAndAdAccess('0770001111'), false);
    assert.equal(verifyUserSubscriptionBilling('0770001111', 90), true);
    assert.equal(verifyUserSubscriptionBilling('0770001111', 91), false);
  });

  await runCase('HTTP POST /api/subscriptions/validate activates 90-day trial & bypasses billing for 0753440226 VIP Founder', async () => {
    const res = await fetch(`${baseUrl}/api/subscriptions/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start_trial', provider: 'google_play_test' }),
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      valid?: boolean;
      plan?: string;
      status?: string;
      vipFounderBypass?: boolean;
      description?: string;
    };
    assert.equal(json.valid, true);
    assert.equal(json.plan, 'trial');
    assert.equal(json.status, 'trialing');
    assert.equal(json.vipFounderBypass, false);
    assert.ok(json.description?.includes('90-Day'));

    const vipRes = await fetch(`${baseUrl}/api/subscriptions/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'verify_vip_founder',
        provider: 'google_play_test',
        phoneNumber: '+94753440226',
      }),
    });
    assert.equal(vipRes.status, 200);
    const vipJson = (await vipRes.json()) as {
      valid?: boolean;
      vipFounderBypass?: boolean;
      plan?: string;
      status?: string;
      monthlyPriceUsd?: number;
    };
    assert.equal(vipJson.valid, true);
    assert.equal(vipJson.vipFounderBypass, true);
    assert.equal(vipJson.plan, 'free');
    assert.equal(vipJson.status, 'active');
    assert.equal(vipJson.monthlyPriceUsd, 0);
  });

  await runCase('HTTP POST /api/subscriptions/validate rejects unsupported action with 400', async () => {
    const res = await fetch(`${baseUrl}/api/subscriptions/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'invalid_action' }),
    });
    assert.equal(res.status, 400);
  });

  await runCase('HTTP GET /api/app/version detects up-to-date and outdated client builds', async () => {
    const upToDateRes = await fetch(`${baseUrl}/api/app/version?clientVersion=2026.11.15`);
    assert.equal(upToDateRes.status, 200);
    const upToDate = (await upToDateRes.json()) as {
      androidPackageId?: string;
      latestVersion?: string;
      updateAvailable?: boolean;
      playStoreUrl?: string;
    };
    assert.equal(upToDate.androidPackageId, 'com.pkchat.app');
    assert.equal(upToDate.updateAvailable, false);
    assert.ok(upToDate.playStoreUrl?.includes('com.pkchat.app'));

    const olderRes = await fetch(`${baseUrl}/api/app/version?clientVersion=2026.10.01`);
    assert.equal(olderRes.status, 200);
    const older = (await olderRes.json()) as { updateAvailable?: boolean };
    assert.equal(older.updateAvailable, true);
  });

  await runCase('offlineSmsSos: builds GPS + Map SOS text & platform-safe sms: launch URIs', () => {
    assert.equal(sanitizeSmsPhoneNumber('+94 70-000-0001'), '+94700000001');
    const msg = buildEmergencySmsMessage({
      senderName: 'Jerad Karan',
      recipients: ['+94700000001'],
      latitude: 6.92708,
      longitude: 79.86124,
      accuracyMeters: 12,
      note: 'Flood water rising near road',
    });
    assert.ok(msg.includes('PK CHAT SOS EMERGENCY from Jerad Karan!'));
    assert.ok(msg.includes('6.92708, 79.86124'));
    assert.ok(msg.includes('https://maps.google.com/?q=6.92708,79.86124'));
    assert.ok(msg.includes('Flood water rising near road'));

    const androidUri = buildSmsLaunchUri(
      ['+94 70 000 0001', '+94700000002', '+94700000001'],
      msg,
      'Mozilla/5.0 (Linux; Android 14)'
    );
    assert.ok(androidUri?.startsWith('sms:+94700000001,+94700000002?body='));

    const iosUri = buildSmsLaunchUri(
      ['+94700000001'],
      msg,
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
    );
    assert.ok(iosUri?.startsWith('sms:+94700000001&body='));
  });

  await runCase('HTTP POST /api/navigation/route computes distance, bearing, and turn steps', async () => {
    const invalidRes = await fetch(`${baseUrl}/api/navigation/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromLat: 999, fromLng: 79.86 }),
    });
    assert.equal(invalidRes.status, 400);

    const routeRes = await fetch(`${baseUrl}/api/navigation/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromLat: 6.9271,
        fromLng: 79.8612,
        toLat: 6.9355,
        toLng: 79.8428,
        destinationQuery: 'Colombo Fort',
      }),
    });
    assert.equal(routeRes.status, 200);
    const routeJson = (await routeRes.json()) as {
      mode?: string;
      distanceKm?: number;
      etaMinutes?: number;
      steps?: Array<{ instruction: string }>;
      geometry?: Array<{ lat: number; lng: number }>;
    };
    assert.ok(routeJson.mode === 'osrm_live' || routeJson.mode === 'gps_offline');
    assert.ok(typeof routeJson.distanceKm === 'number' && routeJson.distanceKm > 0);
    assert.ok(typeof routeJson.etaMinutes === 'number' && routeJson.etaMinutes >= 1);
    assert.ok(Array.isArray(routeJson.steps) && routeJson.steps.length >= 1);
    assert.ok(Array.isArray(routeJson.geometry) && routeJson.geometry.length >= 2);
  });

  await runCase('celebrations: universal 10-card catalog, keyword detection & presets are complete', () => {
    assert.equal(FESTIVAL_3D_CARDS.length, 10);
    for (const card of FESTIVAL_3D_CARDS) {
      assert.ok(Boolean(CHAT_ANIMATION_META[card.animation]), `Missing meta for ${card.animation}`);
    }
    assert.equal(detectChatKeywordAnimation('அன்பின் நித்திய சின்னமான தாஜ்மஹால் நினைவுச் செய்தி!'), 'taj');
    assert.equal(detectChatKeywordAnimation('Happy Lunar New Year 🧧🏮 சந்திரப் புத்தாண்டு'), 'lunar');
    assert.equal(detectChatKeywordAnimation('Mothers Day அன்னையர் தினம்'), 'mother');
    assert.equal(detectChatKeywordAnimation('Fathers Day தந்தைமார் தினம்'), 'father');
    assert.equal(detectChatKeywordAnimation('Friendship Day நண்பர்கள் தினம்'), 'friend');
    assert.equal(detectChatKeywordAnimation('Happy Global New Year 🎆'), 'fireworks');
    assert.equal(detectChatKeywordAnimation('Happy Birthday 🎂'), 'birthday');
    assert.equal(detectChatKeywordAnimation('Happy Anniversary 💍'), 'anniversary');

    const familyCards = getUniversalCelebrationCards('family');
    assert.ok(familyCards.some((c) => c.id === 'fest_mothers_day'));
    assert.ok(familyCards.some((c) => c.id === 'fest_fathers_day'));
    assert.ok(familyCards.some((c) => c.id === 'fest_friendship'));

    const presets = getUniversalBroadcastPresets();
    assert.ok(presets.some((p) => p.id === 'fest_birthday'));
    assert.ok(presets.some((p) => p.id === 'fest_global_newyear' && p.midnightRecommended));

    const tajCard = FESTIVAL_3D_CARDS.find((c) => c.id === 'fest_taj_mahal');
    assert.ok(tajCard, 'fest_taj_mahal card should exist');
    assert.equal(tajCard.effectTa, 'காதலின் நித்திய சின்னம்');
    assert.ok(tajCard.text.includes('தாஜ்மஹால் - காதலின் நித்திய சின்னம்'));
    assert.equal(detectChatKeywordAnimation(tajCard.text), 'taj');
    assert.equal(sanitizeChatPayload(tajCard.text).safe, true);
  });

  await runCase('HTTP POST /api/greetings/ai-auto generates localized celebration & midnight New Year wishes', async () => {
    const newYearRes = await fetch(`${baseUrl}/api/greetings/ai-auto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        festivalTitle: 'Global New Year 🎆',
        languageCode: 'ta',
        languageName: 'Tamil',
        recipientName: 'Nimal',
        isMidnightNewYear: true,
      }),
    });
    assert.equal(newYearRes.status, 200);
    const newYearJson = (await newYearRes.json()) as {
      greetingText?: string;
      festivalTitle?: string;
    };
    assert.ok(typeof newYearJson.greetingText === 'string' && newYearJson.greetingText.length > 10);
    assert.equal(newYearJson.festivalTitle, 'Global New Year 🎆');

    const tajRes = await fetch(`${baseUrl}/api/greetings/ai-auto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        festivalTitle: 'Taj Mahal 🏛️',
        languageCode: 'ta',
        languageName: 'Tamil',
      }),
    });
    assert.equal(tajRes.status, 200);
    const tajJson = (await tajRes.json()) as { greetingText?: string };
    assert.ok(typeof tajJson.greetingText === 'string' && tajJson.greetingText.length > 10);
  });

  await runCase('securityShield: payload sanitizer blocks script/iframe/XSS & AV scan blocks executables', () => {
    const clean = sanitizeChatPayload('Vanakkam Jerad! இனிய தை பொங்கல் நல்வாழ்த்துகள்! 🌾');
    assert.equal(clean.safe, true);
    assert.ok(clean.sanitizedText.includes('Vanakkam'));

    for (const malicious of [
      '<script>alert(1)</script>',
      '<iframe src="https://evil.example"></iframe>',
      'Click javascript:alert(document.cookie)',
      '<img src=x onerror=stealSession()>',
    ]) {
      const blocked = sanitizeChatPayload(malicious);
      assert.equal(blocked.safe, false, `Expected malicious payload to be blocked: ${malicious}`);
      assert.ok(blocked.blockedReason?.includes('Cyber Shield'));
    }

    const safePdf = inspectAttachmentForMalware({
      fileName: 'contract.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 120_000,
    });
    assert.equal(safePdf.safe, true);
    assert.ok(safePdf.badge.includes('Anti-Virus Scanned'));

    const exeFile = inspectAttachmentForMalware({
      fileName: 'trojan_installer.exe',
      mimeType: 'application/x-msdownload',
      sizeBytes: 1024,
    });
    assert.equal(exeFile.safe, false);

    const htmlFile = inspectAttachmentForMalware({
      fileName: 'phishing.html',
      mimeType: 'text/html',
      sizeBytes: 2048,
    });
    assert.equal(htmlFile.safe, false);
  });

  await runCase('countryEmergencyCleanup: purges legacy country + non-user founder/sample SOS caches while keeping user contacts intact', async () => {
    localStorage.setItem('country_emergency_info', JSON.stringify({ police: '119', ambulance: '1990' }));
    localStorage.setItem('selected_country', 'LK');
    localStorage.setItem('pk_country_emergency_info', 'legacy');
    localStorage.setItem('users/user_123/country_emergency_info', 'legacy');
    localStorage.setItem(
      'pk_personal_sos_contacts',
      JSON.stringify([
        { name: 'Family', number: '0785554321' },
        { name: 'Founder Seed', number: '+94717860693' },
        { name: 'Helpline', number: '119' },
      ])
    );

    assert.equal(isPreseededNonUserSosNumber('0760852503'), true);
    assert.equal(isPreseededNonUserSosNumber('+94712197111'), true);
    assert.equal(isPreseededNonUserSosNumber('0717860693'), true);
    assert.equal(isPreseededNonUserSosNumber('0753440226'), true);
    assert.equal(isPreseededNonUserSosNumber('0785554321'), false);

    const result = await autoDeleteCountryEmergencyData('user_123');
    clearLegacySosPreseedCaches();
    assert.ok(result.clearedLocalKeys.includes('country_emergency_info'));
    assert.ok(result.clearedLocalKeys.includes('selected_country'));
    assert.ok(result.clearedLocalKeys.includes('pk_country_emergency_info'));
    assert.ok(result.clearedLocalKeys.includes('users/user_123/country_emergency_info'));
    assert.equal(localStorage.getItem('country_emergency_info'), null);
    assert.equal(localStorage.getItem('selected_country'), null);
    const remainingPersonal = localStorage.getItem('pk_personal_sos_contacts') || '';
    assert.ok(remainingPersonal.includes('0785554321'));
    assert.equal(remainingPersonal.includes('0717860693'), false);
    assert.equal(remainingPersonal.includes('119'), false);

    const emptyResult = await autoDeleteCountryEmergencyData('');
    assert.equal(emptyResult.deletedReports, 0);
    assert.deepEqual(clearLegacyCountryEmergencyLocalCache('user_123'), []);
  });

  await runCase('pkDiagnostics: comprehensive 6-system suite passes & confirms gov emergency endpoints purged (404)', async () => {
    const report = await runPKChatSystemDiagnostics({ baseUrl, silent: true });
    assert.equal(report.checks.length, 6);
    assert.ok(report.checks.some((c) => c.id === 'core_readiness' && c.passed));
    for (const chk of report.checks) {
      assert.equal(chk.passed, true, `Diagnostic failed for ${chk.id}: ${chk.summary}`);
    }
    assert.equal(report.allPassed, true);
  });

  await runCase('audioTones: provides 4 independent PK Chat Signature channels, custom upload persistence, and headless safety', () => {
    localStorage.removeItem('pk_master_sound_enabled');
    localStorage.removeItem('pk_ringtone_preset');
    localStorage.removeItem('pk_group_ringtone_preset');
    localStorage.removeItem('pk_notification_tone_preset');
    localStorage.removeItem('pk_group_notification_tone_preset');
    clearCustomAudioTrack('direct_call');
    clearCustomAudioTrack('direct_message');

    assert.equal(isMasterSoundEnabled(), true);
    assert.equal(isRingingActive(), false);
    assert.equal(DIRECT_CALL_PRESETS.length, 5);
    assert.equal(GROUP_CALL_PRESETS.length, 5);
    assert.equal(DIRECT_MESSAGE_PRESETS.length, 5);
    assert.equal(GROUP_MESSAGE_PRESETS.length, 5);
    assert.equal(RINGTONE_PRESETS.length, 5);
    assert.equal(NOTIFICATION_TONE_PRESETS.length, 5);

    assert.equal(getSelectedRingtonePreset('direct_call'), 'pk_signature_call');
    assert.equal(getSelectedRingtonePreset('group_call'), 'pk_group_call');
    assert.equal(getSelectedNotificationTonePreset('direct_message'), 'pk_direct_chime');
    assert.equal(getSelectedNotificationTonePreset('group_message'), 'pk_group_chime');
    assert.equal(getRingtoneLabel(undefined, 'direct_call'), 'PK Chat Default (Signature)');
    assert.equal(getRingtoneLabel(undefined, 'group_call'), 'PK Chat Default (Signature)');
    assert.equal(getNotificationToneLabel(undefined, 'direct_message'), 'PK Chat Default (Signature)');
    assert.equal(getNotificationToneLabel(undefined, 'group_message'), 'PK Chat Default (Signature)');

    setSelectedRingtonePreset('harbor_chimes', 'direct_call');
    setSelectedRingtonePreset('sanctuary_harp', 'group_call');
    setSelectedNotificationTonePreset('dewdrop_pluck', 'direct_message');
    setSelectedNotificationTonePreset('warm_bell', 'group_message');
    assert.equal(getSelectedRingtonePreset('direct_call'), 'harbor_chimes');
    assert.equal(getSelectedRingtonePreset('group_call'), 'sanctuary_harp');
    assert.equal(getSelectedNotificationTonePreset('direct_message'), 'dewdrop_pluck');
    assert.equal(getSelectedNotificationTonePreset('group_message'), 'warm_bell');

    setCustomAudioTrack('direct_call', {
      name: 'my-guitar.mp3',
      mimeType: 'audio/mpeg',
      dataUrl: 'data:audio/mpeg;base64,SUQz',
      sizeBytes: 128,
    });
    assert.equal(getSelectedRingtonePreset('direct_call'), 'custom');
    assert.equal(getCustomAudioTrack('direct_call')?.name, 'my-guitar.mp3');
    clearCustomAudioTrack('direct_call');
    assert.equal(getSelectedRingtonePreset('direct_call'), 'pk_signature_call');

    assert.equal(playRingtonePreview('silent', 'direct_call'), false);
    assert.equal(playNotificationTone('silent', 'direct_message'), false);
    // In headless Node without AudioContext, preview/alert safely returns false instead of throwing
    assert.equal(playRingtonePreview('pk_signature_call', 'direct_call'), false);
    assert.equal(playNotificationTone('pk_direct_chime', 'direct_message'), false);

    setMasterSoundEnabled(false);
    assert.equal(isMasterSoundEnabled(), false);
    setMasterSoundEnabled(true);
    stopRingingLoop();
  });

  await runCase('founderNameGuard: enforces canonical English "Prashanth keransiya" without Tamil transliteration', () => {
    assert.equal(enforceCanonicalFounderName('நிறுவனர் பிரசாத் கிரன்சியா'), 'நிறுவனர் Prashanth keransiya');
    assert.equal(enforceCanonicalFounderName('பிரசாந்த் கிரன்சியா குடும்பத்தினர்'), 'Prashanth keransiya குடும்பத்தினர்');
    assert.equal(enforceCanonicalFounderName('Founder Prashath Keransiya'), 'Founder Prashanth keransiya');
    assert.equal(enforceCanonicalFounderName('Prashanth Keransiya'), 'Prashanth keransiya');
    assert.equal(enforceCanonicalFounderName('Prasanth Keransiya'), 'Prashanth keransiya');
  });

  await runCase('appearanceTheme: defaults to non-cropped wallpaper fit (contain) and persists locked light-blue glass styles', () => {
    localStorage.removeItem(BRAND_THEME_STORAGE_KEY);
    localStorage.removeItem(WALLPAPER_FIT_STORAGE_KEY);

    assert.equal(getLightBrandTheme(), 'ocean_blue');
    assert.equal(getWallpaperFitMode(), 'contain');

    setLightBrandTheme('sky_glass');
    setWallpaperFitMode('cover');
    assert.equal(getLightBrandTheme(), 'sky_glass');
    assert.equal(getWallpaperFitMode(), 'cover');

    setLightBrandTheme('ocean_blue');
    setWallpaperFitMode('contain');
    assert.equal(getLightBrandTheme(), 'ocean_blue');
    assert.equal(getWallpaperFitMode(), 'contain');
  });

  await runCase('HTTP /api/qr/* issues signed profile QR tokens, verifies scans in real time, blocks tampered tokens, and rotates cleanly on revoke', async () => {
    const uid = `qr_test_user_${Date.now()}`;
    const issueRes = await fetch(`${baseUrl}/api/qr/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid,
        fullName: 'Prashanth keransiya',
        phoneNumber: '+94717860693',
        country: 'Sri Lanka',
        countryCode: 'LK',
        preferredLanguage: 'ta',
        preferredLanguageName: 'Tamil',
        about: 'PK Chat Founder Profile',
        includeMatrix: true,
      }),
    });
    assert.equal(issueRes.status, 200);
    const issued = (await issueRes.json()) as {
      token?: string;
      tokenId?: string;
      qrMatrix?: { size: number; data: number[] };
      profile?: { uid: string; fullName: string; phoneNumber: string };
    };
    assert.ok(issued.token && issued.token.startsWith('pkc:qr:v1:'));
    assert.ok(issued.qrMatrix && issued.qrMatrix.size >= 21 && issued.qrMatrix.data.length === issued.qrMatrix.size ** 2);
    assert.equal(issued.profile?.fullName, 'Prashanth keransiya');

    // Verify valid scan
    const verifyRes = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawQrText: issued.token, scannerUid: 'scanner_peer_1' }),
    });
    assert.equal(verifyRes.status, 200);
    const verified = (await verifyRes.json()) as {
      valid?: boolean;
      scanCount?: number;
      profile?: { uid: string; preferredLanguage: string };
    };
    assert.equal(verified.valid, true);
    assert.equal(verified.scanCount, 1);
    assert.equal(verified.profile?.uid, uid);
    assert.equal(verified.profile?.preferredLanguage, 'ta');

    // Tampered signature must fail with 403
    const tampered = `${issued.token!.slice(0, -4)}0000`;
    const tamperRes = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawQrText: tampered }),
    });
    assert.equal(tamperRes.status, 403);

    // Unauthenticated QR revoke without currentToken proof must reject with 401
    const unauthRevokeRes = await fetch(`${baseUrl}/api/qr/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid }),
    });
    assert.equal(unauthRevokeRes.status, 401);

    // Revoke & rotate QR token using currentToken possession proof
    const revokeRes = await fetch(`${baseUrl}/api/qr/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, currentToken: issued.token }),
    });
    assert.equal(revokeRes.status, 200);
    const rotated = (await revokeRes.json()) as { token?: string; revokedTokenId?: string };
    assert.ok(rotated.token && rotated.token !== issued.token);
    assert.equal(rotated.revokedTokenId, issued.tokenId);

    // Old revoked QR token must reject with 410 Gone
    const oldVerifyRes = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawQrText: issued.token }),
    });
    assert.equal(oldVerifyRes.status, 410);

    // New rotated QR token must verify cleanly with 200
    const newVerifyRes = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawQrText: rotated.token }),
    });
    assert.equal(newVerifyRes.status, 200);
  });

  await runCase('HTTP /api/network/routing & /api/system/maintenance return adaptive media node & Colombo midnight telemetry', async () => {
    const uhdRes = await fetch(`${baseUrl}/api/network/routing?bandwidthKbps=25000`);
    assert.equal(uhdRes.status, 200);
    const uhdJson = (await uhdRes.json()) as { mediaTier?: string; lowSignalFallbackActive?: boolean };
    assert.equal(uhdJson.mediaTier, '4k_uhd');
    assert.equal(uhdJson.lowSignalFallbackActive, false);

    const lowRes = await fetch(`${baseUrl}/api/network/routing?lowSignal=true`);
    assert.equal(lowRes.status, 200);
    const lowJson = (await lowRes.json()) as { mediaTier?: string; lowSignalFallbackActive?: boolean };
    assert.equal(lowJson.mediaTier, 'low_signal_resilient');
    assert.equal(lowJson.lowSignalFallbackActive, true);

    const runRes = await fetch(`${baseUrl}/api/system/maintenance/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'android_nightly_daemon' }),
    });
    assert.equal(runRes.status, 200);
    const runJson = (await runRes.json()) as { timezone?: string; lastTrigger?: string; runsCompleted?: number };
    assert.equal(runJson.timezone, 'Asia/Colombo');
    assert.equal(runJson.lastTrigger, 'android_nightly_daemon');
    assert.ok((runJson.runsCompleted || 0) >= 1);
  });

  await runCase('classTranslation & worldLanguages: provides 130+ languages, Same-Language Pass-Through, and meeting URL parsing', () => {
    const supportedCount = WORLD_LANGUAGES_CATALOG.filter((l) => l.supported).length;
    assert.ok(supportedCount >= 130, `Expected >= 130 supported languages, got ${supportedCount}`);

    const sameTamil = evaluateSameLanguagePassThrough('ta', 'ta-LK', WORLD_LANGUAGES_CATALOG);
    assert.equal(sameTamil.isPassThrough, true);
    assert.equal(sameTamil.estimatedLatencyMs, 0);
    assert.equal(sameTamil.mode, 'direct_pass_through');

    const crossLang = evaluateSameLanguagePassThrough('ta', 'en-US', WORLD_LANGUAGES_CATALOG);
    assert.equal(crossLang.isPassThrough, false);
    assert.equal(crossLang.mode, 'live_translate');

    assert.equal(parseClassRoomFromInput('https://pkchat.app/class/Physics-101'), 'physics-101');
    assert.equal(parseClassRoomFromInput('pkchat://class/bio-202'), 'bio-202');
    assert.equal(parseClassRoomFromInput('https://localhost:3000/?classRoom=chem-303'), 'chem-303');
  });

  await runCase('HTTP /api/class/* creates meeting links, syncs whiteboard strokes, and enforces 0ms Pass-Through', async () => {
    const createRes = await fetch(`${baseUrl}/api/class/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Grade 11 Physics',
        hostName: 'Teacher Nimal',
        teacherLanguage: 'ta',
      }),
    });
    assert.equal(createRes.status, 200);
    const created = (await createRes.json()) as {
      roomId?: string;
      meetingUrl?: string;
      deepLinkUri?: string;
    };
    assert.ok(created.roomId);
    assert.equal(created.meetingUrl, `https://pkchat.app/class/${created.roomId}`);
    assert.equal(created.deepLinkUri, `pkchat://class/${created.roomId}`);

    const strokeRes = await fetch(`${baseUrl}/api/class/${created.roomId}/stroke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authorName: 'Teacher Nimal',
        tool: 'pen',
        color: '#0284C7',
        width: 4,
        points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }],
      }),
    });
    assert.equal(strokeRes.status, 200);
    const strokeJson = (await strokeRes.json()) as { totalStrokes?: number };
    assert.equal(strokeJson.totalStrokes, 1);

    const subPassRes = await fetch(`${baseUrl}/api/class/${created.roomId}/subtitle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        speakerLanguageCode: 'ta',
        listenerLanguageCode: 'ta-LK',
        text: 'வணக்கம் மாணவர்களே!',
      }),
    });
    assert.equal(subPassRes.status, 200);
    const subPass = (await subPassRes.json()) as {
      subtitle?: { isPassThrough?: boolean; translatedText?: string; lipSyncLatencyMs?: number };
    };
    assert.equal(subPass.subtitle?.isPassThrough, true);
    assert.equal(subPass.subtitle?.lipSyncLatencyMs, 0);
    assert.equal(subPass.subtitle?.translatedText, 'வணக்கம் மாணவர்களே!');

    const translatePassRes = await fetch(`${baseUrl}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Hello students',
        sourceLanguage: 'en-GB',
        targetLanguage: 'en-US',
      }),
    });
    assert.equal(translatePassRes.status, 200);
    const translatePassJson = (await translatePassRes.json()) as {
      passThrough?: boolean;
      engine?: string;
      translatedText?: string;
    };
    assert.equal(translatePassJson.passThrough, true);
    assert.equal(translatePassJson.engine, 'pk-chat-pass-through');
    assert.equal(translatePassJson.translatedText, 'Hello students');

    const createdFull = created as {
      roomId?: string;
      meetingUrl?: string;
      deepLinkUri?: string;
      hostAccessToken?: string;
    };
    assert.ok(createdFull.hostAccessToken);

    // Student without hostAccessToken cannot clear host board (403)
    const studentClearRes = await fetch(`${baseUrl}/api/class/${created.roomId}/whiteboard/clear`, {
      method: 'POST',
    });
    assert.equal(studentClearRes.status, 403);

    // Student cannot hijack teacher role in active room (403)
    const hijackTeacherRes = await fetch(`${baseUrl}/api/class/${created.roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 'student_attacker', name: 'Attacker', role: 'teacher' }),
    });
    assert.equal(hijackTeacherRes.status, 403);

    // Live Subtitle Firewall blocks <script> XSS attempts (400) and redacts PAN sequences
    const xssSubRes = await fetch(`${baseUrl}/api/class/${created.roomId}/subtitle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '<script>alert(1)</script>' }),
    });
    assert.equal(xssSubRes.status, 400);

    const panSubRes = await fetch(`${baseUrl}/api/class/${created.roomId}/subtitle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speakerLanguageCode: 'en', listenerLanguageCode: 'en', text: 'Card 4111-2222-3333-4444 test' }),
    });
    assert.equal(panSubRes.status, 200);
    const panSubJson = (await panSubRes.json()) as { subtitle?: { translatedText?: string } };
    assert.ok(panSubJson.subtitle?.translatedText?.includes('[REDACTED-PAN]'));

    // Host locks whiteboard -> student stroke blocked (403)
    const lockRes = await fetch(`${baseUrl}/api/class/${created.roomId}/lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-class-host-token': createdFull.hostAccessToken!,
      },
      body: JSON.stringify({ locked: true }),
    });
    assert.equal(lockRes.status, 200);

    const lockedStudentStroke = await fetch(`${baseUrl}/api/class/${created.roomId}/stroke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorUid: 'student_1', points: [{ x: 0.2, y: 0.2 }] }),
    });
    assert.equal(lockedStudentStroke.status, 403);

    // Host clears board cleanly with hostAccessToken (200)
    const clearRes = await fetch(`${baseUrl}/api/class/${created.roomId}/whiteboard/clear`, {
      method: 'POST',
      headers: { 'x-class-host-token': createdFull.hostAccessToken! },
    });
    assert.equal(clearRes.status, 200);
  });

  await runCase('Zone 1 E2EE >64KB chunking, Secure Shredder, and Burn Timer expiry work reliably', async () => {
    const bigPayload = 'A'.repeat(72_000);
    const chatId = 'chat_big_payload_audit';
    const kp = await getOrCreateE2eeKeyPair();
    const encrypted = await encryptE2eeText(bigPayload, chatId, kp.publicKeyBase64);
    assert.ok(encrypted && encrypted.length > 0);
    const decrypted = await decryptE2eeText(encrypted, chatId, kp.publicKeyBase64);
    assert.equal(decrypted, bigPayload);

    const sensitiveBuf = new Uint8Array([10, 20, 30, 40, 50]);
    secureShredUint8Array(sensitiveBuf);
    assert.deepEqual(Array.from(sensitiveBuf), [0, 0, 0, 0, 0]);
    assert.ok(secureShredTextPayload().includes('shredded'));

    assert.equal(isMessageExpiredByBurnTimer({ expiresAtMs: Date.now() - 1000, deleted: false }), true);
    assert.equal(isMessageExpiredByBurnTimer({ expiresAtMs: Date.now() + 60_000, deleted: false }), false);
  });

  await runCase('Zone 2, 3, & 4 HTTP Citadel: expired class link 410, Audio Forensics 400, GPS hardening & Master Authority', async () => {
    // Time-limited class expiry check (ttlMs: 15ms)
    const expCreate = await fetch(`${baseUrl}/api/class/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Short Audit Room', ttlMs: 15 }),
    });
    assert.equal(expCreate.status, 200);
    const expRoom = (await expCreate.json()) as { roomId: string };
    await new Promise((r) => setTimeout(r, 35));
    const afterExp = await fetch(`${baseUrl}/api/class/${expRoom.roomId}`);
    assert.equal(afterExp.status, 410);

    // Zone 3 Audio Forensics rejects Windows MZ binary disguised as audio/webm
    const mzBase64 = Buffer.from('MZ\x90\x00ThisIsExecutableNotAudio').toString('base64');
    const badAudioRes = await fetch(`${baseUrl}/api/speech/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64: mzBase64, mimeType: 'audio/webm', targetLanguage: 'en' }),
    });
    assert.equal(badAudioRes.status, 400);

    // Zone 4 Null Island GPS rejection & geofence accuracy
    const nullGpsRes = await fetch(`${baseUrl}/api/emergency/reverse-geocode?lat=0&lng=0`);
    assert.equal(nullGpsRes.status, 400);

    const fenceRes = await fetch(`${baseUrl}/api/security/gps-geofence/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 6.9271, lng: 79.8612, fenceLat: 6.93, fenceLng: 79.86, radiusKm: 5 }),
    });
    assert.equal(fenceRes.status, 200);
    const fenceJson = (await fenceRes.json()) as { validGps?: boolean; withinGeofence?: boolean };
    assert.equal(fenceJson.validGps, true);
    assert.equal(fenceJson.withinGeofence, true);

    // Master authority endpoint requires owner authentication (401 without Bearer token)
    const masterRes = await fetch(`${baseUrl}/api/security/master-authority`);
    assert.equal(masterRes.status, 401);
  });

  await runCase('MasterAlertRoutingEngine: global alerts route to Admin Core first & block unverified regional dispatch', async () => {
    const officialRes = await fetch(`${baseUrl}/api/disasters/official`);
    assert.equal(officialRes.status, 200);
    const officialJson = (await officialRes.json()) as {
      masterCoreRouting?: { adminCoreId?: string; interceptedFirst?: boolean };
      alerts?: Array<{ alertId?: string }>;
    };
    assert.equal(officialJson.masterCoreRouting?.adminCoreId, 'JERAD_PRASANTH_MASTER_CORE');
    assert.equal(officialJson.masterCoreRouting?.interceptedFirst, true);

    // Custom intercepted alert must lock at Admin Core first with isVerifiedByAdmin=false
    const qAlertId = `audit_core_${Date.now()}`;
    const interceptRes = await fetch(`${baseUrl}/api/disasters/master-core/intercept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alertId: qAlertId,
        hazardType: 'flood',
        title: 'Quarantined Regional Flood Relay',
        officialSource: 'Third-Party Unverified Relay',
        location: 'Test Coastal Sector',
        regionCode: 'LK',
        severity: 'warning',
      }),
    });
    assert.equal(interceptRes.status, 200);
    const interceptJson = (await interceptRes.json()) as {
      routedToAdminCoreFirst?: boolean;
      alert?: { routingStage?: string; isVerifiedByAdmin?: boolean };
    };
    assert.equal(interceptJson.routedToAdminCoreFirst, true);
    assert.equal(interceptJson.alert?.routingStage, 'LOCKED_IN_ADMIN_CORE');
    assert.equal(interceptJson.alert?.isVerifiedByAdmin, false);

    // Unverified quarantined alert must NEVER leak into public /api/disasters/official feed
    const afterInterceptFeed = await fetch(`${baseUrl}/api/disasters/official`);
    const afterJson = (await afterInterceptFeed.json()) as { alerts?: Array<{ alertId?: string }> };
    assert.equal(
      (afterJson.alerts || []).some((a) => a.alertId === qAlertId),
      false
    );

    // Regional dispatch & queue endpoints enforce owner Master Core auth (401 without token)
    const unauthDispatch = await fetch(`${baseUrl}/api/disasters/master-core/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertId: qAlertId, regionCode: 'LK', isVerifiedByAdmin: false }),
    });
    assert.equal(unauthDispatch.status, 401);

    const unauthQueue = await fetch(`${baseUrl}/api/disasters/master-core/queue`);
    assert.equal(unauthQueue.status, 401);
  });

  await runCase('Instant PK Signature Wallpaper & Weather Snapshot render immediately without blocking', () => {
    assert.equal(PK_SIGNATURE_WALLPAPER_ID, 'wp_pk_signature');
    assert.ok(PK_SIGNATURE_WALLPAPER_URL.startsWith('data:image/svg+xml'));
    const constantsSrc = readFileSync('src/data/constants.ts', 'utf8');
    assert.ok(constantsSrc.includes('PK_SIGNATURE_WALLPAPER_ID'));
    assert.ok(constantsSrc.includes("title: 'PK Chat Signature Frost'"));

    const weather = getInstantWeatherSnapshot({ countryCode: 'LK', cityName: 'Colombo' });
    assert.equal(weather.city, 'Colombo');
    assert.equal(typeof weather.tempC, 'number');
    assert.ok(weather.icon.length > 0);
  });

  await runCase('Outgoing Call State & Intentional Data-Off Continuity (Offline vs Calling... vs Ringing...)', () => {
    setIntentionalDataOff(false);
    assert.equal(isIntentionalDataOff(), false);

    // Target intentionally turned Mobile Data Off -> show "Offline", DO NOT disturb via GPS/SMS
    const targetDataOff = evaluateOutgoingCallState({
      targetOnlineStatus: 'offline',
      targetIntentionalDataOff: true,
      localNetworkOnline: true,
      localIntentionalDataOff: false,
    });
    assert.equal(targetDataOff.label, 'Offline');
    assert.equal(targetDataOff.canRingDevice, false);
    assert.equal(targetDataOff.allowZeroDataFallback, false);

    // Local device has exhausted/offline internet (NOT intentionally Data Off) & target reachable via SMS continuity
    const zeroDataCall = evaluateOutgoingCallState({
      targetOnlineStatus: 'offline',
      targetIntentionalDataOff: false,
      localNetworkOnline: false,
      localIntentionalDataOff: false,
    });
    assert.equal(zeroDataCall.label, 'Calling...');
    assert.equal(zeroDataCall.canRingDevice, true);
    assert.equal(zeroDataCall.allowZeroDataFallback, true);

    // Target is online and caller is online -> show "Ringing..." cleanly
    const normalRinging = evaluateOutgoingCallState({
      targetOnlineStatus: 'online',
      targetIntentionalDataOff: false,
      localNetworkOnline: true,
      localIntentionalDataOff: false,
    });
    assert.equal(normalRinging.label, 'Ringing...');
    assert.equal(normalRinging.canRingDevice, true);
    assert.equal(normalRinging.allowZeroDataFallback, false);
  });

  await runCase('Dual DND Isolation (PK Chat DND + Zoom Class DND) & 1s SOS Siren Mandatory Override', () => {
    setIntentionalDataOff(false);
    setPkChatDndEnabled(false);
    setZoomClassDndEnabled(false);
    assert.equal(shouldSuppressIncomingAudio({ isZoomClassCall: false }), false);
    assert.equal(shouldSuppressIncomingAudio({ isZoomClassCall: true }), false);

    // Zoom Class DND mutes regular PK Chat notifications/calls, while keeping Zoom Class open
    setZoomClassDndEnabled(true);
    assert.equal(shouldSuppressIncomingAudio({ isZoomClassCall: false }), true);
    assert.equal(shouldSuppressIncomingAudio({ isZoomClassCall: true }), false);

    // PK Chat DND silences both regular PK Chat and Zoom Class calls
    setPkChatDndEnabled(true);
    assert.equal(shouldSuppressIncomingAudio({ isZoomClassCall: false }), true);
    assert.equal(shouldSuppressIncomingAudio({ isZoomClassCall: true }), true);

    // 1-second Long-Press SOS Urgent Siren MUST ALWAYS override both DND modes & Intentional Data Off
    setIntentionalDataOff(true);
    assert.equal(
      shouldSuppressIncomingAudio({ isZoomClassCall: false, isSosOverride: true }),
      false
    );
    assert.equal(
      shouldSuppressIncomingAudio({ isZoomClassCall: true, isSosOverride: true }),
      false
    );

    // Reset DND & Data-Off state
    setIntentionalDataOff(false);
    setPkChatDndEnabled(false);
    setZoomClassDndEnabled(false);
  });

  await runCase('SOS Siren Payload Codec, Data Package Modes, & Headless Ringback/Speaker Controls', () => {
    const encoded = formatSosSirenChatPayload({
      alertId: 'sos_audit_101',
      senderName: 'Prashanth keransiya | Family',
      latitude: 6.92712,
      longitude: 79.86124,
      accuracyMeters: 12,
    });
    const decoded = parseSosSirenChatPayload(encoded);
    assert.ok(decoded !== null);
    assert.equal(decoded?.alertId, 'sos_audit_101');
    assert.equal(decoded?.senderName, 'Prashanth keransiya   Family');
    assert.equal(decoded?.latitude, 6.92712);
    assert.equal(decoded?.longitude, 79.86124);
    assert.equal(decoded?.accuracyMeters, 12);

    const onTheWayMsg = formatSosOnTheWayMessage('Test Responder');
    assert.ok(onTheWayMsg.includes('I Am On The Way!'));
    assert.ok(onTheWayMsg.includes('Test Responder'));

    setDataPackageMode('social_saver');
    assert.equal(getDataPackageMode(), 'social_saver');
    setDataPackageMode('zero_data_continuity');
    assert.equal(getDataPackageMode(), 'zero_data_continuity');
    setDataPackageMode('standard');
    assert.equal(getDataPackageMode(), 'standard');

    assert.equal(isRingbackActive(), false);
    assert.equal(isSosSirenActive(), false);
    assert.equal(setRingbackSpeakerMode(true), true);
    assert.equal(setRingbackSpeakerMode(false), false);
  });

  await runCase('Remember Reminders (Create, Due Collection, Snooze, Done, Delete & Presets)', () => {
    localStorage.removeItem(REMINDERS_STORAGE_KEY);
    const now = Date.now();
    const r15 = computePresetRemindAtMs('15m', undefined, now);
    assert.equal(r15, now + 15 * 60_000);
    const r1h = computePresetRemindAtMs('1h', undefined, now);
    assert.equal(r1h, now + 60 * 60_000);

    const saved = saveReminder({
      reminderId: 'rem_test_1',
      userId: 'user_rem_1',
      title: 'Follow up on Tamil class notes',
      note: 'Send PDF to group',
      category: 'class',
      targetId: 'room_1',
      targetLabel: 'Grade 10 Tamil',
      remindAtMs: now - 5000,
    });
    assert.equal(saved.status, 'pending');
    assert.equal(getActivePendingRemindersCount('user_rem_1'), 1);

    const due = collectDueReminders(now);
    assert.equal(due.length, 1);
    assert.equal(due[0].reminderId, 'rem_test_1');
    assert.equal(due[0].status, 'due');

    const snoozed = snoozeReminder('rem_test_1', 10, now);
    assert.ok(snoozed !== null);
    assert.equal(snoozed?.status, 'snoozed');
    assert.equal(snoozed?.remindAtMs, now + 10 * 60_000);

    const done = markReminderDone('rem_test_1');
    assert.equal(done?.status, 'done');
    assert.equal(getActivePendingRemindersCount('user_rem_1'), 0);

    deleteReminder('rem_test_1');
    assert.equal(getRemindersList('user_rem_1').length, 0);
  });

  await runCase('PK Live Class DND, Overnight 7 AM DND & World-Peace Default Wallpaper Audit', () => {
    setPkChatDndEnabled(false);
    setPkLiveClassDndEnabled(false);
    assert.equal(isPkChatDndEnabled(), false);
    assert.equal(isPkLiveClassDndEnabled(), false);

    const untilMs = setPkChatDndOvernight(7);
    assert.ok(untilMs > Date.now());
    assert.equal(getPkChatDndUntilMs(), untilMs);
    assert.equal(isPkChatDndEnabled(), true);
    assert.equal(shouldSuppressIncomingAudio({ isLiveClassCall: true }), true);

    setPkChatDndEnabled(false);
    assert.equal(getPkChatDndUntilMs(), null);
    setPkLiveClassDndEnabled(true);
    assert.equal(isPkLiveClassDndEnabled(), true);
    assert.equal(shouldSuppressIncomingAudio({ isLiveClassCall: false }), true);
    assert.equal(shouldSuppressIncomingAudio({ isLiveClassCall: true }), false);
    assert.equal(shouldSuppressIncomingAudio({ isLiveClassCall: false, isSosOverride: true }), false);
    setPkLiveClassDndEnabled(false);

    assert.equal(PK_WORLD_PEACE_WALLPAPER_ID, 'wp_world_peace');
    const constantsSrc = readFileSync('src/data/constants.ts', 'utf8');
    assert.ok(constantsSrc.includes('wallpaperId: PK_WORLD_PEACE_WALLPAPER_ID'));
    assert.ok(constantsSrc.includes("title: 'PK World Peace & Unity'"));
    assert.ok(constantsSrc.includes("id: 'sky_glass'"));
  });

  await runCase('UI Source Integrity (PK Live Class, Remember Alerts, Zero Zoom/Green/Reconnecting)', () => {
    const uiFiles = [
      'src/components/ScreenNavigator.tsx',
      'src/components/ClassWhiteboardView.tsx',
      'src/components/CallsView.tsx',
      'src/components/SettingsAndBillingView.tsx',
      'src/components/ChatWorkspace.tsx',
      'src/components/OnboardingFlow.tsx',
      'src/components/StatusUpdatesView.tsx',
    ];
    for (const file of uiFiles) {
      const src = readFileSync(file, 'utf8');
      assert.equal(/Zoom Class|Zoom Settings|Zoom DND|Zoom-Style/.test(src), false, `Found Zoom UI text in ${file}`);
      assert.equal(/#075E54|#25D366|#008069|#00a884|bg-emerald-/.test(src), false, `Found legacy green style in ${file}`);
    }
    const navSrc = readFileSync('src/components/ScreenNavigator.tsx', 'utf8');
    const classSrc = readFileSync('src/components/ClassWhiteboardView.tsx', 'utf8');
    const callsSrc = readFileSync('src/components/CallsView.tsx', 'utf8');
    assert.ok(navSrc.includes('PK Live Class'));
    assert.ok(navSrc.includes('PkLiveClassIcon'));
    assert.ok(classSrc.includes('PK Live Class'));
    assert.ok(classSrc.includes('Remember Class'));
    assert.ok(callsSrc.includes('Remember Call'));
    assert.ok(callsSrc.includes('pk-dialer-section'));
    assert.equal(/>Reconnecting\.\.\.</.test(callsSrc), false);
    assert.equal(/>Reconnecting\.\.\.</.test(navSrc), false);
    assert.ok(classSrc.includes('startClassStudyRecording'));
    assert.ok(classSrc.includes('Saved Study'));
    assert.ok(classSrc.includes('class-safety-blackout'));
    assert.ok(callsSrc.includes('Yes · Allow Recording'));
  });

  await runCase('PK Live Class AI Safety Blackout & 0ms False-Positive Educational Guard', async () => {
    const safeLesson = evaluateClassSafetyContent(
      'Today we are analyzing photosynthesis and the compass rose in geography class.'
    );
    assert.equal(safeLesson.safe, true);
    assert.equal(safeLesson.blackoutRequired, false);

    const unsafeMsg = evaluateClassSafetyContent('Please send nudes or start nsfw sex cam now');
    assert.equal(unsafeMsg.safe, false);
    assert.equal(unsafeMsg.blackoutRequired, true);

    // Pure whiteboard white frame (no blackout)
    const wbData = new Uint8ClampedArray(40 * 40 * 4).fill(255);
    assert.equal(
      analyzeVideoFrameForUnsafeContent({ data: wbData, width: 40, height: 40 }).blackoutRequired,
      false
    );

    // Predominantly exposed skin-tone center frame triggers immediate blackout
    const exposedData = new Uint8ClampedArray(40 * 40 * 4);
    for (let i = 0; i < exposedData.length; i += 4) {
      exposedData[i] = 220;
      exposedData[i + 1] = 155;
      exposedData[i + 2] = 115;
      exposedData[i + 3] = 255;
    }
    assert.equal(
      analyzeVideoFrameForUnsafeContent({ data: exposedData, width: 40, height: 40 }).blackoutRequired,
      true
    );

    const subtitleBlockRes = await fetch('http://127.0.0.1:3000/api/class/pkc-safety-audit/subtitle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        speakerUid: 'audit_tester',
        speakerName: 'Audit Tester',
        speakerLanguageCode: 'en',
        listenerLanguageCode: 'ta',
        text: 'explicit porn video link here',
      }),
    });
    assert.equal(subtitleBlockRes.status, 403);
    const blockJson = (await subtitleBlockRes.json()) as { blackoutTriggered?: boolean };
    assert.equal(blockJson.blackoutTriggered, true);
  });

  await runCase('Official PK Chat Greetings, Localized Red Alerts & Auto-Mark-Read Clearing', () => {
    const dec25 = new Date('2026-12-25T09:00:00Z');
    const greetings = buildOfficialInboxGreetings({
      fullName: 'Prashanth',
      dob: '1998-12-25',
      now: dec25,
    });
    assert.ok(greetings.some((g) => g.occasion === 'birthday' && g.activeToday));
    assert.ok(greetings.some((g) => g.occasion === 'national_festival'));
    assert.ok(greetings.some((g) => g.occasion === 'christmas' && g.activeToday));
    assert.ok(greetings.some((g) => g.occasion === 'new_year'));
    assert.ok(greetings.some((g) => g.occasion === 'ramzan'));
    assert.ok(greetings.every((g) => g.founderName === 'Prashanth keransiya'));
    assert.ok(greetings.every((g) => g.body.includes('Prashanth keransiya') && !/wife/i.test(g.body)));
    assert.ok(greetings.every((g) => !/Prasanth/i.test(g.body)));

    const sampleAlert = {
      alertId: 'lk_cyclone_001',
      hazardType: 'cyclone' as const,
      title: 'Severe Tropical Cyclone Warning',
      officialSource: 'Department of Meteorology (Sri Lanka)',
      sourceUrl: 'https://meteo.gov.lk/',
      location: 'Colombo, Sri Lanka',
      severity: 'extreme' as const,
      issuedAt: '2026-12-25T08:00:00Z',
      status: 'active' as const,
      verifiedOfficial: true as const,
    };
    const tamilAlert = localizeRedAlert(sampleAlert, 'ta', 'Sri Lanka');
    assert.equal(tamilAlert.isRedAlert, true);
    assert.ok(tamilAlert.redAlertBadge.includes('சிவப்பு எச்சரிக்கை'));
    assert.ok(tamilAlert.localizedAdvice.includes('பாதுகாப்பு'));

    const sinhalaAlert = localizeRedAlert(sampleAlert, 'si', 'Sri Lanka');
    assert.ok(sinhalaAlert.redAlertBadge.includes('රතු අනතුරු'));

    const uid = 'audit_inbox_uid';
    const unreadBefore = computeUnreadOfficialInboxCount({
      uid,
      notifications: [
        { id: 'n1', category: 'security', title: 'Shield OK', body: 'Verified', read: false },
      ],
      disasterAlerts: [sampleAlert],
      greetings,
    });
    assert.ok(unreadBefore >= 3);

    markOfficialIdsRead(uid, [
      'n1',
      `disaster_${sampleAlert.alertId}`,
      ...greetings.map((g) => g.id),
    ]);
    const unreadAfter = computeUnreadOfficialInboxCount({
      uid,
      notifications: [
        { id: 'n1', category: 'security', title: 'Shield OK', body: 'Verified', read: false },
      ],
      disasterAlerts: [sampleAlert],
      greetings,
    });
    assert.equal(unreadAfter, 0);
  });

  await runCase('100% Government-Verified Disaster Filter Rejects Social Rumors & Verifies Official Feeds', async () => {
    assert.equal(
      isVerifiedOfficialDisasterAgency('USGS Earthquake Hazards Program', 'https://earthquake.usgs.gov/').verified,
      true
    );
    assert.equal(
      isVerifiedOfficialDisasterAgency('Department of Meteorology (Sri Lanka)', 'https://meteo.gov.lk/').verified,
      true
    );
    assert.equal(
      isVerifiedOfficialDisasterAgency('Viral Telegram Channel', 'https://t.me/fake_tsunami').verified,
      false
    );
    assert.equal(
      isVerifiedOfficialDisasterAgency('Twitter User Post', 'https://x.com/rumor123').verified,
      false
    );

    const rejectRes = await fetch('http://127.0.0.1:3000/api/disasters/verify-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        officialSource: 'Facebook Rumor Page',
        sourceUrl: 'https://facebook.com/fake-flood-alert',
      }),
    });
    assert.equal(rejectRes.status, 403);

    const acceptRes = await fetch('http://127.0.0.1:3000/api/disasters/verify-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        officialSource: 'NOAA National Weather Service',
        sourceUrl: 'https://api.weather.gov/alerts',
      }),
    });
    assert.equal(acceptRes.status, 200);
  });

  await runCase('Play Store Android Readiness: Offline Outbox Queuing, tel: Carrier Fallback & Honest UI Labels', () => {
    clearOfflineOutbox();
    assert.equal(getOfflineOutbox('user_outbox_1').length, 0);

    enqueueOfflineMessage({
      messageId: 'q_msg_1',
      chatId: 'chat_abc',
      chatType: 'direct',
      participantIds: ['user_outbox_1', 'user_peer_2'],
      senderId: 'user_outbox_1',
      senderName: 'Prashanth keransiya',
      senderLanguage: 'en',
      messageType: 'text',
      originalText: 'Queued while offline',
      e2eeEnabled: false,
      queuedAtIso: '2026-11-19T10:00:00Z',
    });
    // Re-enqueuing same ID deduplicates cleanly
    enqueueOfflineMessage({
      messageId: 'q_msg_1',
      chatId: 'chat_abc',
      chatType: 'direct',
      participantIds: ['user_outbox_1', 'user_peer_2'],
      senderId: 'user_outbox_1',
      senderName: 'Prashanth keransiya',
      senderLanguage: 'en',
      messageType: 'text',
      originalText: 'Queued while offline',
      e2eeEnabled: false,
      queuedAtIso: '2026-11-19T10:00:00Z',
    });
    const list = getOfflineOutbox('user_outbox_1');
    assert.equal(list.length, 1);

    const uiBubble = queuedRecordToChatMessage(list[0]);
    assert.equal(uiBubble.pendingOfflineSync, true);
    assert.equal(uiBubble.originalText, 'Queued while offline');

    removeOfflineOutboxItem('q_msg_1');
    assert.equal(getOfflineOutbox('user_outbox_1').length, 0);

    assert.equal(buildTelDialUri('+94 75-344-0226'), 'tel:+94753440226');
    assert.equal(buildTelDialUri('12'), null);

    const guardedFiles = [
      'src/components/CallsView.tsx',
      'src/components/SafetyAndDisasterView.tsx',
      'src/components/SettingsAndBillingView.tsx',
      'src/components/WazeNavigationModal.tsx',
      'src/components/ChatWorkspace.tsx',
      'src/components/EmergencySosIncomingOverlay.tsx',
      'src/components/ScreenNavigator.tsx',
      'server.ts',
    ];
    for (const file of guardedFiles) {
      const src = readFileSync(file, 'utf8');
      assert.equal(
        /Offline Satellite Compass|Satellite GPS|Zero-Data Continuity|Zero-Data Mode|Waze Navigation|Waze Turn|Waze-style|window\.open|window\.alert/.test(src),
        false,
        `Found unrealistic or disallowed pattern in ${file}`
      );
    }

    const callsSrc = readFileSync('src/components/CallsView.tsx', 'utf8');
    assert.equal(callsSrc.includes('ringTimerRef'), false, 'CallsView must not simulate remote answer via timer');
    assert.ok(callsSrc.includes('triggerCellularDialFallback'));

    const classSrc = readFileSync('src/components/ClassWhiteboardView.tsx', 'utf8');
    assert.equal(
      classSrc.includes("setClassCallStatusLabel('Connected');\n        return 'active';"),
      false,
      'ClassWhiteboardView must not simulate remote call connection via timer'
    );
    assert.ok(classSrc.includes('handleToggleClassMic'));
    assert.ok(classSrc.includes('handleLeaveClass'));
    assert.ok(classSrc.includes('startClassLoopbackTest'));
  });

  await runCase('Deep File/Virus Guard (Magic Bytes, 4-Hour Video Limits, Safe URLs)', () => {
    // Disguised executables and XSS payloads must be blocked by magic bytes
    assert.equal(
      inspectMagicBytesBuffer(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), {
        fileName: 'lecture.mp4',
        mimeType: 'video/mp4',
      }).safe,
      false
    );
    assert.equal(
      inspectMagicBytesBuffer(new Uint8Array([0x7f, 0x45, 0x4c, 0x46]), {
        fileName: 'notes.pdf',
        mimeType: 'application/pdf',
      }).safe,
      false
    );
    assert.equal(
      inspectMagicBytesBuffer(new TextEncoder().encode('#!/bin/sh\nrm -rf /'), {
        fileName: 'readme.txt',
        mimeType: 'text/plain',
      }).safe,
      false
    );
    assert.equal(
      inspectMagicBytesBuffer(new TextEncoder().encode('<html><script>alert(1)</script></html>'), {
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
      }).safe,
      false
    );
    assert.equal(
      inspectMagicBytesBuffer(new TextEncoder().encode('NOT_A_PDF_HEADER'), {
        fileName: 'invoice.pdf',
        mimeType: 'application/pdf',
      }).safe,
      false
    );

    // Valid magic headers pass cleanly
    assert.equal(
      inspectMagicBytesBuffer(new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]), {
        fileName: 'class_recording.mp4',
        mimeType: 'video/mp4',
      }).safe,
      true
    );
    assert.equal(
      inspectMagicBytesBuffer(new TextEncoder().encode('%PDF-1.7\n...'), {
        fileName: 'syllabus.pdf',
        mimeType: 'application/pdf',
      }).safe,
      true
    );
    assert.equal(
      inspectMagicBytesBuffer(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), {
        fileName: 'board.png',
        mimeType: 'image/png',
      }).safe,
      true
    );
    assert.equal(
      inspectMagicBytesBuffer(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
      }).safe,
      true
    );

    // Size & duration policies (Up to 2 GB & 4 Hours for videos; 25 MB for docs; 0-byte blocked; double extension blocked)
    assert.equal(
      inspectAttachmentForMalware({
        fileName: '4hr_lecture.mp4',
        mimeType: 'video/mp4',
        sizeBytes: MAX_LARGE_VIDEO_BYTES,
        mediaCategory: 'video',
      }).safe,
      true
    );
    assert.equal(
      inspectAttachmentForMalware({
        fileName: 'oversize.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 30 * 1024 * 1024,
        mediaCategory: 'document',
      }).safe,
      false
    );
    assert.equal(
      inspectAttachmentForMalware({
        fileName: 'report.pdf.exe',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        mediaCategory: 'document',
      }).safe,
      false
    );
    assert.equal(
      inspectAttachmentForMalware({
        fileName: 'empty.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 0,
        mediaCategory: 'video',
      }).safe,
      false
    );

    assert.equal(validateVideoDurationSeconds(MAX_VIDEO_DURATION_SECONDS).valid, true);
    assert.equal(formatDurationClock(MAX_VIDEO_DURATION_SECONDS), '4h 00m 00s');
    assert.equal(validateVideoDurationSeconds(MAX_VIDEO_DURATION_SECONDS + 1).valid, false);

    // Safe media URL filtering
    assert.equal(isSafeMediaUrl('/api/media/file/med_abc12345'), true);
    assert.equal(isSafeMediaUrl('https://firebasestorage.googleapis.com/v0/b/app/o/vid.mp4'), true);
    assert.equal(isSafeMediaUrl('blob:http://localhost:3000/123-456'), true);
    assert.equal(isSafeMediaUrl('data:image/jpeg;base64,/9j/4AAQ'), true);
    assert.equal(isSafeMediaUrl('javascript:alert(1)'), false);
    assert.equal(isSafeMediaUrl('data:text/html,<script>alert(1)</script>'), false);
    assert.equal(isSafeMediaUrl('data:image/svg+xml,<svg onload=alert(1)>'), false);
  });

  await runCase('HTTP Chunked Media Upload, Range Streaming, Magic-Byte Rejection & Class Leave', async () => {
    const uid = 'audit_media_user_1';
    // 1. Reject dangerous filename at init
    const badInit = await fetch('http://127.0.0.1:3000/api/media/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid,
        kind: 'doc',
        fileName: 'trojan.exe',
        mimeType: 'application/octet-stream',
        totalBytes: 512,
      }),
    });
    assert.equal(badInit.status, 400);

    // 2. Reject disguised MZ executable inside .mp4 chunk at offset 0
    const spoofInit = await fetch('http://127.0.0.1:3000/api/media/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid,
        kind: 'vid',
        fileName: 'fake_video.mp4',
        mimeType: 'video/mp4',
        totalBytes: 16,
      }),
    });
    assert.equal(spoofInit.status, 200);
    const spoofSession = (await spoofInit.json()) as { uploadId: string; uploadToken: string };
    const mzPayload = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const spoofChunkRes = await fetch(
      `http://127.0.0.1:3000/api/media/upload/chunk?uploadId=${encodeURIComponent(spoofSession.uploadId)}&offset=0`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-upload-token': spoofSession.uploadToken,
        },
        body: mzPayload,
      }
    );
    assert.equal(spoofChunkRes.status, 400);

    // 3. Valid multi-chunk PDF upload + complete + HTTP Range streaming
    const chunkA = Buffer.from('%PDF-1.7\n1 0 obj\n', 'utf8');
    const chunkB = Buffer.from('<< /Type /Catalog >>\n%%EOF\n', 'utf8');
    const totalBytes = chunkA.length + chunkB.length;

    const initRes = await fetch('http://127.0.0.1:3000/api/media/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid,
        kind: 'doc',
        fileName: 'syllabus_audit.pdf',
        mimeType: 'application/pdf',
        totalBytes,
      }),
    });
    assert.equal(initRes.status, 200);
    const session = (await initRes.json()) as { uploadId: string; uploadToken: string };

    const up1 = await fetch(
      `http://127.0.0.1:3000/api/media/upload/chunk?uploadId=${encodeURIComponent(session.uploadId)}&offset=0`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-upload-token': session.uploadToken,
        },
        body: chunkA,
      }
    );
    assert.equal(up1.status, 200);

    const up2 = await fetch(
      `http://127.0.0.1:3000/api/media/upload/chunk?uploadId=${encodeURIComponent(session.uploadId)}&offset=${chunkA.length}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-upload-token': session.uploadToken,
        },
        body: chunkB,
      }
    );
    assert.equal(up2.status, 200);

    const compRes = await fetch('http://127.0.0.1:3000/api/media/upload/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-upload-token': session.uploadToken,
      },
      body: JSON.stringify({ uploadId: session.uploadId }),
    });
    assert.equal(compRes.status, 200);
    const compJson = (await compRes.json()) as { mediaId: string; url: string; sizeBytes: number };
    assert.equal(compJson.sizeBytes, totalBytes);

    const fullFileRes = await fetch(`http://127.0.0.1:3000${compJson.url}`);
    assert.equal(fullFileRes.status, 200);
    assert.equal(fullFileRes.headers.get('accept-ranges'), 'bytes');
    assert.equal(await fullFileRes.text(), `${chunkA.toString('utf8')}${chunkB.toString('utf8')}`);

    const rangeFileRes = await fetch(`http://127.0.0.1:3000${compJson.url}`, {
      headers: { Range: 'bytes=0-7' },
    });
    assert.equal(rangeFileRes.status, 206);
    assert.equal(await rangeFileRes.text(), '%PDF-1.7');

    // 4. Class leave endpoint cleanly removes participant
    const roomSlug = `pkc-leave-audit-${Date.now()}`;
    await fetch(`http://127.0.0.1:3000/api/class/${roomSlug}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: 'student_leave_1',
        name: 'Audit Student',
        role: 'student',
        preferredLanguage: 'ta',
      }),
    });
    const leaveRes = await fetch(`http://127.0.0.1:3000/api/class/${roomSlug}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 'student_leave_1' }),
    });
    assert.equal(leaveRes.status, 200);
    const leaveJson = (await leaveRes.json()) as { participants: Array<{ uid: string }> };
    assert.equal(leaveJson.participants.some((p) => p.uid === 'student_leave_1'), false);
  });

  await runCase('End-to-End Parity: Automated Greetings (Prashanth keransiya), Locked Light-Blue UI, Camera Menu & Home SOS Geofence', async () => {
    for (const festivalTitle of ['Birthday 🎂', 'Christmas 🎄', 'National Independence Day 🕊️', 'Global New Year 🎆']) {
      const greetRes = await fetch(`${baseUrl}/api/greetings/ai-auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          festivalTitle,
          languageCode: 'ta',
          languageName: 'Tamil',
          recipientName: 'Arun',
        }),
      });
      assert.equal(greetRes.status, 200);
      const greetJson = (await greetRes.json()) as { greetingText: string };
      assert.equal(/பிரசாந்த்\s+கிரன்சியா|பிரசாத்\s+கிரன்சியா|Prasanth|பிகேஜெட்|பார்டர்|wife/i.test(greetJson.greetingText), false);
      assert.ok(greetJson.greetingText.includes('Prashanth keransiya'));
      assert.ok(/ஒற்றுமை|அமைதி|மகிழ்ச்சி|unity|peace|happiness/i.test(greetJson.greetingText));
    }

    const navSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ScreenNavigator.tsx'), 'utf8');
    assert.equal(/Toggle Light and Dark Theme/.test(navSrc), false, 'Dark theme toggle must be removed');

    const statusSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/StatusUpdatesView.tsx'), 'utf8');
    const quickCamBlock = statusSrc.slice(statusSrc.indexOf('const onQuickCamera'), statusSrc.indexOf('window.addEventListener(\'pkchat-open-status-privacy\''));
    assert.equal(quickCamBlock.includes('galleryPhotoInputRef.current?.click()'), false);

    const ctxSrc = fs.readFileSync(path.join(process.cwd(), 'src/context/PkChatContext.tsx'), 'utf8');
    assert.ok(ctxSrc.includes('pk_home_location_v1'));
    assert.ok(ctxSrc.includes('root.classList.remove(\'dark\')'));

    const settingsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SettingsAndBillingView.tsx'), 'utf8');
    const chatSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ChatWorkspace.tsx'), 'utf8');
    assert.ok(settingsSrc.includes('Prashanth keransiya'));
    assert.equal(/wife/i.test(settingsSrc), false);
    assert.ok(chatSrc.includes('PK Chat Official Broadcast · <span translate="no">Prashanth keransiya</span>'));
    assert.equal(/wife/i.test(chatSrc), false);
    assert.ok(settingsSrc.includes('Light-Blue Frosted Glass (Locked Permanent)'));
    assert.equal(/Prasanth keransiya/i.test(settingsSrc), false);
  });

  await runCase('PK CHAT Signature Sound System: continuous looping incoming ringtone, distinct notification chime, IncomingCallOverlay & Settings controls', () => {
    const audioSrc = fs.readFileSync(path.join(process.cwd(), 'src/lib/audioTones.ts'), 'utf8');
    assert.ok(audioSrc.includes('RINGTONE_STATE_EVENT'));
    assert.ok(audioSrc.includes('RINGTONE_LOOP_INTERVAL_MS'));
    assert.ok(audioSrc.includes('playCrystalBellTone'));
    assert.ok(audioSrc.includes('emitRingtoneState'));
    // Preview defaults to continuous loop (shouldLoop = options?.loop !== false) with setInterval + stopRingingLoop cleanup
    assert.ok(audioSrc.includes('const shouldLoop = options?.loop !== false'));
    assert.ok(audioSrc.includes('activeRingInterval = setInterval'));

    const overlaySrc = fs.readFileSync(path.join(process.cwd(), 'src/components/IncomingCallOverlay.tsx'), 'utf8');
    assert.ok(overlaySrc.includes('startRingingLoop'));
    assert.ok(overlaySrc.includes('stopRingingLoop'));
    assert.ok(overlaySrc.includes('pkchat-simulate-incoming-call'));
    assert.ok(overlaySrc.includes('Answer'));
    assert.ok(overlaySrc.includes('Decline'));
    assert.ok(overlaySrc.includes('Mute Ring'));

    const navSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ScreenNavigator.tsx'), 'utf8');
    assert.ok(navSrc.includes('<IncomingCallOverlay />'));

    const settingsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SettingsAndBillingView.tsx'), 'utf8');
    assert.ok(settingsSrc.includes('Test Incoming Call'));
    assert.ok(settingsSrc.includes('Stop Ringtone'));
    assert.ok(settingsSrc.includes('Stop Loop'));
    assert.ok(settingsSrc.includes('Loop Preview'));
    assert.ok(settingsSrc.includes('if (isCallChannel) return;'));
  });

  await runCase('Country & Network Phone Matching (detectOperatingCountryContext & validatePhoneMatchesOperatingCountry)', () => {
    const lkCtx = detectOperatingCountryContext('Asia/Colombo', 'en-LK');
    assert.equal(lkCtx.countryCode, 'LK');
    assert.equal(lkCtx.dialCode, '+94');
    assert.equal(lkCtx.source, 'timezone');

    const validLk = validatePhoneMatchesOperatingCountry({
      rawPhone: '071 786 0693',
      selectedCountryCode: 'LK',
      selectedDialCode: '+94',
      operatingContext: lkCtx,
    });
    assert.equal(validLk.valid, true);
    assert.equal(validLk.e164, '+94717860693');

    const mismatchUkInLk = validatePhoneMatchesOperatingCountry({
      rawPhone: '7700900123',
      selectedCountryCode: 'GB',
      selectedDialCode: '+44',
      operatingContext: lkCtx,
    });
    assert.equal(mismatchUkInLk.valid, false);
    assert.ok(mismatchUkInLk.reason?.includes('+94'));

    const invalidLkFixed = validatePhoneMatchesOperatingCountry({
      rawPhone: '112345678',
      selectedCountryCode: 'LK',
      selectedDialCode: '+94',
      operatingContext: lkCtx,
    });
    assert.equal(invalidLkFixed.valid, false);

    const previewTestBypass = validatePhoneMatchesOperatingCountry({
      rawPhone: WEB_PREVIEW_TEST_PHONE,
      selectedCountryCode: 'US',
      selectedDialCode: '+1',
      operatingContext: detectOperatingCountryContext('America/New_York', 'en-US'),
    });
    assert.equal(previewTestBypass.valid, true);
  });

  await runCase('Sequential Onboarding, Immediate Old-User Camera Recovery, Instant Call Answer Handoff & VIP SOS Isolation', () => {
    const onboardingSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/OnboardingFlow.tsx'), 'utf8');
    assert.ok(onboardingSrc.includes('1. Gmail Login'));
    assert.ok(onboardingSrc.includes('2. Photo Verify'));
    assert.ok(onboardingSrc.includes('3. Country Phone'));
    assert.ok(onboardingSrc.includes('handleStep3OkNextToProfile'));
    assert.ok(onboardingSrc.includes('validatePhoneMatchesOperatingCountry'));
    assert.ok(onboardingSrc.includes('Old User · Open Camera &amp; Recover'));
    assert.ok(onboardingSrc.includes('handleStartEyeFaceCameraCheck'));

    const overlaySrc = fs.readFileSync(path.join(process.cwd(), 'src/components/IncomingCallOverlay.tsx'), 'utf8');
    assert.ok(overlaySrc.includes('__pkPendingAnsweredCall'));
    assert.ok(overlaySrc.includes('pkchat-call-answered'));
    // Must navigate immediately without blocking on updateCallStatus
    const answerBlock = overlaySrc.slice(overlaySrc.indexOf('const handleAnswer'), overlaySrc.indexOf('const handleDecline'));
    assert.equal(answerBlock.includes('await updateCallStatus'), false);

    const callsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/CallsView.tsx'), 'utf8');
    assert.ok(callsSrc.includes('applyAnsweredCallHandoff'));
    assert.ok(callsSrc.includes('pkchat-call-answered'));
    assert.ok(callsSrc.includes('Test Video Call'));
    assert.ok(callsSrc.includes("conn?.addEventListener?.('change', evaluateConnection)"));

    const secOverlaySrc = fs.readFileSync(path.join(process.cwd(), 'src/components/GlobalSecurityOverlay.tsx'), 'utf8');
    assert.equal(/>Reconnecting\.\.\.</.test(secOverlaySrc), false);

    const ctxSrc = fs.readFileSync(path.join(process.cwd(), 'src/context/PkChatContext.tsx'), 'utf8');
    assert.ok(ctxSrc.includes('pk_seq_onboarding_done_'));
    assert.ok(ctxSrc.includes('isVipFounderFreeNumber(contact.phone)'));
    assert.ok(ctxSrc.includes('!isVipFounderFreeNumber(ec.phone)'));
    assert.ok(ctxSrc.includes('VIP Founder numbers are reserved strictly for Subscription Free Access and cannot be used as SOS contacts.'));
  });

  await runCase('Live Video Call Translation HUD & Continuous Speech Pipeline Verification', () => {
    const callsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/CallsView.tsx'), 'utf8');
    assert.ok(callsSrc.includes('Live Call Translation HUD'));
    assert.ok(callsSrc.includes('showCaptionsInOverlay'));
    assert.ok(callsSrc.includes('keepListeningRef'));
    assert.ok(callsSrc.includes('startContinuousSpeechRecognition'));
    assert.ok(callsSrc.includes('stopContinuousSpeechRecognition'));
    assert.ok(callsSrc.includes('Local Mic/Cam Test'));
    assert.ok(callsSrc.includes('Voice ON'));
    assert.ok(callsSrc.includes('Captions'));
    // Must allow live translation captions and voice playback during video calls without halting MediaStream
    assert.ok(callsSrc.includes("handoff.callType === 'video'") && callsSrc.includes('isVideo'));
  });

  await runCase('100% Light-Blue Frosted Glass UI, Strict English Founder Name & Zero Obsolete Branding', () => {
    const filesToAudit = [
      'index.html',
      'src/index.css',
      'src/components/ScreenNavigator.tsx',
      'src/components/CallsView.tsx',
      'src/components/OnboardingFlow.tsx',
      'src/components/SettingsAndBillingView.tsx',
      'src/components/ChatWorkspace.tsx',
      'src/components/StatusUpdatesView.tsx',
      'src/components/SafetyAndDisasterView.tsx',
      'src/components/AdminDashboardView.tsx',
    ];

    for (const relPath of filesToAudit) {
      const content = fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
      // Must preserve PK CHAT light-blue frosted glass / sky palette
      assert.ok(
        content.includes('backdrop-blur') ||
          content.includes('#d7efff') ||
          content.includes('#e3f3ff') ||
          content.includes('#dff1ff') ||
          content.includes('#e0f2fe') ||
          content.includes('#d2ebff'),
        `${relPath} must use PK CHAT light-blue frosted glass tokens`
      );
      // Must NOT override with opaque plain white page shells or WhatsApp green hexes
      assert.equal(content.includes('bg-slate-50 dark:bg-slate-950'), false, `${relPath} has opaque slate-50 shell`);
      assert.equal(content.includes('via-white'), false, `${relPath} has via-white gradient override`);
      assert.equal(/Zoom Class/i.test(content), false, `${relPath} has obsolete Zoom Class label`);
      assert.equal(content.includes('#075E54'), false, `${relPath} has WhatsApp dark green hex`);
      assert.equal(content.includes('#25D366'), false, `${relPath} has WhatsApp green hex`);
      assert.equal(content.includes('Prasanth'), false, `${relPath} has misspelled Prasanth`);
    }

    const inboxEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/lib/officialInboxEngine.ts'), 'utf8');
    const i18nSrc = fs.readFileSync(path.join(process.cwd(), 'src/lib/i18n.tsx'), 'utf8');
    const constantsSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/constants.ts'), 'utf8');
    assert.ok(inboxEngineSrc.includes('Prashanth keransiya'));
    assert.ok(inboxEngineSrc.includes('சொந்த உறவினர்'));
    assert.ok(i18nSrc.includes("FOUNDER_CANONICAL_NAME = 'Prashanth keransiya'"));
    assert.equal(constantsSrc.includes('Prasanth'), false);
    assert.equal(constantsSrc.includes('பிகேஜெட்'), false);
  });

  await runCase('100% WhatsApp Experience, Settings Directory (Account/Privacy/Chats/Notifications/Storage/Help) & VIP Rules', () => {
    const chatSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ChatWorkspace.tsx'), 'utf8');
    assert.ok(chatSrc.includes('Neengal saptirgala'));
    assert.ok(chatSrc.includes('CheckCheck'));
    assert.ok(chatSrc.includes('MediaRecorder'));
    assert.ok(chatSrc.includes('uploadChatMediaFile'));

    const settingsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SettingsAndBillingView.tsx'), 'utf8');
    assert.ok(settingsSrc.includes('Account (Profile, Country Phone, DOB & Face/Eye Recovery)'));
    assert.ok(settingsSrc.includes('Privacy (Last seen, Profile photo, About, Status exclusion & Blocked)'));
    assert.ok(settingsSrc.includes('Chats (Dynamic Backgrounds, Bubble Color & History)'));
    assert.ok(settingsSrc.includes('Notifications & Ringtones'));
    assert.ok(settingsSrc.includes('Storage & Data (Usage, Data Saver & Security Logs)'));
    assert.ok(settingsSrc.includes('Storage &amp; Data Manager'));
    assert.ok(settingsSrc.includes('Help (Help Center, App Stores & Contact Us)'));
    assert.equal(/Toggle Dark Mode|Enable Dark Mode/i.test(settingsSrc), false);

    assert.equal(STANDARD_FREE_TRIAL_DAYS, 90);
    assert.equal(STANDARD_ANNUAL_PRICE_USD, 10);
    for (const num of ['+94760852503', '+94712197111', '+94717860693', '+94753440226']) {
      assert.equal(isVipFounderFreeNumber(num), true);
      assert.equal(isVipFounderFreeNumber(num.replace('+', '')), true);
      assert.equal(hasFreeVipStatusAndAdAccess(num), true);
    }
  });

  await runCase('PK Live Class Speaker/Grid View, Beauty Filter, Host Controls UI & /api/class/:roomId/host-action API', async () => {
    const classSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ClassWhiteboardView.tsx'), 'utf8');
    assert.ok(classSrc.includes('Grid View'));
    assert.ok(classSrc.includes('Speaker View'));
    assert.ok(classSrc.includes('Beauty '));
    assert.ok(classSrc.includes('Host Controls'));
    assert.ok(classSrc.includes('Mute All'));
    assert.ok(classSrc.includes('Lower Hands'));
    assert.ok(classSrc.includes('End Class'));

    const createRes = await fetch(`${baseUrl}/api/class/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Host Control Verification Room',
        hostUid: 'host_u1',
        hostName: 'Teacher Host',
        teacherLanguage: 'en',
      }),
    });
    assert.equal(createRes.status, 200);
    const created = (await createRes.json()) as { roomId: string; hostAccessToken: string };
    assert.ok(created.hostAccessToken);

    // Join a student with raised hand
    await fetch(`${baseUrl}/api/class/${created.roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 'stu_1', name: 'Student One', role: 'student', preferredLanguage: 'ta' }),
    });
    await fetch(`${baseUrl}/api/class/${created.roomId}/hand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 'stu_1', handRaised: true }),
    });

    // Non-host request must fail with 403
    const unauthHostRes = await fetch(`${baseUrl}/api/class/${created.roomId}/host-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mute_all' }),
    });
    assert.equal(unauthHostRes.status, 403);

    // Authorized host can mute all, lower all hands, remove participant, and end class
    const muteRes = await fetch(`${baseUrl}/api/class/${created.roomId}/host-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-class-host-token': created.hostAccessToken,
      },
      body: JSON.stringify({ action: 'mute_all' }),
    });
    assert.equal(muteRes.status, 200);
    const muteJson = (await muteRes.json()) as { participants: Array<{ uid: string; muted?: boolean }> };
    assert.equal(muteJson.participants.find((p) => p.uid === 'stu_1')?.muted, true);

    const lowerRes = await fetch(`${baseUrl}/api/class/${created.roomId}/host-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-class-host-token': created.hostAccessToken,
      },
      body: JSON.stringify({ action: 'lower_all_hands' }),
    });
    assert.equal(lowerRes.status, 200);
    const lowerJson = (await lowerRes.json()) as { participants: Array<{ uid: string; handRaised: boolean }> };
    assert.equal(lowerJson.participants.find((p) => p.uid === 'stu_1')?.handRaised, false);

    const endRes = await fetch(`${baseUrl}/api/class/${created.roomId}/host-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-class-host-token': created.hostAccessToken,
      },
      body: JSON.stringify({ action: 'end_class' }),
    });
    assert.equal(endRes.status, 200);
  });

  await runCase('Real-Time Video Call Screen Sharing (getDisplayMedia, Iframe Preview Fallback, Camera Restore & Active Controls)', () => {
    const callsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/CallsView.tsx'), 'utf8');
    assert.ok(callsSrc.includes('getDisplayMedia'));
    assert.ok(callsSrc.includes('audio: true'));
    assert.ok(callsSrc.includes('createFallbackScreenShareStream'));
    assert.ok(callsSrc.includes('You are sharing your screen'));
    assert.ok(callsSrc.includes('Stop Sharing'));
    assert.ok(callsSrc.includes('Share Screen'));
    assert.ok(callsSrc.includes('handleStopScreenShare'));
    assert.ok(callsSrc.includes('replaceTrack'));
    assert.ok(callsSrc.includes('handleToggleVideoCamera'));
    assert.ok(callsSrc.includes('beautyFilterEnabled'));
  });

  await runCase('Sponsored Business Ads Engine & Google Play Billing Config (90d trial, $10/yr, $5/$10 Pay-at-Publish & $100/yr Unlimited)', () => {
    assert.equal(GOOGLE_PLAY_BILLING_CONFIG.generalSubscription.trialDays, 90);
    assert.equal(GOOGLE_PLAY_BILLING_CONFIG.generalSubscription.priceUsd, 10);
    assert.equal(GOOGLE_PLAY_BILLING_CONFIG.adTiers.small.priceUsd, 5);
    assert.equal(GOOGLE_PLAY_BILLING_CONFIG.adTiers.large.priceUsd, 10);
    assert.equal(GOOGLE_PLAY_BILLING_CONFIG.unlimitedPackage.priceUsd, 100);
    assert.equal(GOOGLE_PLAY_BILLING_CONFIG.billingLibraryVersion, '8.0.0');

    const unsafe = preScreenAdContentSafety({
      businessName: 'Bad Co',
      category: 'Retail',
      title: 'Buy illegal firearm',
      description: 'Quick phishing kit available today',
    });
    assert.equal(unsafe.safe, false);

    const safe = preScreenAdContentSafety({
      businessName: 'Kandy Fresh Tea',
      category: 'Food & Bakery',
      title: 'Fresh Ceylon Loose Leaf',
      description: 'Same-day local shop tea pack delivery across Kandy.',
    });
    assert.equal(safe.safe, true);

    assert.equal(
      classifyAdScaleDeterministic({
        title: 'Local Bakery Cupcakes',
        description: 'Warm cupcakes daily.',
        mediaType: 'image',
        targetCountry: 'Sri Lanka',
      }),
      'small'
    );
    assert.equal(
      classifyAdScaleDeterministic({
        title: 'Nationwide Wholesale Distributor',
        description: 'Global franchise supply chain campaign.',
        mediaType: 'video',
        durationSeconds: 40,
        targetCountry: 'Global',
        enableLiveClass: true,
      }),
      'large'
    );

    const filtered = filterPublicAdsForViewer({
      ads: [
        {
          adId: 'a1',
          businessId: 'b1',
          sellerUid: 's_ok',
          businessName: 'Lanka Craft',
          category: 'Fashion & Crafts',
          title: 'Handloom Sarees',
          description: 'Traditional weave.',
          mediaType: 'image',
          mediaUrl: 'data:image/jpeg;base64,/9j/',
          mediaMimeType: 'image/jpeg',
          durationSeconds: 0,
          targetCountry: 'Sri Lanka',
          targetLanguage: 'Tamil',
          adScale: 'small',
          pricePaidUsd: 5,
          playBillingSku: 'pk_ad_small_5usd',
          billingTokenMasked: 'gpb_***1234',
          selfieVerified: true,
          enableDirectCall: true,
          enableLiveClass: false,
          status: 'active',
          reportCount: 0,
          underReviewThreshold: 15,
          aiModerationSummary: 'Approved safety check',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          adId: 'a2',
          businessId: 'b2',
          sellerUid: 's_blocked',
          businessName: 'Blocked Seller',
          category: 'Retail & Local Shop',
          title: 'Should Hide',
          description: 'Blocked by viewer.',
          mediaType: 'image',
          mediaUrl: 'data:image/jpeg;base64,/9j/',
          mediaMimeType: 'image/jpeg',
          durationSeconds: 0,
          targetCountry: 'Sri Lanka',
          targetLanguage: 'Tamil',
          adScale: 'small',
          pricePaidUsd: 5,
          playBillingSku: 'pk_ad_small_5usd',
          billingTokenMasked: 'gpb_***9999',
          selfieVerified: true,
          enableDirectCall: true,
          enableLiveClass: false,
          status: 'active',
          reportCount: 0,
          underReviewThreshold: 15,
          aiModerationSummary: 'Approved safety check',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      country: 'Sri Lanka',
      language: 'Tamil',
      blockedSellerUids: ['s_blocked'],
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].adId, 'a1');
  });

  await runCase('HTTP E2E /api/ads/* Lifecycle (Selfie Gate, Pay-at-Publish, Private 1-to-1 Order & Anti-False-Report Shield)', async () => {
    const cfgRes = await fetch(`${baseUrl}/api/ads/config`);
    assert.equal(cfgRes.status, 200);
    const cfgJson = (await cfgRes.json()) as {
      smallAdPriceUsd: number;
      largeAdPriceUsd: number;
      annualProPriceUsd: number;
      freeTrialDays: number;
    };
    assert.equal(cfgJson.smallAdPriceUsd, 5);
    assert.equal(cfgJson.largeAdPriceUsd, 10);
    assert.equal(cfgJson.annualProPriceUsd, 10);
    assert.equal(cfgJson.freeTrialDays, 90);

    const sellerUid = `e2e_seller_${Date.now()}`;
    const buyerUid = `e2e_buyer_${Date.now()}`;

    // Save business profile ($0 setup) with private contact details
    const profRes = await fetch(`${baseUrl}/api/ads/business-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerUid: sellerUid,
        businessName: 'Jaffna Spice Basket',
        category: 'Food & Bakery',
        country: 'Sri Lanka',
        countryCode: 'LK',
        primaryLanguage: 'Tamil',
        privatePhone: '+94775551234',
        privateEmail: 'spice.private@example.com',
      }),
    });
    assert.equal(profRes.status, 200);

    // 1) Missing selfie must block publish with 403
    const unverifiedPub = await fetch(`${baseUrl}/api/ads/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sellerUid,
        businessName: 'Jaffna Spice Basket',
        category: 'Food & Bakery',
        title: 'Organic Curry Pack',
        description: 'Fresh roasted spice blend.',
        mediaType: 'image',
        mediaUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/',
        targetCountry: 'Sri Lanka',
        targetLanguage: 'Tamil',
        playBillingPurchaseToken: 'gpb_valid_token_9988',
      }),
    });
    assert.equal(unverifiedPub.status, 403);

    // 2) Verify live selfie (at least 24 decoded bytes)
    const sampleImgB64 = Buffer.from('PKCHAT-VERIFIED-LIVE-SELFIE-TEST-FRAME-BYTES-123456').toString('base64');
    const selfieRes = await fetch(`${baseUrl}/api/ads/verify-selfie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerUid: sellerUid,
        selfieDataUrl: `data:image/jpeg;base64,${sampleImgB64}`,
        phoneNumber: '+94775551234',
        email: 'spice.private@example.com',
      }),
    });
    assert.equal(selfieRes.status, 200);
    const selfieJson = (await selfieRes.json()) as { verified: boolean };
    assert.equal(selfieJson.verified, true);

    // 3) Unsafe content rejected with 400
    const unsafePub = await fetch(`${baseUrl}/api/ads/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sellerUid,
        businessName: 'Jaffna Spice Basket',
        title: 'Buy illegal firearm bundle',
        description: 'Carding phishing kit inside.',
        mediaType: 'image',
        mediaUrl: `data:image/jpeg;base64,${sampleImgB64}`,
        playBillingPurchaseToken: 'gpb_valid_token_9988',
      }),
    });
    assert.equal(unsafePub.status, 400);

    // 4) Missing Google Play Billing token rejected with 402
    const unpaidPub = await fetch(`${baseUrl}/api/ads/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sellerUid,
        businessName: 'Jaffna Spice Basket',
        category: 'Food & Bakery',
        title: 'Fresh Jaffna Curry Powder',
        description: 'Pure sun-dried masala packed daily in Jaffna.',
        mediaType: 'image',
        mediaUrl: `data:image/jpeg;base64,${sampleImgB64}`,
        targetCountry: 'Sri Lanka',
        targetLanguage: 'Tamil',
      }),
    });
    assert.equal(unpaidPub.status, 402);

    // 5) Valid publish succeeds with $5 Small tier & never leaks privatePhone/privateEmail
    const validPub = await fetch(`${baseUrl}/api/ads/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sellerUid,
        businessName: 'Jaffna Spice Basket',
        category: 'Food & Bakery',
        title: 'Fresh Jaffna Curry Powder',
        description: 'Pure sun-dried masala packed daily in Jaffna.',
        mediaType: 'image',
        mediaUrl: `data:image/jpeg;base64,${sampleImgB64}`,
        targetCountry: 'Sri Lanka',
        targetLanguage: 'Tamil',
        playBillingPurchaseToken: 'gpb_small_paid_token_123456',
      }),
    });
    assert.equal(validPub.status, 200);
    const pubJson = (await validPub.json()) as {
      ad: { adId: string; pricePaidUsd: number; adScale: string };
    };
    assert.equal(pubJson.ad.adScale, 'small');
    assert.equal(pubJson.ad.pricePaidUsd, 5);
    const pubRaw = JSON.stringify(pubJson);
    assert.equal(pubRaw.includes('+94775551234'), false);
    assert.equal(pubRaw.includes('spice.private@example.com'), false);

    // 6) Public listing query respects country/language & hides private contacts
    const publicRes = await fetch(
      `${baseUrl}/api/ads/public?country=Sri%20Lanka&language=Tamil&page=1&pageSize=10`
    );
    assert.equal(publicRes.status, 200);
    const publicText = await publicRes.text();
    assert.ok(publicText.includes(pubJson.ad.adId));
    assert.equal(publicText.includes('+94775551234'), false);
    assert.equal(publicText.includes('spice.private@example.com'), false);

    // 7) 1-to-1 private request + $0 FREE Product Received confirmation
    const reqRes = await fetch(`${baseUrl}/api/ads/${pubJson.ad.adId}/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyerUid,
        buyerName: 'Kumaran',
        fulfillmentType: 'deliver_to_location',
        deliveryNote: 'Deliver near Town Hall',
        buyerLocation: { latitude: 9.6615, longitude: 80.0255, displayAddress: 'Jaffna' },
      }),
    });
    assert.equal(reqRes.status, 200);
    const reqJson = (await reqRes.json()) as {
      request: { requestId: string; feeUsd: number; status: string };
    };
    assert.equal(reqJson.request.feeUsd, 0);
    assert.equal(reqJson.request.status, 'requested');

    const rcvRes = await fetch(`${baseUrl}/api/ads/requests/${reqJson.request.requestId}/received`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerUid }),
    });
    assert.equal(rcvRes.status, 200);
    const rcvJson = (await rcvRes.json()) as { request: { status: string; feeUsd: number }; feeUsd: number };
    assert.equal(rcvJson.request.status, 'received');
    assert.equal(rcvJson.feeUsd, 0);

    // 8) Anti-False-Report Protection: 16 reports transition ad to 'under_review', NEVER auto-ban
    let lastReportStatus = '';
    let autoBanPrevented = false;
    for (let i = 0; i < 16; i += 1) {
      const repRes = await fetch(`${baseUrl}/api/ads/${pubJson.ad.adId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporterUid: `mass_reporter_${i}`,
          category: 'spam_misleading',
          reason: 'Competitor false report wave',
        }),
      });
      assert.equal(repRes.status, 200);
      const repJson = (await repRes.json()) as { adStatus: string; autoBanPrevented: boolean };
      lastReportStatus = repJson.adStatus;
      autoBanPrevented = repJson.autoBanPrevented;
    }
    assert.equal(lastReportStatus, 'under_review');
    assert.equal(autoBanPrevented, true);

    // Dismissing false reports restores ad cleanly to 'active'
    const dismissRes = await fetch(`${baseUrl}/api/ads/${pubJson.ad.adId}/verify-violation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmedViolation: false }),
    });
    assert.equal(dismissRes.status, 200);
    const dismissJson = (await dismissRes.json()) as { ad: { status: string; reportCount: number } };
    assert.equal(dismissJson.ad.status, 'active');
    assert.equal(dismissJson.ad.reportCount, 0);

    // Confirming violation suspends ad and issues formal ViolationWarningNotice
    const suspendRes = await fetch(`${baseUrl}/api/ads/${pubJson.ad.adId}/verify-violation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirmedViolation: true,
        violationCategory: 'prohibited_scam',
        evidenceSummary: 'Verified test suspension proof.',
      }),
    });
    assert.equal(suspendRes.status, 200);
    const suspendJson = (await suspendRes.json()) as {
      ad: { status: string };
      warningNotice: { actionTaken: string } | null;
    };
    assert.equal(suspendJson.ad.status, 'suspended');
    assert.equal(suspendJson.warningNotice?.actionTaken, 'suspended');

    const warnRes = await fetch(`${baseUrl}/api/ads/warnings/${sellerUid}`);
    assert.equal(warnRes.status, 200);
    const warnJson = (await warnRes.json()) as { warnings: Array<{ adId: string }> };
    assert.ok(warnJson.warnings.some((w) => w.adId === pubJson.ad.adId));
  });

  await runCase('Unique PK Chat Audio/Ringtone System & 45s Missed Call Timeout Cleanup', () => {
    assert.equal(DEFAULT_RING_TIMEOUT_MS, 45_000);
    const audioSrc = fs.readFileSync(path.join(process.cwd(), 'src/lib/audioTones.ts'), 'utf8');
    const incomingSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/IncomingCallOverlay.tsx'), 'utf8');
    const callsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/CallsView.tsx'), 'utf8');

    assert.ok(audioSrc.includes('installAudioGestureUnlock'));
    assert.ok(audioSrc.includes('runWhenAudioResumed'));
    assert.ok(audioSrc.includes('RINGTONE_LOOP_INTERVAL_MS = 2900'));
    assert.ok(audioSrc.includes('DEFAULT_RING_TIMEOUT_MS = 45_000'));

    assert.ok(incomingSrc.includes('DEFAULT_RING_TIMEOUT_MS'));
    assert.ok(incomingSrc.includes('sanitizeIncomingDisplayName'));
    assert.ok(incomingSrc.includes('callerPhone'));

    assert.ok(callsSrc.includes('DEFAULT_RING_TIMEOUT_MS'));
    assert.ok(callsSrc.includes('sanitizeCallLabel'));
    assert.ok(callsSrc.includes('handoff.callerPhone'));
  });

  await runCase('Clean OTP-Free Onboarding (Gmail Name + Live Camera + OK/Next) & Phone-Number Calling Routing', () => {
    const typesSrc = fs.readFileSync(path.join(process.cwd(), 'src/types/pkchat.ts'), 'utf8');
    const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
    const onboardingSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/OnboardingFlow.tsx'), 'utf8');
    const ctxSrc = fs.readFileSync(path.join(process.cwd(), 'src/context/PkChatContext.tsx'), 'utf8');
    const callsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/CallsView.tsx'), 'utf8');

    assert.equal(typesSrc.includes("'otp_verify'"), false);
    assert.equal(typesSrc.includes("'country_select'"), false);
    assert.equal(appSrc.includes("'otp_verify'"), false);
    assert.equal(appSrc.includes("'country_select'"), false);
    assert.equal(onboardingSrc.includes("'otp_verify'"), false);
    assert.equal(onboardingSrc.includes("'country_select'"), false);
    assert.equal(ctxSrc.includes("'otp_verify'"), false);

    // Gmail name must bind directly to editable fullName without quickNameInput snap-back
    assert.equal(onboardingSrc.includes('quickNameInput'), false);
    assert.ok(onboardingSrc.includes('handleStep3OkNextToProfile'));
    assert.ok(onboardingSrc.includes('OK / Next'));
    assert.ok(ctxSrc.includes('callerPhone'));
    assert.ok(ctxSrc.includes('targetPhone'));

    // Contact call button must never pass contact.country as the dialed number
    assert.equal(callsSrc.includes('number: contact.country'), false);
  });

  await runCase('Soft Musical PK Chat Audio Engine, Play-Billing-Only UI & Zero-Name 4-VIP Security Check', () => {
    const audioSrc = fs.readFileSync(path.join(process.cwd(), 'src/lib/audioTones.ts'), 'utf8');
    const billingSrc = fs.readFileSync(path.join(process.cwd(), 'src/lib/subscriptionBilling.ts'), 'utf8');
    const settingsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SettingsAndBillingView.tsx'), 'utf8');
    const storeModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/StoreDownloadModal.tsx'), 'utf8');
    const incomingSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/IncomingCallOverlay.tsx'), 'utf8');

    // Exclusive warm marimba + bell + ambient pad audio design
    assert.ok(audioSrc.includes('playWarmMarimbaNote'));
    assert.ok(audioSrc.includes('playAmbientPadTone'));
    assert.ok(audioSrc.includes('playCrystalBellTone'));
    assert.ok(incomingSrc.includes('marimba, bell'));

    // Zero names next to VIP numbers
    const vipSubBlock = billingSrc.slice(0, 650);
    assert.ok(vipSubBlock.includes('+94753440226'));
    assert.equal(/Prashanth|Wife|Nithya|Priya|Kamal/i.test(vipSubBlock), false);

    // Strictly Google Play Store Billing ONLY in billing UI & payout modal
    assert.equal(settingsSrc.includes('apple_iap_test'), false);
    assert.equal(settingsSrc.includes('test_mode_gateway'), false);
    assert.equal(storeModalSrc.includes('Stripe'), false);
    assert.equal(storeModalSrc.includes('Apple App Store'), false);
  });

  await runCase('HTTP E2E $100/yr Unlimited Ads, 4th VIP $0 Ads, Multi-Country/All Country Targeting & Explicit Content Shield', async () => {
    const sampleImgB64 = Buffer.from('PKCHAT-UNLIMITED-ADS-TEST-IMAGE-BYTES-987654321').toString('base64');

    // 1) Explicit sexual content blocked across securityShield + /api/ads/business-profile + /api/ads/publish
    const badText = detectExplicitSexualContent('Hot hardcore porn escort xxx service available now');
    assert.equal(badText.safe, false);
    const badTamilText = detectExplicitSexualContent('சூடான செக்ஸ் வீடியோ call');
    assert.equal(badTamilText.safe, false);

    const sellerUnlimUid = `e2e_unlim_${Date.now()}`;
    const badBizProfRes = await fetch(`${baseUrl}/api/ads/business-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerUid: sellerUnlimUid,
        businessName: 'XXX Escort Hub',
        category: 'Services',
      }),
    });
    assert.equal(badBizProfRes.status, 400);

    // 2) Valid business profile + selfie + $100/yr Unlimited Ads activation
    await fetch(`${baseUrl}/api/ads/business-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerUid: sellerUnlimUid,
        businessName: 'Ceylon Exports Hub',
        category: 'Services',
        country: 'Sri Lanka',
        primaryLanguage: 'English',
      }),
    });
    await fetch(`${baseUrl}/api/ads/verify-selfie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerUid: sellerUnlimUid,
        selfieDataUrl: `data:image/jpeg;base64,${sampleImgB64}`,
      }),
    });

    // Reject explicit sexual ad copy even with token
    const badAdRes = await fetch(`${baseUrl}/api/ads/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sellerUid: sellerUnlimUid,
        businessName: 'Ceylon Exports Hub',
        category: 'Services',
        title: 'Nude Cam Girl OnlyFans Promo',
        description: 'Live adult sexting service.',
        mediaType: 'image',
        mediaUrl: `data:image/jpeg;base64,${sampleImgB64}`,
        playBillingPurchaseToken: 'gpb_token_should_fail_safety',
      }),
    });
    assert.equal(badAdRes.status, 400);

    // Activate $100/yr Unlimited Pass
    const unlimActRes = await fetch(`${baseUrl}/api/ads/unlimited/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: sellerUnlimUid,
        playBillingPurchaseToken: 'gpb_100usd_annual_token_abc123',
      }),
    });
    assert.equal(unlimActRes.status, 200);
    const unlimJson = (await unlimActRes.json()) as {
      active: boolean;
      vipFree: boolean;
      pricePaidUsd: number;
      sku: string;
    };
    assert.equal(unlimJson.active, true);
    assert.equal(unlimJson.vipFree, false);
    assert.equal(unlimJson.pricePaidUsd, 100);
    assert.equal(unlimJson.sku, 'pk_ad_unlimited_100usd');

    // Publish without individual token using active Unlimited Pass + All Country targeting
    const unlimPubRes = await fetch(`${baseUrl}/api/ads/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sellerUid: sellerUnlimUid,
        businessName: 'Ceylon Exports Hub',
        category: 'Services',
        title: 'Global Spice Air Freight',
        description: 'Direct air shipping from Colombo to all countries.',
        mediaType: 'image',
        mediaUrl: `data:image/jpeg;base64,${sampleImgB64}`,
        targetCountry: 'All Country',
        targetCountries: ['All Country'],
        targetLanguage: 'English',
      }),
    });
    assert.equal(unlimPubRes.status, 200);
    const unlimPubJson = (await unlimPubRes.json()) as {
      ad: { adId: string; pricePaidUsd: number; targetCountry: string; targetCountries?: string[] };
    };
    assert.equal(unlimPubJson.ad.pricePaidUsd, 0);
    assert.deepEqual(unlimPubJson.ad.targetCountries, ['All Country']);

    // Publish second multi-country ad from 4th VIP phone (0753440226) with $0 & no purchase token
    const vipSellerUid = `e2e_vip_${Date.now()}`;
    await fetch(`${baseUrl}/api/ads/business-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerUid: vipSellerUid,
        businessName: 'Lanka Digital Academy',
        category: 'Education & Coaching',
        country: 'Sri Lanka',
      }),
    });
    await fetch(`${baseUrl}/api/ads/verify-selfie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerUid: vipSellerUid,
        selfieDataUrl: `data:image/jpeg;base64,${sampleImgB64}`,
        phoneNumber: '+94753440226',
      }),
    });
    const vipPubRes = await fetch(`${baseUrl}/api/ads/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sellerUid: vipSellerUid,
        sellerPhone: '0753440226',
        businessName: 'Lanka Digital Academy',
        category: 'Education & Coaching',
        title: '130-Language Spoken Workshop',
        description: 'Live interactive class across South Asia & Europe.',
        mediaType: 'video',
        durationSeconds: 30,
        mediaUrl: `data:image/jpeg;base64,${sampleImgB64}`,
        targetCountry: 'Sri Lanka',
        targetCountries: ['Sri Lanka', 'India', 'United Kingdom'],
        targetLanguage: 'English',
      }),
    });
    assert.equal(vipPubRes.status, 200);
    const vipPubJson = (await vipPubRes.json()) as {
      ad: { adId: string; pricePaidUsd: number; playBillingSku: string; targetCountries?: string[] };
    };
    assert.equal(vipPubJson.ad.pricePaidUsd, 0);
    assert.equal(vipPubJson.ad.playBillingSku, 'pk_vip_free_bypass');
    assert.deepEqual(vipPubJson.ad.targetCountries, ['Sri Lanka', 'India', 'United Kingdom']);

    // Multi-country & All Country query check for Japan viewer
    const japanRes = await fetch(`${baseUrl}/api/ads/public?country=Japan&language=English&page=1&pageSize=20`);
    assert.equal(japanRes.status, 200);
    const japanText = await japanRes.text();
    assert.ok(japanText.includes(unlimPubJson.ad.adId), 'All Country ad must appear in Japan feed');

    // Status-style seller gallery grouping & formatting helpers
    assert.deepEqual(normalizeTargetCountries('Sri Lanka', ['Sri Lanka', 'India']), ['Sri Lanka', 'India']);
    assert.equal(formatTargetCountriesLabel({ targetCountry: 'All Country', targetCountries: ['All Country'] }), 'All Country');
    const sameSeller = getAdsBySameSeller(
      [
        Object.assign({}, unlimPubJson.ad, { sellerUid: sellerUnlimUid }),
        Object.assign({}, vipPubJson.ad, { sellerUid: vipSellerUid }),
      ] as unknown as Parameters<typeof getAdsBySameSeller>[0],
      sellerUnlimUid
    );
    assert.equal(sameSeller.length, 1);
    assert.equal(sameSeller[0].adId, unlimPubJson.ad.adId);

    // StatusUpdatesView & PkChatContext explicitly wire explicit content guards
    const statusViewSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/StatusUpdatesView.tsx'), 'utf8');
    const ctxSrc = fs.readFileSync(path.join(process.cwd(), 'src/context/PkChatContext.tsx'), 'utf8');
    assert.ok(statusViewSrc.includes('detectExplicitSexualContent'));
    assert.ok(statusViewSrc.includes('analyzeImageDataUrlForExplicitContent'));
    assert.ok(ctxSrc.includes('analyzeImageDataUrlForExplicitContent'));
  });

  await runCase('Unified Core Engine & Business Track Controller + /api/system/readiness E2E', async () => {
    assert.equal(PK_CONFIG.brandName, 'PK Chat');
    assert.equal(PK_CONFIG.billing.trialDays, 90);
    assert.equal(PK_CONFIG.billing.annualSubscriptionUSD, 10);
    assert.equal(PK_CONFIG.billing.ads.smallUSD, 5);
    assert.equal(PK_CONFIG.billing.ads.largeUSD, 10);
    assert.equal(PK_CONFIG.billing.ads.unlimitedAnnualUSD, 100);
    assert.deepEqual([...PK_CONFIG.navigationTabs], ['Home', 'Chats', 'Updates', 'Calls']);

    // Phone normalization & VIP/Admin resolution (local 07... vs +947...)
    assert.equal(normalizePhoneNumber('+94 71 786 0693'), '94717860693');
    const adminProfile = resolveAccessProfile('+94717860693');
    assert.equal(adminProfile.isVip, true);
    assert.equal(adminProfile.isAdmin, true);
    assert.equal(adminProfile.hasLifetimeFreeAccess, true);
    assert.equal(adminProfile.trialDays, 0);
    assert.equal(adminProfile.annualFeeUSD, 0);

    for (const vipRaw of ['0760852503', '+94712197111', '0717860693', '+94753440226']) {
      const vipProf = resolveAccessProfile(vipRaw);
      assert.equal(vipProf.isVip, true);
      assert.equal(vipProf.isExemptFromAdFees, true);
      assert.equal(vipProf.isExemptFromStatusLimits, true);
    }

    const stdProf = resolveAccessProfile('+94770001122');
    assert.equal(stdProf.isVip, false);
    assert.equal(stdProf.isAdmin, false);
    assert.equal(stdProf.trialDays, 90);
    assert.equal(stdProf.annualFeeUSD, 10);

    // Business Track Ad Builder & All Countries vs Selected Countries filtering
    const vipGlobalAd = createBusinessAd({
      advertiserPhone: '+94760852503',
      advertiserName: 'Colombo Traders',
      adPackage: 'unlimited_annual',
      selectAllCountries: true,
      headline: 'Global Cargo Dispatch',
      description: 'Nationwide & worldwide shipping.',
    });
    assert.equal(vipGlobalAd.pricing.chargedUSD, 0);
    assert.equal(vipGlobalAd.pricing.waivedByPrivileges, true);
    assert.equal(vipGlobalAd.targeting.targetScope, 'ALL_COUNTRIES');

    const localUkAd = createBusinessAd({
      advertiserPhone: '+447700900111',
      advertiserName: 'London Bakery',
      adPackage: 'small',
      selectAllCountries: false,
      selectedCountries: ['gb'],
      headline: 'Fresh Pastries',
      description: 'Daily warm sourdough in London.',
    });
    assert.equal(localUkAd.pricing.chargedUSD, 5);
    assert.equal(localUkAd.pricing.waivedByPrivileges, false);
    assert.deepEqual(localUkAd.targeting.countries, ['GB']);

    const gbFeed = getAdsForUserCountry([vipGlobalAd, localUkAd], 'GB');
    assert.equal(gbFeed.length, 2);
    const lkFeed = getAdsForUserCountry([vipGlobalAd, localUkAd], 'LK');
    assert.equal(lkFeed.length, 1);
    assert.equal(lkFeed[0].id, vipGlobalAd.id);

    // UI banned-term sanitizer
    const sanitized = sanitizePublicText('Gemini AI Bot Assistant powered by OpenAI and Claude');
    assert.equal(/\b(ai|gemini|robot|bot|assistant|auto-generated|openai|claude)\b/i.test(sanitized), false);

    // Readiness self-check & live HTTP endpoint
    const readiness = runPKChatReadinessCheck([localUkAd]);
    assert.equal(readiness.readyForPlayStorePreparation, true);
    assert.equal(readiness.issues.length, 0);

    const httpReadiness = await fetch(`${baseUrl}/api/system/readiness`);
    assert.equal(httpReadiness.status, 200);
    const httpJson = (await httpReadiness.json()) as {
      readyForPlayStorePreparation: boolean;
      configSummary: { trialDays: number; annualFeeUSD: number };
    };
    assert.equal(httpJson.readyForPlayStorePreparation, true);
    assert.equal(httpJson.configSummary.trialDays, 90);
    assert.equal(httpJson.configSummary.annualFeeUSD, 10);
  });

  await runCase('PK_APP_EXPERIENCE, PKSoundEngine (pkSound) & Safe Firebase Login Controller', async () => {
    // 1. Default experience config checks
    assert.equal(PK_APP_EXPERIENCE.appName, 'PK Chat');
    assert.equal(PK_APP_EXPERIENCE.defaultLanguage, 'en');
    assert.deepEqual([...PK_APP_EXPERIENCE.optionalLanguages], ['en', 'ta', 'tanglish']);
    assert.equal(PK_APP_EXPERIENCE.audio.ringtoneVolume, 1.0);
    assert.equal(PK_APP_EXPERIENCE.audio.notificationVolume, 0.85);
    assert.equal(PK_APP_EXPERIENCE.audio.ringtoneToneId, 'pk_signature_ring_v2');
    assert.equal(PK_APP_EXPERIENCE.audio.notificationToneId, 'pk_signature_notify_v2');

    // 2. Headless PKSoundEngine behavior (never throws without AudioContext)
    const headlessSound = new PKSoundEngine();
    assert.equal(headlessSound.playNotificationTone(), false);
    assert.equal(headlessSound.startRingtone(), true);
    assert.equal(headlessSound.isRinging, true);
    assert.equal(headlessSound.startRingtone(), true); // idempotent guard
    headlessSound.stopRingtone();
    assert.equal(headlessSound.isRinging, false);
    assert.equal(headlessSound.ringTimer, null);

    // 3. Mocked Web Audio API context tests for crisp melody & notification synthesis
    const scheduledOscs: Array<{ type: string; freq: number; startedAt: number; stoppedAt: number }> = [];
    let resumeCalled = 0;
    class MockAudioContext {
      currentTime = 1.5;
      state: AudioContextState = 'suspended';
      destination = {} as AudioDestinationNode;
      resume() {
        resumeCalled += 1;
        this.state = 'running';
        return Promise.resolve();
      }
      createOscillator() {
        const record = { type: 'sine', freq: 0, startedAt: 0, stoppedAt: 0 };
        scheduledOscs.push(record);
        return {
          get type() {
            return record.type;
          },
          set type(val: string) {
            record.type = val;
          },
          frequency: {
            setValueAtTime: (val: number) => {
              record.freq = val;
            },
          },
          connect: () => {},
          start: (when: number) => {
            record.startedAt = when;
          },
          stop: (when: number) => {
            record.stoppedAt = when;
          },
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {},
          },
          connect: () => {},
        };
      }
    }

    const winObj = globalThis.window as unknown as Record<string, unknown>;
    const prevAudioCtx = winObj.AudioContext;
    winObj.AudioContext = MockAudioContext;
    try {
      const mockedSound = new PKSoundEngine();
      const notified = mockedSound.playNotificationTone();
      assert.equal(notified, true);
      assert.equal(resumeCalled >= 1, true);
      assert.equal(scheduledOscs.length, 2);
      assert.equal(scheduledOscs[0].freq, 587.33);
      assert.equal(scheduledOscs[0].type, 'triangle');
      assert.equal(scheduledOscs[1].freq, 880.0);
      assert.equal(scheduledOscs[1].type, 'sine');

      scheduledOscs.length = 0;
      const ringingStarted = mockedSound.startRingtone();
      assert.equal(ringingStarted, true);
      assert.equal(mockedSound.isRinging, true);
      assert.ok(mockedSound.ringTimer !== null);
      assert.equal(scheduledOscs.length, 5);
      assert.deepEqual(
        scheduledOscs.map((o) => o.freq),
        [523.25, 659.25, 783.99, 659.25, 987.77]
      );
      mockedSound.stopRingtone();
      assert.equal(mockedSound.isRinging, false);
      assert.equal(mockedSound.ringTimer, null);

      // Verify stopRingingLoop stops shared pkSound too
      pkSound.startRingtone();
      assert.equal(pkSound.isRinging, true);
      stopRingingLoop();
      assert.equal(pkSound.isRinging, false);
    } finally {
      if (prevAudioCtx === undefined) {
        delete winObj.AudioContext;
      } else {
        winObj.AudioContext = prevAudioCtx;
      }
      pkSound.stopRingtone();
    }

    // 4. Safe Firebase login controller tests
    const notReadyRes = await loginWithFirebasePhoneOrEmail({
      authInstance: null,
      signInFn: async () => ({ uid: 'u1' }),
      credential: {},
    });
    assert.equal(notReadyRes.ok, false);
    if (!notReadyRes.ok) {
      assert.equal(notReadyRes.code, 'FIREBASE_NOT_READY');
    }

    const badFnRes = await loginWithFirebasePhoneOrEmail({
      authInstance: { app: 'mock' },
      signInFn: null,
      credential: {},
    });
    assert.equal(badFnRes.ok, false);
    if (!badFnRes.ok) {
      assert.equal(badFnRes.code, 'FIREBASE_NOT_READY');
    }

    const successRes = await loginWithFirebasePhoneOrEmail({
      authInstance: { app: 'mock' },
      signInFn: async (_auth, cred: { email: string }) => ({ uid: 'uid_ok', email: cred.email }),
      credential: { email: 'user@example.com' },
    });
    assert.equal(successRes.ok, true);
    if (successRes.ok) {
      assert.equal(successRes.language, 'en');
      assert.deepEqual(successRes.user, { uid: 'uid_ok', email: 'user@example.com' });
    }

    const errRes = await loginWithFirebasePhoneOrEmail({
      authInstance: { app: 'mock' },
      signInFn: async () => {
        const error = new Error('Popup closed by user') as Error & { code?: string };
        error.code = 'auth/popup-closed-by-user';
        throw error;
      },
      credential: {},
    });
    assert.equal(errRes.ok, false);
    if (!errRes.ok) {
      assert.equal(errRes.code, 'auth/popup-closed-by-user');
      assert.equal(errRes.message, 'Popup closed by user');
    }

    // Verify re-exports in audioTones.ts, firebase.ts, and integration in PkChatContext.tsx / OnboardingFlow.tsx
    const audioTonesSrc = fs.readFileSync(path.join(process.cwd(), 'src/lib/audioTones.ts'), 'utf8');
    const firebaseSrc = fs.readFileSync(path.join(process.cwd(), 'src/lib/firebase.ts'), 'utf8');
    const pkCtxSrc = fs.readFileSync(path.join(process.cwd(), 'src/context/PkChatContext.tsx'), 'utf8');
    const onboardingSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/OnboardingFlow.tsx'), 'utf8');
    assert.ok(audioTonesSrc.includes('pk_signature_ring_v2'));
    assert.ok(audioTonesSrc.includes('pk_signature_notify_v2'));
    assert.ok(audioTonesSrc.includes('pkSound.stopRingtone()'));
    assert.ok(firebaseSrc.includes('loginWithFirebasePhoneOrEmail'));
    assert.ok(pkCtxSrc.includes('loginWithFirebasePhoneOrEmail'));
    assert.ok(pkCtxSrc.includes('PK_APP_EXPERIENCE.defaultLanguage'));
    assert.ok(onboardingSrc.includes('PK_APP_EXPERIENCE.defaultLanguage'));
  });

  await runCase('PKChatMirrorApp, PKChatSoundEngine, Global Festival Greetings & Hierarchical Gov Alerts', async () => {
    // 1. Resolve Festival Greetings (New Year 1-day prior Dec 31 & Jan 1, Lover's Day, Women's Day, Mother's Day 2nd Sun May, Christmas)
    const dec31 = resolveFestivalGreetings(new Date('2026-12-31T10:00:00'));
    assert.equal(dec31.some((f) => f.id === 'new-year' && f.startsOneDayPrior), true);

    const jan1 = resolveFestivalGreetings(new Date('2026-01-01T10:00:00'));
    assert.equal(jan1.some((f) => f.id === 'new-year'), true);

    const feb14 = resolveFestivalGreetings(new Date('2026-02-14T10:00:00'));
    assert.equal(feb14.some((f) => f.id === 'lovers-day' && f.occasion === "Lover's Day"), true);

    const mar8 = resolveFestivalGreetings(new Date('2026-03-08T10:00:00'));
    assert.equal(mar8.some((f) => f.id === 'womens-day'), true);

    // Second Sunday of May 2026 is May 10, 2026
    const mothersDay = resolveFestivalGreetings(new Date('2026-05-10T10:00:00'));
    assert.equal(mothersDay.some((f) => f.id === 'mothers-day'), true);

    const dec25 = resolveFestivalGreetings(new Date('2026-12-25T10:00:00'));
    assert.equal(dec25.some((f) => f.id === 'christmas'), true);

    // Also verify officialInboxEngine surfaces Lover's Day with canonical founder signature
    const febInbox = buildOfficialInboxGreetings({
      fullName: 'User',
      now: new Date('2026-02-14T10:00:00'),
    });
    const loversOfficial = febInbox.find((g) => g.id.startsWith('greeting_lovers-day_'));
    assert.ok(loversOfficial && loversOfficial.activeToday);
    assert.equal(loversOfficial.founderName, 'Prashanth keransiya');

    // 2. Strictly Verified Government Disaster Alerts (Country -> Province/State -> District/City -> Village)
    const alertsPool = [
      {
        id: 'al-colombo',
        title: 'Official Flood Advisory',
        country: 'Sri Lanka',
        provinceOrState: 'Western Province',
        districtOrCity: 'Colombo',
        villageOrArea: 'all',
        governmentSource: 'Disaster Management Centre',
        isOfficialVerified: true,
        timestamp: 'Just now',
      },
      {
        id: 'al-unverified',
        title: 'Unverified Social Rumor',
        country: 'Sri Lanka',
        provinceOrState: 'Western Province',
        districtOrCity: 'Colombo',
        villageOrArea: 'all',
        governmentSource: 'Official',
        isOfficialVerified: false,
        timestamp: 'Just now',
      },
      {
        id: 'al-no-source',
        title: 'Missing Gov Source',
        country: 'Sri Lanka',
        provinceOrState: 'Western Province',
        districtOrCity: 'Colombo',
        villageOrArea: 'all',
        governmentSource: '   ',
        isOfficialVerified: true,
        timestamp: 'Just now',
      },
      {
        id: 'al-jaffna',
        title: 'Coastal Wind Advisory',
        country: 'Sri Lanka',
        provinceOrState: 'Northern Province',
        districtOrCity: 'Jaffna',
        villageOrArea: 'Jaffna Town',
        governmentSource: 'Department of Meteorology',
        isOfficialVerified: true,
        timestamp: 'Just now',
      },
    ];

    const colomboMatched = getVerifiedLocationAlerts(alertsPool, {
      country: 'Sri Lanka',
      provinceOrState: 'Western Province',
      districtOrCity: 'Colombo',
      villageOrArea: 'Colombo Central',
    });
    assert.equal(colomboMatched.length, 1);
    assert.equal(colomboMatched[0].id, 'al-colombo');

    const jaffnaMatched = getVerifiedLocationAlerts(alertsPool, {
      country: 'sri lanka',
      provinceOrState: 'northern province',
      districtOrCity: 'jaffna',
      villageOrArea: 'jaffna town',
    });
    assert.equal(jaffnaMatched.length, 1);
    assert.equal(jaffnaMatched[0].id, 'al-jaffna');

    // 3. PKChatSoundEngine ringtone loop & notification chime + stopRingingLoop interoperability
    const scheduledNotes: Array<{ type: string; freq: number }> = [];
    class MirrorMockAudioCtx {
      currentTime = 0;
      state: AudioContextState = 'running';
      destination = {} as AudioDestinationNode;
      resume() {
        return Promise.resolve();
      }
      createOscillator() {
        const rec = { type: 'sine', freq: 0 };
        scheduledNotes.push(rec);
        return {
          get type() {
            return rec.type;
          },
          set type(v: string) {
            rec.type = v;
          },
          frequency: {
            setValueAtTime: (f: number) => {
              rec.freq = f;
            },
          },
          connect: () => {},
          start: () => {},
          stop: () => {},
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {},
          },
          connect: () => {},
        };
      }
    }
    const winObj = globalThis.window as unknown as Record<string, unknown>;
    const prevAudioCtx = winObj.AudioContext;
    winObj.AudioContext = MirrorMockAudioCtx;
    try {
      const mirrorSound = new PKChatSoundEngine();
      assert.equal(mirrorSound.playNotificationTone(), true);
      // 2 notes x 2 oscillators (main + harmonic) = 4
      assert.equal(scheduledNotes.length, 4);
      scheduledNotes.length = 0;

      mirrorSound.startIncomingRingtone();
      assert.equal(mirrorSound.isRinging, true);
      // 5 cadence notes x 2 oscillators = 10
      assert.equal(scheduledNotes.length, 10);
      mirrorSound.stopIncomingRingtone();
      assert.equal(mirrorSound.isRinging, false);

      pkChatMirrorSound.startIncomingRingtone();
      assert.equal(pkChatMirrorSound.isRinging, true);
      stopRingingLoop();
      assert.equal(pkChatMirrorSound.isRinging, false);
    } finally {
      if (prevAudioCtx === undefined) {
        delete winObj.AudioContext;
      } else {
        winObj.AudioContext = prevAudioCtx;
      }
      pkChatMirrorSound.stopIncomingRingtone();
    }

    // 4. Verify App.tsx, ScreenNavigator.tsx, and PKChatMirrorApp.tsx integration
    const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
    const navSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ScreenNavigator.tsx'), 'utf8');
    const mirrorSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/PKChatMirrorApp.tsx'), 'utf8');
    assert.ok(appSrc.includes('PKChatMirrorApp'));
    assert.ok(appSrc.includes("case 'mirror_preview'"));
    assert.ok(navSrc.includes('mirror_preview'));
    assert.ok(mirrorSrc.includes('Security Secured'));
    assert.ok(mirrorSrc.includes('PK Chat'));
  });

  await runCase('PKChatSignatureAudioEngine: Pure Instrumental 2-Phrase Marimba Ringtone & Chime', async () => {
    const engine = new PKChatSignatureAudioEngine();
    assert.deepEqual(engine.getConfig(), {
      loopIntervalMs: 2100,
      masterGain: 0.24,
    });

    // Headless safety when AudioContext is absent
    engine.playRingtonePhraseOnce();
    engine.playNotificationTone();
    engine.startIncomingRingtone();
    assert.equal(engine.isRinging, true);
    engine.stopIncomingRingtone();
    assert.equal(engine.isRinging, false);

    // Mocked Web Audio API verification
    const oscLogs: Array<{ type: string; freq: number }> = [];
    let closedCount = 0;
    class SignatureMockAudioCtx {
      currentTime = 0.5;
      state: AudioContextState = 'suspended';
      destination = {} as AudioDestinationNode;
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        closedCount += 1;
        return Promise.resolve();
      }
      createOscillator() {
        const rec = { type: 'sine', freq: 0 };
        oscLogs.push(rec);
        return {
          get type() {
            return rec.type;
          },
          set type(v: string) {
            rec.type = v;
          },
          frequency: {
            setValueAtTime: (f: number) => {
              rec.freq = f;
            },
          },
          connect: () => {},
          start: () => {},
          stop: () => {},
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {},
          },
          connect: () => {},
        };
      }
    }

    const winObj = globalThis.window as unknown as Record<string, unknown>;
    const prevAudioCtx = winObj.AudioContext;
    winObj.AudioContext = SignatureMockAudioCtx;
    try {
      const mocked = new PKChatSignatureAudioEngine();
      // 1. Ringtone phrase: G5(783.99), C6(1046.5), A5(880.0), D6(1174.66) x 2 osc each = 8 oscillators
      mocked.playRingtonePhraseOnce();
      assert.equal(oscLogs.length, 8);
      assert.deepEqual(
        oscLogs.filter((o) => o.type === 'sine').map((o) => o.freq),
        [783.99, 1046.5, 880.0, 1174.66]
      );
      assert.deepEqual(
        oscLogs.filter((o) => o.type === 'triangle').map((o) => o.freq),
        [783.99 * 2, 1046.5 * 2, 880.0 * 2, 1174.66 * 2]
      );

      // 2. Notification chime: G5(783.99), C6(1046.5) x 2 osc each = 4 oscillators
      oscLogs.length = 0;
      mocked.playNotificationTone();
      assert.equal(oscLogs.length, 4);
      assert.deepEqual(
        oscLogs.filter((o) => o.type === 'sine').map((o) => o.freq),
        [783.99, 1046.5]
      );

      // 3. Shared stopRingingLoop() integration & dispose()
      pkSignatureAudio.startIncomingRingtone();
      assert.equal(pkSignatureAudio.isRinging, true);
      stopRingingLoop();
      assert.equal(pkSignatureAudio.isRinging, false);

      mocked.dispose();
      assert.equal(closedCount, 1);
      assert.equal(mocked.isRinging, false);
    } finally {
      if (prevAudioCtx === undefined) {
        delete winObj.AudioContext;
      } else {
        winObj.AudioContext = prevAudioCtx;
      }
      pkSignatureAudio.dispose();
    }

    // Verify SettingsAndBillingView wires preview controls cleanly
    const settingsSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/SettingsAndBillingView.tsx'),
      'utf8'
    );
    assert.ok(settingsSrc.includes('pkSignatureAudio.startIncomingRingtone()'));
    assert.ok(settingsSrc.includes('pkSignatureAudio.playNotificationTone()'));
  });

  await runCase('WhatsAppStatusSection & StatusUpdatesView: 24h Grouping, Auto-View Recording, Private Reply & Slide-Up Viewed-By Bottom Sheet', () => {
    const waStatusPath = path.join(process.cwd(), 'src/components/WhatsAppStatusSection.tsx');
    const statusViewPath = path.join(process.cwd(), 'src/components/StatusUpdatesView.tsx');
    assert.equal(fs.existsSync(waStatusPath), true);

    const waSrc = fs.readFileSync(waStatusPath, 'utf8');
    const statusViewSrc = fs.readFileSync(statusViewPath, 'utf8');

    // Verify named + default export and real-time context wiring
    assert.ok(waSrc.includes('export function WhatsAppStatusSection'));
    assert.ok(waSrc.includes('export default WhatsAppStatusSection'));
    assert.ok(waSrc.includes('markStatusViewed'));
    assert.ok(waSrc.includes('replyToStatus'));
    assert.ok(waSrc.includes('reactToStatus'));

    // Verify Light-Blue Frosted Glass & small circular avatars + slide-up Viewed by sheet
    for (const src of [waSrc, statusViewSrc]) {
      assert.ok(src.includes('#e3f3ff'));
      assert.ok(src.includes('#7dd3fc'));
      assert.ok(src.includes('#0284c7'));
      assert.ok(src.includes('fixed inset-x-0 bottom-0'));
      assert.ok(src.includes('Viewed by'));
      assert.ok(src.includes('<UserAvatar'));
      assert.equal(src.includes('/default-avatar.png'), false);
      assert.equal(src.includes('& Wife'), false);
    }

    assert.ok(waSrc.includes('w-12 h-12'));
    assert.ok(waSrc.includes('No views yet'));
    assert.ok(statusViewSrc.includes('No views yet'));

    // Functional check: 24-hour window, viewer count & unseen vs viewed grouping
    const nowMs = Date.now();
    const activeMyStatus = {
      statusId: 'st_mine_1',
      userId: 'uid_owner',
      authorName: 'Prashanth keransiya',
      mediaType: 'image' as const,
      mediaUrl: 'https://example.com/photo.jpg',
      privacyMode: 'contacts' as const,
      authorizedViewerIds: ['uid_owner', 'uid_peer_1'],
      excludedViewerIds: [],
      allowedViewerIds: [],
      viewedByUids: ['uid_peer_1'],
      viewers: [
        {
          viewerId: 'uid_peer_1',
          viewerName: 'Kavitha',
          viewerAvatar: '',
          viewedAt: new Date(nowMs - 5 * 60_000).toISOString(),
        },
      ],
      reactions: [{ userId: 'uid_peer_1', userName: 'Kavitha', emoji: '❤️', reactedAt: new Date(nowMs).toISOString() }],
      createdAt: nowMs - 60 * 60_000,
      expiresAt: nowMs + STATUS_TTL_MS - 60 * 60_000,
    };
    const expiredStatus = {
      ...activeMyStatus,
      statusId: 'st_expired',
      expiresAt: nowMs - 1000,
    };
    const peerUnseen = {
      ...activeMyStatus,
      statusId: 'st_peer_unseen',
      userId: 'uid_peer_1',
      authorName: 'Kavitha',
      viewedByUids: [],
      viewers: [],
      reactions: [],
    };

    const grouped = groupStatusesByAuthor([activeMyStatus, expiredStatus, peerUnseen], 'uid_owner', nowMs);
    assert.equal(grouped.myStatuses.length, 1);
    assert.equal(grouped.myStatuses[0].viewers.length, 1);
    assert.equal(grouped.myStatuses[0].viewers[0].viewerName, 'Kavitha');
    assert.equal(grouped.recentGroups.length, 1);
    assert.equal(grouped.recentGroups[0].unseenCount, 1);
    assert.equal(grouped.viewedGroups.length, 0);
  });

  await runCase('PkLiveClassRoom & /classes Firestore Security Rules: Waiting Room, Host Admit, Atomic Mute All, Screen Share & In-Class Chat', () => {
    const classRoomPath = path.join(process.cwd(), 'src/components/PkLiveClassRoom.tsx');
    const whiteboardPath = path.join(process.cwd(), 'src/components/ClassWhiteboardView.tsx');
    const rulesPath = path.join(process.cwd(), 'firestore.rules');
    const blueprintPath = path.join(process.cwd(), 'firebase-blueprint.json');

    assert.equal(fs.existsSync(classRoomPath), true);
    const roomSrc = fs.readFileSync(classRoomPath, 'utf8');
    const boardSrc = fs.readFileSync(whiteboardPath, 'utf8');
    const rulesSrc = fs.readFileSync(rulesPath, 'utf8');
    const blueprintSrc = fs.readFileSync(blueprintPath, 'utf8');

    // Exports & PK Chat integration
    assert.ok(roomSrc.includes('export function PkLiveClassRoom'));
    assert.ok(roomSrc.includes('export const ZoomClassRoom = PkLiveClassRoom'));
    assert.ok(roomSrc.includes('export default PkLiveClassRoom'));
    assert.ok(roomSrc.includes('handleFirestoreError'));
    assert.ok(roomSrc.includes('writeBatch'));
    assert.ok(roomSrc.includes('getDisplayMedia'));
    assert.ok(roomSrc.includes('stopAllMediaTracks'));
    assert.ok(roomSrc.includes('<UserAvatar'));
    assert.equal(roomSrc.includes('/default-avatar.png'), false);
    assert.equal(/Zoom Class|Zoom DND|Zoom Settings|Zoom Side Panel/.test(roomSrc), false);
    assert.equal(roomSrc.includes('& Wife'), false);

    // Light-blue frosted glass accents & ClassWhiteboardView launcher
    assert.ok(roomSrc.includes('#e3f3ff'));
    assert.ok(roomSrc.includes('#7dd3fc'));
    assert.ok(roomSrc.includes('#0284c7'));
    assert.ok(boardSrc.includes('PkLiveClassRoom'));
    assert.ok(boardSrc.includes('Live Video Room'));

    // Firestore Rules & Blueprint verification for /classes/{roomId}
    assert.ok(rulesSrc.includes('function isClassHost(roomId)'));
    assert.ok(rulesSrc.includes('function isClassParticipant(roomId)'));
    assert.ok(rulesSrc.includes('function isValidClassSession(data)'));
    assert.ok(rulesSrc.includes('function isValidClassParticipant(data)'));
    assert.ok(rulesSrc.includes('function isValidClassWaitingEntry(data)'));
    assert.ok(rulesSrc.includes('function isValidClassChatMessage(data)'));
    assert.ok(rulesSrc.includes('match /classes/{roomId}'));
    assert.ok(rulesSrc.includes('match /participants/{participantUid}'));
    assert.ok(rulesSrc.includes('match /waitingRoom/{studentUid}'));
    assert.ok(rulesSrc.includes('match /messages/{messageId}'));

    assert.ok(blueprintSrc.includes('"ClassSession"'));
    assert.ok(blueprintSrc.includes('"ClassParticipant"'));
    assert.ok(blueprintSrc.includes('"ClassWaitingEntry"'));
    assert.ok(blueprintSrc.includes('"ClassChatMessage"'));
    assert.ok(blueprintSrc.includes('"/classes/{roomId}"'));
  });

  await runCase('MessengerDisasterAlerts: Tamil/English PK Family Care Alert Messaging, Country/Major Filtering & UI Integration', () => {
    assert.ok(TAMIL_AREAS.includes('jaffna'));
    assert.ok(TAMIL_AREAS.includes('tamil nadu'));
    assert.ok(TAMIL_AREAS.includes('nuwara eliya'));

    const jaffnaCare = getPKFamilyCareMessage({ city: 'Jaffna', region: 'Northern Province', country: 'Sri Lanka' });
    assert.equal(jaffnaCare.language, 'ta');
    assert.ok(jaffnaCare.headline.includes('PK Chat தரப்பு'));
    assert.ok(jaffnaCare.subtext.includes('SOS'));

    const tamilNaduCare = getPKFamilyCareMessage({ city: 'Madurai', region: 'Tamil Nadu', country: 'India' });
    assert.equal(tamilNaduCare.language, 'ta');

    const globalCare = getPKFamilyCareMessage({ city: 'London', region: 'Greater London', country: 'United Kingdom' });
    assert.equal(globalCare.language, 'en');
    assert.ok(globalCare.headline.includes('From PK Chat and on behalf of your family'));
    assert.ok(globalCare.subtext.includes('SOS'));

    const sampleAlerts = [
      {
        id: 'lk_1',
        title: 'Heavy Flood Advisory',
        description: 'Move to higher ground',
        country: 'Sri Lanka',
        region: 'Jaffna District',
        source: 'DMC Official',
        issuedAt: 1700000001000,
        severity: 'advisory',
      },
      {
        id: 'jp_major',
        title: 'Major Tsunami Warning',
        description: 'Evacuate coastal areas',
        country: 'Japan',
        region: 'Honshu Coast',
        source: 'JMA Official',
        issuedAt: 1700000002000,
        isMajor: true,
        severity: 'extreme',
      },
      {
        id: 'fr_minor',
        title: 'Local Wind Advisory',
        description: 'Light gust advisory',
        country: 'France',
        region: 'Lyon',
        source: 'Meteo',
        issuedAt: 1700000003000,
        isMajor: false,
        severity: 'advisory',
      },
    ];

    const filtered = filterRelevantMessengerAlerts(sampleAlerts, 'Sri Lanka');
    assert.equal(filtered.length, 2);
    assert.deepEqual(filtered.map((a) => a.id), ['jp_major', 'lk_1']);

    const compSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/MessengerDisasterAlerts.tsx'), 'utf8');
    const chatSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ChatWorkspace.tsx'), 'utf8');
    const safetySrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SafetyAndDisasterView.tsx'), 'utf8');

    assert.ok(compSrc.includes('export function MessengerDisasterAlerts'));
    assert.ok(compSrc.includes('export default MessengerDisasterAlerts'));
    assert.ok(compSrc.includes('verifiedOfficial'));
    assert.equal(compSrc.includes('& Wife'), false);
    assert.ok(chatSrc.includes('<MessengerDisasterAlerts'));
    assert.ok(safetySrc.includes('<MessengerDisasterAlerts'));
  });

  await runCase('PWA GitHub Pages & PWABuilder: public/manifest.json, relative icon-512.png/icon-192.png, index.html & vite.config.ts base /PK-chat/', () => {
    const manifestPath = path.join(process.cwd(), 'public/manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'public/manifest.json must exist');
    assert.equal(fs.existsSync(path.join(process.cwd(), 'manifest.json')), false, 'No duplicate root manifest.json');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      name: string;
      short_name: string;
      start_url: string;
      scope: string;
      display: string;
      theme_color: string;
      background_color: string;
      icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
    };

    assert.equal(manifest.name, 'PK Chat');
    assert.equal(manifest.short_name, 'PKchat');
    assert.equal(manifest.start_url, '/PK-chat/');
    assert.equal(manifest.scope, '/PK-chat/');
    assert.equal(manifest.display, 'standalone');
    assert.deepEqual(
      (manifest as Record<string, unknown>).display_override,
      ['standalone', 'fullscreen', 'minimal-ui']
    );
    assert.deepEqual(
      (manifest as Record<string, unknown>).launch_handler,
      { client_mode: 'focus-existing' }
    );
    assert.equal((manifest as Record<string, unknown>).prefer_related_applications, false);
    assert.equal(manifest.theme_color, '#0A192F');
    assert.equal(manifest.background_color, '#0A192F');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3);

    for (const icon of manifest.icons) {
      assert.equal(icon.src.startsWith('/'), false, `Icon src must not have leading slash: ${icon.src}`);
      const iconFile = path.join(process.cwd(), 'public', icon.src);
      assert.ok(fs.existsSync(iconFile), `Icon file must exist in public/: ${icon.src}`);
      const header = fs.readFileSync(iconFile).subarray(0, 8);
      assert.deepEqual([...header], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${icon.src} must be valid PNG`);
    }

    assert.ok(manifest.icons.some((i) => i.src === 'icon-512.png' && i.sizes === '512x512' && i.purpose === 'any'));
    assert.ok(manifest.icons.some((i) => i.src === 'pwa-maskable-512x512.png' && i.sizes === '512x512' && i.purpose === 'maskable'));
    assert.ok(manifest.icons.some((i) => i.src === 'icon-192.png' && i.sizes === '192x192' && i.purpose === 'any'));
    assert.ok(manifest.icons.some((i) => i.src === 'pwa-maskable-192x192.png' && i.sizes === '192x192' && i.purpose === 'maskable'));
    for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      for (const name of ['ic_launcher.png', 'ic_launcher_foreground.png', 'ic_launcher_round.png']) {
        assert.ok(fs.existsSync(path.join(process.cwd(), 'android/res', `mipmap-${density}`, name)));
      }
    }

    const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    assert.ok(indexHtml.includes('<link rel="manifest" href="./manifest.json" />'));
    assert.equal(indexHtml.includes('href="/manifest.json"'), false);
    assert.ok(indexHtml.includes('<meta name="theme-color" content="#0A192F" />'));
    assert.ok(indexHtml.includes('href="./favicon-32x32.png"'));
    assert.ok(indexHtml.includes('href="./icon-192.png"'));
    assert.ok(indexHtml.includes('href="./icon-512.png"'));
    assert.ok(indexHtml.includes('href="./apple-touch-icon.png"'));
    assert.equal(indexHtml.includes('href="/favicon-32x32.png"'), false);
    assert.equal(indexHtml.includes('href="/apple-touch-icon.png"'), false);

    const viteConfig = fs.readFileSync(path.join(process.cwd(), 'vite.config.ts'), 'utf8');
    assert.ok(viteConfig.includes("base: '/PK-chat/'"));
    assert.ok(viteConfig.includes('manifest: false'));
    assert.ok(viteConfig.includes("includeAssets: ['manifest.json']"));
    assert.ok(viteConfig.includes('pkchat-github-pages-404'));
    assert.ok(viteConfig.includes("path.join(distDir, '404.html')"));

    const mainSrc = fs.readFileSync(path.join(process.cwd(), 'src/main.tsx'), 'utf8');
    assert.ok(mainSrc.includes('appUpdater.ensureServiceWorkerRegistered()'));

    const constantsSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/constants.ts'), 'utf8');
    assert.equal(constantsSrc.includes("'/assets/aistudio/"), false, 'BRAND_LOGO_URL must not hardcode a root leading slash');
    assert.ok(fs.existsSync(path.join(process.cwd(), 'public/.nojekyll')));
  });

  await runCase('Firebase Google Sign-In (pkchat-41ef3): popup->redirect fallback, browserLocalPersistence, getRedirectResult & exact error.code/message', () => {
    const fbCfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8')) as {
      projectId: string;
      authDomain: string;
    };
    assert.equal(fbCfg.projectId, 'pkchat-41ef3');
    assert.equal(fbCfg.authDomain, 'pkchat-41ef3.firebaseapp.com');

    assert.equal(shouldFallbackToRedirect({ code: 'auth/popup-blocked' }), true);
    assert.equal(shouldFallbackToRedirect({ code: 'auth/popup-closed-by-user' }), true);
    assert.equal(shouldFallbackToRedirect({ code: 'auth/cancelled-popup-request' }), true);
    assert.equal(shouldFallbackToRedirect({ code: 'auth/operation-not-supported-in-this-environment' }), true);
    assert.equal(shouldFallbackToRedirect({ code: 'auth/web-storage-unsupported' }), true);
    assert.equal(shouldFallbackToRedirect({ code: 'auth/unauthorized-domain', message: 'Domain not authorized' }), false);

    const unauthMsg = mapOAuthSignInError(
      { code: 'auth/unauthorized-domain', message: 'Firebase: Error (auth/unauthorized-domain).' },
      'Google'
    );
    assert.ok(unauthMsg.includes('[auth/unauthorized-domain]'));
    assert.ok(unauthMsg.includes('pkchat-41ef3'));
    assert.ok(unauthMsg.includes('Firebase: Error (auth/unauthorized-domain).'));

    const fbSrc = fs.readFileSync(path.join(process.cwd(), 'src/lib/firebase.ts'), 'utf8');
    const ctxSrc = fs.readFileSync(path.join(process.cwd(), 'src/context/PkChatContext.tsx'), 'utf8');
    const onboardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/OnboardingFlow.tsx'), 'utf8');
    assert.ok(fbSrc.includes('getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)'));
    assert.ok(fbSrc.includes('GoogleAuthProvider'));
    assert.ok(fbSrc.includes('browserLocalPersistence'));
    assert.ok(fbSrc.includes('authPersistenceReady'));
    assert.ok(ctxSrc.includes('shouldFallbackToRedirect'));
    assert.ok(ctxSrc.includes('signInWithRedirect(auth, provider)'));
    assert.ok(ctxSrc.includes('getRedirectResult(auth)'));
    assert.ok(onboardSrc.includes('Google Sign-In Error'));

    // Ensure zero stale pk-chhat project references remain in active web/server runtime files
    const runtimeFilesToVerify = [
      'src/lib/firebase.ts',
      'src/lib/phoneAuth.ts',
      'src/lib/statusMedia.ts',
      'src/data/constants.ts',
      'server.ts',
    ];
    for (const relPath of runtimeFilesToVerify) {
      const content = fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
      assert.equal(content.includes('pk-chhat'), false, `Stale pk-chhat reference found in ${relPath}`);
    }

    // Verify Firestore rules allow verified Google/Gmail users, safe non-existent gets (user_devices & chats), and VIP/trial subscription updates
    const rulesSrc = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');
    assert.ok(rulesSrc.includes("request.auth.token.email_verified == true"));
    assert.ok(rulesSrc.includes("'google.com'"));
    assert.ok(rulesSrc.includes('allow get: if isSignedIn() && isValidId(deviceId) && (resource == null || existing().userId == request.auth.uid || isAdmin());'));
    assert.ok(rulesSrc.includes('allow get: if isSignedIn() && isValidId(chatId) && (resource == null || request.auth.uid in existing().participantIds || isAdmin());'));
    assert.ok(rulesSrc.includes("'monthlyPriceUsd', 'autoRenew', 'trialStartAt', 'trialEndAt', 'currentPeriodEnd', 'updatedAt'"));

    // Verify Start button, mode selection & WhatsApp-style native launch flow never trap users
    const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
    assert.ok(onboardSrc.includes('General Use Mode'));
    assert.ok(onboardSrc.includes('Business / Advertiser Mode'));
    assert.ok(onboardSrc.includes('allowLocalFallback: true'));
    assert.ok(onboardSrc.includes('Continue into PK Chat Now'));
    assert.ok(onboardSrc.includes('Sign in with Gmail'));
    assert.ok(ctxSrc.includes('if (params.allowLocalFallback !== false)'));
    assert.ok(appSrc.includes('Enter PK CHAT Now'));
    assert.ok(appSrc.includes('data-native-launch-screen="true"'));
  });

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`\nSummary: ${passedCount} passed, ${failedCount} failed (total ${results.length})\n`);
  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test harness error:', err);
  process.exit(1);
});
