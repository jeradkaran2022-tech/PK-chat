import 'package:flutter_test/flutter_test.dart';
import 'package:pk_chat/models/call_model.dart';

void main() {
  group('PKCall model', () {
    test('fromMap applies defaults and detects video calls', () {
      final call = PKCall.fromMap('call_123', <String, dynamic>{
        'callerId': 'user_a',
        'receiverId': 'user_b',
        'callerName': 'Karan',
        'receiverName': 'Priya',
        'callType': 'video',
        'status': 'ringing',
      });

      expect(call.id, 'call_123');
      expect(call.callId, 'call_123');
      expect(call.callerId, 'user_a');
      expect(call.receiverId, 'user_b');
      expect(call.callerName, 'Karan');
      expect(call.receiverName, 'Priya');
      expect(call.isVideo, isTrue);
      expect(call.isTerminal, isFalse);
      expect(call.isExpired, isFalse);
    });

    test('terminal and expiry states behave accurately', () {
      final ended = PKCall.fromMap('call_ended', <String, dynamic>{
        'callerId': 'u1',
        'receiverId': 'u2',
        'status': 'ended',
        'expiresAt': DateTime.now()
            .toUtc()
            .subtract(const Duration(minutes: 1))
            .toIso8601String(),
      });

      expect(ended.isTerminal, isTrue);
      expect(ended.isExpired, isTrue);
      expect(ended.isVideo, isFalse);
    });
  });
}
