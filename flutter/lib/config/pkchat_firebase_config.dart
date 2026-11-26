/// PK CHAT shared Firebase identifiers matching `firebase-applet-config.json`.
///
/// NOTE: After running `flutterfire configure --project=pkchat-41ef3` locally,
/// pass `DefaultFirebaseOptions.currentPlatform` from generated `firebase_options.dart`
/// into `Firebase.initializeApp(options: ...)`, and ALWAYS open Firestore using
/// `firestoreDatabaseId` below rather than `(default)`.
class PkChatFirebaseConfig {
  static const String projectId = 'pkchat-41ef3';
  static const String messagingSenderId = '970080253597';
  static const String storageBucket = 'pkchat-41ef3.firebasestorage.app';
  static const String authDomain = 'pkchat-41ef3.firebaseapp.com';

  /// CRITICAL: PK CHAT uses this dedicated Firestore Enterprise database ID.
  /// Using `FirebaseFirestore.instance` directly would point to `(default)` instead.
  static const String firestoreDatabaseId =
      'ai-studio-6dbe0703-e82e-426f-99e4-cc1723ffa450';

  /// Live HTTPS backend base URL for server-side Gemini translation, TTS, and validation.
  static const String backendBaseUrl =
      'https://ais-dev-ve4vodrwyft6wk5fifoiyd-1000863043777.asia-east1.run.app';
}
