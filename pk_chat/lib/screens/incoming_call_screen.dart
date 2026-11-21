import 'dart:async';
import 'package:flutter/material.dart';
import '../models/call_model.dart';
import '../services/call_service.dart';
import '../services/notification_service.dart';
import '../services/webrtc_service.dart';
import 'video_call_screen.dart';

class IncomingCallScreen extends StatefulWidget {
  const IncomingCallScreen({
    super.key,
    required this.call,
    required this.callService,
    required this.notificationService,
    required this.webRtcService,
  });

  final CallModel call;
  final CallService callService;
  final NotificationService notificationService;
  final WebRtcService webRtcService;

  @override
  State<IncomingCallScreen> createState() => _IncomingCallScreenState();
}

class _IncomingCallScreenState extends State<IncomingCallScreen> {
  StreamSubscription<CallModel?>? _callSub;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _callSub = widget.callService.watchCall(widget.call.callId).listen((updated) {
      if (updated == null || updated.isTerminal) {
        if (mounted) Navigator.of(context).maybePop();
      }
    });
  }

  Future<void> _acceptCall() async {
    setState(() => _busy = true);
    final permitted = await widget.notificationService.ensureCallPermissions(
      isVideo: widget.call.isVideo,
    );
    if (!permitted) {
      await _declineCall();
      return;
    }

    await widget.callService.answerCall(widget.call.callId);
    await widget.notificationService.dismissCallKit(widget.call.callId);

    if (!mounted) return;
    await Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => VideoCallScreen(
          callId: widget.call.callId,
          callerId: widget.call.callerId,
          receiverId: widget.call.receiverId,
          isCaller: false,
          isVideo: widget.call.isVideo,
          callService: widget.callService,
          webRtcService: widget.webRtcService,
        ),
      ),
    );
  }

  Future<void> _declineCall() async {
    setState(() => _busy = true);
    await widget.callService.rejectCall(widget.call.callId);
    await widget.notificationService.dismissCallKit(widget.call.callId);
    if (mounted) Navigator.of(context).maybePop();
  }

  @override
  void dispose() {
    _callSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final callTypeLabel =
        widget.call.isVideo ? 'PK CHAT Video Call' : 'PK CHAT Voice Call';

    return Scaffold(
      backgroundColor: const Color(0xFF0B141A),
      body: SafeArea(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 52),
              child: Column(
                children: [
                  Container(
                    width: 108,
                    height: 108,
                    decoration: BoxDecoration(
                      color: const Color(0xFF075E54),
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: const Color(0xFF25D366),
                        width: 3,
                      ),
                    ),
                    child: Icon(
                      widget.call.isVideo ? Icons.videocam : Icons.call,
                      size: 48,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    callTypeLabel,
                    style: const TextStyle(
                      color: Color(0xFF25D366),
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.6,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    widget.call.callerName,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'ID: ${widget.call.callerId}',
                    style: const TextStyle(
                      color: Colors.white54,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Incoming encrypted call...',
                    style: TextStyle(color: Colors.white70),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 48, left: 36, right: 36),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  Column(
                    children: [
                      FloatingActionButton.large(
                        heroTag: 'decline_call',
                        backgroundColor: Colors.red.shade600,
                        foregroundColor: Colors.white,
                        onPressed: _busy ? null : _declineCall,
                        child: const Icon(Icons.call_end),
                      ),
                      const SizedBox(height: 10),
                      const Text(
                        'Decline',
                        style: TextStyle(color: Colors.white70),
                      ),
                    ],
                  ),
                  Column(
                    children: [
                      FloatingActionButton.large(
                        heroTag: 'accept_call',
                        backgroundColor: const Color(0xFF25D366),
                        foregroundColor: Colors.white,
                        onPressed: _busy ? null : _acceptCall,
                        child: Icon(
                          widget.call.isVideo ? Icons.videocam : Icons.call,
                        ),
                      ),
                      const SizedBox(height: 10),
                      const Text(
                        'Accept',
                        style: TextStyle(color: Colors.white70),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
