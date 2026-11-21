# PK CHAT — Complete Setup, Security & Store Distribution Guide

## 1. Firebase Console & Cloud Functions Deployment
- Active Firebase Project ID: `pk-chhat` (`368881984581`)
- Firestore Database ID: `ai-studio-6dbe0703-e82e-426f-99e4-cc1723ffa450`
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
- OAuth scopes configured on Web client (`368881984581-vrr5h8qclvtefbsrvnrkcq0bbnka5f05.apps.googleusercontent.com`):
  - `https://www.googleapis.com/auth/gmail.send`
  - `https://www.googleapis.com/auth/gmail.readonly`
- **Important Security Rule**: Access tokens live **only in React memory** on authenticated owner sessions and are never persisted to `localStorage`, cookies, or Firestore.
- Replies must arrive on the **same Gmail `threadId`**, from a **verified owner email**, containing `APPROVE <SINGLE_USE_CODE>` or `REJECT <SINGLE_USE_CODE>`. Arbitrary commands/code inside emails are rejected.

## 3. Android Studio Integration (`/android/pkchat_security/`)
1. Create or open your Android Jetpack Compose project (`com.pkchat.app`) in Android Studio.
2. Download `google-services.json` from Firebase Console (`pk-chhat`) and place it inside `app/google-services.json`.
3. Add Firebase BOM + Coroutines + Material 3 + MultiDex to `app/build.gradle.kts` (`defaultConfig { multiDexEnabled = true }`):
   ```kotlin
   implementation(platform("com.google.firebase:firebase-bom:33.9.0"))
   implementation("com.google.firebase:firebase-auth")
   implementation("com.google.firebase:firebase-firestore")
   implementation("androidx.multidex:multidex:2.0.1")
   ```
4. Copy `/android/AndroidManifest.xml` (includes `android:name=".PKChatApplication"`, `.PKChatMainActivity` deep links for `https://pkchat.app/class/...`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `SEND_SMS`, `READ_PHONE_STATE`, `RECORD_AUDIO`, and `CAMERA`) into `app/src/main/AndroidManifest.xml`.
5. Copy `/android/java/com/pkchat/app/PKChatApplication.kt` and `/android/java/com/pkchat/app/PKChatMainActivity.kt` into `app/src/main/java/com/pkchat/app/`, and copy all security Kotlin files from `/android/pkchat_security/` into `app/src/main/java/com/pkchat/security/`.
6. Initialize `PkChatSecurityManager` with your `backendBaseUrl` and render `SecurityNotificationBanner` above your `Scaffold` using `userProfile.preferredLanguage`. For hybrid WebView shells, expose `webView.addJavascriptInterface(PkChatOfflineSmsSosManager(this), "PkChatAndroidBridge")` for offline SIM SMS + GPS SOS, and wire `VideoCallRecorderHelper` for consent-gated MP4 video+audio call recording.

## 4. Play Store, Apple App Store & Bank Payout Guide
- **Immediate Install (PWA)**: Users on Android Chrome/Edge and iPhone Safari can install **PK CHAT** right now via the in-app **Install App** button (`manifest.webmanifest` + Service Worker).
- **Google Play Store (TWA / Signed AAB)**:
  1. Register in Google Play Console ($25 one-time fee).
  2. Package the live HTTPS origin with Bubblewrap (`bubblewrap init --manifest=https://<your-domain>/manifest.webmanifest` -> `bubblewrap build`).
  3. Upload `.well-known/assetlinks.json` using your Play App Signing SHA-256 fingerprint, then upload `app-release-bundle.aab`.
- **Apple App Store (iOS Capacitor)**:
  1. Enroll in Apple Developer Program ($99/year).
  2. Run `npx cap init "PK CHAT" "com.pkchat.app"` and `npx cap add ios`, build web assets (`npm run build`), then archive in Xcode for App Store Connect / TestFlight.
- **Developer Bank Account / Payouts (Never enter bank details inside chat)**:
  - **Google Play Payouts**: *Google Play Console -> Setup -> Payments profile* (link merchant bank account + tax info).
  - **Apple Payouts**: *App Store Connect -> Business -> Banking* (add SWIFT/IBAN or local bank account).
  - **Web Card Subscriptions**: *Stripe Dashboard -> Settings -> Bank accounts and scheduling*.

## 5. Honest Status Summary (Built Here vs External Console Steps)
- **Built & Runnable Now**: Live React + Express backend security engine, `LOCKDOWN`/`RECOVERING`/`NORMAL` state machine, multi-language banner & TTS, AI Guardian static/automated tests, Gmail OAuth email dispatch & reply verifier, hardened Firestore rules (deployed to `pk-chhat`), full Vite PWA (`manifest.webmanifest` + SW), WhatsApp-style PK CHAT UI + custom read ticks, and Android Kotlin/Compose module source files.
- **Requires External Deployment/Build**: Running `firebase deploy --only functions` on Firebase Blaze, compiling the Android `.aab`/iOS `.ipa` with signing certificates, and completing Google/Apple/Stripe merchant bank verification.
