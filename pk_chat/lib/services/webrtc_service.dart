import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'call_service.dart';

class WebRTCService {
  WebRTCService([CallService? callService])
      : _callService = callService ?? CallService.instance;

  static final WebRTCService instance = WebRTCService(CallService.instance);

  final CallService _callService;

  RTCPeerConnection? peerConnection;
  MediaStream? localStream;

  final RTCVideoRenderer localRenderer = RTCVideoRenderer();
  final RTCVideoRenderer remoteRenderer = RTCVideoRenderer();

  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _signalingSub;

  bool _renderersInitialized = false;
  bool isMuted = false;
  bool isCameraEnabled = true;
  bool isSpeakerOn = true;

  static const Map<String, dynamic> _configuration = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
    ],
  };

  Future<void> initRenderers() async {
    if (_renderersInitialized) return;
    await localRenderer.initialize();
    await remoteRenderer.initialize();
    _renderersInitialized = true;
  }

  Future<void> initialize({
    required bool video,
  }) async {
    await dispose();

    isCameraEnabled = video;
    isMuted = false;

    peerConnection = await createPeerConnection(_configuration);

    localStream = await navigator.mediaDevices.getUserMedia({
      'audio': {
        'echoCancellation': true,
        'noiseSuppression': true,
        'autoGainControl': true,
      },
      'video': video
          ? {
              'facingMode': 'user',
              'width': {'ideal': 1280},
              'height': {'ideal': 720},
            }
          : false,
    });

    if (_renderersInitialized) {
      localRenderer.srcObject = localStream;
    }

    for (final track in localStream!.getTracks()) {
      await peerConnection!.addTrack(
        track,
        localStream!,
      );
    }
  }

  Future<void> startSession({
    required String callId,
    required String callerId,
    required String receiverId,
    required bool isCaller,
    required bool isVideo,
    String callerName = 'PK CHAT User',
    required void Function(RTCPeerConnectionState state) onConnectionState,
  }) async {
    await initRenderers();
    await initialize(video: isVideo);

    final pc = peerConnection!;
    localRenderer.srcObject = localStream;

    pc.onTrack = (RTCTrackEvent event) {
      if (event.streams.isNotEmpty) {
        remoteRenderer.srcObject = event.streams.first;
      }
    };

    pc.onConnectionState = onConnectionState;

    final recordRef = _callService.db.collection('call_records').doc(callId);

    if (isCaller) {
      final offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await Future.delayed(const Duration(milliseconds: 900));
      if (peerConnection != pc) return;

      final localDesc = await pc.getLocalDescription();
      final offerSdp = localDesc?.sdp ?? offer.sdp ?? '';
      final safeName = callerName.trim().isEmpty
          ? 'PK CHAT User'
          : (callerName.trim().length > 100
              ? callerName.trim().substring(0, 100)
              : callerName.trim());

      await recordRef.set({
        'callId': callId,
        'callerId': callerId,
        'callerName': safeName,
        'participantIds': [callerId, receiverId],
        'callType': isVideo ? 'video' : 'audio',
        'status': 'ringing',
        'sourceLanguage': 'auto',
        'targetLanguage': 'en',
        'durationSeconds': 0,
        'offerSdp':
            offerSdp.length > 32000 ? offerSdp.substring(0, 32000) : offerSdp,
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      await _signalingSub?.cancel();
      _signalingSub = recordRef.snapshots().listen((snap) async {
        final data = snap.data();
        final answerSdp = data?['answerSdp'] as String?;
        if (answerSdp != null && answerSdp.isNotEmpty) {
          final activePc = peerConnection;
          if (activePc == null) return;
          final existingRemote = await activePc.getRemoteDescription();
          if (existingRemote == null) {
            await activePc.setRemoteDescription(
              RTCSessionDescription(answerSdp, 'answer'),
            );
          }
        }
      });
    } else {
      final offerCompleter = Completer<String?>();
      await _signalingSub?.cancel();
      _signalingSub = recordRef.snapshots().listen(
        (snap) {
          final offerSdp = snap.data()?['offerSdp'] as String?;
          if (offerSdp != null &&
              offerSdp.isNotEmpty &&
              !offerCompleter.isCompleted) {
            offerCompleter.complete(offerSdp);
          }
        },
        onError: (Object error) {
          if (!offerCompleter.isCompleted) {
            offerCompleter.completeError(error);
          }
        },
      );

      final offerSdp = await offerCompleter.future.timeout(
        const Duration(seconds: 20),
        onTimeout: () => null,
      );
      await _signalingSub?.cancel();
      _signalingSub = null;

      if (peerConnection != pc) return;
      if (offerSdp != null && offerSdp.isNotEmpty) {
        await pc.setRemoteDescription(RTCSessionDescription(offerSdp, 'offer'));
        final answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await Future.delayed(const Duration(milliseconds: 900));
        if (peerConnection != pc) return;

        final localDesc = await pc.getLocalDescription();
        final answerSdp = localDesc?.sdp ?? answer.sdp ?? '';

        await recordRef.update({
          'status': 'active',
          'answerSdp': answerSdp.length > 32000
              ? answerSdp.substring(0, 32000)
              : answerSdp,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      }
    }
  }

  void toggleMute() {
    isMuted = !isMuted;
    final audioTracks = localStream?.getAudioTracks() ?? const [];
    for (final track in audioTracks) {
      track.enabled = !isMuted;
    }
  }

  void toggleCamera() {
    isCameraEnabled = !isCameraEnabled;
    final videoTracks = localStream?.getVideoTracks() ?? const [];
    for (final track in videoTracks) {
      track.enabled = isCameraEnabled;
    }
  }

  Future<void> switchCamera() async {
    final videoTracks = localStream?.getVideoTracks() ?? const [];
    if (videoTracks.isNotEmpty) {
      await Helper.switchCamera(videoTracks.first);
    }
  }

  Future<void> toggleSpeaker() async {
    isSpeakerOn = !isSpeakerOn;
    await Helper.setSpeakerphoneOn(isSpeakerOn);
  }

  Future<void> dispose() async {
    await _signalingSub?.cancel();
    _signalingSub = null;

    if (localStream != null) {
      for (final track in localStream!.getTracks()) {
        await track.stop();
      }
      await localStream!.dispose();
    }

    localRenderer.srcObject = null;
    remoteRenderer.srcObject = null;

    await peerConnection?.close();
    localStream = null;
    peerConnection = null;
  }

  Future<void> disposeSession() => dispose();

  Future<void> disposeRenderers() async {
    await dispose();
    if (_renderersInitialized) {
      await localRenderer.dispose();
      await remoteRenderer.dispose();
      _renderersInitialized = false;
    }
  }
}

typedef WebRtcService = WebRTCService;
