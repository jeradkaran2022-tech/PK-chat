import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

/// PK CHAT Firebase constants & platform options.
///
/// NOTE: Web options match the live `pkchat-41ef3` Firebase project configuration.
/// Run `flutterfire configure --project=pkchat-41ef3` inside `pk_chat/` locally
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
          'Run `flutterfire configure --project=pkchat-41ef3` inside pk_chat/.',
        );
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyA9Wx4qC6NTxWC0tm2YElexthA4duoo8jo',
    appId: '1:970080253597:web:f648306a6c3825f2bcc674',
    messagingSenderId: '970080253597',
    projectId: 'pkchat-41ef3',
    authDomain: 'pkchat-41ef3.firebaseapp.com',
    storageBucket: 'pkchat-41ef3.firebasestorage.app',
  );
}
