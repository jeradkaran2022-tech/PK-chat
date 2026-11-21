import 'dart:convert';
import 'dart:typed_data';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import '../firebase_options.dart';
import 'pkchat_auth_service.dart';

class AuthService {
  AuthService({
    FirebaseAuth? auth,
    FirebaseFirestore? firestore,
  })  : auth = auth ?? FirebaseAuth.instance,
        _dbOverride = firestore;

  static final AuthService instance = AuthService();

  final FirebaseAuth auth;
  final FirebaseFirestore? _dbOverride;

  FirebaseFirestore get _db =>
      _dbOverride ??
      FirebaseFirestore.instanceFor(
        app: Firebase.app(),
        databaseId: DefaultFirebaseOptions.firestoreDatabaseId,
      );

  User? get currentUser => auth.currentUser;
  String? get currentUid => auth.currentUser?.uid;

  Stream<User?> get authChanges => auth.authStateChanges();
  Stream<User?> get authStateChanges => auth.authStateChanges();

  String requireUid() {
    final uid = auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      throw StateError('Please sign in with your Phone Number first.');
    }
    return uid;
  }

  Future<void> signOut() async {
    await PKChatAuthService.instance.signOut();
  }

  bool isAuthenticatedUser(User? user) {
    if (user == null) return false;
    return user.phoneNumber != null ||
        user.email != null ||
        user.isAnonymous ||
        user.providerData.isNotEmpty;
  }

  static String normalizePhone(String rawPhone) {
    final digits = rawPhone.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.length < 8 || digits.length > 15) {
      throw const FormatException(
        'Enter a valid phone number with country code (e.g. +94717868693).',
      );
    }
    return '+$digits';
  }

  static String hashPhoneE164(String phoneE164) {
    final bytes = utf8.encode('pkchat_phone_v1:${phoneE164.trim()}');
    const k = <int>[
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    final h = <int>[
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];

    int rotr(int x, int n) => ((x & 0xffffffff) >>> n) | ((x << (32 - n)) & 0xffffffff);

    final bitLen = bytes.length * 8;
    final paddedLen = ((bytes.length + 9 + 63) ~/ 64) * 64;
    final padded = Uint8List(paddedLen)..setRange(0, bytes.length, bytes);
    padded[bytes.length] = 0x80;
    final view = ByteData.view(padded.buffer);
    view.setUint32(paddedLen - 8, (bitLen ~/ 0x100000000) & 0xffffffff, Endian.big);
    view.setUint32(paddedLen - 4, bitLen & 0xffffffff, Endian.big);

    final w = List<int>.filled(64, 0);
    for (var offset = 0; offset < paddedLen; offset += 64) {
      for (var i = 0; i < 16; i++) {
        w[i] = view.getUint32(offset + i * 4, Endian.big);
      }
      for (var i = 16; i < 64; i++) {
        final s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        final s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) & 0xffffffff;
      }

      var a = h[0], b = h[1], c = h[2], d = h[3];
      var e = h[4], f = h[5], g = h[6], hh = h[7];
      for (var i = 0; i < 64; i++) {
        final s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        final ch = (e & f) ^ ((~e & 0xffffffff) & g);
        final temp1 = (hh + s1 + ch + k[i] + w[i]) & 0xffffffff;
        final s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        final maj = (a & b) ^ (a & c) ^ (b & c);
        final temp2 = (s0 + maj) & 0xffffffff;
        hh = g;
        g = f;
        f = e;
        e = (d + temp1) & 0xffffffff;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) & 0xffffffff;
      }
      h[0] = (h[0] + a) & 0xffffffff;
      h[1] = (h[1] + b) & 0xffffffff;
      h[2] = (h[2] + c) & 0xffffffff;
      h[3] = (h[3] + d) & 0xffffffff;
      h[4] = (h[4] + e) & 0xffffffff;
      h[5] = (h[5] + f) & 0xffffffff;
      h[6] = (h[6] + g) & 0xffffffff;
      h[7] = (h[7] + hh) & 0xffffffff;
    }
    return h.map((v) => v.toRadixString(16).padLeft(8, '0')).join();
  }

  /// Syncs a verified phone number into `users/{uid}` and `phone_directory/{phoneHash}`.
  Future<String> saveVerifiedPhoneNumber({
    required String phoneNumber,
    String country = 'Global',
    String countryDialCode = '+94',
    bool discoveryEnabled = true,
  }) async {
    final user = auth.currentUser;
    if (user == null) {
      throw StateError('Please sign in with Phone OTP first.');
    }

    final normalized = normalizePhone(phoneNumber);
    final newHash = hashPhoneE164(normalized);
    final userRef = _db.collection('users').doc(user.uid);
    final profileRef = _db.collection('user_profiles').doc(user.uid);
    final dirRef = _db.collection('phone_directory').doc(newHash);

    await _db.runTransaction((tx) async {
      final userSnap = await tx.get(userRef);
      final profileSnap = await tx.get(profileRef);
      final dirSnap = await tx.get(dirRef);

      final profileData = profileSnap.data();
      final resolvedName = ((profileData?['fullName'] as String?) ??
              user.displayName ??
              'PK Chat Member')
          .trim();
      final safeName = resolvedName.length > 100
          ? resolvedName.substring(0, 100)
          : (resolvedName.isEmpty ? 'PK Chat Member' : resolvedName);
      final resolvedCountry = (profileData?['country'] as String?) ?? country;
      final resolvedLang = (profileData?['preferredLanguage'] as String?) ?? 'en';
      final resolvedLangName =
          (profileData?['preferredLanguageName'] as String?) ?? 'English';

      if (!dirSnap.exists) {
        tx.set(dirRef, {
          'phoneHash': newHash,
          'userId': user.uid,
          'fullName': safeName,
          'country': resolvedCountry,
          'preferredLanguage': resolvedLang,
          'preferredLanguageName': resolvedLangName,
          'discoverable': discoveryEnabled,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      } else if (dirSnap.data()?['userId'] == user.uid) {
        tx.update(dirRef, {
          'fullName': safeName,
          'country': resolvedCountry,
          'preferredLanguage': resolvedLang,
          'preferredLanguageName': resolvedLangName,
          'discoverable': discoveryEnabled,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      }

      if (!userSnap.exists) {
        tx.set(userRef, {
          'uid': user.uid,
          'phoneNumber': normalized,
          'phoneDiscoveryEnabled': discoveryEnabled,
          'country': resolvedCountry,
          'countryDialCode': countryDialCode,
          'accountStatus': 'active',
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        });
      } else {
        tx.update(userRef, {
          'phoneNumber': normalized,
          'phoneDiscoveryEnabled': discoveryEnabled,
          'countryDialCode': countryDialCode,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      }
    });

    return normalized;
  }

  Stream<String?> watchSavedPhoneNumber(String uid) {
    return _db.collection('users').doc(uid).snapshots().map((snap) {
      final value = snap.data()?['phoneNumber'];
      return value is String && value.isNotEmpty ? value : null;
    });
  }
}
