import 'dart:async';
import 'package:flutter_callkit_incoming/entities/entities.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:permission_handler/permission_handler.dart';
import 'pkchat_calling.dart';

class PkChatPermissionResult {
  const PkChatPermissionResult({
    required this.granted,
    required this.permanentlyDenied,
    this.missing = const [],
  });

  final bool granted;
  final bool permanentlyDenied;
  final List<String> missing;
}

/// Requests runtime camera, microphone, and notification permissions via `permission_handler`.
class PkChatPermissionService {
  PkChatPermissionService._();
  static final PkChatPermissionService instance = PkChatPermissionService._();

  Future<PkChatPermissionResult> requestCallPermissions({
    required bool isVideo,
  }) async {
    final permissions = <Permission>[
      Permission.microphone,
      Permission.notification,
      if (isVideo) Permission.camera,
    ];

    final statuses = await permissions.request();
    final missing = <String>[];
    var permanentlyDenied = false;

    for (final entry in statuses.entries) {
      if (!entry.value.isGranted) {
        missing.add(entry.key.toString());
        if (entry.value.isPermanentlyDenied) {
          permanentlyDenied = true;
        }
      }
    }

    return PkChatPermissionResult(
      granted: missing.isEmpty,
      permanentlyDenied: permanentlyDenied,
      missing: missing,
    );
  }

  Future<bool> openSystemAppSettings() => openAppSettings();
}

/// Bridges native Android ConnectionService / iOS CallKit (`flutter_callkit_incoming`)
/// with PK CHAT's Firestore `/calls/{callId}` state machine (`PKChatCalling`).
class PkChatCallKitService {
  PkChatCallKitService(this._calling);

  final PKChatCalling _calling;
  StreamSubscription<CallEvent?>? _eventSub;

  /// Displays native OS incoming call screen using CallKit / Android Full-Screen Intent.
  Future<void> showIncomingCallUi({
    required String callId,
    required String callerName,
    required String callerHandle,
    required String callType, // 'audio' | 'video'
  }) async {
    final isVideo = callType == 'video';
    final params = CallKitParams(
      id: callId,
      nameCaller: callerName.isEmpty ? 'PK CHAT Caller' : callerName,
      appName: 'PK CHAT',
      handle: callerHandle,
      type: isVideo ? 1 : 0,
      duration: 45000, // Matches PKChatCalling 45s TTL
      textAccept: 'Accept',
      textDecline: 'Decline',
      missedCallNotification: const NotificationParams(
        showNotification: true,
        isShowCallback: true,
        subtitle: 'Missed PK CHAT Call',
        callbackText: 'Call Back',
      ),
      extra: <String, dynamic>{
        'callId': callId,
        'callType': callType,
      },
      android: const AndroidParams(
        isCustomNotification: true,
        isShowLogo: false,
        ringtonePath: 'system_ringtone_default',
        backgroundColor: '#075E54',
        actionColor: '#25D366',
        textColor: '#FFFFFF',
        incomingCallNotificationChannelName: 'PK CHAT Incoming Calls',
        missedCallNotificationChannelName: 'PK CHAT Missed Calls',
      ),
      ios: const IOSParams(
        iconName: 'CallKitLogo',
        handleType: 'generic',
        supportsVideo: true,
        maximumCallGroups: 1,
        maximumCallsPerCallGroup: 1,
        audioSessionMode: 'voiceChat',
        audioSessionActive: true,
        configureAudioSession: true,
      ),
    );

    await FlutterCallkitIncoming.showCallkitIncoming(params);
  }

  /// Listens for native Accept / Decline / End / Timeout actions and syncs Firestore `/calls/{callId}`.
  void bindCallKitEvents({
    required void Function(String callId, String callType) onCallAccepted,
    required void Function(String callId) onCallEnded,
  }) {
    _eventSub?.cancel();
    _eventSub = FlutterCallkitIncoming.onEvent.listen((CallEvent? event) async {
      if (event == null) return;
      final body = event.body as Map<dynamic, dynamic>?;
      final extra = body?['extra'] as Map<dynamic, dynamic>?;
      final callId = (extra?['callId'] ?? body?['id'] ?? '').toString();
      final callType = (extra?['callType'] ?? 'audio').toString();
      if (callId.isEmpty) return;

      switch (event.event) {
        case Event.actionCallAccept:
          final perm = await PkChatPermissionService.instance
              .requestCallPermissions(isVideo: callType == 'video');
          if (!perm.granted) {
            await _calling.rejectCall(callId);
            await FlutterCallkitIncoming.endCall(callId);
            onCallEnded(callId);
            return;
          }
          await _calling.answerCall(callId);
          onCallAccepted(callId, callType);
          break;
        case Event.actionCallDecline:
          await _calling.rejectCall(callId);
          await FlutterCallkitIncoming.endCall(callId);
          onCallEnded(callId);
          break;
        case Event.actionCallEnded:
        case Event.actionCallTimeout:
          await _calling.endCall(callId);
          await FlutterCallkitIncoming.endCall(callId);
          onCallEnded(callId);
          break;
        default:
          break;
      }
    });
  }

  Future<void> endCallKitUi(String callId) async {
    await FlutterCallkitIncoming.endCall(callId);
  }

  Future<void> dispose() async {
    await _eventSub?.cancel();
    _eventSub = null;
  }
}
