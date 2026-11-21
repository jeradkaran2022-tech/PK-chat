import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

/// PK CHAT Firebase constants & platform options.
///
/// NOTE: Web options match the live `pk-chhat` Firebase project configuration.
/// Run `flutterfire configure --project=pk-chhat` inside `pk_chat/` locally
/// to populate native `android` and `ios` FirebaseOptions (`google-services.json`
/// and `GoogleService-Info.plist`).
class DefaultFirebaseOptions {
  static const String firestoreDatabaseId =
      'ai-studio-6dbe0703-e82e-426f-99e4-cc1723ffa450';

  static const String backendBaseUrl =
      'https://ais-dev-ve4vodrwyft6wk5fifoiyd-1000863043777.asia-east1.run.app';

  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
      case TargetPlatform.iOS:
      case TargetPlatform.macOS:
      case TargetPlatform.windows:
      case TargetPlatform.linux:
        throw UnsupportedError(
          'Native FirebaseOptions for $defaultTargetPlatform have not been generated yet. '
          'Run `flutterfire configure --project=pk-chhat` inside pk_chat/.',
        );
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyAkxdST7h1aLJL9osjRAEtCxc1LtzH-z5k',
    appId: '1:368881984581:web:aa4bfa3115b5902cfeef2c',
    messagingSenderId: '368881984581',
    projectId: 'pk-chhat',
    authDomain: 'pk-chhat.firebaseapp.com',
    storageBucket: 'pk-chhat.firebasestorage.app',
  );
}
