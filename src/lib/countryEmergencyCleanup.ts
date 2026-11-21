import { collection, deleteDoc, doc, getDocs, limit, query, where } from 'firebase/firestore';
import {
  OperationType,
  auth,
  db,
  handleFirestoreError,
  isTransientFirestoreError,
} from './firebase';
import { isVipFounderFreeNumber } from './subscriptionBilling';

export const LEGACY_COUNTRY_EMERGENCY_LOCAL_KEYS = [
  'country_emergency_info',
  'selected_country',
  'pk_country_emergency_info',
] as const;

const LEGACY_SAMPLE_AND_HELPLINE_CORE_NUMBERS = [
  '0717868693', // Web Preview Test phone
  '0771234567', // Legacy Flutter/UI sample placeholder
  '0719876543', // Legacy Flutter SIM sample placeholder
  '0761112233', // Legacy diagnostic sample
  '0700000001',
  '0700000002',
  '0700000003',
  '119',
  '1990',
  '112',
  '911',
  '999',
  '100',
  '108',
] as const;

export function isPreseededNonUserSosNumber(phone?: string | null): boolean {
  if (!phone) return false;
  if (isVipFounderFreeNumber(phone)) return true;

  const digits = phone.replace(/\D/g, '');
  if (!digits) return false;

  return LEGACY_SAMPLE_AND_HELPLINE_CORE_NUMBERS.some((sample) => {
    if (sample.length <= 4) {
      return digits === sample;
    }
    const core9 = sample.startsWith('0') ? sample.slice(1) : sample;
    return (
      digits === sample ||
      digits === `94${core9}` ||
      digits === `0094${core9}` ||
      (digits.length >= 9 && digits.endsWith(core9))
    );
  });
}

export interface CountryEmergencyCleanupResult {
  deletedReports: number;
  deletedPreseededContacts: number;
  clearedLocalKeys: string[];
}

export function clearLegacyCountryEmergencyLocalCache(userId?: string): string[] {
  if (typeof localStorage === 'undefined') return [];

  const keysToCheck: string[] = [...LEGACY_COUNTRY_EMERGENCY_LOCAL_KEYS];
  if (userId && userId.trim()) {
    const cleanUid = userId.trim();
    keysToCheck.push(
      `country_emergency_info:${cleanUid}`,
      `selected_country:${cleanUid}`,
      `users/${cleanUid}/country_emergency_info`,
      `users/${cleanUid}/selected_country`
    );
  }

  const cleared: string[] = [];
  for (const key of keysToCheck) {
    try {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        cleared.push(key);
      }
    } catch {
      // Ignore storage access errors in restricted frames
    }
  }
  return cleared;
}

/**
 * Scrubs any VIP founder/service/sample/helpline numbers from legacy local SOS caches
 * so only user-entered emergency contacts remain.
 */
export function clearLegacySosPreseedCaches(): number {
  if (typeof localStorage === 'undefined') return 0;
  let removedEntries = 0;

  try {
    const rawPersonal = localStorage.getItem('pk_personal_sos_contacts');
    if (rawPersonal) {
      const parsed = JSON.parse(rawPersonal);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((item) => {
          const phone =
            typeof item === 'string'
              ? item
              : item && typeof item === 'object'
              ? (item as { phone?: string; number?: string }).phone ||
                (item as { phone?: string; number?: string }).number ||
                ''
              : '';
          const shouldDrop = isPreseededNonUserSosNumber(phone);
          if (shouldDrop) removedEntries += 1;
          return !shouldDrop;
        });
        if (filtered.length === 0) {
          localStorage.removeItem('pk_personal_sos_contacts');
        } else if (filtered.length !== parsed.length) {
          localStorage.setItem('pk_personal_sos_contacts', JSON.stringify(filtered));
        }
      }
    }
  } catch {
    // ignore storage errors
  }

  try {
    const rawSmsLog = localStorage.getItem('pk_offline_sms_sos_log');
    if (rawSmsLog) {
      const parsed = JSON.parse(rawSmsLog);
      if (Array.isArray(parsed)) {
        const filteredLogs = parsed.filter((entry) => {
          const recips = Array.isArray((entry as { recipients?: unknown })?.recipients)
            ? ((entry as { recipients: unknown[] }).recipients.filter(
                (r): r is string => typeof r === 'string'
              ))
            : [];
          const hasPreseeded = recips.some((r) => isPreseededNonUserSosNumber(r));
          if (hasPreseeded) removedEntries += 1;
          return !hasPreseeded;
        });
        if (filteredLogs.length === 0) {
          localStorage.removeItem('pk_offline_sms_sos_log');
        } else if (filteredLogs.length !== parsed.length) {
          localStorage.setItem('pk_offline_sms_sos_log', JSON.stringify(filteredLogs));
        }
      }
    }
  } catch {
    // ignore storage errors
  }

  return removedEntries;
}

/**
 * Automatically deletes legacy country/government emergency data and legacy
 * `emergency_reports` records for the signed-in user in Cloud Firestore, plus
 * runs a one-time scrub removing any previously seeded/service/founder numbers
 * from `emergency_contacts` so ONLY user-entered personal contacts remain.
 */
export async function autoDeleteCountryEmergencyData(
  userId: string
): Promise<CountryEmergencyCleanupResult> {
  const cleanUid = typeof userId === 'string' ? userId.trim() : '';
  const clearedLocalKeys = clearLegacyCountryEmergencyLocalCache(cleanUid);
  clearLegacySosPreseedCaches();

  if (!cleanUid) {
    return { deletedReports: 0, deletedPreseededContacts: 0, clearedLocalKeys };
  }

  // Only execute Firestore cleanup when the Firebase Auth session matches userId
  if (!auth.currentUser || auth.currentUser.uid !== cleanUid) {
    return { deletedReports: 0, deletedPreseededContacts: 0, clearedLocalKeys };
  }

  let deletedReports = 0;
  let deletedPreseededContacts = 0;

  let snapshotDocs: Array<{ id: string }> = [];
  try {
    const legacyReportsQuery = query(
      collection(db, 'emergency_reports'),
      where('userId', '==', cleanUid),
      limit(50)
    );
    const snap = await getDocs(legacyReportsQuery);
    snapshotDocs = snap.docs.map((d) => ({ id: d.id }));
  } catch (err) {
    if (isTransientFirestoreError(err)) {
      console.warn('Skipped legacy emergency_reports cleanup while offline/transient.');
      return { deletedReports: 0, deletedPreseededContacts: 0, clearedLocalKeys };
    }
    handleFirestoreError(err, OperationType.LIST, 'emergency_reports');
  }

  for (const reportDoc of snapshotDocs) {
    try {
      await deleteDoc(doc(db, 'emergency_reports', reportDoc.id));
      deletedReports += 1;
    } catch (err) {
      if (isTransientFirestoreError(err)) {
        console.warn('Paused legacy emergency_reports cleanup while offline/transient.');
        break;
      }
      handleFirestoreError(err, OperationType.DELETE, `emergency_reports/${reportDoc.id}`);
    }
  }

  // One-time cleanup of any pre-seeded/founder/service/sample numbers previously added to emergency_contacts
  const purgeFlagKey = `pk_sos_nonuser_purged_v1:${cleanUid}`;
  const alreadyPurged =
    typeof localStorage !== 'undefined' && localStorage.getItem(purgeFlagKey) === '1';

  if (!alreadyPurged) {
    try {
      const contactsSnap = await getDocs(
        query(collection(db, 'emergency_contacts'), where('userId', '==', cleanUid), limit(50))
      );
      for (const cDoc of contactsSnap.docs) {
        const phone = (cDoc.data() as { phone?: string })?.phone || '';
        if (isPreseededNonUserSosNumber(phone)) {
          await deleteDoc(doc(db, 'emergency_contacts', cDoc.id));
          deletedPreseededContacts += 1;
        }
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(purgeFlagKey, '1');
      }
    } catch (err) {
      if (!isTransientFirestoreError(err)) {
        handleFirestoreError(err, OperationType.DELETE, 'emergency_contacts');
      }
    }
  }

  return { deletedReports, deletedPreseededContacts, clearedLocalKeys };
}
