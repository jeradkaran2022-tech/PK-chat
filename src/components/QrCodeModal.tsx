import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  Check,
  Copy,
  Download,
  ImagePlus,
  MessageSquare,
  Phone,
  QrCode,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  UserPlus,
  Video,
  X,
} from 'lucide-react';
import {
  Timestamp,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { usePkChat } from '../context/PkChatContext';
import {
  OperationType,
  auth,
  buildFirestoreErrorInfo,
  db,
  isTransientFirestoreError,
} from '../lib/firebase';
import {
  ServerQrProfile,
  ServerQrTokenResponse,
  issueServerQrToken,
  revokeServerQrToken,
  subscribeQrServerStream,
  verifyServerQrToken,
} from '../lib/api';
import { BRAND_LOGO_URL } from '../data/constants';
import { UserAvatar } from './UserAvatar';
import { PkQrCodeGraphic, drawPkBrandLogoOnCanvas } from './PkChatQrEmblem';

export type QrModalInitialTab = 'my_code' | 'scan_code';

interface QrCodeModalProps {
  open: boolean;
  initialTab?: QrModalInitialTab;
  onClose: () => void;
  onAfterActionNavigate?: () => void;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
    };
  }
}

export function QrCodeModal({
  open,
  initialTab = 'my_code',
  onClose,
  onAfterActionNavigate,
}: QrCodeModalProps) {
  const {
    userProfile,
    userAccount,
    profileMedia,
    contacts,
    addContact,
    startDirectChat,
    startCall,
    setActiveScreen,
  } = usePkChat();

  const [activeTab, setActiveTab] = useState<QrModalInitialTab>(initialTab);
  const [tokenState, setTokenState] = useState<ServerQrTokenResponse | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [rotatingToken, setRotatingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [liveScanNotice, setLiveScanNotice] = useState<string | null>(null);

  // Camera & Scanner state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const lastScannedRawRef = useRef<{ value: string; atMs: number } | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCodeInput, setManualCodeInput] = useState('');
  const [verifyingScan, setVerifyingScan] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [verifiedContact, setVerifiedContact] = useState<ServerQrProfile | null>(null);
  const [actionStatusMsg, setActionStatusMsg] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const myUid = userProfile?.uid || auth.currentUser?.uid || 'pk_guest_preview';
  const myAvatar = profileMedia?.avatarDataUrl || userProfile?.avatarUrl || '';

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setScanError(null);
      setActionStatusMsg(null);
    }
  }, [open, initialTab]);

  const extractTokenIdFromRaw = (rawText: string): string | null => {
    const trimmed = rawText.trim();
    const match = /^pkc:qr:v1:([a-zA-Z0-9_-]{4,128}):[a-f0-9]{16,128}$/i.exec(trimmed);
    return match ? match[1] : null;
  };

  const syncQrTokenToFirestore = useCallback(async (issued: ServerQrTokenResponse) => {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== issued.profile.uid) return;
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(issued.tokenId)) return;

    const tokenPath = `qr_tokens/${issued.tokenId}`;
    const ref = doc(db, 'qr_tokens', issued.tokenId);
    const parsedExpiry = Date.parse(issued.expiresAt);
    const expiresAtDate = new Date(
      Number.isFinite(parsedExpiry) && parsedExpiry > Date.now() + 60_000
        ? parsedExpiry
        : Date.now() + 365 * 24 * 60 * 60 * 1000
    );

    const safeCountry = (issued.profile.country || 'Sri Lanka').trim().slice(0, 80) || 'Sri Lanka';
    const safeCountryCode =
      (issued.profile.countryCode || 'LK').trim().slice(0, 8).padEnd(2, 'X') || 'LK';
    const safeLang =
      (issued.profile.preferredLanguage || 'en').trim().slice(0, 16).padEnd(2, 'n') || 'en';
    const safeLangName =
      (issued.profile.preferredLanguageName || 'English').trim().slice(0, 64) || 'English';
    const safeName = (issued.profile.fullName || 'PK Chat Member').trim().slice(0, 100) || 'PK Chat Member';
    const safeAbout = (issued.profile.about || 'Available on PK Chat').trim().slice(0, 140);

    try {
      const existingSnap = await getDoc(ref);
      if (!existingSnap.exists()) {
        await setDoc(ref, {
          tokenId: issued.tokenId,
          userId: currentUser.uid,
          fullName: safeName,
          country: safeCountry,
          countryCode: safeCountryCode,
          preferredLanguage: safeLang,
          preferredLanguageName: safeLangName,
          about: safeAbout,
          status: 'active',
          issuedAt: serverTimestamp(),
          expiresAt: Timestamp.fromDate(expiresAtDate),
          updatedAt: serverTimestamp(),
        });
      } else if (existingSnap.data()?.status === 'active') {
        await updateDoc(ref, {
          fullName: safeName,
          country: safeCountry,
          countryCode: safeCountryCode,
          preferredLanguage: safeLang,
          preferredLanguageName: safeLangName,
          about: safeAbout,
          status: 'active',
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      if (!isTransientFirestoreError(err)) {
        const info = buildFirestoreErrorInfo(err, OperationType.WRITE, tokenPath);
        console.warn('Firestore QR token sync warning:', JSON.stringify(info));
      }
    }
  }, []);

  const revokeQrTokenInFirestore = useCallback(async (prevTokenId?: string | null) => {
    const currentUser = auth.currentUser;
    if (!currentUser || !prevTokenId || !/^[a-zA-Z0-9_-]{1,128}$/.test(prevTokenId)) return;

    const tokenPath = `qr_tokens/${prevTokenId}`;
    const ref = doc(db, 'qr_tokens', prevTokenId);
    try {
      const snap = await getDoc(ref);
      if (snap.exists() && snap.data()?.userId === currentUser.uid && snap.data()?.status === 'active') {
        await updateDoc(ref, {
          status: 'revoked',
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      if (!isTransientFirestoreError(err)) {
        const info = buildFirestoreErrorInfo(err, OperationType.UPDATE, tokenPath);
        console.warn('Firestore QR token revoke warning:', JSON.stringify(info));
      }
    }
  }, []);

  // Fetch / sync real-time server cryptographic QR token when modal opens
  const loadOrSyncServerToken = useCallback(async () => {
    if (!open || !myUid) return;
    setLoadingToken(true);
    setTokenError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken().catch(() => undefined);
      const issued = await issueServerQrToken({
        uid: myUid,
        fullName: userProfile?.fullName || 'PK Chat Member',
        phoneNumber: userAccount?.phoneNumber || '',
        country: userProfile?.country || 'Sri Lanka',
        countryCode: userProfile?.countryCode || 'LK',
        preferredLanguage: userProfile?.preferredLanguage || 'en',
        preferredLanguageName: userProfile?.preferredLanguageName || 'English',
        about: userProfile?.about || profileMedia?.about || 'Available on PK Chat',
        avatarUrl: myAvatar,
        idToken,
      });
      setTokenState(issued);
      void syncQrTokenToFirestore(issued);
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : 'Unable to load your QR code from server.');
    } finally {
      setLoadingToken(false);
    }
  }, [
    open,
    myUid,
    userProfile?.fullName,
    userProfile?.country,
    userProfile?.countryCode,
    userProfile?.preferredLanguage,
    userProfile?.preferredLanguageName,
    userProfile?.about,
    userAccount?.phoneNumber,
    profileMedia?.about,
    myAvatar,
    syncQrTokenToFirestore,
  ]);

  useEffect(() => {
    if (!open) return;
    void loadOrSyncServerToken();
  }, [open, loadOrSyncServerToken]);

  // Real-time SSE listener for instant server scan notifications & rotations
  useEffect(() => {
    if (!open || !myUid) return;
    return subscribeQrServerStream(myUid, {
      onScanned: (evt) => {
        setTokenState((prev) => (prev ? { ...prev, scanCount: evt.scanCount } : prev));
        setLiveScanNotice('Verified scan detected in real time.');
        window.setTimeout(() => setLiveScanNotice(null), 4000);
      },
      onRevoked: () => {
        setLiveScanNotice('QR code reset and re-synced with server.');
        window.setTimeout(() => setLiveScanNotice(null), 3500);
      },
    });
  }, [open, myUid]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const verifyScannedString = useCallback(
    async (rawQrText: string) => {
      const clean = rawQrText.trim();
      if (!clean || verifyingScan) return;
      const now = Date.now();
      if (
        lastScannedRawRef.current &&
        lastScannedRawRef.current.value === clean &&
        now - lastScannedRawRef.current.atMs < 2500
      ) {
        return;
      }
      lastScannedRawRef.current = { value: clean, atMs: now };

      setVerifyingScan(true);
      setScanError(null);
      setActionStatusMsg(null);
      try {
        const res = await verifyServerQrToken({
          rawQrText: clean,
          scannerUid: myUid,
        });
        stopCamera();
        setVerifiedContact(res.profile);
      } catch (serverErr) {
        // Fallback to Cloud Firestore qr_tokens capability record if signed in
        const fallbackTokenId = extractTokenIdFromRaw(clean);
        if (fallbackTokenId && auth.currentUser) {
          try {
            const snap = await getDoc(doc(db, 'qr_tokens', fallbackTokenId));
            if (snap.exists()) {
              const data = snap.data();
              const expiresAtMs =
                typeof data?.expiresAt?.toMillis === 'function' ? data.expiresAt.toMillis() : 0;
              if (data?.status === 'revoked') {
                setScanError('This QR code has been reset by its owner. Ask them to share their new code.');
                return;
              }
              if (expiresAtMs && expiresAtMs <= Date.now()) {
                setScanError('This QR code has expired. Ask your contact to refresh their QR code.');
                return;
              }
              if (data?.status === 'active' && typeof data?.userId === 'string') {
                let avatarUrl = '';
                try {
                  const profileSnap = await getDoc(doc(db, 'user_profiles', data.userId));
                  if (profileSnap.exists() && typeof profileSnap.data()?.avatarUrl === 'string') {
                    avatarUrl = profileSnap.data().avatarUrl;
                  }
                } catch {
                  // optional avatar hydration
                }
                stopCamera();
                setVerifiedContact({
                  uid: data.userId,
                  fullName: String(data.fullName || 'PK Chat Member'),
                  phoneNumber: '',
                  country: String(data.country || 'Sri Lanka'),
                  countryCode: String(data.countryCode || 'LK'),
                  preferredLanguage: String(data.preferredLanguage || 'en'),
                  preferredLanguageName: String(data.preferredLanguageName || 'English'),
                  about: String(data.about || 'Available on PK Chat'),
                  avatarUrl,
                });
                return;
              }
            }
          } catch {
            // Fall through to primary server verification error message
          }
        }
        setScanError(
          serverErr instanceof Error ? serverErr.message : 'Unable to verify scanned QR code.'
        );
      } finally {
        setVerifyingScan(false);
      }
    },
    [myUid, stopCamera, verifyingScan]
  );

  // Built-in camera stream + BarcodeDetector / jsQR real-time scanning loop
  useEffect(() => {
    if (!open || activeTab !== 'scan_code' || verifiedContact) {
      stopCamera();
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let lastDecodeAt = 0;

    const detector =
      typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function'
        ? new window.BarcodeDetector({ formats: ['qr_code'] })
        : null;

    const startCameraAndScan = async () => {
      setCameraError(null);
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera access is unavailable in this browser window. Upload a QR photo or enter a code below.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraActive(true);

        const scanTick = async (ts: number) => {
          if (cancelled) return;
          const video = videoRef.current;
          if (video && video.readyState >= 2 && video.videoWidth > 0 && ts - lastDecodeAt >= 110) {
            lastDecodeAt = ts;
            try {
              if (detector) {
                const hits = await detector.detect(video);
                const raw = hits.find((h) => Boolean(h.rawValue))?.rawValue;
                if (raw) {
                  void verifyScannedString(raw);
                  return;
                }
              }
              const canvas = scanCanvasRef.current || document.createElement('canvas');
              scanCanvasRef.current = canvas;
              const targetW = Math.min(640, video.videoWidth);
              const targetH = Math.round((video.videoHeight / video.videoWidth) * targetW);
              if (canvas.width !== targetW || canvas.height !== targetH) {
                canvas.width = targetW;
                canvas.height = targetH;
              }
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(video, 0, 0, targetW, targetH);
                const frame = ctx.getImageData(0, 0, targetW, targetH);
                const decoded = jsQR(frame.data, frame.width, frame.height, {
                  inversionAttempts: 'dontInvert',
                });
                if (decoded?.data) {
                  void verifyScannedString(decoded.data);
                  return;
                }
              }
            } catch {
              // ignore transient single-frame decode error
            }
          }
          rafId = window.requestAnimationFrame(scanTick);
        };

        rafId = window.requestAnimationFrame(scanTick);
      } catch (err) {
        if (!cancelled) {
          setCameraError(
            err instanceof Error && err.name === 'NotAllowedError'
              ? 'Camera permission was denied. Enable camera access or upload a QR image below.'
              : 'No active camera detected on this device. Upload a QR photo or enter a code below.'
          );
        }
      }
    };

    void startCameraAndScan();

    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      stopCamera();
    };
  }, [open, activeTab, verifiedContact, stopCamera, verifyScannedString]);

  const handleUploadQrImage = async (file: File | undefined) => {
    if (!file) return;
    setScanError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Unable to read image.');
      ctx.drawImage(bitmap, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = jsQR(imgData.data, imgData.width, imgData.height);
      bitmap.close?.();
      if (!decoded?.data) {
        setScanError('No valid QR code detected in that image. Try a clearer crop.');
        return;
      }
      await verifyScannedString(decoded.data);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Could not decode QR image.');
    }
  };

  const handleResetQrCode = async () => {
    if (rotatingToken) return;
    const previousTokenId = tokenState?.tokenId;
    setRotatingToken(true);
    setTokenError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken().catch(() => undefined);
      const next = await revokeServerQrToken({
        uid: myUid,
        currentToken: tokenState?.token,
        fullName: userProfile?.fullName || 'PK Chat Member',
        phoneNumber: userAccount?.phoneNumber || '',
        country: userProfile?.country || 'Sri Lanka',
        countryCode: userProfile?.countryCode || 'LK',
        preferredLanguage: userProfile?.preferredLanguage || 'en',
        preferredLanguageName: userProfile?.preferredLanguageName || 'English',
        about: userProfile?.about || profileMedia?.about || 'Available on PK Chat',
        idToken,
      });
      setTokenState(next);
      void revokeQrTokenInFirestore(previousTokenId);
      void syncQrTokenToFirestore(next);
      setLiveScanNotice('Old QR code revoked. Fresh cryptographic QR ready.');
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : 'Unable to reset QR code.');
    } finally {
      setRotatingToken(false);
    }
  };

  const handleCopyToken = async () => {
    if (!tokenState?.token) return;
    try {
      await navigator.clipboard.writeText(tokenState.token);
      setCopiedNotice(true);
      window.setTimeout(() => setCopiedNotice(false), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownloadQrCard = () => {
    const sourceQr = qrCanvasRef.current;
    if (!sourceQr || !tokenState) return;
    const out = document.createElement('canvas');
    out.width = 480;
    out.height = 580;
    const ctx = out.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, out.width, out.height);

    // Header gradient bar
    const headerGrad = ctx.createLinearGradient(0, 0, 480, 110);
    headerGrad.addColorStop(0, '#0284C7');
    headerGrad.addColorStop(1, '#0369A1');
    ctx.fillStyle = headerGrad;
    ctx.fillRect(0, 0, 480, 110);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tokenState.profile.fullName, 240, 52);
    ctx.font = '15px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#E0F2FE';
    ctx.fillText('PK Chat Contact QR Code', 240, 82);

    const triggerDownload = () => {
      const a = document.createElement('a');
      a.href = out.toDataURL('image/png');
      a.download = `pk-chat-qr-${tokenState.profile.fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      a.click();
    };

    // QR Code centered
    ctx.drawImage(sourceQr, 90, 145, 300, 300);

    ctx.fillStyle = '#475569';
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.fillText('Scan with PK Chat camera to connect instantly', 240, 500);
    ctx.fillStyle = '#0284C7';
    ctx.font = '600 13px monospace';
    ctx.fillText(`${tokenState.profile.country} · ${tokenState.profile.preferredLanguageName}`, 240, 530);

    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.onload = () => {
      drawPkBrandLogoOnCanvas(ctx, logoImg, 240, 295, 74);
      triggerDownload();
    };
    logoImg.onerror = () => {
      drawPkBrandLogoOnCanvas(ctx, null, 240, 295, 74);
      triggerDownload();
    };
    logoImg.src = BRAND_LOGO_URL;
  };

  const ensureAddedContact = async (target: ServerQrProfile) => {
    const alreadyExists = contacts.some((c) => c.contactUid === target.uid);
    if (!alreadyExists && target.uid !== myUid) {
      await addContact({
        contactUid: target.uid,
        displayName: target.fullName,
        country: target.country,
        preferredLanguage: target.preferredLanguage,
        preferredLanguageName: target.preferredLanguageName,
        phoneMasked: target.phoneNumber || 'QR Verified Member',
      });
    }
  };

  const handleConnectAction = async (mode: 'add' | 'chat' | 'audio' | 'video') => {
    if (!verifiedContact || actionBusy) return;
    if (verifiedContact.uid === myUid) {
      setActionStatusMsg('This is your own PK Chat profile QR code.');
      return;
    }
    setActionBusy(true);
    setScanError(null);
    try {
      await ensureAddedContact(verifiedContact);

      if (mode === 'add') {
        setActionStatusMsg(`${verifiedContact.fullName} added to your PK Chat contacts.`);
        return;
      }

      if (mode === 'chat') {
        await startDirectChat({
          uid: verifiedContact.uid,
          fullName: verifiedContact.fullName,
          avatarUrl: verifiedContact.avatarUrl,
          country: verifiedContact.country,
          countryCode: verifiedContact.countryCode,
          preferredLanguage: verifiedContact.preferredLanguage,
          preferredLanguageName: verifiedContact.preferredLanguageName,
          onlineStatus: 'online',
        });
        onClose();
        onAfterActionNavigate?.();
        return;
      }

      await startCall({
        participantIds: [verifiedContact.uid],
        callType: mode === 'video' ? 'video' : 'audio',
        targetLanguage: verifiedContact.preferredLanguage,
        targetName: verifiedContact.fullName.includes('@')
          ? 'PK Chat Contact'
          : verifiedContact.fullName,
      });
      setActiveScreen(mode === 'video' ? 'video_call' : 'audio_call');
      onClose();
      onAfterActionNavigate?.();
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Unable to complete action with verified contact.');
    } finally {
      setActionBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="PK Chat QR Code"
    >
      <div className="w-full max-w-md rounded-3xl bg-[#e6f4ff]/88 dark:bg-slate-900/90 backdrop-blur-2xl border border-[#7dd3fc] dark:border-slate-800 shadow-[0_20px_50px_rgba(2,132,199,0.28)] overflow-hidden">
        {/* WhatsApp-Exact Top Bar */}
        <div className="bg-gradient-to-r from-[#0284c7] to-[#0369a1] px-5 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5">
            <QrCode className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-base font-bold leading-tight">QR code</h2>
              <p className="text-[11px] text-sky-100">
                Real-time cryptographic verification
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
            aria-label="Close QR code modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* WhatsApp-Style My Code / Scan Code Tabs */}
        <div className="grid grid-cols-2 border-b border-[#7dd3fc]/60 dark:border-slate-800 bg-[#d5edff]/80 dark:bg-slate-950">
          <button
            type="button"
            onClick={() => {
              setActiveTab('my_code');
              setVerifiedContact(null);
              setScanError(null);
            }}
            className={`py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors ${
              activeTab === 'my_code'
                ? 'border-[#0284c7] text-[#0284c7] dark:text-[#38bdf8] bg-[#ecf7ff]/90 dark:bg-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            My code
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('scan_code');
              setScanError(null);
            }}
            className={`py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors ${
              activeTab === 'scan_code'
                ? 'border-[#0284c7] text-[#0284c7] dark:text-[#38bdf8] bg-[#ecf7ff]/90 dark:bg-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Scan code
          </button>
        </div>

        {activeTab === 'my_code' ? (
          <div className="p-6 flex flex-col items-center text-center space-y-4">
            <div className="flex flex-col items-center gap-2">
              <div className="-mb-1 rounded-full ring-4 ring-sky-400/25">
                <UserAvatar
                  src={myAvatar}
                  name={userProfile?.fullName || 'PK Chat Member'}
                  size="lg"
                />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {userProfile?.fullName || 'PK Chat Member'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {userAccount?.phoneNumber || `${userProfile?.country || 'Global'} · PK Chat contact`}
                </p>
              </div>
            </div>

            {loadingToken ? (
              <div className="w-[256px] h-[256px] rounded-2xl bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin text-[#0284c7]" />
                <span>Issuing signed server QR...</span>
              </div>
            ) : tokenError ? (
              <div className="w-full p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 space-y-2">
                <p>{tokenError}</p>
                <button
                  type="button"
                  onClick={() => void loadOrSyncServerToken()}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold"
                >
                  Retry Server Sync
                </button>
              </div>
            ) : tokenState ? (
              <>
                <PkQrCodeGraphic
                  value={tokenState.token}
                  size={232}
                  onCanvasReady={(c) => {
                    qrCanvasRef.current = c;
                  }}
                />
                <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-[#0284c7] dark:text-[#38bdf8]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>
                    Server-verified token · {tokenState.scanCount} scan{tokenState.scanCount === 1 ? '' : 's'}
                  </span>
                </div>
              </>
            ) : null}

            {liveScanNotice && (
              <div className="w-full px-3 py-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-[#bae6fd] dark:border-sky-800 text-xs font-medium text-[#0369a1] dark:text-sky-200">
                {liveScanNotice}
              </div>
            )}

            <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
              Your QR code is private. Anyone using PK Chat can scan it with their camera to verify your profile and start chatting or calling.
            </p>

            <div className="w-full grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={handleDownloadQrCard}
                disabled={!tokenState}
                className="px-3 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save PNG</span>
              </button>
              <button
                type="button"
                onClick={() => void handleCopyToken()}
                disabled={!tokenState}
                className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                {copiedNotice ? <Check className="w-3.5 h-3.5 text-[#0284c7]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedNotice ? 'Copied' : 'Copy Code'}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleResetQrCode()}
                disabled={rotatingToken || loadingToken}
                className="px-3 py-2.5 rounded-xl bg-[#eef8ff]/75 dark:bg-transparent border border-[#7dd3fc]/75 dark:border-slate-700 hover:bg-[#dff1ff] dark:hover:bg-slate-800 text-[#0369a1] dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${rotatingToken ? 'animate-spin' : ''}`} />
                <span>Reset QR</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {verifiedContact ? (
              <div className="p-5 rounded-2xl bg-[#f0f9ff] dark:bg-slate-950 border border-[#bae6fd] dark:border-slate-800 space-y-4 text-center">
                <div className="flex flex-col items-center gap-2">
                  <UserAvatar
                    src={verifiedContact.avatarUrl}
                    name={verifiedContact.fullName}
                    size="xl"
                  />
                  <div>
                    <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0284c7] dark:text-[#38bdf8]">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Verified PK Chat Profile</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                      {verifiedContact.fullName}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {verifiedContact.country} · Speaks {verifiedContact.preferredLanguageName}
                    </p>
                    {verifiedContact.phoneNumber && (
                      <p className="text-xs font-mono text-[#0284c7] mt-0.5">
                        {verifiedContact.phoneNumber}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 italic mt-1">
                      &ldquo;{verifiedContact.about}&rdquo;
                    </p>
                  </div>
                </div>

                {actionStatusMsg && (
                  <p className="text-xs font-semibold text-[#0284c7] dark:text-[#38bdf8]">
                    {actionStatusMsg}
                  </p>
                )}

                {scanError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400">{scanError}</p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleConnectAction('chat')}
                    className="px-3.5 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Message</span>
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleConnectAction('add')}
                    className="px-3.5 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Add Contact</span>
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleConnectAction('audio')}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Audio Call</span>
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleConnectAction('video')}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>Video Call</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setVerifiedContact(null);
                    setScanError(null);
                    setActionStatusMsg(null);
                  }}
                  className="text-xs font-semibold text-[#0284c7] hover:underline"
                >
                  Scan another QR code
                </button>
              </div>
            ) : (
              <>
                <div className="relative aspect-square w-full max-h-[290px] rounded-2xl overflow-hidden bg-slate-950 flex items-center justify-center">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${cameraActive ? 'opacity-100' : 'opacity-20'}`}
                  />

                  {/* WhatsApp-style scanner reticle */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="w-48 h-48 relative">
                      <span className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-sky-400 rounded-tl-xl" />
                      <span className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-sky-400 rounded-tr-xl" />
                      <span className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-sky-400 rounded-bl-xl" />
                      <span className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-sky-400 rounded-br-xl" />
                      {cameraActive && (
                        <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-0.5 bg-sky-400/80 shadow-[0_0_10px_#38bdf8]" />
                      )}
                    </div>
                  </div>

                  {!cameraActive && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center text-white gap-2">
                      <Camera className="w-8 h-8 text-sky-400" />
                      <p className="text-xs font-medium max-w-xs text-slate-200">
                        {cameraError || 'Starting built-in QR scanner camera...'}
                      </p>
                    </div>
                  )}

                  {verifyingScan && (
                    <div className="absolute inset-0 bg-slate-950/70 flex flex-col items-center justify-center text-white gap-2 text-xs font-semibold">
                      <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
                      <span>Verifying profile with server...</span>
                    </div>
                  )}
                </div>

                {scanError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
                    {scanError}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => uploadInputRef.current?.click()}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"
                  >
                    <ImagePlus className="w-4 h-4 text-[#0284c7]" />
                    <span>Scan from Photos</span>
                  </button>
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      void handleUploadQrImage(f);
                    }}
                  />
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <ScanLine className="w-3.5 h-3.5 text-[#0284c7]" />
                    <span>Instant recognition</span>
                  </span>
                </div>

                {/* Direct Token Verification Field for Desktop / Quick Paste */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void verifyScannedString(manualCodeInput);
                  }}
                  className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={manualCodeInput}
                    onChange={(e) => setManualCodeInput(e.target.value)}
                    placeholder="Or paste PK Chat QR code..."
                    className="flex-1 px-3 py-2 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={!manualCodeInput.trim() || verifyingScan}
                    className="px-3.5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap"
                  >
                    Verify
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
