import {
  CHAT_ANIMATION_META,
  FESTIVAL_3D_CARDS,
  detectChatKeywordAnimation,
} from '../data/festivals';
import {
  PK_CHAT_ANDROID_PACKAGE,
  PK_CHAT_CLIENT_VERSION,
  PK_CHAT_PLAY_STORE_URL,
} from './appVersion';
import {
  LEGACY_COUNTRY_EMERGENCY_LOCAL_KEYS,
  autoDeleteCountryEmergencyData,
} from './countryEmergencyCleanup';
import {
  buildEmergencySmsMessage,
  buildSmsLaunchUri,
} from './offlineSmsSos';
import {
  SecurityShieldSystem,
  inspectAttachmentForMalware,
  sanitizeChatPayload,
} from './securityShield';
import { SentenceTranslationBuffer } from './translationEngine';
import { runPKChatReadinessCheck } from './pkCoreController';

export interface PKChatDiagnosticCheckResult {
  id: 'anti_theft' | 'self_updater' | 'calling_engine' | 'festival_3d' | 'cascade_sos' | 'core_readiness';
  passed: boolean;
  summary: string;
}

export interface PKChatDiagnosticsReport {
  allPassed: boolean;
  checks: PKChatDiagnosticCheckResult[];
  timestamp: string;
}

export interface RunDiagnosticsOptions {
  baseUrl?: string;
  silent?: boolean;
}

export async function runPKChatSystemDiagnostics(
  options: RunDiagnosticsOptions = {}
): Promise<PKChatDiagnosticsReport> {
  const log = (...args: unknown[]) => {
    if (!options.silent) console.log(...args);
  };
  const logErr = (...args: unknown[]) => {
    if (!options.silent) console.error(...args);
  };

  log('=== STARTING PK CHAT SYSTEM DIAGNOSTICS ===');
  const checks: PKChatDiagnosticCheckResult[] = [];

  // 1. Anti-Theft Protection & Code Security
  try {
    const shield = new SecurityShieldSystem();
    const status = shield.checkSecurityStatus('en');
    const passiveSafeOnNormalLaunch =
      typeof shield.isAntiDebugEnabled() === 'boolean' &&
      shield.isDevToolsViewportAnomaly(160) === false;
    const xssBlocked = sanitizeChatPayload('<script>alert(1)</script>').safe === false;
    const malwareBlocked =
      inspectAttachmentForMalware({
        fileName: 'payload.exe',
        mimeType: 'application/x-msdownload',
        sizeBytes: 1024,
      }).safe === false;

    if (status.isLocked || !passiveSafeOnNormalLaunch || !xssBlocked || !malwareBlocked) {
      throw new Error('SecurityShield invariants failed verification.');
    }

    const summary = 'Anti-Theft Protection, XSS Sanitizer & Malware Guard active.';
    checks.push({ id: 'anti_theft', passed: true, summary });
    log(`[PASS] ${summary}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push({ id: 'anti_theft', passed: false, summary: msg });
    logErr('[FAIL] Anti-Theft Test Failed:', msg);
  }

  // 2. Autonomous Self-Updater
  try {
    let versionInfo = `v${PK_CHAT_CLIENT_VERSION}`;
    if (options.baseUrl) {
      const res = await fetch(
        `${options.baseUrl}/api/app/version?clientVersion=${encodeURIComponent(PK_CHAT_CLIENT_VERSION)}`
      );
      if (!res.ok) {
        throw new Error(`/api/app/version returned HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        androidPackageId?: string;
        latestVersion?: string;
        playStoreUrl?: string;
      };
      if (
        data.androidPackageId !== PK_CHAT_ANDROID_PACKAGE ||
        !data.playStoreUrl?.includes(PK_CHAT_ANDROID_PACKAGE)
      ) {
        throw new Error('Play Store package verification mismatch.');
      }
      versionInfo = `latest=${data.latestVersion || PK_CHAT_CLIENT_VERSION}, pkg=${data.androidPackageId}`;
    } else if (!PK_CHAT_PLAY_STORE_URL.includes(PK_CHAT_ANDROID_PACKAGE)) {
      throw new Error('Invalid Play Store update URL.');
    }

    const summary = `Autonomous Self-Updater Status: ready (${versionInfo})`;
    checks.push({ id: 'self_updater', passed: true, summary });
    log(`[PASS] ${summary}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push({ id: 'self_updater', passed: false, summary: msg });
    logErr('[FAIL] Self-Updater Test Failed:', msg);
  }

  // 3. Live Calling & Low-Latency Translation Pipeline
  try {
    const emitted: Array<{ sentence: string; seq: number }> = [];
    const buffer = new SentenceTranslationBuffer((sentence, seq) => {
      emitted.push({ sentence, seq });
    });
    buffer.pushText('Vanakkam! Crystal clear audio channel ready.', 50);
    buffer.flushNow();

    if (emitted.length === 0 || emitted[0].seq !== 1) {
      throw new Error('Calling translation buffer failed sentence sequencing.');
    }

    let backendPosture = 'local-buffer-verified';
    if (options.baseUrl) {
      const healthRes = await fetch(`${options.baseUrl}/api/health`);
      if (!healthRes.ok) {
        throw new Error(`/api/health returned HTTP ${healthRes.status}`);
      }
      const health = (await healthRes.json()) as {
        status?: string;
        securityStatus?: string;
      };
      if (health.status !== 'operational' || health.securityStatus !== 'NORMAL') {
        throw new Error(`Unexpected backend posture: ${JSON.stringify(health)}`);
      }
      backendPosture = `operational (${health.securityStatus})`;
    }

    const summary = `Calling & Translation Engine: ${backendPosture} | Sequenced ${emitted.length} turn(s)`;
    checks.push({ id: 'calling_engine', passed: true, summary });
    log(`[PASS] ${summary}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push({ id: 'calling_engine', passed: false, summary: msg });
    logErr('[FAIL] Calling Engine Test Failed:', msg);
  }

  // 4. 3D Celebration Animation Engine
  try {
    const detected = detectChatKeywordAnimation('Happy Global New Year 🎆');
    const newYearMeta = detected ? CHAT_ANIMATION_META[detected] : null;
    if (detected !== 'fireworks' || !newYearMeta || FESTIVAL_3D_CARDS.length !== 10) {
      throw new Error('3D celebration animation registry failed check.');
    }

    const summary = `3D Animation Engine: ${newYearMeta.title} (${FESTIVAL_3D_CARDS.length} cards verified)`;
    checks.push({ id: 'festival_3d', passed: true, summary });
    log(`[PASS] ${summary}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push({ id: 'festival_3d', passed: false, summary: msg });
    logErr('[FAIL] 3D Animation Test Failed:', msg);
  }

  // 5. Cascade SOS 3-Contact Chain & Government Emergency Purge Verification
  try {
    const testCascadeContacts = ['+94700000001', '+94700000002', '+94700000003'].slice(0, 3);
    const smsText = buildEmergencySmsMessage({
      senderName: 'Test_User',
      recipients: testCascadeContacts,
      latitude: 6.92708,
      longitude: 79.86124,
    });
    const smsUri = buildSmsLaunchUri(testCascadeContacts, smsText, 'Mozilla/5.0 (Linux; Android 14)');
    if (!smsUri || !smsUri.includes('+94700000001,+94700000002,+94700000003')) {
      throw new Error('Cascade SOS 3-contact URI failed generation.');
    }

    const cleanupRes = await autoDeleteCountryEmergencyData('diagnostic_check_user');
    if (cleanupRes.deletedReports !== 0 || LEGACY_COUNTRY_EMERGENCY_LOCAL_KEYS.length < 3) {
      throw new Error('Country emergency cleanup guard check failed.');
    }

    if (options.baseUrl) {
      const [nearbyRes, classifyRes] = await Promise.all([
        fetch(`${options.baseUrl}/api/emergency/nearby?lat=6.92&lng=79.86`),
        fetch(`${options.baseUrl}/api/emergency/classify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'test' }),
        }),
      ]);
      if (nearbyRes.status !== 404 || classifyRes.status !== 404) {
        throw new Error(
          `Expected legacy gov/nearby endpoints purged (404), got nearby=${nearbyRes.status}, classify=${classifyRes.status}`
        );
      }
    }

    const summary =
      'Cascade SOS 3-Contact Chain initialized successfully (Government emergency endpoints/data purged).';
    checks.push({ id: 'cascade_sos', passed: true, summary });
    log(`[PASS] ${summary}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push({ id: 'cascade_sos', passed: false, summary: msg });
    logErr('[FAIL] Cascade SOS Test Failed:', msg);
  }

  // 6. Unified Core Engine & Business Track Controller Readiness
  try {
    const readiness = runPKChatReadinessCheck();
    if (!readiness.readyForPlayStorePreparation) {
      throw new Error(readiness.issues.join('; ') || 'Unified core readiness check failed.');
    }
    const summary = `Unified Core Controller ready (${readiness.configSummary.trialDays}d trial, $${readiness.configSummary.annualFeeUSD}/yr, All Countries Ads).`;
    checks.push({ id: 'core_readiness', passed: true, summary });
    log(`[PASS] ${summary}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push({ id: 'core_readiness', passed: false, summary: msg });
    logErr('[FAIL] Unified Core Readiness Test Failed:', msg);
  }

  const allPassed = checks.every((c) => c.passed);
  log(
    allPassed
      ? '=== ALL SYSTEMS OPERATIONAL. READY FOR PLAY STORE DEPLOYMENT ==='
      : '=== DIAGNOSTICS COMPLETED WITH FAILURES ==='
  );

  return {
    allPassed,
    checks,
    timestamp: new Date().toISOString(),
  };
}
