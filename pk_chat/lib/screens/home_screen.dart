import 'dart:async';
import 'package:flutter/material.dart';
import '../models/call_model.dart';
import '../services/auth_service.dart';
import '../services/call_service.dart';
import '../services/notification_service.dart';
import '../services/phone_auth_service.dart';
import '../services/subscription_billing_service.dart';
import '../services/webrtc_service.dart';
import '../widgets/voice_recorder_widget.dart';
import 'incoming_call_screen.dart';
import 'video_call_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    this.authService,
    this.callService,
    this.notificationService,
    this.webRtcService,
  });

  final AuthService? authService;
  final CallService? callService;
  final NotificationService? notificationService;
  final WebRtcService? webRtcService;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final TextEditingController _receiverController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _otpController = TextEditingController();

  StreamSubscription<List<CallModel>>? _incomingSub;
  String? _shownCallId;
  String? _errorBanner;
  String? _statusBanner;
  String _verificationId = '';
  bool _otpSent = false;
  bool _authBusy = false;
  bool _startingCall = false;

  AuthService get _auth => widget.authService ?? AuthService.instance;
  CallService get _calls => widget.callService ?? CallService.instance;
  NotificationService get _notifications =>
      widget.notificationService ?? NotificationService.instance;
  WebRtcService get _webRtc =>
      widget.webRtcService ?? WebRtcService.instance;

  @override
  void initState() {
    super.initState();
    _bindIncomingCallStream();
  }

  void _bindIncomingCallStream() {
    _incomingSub?.cancel();
    _incomingSub = null;
    final user = _auth.currentUser;
    if (user == null) return;
    if (!_auth.isAuthenticatedUser(user)) return;

    _incomingSub = _calls.watchIncomingCalls(user.uid).listen(
      (calls) {
        if (calls.isEmpty || !mounted) return;
        final incoming = calls.first;
        if (_shownCallId == incoming.callId) return;
        _shownCallId = incoming.callId;

        Navigator.of(context)
            .push(
              MaterialPageRoute<void>(
                builder: (_) => IncomingCallScreen(
                  call: incoming,
                  callService: _calls,
                  notificationService: _notifications,
                  webRtcService: _webRtc,
                ),
              ),
            )
            .then((_) {
          if (mounted) _shownCallId = null;
        });
      },
      onError: (Object error) {
        if (mounted) {
          setState(() => _errorBanner = error.toString());
        }
      },
    );
  }

  Future<void> _sendPhoneOtp({bool isResend = false}) async {
    if (_authBusy) return;
    final normalized = PhoneAuthService.normalizePhone(_phoneController.text);
    setState(() {
      _authBusy = true;
      _errorBanner = null;
      _statusBanner = null;
    });

    await PhoneAuthService.verifyPhone(
      phone: normalized,
      isResend: isResend,
      onAutoVerified: () {
        if (!mounted) return;
        _bindIncomingCallStream();
        setState(() => _authBusy = false);
      },
      onCodeSent: (String verId) {
        if (!mounted) return;
        final isBypass = verId == 'web_preview_test_bypass';
        setState(() {
          _verificationId = verId;
          _otpSent = true;
          _authBusy = false;
          if (isBypass) {
            _otpController.text = PhoneAuthService.webPreviewTestOtp;
          }
          _statusBanner = isBypass
              ? 'Web Preview Test Mode: reCAPTCHA bypassed & code ${PhoneAuthService.webPreviewTestOtp} auto-filled.'
              : '6-digit SMS OTP sent to $normalized.';
        });
      },
      onFailed: (String error) {
        if (!mounted) return;
        setState(() {
          _authBusy = false;
          _errorBanner = error;
        });
      },
    );
  }

  Future<void> _verifyPhoneOtp() async {
    if (_authBusy) return;
    setState(() {
      _authBusy = true;
      _errorBanner = null;
    });

    var failed = false;
    await PhoneAuthService.verifyOtp(
      verificationId: _verificationId,
      smsCode: _otpController.text,
      onFailed: (String error) {
        failed = true;
        if (!mounted) return;
        setState(() {
          _authBusy = false;
          _errorBanner = error;
        });
      },
    );

    if (failed || !mounted) return;

    final phone = PhoneAuthService.normalizePhone(_phoneController.text);
    try {
      await _auth.saveVerifiedPhoneNumber(phoneNumber: phone);
    } catch (_) {
      // Non-blocking sync if profile setup happens later
    }

    if (!mounted) return;
    _bindIncomingCallStream();
    setState(() {
      _authBusy = false;
      _otpSent = false;
      _statusBanner = 'Phone number verified ($phone)!';
    });
  }

  Future<void> _placeCall(String callType) async {
    final receiverId = _receiverController.text.trim();
    final isVideo = callType == 'video';

    setState(() {
      _startingCall = true;
      _errorBanner = null;
    });

    try {
      final callerId = _auth.requireUid();
      final permitted = await _notifications.ensureCallPermissions(
        isVideo: isVideo,
      );
      if (!permitted) {
        throw StateError(
          'Camera, microphone, and notification permissions are required.',
        );
      }

      final callId = await _calls.startCall(
        receiverId: receiverId,
        receiverName: 'PK CHAT User',
        callType: callType,
      );

      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => VideoCallScreen(
            callId: callId,
            callerId: callerId,
            receiverId: receiverId,
            isCaller: true,
            isVideo: isVideo,
            callService: _calls,
            webRtcService: _webRtc,
          ),
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
        setState(() => _errorBanner = e.toString());
      }
    } finally {
      if (mounted) setState(() => _startingCall = false);
    }
  }

  @override
  void dispose() {
    _incomingSub?.cancel();
    _receiverController.dispose();
    _phoneController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder(
      stream: _auth.authChanges,
      builder: (context, authSnap) {
        final user = authSnap.data;
        if (_auth.isAuthenticatedUser(user)) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (_incomingSub == null) _bindIncomingCallStream();
          });
        }

        return Scaffold(
          backgroundColor: const Color(0xFFF5F8FA),
          appBar: AppBar(
            backgroundColor: const Color(0xFF075E54),
            foregroundColor: Colors.white,
            title: const Text(
              'PK CHAT',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            actions: [
              if (user != null)
                IconButton(
                  tooltip: 'Sign out',
                  onPressed: () async {
                    await _incomingSub?.cancel();
                    _incomingSub = null;
                    await _auth.signOut();
                    if (mounted) {
                      setState(() {
                        _otpSent = false;
                        _verificationId = '';
                        _statusBanner = null;
                        _errorBanner = null;
                      });
                    }
                  },
                  icon: const Icon(Icons.logout),
                ),
            ],
          ),
          body: Column(
            children: [
              if (_statusBanner != null)
                MaterialBanner(
                  backgroundColor: const Color(0xFFE6F7F3),
                  content: Text(
                    _statusBanner!,
                    style: const TextStyle(color: Color(0xFF065F46)),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => setState(() => _statusBanner = null),
                      child: const Text('OK'),
                    ),
                  ],
                ),
              if (_errorBanner != null)
                MaterialBanner(
                  backgroundColor: Colors.red.shade50,
                  content: Text(
                    _errorBanner!,
                    style: TextStyle(color: Colors.red.shade900),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => setState(() => _errorBanner = null),
                      child: const Text('DISMISS'),
                    ),
                  ],
                ),
              Expanded(
                child: user == null
                    ? ListView(
                        padding: const EdgeInsets.all(20),
                        children: [
                          const SizedBox(height: 16),
                          Text(
                            _otpSent
                                ? 'Verify OTP'
                                : 'Enter your phone number',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF075E54),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _otpSent
                                ? 'Enter the 6-digit SMS code sent to ${PhoneAuthService.normalizePhone(_phoneController.text)}'
                                : 'PK Chat will need to verify your phone number.',
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Colors.black54),
                          ),
                          const SizedBox(height: 20),
                          if (!_otpSent) ...[
                            TextField(
                              controller: _phoneController,
                              keyboardType: TextInputType.phone,
                              decoration: const InputDecoration(
                                labelText: 'Phone Number (e.g., +94717868693)',
                                border: OutlineInputBorder(),
                              ),
                            ),
                            const SizedBox(height: 16),
                            FilledButton(
                              style: FilledButton.styleFrom(
                                backgroundColor: const Color(0xFF25D366),
                                padding: const EdgeInsets.symmetric(vertical: 14),
                              ),
                              onPressed: _authBusy ? null : () => _sendPhoneOtp(),
                              child: Text(_authBusy ? 'Sending...' : 'Next'),
                            ),
                          ] else ...[
                            TextField(
                              controller: _otpController,
                              keyboardType: TextInputType.number,
                              maxLength: 6,
                              decoration: const InputDecoration(
                                labelText: '6-Digit Code',
                                border: OutlineInputBorder(),
                              ),
                            ),
                            const SizedBox(height: 12),
                            FilledButton(
                              style: FilledButton.styleFrom(
                                backgroundColor: const Color(0xFF25D366),
                                padding: const EdgeInsets.symmetric(vertical: 14),
                              ),
                              onPressed: _authBusy ? null : _verifyPhoneOtp,
                              child: Text(_authBusy ? 'Verifying...' : 'Verify'),
                            ),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                TextButton(
                                  onPressed: _authBusy
                                      ? null
                                      : () => _sendPhoneOtp(isResend: true),
                                  child: const Text('Resend OTP'),
                                ),
                                TextButton(
                                  onPressed: _authBusy
                                      ? null
                                      : () => setState(() {
                                            _otpSent = false;
                                            _otpController.clear();
                                          }),
                                  child: const Text('Change Number'),
                                ),
                              ],
                            ),
                          ],
                        ],
                      )
                    : ListView(
                        padding: const EdgeInsets.all(16),
                        children: [
                          Card(
                            child: ListTile(
                              leading: const CircleAvatar(
                                backgroundColor: Color(0xFF25D366),
                                child: Icon(
                                  Icons.phone_android,
                                  color: Colors.white,
                                ),
                              ),
                              title: Text(
                                user.displayName ??
                                    user.email ??
                                    user.phoneNumber ??
                                    'PK Chat Member',
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  SelectableText('UID: ${user.uid}'),
                                  const SizedBox(height: 4),
                                  Text(
                                    SubscriptionBillingService.describePlanStatus(
                                      user.phoneNumber,
                                    ),
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: SubscriptionBillingService.isVipFounderFreeNumber(
                                        user.phoneNumber,
                                      )
                                          ? Colors.blue.shade700
                                          : const Color(0xFF075E54),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          TextField(
                            controller: _receiverController,
                            decoration: const InputDecoration(
                              filled: true,
                              fillColor: Colors.white,
                              labelText: 'Recipient Firebase UID',
                              hintText: 'Enter contact Firebase UID',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 16),
                          ElevatedButton.icon(
                            onPressed: _startingCall
                                ? null
                                : () => _placeCall('audio'),
                            icon: const Icon(Icons.call),
                            label: const Text('Audio Call'),
                          ),
                          const SizedBox(height: 10),
                          ElevatedButton.icon(
                            onPressed: _startingCall
                                ? null
                                : () => _placeCall('video'),
                            icon: const Icon(Icons.video_call),
                            label: const Text('Video Call'),
                          ),
                          const SizedBox(height: 20),
                          VoiceRecorderWidget(
                            onSend: () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Voice note sent to PK Chat.'),
                                ),
                              );
                            },
                          ),
                        ],
                      ),
              ),
            ],
          ),
        );
      },
    );
  }
}
