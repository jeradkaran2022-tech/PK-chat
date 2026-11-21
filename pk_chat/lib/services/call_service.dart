import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import '../firebase_options.dart';
import '../models/call_model.dart';

/// Call signaling and security-aware Firestore service bound to PK CHAT's
/// named Firestore database (`ai-studio-6dbe0703-e82e-426f-99e4-cc1723ffa450`).
class CallService {
  CallService({
    FirebaseFirestore? firestore,
    FirebaseAuth? auth,
  })  : _dbOverride = firestore,
        _auth = auth ?? FirebaseAuth.instance;

  static final CallService instance = CallService();

  final FirebaseFirestore? _dbOverride;
  final FirebaseAuth _auth;

  FirebaseFirestore get db =>
      _dbOverride ??
      FirebaseFirestore.instanceFor(
        app: Firebase.app(),
        databaseId: DefaultFirebaseOptions.firestoreDatabaseId,
      );

  /// Starts a call invite in `/calls/{callId}` compliant with deployed `firestore.rules`.
  Future<String> startCall({
    required String receiverId,
    String receiverName = 'PK CHAT User',
    required Object callType,
    String? callerName,
  }) async {
    try {
      final currentUser = _auth.currentUser;

      if (currentUser == null) {
        throw Exception('Please login to PK CHAT');
      }

      final cleanReceiver = receiverId.trim();
      if (cleanReceiver.isEmpty ||
          cleanReceiver == 'TEST_USER_ID' ||
          cleanReceiver == currentUser.uid) {
        throw Exception('Please select a valid user');
      }

      final String normalizedType;
      if (callType is PkCallType) {
        normalizedType = callType == PkCallType.video ? 'video' : 'audio';
      } else if (callType is String &&
          (callType == 'audio' || callType == 'video')) {
        normalizedType = callType;
      } else {
        throw Exception('Invalid call type');
      }

      final rawCaller =
          (callerName ?? currentUser.displayName ?? 'PK CHAT User').trim();
      final safeCallerName = rawCaller.isEmpty
          ? 'PK CHAT User'
          : rawCaller.substring(0, rawCaller.length.clamp(0, 100));

      final rawReceiver = receiverName.trim();
      final safeReceiverName = rawReceiver.isEmpty
          ? 'PK CHAT User'
          : rawReceiver.substring(0, rawReceiver.length.clamp(0, 100));

      final callRef = db.collection('calls').doc();

      await callRef.set({
        'callId': callRef.id,
        'callerId': currentUser.uid,
        'callerName': safeCallerName,
        'receiverId': cleanReceiver,
        'receiverName': safeReceiverName,
        'callType': normalizedType,
        'status': 'ringing',
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
        'expiresAt': DateTime.now()
            .add(const Duration(seconds: 45))
            .toUtc()
            .toIso8601String(),
        'endedAt': null,
      });

      return callRef.id;
    } catch (e) {
      throw Exception('Call failed: $e');
    }
  }

  /// Receiver accepts a ringing call (`ringing -> accepted`).
  Future<void> answerCall(String callId) async {
    await db.collection('calls').doc(callId).update({
      'status': 'accepted',
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  /// Receiver rejects a ringing call (`ringing -> rejected`).
  Future<void> rejectCall(String callId) async {
    await db.collection('calls').doc(callId).update({
      'status': 'rejected',
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  /// Either participant ends a call (`ended`). Terminal updates ignore repeats cleanly.
  Future<void> endCall(String callId) async {
    try {
      await db.collection('calls').doc(callId).update({
        'status': 'ended',
        'endedAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (_) {
      // Already rejected or ended per Firestore terminal state lock.
    }
  }

  /// Raw QuerySnapshot stream matching the authenticated user's ringing calls.
  Stream<QuerySnapshot<Map<String, dynamic>>> getIncomingCalls() {
    final user = _auth.currentUser;

    if (user == null) {
      throw Exception('User not logged in');
    }

    return db
        .collection('calls')
        .where('receiverId', isEqualTo: user.uid)
        .where('status', isEqualTo: 'ringing')
        .snapshots();
  }

  /// Streams active incoming ringing calls addressed to [uid].
  Stream<List<CallModel>> watchIncomingCalls(String uid) {
    if (uid.isEmpty) return const Stream.empty();
    return db
        .collection('calls')
        .where('receiverId', isEqualTo: uid)
        .where('status', isEqualTo: 'ringing')
        .snapshots()
        .map(
          (snap) => snap.docs
              .map(CallModel.fromFirestore)
              .where((call) => !call.isExpired)
              .toList(),
        );
  }

  /// Streams a single call document for live state transitions.
  Stream<CallModel?> watchCall(String callId) {
    return db
        .collection('calls')
        .doc(callId)
        .snapshots()
        .map((doc) => doc.exists ? CallModel.fromFirestore(doc) : null);
  }

  /// Streams global security posture (`NORMAL`, `LOCKDOWN`, `RECOVERING`).
  Stream<String> watchGlobalSecurityStatus() {
    return db
        .collection('system_security')
        .doc('global')
        .snapshots()
        .map((doc) => (doc.data()?['status'] ?? 'NORMAL').toString());
  }
}
