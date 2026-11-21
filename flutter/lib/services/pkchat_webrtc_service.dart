import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'pkchat_firebase_service.dart';

/// WebRTC call signaling and media manager using PK CHAT's Firestore `call_records` collection.
class PkChatWebRtcService {
  PkChatWebRtcService(this._firebaseService);

  final PkChatFirebaseService _firebaseService;

  RTCPeerConnection? _peerConnection;
  MediaStream? _localStream;
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _callDocSub;

  static const Map<String, dynamic> _iceServers = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
    ],
  };

  MediaStream? get localStream => _localStream;

  Future<MediaStream> openLocalMedia({required bool video}) async {
    _localStream ??= await navigator.mediaDevices.getUserMedia({
      'audio': {
        'echoCancellation': true,
        'noiseSuppression': true,
        'autoGainControl': true,
      },
      'video': video
          ? {'facingMode': 'user', 'width': 1280, 'height': 720}
          : false,
    });
    return _localStream!;
  }

  Future<String> startOutgoingCall({
    required String calleeUid,
    required String callerName,
    required String sourceLanguage,
    required String targetLanguage,
    required bool video,
    required void Function(MediaStream remoteStream) onRemoteStream,
    required void Function(RTCPeerConnectionState state) onConnectionState,
  }) async {
    final user = _firebaseService.auth.currentUser;
    if (user == null) {
      throw StateError('Sign in before placing a PK CHAT call.');
    }

    final pc = await _createPeerConnection(
      video: video,
      onRemoteStream: onRemoteStream,
      onConnectionState: onConnectionState,
    );

    final offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait briefly for ICE candidates to embed in SDP (matches PK CHAT web offerSdp exchange).
    await Future.delayed(const Duration(milliseconds: 900));
    final localDesc = await pc.getLocalDescription();
    final safeOfferSdp = (localDesc?.sdp ?? offer.sdp ?? '');

    final callId = 'call_${DateTime.now().millisecondsSinceEpoch}';
    final callRef = _firebaseService.db.collection('call_records').doc(callId);

    await callRef.set({
      'callId': callId,
      'callerId': user.uid,
      'callerName': callerName.trim().isEmpty ? 'PK CHAT Caller' : callerName.trim(),
      'participantIds': [user.uid, calleeUid],
      'callType': video ? 'video' : 'audio',
      'status': 'ringing',
      'sourceLanguage': sourceLanguage,
      'targetLanguage': targetLanguage,
      'durationSeconds': 0,
      'offerSdp': safeOfferSdp.length > 32000
          ? safeOfferSdp.substring(0, 32000)
          : safeOfferSdp,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });

    // Listen for callee's `answerSdp` and status transitions.
    _callDocSub?.cancel();
    _callDocSub = callRef.snapshots().listen((snap) async {
      final data = snap.data();
      if (data == null) return;
      final answerSdp = data['answerSdp'] as String?;
      if (answerSdp != null && answerSdp.isNotEmpty) {
        final currentRemote = await _peerConnection?.getRemoteDescription();
        if (currentRemote == null) {
          await _peerConnection?.setRemoteDescription(
            RTCSessionDescription(answerSdp, 'answer'),
          );
        }
      }
      final status = data['status'] as String?;
      if (status == 'ended' || status == 'missed') {
        await endCall(callId: callId, updateFirestore: false);
      }
    });

    return callId;
  }

  Future<void> answerIncomingCall({
    required String callId,
    required String offerSdp,
    required bool video,
    required void Function(MediaStream remoteStream) onRemoteStream,
    required void Function(RTCPeerConnectionState state) onConnectionState,
  }) async {
    final pc = await _createPeerConnection(
      video: video,
      onRemoteStream: onRemoteStream,
      onConnectionState: onConnectionState,
    );

    await pc.setRemoteDescription(RTCSessionDescription(offerSdp, 'offer'));
    final answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await Future.delayed(const Duration(milliseconds: 900));
    final localDesc = await pc.getLocalDescription();
    final safeAnswerSdp = (localDesc?.sdp ?? answer.sdp ?? '');

    // Strict allowlisted update keys enforced by `firestore.rules`.
    await _firebaseService.db.collection('call_records').doc(callId).update({
      'status': 'active',
      'answerSdp': safeAnswerSdp.length > 32000
          ? safeAnswerSdp.substring(0, 32000)
          : safeAnswerSdp,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> endCall({
    required String callId,
    int durationSeconds = 0,
    bool updateFirestore = true,
  }) async {
    await _callDocSub?.cancel();
    _callDocSub = null;

    if (updateFirestore && callId.isNotEmpty) {
      try {
        await _firebaseService.db.collection('call_records').doc(callId).update({
          'status': 'ended',
          'durationSeconds': durationSeconds.clamp(0, 86400),
          'updatedAt': FieldValue.serverTimestamp(),
        });
      } catch (_) {
        // Call may already be ended/terminal per `firestore.rules`.
      }
    }

    if (_localStream != null) {
      for (final track in _localStream!.getTracks()) {
        await track.stop();
      }
      await _localStream!.dispose();
      _localStream = null;
    }

    await _peerConnection?.close();
    _peerConnection = null;
  }

  Future<RTCPeerConnection> _createPeerConnection({
    required bool video,
    required void Function(MediaStream remoteStream) onRemoteStream,
    required void Function(RTCPeerConnectionState state) onConnectionState,
  }) async {
    final stream = await openLocalMedia(video: video);
    final pc = await createPeerConnection(_iceServers);
    _peerConnection = pc;

    for (final track in stream.getTracks()) {
      await pc.addTrack(track, stream);
    }

    pc.onTrack = (RTCTrackEvent event) {
      if (event.streams.isNotEmpty) {
        onRemoteStream(event.streams.first);
      }
    };

    pc.onConnectionState = onConnectionState;
    return pc;
  }
}
