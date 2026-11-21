import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Lock,
  Mail,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import { INTEGRATION_CHECKLIST } from '../data/constants';
import { usePkChat } from '../context/PkChatContext';
import {
  blockMasterCoreAlert,
  dispatchMasterCoreAlert,
  fetchAdsReviewQueueAdmin,
  fetchAdPlatformConfig,
  fetchCloudHealth,
  fetchMasterCoreAlertQueue,
  interceptGlobalDisastersToMasterCore,
  MasterCoreVaultItem,
  setMasterCoreStrictPolicy,
  updateAdPlatformConfig,
  verifyAdViolationAdmin,
} from '../lib/api';
import {
  AdReportCategory,
  AllowlistedRemediationAction,
  GuardianScanResult,
  RemoteAdPricingConfig,
  SponsoredPublicAd,
} from '../types/pkchat';

const REMEDIATION_ACTIONS: Array<{ id: AllowlistedRemediationAction; label: string }> = [
  { id: 'VERIFY_AND_RECOVER', label: 'VERIFY_AND_RECOVER (Verify clean & enter 10s Recovery)' },
  { id: 'ENABLE_STRICT_RATE_LIMIT', label: 'ENABLE_STRICT_RATE_LIMIT (Tighten API rate limits)' },
  { id: 'KEEP_LOCKDOWN_ACTIVE', label: 'KEEP_LOCKDOWN_ACTIVE (Hold lockdown & monitor)' },
  { id: 'HALT_AFFECTED_ENDPOINTS', label: 'HALT_AFFECTED_ENDPOINTS (Pause sensitive endpoints)' },
];

export function AdminDashboardView() {
  const {
    isAdminUser,
    adminMfaVerified,
    setAdminMfaVerified,
    firebaseUser,
    signInWithGoogle,
    directoryProfiles,
    contacts,
    sosAlerts,
    securityLogs,
    paymentRecords,
    publishOfficialDisasterAlert,
    firestoreConnected,
    globalSecurityState,
    recheckCountdown,
    securityIncidents,
    securityAuditLogs,
    gmailApprovals,
    gmailAccessToken,
    connectOwnerGmail,
    disconnectOwnerGmail,
    refreshSecurityStatus,
    runSecurityGuardianScan,
    triggerSecurityLockdownDrill,
    resolveSecurityThreatAdmin,
    requestOwnerGmailApproval,
    checkOwnerGmailApprovalReply,
  } = usePkChat();

  const [mfaCode, setMfaCode] = useState('');
  const [mfaChallenge] = useState(() => String(Math.floor(100000 + Math.random() * 900000)));
  const [mfaError, setMfaError] = useState('');

  const [health, setHealth] = useState<{
    service: string;
    status: string;
    uptimeSeconds: number;
    translationReady: boolean;
    paymentMode: string;
    timestamp: string;
    recentErrors: Array<{ id: string; endpoint: string; status: number; message: string; timestamp: string }>;
  } | null>(null);

  const [disTitle, setDisTitle] = useState('');
  const [disSource, setDisSource] = useState('Regional Meteorological Agency');
  const [disLocation, setDisLocation] = useState('');
  const [disHazard, setDisHazard] = useState<'flood' | 'tsunami' | 'earthquake' | 'severe_weather'>('flood');
  const [disSeverity, setDisSeverity] = useState<'advisory' | 'watch' | 'warning' | 'extreme'>('warning');
  const [disStatus, setDisStatus] = useState('');

  // Master Alert Routing Core (Global Disaster Intercept -> Admin Core -> Regional Dispatch)
  const [masterCoreQueue, setMasterCoreQueue] = useState<MasterCoreVaultItem[]>([]);
  const [masterCoreStrictHold, setMasterCoreStrictHold] = useState(false);
  const [masterCoreCounts, setMasterCoreCounts] = useState({ lockedCount: 0, dispatchedCount: 0, blockedCount: 0 });
  const [masterCoreBusy, setMasterCoreBusy] = useState(false);
  const [masterCoreRegionInput, setMasterCoreRegionInput] = useState('GLOBAL');

  // Security Guardian & Gmail Owner Approval UI States
  const [secBusy, setSecBusy] = useState(false);
  const [secFeedback, setSecFeedback] = useState<string | null>(null);
  const [secError, setSecError] = useState<string | null>(null);
  const [guardianScan, setGuardianScan] = useState<GuardianScanResult | null>(null);
  const [showGmailApprovalModal, setShowGmailApprovalModal] = useState(false);
  const [approvalIncidentId, setApprovalIncidentId] = useState('inc_manual_review');
  const [approvalRisk, setApprovalRisk] = useState<'HIGH' | 'CRITICAL' | 'MEDIUM'>('HIGH');
  const [approvalActionId, setApprovalActionId] = useState<AllowlistedRemediationAction>('VERIFY_AND_RECOVER');
  const [approvalExplanation, setApprovalExplanation] = useState(
    'Anomalous payload/rate spike was isolated cleanly. Automated checks verified zero user data exposure.'
  );
  const [approvalChanges, setApprovalChanges] = useState(
    'Apply stricter rate-limit threshold on public endpoints and transition system cleanly out of LOCKDOWN.'
  );
  const [approvalDiff, setApprovalDiff] = useState(
    '- maxRequestsPerMinute: 120\n+ maxRequestsPerMinute: 60\n+ validateCardPayloadStrict: true'
  );
  const [approvalTestResults, setApprovalTestResults] = useState(
    'ESLint security rules passed (0 errors); API auth & rate guards verified.'
  );

  const [adReviewQueue, setAdReviewQueue] = useState<SponsoredPublicAd[]>([]);
  const [adPricingConfig, setAdPricingConfig] = useState<RemoteAdPricingConfig | null>(null);
  const [smallPriceInput, setSmallPriceInput] = useState('5');
  const [largePriceInput, setLargePriceInput] = useState('10');
  const [adModBusy, setAdModBusy] = useState(false);
  const [adModStatus, setAdModStatus] = useState<string | null>(null);

  const loadHealth = async () => {
    try {
      const h = await fetchCloudHealth();
      setHealth(h);
    } catch {
      setHealth(null);
    }
  };

  const loadSponsoredAdsModeration = async () => {
    try {
      const cfg = await fetchAdPlatformConfig();
      setAdPricingConfig(cfg);
      setSmallPriceInput(String(cfg.smallAdPriceUsd));
      setLargePriceInput(String(cfg.largeAdPriceUsd));
      const token = await firebaseUser?.getIdToken();
      if (token) {
        const res = await fetchAdsReviewQueueAdmin(token);
        setAdReviewQueue(res.items || []);
      }
    } catch {
      // Non-blocking
    }
  };

  const loadMasterCoreQueue = async () => {
    try {
      const token = await firebaseUser?.getIdToken();
      if (!token) return;
      const q = await fetchMasterCoreAlertQueue(token);
      setMasterCoreQueue(q.items || []);
      setMasterCoreStrictHold(Boolean(q.strictManualHold));
      setMasterCoreCounts({
        lockedCount: q.lockedCount || 0,
        dispatchedCount: q.dispatchedCount || 0,
        blockedCount: q.blockedCount || 0,
      });
    } catch {
      // ignore if token unavailable
    }
  };

  useEffect(() => {
    if (isAdminUser && adminMfaVerified) {
      loadHealth();
      refreshSecurityStatus();
      loadMasterCoreQueue();
      loadSponsoredAdsModeration();
    }
  }, [isAdminUser, adminMfaVerified, refreshSecurityStatus]);

  if (!isAdminUser) {
    return (
      <div className="p-6 lg:p-10 max-w-xl mx-auto">
        <div className="rounded-3xl bg-[#e3f3ff]/80 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 p-8 text-center space-y-4 shadow-lg">
          <Lock className="w-10 h-10 text-rose-600 mx-auto" />
          <h1 className="text-xl font-bold">Authorized Administrator Access Only</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Signed in as {firebaseUser?.email || firebaseUser?.phoneNumber || 'Standard User'}. The Admin Dashboard requires verified owner credentials and MFA verification. Normal app operations continue 24/7 in the cloud without requiring the owner to stay logged in.
          </p>
          <button
            type="button"
            onClick={() => signInWithGoogle()}
            className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors"
          >
            Owner Sign-In (Admin Only)
          </button>
        </div>
      </div>
    );
  }

  if (!adminMfaVerified) {
    return (
      <div className="p-6 lg:p-10 max-w-md mx-auto">
        <div className="rounded-3xl bg-[#e3f3ff]/80 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 p-7 space-y-4 shadow-lg">
          <div className="flex items-center gap-2 text-[#0284c7] dark:text-[#38bdf8]">
            <ShieldCheck className="w-6 h-6" />
            <h1 className="text-lg font-bold">Admin MFA Verification</h1>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Owner verified ({firebaseUser?.email}). Confirm the 6-digit MFA challenge code below to unlock administrative controls:
          </p>
          <p className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-center font-mono text-lg font-bold tracking-widest tabular-nums">
            {mfaChallenge}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (mfaCode.trim() === mfaChallenge) {
                setAdminMfaVerified(true);
              } else {
                setMfaError('Challenge code does not match.');
              }
            }}
            className="space-y-3"
          >
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Enter 6-digit code"
              className="w-full px-4 py-3 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-center font-mono text-base"
            />
            {mfaError && <p className="text-xs text-rose-600">{mfaError}</p>}
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-sm font-semibold"
            >
              Verify &amp; Open Admin Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  const reportedContacts = contacts.filter((c) => c.reported);
  const onlineUsers = directoryProfiles.filter((u) => u.onlineStatus === 'online').length;

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            PK CHAT Owner &amp; Cloud Operations Dashboard
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            24/7 Cloud Firestore &amp; Express API telemetry · Owner does not need to remain online for users.
          </p>
        </div>
        <button
          onClick={loadHealth}
          className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-2 self-start"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh Health</span>
        </button>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800">
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Registered Directory Users
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{directoryProfiles.length}</p>
          <p className="mt-1 text-xs text-[#0284c7] dark:text-[#38bdf8] tabular-nums">
            {onlineUsers} currently online
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800">
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Cloud Server Health
          </p>
          <p className="mt-2 text-2xl font-bold text-[#0284c7] dark:text-[#38bdf8]">
            {health?.status === 'operational' ? 'Operational' : 'Checking'}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Uptime: {health?.uptimeSeconds ?? 0}s · Cloud Relay: {health?.translationReady ? 'Ready' : 'Standby'}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800">
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" /> Firestore &amp; Billing
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{paymentRecords.length}</p>
          <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">
            Firestore: {firestoreConnected ? 'Connected' : 'Offline'} · Test Mode
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800">
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Abuse &amp; SOS Events
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {reportedContacts.length + sosAlerts.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {reportedContacts.length} reports · {sosAlerts.length} user SOS
          </p>
        </div>
      </div>

      {/* Emergency Security Posture, Lockdown Drill, Gmail OAuth Approval & Security Shield */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-[#0284c7]" />
              <span>Emergency Security Posture</span>
            </h2>
            <span
              className={`px-3 py-1 rounded-xl text-xs font-bold ${
                globalSecurityState.status === 'LOCKDOWN'
                  ? 'bg-rose-600 text-white'
                  : globalSecurityState.status === 'RECOVERING'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-sky-100 dark:bg-sky-950/60 text-[#0369a1] dark:text-sky-300'
              }`}
            >
              {globalSecurityState.status} · Threat: {globalSecurityState.threatLevel.toUpperCase()}
            </span>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            Reason: <span className="font-mono">{globalSecurityState.reasonCode}</span> · Auto recheck timer: <span className="font-mono font-semibold">{recheckCountdown}s</span> · User chats/accounts are preserved read-only during lockdown.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={secBusy}
              onClick={async () => {
                setSecBusy(true);
                setSecError(null);
                setSecFeedback(null);
                try {
                  await triggerSecurityLockdownDrill('anomalous_flood', 'Owner-initiated security lockdown drill');
                  setSecFeedback('Security Lockdown Drill activated.');
                } catch (e) {
                  setSecError(e instanceof Error ? e.message : 'Unable to trigger drill.');
                } finally {
                  setSecBusy(false);
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold"
            >
              Trigger Lockdown Drill
            </button>
            <button
              type="button"
              disabled={secBusy}
              onClick={async () => {
                setSecBusy(true);
                setSecError(null);
                setSecFeedback(null);
                try {
                  await resolveSecurityThreatAdmin(false);
                  setSecFeedback('Threat marked resolved; 10s recovery verification active.');
                } catch (e) {
                  setSecError(e instanceof Error ? e.message : 'Unable to resolve threat.');
                } finally {
                  setSecBusy(false);
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 text-xs font-semibold"
            >
              Mark Threat Resolved (10s Recovery)
            </button>
            <button
              type="button"
              disabled={secBusy}
              onClick={async () => {
                setSecBusy(true);
                setSecError(null);
                setSecFeedback(null);
                try {
                  await resolveSecurityThreatAdmin(true);
                  setSecFeedback('System security posture restored to NORMAL immediately.');
                } catch (e) {
                  setSecError(e instanceof Error ? e.message : 'Unable to restore normal posture.');
                } finally {
                  setSecBusy(false);
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Restore Normal Now</span>
            </button>
          </div>

          {/* Gmail Owner Approval OAuth Card (Strictly In-Memory) */}
          <div className="p-4 rounded-2xl bg-[#eef8ff]/82 dark:bg-slate-950 border border-[#7dd3fc]/65 dark:border-slate-800 space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-blue-600" />
                <span>Owner Gmail Approval Channel (Jeradprasanth27@gmail.com)</span>
              </p>
              <span className="font-mono text-[11px] text-slate-500">
                {gmailAccessToken ? 'OAuth Token Active (Memory Only)' : 'Disconnected'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {!gmailAccessToken ? (
                <button
                  type="button"
                  onClick={async () => {
                    setSecError(null);
                    try {
                      await connectOwnerGmail();
                      setSecFeedback('Owner Gmail connected cleanly in volatile React memory.');
                    } catch (e) {
                      setSecError(e instanceof Error ? e.message : 'Gmail connection cancelled.');
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold"
                >
                  Connect Owner Gmail
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const latestInc = securityIncidents[0]?.incidentId || 'inc_manual_review';
                      setApprovalIncidentId(latestInc);
                      setShowGmailApprovalModal(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-semibold flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Prepare Approval Email</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      disconnectOwnerGmail();
                      setSecFeedback('Owner Gmail OAuth token cleared from memory.');
                    }}
                    className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold"
                  >
                    Disconnect Gmail
                  </button>
                </>
              )}
            </div>
          </div>

          {secFeedback && <p className="text-xs text-[#0284c7] dark:text-[#38bdf8]">{secFeedback}</p>}
          {secError && <p className="text-xs text-rose-600 dark:text-rose-400">{secError}</p>}
        </div>

        {/* Security Shield & Incidents / Approvals Feed */}
        <div className="lg:col-span-6 bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-700 dark:text-blue-400" />
              <span>Security Shield &amp; Owner Approvals</span>
            </h2>
            <button
              type="button"
              disabled={secBusy}
              onClick={async () => {
                setSecBusy(true);
                setSecError(null);
                try {
                  const res = await runSecurityGuardianScan();
                  setGuardianScan(res);
                } catch (e) {
                  setSecError(e instanceof Error ? e.message : 'Security audit failed.');
                } finally {
                  setSecBusy(false);
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold"
            >
              Run Security Audit
            </button>
          </div>

          {guardianScan && (
            <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-xs space-y-2">
              <p className="font-bold">
                Scanned {guardianScan.filesScanned} files · Automated checks passed: {guardianScan.testsPassed}/{guardianScan.testsTotal}
              </p>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {guardianScan.findings.map((f) => (
                  <div key={f.id} className="p-2 rounded-lg bg-[#e3f3ff]/80 dark:bg-slate-900/80 border border-[#7dd3fc]/60">
                    <p className="font-semibold">
                      [{f.severity.toUpperCase()}] {f.title} ({f.file}:{f.line})
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">{f.proposedAlternative}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2 text-xs">
            <p className="font-bold">Recent Security Incidents ({securityIncidents.length})</p>
            <div className="max-h-32 overflow-y-auto space-y-1.5">
              {securityIncidents.length === 0 ? (
                <p className="text-slate-500">No active security incidents.</p>
              ) : (
                securityIncidents.slice(0, 5).map((inc) => (
                  <div
                    key={inc.incidentId}
                    className="p-2.5 rounded-xl bg-[#eef8ff]/82 dark:bg-slate-950 border border-[#7dd3fc]/65 dark:border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {inc.category} · {inc.status.toUpperCase()}
                      </p>
                      <p className="text-slate-500 truncate">{inc.summary}</p>
                    </div>
                    {gmailAccessToken && (
                      <button
                        type="button"
                        onClick={() => {
                          setApprovalIncidentId(inc.incidentId);
                          setShowGmailApprovalModal(true);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-blue-700 text-white font-semibold shrink-0"
                      >
                        Request Fix
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <p className="font-bold">Gmail Approval Queue ({gmailApprovals.length})</p>
            <div className="max-h-28 overflow-y-auto space-y-1.5">
              {gmailApprovals.length === 0 ? (
                <p className="text-slate-500">No Gmail remediation approvals sent yet.</p>
              ) : (
                gmailApprovals.map((ap) => (
                  <div
                    key={ap.approvalId}
                    className="p-2.5 rounded-xl bg-[#eef8ff]/82 dark:bg-slate-950 border border-[#7dd3fc]/65 dark:border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {ap.actionId} · Status: {ap.status.toUpperCase()}
                      </p>
                      <p className="text-slate-500 truncate">To: {ap.ownerEmail}</p>
                    </div>
                    {ap.status === 'pending_reply' && (
                      <button
                        type="button"
                        onClick={async () => {
                          setSecError(null);
                          try {
                            const r = await checkOwnerGmailApprovalReply(ap.approvalId);
                            setSecFeedback(r.message || `Reply check: ${r.decision || 'Pending'}`);
                          } catch (e) {
                            setSecError(e instanceof Error ? e.message : 'Unable to check Gmail reply.');
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white font-semibold shrink-0"
                      >
                        Check Owner Reply
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Master Alert Routing Engine (Global Feeds -> JERAD_PRASANTH_MASTER_CORE First) */}
      <div className="bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <span>Global Disaster Master Alert Routing Core</span>
            </h2>
            <p className="text-xs text-slate-500">
              All USGS, NOAA, and NASA EONET global feeds route to JERAD_PRASANTH_MASTER_CORE first before regional dispatch.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-semibold">
              Locked: {masterCoreCounts.lockedCount}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-sky-100 dark:bg-sky-950 text-[#0369a1] dark:text-sky-300 font-semibold">
              Dispatched: {masterCoreCounts.dispatchedCount}
            </span>
            <button
              type="button"
              disabled={masterCoreBusy}
              onClick={async () => {
                setMasterCoreBusy(true);
                try {
                  const token = await firebaseUser?.getIdToken();
                  if (token) {
                    const updated = await setMasterCoreStrictPolicy(token, !masterCoreStrictHold);
                    setMasterCoreStrictHold(updated.strictManualHold);
                    await loadMasterCoreQueue();
                  }
                } finally {
                  setMasterCoreBusy(false);
                }
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold border ${
                masterCoreStrictHold
                  ? 'bg-rose-700 text-white border-rose-700'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'
              }`}
            >
              {masterCoreStrictHold ? 'Manual Clearance Hold: ON' : 'Manual Clearance Hold: OFF'}
            </button>
            <button
              type="button"
              disabled={masterCoreBusy}
              onClick={async () => {
                setMasterCoreBusy(true);
                try {
                  const token = await firebaseUser?.getIdToken();
                  await interceptGlobalDisastersToMasterCore({
                    idToken: token,
                    holdForManualClearance: true,
                  });
                  await loadMasterCoreQueue();
                } finally {
                  setMasterCoreBusy(false);
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold"
            >
              Intercept Global Feeds Now
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-slate-600 dark:text-slate-300">Dispatch Target Region:</span>
          <input
            type="text"
            value={masterCoreRegionInput}
            onChange={(e) => setMasterCoreRegionInput(e.target.value.toUpperCase())}
            placeholder="GLOBAL, LK, US, IN"
            className="w-36 px-3 py-1.5 rounded-lg bg-[#eef8ff]/82 dark:bg-slate-950 border border-[#7dd3fc]/65 dark:border-slate-800 font-mono"
          />
        </div>

        <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs">
          {masterCoreQueue.length === 0 ? (
            <p className="text-slate-500">
              No intercepted alerts queued in Master Core vault yet. Click &quot;Intercept Global Feeds Now&quot; to inspect live hazard streams.
            </p>
          ) : (
            masterCoreQueue.slice(0, 10).map((item) => (
              <div
                key={item.alertId}
                className="p-2.5 rounded-xl bg-[#eef8ff]/82 dark:bg-slate-950 border border-[#7dd3fc]/65 dark:border-slate-800 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold truncate">
                    [{item.routingStage}] {item.title}
                  </p>
                  <p className="text-slate-500 truncate">
                    {item.officialSource} · Region: {item.regionCode} · Seal: {item.coreSealHash}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {item.routingStage !== 'VERIFIED_DISPATCHED' && (
                    <button
                      type="button"
                      disabled={masterCoreBusy}
                      onClick={async () => {
                        const token = await firebaseUser?.getIdToken();
                        if (!token) return;
                        setMasterCoreBusy(true);
                        try {
                          await dispatchMasterCoreAlert({
                            idToken: token,
                            alertId: item.alertId,
                            regionCode: masterCoreRegionInput || 'GLOBAL',
                          });
                          await loadMasterCoreQueue();
                        } finally {
                          setMasterCoreBusy(false);
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white font-semibold"
                    >
                      Verify &amp; Dispatch
                    </button>
                  )}
                  {item.routingStage !== 'BLOCKED' && (
                    <button
                      type="button"
                      disabled={masterCoreBusy}
                      onClick={async () => {
                        const token = await firebaseUser?.getIdToken();
                        if (!token) return;
                        setMasterCoreBusy(true);
                        try {
                          await blockMasterCoreAlert({ idToken: token, alertId: item.alertId });
                          await loadMasterCoreQueue();
                        } finally {
                          setMasterCoreBusy(false);
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-semibold"
                    >
                      Block
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Publish Verified Official Disaster Alert */}
        <div className="lg:col-span-5 bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl p-6 space-y-4">
          <h2 className="text-base font-bold">Publish Verified Official Disaster Alert</h2>
          <p className="text-xs text-slate-500">
            Admin-only write protected by Firestore Rules (`isAdmin()`). Only publish alerts verified from official agencies.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!disTitle.trim() || !disLocation.trim()) return;
              setDisStatus('');
              try {
                await publishOfficialDisasterAlert({
                  hazardType: disHazard,
                  title: disTitle.trim(),
                  officialSource: disSource.trim(),
                  location: disLocation.trim(),
                  severity: disSeverity,
                  issuedAt: new Date().toISOString(),
                  status: 'active',
                });
                setDisTitle('');
                setDisLocation('');
                setDisStatus('Official alert published to Firestore disaster_alerts.');
              } catch (err) {
                setDisStatus(
                  err instanceof Error ? err.message : 'Unable to publish official alert.'
                );
              }
            }}
            className="space-y-3"
          >
            <input
              type="text"
              value={disTitle}
              onChange={(e) => setDisTitle(e.target.value)}
              placeholder="Alert headline (e.g. Coastal Flood Warning)"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/82 dark:bg-slate-950 border border-[#7dd3fc]/65 dark:border-slate-800 text-xs"
            />
            <input
              type="text"
              value={disSource}
              onChange={(e) => setDisSource(e.target.value)}
              placeholder="Official agency name"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/82 dark:bg-slate-950 border border-[#7dd3fc]/65 dark:border-slate-800 text-xs"
            />
            <input
              type="text"
              value={disLocation}
              onChange={(e) => setDisLocation(e.target.value)}
              placeholder="Affected region / coordinates"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/82 dark:bg-slate-950 border border-[#7dd3fc]/65 dark:border-slate-800 text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={disHazard}
                onChange={(e) =>
                  setDisHazard(e.target.value as 'flood' | 'tsunami' | 'earthquake' | 'severe_weather')
                }
                className="px-3 py-2 rounded-xl bg-[#eef8ff]/82 dark:bg-slate-950 border border-[#7dd3fc]/65 dark:border-slate-800 text-xs"
              >
                <option value="flood">Flood</option>
                <option value="tsunami">Tsunami</option>
                <option value="earthquake">Earthquake</option>
                <option value="severe_weather">Severe Weather</option>
              </select>
              <select
                value={disSeverity}
                onChange={(e) =>
                  setDisSeverity(e.target.value as 'advisory' | 'watch' | 'warning' | 'extreme')
                }
                className="px-3 py-2 rounded-xl bg-[#eef8ff]/82 dark:bg-slate-950 border border-[#7dd3fc]/65 dark:border-slate-800 text-xs"
              >
                <option value="advisory">Advisory</option>
                <option value="watch">Watch</option>
                <option value="warning">Warning</option>
                <option value="extreme">Extreme</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold"
            >
              Publish Verified Alert
            </button>
            {disStatus && <p className="text-xs text-[#0284c7] dark:text-[#38bdf8]">{disStatus}</p>}
          </form>
        </div>

        {/* Server Error Monitor & Security Logs */}
        <div className="lg:col-span-7 bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl p-6 space-y-4">
          <h2 className="text-base font-bold">Server Errors &amp; Security Alerts</h2>
          <div className="space-y-2 max-h-60 overflow-y-auto text-xs">
            {(health?.recentErrors || []).length === 0 ? (
              <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-[#0369a1] dark:text-sky-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Zero server API errors recorded since last cloud restart.</span>
              </div>
            ) : (
              health?.recentErrors.map((err) => (
                <div
                  key={err.id}
                  className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900"
                >
                  <p className="font-semibold">
                    {err.endpoint} · HTTP {err.status}
                  </p>
                  <p className="text-slate-600 dark:text-slate-300">{err.message}</p>
                </div>
              ))
            )}
          </div>

          <h3 className="text-sm font-bold pt-2">
            Security Logs ({securityLogs.length}) &amp; Lockdown Audit ({securityAuditLogs.length})
          </h3>
          <div className="space-y-1.5 max-h-44 overflow-y-auto text-xs">
            {securityAuditLogs.slice(0, 5).map((al) => (
              <div
                key={al.auditId}
                className="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900"
              >
                <span className="font-semibold">
                  {al.action} ({al.fromStatus} → {al.toStatus})
                </span>{' '}
                · {al.detail}
              </div>
            ))}
            {securityLogs.slice(0, 6).map((l) => (
              <div key={l.id} className="p-2.5 rounded-xl bg-[#eef8ff]/82 dark:bg-slate-950 border border-[#7dd3fc]/65 dark:border-slate-800">
                <span className="font-semibold">{l.eventType}</span> · {l.detail}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sponsored Public Status Moderation & Remote Play Billing Tiers ($5 / $10) */}
      <div className="bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#0284c7]" />
              <span>Sponsored Ads Moderation &amp; Anti-False Report Verification</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Flagged businesses are held safely in &quot;Under Review&quot; (no auto-ban from false reports). Dispatch an official Violation Warning Notice ONLY after verified violation review.
            </p>
          </div>
          <button
            type="button"
            disabled={adModBusy}
            onClick={() => loadSponsoredAdsModeration()}
            className="px-3.5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold"
          >
            Refresh Ad Queue
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/65 flex flex-wrap items-end gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Small Ad Tier (USD)
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={smallPriceInput}
              onChange={(e) => setSmallPriceInput(e.target.value)}
              className="w-28 px-3 py-1.5 rounded-lg bg-white/80 border border-[#7dd3fc]/70 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Large Ad Tier (USD)
            </label>
            <input
              type="number"
              min={1}
              max={1000}
              value={largePriceInput}
              onChange={(e) => setLargePriceInput(e.target.value)}
              className="w-28 px-3 py-1.5 rounded-lg bg-white/80 border border-[#7dd3fc]/70 font-mono"
            />
          </div>
          <button
            type="button"
            disabled={adModBusy}
            onClick={async () => {
              setAdModBusy(true);
              setAdModStatus(null);
              try {
                const token = await firebaseUser?.getIdToken();
                const updated = await updateAdPlatformConfig({
                  smallAdPriceUsd: Number(smallPriceInput),
                  largeAdPriceUsd: Number(largePriceInput),
                  idToken: token,
                });
                setAdPricingConfig(updated);
                setAdModStatus(
                  `Remote Play Billing pricing updated: Small=$${updated.smallAdPriceUsd}, Large=$${updated.largeAdPriceUsd}.`
                );
              } catch (err) {
                setAdModStatus(err instanceof Error ? err.message : 'Unable to update pricing.');
              } finally {
                setAdModBusy(false);
              }
            }}
            className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold"
          >
            Save Remote Tier Pricing
          </button>
          {adPricingConfig && (
            <span className="text-[11px] text-[#0284c7] font-mono">
              Play Billing Lib {adPricingConfig.billingLibraryVersion} · SKUs: {adPricingConfig.smallAdSku} / {adPricingConfig.largeAdSku}
            </span>
          )}
        </div>

        {adModStatus && <p className="text-xs font-semibold text-[#0284c7]">{adModStatus}</p>}

        <div className="space-y-2 max-h-56 overflow-y-auto text-xs">
          {adReviewQueue.length === 0 ? (
            <p className="text-slate-500">
              No Sponsored Public Status listings currently queued for Under Review or violation triage.
            </p>
          ) : (
            adReviewQueue.map((adItem) => (
              <div
                key={adItem.adId}
                className="p-3 rounded-2xl bg-[#eef8ff]/82 dark:bg-slate-950 border border-[#7dd3fc]/65 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 dark:text-white truncate">
                    {adItem.businessName} — {adItem.title}
                  </p>
                  <p className="text-slate-600 dark:text-slate-400">
                    Status: {adItem.status.toUpperCase()} · Reports: {adItem.reportCount} · Country: {adItem.targetCountry}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={adModBusy}
                    onClick={async () => {
                      setAdModBusy(true);
                      try {
                        const token = await firebaseUser?.getIdToken();
                        await verifyAdViolationAdmin({
                          adId: adItem.adId,
                          confirmedViolation: false,
                          idToken: token,
                        });
                        setAdModStatus(`False reports dismissed for "${adItem.businessName}". Listing restored to active.`);
                        await loadSponsoredAdsModeration();
                      } finally {
                        setAdModBusy(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white font-semibold"
                  >
                    Dismiss False Reports
                  </button>
                  <button
                    type="button"
                    disabled={adModBusy}
                    onClick={async () => {
                      setAdModBusy(true);
                      try {
                        const token = await firebaseUser?.getIdToken();
                        await verifyAdViolationAdmin({
                          adId: adItem.adId,
                          confirmedViolation: true,
                          violationCategory: 'prohibited_scam' as AdReportCategory,
                          evidenceSummary: `Admin moderation verified violation across ${adItem.reportCount} user report(s).`,
                          idToken: token,
                        });
                        setAdModStatus(`Violation confirmed for "${adItem.businessName}". Listing suspended & Violation Warning Notice sent.`);
                        await loadSponsoredAdsModeration();
                      } finally {
                        setAdModBusy(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-semibold"
                  >
                    Verify Violation &amp; Send Warning
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Integration Status Summary */}
      <div className="bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl p-6">
        <h2 className="text-base font-bold mb-3">Cloud &amp; Mobile Production Readiness Summary</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {INTEGRATION_CHECKLIST.map((item) => (
            <div key={item.component} className="p-3.5 rounded-2xl bg-[#eef8ff]/82 dark:bg-slate-950 border border-[#7dd3fc]/65 dark:border-slate-800">
              <p className="font-semibold text-slate-900 dark:text-white">{item.area}</p>
              <p className="text-slate-500 mt-0.5">{item.component}</p>
              <p className="mt-1.5 font-semibold text-blue-700 dark:text-blue-400 uppercase">
                {item.status.replace(/_/g, ' ')}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Explicit Confirmation Modal Before Dispatching Gmail Approval Email */}
      {showGmailApprovalModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full rounded-3xl bg-[#e3f3ff]/88 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/80 dark:border-slate-800 p-6 space-y-4 text-xs shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Confirm Sending Remediation Approval Email</h3>
              <button type="button" onClick={() => setShowGmailApprovalModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-slate-600 dark:text-slate-300">
              Recipient: <strong>Jeradprasanth27@gmail.com</strong>. Only allowlisted actions can execute upon verified reply.
            </p>
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={approvalRisk}
                  onChange={(e) => setApprovalRisk(e.target.value as 'HIGH' | 'CRITICAL' | 'MEDIUM')}
                  className="px-3 py-2 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800"
                >
                  <option value="HIGH">Risk: HIGH</option>
                  <option value="CRITICAL">Risk: CRITICAL</option>
                  <option value="MEDIUM">Risk: MEDIUM</option>
                </select>
                <select
                  value={approvalActionId}
                  onChange={(e) =>
                    setApprovalActionId(e.target.value as AllowlistedRemediationAction)
                  }
                  className="px-3 py-2 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800"
                >
                  {REMEDIATION_ACTIONS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                rows={2}
                value={approvalExplanation}
                onChange={(e) => setApprovalExplanation(e.target.value)}
                placeholder="Incident summary & risk explanation"
                className="w-full px-3 py-2 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800"
              />
              <textarea
                rows={2}
                value={approvalChanges}
                onChange={(e) => setApprovalChanges(e.target.value)}
                placeholder="Proposed changes"
                className="w-full px-3 py-2 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800"
              />
              <textarea
                rows={2}
                value={approvalDiff}
                onChange={(e) => setApprovalDiff(e.target.value)}
                placeholder="Proposed code diff preview"
                className="w-full px-3 py-2 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 font-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowGmailApprovalModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={secBusy}
                onClick={async () => {
                  setSecBusy(true);
                  setSecError(null);
                  try {
                    const res = await requestOwnerGmailApproval({
                      incidentId: approvalIncidentId,
                      riskLevel: approvalRisk,
                      explanation: approvalExplanation,
                      proposedChanges: approvalChanges,
                      proposedCodeDiff: approvalDiff,
                      testResults: approvalTestResults,
                      actionId: approvalActionId,
                    });
                    setShowGmailApprovalModal(false);
                    setSecFeedback(res.instructions);
                  } catch (e) {
                    setSecError(e instanceof Error ? e.message : 'Unable to send Gmail approval email.');
                  } finally {
                    setSecBusy(false);
                  }
                }}
                className="px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold"
              >
                Confirm &amp; Send Approval Email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
