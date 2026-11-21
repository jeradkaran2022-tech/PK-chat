import 'package:cloud_firestore/cloud_firestore.dart';

enum PkCallType { audio, video }

enum PkCallStatus { ringing, accepted, rejected, ended }

class PKCall {
  final String id;
  final String callerId;
  final String receiverId;
  final String callerName;
  final String receiverName;
  final String callType;
  final String status;
  final String? expiresAt;
  final Timestamp? createdAt;
  final Timestamp? updatedAt;
  final Timestamp? endedAt;
  final String? offerSdp;
  final String? answerSdp;

  PKCall({
    required this.id,
    required this.callerId,
    required this.receiverId,
    required this.callerName,
    this.receiverName = 'PK CHAT User',
    required this.callType,
    required this.status,
    this.expiresAt,
    this.createdAt,
    this.updatedAt,
    this.endedAt,
    this.offerSdp,
    this.answerSdp,
  });

  String get callId => id;
  bool get isVideo => callType == 'video';
  bool get isTerminal => status == 'rejected' || status == 'ended';

  bool get isExpired {
    final raw = expiresAt;
    if (raw == null || raw.isEmpty) return false;
    final parsed = DateTime.tryParse(raw);
    if (parsed == null) return false;
    return DateTime.now().toUtc().isAfter(parsed.toUtc());
  }

  factory PKCall.fromMap(String id, Map<String, dynamic> data) {
    return PKCall(
      id: id,
      callerId: (data['callerId'] ?? '').toString(),
      receiverId: (data['receiverId'] ?? '').toString(),
      callerName: (data['callerName'] ?? 'PK CHAT').toString(),
      receiverName: (data['receiverName'] ?? 'PK CHAT User').toString(),
      callType: (data['callType'] ?? 'audio').toString(),
      status: (data['status'] ?? 'ringing').toString(),
      expiresAt: data['expiresAt']?.toString(),
      createdAt: data['createdAt'] as Timestamp?,
      updatedAt: data['updatedAt'] as Timestamp?,
      endedAt: data['endedAt'] as Timestamp?,
      offerSdp: data['offerSdp'] as String?,
      answerSdp: data['answerSdp'] as String?,
    );
  }

  factory PKCall.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    return PKCall.fromMap(
      doc.id,
      doc.data() ?? const <String, dynamic>{},
    );
  }
}

typedef CallModel = PKCall;
