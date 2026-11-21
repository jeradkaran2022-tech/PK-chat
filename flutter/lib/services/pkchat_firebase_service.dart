import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import '../config/pkchat_firebase_config.dart';

/// Top-level background FCM handler required by `firebase_messaging: ^16.0.0`.
@pragma('vm:entry-point')
Future<void> pkChatFirebaseMessagingBackgroundHandler(RemoteMessage message) async {
  if (Firebase.apps.isEmpty) {
    await Firebase.initializeApp();
  }
}

enum PkChatReadReceiptState {
  /// Message delivered / unread by recipient -> Render Two Blue Ticks.
  unreadTwoBlueTicks,

  /// Recipient UID present in `readBy` -> Render Round Blue Tick.
  seenRoundBlueTick,
}

class PkChatFirebaseService {
  PkChatFirebaseService._();
  static final PkChatFirebaseService instance = PkChatFirebaseService._();

  late final FirebaseFirestore db;
  final FirebaseAuth auth = FirebaseAuth.instance;
  final FirebaseMessaging messaging = FirebaseMessaging.instance;

  bool _initialized = false;

  Future<void> initialize({FirebaseOptions? options}) async {
    if (_initialized) return;

    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(options: options);
    }

    // Bind explicitly to PK CHAT's named Firestore database.
    db = FirebaseFirestore.instanceFor(
      app: Firebase.app(),
      databaseId: PkChatFirebaseConfig.firestoreDatabaseId,
    );

    FirebaseMessaging.onBackgroundMessage(
      pkChatFirebaseMessagingBackgroundHandler,
    );

    await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    _initialized = true;
  }

  /// Watches global security posture (`NORMAL` / `LOCKDOWN` / `RECOVERING`).
  Stream<Map<String, dynamic>> watchSecurityStatus() {
    return db
        .collection('system_security')
        .doc('global')
        .snapshots()
        .map((snap) => snap.data() ?? const {'status': 'NORMAL'});
  }

  /// Watches incoming & ongoing messages for a chat, ordered chronologically.
  Stream<QuerySnapshot<Map<String, dynamic>>> watchChatMessages(String chatId) {
    return db
        .collection('messages')
        .where('chatId', isEqualTo: chatId)
        .orderBy('createdAt', descending: false)
        .limitToLast(100)
        .snapshots();
  }

  /// Watches current user's synced `profile_media/{uid}` record across devices.
  Stream<DocumentSnapshot<Map<String, dynamic>>> watchMyProfileMedia(String uid) {
    return db.collection('profile_media').doc(uid).snapshots();
  }

  /// Sends a text message compliant with `firestore.rules` (`isValidMessage`).
  Future<void> sendMessage({
    required String chatId,
    required String chatType, // 'direct' | 'group'
    required List<String> participantIds,
    required String senderName,
    required String senderLanguage,
    required String text,
  }) async {
    final user = auth.currentUser;
    if (user == null) {
      throw StateError('Authenticated Firebase user is required to send messages.');
    }

    final messageId =
        'msg_${DateTime.now().millisecondsSinceEpoch}_${user.uid.substring(0, user.uid.length.clamp(0, 6))}';

    await db.collection('messages').doc(messageId).set({
      'messageId': messageId,
      'chatId': chatId,
      'chatType': chatType,
      'participantIds': participantIds,
      'senderId': user.uid,
      'senderName': senderName.trim().isEmpty ? 'PK CHAT User' : senderName.trim(),
      'senderLanguage': senderLanguage,
      'messageType': 'text',
      'originalText': text,
      'e2eeEnabled': true,
      'deleted': false,
      'deliveredTo': [user.uid],
      'readBy': [user.uid],
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  /// Marks an incoming message as read (`affectedKeys().hasOnly(['deliveredTo', 'readBy', 'updatedAt'])`).
  Future<void> markMessageAsRead({
    required String messageId,
    required List<String> existingDeliveredTo,
    required List<String> existingReadBy,
  }) async {
    final uid = auth.currentUser?.uid;
    if (uid == null || existingReadBy.contains(uid)) return;

    final nextDelivered = {...existingDeliveredTo, uid}.take(50).toList();
    final nextReadBy = {...existingReadBy, uid}.take(50).toList();

    await db.collection('messages').doc(messageId).update({
      'deliveredTo': nextDelivered,
      'readBy': nextReadBy,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  /// Resolves PK CHAT custom tick rule:
  /// - Viewed by at least one recipient != senderId -> Round Blue Tick
  /// - Not yet viewed by recipient -> Two Blue Ticks
  PkChatReadReceiptState getOutgoingTickState({
    required String senderId,
    required List<dynamic>? readBy,
  }) {
    final seenByRecipient = (readBy ?? const [])
        .whereType<String>()
        .any((id) => id != senderId);
    return seenByRecipient
        ? PkChatReadReceiptState.seenRoundBlueTick
        : PkChatReadReceiptState.unreadTwoBlueTicks;
  }

  /// Obtains the device's Firebase Cloud Messaging token and listens for refreshes.
  Future<String?> registerFcmToken({
    required void Function(RemoteMessage message) onForegroundMessage,
  }) async {
    FirebaseMessaging.onMessage.listen(onForegroundMessage);
    return messaging.getToken();
  }
}
