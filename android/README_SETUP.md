# PK CHAT — Complete Setup, Security & Store Distribution Guide

## 1. Firebase Console & Cloud Functions Deployment
- Active Firebase Project ID: `pkchat-41ef3` (`970080253597`)
- Firestore Database ID: `ai-studio-6dbe0703-e82e-426f-99e4-cc1723ffa450`
- Authorized Auth Domains (Firebase Console -> Authentication -> Settings -> Authorized domains):
  - `jeradkaran2022-tech.github.io`
  - `pkchat-41ef3.firebaseapp.com`
- **Firestore Rules**: Deployed via `firestore.rules` (enforces server-only Lockdown state and blocks all message/account deletions).
- **Deploy Cloud Functions (`/functions`)**:
  1. Ensure the project is on Firebase **Blaze** plan for Cloud Functions v2 & Scheduled Heartbeats.
  2. Run from project root:
     ```bash
     cd functions && npm install && npm run build && cd ..
     firebase deploy --only functions
     ```
  3. Functions deployed:
     - `evaluateSecurityEvent`: Validates trusted server events, elevates `/system_security/global` to `LOCKDOWN`, writes immutable audit logs.
     - `recheckSecurityStatus`: Server-verified 10-second threat recheck loop transitioning `LOCKDOWN -> RECOVERING -> NORMAL` once cooldown & incident clearance pass.
     - `scheduledSecurityHeartbeat`: Runs every 1 minute to reconcile stuck lockdowns.
     - `adminAuthorizeDecision`: Executes allowlisted remediation actions (`CLEAR_RATE_LIMITS`, `EXTEND_LOCKDOWN`, `REVOKE_UNTRUSTED_SESSIONS`, `RESET_THREAT_FLAGS`) after verified owner MFA / email approval.

## 2. Gmail Owner Approval Flow Setup
- Target owner email: `Jeradprasanth27@gmail.com` (and owner console access for `jeradkaran2022@gmail.com`).
- OAuth scopes configured on Web client (`970080253597-6dfaotnn7031jpuhonbdtt2clehujjsf.apps.googleusercontent.com`):
  - `https://www.googleapis.com/auth/gmail.send`
  - `https://www.googleapis.com/auth/gmail.readonly`
- **Important Security Rule**: Access tokens live **only in React memory** on authenticated owner sessions and are never persisted to `localStorage`, cookies, or Firestore.
- Replies must arrive on the **same Gmail `threadId`**, from a **verified owner email**, containing `APPROVE <SINGLE_USE_CODE>` or `REJECT <SINGLE_USE_CODE>`. Arbitrary commands/code inside emails are rejected.

## 3. GitHub Pages & PWABuilder Android APK / TWA Settings
- **GitHub Repository**: `jeradkaran2022-tech/PK-chat`
- **Live GitHub Pages URL**: `https://jeradkaran2022-tech.github.io/PK-chat/`
- **Vite Base Path**: `/PK-chat/` (automatically builds `dist/index.html`, `dist/404.html`, `dist/manifest.json`, `dist/sw.js`, `dist/icon-192.png`, `dist/icon-512.png`, `dist/pwa-maskable-192x192.png`, and `dist/pwa-maskable-512x512.png`)
- **PWABuilder (`https://www.pwabuilder.com/`)**:
  1. Enter `https://jeradkaran2022-tech.github.io/PK-chat/` in **"Enter the URL to your PWA"** and click **Start**.
  2. Click **Package For Stores** -> **Android** -> **Generate Package**.
  3. Set **Package ID**: `com.jeradkaran2022tech.pkchat.twa`
  4. Set **App name**: `PK Chat` (Display: `standalone`, Host: `jeradkaran2022-tech.github.io`, Start URL: `/PK-chat/`).
  5. Download the generated APK/AAB bundle (and copy `assetlinks.json` from the PWABuilder ZIP to `https://jeradkaran2022-tech.github.io/.well-known/assetlinks.json` on your user root repo `jeradkaran2022-tech.github.io` if you want zero browser URL bar in TWA).

## 4. Android Studio Integration (`/android/pkchat_security/`)
1. Create or open your Android Jetpack Compose project (`com.jeradkaran2022tech.pkchat.twa`) in Android Studio.
2. Download `google-services.json` from Firebase Console (`pkchat-41ef3`) and place it inside `app/google-services.json`.
3. Add Firebase BOM + Coroutines + Material 3 + MultiDex to `app/build.gradle.kts` (`defaultConfig { multiDexEnabled = true }`):
   ```kotlin
   implementation(platform("com.google.firebase:firebase-bom:33.9.0"))
   implementation("com.google.firebase:firebase-auth")
   implementation("com.google.firebase:firebase-firestore")
   implementation("androidx.multidex:multidex:2.0.1")
   ```
4. Copy `/android/AndroidManifest.xml` into `app/src/main/AndroidManifest.xml`, and copy the Kotlin security & app modules into `app/src/main/java/`.

## 5. Honest Status Summary (Built Here vs External Console Steps)
- **Built & Verified Now**: Live React + Express backend security engine, hardened Firestore rules deployed to `pkchat-41ef3`, Vite PWA (`base: '/PK-chat/'`, `manifest.json`, `sw.js`, crisp 192x192 & 512x512 icons, automatic `dist/404.html`), WhatsApp-style smooth entry flow, and GitHub Actions Pages workflow (`.github/workflows/deploy-pages.yml`).
- **External Steps**: Push/upload to `jeradkaran2022-tech/PK-chat`, confirm GitHub Pages is live at `https://jeradkaran2022-tech.github.io/PK-chat/`, verify `jeradkaran2022-tech.github.io` is in Firebase Auth Authorized Domains, and generate the signed APK/AAB on PWABuilder.
