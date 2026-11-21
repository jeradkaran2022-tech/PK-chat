import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import '../config/pkchat_firebase_config.dart';

/// Hardened 1-to-1 calling service wired to PK CHAT's named Firestore database
/// (`ai-studio-6dbe0703-e82e-426f-99e4-cc1723ffa450`) and `firestore.rules`.
class PKChatCalling {
  PKChatCalling({
    FirebaseFirestore? firestore,
    FirebaseAuth? auth,
  })  : _dbOverride = firestore,
        _auth = auth ?? FirebaseAuth.instance;

  final FirebaseFirestore? _dbOverride;
  final FirebaseAuth _auth;

  /// Always target PK CHAT's named Firestore database instead of `(default)`.
  FirebaseFirestore get db =>
      _dbOverride ??
      FirebaseFirestore.instanceFor(
        app: Firebase.app(),
        databaseId: PkChatFirebaseConfig.firestoreDatabaseId,
      );

  /// Starts an outgoing call (`status: 'ringing'`) with a 45-second expiry.
  /// Enforces authenticated `callerId` matching `FirebaseAuth.currentUser.uid`.
  Future<String> startCall({
    String? callerId,
    required String receiverId,
    required String callType, // 'audio' | 'video'
  }) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      throw StateError('User must be signed in with Firebase Auth before calling.');
    }
    if (callerId != null && callerId != uid) {
      throw ArgumentError('callerId must match authenticated Firebase UID.');
    }
    if (receiverId.trim().isEmpty || receiverId.trim() == uid) {
      throw ArgumentError('Valid distinct receiverId is required.');
    }
    final normalizedType = callType == 'video' ? 'video' : 'audio';

    final call = await db.collection('calls').add({
      'callerId': uid,
      'receiverId': receiverId.trim(),
      'callType': normalizedType,
      'status': 'ringing',
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
      'expiresAt': DateTime.now()
          .add(const Duration(seconds: 45))
          .toUtc()
          .toIso8601String(),
    });

    return call.id;
  }

  /// Receiver answers a ringing call (`ringing` -> `accepted`).
  Future<void> answerCall(String callId) async {
    await db.collection('calls').doc(callId).update({
      'status': 'accepted',
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  /// Receiver declines a ringing call (`ringing` -> `rejected`).
  Future<void> rejectCall(String callId) async {
    await db.collection('calls').doc(callId).update({
      'status': 'rejected',
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  /// Caller or receiver ends an active/ringing call (`ended`).
  Future<void> endCall(String callId) async {
    await db.collection('calls').doc(callId).update({
      'status': 'ended',
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  /// Streams incoming ringing calls addressed to the currently signed-in user.
  Stream<QuerySnapshot<Map<String, dynamic>>> watchIncomingCalls() {
    final uid = _auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      return const Stream.empty();
    }
    return db
        .collection('calls')
        .where('receiverId', isEqualTo: uid)
        .where('status', isEqualTo: 'ringing')
        .snapshots();
  }

  /// Streams live status updates for a specific call document.
  Stream<DocumentSnapshot<Map<String, dynamic>>> watchCall(String callId) {
    return db.collection('calls').doc(callId).snapshots();
  }
}
