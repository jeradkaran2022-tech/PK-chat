import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import firebaseAppletConfig from '../../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseAppletConfig);

function createMobileFirestore() {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
      },
      firebaseAppletConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseAppletConfig.firestoreDatabaseId);
  }
}

export const firebaseApp = app;
export const mobileAuth = getAuth(app);
export const mobileDb = createMobileFirestore();
