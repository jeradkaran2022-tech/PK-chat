import 'dart:async';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;
import 'package:flutter/material.dart';
import 'package:flutter_callkit_incoming/entities/android_params.dart';
import 'package:flutter_callkit_incoming/entities/call_event.dart';
import 'package:flutter_callkit_incoming/entities/call_kit_params.dart';
import 'package:flutter_callkit_incoming/entities/ios_params.dart';
import 'package:flutter_callkit_incoming/entities/notification_params.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:permission_handler/permission_handler.dart';
import '../models/call_model.dart';
import '../screens/video_call_screen.dart';
import 'auth_service.dart';
import 'call_service.dart';
import 'webrtc_service.dart';

class NotificationService {
  NotificationService(this._callService);

  static final NotificationService instance =
      NotificationService(CallService.instance);

  static final GlobalKey<NavigatorState> navigatorKey =
      GlobalKey<NavigatorState>();

  final CallService _callService;
  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  StreamSubscription<CallEvent?>? _callKitSub;
  StreamSubscription<RemoteMessage>? _fcmSub;
  String? fcmToken;
  bool _initialized = false;

  static bool get _supportsCallKit =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  /// Static initializer called directly from `main.dart`.
  static Future<void> initialize() => instance.initializeInstance();

  /// Background isolate entrypoint invoked from `firebaseBackgroundHandler`.
  static Future<void> handleBackground(RemoteMessage message) async {
    if (message.data['type'] == 'incoming_call') {
      await showCall(message.data);
    }
  }

  static Future<void> showCall(Map<String, dynamic> data) async {
    if (!_supportsCallKit) return;
    final callId = (data['callId'] ?? '').toString();
    if (callId.isEmpty) return;

    final callerName = (data['callerName'] ?? 'PK CHAT').toString();
    final callerHandle = (data['callerName'] ?? 'PK CHAT User').toString();

    final params = CallKitParams(
      id: callId,
      nameCaller: callerName,
      appName: 'PK CHAT',
      handle: callerHandle,
      type: data['callType'] == 'video' ? 1 : 0,
      duration: 45000,
      textAccept: 'Answer',
      textDecline: 'Decline',
      missedCallNotification: const NotificationParams(
        showNotification: true,
        isShowCallback: true,
        subtitle: 'Missed PK CHAT Call',
        callbackText: 'Call Back',
      ),
      android: const AndroidParams(
        isCustomNotification: false,
        isShowLogo: true,
        ringtonePath: 'system_ringtone_default',
        backgroundColor: '#102F45',
        actionColor: '#08A88A',
        textColor: '#FFFFFF',
        incomingCallNotificationChannelName: 'PK CHAT Calls',
        missedCallNotificationChannelName: 'PK CHAT Missed Calls',
      ),
      ios: const IOSParams(
        supportsVideo: true,
        audioSessionActive: true,
        supportsHolding: false,
        supportsDTMF: false,
        supportsGrouping: false,
        supportsUngrouping: false,
      ),
      extra: data,
    );

    await FlutterCallkitIncoming.showCallkitIncoming(params);
  }

  Future<void> initializeInstance({
    void Function(String callId, PkCallType callType)? onAccepted,
    void Function(String callId)? onEnded,
  }) async {
    if (_initialized) return;
    _initialized = true;

    try {
      await _messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      fcmToken = await _messaging.getToken();
    } catch (_) {
      // Ignore if running on unsupported desktop/web environment without VAPID/APNs.
    }

    await _fcmSub?.cancel();
    _fcmSub = FirebaseMessaging.onMessage.listen((RemoteMessage message) async {
      if (message.data['type'] == 'incoming_call') {
        await showCall(message.data);
      }
    });

    if (!_supportsCallKit) return;

    await _callKitSub?.cancel();
    _callKitSub = FlutterCallkitIncoming.onEvent.listen((CallEvent? event) async {
      if (event == null) return;
      final body = event.body as Map<dynamic, dynamic>?;
      final extra = body?['extra'] as Map<dynamic, dynamic>?;
      final callId = (extra?['callId'] ?? body?['id'] ?? '').toString();
      final isVideo = extra?['callType'] == 'video';
      final callType = isVideo ? PkCallType.video : PkCallType.audio;
      if (callId.isEmpty) return;

      switch (event.event) {
        case Event.actionCallAccept:
          final granted = await ensureCallPermissions(isVideo: isVideo);
          if (!granted) {
            await _callService.rejectCall(callId);
            await FlutterCallkitIncoming.endCall(callId);
            onEnded?.call(callId);
            return;
          }
          await _callService.answerCall(callId);
          if (onAccepted != null) {
            onAccepted(callId, callType);
          } else {
            final uid = AuthService.instance.currentUid ?? '';
            final callSnap =
                await _callService.db.collection('calls').doc(callId).get();
            final callerId = (callSnap.data()?['callerId'] ?? '').toString();
            navigatorKey.currentState?.push(
              MaterialPageRoute<void>(
                builder: (_) => VideoCallScreen(
                  callId: callId,
                  callerId: callerId,
                  receiverId: uid,
                  isCaller: false,
                  isVideo: isVideo,
                  callService: _callService,
                  webRtcService: WebRTCService.instance,
                ),
              ),
            );
          }
          break;
        case Event.actionCallDecline:
          await _callService.rejectCall(callId);
          await FlutterCallkitIncoming.endCall(callId);
          onEnded?.call(callId);
          break;
        case Event.actionCallEnded:
        case Event.actionCallTimeout:
          await _callService.endCall(callId);
          await FlutterCallkitIncoming.endCall(callId);
          await WebRTCService.instance.dispose();
          onEnded?.call(callId);
          break;
        default:
          break;
      }
    });
  }

  Future<bool> ensureCallPermissions({required bool isVideo}) async {
    if (!_supportsCallKit) {
      return true;
    }
    final perms = <Permission>[
      Permission.microphone,
      Permission.notification,
      if (isVideo) Permission.camera,
    ];
    final results = await perms.request();
    return results.values.every((status) => status.isGranted);
  }

  Future<String?> getFcmToken() async {
    fcmToken = await _messaging.getToken();
    return fcmToken;
  }

  static Future<void> showNativeIncomingCall({
    required String callId,
    required String callerName,
    required String callerHandle,
    required PkCallType callType,
  }) async {
    await showCall(<String, dynamic>{
      'type': 'incoming_call',
      'callId': callId,
      'callerName': callerName,
      'callerId': callerHandle,
      'callType': callType == PkCallType.video ? 'video' : 'audio',
    });
  }

  Future<void> dismissCallKit(String callId) async {
    if (!_supportsCallKit) return;
    await FlutterCallkitIncoming.endCall(callId);
  }

  Future<void> dispose() async {
    await _callKitSub?.cancel();
    await _fcmSub?.cancel();
  }
}
