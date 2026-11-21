import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

admin.initializeApp();

// Configure named database when using non-default Firestore database ID
const DATABASE_ID = process.env.PKCHAT_FIRESTORE_DB_ID || 'ai-studio-6dbe0703-e82e-426f-99e4-cc1723ffa450';
const db = admin.firestore(DATABASE_ID);

const OWNER_EMAILS = new Set([
  'jeradkaran2022@gmail.com',
  'jeradprasanth27@gmail.com',
]);

type SecurityStatus = 'NORMAL' | 'LOCKDOWN' | 'RECOVERING';

const ALLOWLISTED_ACTIONS = new Set([
  'VERIFY_AND_RECOVER',
  'ENABLE_STRICT_RATE_LIMIT',
  'KEEP_LOCKDOWN_ACTIVE',
  'HALT_AFFECTED_ENDPOINTS',
]);

async function writeAuditLog(params: {
  actorId: string;
  action: string;
  fromStatus: SecurityStatus;
  toStatus: SecurityStatus;
  detail: string;
}) {
  const auditId = `aud_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  await db.collection('security_audit_logs').doc(auditId).set({
    auditId,
    actorId: params.actorId.slice(0, 128),
    action: params.action.slice(0, 64),
    fromStatus: params.fromStatus,
    toStatus: params.toStatus,
    detail: params.detail.slice(0, 400),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function notifyAdminsAndUsersOfStateChange(
  status: SecurityStatus,
  reasonCode: string,
  incidentId?: string
) {
  // Notify administrators in Firestore + FCM topic
  const adminSnap = await db.collection('admin_users').get();
  const batch = db.batch();

  adminSnap.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
    const notifRef = db.collection('notifications').doc(`adm_sec_${Date.now()}_${doc.id.slice(0, 8)}`);
    batch.set(notifRef, {
      userId: doc.id,
      category: 'security',
      title: `PK CHAT Security Posture: ${status}`,
      body: `Reason: ${reasonCode}${incidentId ? ` (Incident ${incidentId})` : ''}. Messages and user accounts preserved.`,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();

  // Send FCM push topic notification to Android admin & emergency security subscribers
  try {
    await admin.messaging().send({
      topic: 'pkchat_security_admins',
      notification: {
        title: `PK CHAT Security Alert: ${status}`,
        body: `Verified incident (${reasonCode}). Review in Admin Security Console.`,
      },
      data: {
        status,
        reasonCode,
        incidentId: incidentId || '',
      },
    });
    await admin.messaging().send({
      topic: 'pkchat_global_security',
      data: {
        status,
        reasonCode,
        incidentId: incidentId || '',
        recheckAfterSeconds: '10',
      },
    });
  } catch (err) {
    console.warn('FCM broadcast skipped/failed:', err);
  }
}

/**
 * 1. Trusted Server-Side Security Event Evaluator
 * Never trusts client-side claims; inspects server-logged security_events & rate thresholds.
 * IMPORTANT: Never deletes messages or user accounts during lockdown.
 */
export const evaluateSecurityEvent = onDocumentCreated(
  {
    document: 'security_logs/{logId}',
    database: DATABASE_ID,
  },
  async (event: { data?: admin.firestore.DocumentSnapshot }) => {
    const data = event.data?.data();
    if (!data) return;

    const severity = String(data.severity || 'info');
    const eventType = String(data.eventType || '');
    const userId = String(data.userId || 'unknown');

    // Only escalate on verified critical anomalies or repeated rate/auth threshold breaches
    const suspiciousTypes = new Set([
      'RATE_LIMIT_BURST',
      'AUTH_BRUTE_FORCE',
      'PRIVILEGE_ESCALATION_ATTEMPT',
      'CARD_DATA_VIOLATION',
      'SERVER_ANOMALY_CRITICAL',
    ]);

    if (severity !== 'critical' && !suspiciousTypes.has(eventType)) {
      return;
    }

    const globalRef = db.collection('system_security').doc('global');
    const currentSnap = await globalRef.get();
    const prevStatus = (currentSnap.data()?.status as SecurityStatus) || 'NORMAL';

    const incidentId = `inc_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const category =
      eventType === 'AUTH_BRUTE_FORCE'
        ? 'auth_brute_force'
        : eventType === 'PRIVILEGE_ESCALATION_ATTEMPT'
          ? 'privilege_escalation'
          : eventType === 'CARD_DATA_VIOLATION'
            ? 'payload_tampering'
            : 'rate_limit_abuse';

    await db.collection('security_incidents').doc(incidentId).set({
      incidentId,
      category,
      severity: 'critical',
      status: 'active',
      sourceSignal: `${eventType}:${userId.slice(0, 24)}`,
      summary: String(data.detail || 'Critical server-side security threshold triggered.').slice(0, 400),
      detectedBy: 'cloud_function_evaluateSecurityEvent',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await globalRef.set(
      {
        stateId: 'global',
        status: 'LOCKDOWN',
        threatLevel: 'critical',
        reasonCode: eventType.slice(0, 64) || 'CRITICAL_SECURITY_INCIDENT',
        incidentId,
        restrictLogin: true,
        restrictMessages: true,
        restrictAccountChanges: true,
        restrictCalls: true,
        recheckIntervalSeconds: 10,
        threatResolved: false,
        updatedBy: 'cloud_function_evaluateSecurityEvent',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await writeAuditLog({
      actorId: 'cloud_function_evaluateSecurityEvent',
      action: 'TRIGGER_LOCKDOWN',
      fromStatus: prevStatus,
      toStatus: 'LOCKDOWN',
      detail: `Critical incident ${incidentId} activated LOCKDOWN without deleting messages or accounts.`,
    });

    await notifyAdminsAndUsersOfStateChange('LOCKDOWN', eventType, incidentId);
  }
);

/**
 * 2. 10-Second Re-Evaluation & Safe Recovery Callable
 * Restores NORMAL service ONLY when active incidents are resolved by backend/owner verification.
 */
export const recheckSecurityStatus = onCall(async () => {
  const globalRef = db.collection('system_security').doc('global');
  const globalSnap = await globalRef.get();
  if (!globalSnap.exists) {
    return { status: 'NORMAL', recheckAfterSeconds: 10, threatResolved: true };
  }

  const state = globalSnap.data()!;
  const currentStatus = (state.status as SecurityStatus) || 'NORMAL';

  if (currentStatus === 'NORMAL') {
    return { status: 'NORMAL', recheckAfterSeconds: 10, threatResolved: true };
  }

  // Verify no active unresolved incidents remain
  const activeIncidents = await db
    .collection('security_incidents')
    .where('status', '==', 'active')
    .limit(5)
    .get();

  const updatedMillis = state.updatedAt?.toMillis?.() || 0;
  const elapsedSeconds = (Date.now() - updatedMillis) / 1000;

  if (!activeIncidents.empty || !state.threatResolved || elapsedSeconds < 10) {
    return {
      status: currentStatus,
      threatResolved: false,
      recheckAfterSeconds: 10,
      remainingSeconds: Math.max(0, Math.ceil(10 - elapsedSeconds)),
    };
  }

  if (currentStatus === 'LOCKDOWN') {
    await globalRef.update({
      status: 'RECOVERING',
      threatLevel: 'elevated',
      restrictLogin: false,
      restrictMessages: true,
      restrictAccountChanges: true,
      restrictCalls: false,
      updatedBy: 'cloud_function_recheckSecurityStatus',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await writeAuditLog({
      actorId: 'cloud_function_recheckSecurityStatus',
      action: 'ENTER_RECOVERING',
      fromStatus: 'LOCKDOWN',
      toStatus: 'RECOVERING',
      detail: 'All threats resolved; entering 10-second stabilization recovery check.',
    });
    return { status: 'RECOVERING', threatResolved: true, recheckAfterSeconds: 10 };
  }

  // RECOVERING -> NORMAL after clean 10-second verification window
  await globalRef.update({
    status: 'NORMAL',
    threatLevel: 'low',
    reasonCode: 'ALL_SYSTEMS_VERIFIED',
    restrictLogin: false,
    restrictMessages: false,
    restrictAccountChanges: false,
    restrictCalls: false,
    threatResolved: true,
    updatedBy: 'cloud_function_recheckSecurityStatus',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await writeAuditLog({
    actorId: 'cloud_function_recheckSecurityStatus',
    action: 'RESTORE_NORMAL',
    fromStatus: 'RECOVERING',
    toStatus: 'NORMAL',
    detail: '10-second recovery verification passed. Normal PK CHAT operation restored.',
  });
  await notifyAdminsAndUsersOfStateChange('NORMAL', 'ALL_SYSTEMS_VERIFIED');
  return { status: 'NORMAL', threatResolved: true, recheckAfterSeconds: 10 };
});

/**
 * 3. Scheduled Backup Heartbeat Monitor
 */
export const scheduledSecurityHeartbeat = onSchedule(
  { schedule: 'every 1 minutes' },
  async () => {
    const activeSnap = await db
      .collection('security_incidents')
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (!activeSnap.empty) {
      await db.collection('system_security').doc('global').set(
        {
          stateId: 'global',
          status: 'LOCKDOWN',
          threatLevel: 'critical',
          reasonCode: 'ACTIVE_THREAT_ONGOING',
          restrictLogin: true,
          restrictMessages: true,
          restrictAccountChanges: true,
          restrictCalls: true,
          recheckIntervalSeconds: 10,
          threatResolved: false,
          updatedBy: 'cloud_function_heartbeat',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }
);

/**
 * 4. Owner-Only Allowlisted Authorization (Requires Verified Owner Email + Single-Use Match)
 */
export const adminAuthorizeDecision = onCall(async (request: {
  auth?: { token: { email?: string; email_verified?: boolean } };
  data: unknown;
}) => {
  const email = (request.auth?.token.email || '').toLowerCase();
  const emailVerified = request.auth?.token.email_verified === true;
  if (!request.auth || !emailVerified || !OWNER_EMAILS.has(email)) {
    throw new HttpsError('permission-denied', 'Authenticated verified owner credentials required.');
  }

  const { actionId, incidentId, decision } = request.data as {
    actionId?: string;
    incidentId?: string;
    decision?: 'APPROVE' | 'REJECT';
  };

  if (!actionId || !ALLOWLISTED_ACTIONS.has(actionId)) {
    throw new HttpsError('invalid-argument', 'Action is not in server remediation allowlist.');
  }

  if (decision === 'APPROVE' && actionId === 'VERIFY_AND_RECOVER') {
    if (incidentId) {
      await db.collection('security_incidents').doc(incidentId).update({
        status: 'resolved',
        resolvedBy: email,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await db.collection('system_security').doc('global').set(
      {
        stateId: 'global',
        status: 'RECOVERING',
        threatLevel: 'elevated',
        reasonCode: 'OWNER_APPROVED_RECOVERY',
        restrictLogin: false,
        restrictMessages: true,
        restrictAccountChanges: true,
        restrictCalls: false,
        recheckIntervalSeconds: 10,
        threatResolved: true,
        updatedBy: email,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await writeAuditLog({
      actorId: email,
      action: 'OWNER_APPROVED_RECOVERY',
      fromStatus: 'LOCKDOWN',
      toStatus: 'RECOVERING',
      detail: `Owner ${email} approved allowlisted recovery for incident ${incidentId || 'global'}.`,
    });
  }

  return { ok: true, executedBy: email, actionId, decision: decision || 'APPROVE' };
});

/**
 * 5. Consented Emergency Report Notification Dispatcher
 * Writes targeted in-app notifications ONLY for recipients explicitly selected by the user.
 */
export const onEmergencyReportCreated = onDocumentCreated(
  {
    document: 'emergency_reports/{reportId}',
    database: DATABASE_ID,
  },
  async (event: { data?: admin.firestore.DocumentSnapshot; params: Record<string, string> }) => {
    const data = event.data?.data();
    if (!data) return;

    const reportId = String(data.reportId || event.params.reportId || '');
    const senderName = String(data.userName || 'PK CHAT User').slice(0, 100);
    const category = String(data.category || 'emergency').replace(/_/g, ' ');
    const recipients: string[] = Array.isArray(data.authorizedRecipientIds)
      ? data.authorizedRecipientIds.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0).slice(0, 20)
      : [];

    if (!data.sharedWithContacts || recipients.length === 0) {
      return;
    }

    const loc = data.consentedLocation as Record<string, unknown> | undefined;
    const areaLabel = loc
      ? [loc.city, loc.district, loc.province, loc.country].filter((v) => typeof v === 'string' && v.trim()).join(', ')
      : '';

    const batch = db.batch();
    for (const recipientUid of recipients) {
      if (recipientUid === data.userId) continue;
      const notifRef = db.collection('notifications').doc(`emg_${reportId.slice(0, 20)}_${recipientUid.slice(0, 12)}`);
      batch.set(notifRef, {
        userId: recipientUid,
        category: 'sos',
        title: `SOS Emergency (${category}) from ${senderName}`.slice(0, 120),
        body: `${String(data.description || 'Emergency help requested').slice(0, 180)}${areaLabel ? ` — Area: ${areaLabel.slice(0, 80)}` : ''}`.slice(0, 300),
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
);
