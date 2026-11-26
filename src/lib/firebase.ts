import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import {
  Firestore,
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firebaseProjectId = firebaseConfig.projectId;

function createResilientFirestore(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    try {
      return initializeFirestore(
        app,
        {
          experimentalAutoDetectLongPolling: true,
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
}

export const db = createResilientFirestore();
export const auth = getAuth(app);
export const storage = getStorage(app);

export function createGoogleAuthProvider(scopes: string[] = []): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  scopes.forEach((scope) => provider.addScope(scope));
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export const googleAuthProvider = createGoogleAuthProvider();

export const authPersistenceReady: Promise<void> = setPersistence(
  auth,
  browserLocalPersistence
).catch(() => {
  // Fallback handled by Firebase Auth SDK if storage is restricted
});

export {
  loginWithFirebasePhoneOrEmail,
  type FirebaseLoginRequest,
  type FirebaseLoginResult,
} from './pkExperienceController';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function buildFirestoreErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
}

export function isTransientFirestoreError(error: unknown): boolean {
  const code = (error as { code?: string })?.code || '';
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'aborted' ||
    code === 'cancelled' ||
    msg.includes('client is offline') ||
    msg.includes('could not reach cloud firestore') ||
    msg.includes('network') ||
    msg.includes('timed out')
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function probeFirestoreOnce(timeoutMs: number): Promise<boolean> {
  try {
    await Promise.race([
      getDocFromServer(doc(db, 'test', 'connection')),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('the client is offline (connection probe timeout)')), timeoutMs)
      ),
    ]);
    return true;
  } catch (error) {
    if (isTransientFirestoreError(error)) {
      return false;
    }
    // Permission denied on non-existent test/connection doc confirms live server connectivity
    return true;
  }
}

export async function testFirestoreConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  const firstAttempt = await probeFirestoreOnce(8500);
  if (firstAttempt) {
    return true;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  const secondAttempt = await probeFirestoreOnce(8500);
  if (!secondAttempt) {
    console.warn('Firestore connectivity check reported offline/slow network.');
  }
  return secondAttempt;
}
