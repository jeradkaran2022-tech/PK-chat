/// PK CHAT shared Firebase identifiers matching `firebase-applet-config.json`.
///
/// NOTE: After running `flutterfire configure --project=pk-chhat` locally,
/// pass `DefaultFirebaseOptions.currentPlatform` from generated `firebase_options.dart`
/// into `Firebase.initializeApp(options: ...)`, and ALWAYS open Firestore using
/// `firestoreDatabaseId` below rather than `(default)`.
class PkChatFirebaseConfig {
  static const String projectId = 'pk-chhat';
  static const String messagingSenderId = '368881984581';
  static const String storageBucket = 'pk-chhat.firebasestorage.app';
  static const String authDomain = 'pk-chhat.firebaseapp.com';

  /// CRITICAL: PK CHAT uses this dedicated Firestore Enterprise database ID.
  /// Using `FirebaseFirestore.instance` directly would point to `(default)` instead.
  static const String firestoreDatabaseId =
      'ai-studio-6dbe0703-e82e-426f-99e4-cc1723ffa450';

  /// Live HTTPS backend base URL for server-side Gemini translation, TTS, and validation.
  static const String backendBaseUrl =
      'https://ais-dev-ve4vodrwyft6wk5fifoiyd-1000863043777.asia-east1.run.app';
}
