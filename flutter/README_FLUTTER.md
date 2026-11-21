# PK CHAT — Flutter Mobile Project (`pk_chat`)

This directory contains the **`pk_chat`** Flutter codebase matching all requested packages and wired to the live **PK CHAT** Firebase backend (`pk-chhat`):

- `firebase_core: ^4.0.0`
- `firebase_auth: ^6.0.0`
- `cloud_firestore: ^6.0.0`
- `firebase_messaging: ^16.0.0`
- `flutter_webrtc: ^1.2.0`
- `flutter_callkit_incoming`
- `permission_handler`

## Environment Note
- This AI Studio Preview container runs the live **PK CHAT Web App** (React + TypeScript + Express on port `3000`); the `flutter` / `dart` CLI is **not** installed inside this Linux preview container.
- All Flutter source files live cleanly in `/flutter/` without impacting the running web application.

## Local Setup Commands (Run on your PC / Mac)
1. **Create a fresh Flutter project & install dependencies**:
   ```bash
   flutter create pk_chat
   cd pk_chat

   flutter pub add firebase_core firebase_auth cloud_firestore firebase_messaging flutter_webrtc flutter_callkit_incoming permission_handler
   ```
   Then copy the `lib/` folder from `/flutter/lib/` into `pk_chat/lib/`.

2. **Generate `firebase_options.dart` for `pk-chhat`**:
   ```bash
   dart pub global activate flutterfire_cli
   flutterfire configure --project=pk-chhat
   ```
   Update `main.dart` to pass `options: DefaultFirebaseOptions.currentPlatform` into `PkChatFirebaseService.instance.initialize(...)`.

3. **Important Database ID Rule**:
   - `PkChatFirebaseService` and `PKChatCalling` connect to `databaseId: 'ai-studio-6dbe0703-e82e-426f-99e4-cc1723ffa450'` via `FirebaseFirestore.instanceFor(...)` rather than `(default)`.
   - `firestore.rules` already includes hardened rules for `/calls/{callId}`, `/call_records/{callId}`, `/messages/{messageId}`, `/profile_media/{userId}`, `/user_profiles/{userId}`, and `/system_security/global`.

4. **Android Native Setup (`android/app/src/main/AndroidManifest.xml` & `build.gradle`)**:
   - Set `minSdk = 23` and `compileSdk = 34` (required by `firebase_auth`, `flutter_webrtc`, and `flutter_callkit_incoming`).
   - Add permissions:
     - `android.permission.INTERNET`
     - `android.permission.RECORD_AUDIO`
     - `android.permission.CAMERA`
     - `android.permission.MODIFY_AUDIO_SETTINGS`
     - `android.permission.BLUETOOTH` / `BLUETOOTH_CONNECT`
     - `android.permission.POST_NOTIFICATIONS`
     - `android.permission.USE_FULL_SCREEN_INTENT` (for CallKit lock-screen ringing)

5. **iOS Native Setup (`ios/Runner/Info.plist` & Xcode Capabilities)**:
   - Add `NSCameraUsageDescription` and `NSMicrophoneUsageDescription`.
   - Enable **Push Notifications**, **Voice over IP**, and **Audio, AirPlay, and Picture in Picture** under *Signing & Capabilities -> Background Modes*.
