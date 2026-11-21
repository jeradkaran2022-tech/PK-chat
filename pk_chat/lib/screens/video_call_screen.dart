import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../models/call_model.dart';
import '../services/call_service.dart';
import '../services/webrtc_service.dart';

class VideoCallScreen extends StatefulWidget {
  const VideoCallScreen({
    super.key,
    required this.callId,
    required this.callerId,
    required this.receiverId,
    required this.isCaller,
    required this.isVideo,
    required this.callService,
    required this.webRtcService,
  });

  final String callId;
  final String callerId;
  final String receiverId;
  final bool isCaller;
  final bool isVideo;
  final CallService callService;
  final WebRtcService webRtcService;

  @override
  State<VideoCallScreen> createState() => _VideoCallScreenState();
}

class _VideoCallScreenState extends State<VideoCallScreen> {
  StreamSubscription<CallModel?>? _callSub;
  String _connectionLabel = 'Connecting...';
  bool _ended = false;

  @override
  void initState() {
    super.initState();
    _initWebRtc();
  }

  Future<void> _initWebRtc() async {
    _callSub = widget.callService.watchCall(widget.callId).listen(
      (call) {
        if (call == null || call.isTerminal) {
          _hangUp(updateFirestore: false);
        } else if (call.status == 'accepted' && mounted) {
          setState(() => _connectionLabel = 'Connected (Encrypted)');
        }
      },
      onError: (Object error) {
        if (mounted) {
          setState(() => _connectionLabel = 'Signal error: $error');
        }
      },
    );

    try {
      await widget.webRtcService.startSession(
        callId: widget.callId,
        callerId: widget.callerId,
        receiverId: widget.receiverId,
        isCaller: widget.isCaller,
        isVideo: widget.isVideo,
        onConnectionState: (state) {
          if (!mounted) return;
          setState(() {
            if (state ==
                RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
              _connectionLabel = 'Live Peer Audio/Video';
            } else if (state ==
                RTCPeerConnectionState.RTCPeerConnectionStateFailed) {
              _connectionLabel = 'Reconnecting...';
            }
          });
        },
      );
      if (mounted) setState(() {});
    } catch (e) {
      if (mounted) {
        setState(() => _connectionLabel = 'Call setup error: $e');
      }
    }
  }

  Future<void> _hangUp({bool updateFirestore = true}) async {
    if (_ended) return;
    _ended = true;
    await _callSub?.cancel();
    if (updateFirestore) {
      await widget.callService.endCall(widget.callId);
    }
    await widget.webRtcService.disposeSession();
    if (mounted) Navigator.of(context).maybePop();
  }

  @override
  void dispose() {
    _callSub?.cancel();
    widget.webRtcService.disposeSession();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final peerId = widget.isCaller ? widget.receiverId : widget.callerId;

    return Scaffold(
      backgroundColor: const Color(0xFF0B141A),
      body: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(
              child: widget.isVideo
                  ? RTCVideoView(
                      widget.webRtcService.remoteRenderer,
                      objectFit:
                          RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                    )
                  : Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const CircleAvatar(
                            radius: 54,
                            backgroundColor: Color(0xFF075E54),
                            child: Icon(
                              Icons.person,
                              size: 54,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            peerId,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            _connectionLabel,
                            style: const TextStyle(color: Color(0xFF25D366)),
                          ),
                        ],
                      ),
                    ),
            ),
            if (widget.isVideo)
              Positioned(
                top: 16,
                right: 16,
                width: 112,
                height: 160,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: Container(
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: const Color(0xFF25D366),
                        width: 2,
                      ),
                    ),
                    child: RTCVideoView(
                      widget.webRtcService.localRenderer,
                      mirror: true,
                      objectFit:
                          RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                    ),
                  ),
                ),
              ),
            Positioned(
              top: 20,
              left: 16,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  _connectionLabel,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
            Positioned(
              left: 16,
              right: 16,
              bottom: 24,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFF1F2C34),
                  borderRadius: BorderRadius.circular(28),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    IconButton(
                      onPressed: () {
                        widget.webRtcService.toggleMute();
                        setState(() {});
                      },
                      icon: Icon(
                        widget.webRtcService.isMuted
                            ? Icons.mic_off
                            : Icons.mic,
                        color: Colors.white,
                      ),
                    ),
                    if (widget.isVideo)
                      IconButton(
                        onPressed: () {
                          widget.webRtcService.toggleCamera();
                          setState(() {});
                        },
                        icon: Icon(
                          widget.webRtcService.isCameraEnabled
                              ? Icons.videocam
                              : Icons.videocam_off,
                          color: Colors.white,
                        ),
                      ),
                    if (widget.isVideo)
                      IconButton(
                        onPressed: () => widget.webRtcService.switchCamera(),
                        icon: const Icon(
                          Icons.cameraswitch,
                          color: Colors.white,
                        ),
                      ),
                    IconButton(
                      onPressed: () async {
                        await widget.webRtcService.toggleSpeaker();
                        setState(() {});
                      },
                      icon: Icon(
                        widget.webRtcService.isSpeakerOn
                            ? Icons.volume_up
                            : Icons.hearing,
                        color: Colors.white,
                      ),
                    ),
                    FloatingActionButton(
                      backgroundColor: Colors.red.shade600,
                      foregroundColor: Colors.white,
                      onPressed: () => _hangUp(updateFirestore: true),
                      child: const Icon(Icons.call_end),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
