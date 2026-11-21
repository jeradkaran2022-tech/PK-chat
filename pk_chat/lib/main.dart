import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'firebase_options.dart';
import 'screens/home_screen.dart';
import 'services/notification_service.dart';
import 'services/phone_auth_service.dart';
import 'services/pkchat_auth_service.dart';

@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  if (Firebase.apps.isEmpty) {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  }
  await NotificationService.handleBackground(message);
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
  await NotificationService.initialize();

  runApp(const PKChatApp());
}

class PKChatApp extends StatelessWidget {
  const PKChatApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: NotificationService.navigatorKey,
      title: 'PK CHAT',
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
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        return snapshot.hasData
            ? const HomeScreen()
            : const PhoneInputScreen();
      },
    );
  }
}

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
                padding: const EdgeInsets.all(20.0),
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

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_isVerifying,
      child: Scaffold(
        appBar: AppBar(title: const Text('Verify OTP')),
        body: Padding(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Enter the 6-digit OTP sent to ${widget.phoneNumber}',
                textAlign: TextAlign.center,
              ),
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
            ],
          ),
        ),
      ),
    );
  }
}
