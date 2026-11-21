import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart' show kIsWeb;

// 1. Service Layer with Proper Exception Handling & Web Preview Test Bypass
class PhoneAuthService {
  static final FirebaseAuth _auth = FirebaseAuth.instance;
  static int? _resendToken;

  static const String webPreviewTestPhone = '+94717868693';
  static const String webPreviewTestOtp = '123456';

  static String normalizePhone(String rawPhone, {String defaultDialCode = '+94'}) {
    final trimmed = rawPhone.trim();
    if (trimmed.isEmpty) return '';
    if (trimmed.startsWith('+')) {
      final digits = trimmed.replaceAll(RegExp(r'\D'), '');
      return digits.isEmpty ? '' : '+$digits';
    }
    final localDigits =
        trimmed.replaceAll(RegExp(r'\D'), '').replaceFirst(RegExp(r'^0+'), '');
    if (localDigits.isEmpty) return '';
    return '$defaultDialCode$localDigits';
  }

  static bool isWebPreviewTestPhone(String phone) {
    return kIsWeb && normalizePhone(phone) == webPreviewTestPhone;
  }

  static String mapFirebaseError(FirebaseAuthException e) {
    switch (e.code) {
      case 'invalid-phone-number':
        return 'The provided phone number is not valid. Use E.164 format (e.g., +94717868693).';
      case 'billing-not-enabled':
        return 'Firebase Blaze billing is required for real SMS, or add a test number in Firebase Console.';
      case 'quota-exceeded':
      case 'too-many-requests':
        return 'SMS quota exceeded or too many attempts. Please try again later.';
      case 'operation-not-allowed':
        return 'Phone Auth is disabled in Firebase Console (enable Authentication -> Sign-in method -> Phone) or SMS region is blocked.';
      case 'web-context-cancelled':
      case 'captcha-check-failed':
      case 'missing-client-identifier':
        return 'reCAPTCHA verification failed or was cancelled. Please stay on this screen and try again.';
      case 'app-not-authorized':
        return 'Add your app SHA-1/SHA-256 fingerprint or domain in Firebase Console.';
      case 'network-request-failed':
        return 'Network error while connecting to Firebase. Check your internet connection.';
      case 'invalid-verification-code':
        return 'Invalid verification code. Please check the 6-digit SMS code.';
      case 'session-expired':
      case 'code-expired':
        return 'OTP session expired. Request a new verification code.';
      default:
        return e.message ?? 'Verification failed. Try again.';
    }
  }

  static Future<void> verifyPhone({
    required String phone,
    required Function(String verId) onCodeSent,
    required Function(String error) onFailed,
    void Function()? onAutoVerified,
    bool isResend = false,
  }) async {
    final normalized = normalizePhone(phone);
    final digitsCount = normalized.replaceAll(RegExp(r'\D'), '').length;
    if (digitsCount < 8 || digitsCount > 15) {
      onFailed('Enter a valid phone number with country code (e.g., +94717868693).');
      return;
    }

    // Web preview test mode bypass for +94717868693
    if (isWebPreviewTestPhone(normalized)) {
      onCodeSent('web_preview_test_bypass');
      return;
    }

    try {
      await _auth.verifyPhoneNumber(
        phoneNumber: normalized,
        timeout: const Duration(seconds: 60),
        forceResendingToken: isResend ? _resendToken : null,
        verificationCompleted: (PhoneAuthCredential cred) async {
          try {
            // Automatic SMS code resolution on Android
            await _auth.signInWithCredential(cred);
            onAutoVerified?.call();
          } on FirebaseAuthException catch (e) {
            onFailed(mapFirebaseError(e));
          } catch (e) {
            onFailed(e.toString());
          }
        },
        verificationFailed: (FirebaseAuthException e) {
          onFailed(mapFirebaseError(e));
        },
        codeSent: (String verId, int? resendToken) {
          _resendToken = resendToken;
          onCodeSent(verId);
        },
        codeAutoRetrievalTimeout: (String verId) {},
      );
    } on FirebaseAuthException catch (e) {
      onFailed(mapFirebaseError(e));
    } catch (e) {
      onFailed(e.toString());
    }
  }

  static Future<UserCredential?> verifyOtp({
    required String verificationId,
    required String smsCode,
    required Function(String error) onFailed,
  }) async {
    final code = smsCode.replaceAll(RegExp(r'\D'), '').trim();
    if (code.length != 6) {
      onFailed('Please enter the 6-digit verification code.');
      return null;
    }

    if (verificationId == 'web_preview_test_bypass') {
      if (code != webPreviewTestOtp) {
        onFailed('Invalid test verification code. Use $webPreviewTestOtp.');
        return null;
      }
      try {
        if (_auth.currentUser == null) {
          return await _auth.signInAnonymously();
        }
        return null;
      } on FirebaseAuthException catch (e) {
        onFailed(mapFirebaseError(e));
        return null;
      } catch (e) {
        onFailed(e.toString());
        return null;
      }
    }

    try {
      final credential = PhoneAuthProvider.credential(
        verificationId: verificationId,
        smsCode: code,
      );
      return await _auth.signInWithCredential(credential);
    } on FirebaseAuthException catch (e) {
      onFailed(mapFirebaseError(e));
      return null;
    } catch (_) {
      onFailed('Invalid verification code.');
      return null;
    }
  }
}
