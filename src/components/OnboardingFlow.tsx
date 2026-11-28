import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Camera,
  Check,
  Download,
  Eye,
  Globe,
  Lock,
  Phone,
  ScanFace,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { BRAND_LOGO_URL, COUNTRIES, LANGUAGES } from '../data/constants';
import { usePkChat } from '../context/PkChatContext';
import {
  detectOperatingCountryContext,
  normalizePhoneToE164,
  validatePhoneMatchesOperatingCountry,
} from '../lib/phoneAuth';
import {
  getActiveUserMode,
  isVipFounderFreeNumber,
  setActiveUserMode,
} from '../lib/subscriptionBilling';
import {
  analyzeImageDataUrlForExplicitContent,
  detectExplicitSexualContent,
} from '../lib/securityShield';
import { PK_APP_EXPERIENCE } from '../lib/pkExperienceController';
import { PkChatUserMode } from '../types/pkchat';
import { GlobalSecurityOverlay } from './GlobalSecurityOverlay';
import { ProfileImageEditorModal } from './ProfileImageEditorModal';
import { StoreDownloadModal } from './StoreDownloadModal';
import { UserAvatar } from './UserAvatar';

export function OnboardingFlow() {
  const {
    activeScreen,
    setActiveScreen,
    selectedCountry,
    setSelectedCountry,
    pendingPhone,
    setPendingPhone,
    startTrialWithLanguage,
    signInWithGoogle,
    otpStatusMessage,
    otpError,
    otpErrorCode,
    firebaseUser,
    userAccount,
    userAccountLoaded,
    userProfile,
    linkPhoneForDiscovery,
    completeOnboardingProfile,
    logoutUser,
    globalSecurityState,
  } = usePkChat();

  const [showStoreModal, setShowStoreModal] = useState(false);
  const [userTypeChoice, setUserTypeChoice] = useState<'new' | 'old'>('new');
  const [showBiometricRecoveryModal, setShowBiometricRecoveryModal] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState<string | null>(null);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [cameraPreviewActive, setCameraPreviewActive] = useState(false);
  const [recoveryCapturedPhoto, setRecoveryCapturedPhoto] = useState<string>('');
  const recoveryVideoRef = useRef<HTMLVideoElement | null>(null);
  const recoveryStreamRef = useRef<MediaStream | null>(null);

  // First-time PK Chat Welcome Screen gate ("Welcome to PK Chat" -> "Agree and Continue")
  const [welcomeAgreed, setWelcomeAgreed] = useState<boolean>(() => {
    if (firebaseUser) return true;
    try {
      return sessionStorage.getItem('pk_onboarding_3step_active') === '1';
    } catch {
      return false;
    }
  });

  // Step 2 live camera / photo verification state
  const [photoVerified, setPhotoVerified] = useState(false);
  const [step2CamActive, setStep2CamActive] = useState(false);
  const step2VideoRef = useRef<HTMLVideoElement | null>(null);
  const step2StreamRef = useRef<MediaStream | null>(null);

  const [userModeChoice, setUserModeChoice] = useState<PkChatUserMode>(() =>
    getActiveUserMode(firebaseUser?.uid)
  );

  const operatingCountry = React.useMemo(() => detectOperatingCountryContext(), []);
  const [phoneLocal, setPhoneLocal] = useState('');
  const [welcomeLangChoice, setWelcomeLangChoice] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('pk_chat_language');
      if (saved === 'Tanglish' || saved === 'Tanglish (தக் இங்கிலீஷ்)') return 'tanglish';
      if (saved === 'தமிழ்' || saved === 'Tamil') return 'ta';
      if (saved === 'Tamil (Sri Lanka)') return 'ta-LK';
      if (saved && saved !== 'English') {
        const match = LANGUAGES.find((l) => l.name === saved || l.code === saved);
        if (match) return match.code;
      }
    } catch {
      // Safe fallback in restricted iframe storage
    }
    return PK_APP_EXPERIENCE.defaultLanguage;
  });
  const [trustDevice] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);

  // Profile Creation & Independent Language Selection (editable Gmail display name auto-fill)
  const [fullName, setFullName] = useState(() => {
    if (firebaseUser?.displayName?.trim()) return firebaseUser.displayName.trim();
    if (firebaseUser?.email) {
      return firebaseUser.email.split('@')[0].replace(/[._-]+/g, ' ').trim();
    }
    return '';
  });
  const [avatarUrl, setAvatarUrl] = useState(firebaseUser?.photoURL || '');
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [discoveryPhone, setDiscoveryPhone] = useState('');
  const [allowPhoneDiscovery, setAllowPhoneDiscovery] = useState(true);
  const [chosenLangCode, setChosenLangCode] = useState<string>(() => {
    const candidate =
      welcomeLangChoice === 'tanglish'
        ? 'ta-LK'
        : welcomeLangChoice || PK_APP_EXPERIENCE.defaultLanguage || 'en';
    const isSupported = LANGUAGES.some((l) => l.code === candidate && l.supported);
    return isSupported ? candidate : 'en';
  });
  const [langSearch, setLangSearch] = useState('');
  const [birthDate, setBirthDate] = useState<string>(() => {
    try {
      return window.localStorage.getItem('pk_user_dob') || '2000-01-01';
    } catch {
      return '2000-01-01';
    }
  });
  const [minorSafetyMode, setMinorSafetyMode] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('pk_minor_safety_mode') === 'true';
    } catch {
      return false;
    }
  });
  const seededProfileUidRef = useRef<string | null>(null);

  const stopRecoveryCamera = () => {
    if (recoveryStreamRef.current) {
      recoveryStreamRef.current.getTracks().forEach((tr) => tr.stop());
      recoveryStreamRef.current = null;
    }
    if (recoveryVideoRef.current) {
      recoveryVideoRef.current.srcObject = null;
    }
    setCameraPreviewActive(false);
  };

  const stopStep2Camera = () => {
    if (step2StreamRef.current) {
      step2StreamRef.current.getTracks().forEach((tr) => tr.stop());
      step2StreamRef.current = null;
    }
    if (step2VideoRef.current) {
      step2VideoRef.current.srcObject = null;
    }
    setStep2CamActive(false);
  };

  useEffect(() => {
    if (!showBiometricRecoveryModal) {
      stopRecoveryCamera();
    }
    return () => stopRecoveryCamera();
  }, [showBiometricRecoveryModal]);

  useEffect(() => {
    if (activeScreen !== 'welcome' || photoVerified) {
      stopStep2Camera();
    }
    return () => stopStep2Camera();
  }, [activeScreen, photoVerified]);

  const handleStartStep2LiveCamera = async () => {
    setLocalError(null);
    stopStep2Camera();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setLocalError('Camera unavailable here — please upload your verification photo below.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      step2StreamRef.current = stream;
      setStep2CamActive(true);
      window.setTimeout(() => {
        if (step2VideoRef.current) {
          step2VideoRef.current.srcObject = stream;
          step2VideoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? `Camera permission note: ${err.message}. You can upload a photo directly below.`
          : 'Unable to access front camera. Upload a verification photo below.'
      );
    }
  };

  const handleCaptureStep2Photo = () => {
    const videoEl = step2VideoRef.current;
    if (!videoEl || !videoEl.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const side = Math.min(videoEl.videoWidth, videoEl.videoHeight);
    const sx = (videoEl.videoWidth - side) / 2;
    const sy = (videoEl.videoHeight - side) / 2;
    ctx.drawImage(videoEl, sx, sy, side, side, 0, 0, 256, 256);
    const captured = canvas.toDataURL('image/jpeg', 0.86);
    setAvatarUrl(captured);
    stopStep2Camera();
    setLocalSuccess('Live selfie photo captured! Confirm & continue to Country/Phone verification.');
  };

  const handleCaptureRecoveryPhoto = () => {
    const videoEl = recoveryVideoRef.current;
    if (!videoEl || !videoEl.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const side = Math.min(videoEl.videoWidth, videoEl.videoHeight);
    const sx = (videoEl.videoWidth - side) / 2;
    const sy = (videoEl.videoHeight - side) / 2;
    ctx.drawImage(videoEl, sx, sy, side, side, 0, 0, 256, 256);
    const captured = canvas.toDataURL('image/jpeg', 0.86);
    setRecoveryCapturedPhoto(captured);
    setAvatarUrl(captured);
    setBiometricStatus(
      '✅ Face verification photo captured! Continue with Gmail or Phone below to restore your PK Chat account immediately.'
    );
  };

  const handleStartEyeFaceCameraCheck = async () => {
    setBiometricStatus(null);
    setBiometricBusy(true);
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        recoveryStreamRef.current = stream;
        setCameraPreviewActive(true);
        window.setTimeout(() => {
          if (recoveryVideoRef.current) {
            recoveryVideoRef.current.srcObject = stream;
            recoveryVideoRef.current.play().catch(() => {});
          }
        }, 50);
      }

      const storedCredId = window.localStorage.getItem('pk_biometric_cred_id');
      const platformAvailable =
        typeof window.PublicKeyCredential !== 'undefined' &&
        (await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false));

      if (platformAvailable && storedCredId && navigator.credentials?.get) {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        const rawId = Uint8Array.from(atob(storedCredId), (c) => c.charCodeAt(0));
        await navigator.credentials.get({
          publicKey: {
            challenge,
            allowCredentials: [{ id: rawId, type: 'public-key' }],
            userVerification: 'required',
            timeout: 45000,
          },
        });
        setBiometricStatus(
          '✅ Device Face / Eye Passkey verified! Tap "Restore via Gmail" or "Restore via Phone" below.'
        );
      } else {
        setBiometricStatus(
          '📷 Front camera active for Face Verification. Capture your selfie or verify via Gmail/Phone below to restore your account.'
        );
      }
    } catch (err) {
      setBiometricStatus(
        err instanceof Error
          ? `Camera note: ${err.message}. You can upload your photo or verify via Gmail / Phone below.`
          : 'Camera unavailable. Upload your photo or verify via Gmail / Phone below.'
      );
    } finally {
      setBiometricBusy(false);
    }
  };

  const computeAgeFromDob = (dobStr: string): number | null => {
    if (!dobStr) return null;
    const parsed = new Date(dobStr);
    if (Number.isNaN(parsed.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - parsed.getFullYear();
    const monthDiff = now.getMonth() - parsed.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < parsed.getDate())) {
      age -= 1;
    }
    return age;
  };

  useEffect(() => {
    const uid = firebaseUser?.uid || null;
    if (!uid) {
      seededProfileUidRef.current = null;
      return;
    }
    setWelcomeAgreed(true);
    if (seededProfileUidRef.current === uid) return;
    seededProfileUidRef.current = uid;
    const gmailSeedName =
      firebaseUser?.displayName?.trim() ||
      (firebaseUser?.email
        ? firebaseUser.email.split('@')[0].replace(/[._-]+/g, ' ').trim()
        : '');
    if (gmailSeedName) {
      setFullName((prev) => prev || gmailSeedName);
    }
    if (firebaseUser?.photoURL) {
      setAvatarUrl((prev) => prev || firebaseUser.photoURL || '');
    }
  }, [firebaseUser]);

  const filteredLanguages = LANGUAGES.filter(
    (l) =>
      l.name.toLowerCase().includes(langSearch.toLowerCase()) ||
      l.nativeName.toLowerCase().includes(langSearch.toLowerCase()) ||
      l.code.toLowerCase().includes(langSearch.toLowerCase())
  );

  const formattedE164Preview = phoneLocal.trim()
    ? normalizePhoneToE164(phoneLocal, selectedCountry.dialCode)
    : '';

  const validateEnteredPhoneIfPresent = (): string | undefined => {
    if (!phoneLocal.trim()) return undefined;
    const matchCheck = validatePhoneMatchesOperatingCountry({
      rawPhone: phoneLocal,
      selectedCountryCode: selectedCountry.code,
      selectedDialCode: selectedCountry.dialCode,
      operatingContext: operatingCountry,
    });
    if (!matchCheck.valid) {
      throw new Error(
        matchCheck.reason ||
          'Enter a valid phone number matching your operating country/network.'
      );
    }
    return matchCheck.e164;
  };

  const handleSavePhoneWhenSignedIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setLocalSuccess(null);
    let validPhone: string | undefined;
    try {
      validPhone = validateEnteredPhoneIfPresent();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Invalid phone number.');
      return;
    }
    if (!validPhone) {
      setLocalError('Please enter your mobile number first.');
      return;
    }
    setAuthBusy(true);
    try {
      await linkPhoneForDiscovery(validPhone, allowPhoneDiscovery, selectedCountry.dialCode);
      setPendingPhone('');
      setLocalSuccess('Mobile phone number saved securely to your PK Chat profile.');
      setActiveScreen(userProfile ? 'home' : 'profile_create');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to save phone number.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const side = Math.min(img.naturalWidth || 256, img.naturalHeight || 256);
        const sx = ((img.naturalWidth || side) - side) / 2;
        const sy = ((img.naturalHeight || side) - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, 256, 256);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        void analyzeImageDataUrlForExplicitContent(dataUrl, file.name).then((res) => {
          if (!res.safe) {
            setLocalError(
              res.blockedReason || 'Profile photo blocked by PK CHAT Explicit Content Safety Shield.'
            );
            return;
          }
          setAvatarUrl(dataUrl);
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const resolveWelcomeLanguagePayload = (choice: string): { code: string; name: string } => {
    if (choice === 'tanglish') {
      return { code: 'ta-LK', name: 'Tanglish (தக் இங்கிலீஷ்)' };
    }
    const found = LANGUAGES.find((l) => l.code === choice && l.supported);
    if (found) {
      return { code: found.code, name: found.name };
    }
    return { code: 'en', name: 'English' };
  };

  const handleGoogleSignIn = async () => {
    setLocalError(null);
    setLocalSuccess(null);
    setAuthBusy(true);
    try {
      await signInWithGoogle();
      setLocalSuccess('Gmail account signed in! Opening PK Chat...');
    } catch (err) {
      const fbErr = err as { code?: string; message?: string };
      const code = fbErr?.code ? `[${fbErr.code}] ` : '';
      const rawMsg =
        err instanceof Error && err.message
          ? err.message
          : 'Google Sign-In failed. Please try again.';
      const visibleMsg = rawMsg.includes('[auth/') ? rawMsg : `${code}${rawMsg}`;
      setLocalError(visibleMsg);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleInstantStartChat = async () => {
    setLocalError(null);
    setLocalSuccess(null);
    setAuthBusy(true);
    const { code, name } = resolveWelcomeLanguagePayload(welcomeLangChoice);
    setActiveUserMode(userModeChoice, firebaseUser?.uid);
    try {
      await startTrialWithLanguage({
        languageCode: code,
        languageName: name,
        fullName: fullName.trim() || undefined,
        userMode: userModeChoice,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to start session.';
      setLocalError(msg);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleAgreeAndContinueWelcome = () => {
    setLocalError(null);
    setLocalSuccess(null);
    try {
      sessionStorage.setItem('pk_onboarding_3step_active', '1');
      localStorage.setItem('pk_welcome_agreed', '1');
    } catch {
      // Safe fallback in restricted iframe storage
    }
    setWelcomeAgreed(true);
    if (activeScreen === 'splash') {
      setActiveScreen('welcome');
    }
  };

  const handleStep3OkNextToProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setLocalSuccess(null);
    let validPhone: string | undefined;
    try {
      validPhone = validateEnteredPhoneIfPresent();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Invalid phone number.');
      return;
    }
    if (!validPhone) {
      setLocalError(`Enter your ${selectedCountry.name} (${selectedCountry.dialCode}) mobile phone number.`);
      return;
    }
    setAuthBusy(true);
    try {
      setPendingPhone(validPhone);
      setDiscoveryPhone(validPhone);
      if (firebaseUser) {
        await linkPhoneForDiscovery(validPhone, allowPhoneDiscovery, selectedCountry.dialCode);
      }
      const { code: langCode, name: langName } = resolveWelcomeLanguagePayload(welcomeLangChoice);
      setChosenLangCode((prev) => prev || langCode);
      setActiveUserMode(userModeChoice, firebaseUser?.uid);
      try {
        sessionStorage.removeItem('pk_onboarding_3step_active');
        if (firebaseUser?.uid) {
          localStorage.setItem(`pk_seq_onboarding_done_${firebaseUser.uid}`, '1');
        }
      } catch {
        // ignore storage errors
      }
      setLocalSuccess(`Phone ${validPhone} verified! Opening PK Chat...`);
      await completeOnboardingProfile({
        fullName:
          fullName.trim() ||
          firebaseUser?.displayName?.trim() ||
          (firebaseUser?.email ? firebaseUser.email.split('@')[0].replace(/[._-]+/g, ' ').trim() : '') ||
          'PK Chat Member',
        avatarUrl: avatarUrl || firebaseUser?.photoURL || '',
        country: selectedCountry,
        preferredLanguageCode: langCode,
        preferredLanguageName: langName,
        trusted: trustDevice,
        phoneNumber: validPhone,
        allowPhoneDiscovery,
        userMode: userModeChoice,
        allowLocalFallback: true,
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to save phone number.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleFinishProfileAndLanguage = async () => {
    const resolvedLang =
      LANGUAGES.find((l) => l.code === chosenLangCode && l.supported) ||
      LANGUAGES.find((l) => l.code === 'en' && l.supported) ||
      LANGUAGES.find((l) => l.supported);
    if (!resolvedLang) {
      setLocalError(
        'Selected language is not supported for automatic translation. Choose a supported language to continue.'
      );
      return;
    }
    const nameSafety = detectExplicitSexualContent(fullName);
    if (!nameSafety.safe) {
      setLocalError(
        nameSafety.blockedReason ||
          'Explicit or sexual names are strictly prohibited on PK CHAT profiles.'
      );
      return;
    }
    setActiveUserMode(userModeChoice, firebaseUser?.uid);
    setAuthBusy(true);
    setLocalError(null);
    try {
      await completeOnboardingProfile({
        fullName: fullName.trim() || 'PK CHAT Member',
        avatarUrl,
        country: selectedCountry,
        preferredLanguageCode: resolvedLang.code,
        preferredLanguageName: resolvedLang.name,
        trusted: trustDevice,
        phoneNumber: discoveryPhone.trim() || pendingPhone || userAccount?.phoneNumber || undefined,
        allowPhoneDiscovery,
        userMode: userModeChoice,
        allowLocalFallback: true,
      });
    } catch (err) {
      const fbErr = err as { code?: string; message?: string };
      const codePrefix = fbErr?.code ? `[${fbErr.code}] ` : '';
      const msg = err instanceof Error ? err.message : 'Unable to save profile.';
      setLocalError(msg.includes('[') ? msg : `${codePrefix}${msg}`);
    } finally {
      setAuthBusy(false);
    }
  };

  // Screen 1: First-Time PK Chat Welcome Screen (strictly branded as PK Chat)
  if (activeScreen === 'splash' || (activeScreen === 'welcome' && !welcomeAgreed && !firebaseUser)) {
    return (
      <div
        data-pk-welcome-screen="true"
        className="min-h-[100dvh] flex flex-col items-center justify-between bg-gradient-to-br from-[#cde9ff] via-[#e4f5ff] to-[#b5e0ff] px-5 py-8 sm:py-12"
      >
        <GlobalSecurityOverlay />
        <StoreDownloadModal open={showStoreModal} onClose={() => setShowStoreModal(false)} />

        {/* Top bar */}
        <div className="w-full max-w-md flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-[#01123A] p-0.5 ring-1 ring-[#38bdf8]/80">
              <img
                src={BRAND_LOGO_URL}
                alt="PK Chat"
                className="w-full h-full rounded-[10px] object-cover"
                referrerPolicy="no-referrer"
              />
            </span>
            <span className="text-sm font-bold text-[#0369a1]">PK Chat</span>
          </div>
          <button
            type="button"
            onClick={() => setShowStoreModal(true)}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#eef8ff]/85 border border-[#7dd3fc]/80 hover:bg-[#e0f2fe] text-[#0369a1] text-xs font-semibold flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install / Stores</span>
          </button>
        </div>

        {/* Centered PK Chat Welcome Card */}
        <div className="my-auto w-full max-w-md rounded-3xl p-7 sm:p-9 bg-[#e3f3ff]/82 backdrop-blur-2xl border border-[#7dd3fc]/80 shadow-[0_25px_55px_rgba(2,132,199,0.24)] flex flex-col items-center text-center">
          <div className="relative mb-6">
            <div
              className="absolute -inset-2.5 rounded-full bg-gradient-to-tr from-[#0284c7]/40 via-[#38bdf8]/45 to-[#1d4ed8]/35 blur-lg"
              aria-hidden="true"
            />
            <div className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-3xl overflow-hidden bg-[#01123A] p-0.5 ring-2 ring-[#38bdf8] shadow-[0_0_36px_rgba(0,198,255,0.5)]">
              <img
                src={BRAND_LOGO_URL}
                alt="PK Chat dove and globe logo"
                className="w-full h-full rounded-[22px] object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Welcome to PK Chat
          </h1>
          <p className="mt-2 text-sm font-semibold text-[#0284c7]">
            One World, One Chat.
          </p>
          <p className="mt-2.5 text-xs sm:text-sm text-slate-600 leading-relaxed max-w-xs">
            Fast, private global messaging, voice &amp; video calls, live translation, and family safety.
          </p>

          {/* 3-Step Verification Overview */}
          <div className="mt-5 w-full grid grid-cols-3 gap-2 text-[11px] font-semibold text-[#0369a1]">
            <div className="rounded-xl bg-[#eef8ff]/90 border border-[#7dd3fc]/70 px-2 py-2">
              1. Gmail Login
            </div>
            <div className="rounded-xl bg-[#eef8ff]/90 border border-[#7dd3fc]/70 px-2 py-2">
              2. Live Photo
            </div>
            <div className="rounded-xl bg-[#eef8ff]/90 border border-[#7dd3fc]/70 px-2 py-2">
              3. Phone Setup
            </div>
          </div>

          <p className="mt-5 text-[11px] text-slate-600 leading-relaxed">
            Read our Privacy Policy. Tap <strong className="text-slate-800">&ldquo;Agree and Continue&rdquo;</strong> to accept the PK Chat Terms of Service and start verification.
          </p>

          <button
            id="pk-welcome-agree-btn"
            type="button"
            onClick={handleAgreeAndContinueWelcome}
            className="mt-5 w-full min-h-[50px] px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#0284c7] to-[#0077B6] hover:brightness-105 text-white text-sm sm:text-base font-bold transition-all shadow-[0_8px_24px_rgba(2,132,199,0.38)] flex items-center justify-center gap-2"
          >
            <span>Agree and Continue</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              handleAgreeAndContinueWelcome();
              setUserTypeChoice('old');
              setBiometricStatus(null);
              setShowBiometricRecoveryModal(true);
              void handleStartEyeFaceCameraCheck();
            }}
            className="mt-3.5 text-xs font-semibold text-[#0284c7] hover:underline"
          >
            Returning User? Open Camera &amp; Recover Account
          </button>
        </div>

        {/* Footer */}
        <p className="text-[11px] text-slate-500 text-center">
          PK Chat · Powered by Firebase &amp; Global Cloud Translation
        </p>
      </div>
    );
  }

  // Screen 2: Unified Sequential Onboarding (1. Gmail -> 2. Photo Verification -> 3. Country-Matched Phone -> Instant Open)
  if (activeScreen === 'welcome') {
    const isLockedDown = globalSecurityState.status === 'LOCKDOWN';
    const seqStep: 1 | 2 | 3 = !firebaseUser ? 1 : !photoVerified ? 2 : 3;
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#d2ebff] via-[#e4f5ff] to-[#b9e2ff] flex flex-col">
        <GlobalSecurityOverlay />
        <StoreDownloadModal open={showStoreModal} onClose={() => setShowStoreModal(false)} />

        <header className="w-full bg-gradient-to-r from-[#0284c7]/92 via-[#0ea5e9]/90 to-[#0077B6]/92 backdrop-blur-2xl text-white px-6 py-4 flex items-center justify-between gap-6 border-b border-sky-200/40">
          <div className="flex items-center gap-3 shrink-0">
            <span className="w-10 h-10 rounded-2xl bg-[#01123A] p-0.5 ring-2 ring-[#38bdf8]/80 shadow-[0_0_16px_rgba(0,198,255,0.5)] shrink-0">
              <img
                src={BRAND_LOGO_URL}
                alt="PK CHAT Logo"
                className="w-full h-full rounded-[14px] object-cover"
                referrerPolicy="no-referrer"
              />
            </span>
            <div>
              <span className="text-lg font-bold text-white whitespace-nowrap block leading-none">
                PK Chat
              </span>
              <span className="text-[11px] text-[#e0f2fe]">One World, One Chat</span>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#e0f2fe]">
            <button onClick={() => setActiveScreen('disaster_alerts')} className="hover:text-white whitespace-nowrap">
              Disaster Feeds
            </button>
            <button onClick={() => setActiveScreen('help_support')} className="hover:text-white whitespace-nowrap">
              Help &amp; Stores
            </button>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowStoreModal(true)}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install / Stores</span>
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 lg:py-14 grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 space-y-6">
            <p className="inline-flex items-center gap-2 text-xs font-semibold text-[#0284c7]">
              <Globe className="w-3.5 h-3.5" />
              <span>Welcome · Safe &amp; Private Global Messenger</span>
            </p>
            <h1 className="text-3xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-[1.12]">
              One World, One Chat.
            </h1>
            <p className="text-sm lg:text-base text-slate-600 max-w-xl leading-relaxed">
              Verified sequential onboarding keeps your account safe: <strong>1. Gmail Login</strong> →{' '}
              <strong>2. Live Photo Verification</strong> → <strong>3. Country &amp; Network Phone Check</strong> → instant access.
            </p>

            {isLockedDown && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                Emergency Security Lockdown is active. Standard logins are temporarily paused.
              </div>
            )}

            <div className="rounded-3xl bg-[#dff1ff]/78 backdrop-blur-2xl border border-[#7dd3fc]/80 p-5 space-y-3 shadow-[0_10px_30px_rgba(2,132,199,0.14)]">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-900">
                  Two-Way Auto Translation · English ↔ Tamil
                </p>
                <Globe className="w-4 h-4 text-[#0284c7]" />
              </div>
              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-[#cfeaff]/80 border border-[#7dd3fc]/65 rounded-2xl p-3">
                  <p className="font-medium text-blue-700 mb-1">London (English)</p>
                  <p className="text-slate-800">“Are we still meeting at 4 PM?”</p>
                </div>
                <div className="bg-[#d6efff]/85 border border-[#7dd3fc]/70 rounded-2xl p-3">
                  <p className="font-medium text-[#0284c7] mb-1">Colombo (Tamil)</p>
                  <p className="text-slate-800">“நாம் மாலை 4 மணிக்கு சந்திக்கிறோமா?”</p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-3xl bg-[#e3f3ff]/82 backdrop-blur-2xl border border-[#7dd3fc]/80 p-6 shadow-[0_20px_45px_rgba(2,132,199,0.2)] space-y-5">
              {/* Account Gate: New User vs Old User (Auto-Opens Front Camera Immediately) */}
              <div className="rounded-2xl bg-[#d4edff]/80 border border-[#7dd3fc]/75 p-3.5 space-y-2">
                <p className="text-[11px] font-bold text-[#0369a1]">
                  Account Type · புதியவரா அல்லது பழைய பயனரா?
                </p>
                <div className="grid sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setUserTypeChoice('new')}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-xs font-semibold transition-all ${
                      userTypeChoice === 'new'
                        ? 'bg-[#0284c7] border-[#0284c7] text-white shadow-xs'
                        : 'bg-[#ebf6ff]/80 border-[#7dd3fc]/70 text-slate-800 hover:border-[#0284c7]'
                    }`}
                  >
                    New User · Step-by-Step Setup
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUserTypeChoice('old');
                      setBiometricStatus(null);
                      setShowBiometricRecoveryModal(true);
                      void handleStartEyeFaceCameraCheck();
                    }}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-xs font-semibold flex items-center gap-2 transition-all ${
                      userTypeChoice === 'old'
                        ? 'bg-slate-900 border-[#0284c7] text-white shadow-xs'
                        : 'bg-[#ebf6ff]/80 border-[#7dd3fc]/70 text-[#0284c7] hover:border-[#0284c7]'
                    }`}
                  >
                    <ScanFace className="w-4 h-4 shrink-0" />
                    <span className="leading-tight">Old User · Open Camera &amp; Recover</span>
                  </button>
                </div>
              </div>

              {/* 3-Step Sequential Indicator */}
              <div className="grid grid-cols-3 gap-2 text-[11px] font-bold">
                {[
                  { num: 1 as const, label: '1. Gmail Login' },
                  { num: 2 as const, label: '2. Photo Verify' },
                  { num: 3 as const, label: '3. Country Phone' },
                ].map((st) => {
                  const done = seqStep > st.num;
                  const active = seqStep === st.num;
                  return (
                    <div
                      key={st.num}
                      className={`px-2.5 py-2 rounded-xl border text-center transition-colors ${
                        done
                          ? 'bg-sky-100 border-[#38bdf8] text-[#0369a1]'
                          : active
                            ? 'bg-[#0284c7] border-[#0284c7] text-white shadow-xs'
                            : 'bg-[#eef8ff]/75 border-[#7dd3fc]/65 text-slate-500'
                      }`}
                    >
                      {done ? `✓ ${st.label}` : st.label}
                    </div>
                  );
                })}
              </div>

              {/* STEP 1: Gmail Account Login First */}
              {seqStep === 1 && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-[#0284c7]" />
                      <span>Step 1 of 3 · Sign in with Gmail Account</span>
                    </h2>
                    <p className="text-xs text-slate-600">
                      Start with your Gmail account for instant PK Chat cloud verification, or choose your mode below. Includes 90-day Free Trial &amp; VIP Founder Life Limit Free Access.
                    </p>
                  </div>

                  {/* Quick Mode Selection right on Welcome */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-mode="general"
                      aria-pressed={userModeChoice === 'general'}
                      onClick={() => {
                        setUserModeChoice('general');
                        setActiveUserMode('general', firebaseUser?.uid);
                        setLocalError(null);
                      }}
                      className={`mode-btn min-h-[44px] px-3 py-2 rounded-xl border text-left transition-all ${
                        userModeChoice === 'general'
                          ? 'bg-[#0284c7] border-[#0284c7] text-white shadow-xs'
                          : 'bg-[#ebf6ff]/85 border-[#7dd3fc]/70 text-slate-800 hover:border-[#0284c7]'
                      }`}
                    >
                      <p className="text-xs font-bold leading-tight">General Use Mode</p>
                      <p className={`text-[10px] leading-tight mt-0.5 ${userModeChoice === 'general' ? 'text-sky-100' : 'text-slate-500'}`}>
                        Chat, Calls, SOS &amp; AI Translate
                      </p>
                    </button>
                    <button
                      type="button"
                      data-mode="business"
                      aria-pressed={userModeChoice === 'business'}
                      onClick={() => {
                        setUserModeChoice('business');
                        setActiveUserMode('business', firebaseUser?.uid);
                        setLocalError(null);
                      }}
                      className={`mode-btn min-h-[44px] px-3 py-2 rounded-xl border text-left transition-all ${
                        userModeChoice === 'business'
                          ? 'bg-[#0A192F] border-[#0A192F] text-white shadow-xs'
                          : 'bg-[#ebf6ff]/85 border-[#7dd3fc]/70 text-slate-800 hover:border-[#0284c7]'
                      }`}
                    >
                      <p className="text-xs font-bold leading-tight">Business / Advertiser Mode</p>
                      <p className={`text-[10px] leading-tight mt-0.5 ${userModeChoice === 'business' ? 'text-sky-200' : 'text-slate-500'}`}>
                        Chat + Global Ad Campaigns
                      </p>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={authBusy || isLockedDown}
                    className="w-full min-h-[50px] px-5 py-3.5 rounded-2xl bg-gradient-to-r from-[#0284c7] to-[#0077B6] hover:brightness-105 disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all"
                  >
                    <ShieldCheck className="w-5 h-5" />
                    <span>{authBusy ? 'Signing in with Gmail...' : 'Continue with Gmail Account'}</span>
                  </button>

                  <div id="inline-msg-panel" className="space-y-2.5" aria-live="polite">
                    {otpStatusMessage && !localError && !otpError && (
                      <div
                        role="status"
                        className="p-3 rounded-xl bg-sky-50 border border-[#7dd3fc] text-xs font-medium text-[#0369a1]"
                      >
                        {otpStatusMessage}
                      </div>
                    )}

                    {(localError || otpError) && (
                      <div
                        role="alert"
                        className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-xs font-medium text-rose-800 break-words space-y-2.5"
                      >
                        <p className="font-bold">Google Sign-In Error</p>
                        <p>{localError || otpError}</p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={authBusy || isLockedDown}
                            onClick={handleGoogleSignIn}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold"
                          >
                            Retry Gmail Sign-In
                          </button>
                          <button
                            type="button"
                            disabled={authBusy || isLockedDown}
                            onClick={handleInstantStartChat}
                            className="px-3 py-1.5 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white text-[11px] font-bold"
                          >
                            Continue into PK Chat Now
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {!firebaseUser && (
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                      <button
                        type="button"
                        onClick={() => setActiveScreen('phone_register')}
                        className="font-semibold text-[#0284c7] hover:underline"
                      >
                        Enter Phone Number Directly (No OTP)
                      </button>
                      <button
                        type="button"
                        disabled={authBusy || isLockedDown}
                        onClick={handleInstantStartChat}
                        className="font-semibold text-slate-600 hover:underline"
                      >
                        Quick Preview Start
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: Photo Verification (Live Front Camera or Crop/Upload) */}
              {seqStep === 2 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Camera className="w-5 h-5 text-[#0284c7]" />
                        <span>Step 2 of 3 · Live Photo Capture</span>
                      </h2>
                      <p className="text-xs text-slate-600">
                        Signed in as <strong>{fullName || firebaseUser?.displayName || 'Gmail Member'}</strong> · Capture or upload your profile photo.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void logoutUser()}
                      className="text-[11px] font-semibold text-[#0284c7] hover:underline"
                    >
                      Switch Gmail
                    </button>
                  </div>

                  <div className="rounded-2xl bg-slate-950 border border-[#bae6fd] overflow-hidden aspect-video relative flex items-center justify-center">
                    <video
                      ref={step2VideoRef}
                      autoPlay
                      muted
                      playsInline
                      className={`w-full h-full object-cover -scale-x-100 ${
                        step2CamActive ? 'block' : 'hidden'
                      }`}
                    />
                    {!step2CamActive && avatarUrl ? (
                      <div className="flex flex-col items-center gap-2 p-4">
                        <UserAvatar src={avatarUrl} name={fullName} size="xl" />
                        <span className="text-xs font-semibold text-sky-300">
                          Verification Photo Saved ✓
                        </span>
                      </div>
                    ) : !step2CamActive ? (
                      <div className="text-center space-y-2 p-4 text-slate-300">
                        <Camera className="w-10 h-10 mx-auto text-[#38bdf8]" />
                        <p className="text-xs font-medium">
                          Capture a live selfie photo or upload from gallery
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!step2CamActive ? (
                      <button
                        type="button"
                        onClick={() => void handleStartStep2LiveCamera()}
                        className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold flex items-center justify-center gap-2"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Open Front Camera</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleCaptureStep2Photo}
                        className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold flex items-center justify-center gap-2"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Capture &amp; Save Photo</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPhotoModal(true)}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-sky-50 border border-[#bae6fd] text-[#0369a1] text-xs font-bold"
                    >
                      Upload / Crop Photo
                    </button>
                  </div>

                  <ProfileImageEditorModal
                    open={showPhotoModal}
                    mode="avatar"
                    initialImageUrl={avatarUrl}
                    onClose={() => setShowPhotoModal(false)}
                    onSaveComplete={(res) => {
                      setAvatarUrl(res.dataUrl);
                      setLocalSuccess('Profile verification photo saved!');
                    }}
                  />

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Profile Name (Editable · Auto-filled from Gmail)
                      </label>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Enter your profile name"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 border border-[#7dd3fc]/70 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Preferred Language
                      </label>
                      <select
                        value={welcomeLangChoice === 'tanglish' ? 'ta-LK' : welcomeLangChoice}
                        onChange={(e) => {
                          const code = e.target.value;
                          setWelcomeLangChoice(code);
                          const match = LANGUAGES.find((l) => l.code === code);
                          try {
                            localStorage.setItem('pk_chat_language', match?.name || code);
                          } catch {
                            // ignore
                          }
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 border border-[#7dd3fc]/70 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                      >
                        {LANGUAGES.filter((l) => l.supported).map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.name} ({l.nativeName})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (!avatarUrl) {
                        setLocalError('Please capture or upload a verification photo before continuing.');
                        return;
                      }
                      setLocalError(null);
                      setPhotoVerified(true);
                    }}
                    className="w-full min-h-[48px] py-3 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm"
                  >
                    <span>Confirm Photo &amp; Continue to Phone Verification</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* STEP 3: OTP-Free Country & Phone Number Input -> Direct to Profile Screen */}
              {seqStep === 3 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Phone className="w-5 h-5 text-[#0284c7]" />
                        <span>Step 3 of 3 · Country &amp; Phone Number (No OTP)</span>
                      </h2>
                      <p className="text-xs text-slate-600">
                        Matched Region: <strong>{operatingCountry.countryName} ({operatingCountry.dialCode})</strong> · Foreign code mismatches are blocked.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPhotoVerified(false)}
                      className="text-[11px] font-semibold text-[#0284c7] hover:underline"
                    >
                      Edit Photo
                    </button>
                  </div>

                  <form
                    onSubmit={handleStep3OkNextToProfile}
                    className="space-y-4"
                  >
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Country / Region
                      </label>
                      <select
                        value={selectedCountry.code}
                        onChange={(e) => {
                          const found = COUNTRIES.find((c) => c.code === e.target.value);
                          if (found) setSelectedCountry(found);
                        }}
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 border border-[#7dd3fc]/70 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                      >
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.flag} {c.name} ({c.dialCode})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-3 px-1">
                      <span className="min-w-[60px] pb-2 border-b-2 border-[#0284c7] text-base font-mono font-bold text-slate-900 text-center shrink-0">
                        {selectedCountry.dialCode}
                      </span>
                      <input
                        id="phone-number"
                        type="tel"
                        inputMode="tel"
                        required
                        value={phoneLocal}
                        onChange={(e) => {
                          setPhoneLocal(e.target.value);
                          const val = e.target.value.trim();
                          setPendingPhone(val ? normalizePhoneToE164(val, selectedCountry.dialCode) : '');
                        }}
                        placeholder="mobile number (e.g. 77 123 4567)"
                        className="flex-1 pb-2 bg-transparent border-b-2 border-[#0284c7] text-base font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0369a1]"
                      />
                    </div>

                    {formattedE164Preview && (
                      <p className="text-[11px] font-mono text-slate-500">
                        Registered Calling Number: <span className="font-semibold text-[#0284c7]">{formattedE164Preview}</span>
                      </p>
                    )}

                    <button
                      id="step3-ok-next-btn"
                      type="submit"
                      disabled={authBusy || isLockedDown || !phoneLocal.trim()}
                      className="w-full min-h-[48px] py-3 rounded-xl bg-gradient-to-r from-[#0284c7] to-[#0ea5e9] hover:brightness-105 disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm"
                    >
                      <span>{authBusy ? 'Opening PK Chat...' : 'OK / Next · Open PK Chat'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span>OTP-free instant verification</span>
                    <span>
                      {isVipFounderFreeNumber(phoneLocal || pendingPhone)
                        ? '👑 VIP Founder · Lifetime Free Access'
                        : '90-Day Free Trial · Then $10/year'}
                    </span>
                  </div>
                </div>
              )}

              {(localError || otpError) && (
                <p className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
                  {localError || otpError}
                </p>
              )}
              {localSuccess && (
                <p className="p-3 rounded-xl bg-sky-50 border border-[#bae6fd] text-xs font-medium text-[#0369a1]">
                  {localSuccess}
                </p>
              )}
            </div>
          </div>
        </main>

        {/* Old User Immediate Camera & Face Recovery Modal */}
        {showBiometricRecoveryModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Biometric Eye and Face Account Recovery"
            className="fixed inset-0 z-50 bg-sky-950/60 backdrop-blur-md flex items-center justify-center p-4"
          >
            <div className="max-w-md w-full max-h-[90vh] overflow-y-auto rounded-3xl bg-[#e3f3ff]/88 backdrop-blur-2xl border border-[#7dd3fc] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[#0284c7]">
                  <ScanFace className="w-5 h-5 shrink-0" />
                  <h3 className="text-base font-bold text-slate-900">
                    Old User · Instant Camera &amp; Face Recovery
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBiometricRecoveryModal(false)}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100"
                  aria-label="Close biometric recovery modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Front camera opens automatically for Old User recovery. Capture your verification selfie or upload your photo, then sign in with Gmail or Phone to restore your account smoothly.
              </p>

              <div className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden aspect-video relative flex items-center justify-center">
                <video
                  ref={recoveryVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`w-full h-full object-cover -scale-x-100 ${
                    cameraPreviewActive ? 'block' : 'hidden'
                  }`}
                />
                {!cameraPreviewActive && recoveryCapturedPhoto ? (
                  <img
                    src={recoveryCapturedPhoto}
                    alt="Captured recovery face"
                    className="w-28 h-28 rounded-full object-cover ring-2 ring-[#38bdf8]"
                  />
                ) : !cameraPreviewActive ? (
                  <div className="text-center space-y-2 p-4 text-slate-300">
                    <Eye className="w-10 h-10 mx-auto text-[#38bdf8]" />
                    <p className="text-xs font-medium">
                      Opening front camera for Face Verification...
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={biometricBusy}
                  onClick={() => {
                    if (cameraPreviewActive) {
                      handleCaptureRecoveryPhoto();
                    } else {
                      void handleStartEyeFaceCameraCheck();
                    }
                  }}
                  className="min-h-[44px] py-2.5 px-3 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Camera className="w-4 h-4 shrink-0" />
                  <span>{cameraPreviewActive ? 'Capture Face Photo' : 'Restart Camera'}</span>
                </button>
                <label className="min-h-[44px] py-2.5 px-3 rounded-xl bg-sky-50 border border-[#bae6fd] hover:bg-sky-100 text-[#0369a1] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                  <span>Upload Face Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(ev) => {
                      handleAvatarUpload(ev);
                      setBiometricStatus('✅ Face photo uploaded! Choose Gmail or Phone below to restore your account.');
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              {biometricStatus && (
                <p className="p-3 rounded-xl bg-sky-50 border border-[#bae6fd] text-xs text-slate-800">
                  {biometricStatus}
                </p>
              )}

              <div className="pt-2 border-t border-slate-200 space-y-2">
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => {
                    setPhotoVerified(true);
                    setShowBiometricRecoveryModal(false);
                    void handleGoogleSignIn();
                  }}
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify &amp; Restore with Gmail Account</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowBiometricRecoveryModal(false);
                    setActiveScreen('phone_register');
                  }}
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#0369a1] hover:bg-[#075985] text-white text-xs font-bold flex items-center justify-center gap-2"
                >
                  <Phone className="w-4 h-4" />
                  <span>Restore via Phone Number Verification</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Screen 3: OTP-Free Mobile Phone Number Setup Screen
  if (activeScreen === 'phone_register') {
    const isVerifiedSignedIn = Boolean(firebaseUser && firebaseUser.phoneNumber);

    return (
      <div className="min-h-screen bg-gradient-to-br from-[#d2ebff] via-[#e4f5ff] to-[#b9e2ff] dark:from-[#0b132b] dark:to-[#020617] flex flex-col">
        <header className="w-full bg-gradient-to-r from-[#0284c7]/92 to-[#0077B6]/92 dark:bg-[#0a192f] backdrop-blur-2xl text-white px-4 py-3.5 flex items-center justify-between gap-3 shadow-sm border-b border-sky-200/40">
          <div className="flex items-center gap-2 min-w-0">
            {!isVerifiedSignedIn && (
              <button
                type="button"
                onClick={() => setActiveScreen('welcome')}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-white/10 text-white"
                aria-label="Back to Welcome"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <span className="w-9 h-9 rounded-full bg-[#01123A] p-0.5 ring-2 ring-[#38bdf8]/80 shadow-[0_0_14px_rgba(56,189,248,0.5)] shrink-0">
              <img
                src={BRAND_LOGO_URL}
                alt="PK Chat"
                className="w-full h-full rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            </span>
            <span className="text-lg font-bold tracking-tight truncate">PK Chat</span>
          </div>
          <span className="text-xs font-medium text-[#e0f2fe] shrink-0">
            Phone Number Setup
          </span>
        </header>

        <div className="flex-1 flex flex-col justify-center py-8 px-4">
          <div className="max-w-lg w-full mx-auto bg-[#e3f3ff]/84 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
            {isVerifiedSignedIn ? (
              !userAccountLoaded ? (
                <div className="py-12 text-center space-y-3">
                  <div className="w-8 h-8 mx-auto rounded-full border-2 border-[#0284c7] border-t-transparent animate-spin" />
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Checking your PK CHAT account...
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <span className="text-xs font-semibold text-[#0284c7] dark:text-[#38bdf8]">
                      Account Connected ✓
                    </span>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Mobile Number Profile
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold text-[#0284c7] dark:text-white">
                    Enter Your Mobile Phone Number
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                    Save your mobile phone number securely in your PK Chat profile for calling and contact discovery.
                  </p>

                  <form onSubmit={handleSavePhoneWhenSignedIn} className="mt-6 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Country &amp; Mobile Phone Number
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={selectedCountry.code}
                          onChange={(e) => {
                            const found = COUNTRIES.find((c) => c.code === e.target.value);
                            if (found) setSelectedCountry(found);
                          }}
                          className="min-h-[44px] px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono font-medium text-slate-900 dark:text-white shrink-0"
                        >
                          {COUNTRIES.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.flag} {c.dialCode}
                            </option>
                          ))}
                        </select>
                        <input
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          autoFocus
                          required
                          value={phoneLocal}
                          onChange={(e) => {
                            setPhoneLocal(e.target.value);
                            const val = e.target.value.trim();
                            setPendingPhone(val ? normalizePhoneToE164(val, selectedCountry.dialCode) : '');
                          }}
                          placeholder="071 786 0693 or 9876543210"
                          className="flex-1 px-4 py-3 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-base font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                        />
                      </div>
                      {formattedE164Preview && (
                        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                          Mobile Number to Save:{' '}
                          <span className="font-semibold text-[#0284c7] dark:text-[#38bdf8]">
                            {formattedE164Preview}
                          </span>
                        </p>
                      )}
                      <label className="mt-3 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowPhoneDiscovery}
                          onChange={(e) => setAllowPhoneDiscovery(e.target.checked)}
                          className="mt-0.5 rounded text-[#0284c7]"
                        />
                        <span>
                          Allow contacts with my phone number to find, call &amp; message me on PK Chat
                        </span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={authBusy || !phoneLocal.trim()}
                      className="w-full min-h-[48px] py-3.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
                    >
                      <span>{authBusy ? 'Saving...' : 'OK / Next'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                </>
              )
            ) : (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <h2 className="text-xl sm:text-2xl font-bold text-[#0284c7] dark:text-white">
                    Enter your phone number
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    OTP-free registration — enter your country and mobile number to continue directly to your profile.
                  </p>
                </div>

                <form onSubmit={handleStep3OkNextToProfile} className="space-y-5">
                  <div>
                    <select
                      value={selectedCountry.code}
                      onChange={(e) => {
                        const found = COUNTRIES.find((c) => c.code === e.target.value);
                        if (found) setSelectedCountry(found);
                      }}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/75 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.name} ({c.dialCode})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-3 px-2">
                    <span className="w-16 pb-2 border-b-2 border-[#0284c7] dark:border-[#38bdf8] text-base font-mono font-bold text-slate-900 dark:text-white text-center shrink-0">
                      {selectedCountry.dialCode}
                    </span>
                    <input
                      id="phone-register-input"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      autoFocus
                      required
                      value={phoneLocal}
                      onChange={(e) => {
                        setPhoneLocal(e.target.value);
                        const val = e.target.value.trim();
                        setPendingPhone(val ? normalizePhoneToE164(val, selectedCountry.dialCode) : '');
                      }}
                      placeholder="mobile number"
                      className="flex-1 pb-2 bg-transparent border-b-2 border-[#0284c7] dark:border-[#38bdf8] text-base font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#0369a1]"
                    />
                  </div>

                  {formattedE164Preview && (
                    <p className="text-center text-xs font-mono text-slate-500 dark:text-slate-400">
                      Calling Number: <span className="font-semibold text-[#0284c7] dark:text-[#38bdf8]">{formattedE164Preview}</span>
                    </p>
                  )}

                  <button
                    id="send-otp-btn-screen4"
                    type="submit"
                    disabled={authBusy || !phoneLocal.trim()}
                    className="w-full min-h-[48px] py-3.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-60 text-white text-base font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
                  >
                    <span>{authBusy ? 'Preparing Profile...' : 'OK / Next'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>

                <div className="pt-3 border-t border-sky-200/70 dark:border-slate-800 space-y-2.5">
                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={handleGoogleSignIn}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#dff1ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/80 dark:border-slate-700 hover:bg-[#bae6fd]/70 dark:hover:bg-slate-800 disabled:opacity-60 text-slate-900 dark:text-white text-xs font-bold flex items-center justify-center gap-2 backdrop-blur-xl"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#0284c7]" />
                    <span>{authBusy ? 'Signing in...' : 'Continue with Gmail Account'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBiometricStatus(null);
                      setShowBiometricRecoveryModal(true);
                      void handleStartEyeFaceCameraCheck();
                    }}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-2"
                  >
                    <ScanFace className="w-4 h-4 text-[#0284c7]" />
                    <span>Face / Eye Biometric Check &amp; Account Recovery</span>
                  </button>
                </div>
              </div>
            )}

            {otpStatusMessage && !localError && (
              <p className="mt-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-xs text-blue-800 dark:text-blue-200">
                {otpStatusMessage}
              </p>
            )}
            {localSuccess && (
              <p className="mt-4 p-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-[#bae6fd] dark:border-sky-800 text-xs text-[#0369a1] dark:text-[#38bdf8]">
                {localSuccess}
              </p>
            )}
            {(localError || otpError) && (
              <p className="mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300">
                {localError || otpError}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Screen 6: Profile Creation Screen
  if (activeScreen === 'profile_create') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#d2ebff] via-[#e4f5ff] to-[#b9e2ff] dark:bg-slate-950 py-8 px-4">
        <div className="max-w-lg mx-auto bg-[#e3f3ff]/84 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs font-medium text-[#0284c7] dark:text-[#38bdf8] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              Verified Account
            </span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Step 3 of 4 · Create Profile
            </span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Set up your PK CHAT profile
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Your phone number stays isolated in private storage. Only your name, country, and preferred language are shared with chat contacts.
          </p>

          <div className="mt-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="shrink-0">
                <UserAvatar src={avatarUrl} name={fullName} size="xl" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPhotoModal(true)}
                    className="px-3.5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-xs font-semibold text-white flex items-center gap-1.5"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{avatarUrl ? 'Change / Crop Photo' : 'Add Profile Photo'}</span>
                  </button>
                  <label className="inline-block px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer">
                    Quick Upload
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                  </label>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => setAvatarUrl('')}
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Add Profile Photo from Gallery or Camera and crop before saving. You can change or remove it anytime.
                </p>
              </div>
            </div>
            <ProfileImageEditorModal
              open={showPhotoModal}
              mode="avatar"
              initialImageUrl={avatarUrl}
              onClose={() => setShowPhotoModal(false)}
              onSaveComplete={(res) => setAvatarUrl(res.dataUrl)}
            />

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full px-4 py-3 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Country
              </label>
              <select
                value={selectedCountry.code}
                onChange={(e) => {
                  const found = COUNTRIES.find((c) => c.code === e.target.value);
                  if (found) setSelectedCountry(found);
                }}
                className="w-full px-4 py-3 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name} ({c.dialCode})
                  </option>
                ))}
              </select>
            </div>

            {firebaseUser?.phoneNumber || pendingPhone || userAccount?.phoneNumber ? (
              <div className="p-3.5 rounded-2xl bg-[#dff1ff]/80 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#0284c7] dark:text-[#38bdf8]">
                    Registered PK Chat Calling Number
                  </p>
                  <p className="text-sm font-mono font-semibold text-slate-900 dark:text-white mt-0.5">
                    {pendingPhone || userAccount?.phoneNumber || firebaseUser?.phoneNumber}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-[#0284c7]/15 text-[#0284c7] dark:text-[#38bdf8] text-[11px] font-bold">
                  Active
                </span>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-[#dff1ff]/80 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    Optional Phone Number for Contact Matching
                  </label>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-2">
                    Only if you enter your phone number (stored as an encrypted SHA-256 hash) can contacts who type your number find &amp; request to connect with you on PK CHAT. You can cancel this anytime.
                  </p>
                  <div className="flex gap-2">
                    <span className="px-3 py-2.5 rounded-xl bg-[#eef8ff]/90 dark:bg-slate-900 border border-[#7dd3fc]/70 dark:border-slate-800 text-xs font-mono flex items-center shrink-0">
                      {selectedCountry.flag} {selectedCountry.dialCode}
                    </span>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={discoveryPhone}
                      onChange={(e) => setDiscoveryPhone(e.target.value)}
                      placeholder="Optional mobile number (e.g. 071 786 0693)"
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/90 dark:bg-slate-900 border border-[#7dd3fc]/70 dark:border-slate-800 text-sm font-mono"
                    />
                  </div>
                </div>
                <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowPhoneDiscovery}
                    onChange={(e) => setAllowPhoneDiscovery(e.target.checked)}
                    className="mt-0.5 rounded text-[#0284c7]"
                  />
                  <span>
                    Allow PK CHAT contacts who type my phone number to send me a connection request (optional — can be cancelled anytime)
                  </span>
                </label>
              </div>
            )}

            {/* Date of Birth & Automatic Minor Safety Mode (<18 Protection) */}
            <div className="p-4 rounded-2xl bg-[#f0f9ff] dark:bg-slate-950 border border-[#bae6fd] dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#0284c7] dark:text-[#38bdf8] shrink-0" />
                  <span>Date of Birth &amp; Minor Safety Mode (&lt;18)</span>
                </p>
                {(() => {
                  const age = computeAgeFromDob(birthDate);
                  if (age === null) return null;
                  return (
                    <span
                      className={`text-[11px] font-bold ${
                        age < 18 ? 'text-amber-700 dark:text-amber-300' : 'text-[#0284c7] dark:text-[#38bdf8]'
                      }`}
                    >
                      Age {age} · {age < 18 ? 'Minor Shield Active' : 'Standard 18+ Verified'}
                    </span>
                  );
                })()}
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  பிறந்த தேதி (Date of Birth — Age under 18 automatically activates Minor Shield)
                </label>
                <input
                  type="date"
                  value={birthDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => {
                    const nextDob = e.target.value;
                    setBirthDate(nextDob);
                    const calculatedAge = computeAgeFromDob(nextDob);
                    const isMinor = calculatedAge !== null && calculatedAge < 18;
                    setMinorSafetyMode(isMinor);
                    try {
                      window.localStorage.setItem('pk_user_dob', nextDob);
                      window.localStorage.setItem('pk_minor_safety_mode', isMinor ? 'true' : 'false');
                    } catch {
                      // ignore storage issues
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/90 dark:bg-slate-900 border border-[#7dd3fc]/80 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setMinorSafetyMode(false);
                    try {
                      window.localStorage.setItem('pk_minor_safety_mode', 'false');
                    } catch {
                      // ignore
                    }
                  }}
                  className={`py-2 px-3 rounded-xl border font-semibold ${
                    !minorSafetyMode
                      ? 'bg-[#0284c7] text-white border-[#0284c7]'
                      : 'bg-[#e3f3ff]/80 dark:bg-slate-900 border-[#7dd3fc]/70 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  18+ Standard Adult
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMinorSafetyMode(true);
                    try {
                      window.localStorage.setItem('pk_minor_safety_mode', 'true');
                    } catch {
                      // ignore
                    }
                  }}
                  className={`py-2 px-3 rounded-xl border font-semibold ${
                    minorSafetyMode
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-[#e3f3ff]/80 dark:bg-slate-900 border-[#7dd3fc]/70 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Under 18 · Minor Shield
                </button>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                18 வயதுக்குக் குறைவானவர்களுக்கு Minor Safety Mode தானாகவே இயக்கப்பட்டு செக்ஸுவல் மற்றும் சம்மதப் பாதுகாப்பு மீடியா பூட்டப்படும்.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!fullName.trim()) {
                  setLocalError('Please enter your full name.');
                  return;
                }
                const profileNameSafety = detectExplicitSexualContent(fullName);
                if (!profileNameSafety.safe) {
                  setLocalError(
                    profileNameSafety.blockedReason ||
                      'Explicit or sexual names are strictly prohibited on PK CHAT profiles.'
                  );
                  return;
                }
                if (discoveryPhone.trim()) {
                  const e164 = normalizePhoneToE164(discoveryPhone, selectedCountry.dialCode);
                  const digits = e164.replace(/\D/g, '').length;
                  if (digits < 8 || digits > 15) {
                    setLocalError('Enter a valid optional phone number (8-15 digits) or leave it blank.');
                    return;
                  }
                }
                setLocalError(null);
                setActiveScreen('language_select');
              }}
              className="w-full py-3 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <span>Next: Choose Language &amp; Culture</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {localError && <p className="text-xs text-rose-600">{localError}</p>}
          </div>
        </div>
      </div>
    );
  }

  // Screen 7: Preferred Language Selection Screen (NEVER auto-selected from country!)
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#d2ebff] via-[#e4f5ff] to-[#b9e2ff] dark:bg-slate-950 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-[#e3f3ff]/84 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setActiveScreen('profile_create')}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
            aria-label="Back to Profile Creation"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Step 4 of 4 · Independent Language Selection
          </span>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Choose your personal preferred language
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          PK CHAT never guesses your language from your country ({selectedCountry.name}). Pick the exact language you want to read and hear all incoming messages and calls in.
        </p>

        <div className="mt-5 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={langSearch}
            onChange={(e) => setLangSearch(e.target.value)}
            placeholder="Search language (e.g. Tamil, English, Sinhala, Japanese)"
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="mt-4 grid sm:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
          {filteredLanguages.map((lang) => {
            const isSelected = chosenLangCode === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  setChosenLangCode(lang.code);
                  setLocalError(
                    lang.supported
                      ? null
                      : `"${lang.name}" is not currently supported for automatic translation. Please choose a supported language.`
                  );
                }}
                className={`p-3.5 rounded-2xl border text-left transition-colors flex items-center justify-between ${
                  isSelected
                    ? lang.supported
                      ? 'border-[#0284c7] bg-[#bae6fd]/75 dark:bg-sky-950/40'
                      : 'border-amber-500 bg-amber-50 dark:bg-amber-950/40'
                    : 'border-[#7dd3fc]/65 bg-[#dff1ff]/60 dark:border-slate-800 hover:bg-[#cdeaff]/80 dark:hover:bg-slate-800/60'
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {lang.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang.nativeName} · {lang.supported ? 'Supported' : 'Unsupported'}
                  </p>
                </div>
                {isSelected && (
                  lang.supported ? (
                    <Check className="w-4 h-4 text-[#0284c7] shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  )
                )}
              </button>
            );
          })}
        </div>

        {/* Inline message panel for unauthenticated/blocked TWA & preview users */}
        <div id="inline-msg-panel" className="mt-4 space-y-3" aria-live="polite">
          {otpStatusMessage && !localError && !otpError && (
            <div
              role="status"
              className="p-3 rounded-xl bg-sky-50 border border-[#7dd3fc] text-xs font-medium text-[#0369a1]"
            >
              {otpStatusMessage}
            </div>
          )}

          {(localError || otpError) && (() => {
            const rawErrorText = localError || otpError || '';
            const extractedCodeMatch = rawErrorText.match(/^\[([^\]]+)\]\s*(.*)$/);
            const displayCode = extractedCodeMatch?.[1] || otpErrorCode || 'Error';
            const displayMessage = extractedCodeMatch?.[2] || rawErrorText;
            return (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-400 dark:border-red-800 text-xs text-red-800 dark:text-red-200 space-y-2 break-words"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                  <p>
                    <strong>[{displayCode}]</strong>: {displayMessage}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {!firebaseUser && (
                    <button
                      type="button"
                      disabled={authBusy}
                      onClick={handleGoogleSignIn}
                      className="px-3 py-1.5 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white text-[11px] font-bold"
                    >
                      Continue with Sign-In
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={handleFinishProfileAndLanguage}
                    className="px-3 py-1.5 rounded-lg bg-white border border-red-300 text-red-800 text-[11px] font-bold hover:bg-red-100"
                  >
                    Continue into PK Chat
                  </button>
                </div>
              </div>
            );
          })()}

          {!firebaseUser && (
            <div className="inline-auth-banner p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-amber-950 dark:text-amber-100 space-y-0.5">
                <p className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#0284c7] shrink-0" />
                  <span>Authentication recommended for cloud sync</span>
                </p>
                <p className="text-[11px] text-amber-900/90 dark:text-amber-200/90">
                  Sign in with Gmail for cloud sync on project <span className="font-mono">pkchat-41ef3</span>, or press <strong>Start PK CHAT</strong> below to enter immediately in your selected mode.
                </p>
              </div>
              <button
                id="inline-auth-btn"
                type="button"
                disabled={authBusy}
                onClick={handleGoogleSignIn}
                className="shrink-0 min-h-[40px] px-3.5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold whitespace-nowrap transition-colors"
              >
                {authBusy ? 'Connecting...' : 'Continue with Sign-In'}
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 p-3.5 rounded-2xl bg-[#dff1ff]/80 border border-[#7dd3fc]/70 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#0c4a6e] flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-[#0284c7]" />
              <span>Select Your PK CHAT Mode</span>
            </span>
            <span className="text-[11px] font-semibold text-[#0284c7]">
              Active: {userModeChoice === 'business' ? 'Business / Advertiser' : 'General Use'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              data-mode="general"
              aria-pressed={userModeChoice === 'general'}
              onClick={() => {
                setUserModeChoice('general');
                setActiveUserMode('general', firebaseUser?.uid);
                setLocalError(null);
              }}
              className={`mode-btn p-2.5 rounded-xl border text-left transition-all ${
                userModeChoice === 'general'
                  ? 'bg-[#e8f5ff] border-[#0284c7] ring-2 ring-[#0284c7]/30'
                  : 'bg-[#eef8ff]/60 border-[#7dd3fc]/60 hover:bg-[#e3f3ff]'
              }`}
            >
              <p className="text-xs font-bold text-slate-900">General Use Mode</p>
              <p className="text-[11px] text-slate-600">
                Chat, Calls, Live Classes · 90-day (3-month) free trial, then $10/yr (once every 12 months)
              </p>
            </button>
            <button
              type="button"
              data-mode="business"
              aria-pressed={userModeChoice === 'business'}
              onClick={() => {
                setUserModeChoice('business');
                setActiveUserMode('business', firebaseUser?.uid);
                setLocalError(null);
              }}
              className={`mode-btn p-2.5 rounded-xl border text-left transition-all ${
                userModeChoice === 'business'
                  ? 'bg-[#e8f5ff] border-[#0284c7] ring-2 ring-[#0284c7]/30'
                  : 'bg-[#eef8ff]/60 border-[#7dd3fc]/60 hover:bg-[#e3f3ff]'
              }`}
            >
              <p className="text-xs font-bold text-slate-900">Business / Advertiser Mode</p>
              <p className="text-[11px] text-slate-600">
                $0 setup · Pay $5/$10 on publish or $100/yr Unlimited Ads &amp; Videos
              </p>
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-[#0284c7] dark:text-[#38bdf8] shrink-0" />
            <span>
              {isVipFounderFreeNumber(pendingPhone || userAccount?.phoneNumber || firebaseUser?.phoneNumber)
                ? 'VIP Founder · Lifetime 100% Free Access (Subscription, Ads & Videos)'
                : '90-day (3-month) free trial · Then $10/year (once every 12 months) via Play Store'}
            </span>
          </div>
          <button
            id="startButton"
            type="button"
            disabled={authBusy}
            onClick={() => {
              setActiveUserMode(userModeChoice, firebaseUser?.uid);
              void handleFinishProfileAndLanguage();
            }}
            className="min-h-[46px] px-6 py-3 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-white text-sm font-bold transition-colors whitespace-nowrap shadow-sm"
          >
            {authBusy ? 'Entering PK CHAT...' : 'Start PK CHAT'}
          </button>
        </div>
      </div>
    </div>
  );
}
