import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:google_sign_in/google_sign_in.dart';
import 'package:local_auth/local_auth.dart';

class PKChatAuthService {
  PKChatAuthService._();
  static final PKChatAuthService instance = PKChatAuthService._();

  final FirebaseAuth _auth = FirebaseAuth.instance;
  final GoogleSignIn _googleSignIn = GoogleSignIn();
  final LocalAuthentication _localAuth = LocalAuthentication();

  // 1. Google Sign-In flow linked to Firebase (works on Web, Android, and iOS without SMS OTP)
  Future<User?> signInWithGoogle({void Function(String error)? onError}) async {
    try {
      if (kIsWeb) {
        final provider = GoogleAuthProvider()
          ..setCustomParameters({'prompt': 'select_account'});
        final userCredential = await _auth.signInWithPopup(provider);
        return userCredential.user;
      }

      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
      if (googleUser == null) return null; // Cancelled by user

      final GoogleSignInAuthentication googleAuth =
          await googleUser.authentication;
      final AuthCredential credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );

      final UserCredential userCredential =
          await _auth.signInWithCredential(credential);
      return userCredential.user;
    } on FirebaseAuthException catch (e) {
      onError?.call(e.message ?? 'Google Sign-In failed (${e.code}).');
      return null;
    } catch (e) {
      onError?.call('Google Sign-In failed: $e');
      return null;
    }
  }

  // 2. Face / Biometric Scan (Handled securely on-device)
  Future<bool> authenticateWithFace({void Function(String error)? onError}) async {
    if (kIsWeb) {
      onError?.call(
        'Native Face ID / Biometric sensor is available on Android & iOS builds. Use Google Sign-In or Phone OTP in Web.',
      );
      return false;
    }
    try {
      final bool canCheck = await _localAuth.canCheckBiometrics;
      final bool isSupported = await _localAuth.isDeviceSupported();
      if (!canCheck || !isSupported) {
        onError?.call('Face / Biometric authentication is not enrolled on this device.');
        return false;
      }

      return await _localAuth.authenticate(
        localizedReason: 'Scan your face to access your PK Chat profile',
        options: const AuthenticationOptions(
          biometricOnly: true, // Enforce Face ID/Fingerprint over PIN fallback
          stickyAuth: true,
        ),
      );
    } catch (e) {
      onError?.call('Biometric verification failed: $e');
      return false;
    }
  }

  // 3. Complete Sign-Out
  Future<void> signOut() async {
    await _auth.signOut();
    if (!kIsWeb) {
      try {
        await _googleSignIn.signOut();
      } catch (_) {
        // Ignore if user signed in via Phone OTP
      }
    }
  }
}
