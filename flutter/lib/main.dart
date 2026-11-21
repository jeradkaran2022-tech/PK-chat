import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'services/phone_auth_service.dart';
import 'services/pkchat_auth_service.dart';
import 'services/pkchat_firebase_service.dart';
import 'services/subscription_billing_service.dart';
import 'widgets/voice_recorder_widget.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await PkChatFirebaseService.instance.initialize();
  runApp(const PKChatApp());
}

class PKChatApp extends StatelessWidget {
  const PKChatApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PK Chat',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF075E54),
          primary: const Color(0xFF075E54),
          secondary: const Color(0xFF25D366),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF075E54),
          foregroundColor: Colors.white,
        ),
      ),
      home: StreamBuilder<User?>(
        stream: FirebaseAuth.instance.authStateChanges(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            );
          }
          if (snapshot.hasData) {
            return const _AuthenticatedHome();
          }
          return const PhoneInputScreen();
        },
      ),
    );
  }
}

// 2. Phone Input Screen with Loading State & Smooth Navigation
class PhoneInputScreen extends StatefulWidget {
  const PhoneInputScreen({super.key});

  @override
  State<PhoneInputScreen> createState() => _PhoneInputScreenState();
}

class _PhoneInputScreenState extends State<PhoneInputScreen> {
  final TextEditingController _phoneController = TextEditingController();
  bool _isLoading = false;
  bool _biometricVerified = false;
  String? _inlineError;

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final raw = _phoneController.text.trim();
    if (raw.isEmpty || _isLoading) return;

    final phone = PhoneAuthService.normalizePhone(raw);
    FocusScope.of(context).unfocus();
    setState(() {
      _isLoading = true;
      _inlineError = null;
    });

    await PhoneAuthService.verifyPhone(
      phone: phone,
      onAutoVerified: () {
        if (!mounted) return;
        setState(() => _isLoading = false);
      },
      onCodeSent: (String verId) {
        if (!mounted) return;
        setState(() => _isLoading = false);
        // Clean navigation to the OTP screen upon codeSent
        Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => OtpScreen(
              verificationId: verId,
              phoneNumber: phone,
            ),
          ),
        );
      },
      onFailed: (String error) {
        if (!mounted) return;
        setState(() {
          _isLoading = false;
          _inlineError = error;
        });
        // Error displays on-screen, no unexpected pop
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error),
            backgroundColor: Colors.red.shade700,
          ),
        );
      },
    );
  }

  Future<void> _signInWithGoogle() async {
    if (_isLoading) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _isLoading = true;
      _inlineError = null;
    });

    final user = await PKChatAuthService.instance.signInWithGoogle(
      onError: (String error) {
        if (!mounted) return;
        setState(() => _inlineError = error);
      },
    );

    if (!mounted) return;
    setState(() => _isLoading = false);
    if (user != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Welcome to PK Chat, ${user.displayName ?? user.email ?? 'Member'}!',
          ),
        ),
      );
    }
  }

  Future<void> _verifyFaceBiometric() async {
    if (_isLoading) return;
    setState(() {
      _isLoading = true;
      _inlineError = null;
    });

    final ok = await PKChatAuthService.instance.authenticateWithFace(
      onError: (String error) {
        if (!mounted) return;
        setState(() => _inlineError = error);
      },
    );

    if (!mounted) return;
    setState(() {
      _isLoading = false;
      _biometricVerified = ok;
    });
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Face / Biometric verified! Tap Continue with Google or Phone OTP.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_isLoading,
      child: Scaffold(
        appBar: AppBar(title: const Text('PK Chat Sign In')),
        body: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextField(
                      controller: _phoneController,
                      decoration: const InputDecoration(
                        labelText: 'Phone Number (e.g., +94717868693)',
                        border: OutlineInputBorder(),
                      ),
                      keyboardType: TextInputType.phone,
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      height: 48,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF25D366),
                          foregroundColor: Colors.white,
                        ),
                        onPressed: _submit,
                        child: const Text(
                          'Next (Phone OTP)',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Row(
                      children: [
                        Expanded(child: Divider()),
                        Padding(
                          padding: EdgeInsets.symmetric(horizontal: 10),
                          child: Text('OR (No SMS OTP Needed)', style: TextStyle(fontSize: 12)),
                        ),
                        Expanded(child: Divider()),
                      ],
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      height: 48,
                      child: OutlinedButton.icon(
                        onPressed: _signInWithGoogle,
                        icon: const Icon(Icons.login),
                        label: const Text(
                          'Continue with Google',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      height: 44,
                      child: OutlinedButton.icon(
                        onPressed: _verifyFaceBiometric,
                        icon: Icon(
                          _biometricVerified ? Icons.verified_user : Icons.face,
                          color: _biometricVerified ? const Color(0xFF075E54) : null,
                        ),
                        label: Text(
                          _biometricVerified
                              ? 'Face / Biometric Verified ✓'
                              : 'Verify with Face / Biometric',
                        ),
                      ),
                    ),
                    if (_inlineError != null) ...[
                      const SizedBox(height: 14),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.red.shade50,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: Colors.red.shade200),
                        ),
                        child: Text(
                          _inlineError!,
                          style: TextStyle(color: Colors.red.shade800, fontSize: 12),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
      ),
    );
  }
}

// 3. Clean OTP Verification Screen
class OtpScreen extends StatefulWidget {
  final String verificationId;
  final String phoneNumber;

  const OtpScreen({
    super.key,
    required this.verificationId,
    required this.phoneNumber,
  });

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final TextEditingController _otpController = TextEditingController();
  late String _activeVerificationId;
  bool _isVerifying = false;

  bool get _isWebBypass =>
      _activeVerificationId == 'web_preview_test_bypass';

  @override
  void initState() {
    super.initState();
    _activeVerificationId = widget.verificationId;
    if (_isWebBypass) {
      _otpController.text = PhoneAuthService.webPreviewTestOtp;
    }
  }

  @override
  void dispose() {
    _otpController.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (_isVerifying) return;
    FocusScope.of(context).unfocus();
    setState(() => _isVerifying = true);

    var failed = false;
    await PhoneAuthService.verifyOtp(
      verificationId: _activeVerificationId,
      smsCode: _otpController.text,
      onFailed: (String error) {
        failed = true;
        if (!mounted) return;
        setState(() => _isVerifying = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error),
            backgroundColor: Colors.red.shade700,
          ),
        );
      },
    );

    if (failed || !mounted) return;
    setState(() => _isVerifying = false);
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  Future<void> _resend() async {
    if (_isVerifying) return;
    setState(() => _isVerifying = true);
    await PhoneAuthService.verifyPhone(
      phone: widget.phoneNumber,
      isResend: true,
      onCodeSent: (String verId) {
        if (!mounted) return;
        setState(() {
          _activeVerificationId = verId;
          _isVerifying = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('OTP resent to ${widget.phoneNumber}.')),
        );
      },
      onFailed: (String error) {
        if (!mounted) return;
        setState(() => _isVerifying = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error), backgroundColor: Colors.red.shade700),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_isVerifying,
      child: Scaffold(
        appBar: AppBar(title: const Text('Verify OTP')),
        body: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Enter the 6-digit OTP sent to ${widget.phoneNumber}',
                textAlign: TextAlign.center,
              ),
              if (_isWebBypass) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE7F8EE),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'Web Preview Test Mode: reCAPTCHA bypassed & code 123456 auto-filled.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Color(0xFF075E54), fontSize: 12),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              TextField(
                controller: _otpController,
                decoration: const InputDecoration(
                  labelText: '6-Digit Code',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
                maxLength: 6,
                autofillHints: const [AutofillHints.oneTimeCode],
              ),
              const SizedBox(height: 16),
              SizedBox(
                height: 48,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF25D366),
                    foregroundColor: Colors.white,
                  ),
                  onPressed: _isVerifying ? null : _verify,
                  child: _isVerifying
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text(
                          'Verify',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                ),
              ),
              TextButton(
                onPressed: _isVerifying ? null : _resend,
                child: const Text('Resend OTP'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AuthenticatedHome extends StatelessWidget {
  const _AuthenticatedHome();

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    final identity = user?.displayName ??
        user?.email ??
        user?.phoneNumber ??
        '+94717868693 (Web Preview Test)';
    final planStatus = SubscriptionBillingService.describePlanStatus(
      user?.phoneNumber,
    );
    return Scaffold(
      appBar: AppBar(
        title: const Text('PK Chat'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => PKChatAuthService.instance.signOut(),
          ),
        ],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                'Signed in: $identity',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: SubscriptionBillingService.isVipFounderFreeNumber(user?.phoneNumber)
                      ? Colors.blue.shade50
                      : Colors.green.shade50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: SubscriptionBillingService.isVipFounderFreeNumber(user?.phoneNumber)
                        ? Colors.blue.shade300
                        : Colors.green.shade300,
                  ),
                ),
                child: Text(
                  planStatus,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: SubscriptionBillingService.isVipFounderFreeNumber(user?.phoneNumber)
                        ? Colors.blue.shade800
                        : Colors.green.shade800,
                  ),
                ),
              ),
              const SizedBox(height: 24),
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
      ),
    );
  }
}
