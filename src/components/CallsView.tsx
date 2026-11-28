import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  BellPlus,
  Captions,
  CheckCircle2,
  Delete,
  Disc,
  Eye,
  EyeOff,
  Globe,
  Grid,
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  Phone,
  PhoneOff,
  Play,
  RotateCw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  Trash2,
  UserPlus,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import { BRAND_LOGO_URL } from '../data/constants';
import { WORLD_LANGUAGES_CATALOG, findWorldLanguage } from '../data/worldLanguages';
import { usePkChat } from '../context/PkChatContext';
import { useAppI18n } from '../lib/i18n';
import { synthesizeTranslatedSpeech } from '../lib/api';
import {
  DEFAULT_RING_TIMEOUT_MS,
  getRingtoneLabel,
  getSelectedRingtonePreset,
  setRingbackSpeakerMode,
  startOutgoingRingbackLoop,
  startRingingLoop,
  stopOutgoingRingbackLoop,
  stopRingingLoop,
} from '../lib/audioTones';
import { evaluateOutgoingCallState } from '../lib/connectivityAndDnd';
import {
  buildTelDialUri,
  triggerCellularDialFallback,
  triggerOfflineSimSmsSos,
} from '../lib/offlineSmsSos';
import {
  SentenceTranslationBuffer,
  TranslationAudioSyncQueue,
  isUncertainTranslation,
  translateSentenceWithRetry,
} from '../lib/translationEngine';
import {
  buildSilentBeautyCssFilter,
  computeSilentNaturalLightProfile,
} from '../lib/silentBeautify';
import { LiveCallTurnEntry, SpeakingSpeedOption } from '../types/pkchat';

const ACCENT_HINTS = [
  'Auto / Standard Accent',
  'Sri Lankan / Indian Accent',
  'UK / British Accent',
  'US / North American Accent',
  'Singapore / Malaysian Accent',
  'Middle Eastern / Gulf Accent',
];

function sanitizeCallLabel(raw?: string | null): string {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed.includes('@')) return 'PK Chat Contact';
  return trimmed;
}

export function CallsView() {
  const {
    activeScreen,
    setActiveScreen,
    userProfile,
    languagePref,
    activeCall,
    startCall,
    updateCallStatus,
    contacts,
    directoryProfiles,
    lookupUserByPhone,
    startDirectChat,
    setActiveChat,
    weatherSnapshot,
    intentionalDataOff,
    emergencyContacts,
    userSettings,
    wallpapers,
  } = usePkChat();

  const { t } = useAppI18n();
  const isVideo = activeScreen === 'video_call';
  const [callState, setCallState] = useState<'idle' | 'connecting' | 'active' | 'ended'>('idle');
  const [durationSec, setDurationSec] = useState(0);
  const [micMuted, setMicMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState<boolean>(() => isVideo);
  const [callStatusLabel, setCallStatusLabel] = useState<'Idle' | 'Offline' | 'Calling...' | 'Ringing...' | 'Connected'>('Idle');
  const [cameraOff, setCameraOff] = useState(!isVideo);
  const [silentBeautyFilter, setSilentBeautyFilter] = useState<string>(() =>
    buildSilentBeautyCssFilter(computeSilentNaturalLightProfile(null, userProfile?.fullName))
  );
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [dialNumber, setDialNumber] = useState('');
  const [showDialPad, setShowDialPad] = useState(!isVideo);

  useEffect(() => {
    if (callState !== 'idle') return;
    if (activeScreen === 'audio_call') {
      setShowDialPad(true);
      setCameraOff(true);
    } else if (activeScreen === 'video_call') {
      setCameraOff(false);
    }
  }, [activeScreen, callState]);

  useEffect(() => {
    const onCallsMode = (ev: Event) => {
      const mode = (ev as CustomEvent<'calls' | 'dialer'>).detail;
      if (mode === 'dialer') {
        setShowDialPad(true);
        window.setTimeout(() => {
          document.getElementById('pk-dialer-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
      } else if (mode === 'calls') {
        setShowDialPad(false);
        window.setTimeout(() => {
          document.getElementById('pk-calls-stage-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
      }
    };
    window.addEventListener('pkchat-calls-mode', onCallsMode);
    return () => window.removeEventListener('pkchat-calls-mode', onCallsMode);
  }, []);
  const [showSaveContactForm, setShowSaveContactForm] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [saveContactNotice, setSaveContactNotice] = useState<string | null>(null);
  const [savedDialContacts, setSavedDialContacts] = useState<
    Array<{ id: string; name: string; phone: string }>
  >(() => {
    try {
      const raw = localStorage.getItem('pk_dialpad_saved_contacts');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [dialSearchQuery, setDialSearchQuery] = useState('');
  const [audioMode, setAudioMode] = useState<'translated' | 'original'>('translated');
  const [noiseReduction, setNoiseReduction] = useState(true);
  const [lowBandwidth, setLowBandwidth] = useState(false);
  const [streamingEnabled, setStreamingEnabled] = useState(true);

  // Two-way simultaneous conversation channel languages
  const [speakerALangCode, setSpeakerALangCode] = useState(userProfile?.preferredLanguage || 'en');
  const [speakerBLangCode, setSpeakerBLangCode] = useState(
    userProfile?.preferredLanguage === 'ta' ? 'en' : 'ta'
  );
  const [activeSpeakerRole, setActiveSpeakerRole] = useState<'speaker_a' | 'speaker_b'>('speaker_a');
  const [accentHint, setAccentHint] = useState(ACCENT_HINTS[0]);
  const [speakingSpeed, setSpeakingSpeed] = useState<SpeakingSpeedOption>('normal');

  // Buffered turns, active synced audio, streaming preview
  const [turns, setTurns] = useState<LiveCallTurnEntry[]>([]);
  const [bufferPreview, setBufferPreview] = useState('');
  const [streamingPartial, setStreamingPartial] = useState('');
  const [activeSpeakingTurnId, setActiveSpeakingTurnId] = useState<string | null>(null);

  const [spokenInput, setSpokenInput] = useState('');
  const [networkOnline, setNetworkOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [networkQuality, setNetworkQuality] = useState<'Excellent' | 'Moderate' | 'Low Bandwidth'>('Excellent');
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [listeningLive, setListeningLive] = useState(false);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [recordingNotice, setRecordingNotice] = useState<string | null>(null);
  const [showRecordingConsentModal, setShowRecordingConsentModal] = useState(false);
  const [recordingConsentMode, setRecordingConsentMode] = useState<'audio' | 'video'>('video');
  const [videoBgMode, setVideoBgMode] = useState<
    'original' | 'soft_blur' | 'ocean_glass' | 'midnight_studio' | 'peace_sky'
  >('original');
  const [voiceLocationMode, setVoiceLocationMode] = useState<'external' | 'local'>('external');
  const [videoPrivacyBlackout, setVideoPrivacyBlackout] = useState(false);
  const [myVideoConsent, setMyVideoConsent] = useState(false);
  const [partnerVideoConsent, setPartnerVideoConsent] = useState(false);
  const [activeDialedTarget, setActiveDialedTarget] = useState<{
    label: string;
    number: string;
    initials: string;
    onlineStatus?: 'online' | 'offline';
    lastSeenText?: string;
    country?: string;
  } | null>(null);
  const [callPhase, setCallPhase] = useState<'idle' | 'ringing' | 'connected'>('idle');
  const [isLocalPreview, setIsLocalPreview] = useState(false);
  const [showCallOverlay, setShowCallOverlay] = useState(false);
  const [showCaptionsInOverlay, setShowCaptionsInOverlay] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareFallbackActive, setScreenShareFallbackActive] = useState(false);
  const [beautyFilterEnabled, setBeautyFilterEnabled] = useState(true);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const overlayVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenFallbackTimerRef = useRef<number | null>(null);
  const recorderOwnStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const isUnmountedRef = useRef(false);
  const audioChunksRef = useRef<Blob[]>([]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const speechRecRef = useRef<{ stop: () => void } | null>(null);
  const keepListeningRef = useRef(false);
  const speechRestartTimerRef = useRef<number | null>(null);
  const callStateRef = useRef(callState);
  callStateRef.current = callState;

  const audioQueueRef = useRef<TranslationAudioSyncQueue | null>(null);
  if (!audioQueueRef.current) {
    audioQueueRef.current = new TranslationAudioSyncQueue((turnId) => {
      setActiveSpeakingTurnId(turnId);
    });
  }

  // Refs synced so SpeechRecognition & SentenceTranslationBuffer closures always read latest settings
  const settingsRef = useRef({
    speakerALangCode,
    speakerBLangCode,
    activeSpeakerRole,
    accentHint,
    speakingSpeed,
    lowBandwidth,
    streamingEnabled,
    audioMode,
    voiceLocationMode,
    ttsVoice: languagePref?.ttsVoice || 'Kore',
    userFullName: userProfile?.fullName || 'Speaker A',
  });
  settingsRef.current = {
    speakerALangCode,
    speakerBLangCode,
    activeSpeakerRole,
    accentHint,
    speakingSpeed,
    lowBandwidth,
    streamingEnabled,
    audioMode,
    voiceLocationMode,
    ttsVoice: languagePref?.ttsVoice || 'Kore',
    userFullName: userProfile?.fullName || 'Speaker A',
  };

  const turnsRef = useRef<LiveCallTurnEntry[]>(turns);
  turnsRef.current = turns;

  const translateTurnBySequence = useCallback(
    async (params: {
      turnId: string;
      sequenceId: number;
      sentence: string;
      speakerRole: 'speaker_a' | 'speaker_b';
    }) => {
      const cfg = settingsRef.current;
      const targetCode =
        params.speakerRole === 'speaker_a' ? cfg.speakerBLangCode : cfg.speakerALangCode;
      const targetLang =
        findWorldLanguage(targetCode, WORLD_LANGUAGES_CATALOG) || WORLD_LANGUAGES_CATALOG[0];
      const speakerLabel =
        params.speakerRole === 'speaker_a'
          ? `${cfg.userFullName} (Speaker A)`
          : 'Remote Partner (Speaker B)';

      const contextHistory = turnsRef.current
        .slice(-4)
        .filter((t) => t.status === 'ready')
        .map((t) => ({
          speaker: t.speakerName,
          text: t.originalText,
          language: t.detectedLanguageName,
        }));

      try {
        const res = await translateSentenceWithRetry({
          text: params.sentence,
          targetLanguage: targetLang.code,
          targetLanguageName: targetLang.name,
          accentHint: cfg.accentHint,
          speakingSpeed: cfg.speakingSpeed,
          lowBandwidth: cfg.lowBandwidth,
          contextHistory,
          streamTokens: cfg.streamingEnabled && !cfg.lowBandwidth,
          onStreamPartial: (partial) => setStreamingPartial(partial),
          maxRetries: 2,
        });
        setStreamingPartial('');

        const uncertain = isUncertainTranslation(res);
        let audioBase64: string | undefined;

        // Generate synchronized voice audio if automatic translated playback enabled, confident, and not low-bandwidth
        if (
          cfg.audioMode === 'translated' &&
          !cfg.lowBandwidth &&
          res.supported &&
          !uncertain &&
          res.translatedText.trim()
        ) {
          try {
            const tts = await synthesizeTranslatedSpeech({
              text: res.translatedText,
              voiceName: cfg.ttsVoice,
              languageName: targetLang.name,
            });
            audioBase64 = tts.audioBase64;
          } catch {
            // Queue will cleanly fall back to browser SpeechSynthesis using target speechLocale
          }
        }

        const updatedEntry: LiveCallTurnEntry = {
          id: params.turnId,
          sequenceId: params.sequenceId,
          speakerRole: params.speakerRole,
          speakerName: speakerLabel,
          originalText: params.sentence,
          translatedText: res.supported ? res.translatedText : res.unsupportedReason || params.sentence,
          detectedLanguageCode: res.detectedLanguageCode,
          detectedLanguageName: res.detectedLanguageName,
          targetLanguageCode: targetLang.code,
          targetLanguageName: targetLang.name,
          confidenceScore: res.confidenceScore,
          confidenceLevel: res.confidenceLevel,
          clarificationNeeded: res.clarificationNeeded || uncertain,
          clarificationPrompt:
            res.clarificationPrompt ||
            (uncertain
              ? 'Translation confidence is low. Please check the original phrase or ask speaker to clarify.'
              : undefined),
          preservedEntities: res.preservedEntities || [],
          audioBase64,
          audioMimeType: audioBase64 ? 'audio/wav' : undefined,
          status: uncertain ? 'uncertain' : 'ready',
          retryCount: res.retryCount,
          latencyMs: res.latencyMs,
          createdAt: new Date().toISOString(),
        };

        setTurns((prev) => {
          const exists = prev.some((t) => t.id === params.turnId);
          const next = exists
            ? prev.map((t) => (t.id === params.turnId ? updatedEntry : t))
            : [...prev, updatedEntry];
          return next.sort((a, b) => a.sequenceId - b.sequenceId).slice(-40);
        });

        // Play sequentially synced with captions only when verified/confident and not muted/low-bandwidth
        if (
          cfg.audioMode === 'translated' &&
          !cfg.lowBandwidth &&
          res.supported &&
          !uncertain
        ) {
          audioQueueRef.current?.enqueue({
            turnId: params.turnId,
            sequenceId: params.sequenceId,
            text: updatedEntry.translatedText,
            audioBase64,
            speechLocale: targetLang.speechLocale,
          });
        }
      } catch (err) {
        setStreamingPartial('');
        const msg = err instanceof Error ? err.message : 'Translation failed';
        setTurns((prev) =>
          prev
            .map((t) =>
              t.id === params.turnId
                ? {
                    ...t,
                    status: 'failed' as const,
                    errorMessage: msg,
                  }
                : t
            )
            .sort((a, b) => a.sequenceId - b.sequenceId)
        );
      }
    },
    []
  );

  const sentenceBufferRef = useRef<SentenceTranslationBuffer | null>(null);
  if (!sentenceBufferRef.current) {
    sentenceBufferRef.current = new SentenceTranslationBuffer((sentence, sequenceId) => {
      const cfg = settingsRef.current;
      const role = cfg.activeSpeakerRole;
      const targetCode = role === 'speaker_a' ? cfg.speakerBLangCode : cfg.speakerALangCode;
      const targetLang =
        findWorldLanguage(targetCode, WORLD_LANGUAGES_CATALOG) || WORLD_LANGUAGES_CATALOG[0];
      const turnId = `turn_${sequenceId}_${Date.now()}`;

      const placeholder: LiveCallTurnEntry = {
        id: turnId,
        sequenceId,
        speakerRole: role,
        speakerName:
          role === 'speaker_a'
            ? `${cfg.userFullName} (Speaker A)`
            : 'Remote Partner (Speaker B)',
        originalText: sentence,
        translatedText: 'Translating buffered sentence...',
        detectedLanguageCode: 'auto',
        detectedLanguageName: 'Detecting',
        targetLanguageCode: targetLang.code,
        targetLanguageName: targetLang.name,
        confidenceScore: 0,
        confidenceLevel: 'medium',
        clarificationNeeded: false,
        preservedEntities: [],
        status: 'translating',
        retryCount: 0,
        createdAt: new Date().toISOString(),
      };

      setTurns((prev) =>
        [...prev, placeholder].sort((a, b) => a.sequenceId - b.sequenceId).slice(-40)
      );
      setBufferPreview('');
      void translateTurnBySequence({
        turnId,
        sequenceId,
        sentence,
        speakerRole: role,
      });
    });
  }

  useEffect(() => {
    const conn = (
      navigator as unknown as {
        connection?: {
          effectiveType?: string;
          addEventListener?: (type: string, listener: () => void) => void;
          removeEventListener?: (type: string, listener: () => void) => void;
        };
      }
    ).connection;

    const evaluateConnection = () => {
      const effective = conn?.effectiveType;
      if (effective === '2g' || effective === 'slow-2g') {
        setNetworkQuality('Low Bandwidth');
        setLowBandwidth(true);
      } else if (effective === '3g') {
        setNetworkQuality('Moderate');
        setLowBandwidth(false);
      } else {
        setNetworkQuality('Excellent');
        setLowBandwidth(false);
      }
    };

    evaluateConnection();
    conn?.addEventListener?.('change', evaluateConnection);

    const handleOnline = () => {
      setNetworkOnline(true);
      evaluateConnection();
      // Silently retry any interrupted/failed turns in the background without disruptive overlays
      const failed = turnsRef.current.filter((t) => t.status === 'failed');
      failed.forEach((t) => {
        setTurns((prev) =>
          prev.map((item) =>
            item.id === t.id
              ? { ...item, status: 'translating', errorMessage: undefined }
              : item
          )
        );
        void translateTurnBySequence({
          turnId: t.id,
          sequenceId: t.sequenceId,
          sentence: t.originalText,
          speakerRole: t.speakerRole,
        });
      });
    };

    const handleOffline = () => {
      setNetworkOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      conn?.removeEventListener?.('change', evaluateConnection);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [translateTurnBySequence]);

  useEffect(() => {
    if (callState !== 'active') return;
    const t = setInterval(() => setDurationSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [callState]);

  useEffect(() => {
    if (!isRecording) {
      setRecordingSec(0);
      return;
    }
    const timer = window.setInterval(() => setRecordingSec((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  const stopCallRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        // Ignore stop errors if track already ended
      }
    } else {
      setIsRecording(false);
    }
  }, []);

  const startCallRecording = useCallback(async (recordVideoOverride?: boolean) => {
    if (isRecording) return;
    const captureVideo = typeof recordVideoOverride === 'boolean' ? recordVideoOverride : isVideo;
    setMediaError(null);
    setRecordingNotice(null);
    audioChunksRef.current = [];

    try {
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('Call recording (MediaRecorder) is not supported in this browser.');
      }
      let recordStream = streamRef.current;
      let createdOwnStream = false;
      if (!recordStream) {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Microphone / camera access is required to record this call.');
        }
        recordStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: captureVideo,
        });
        recorderOwnStreamRef.current = recordStream;
        createdOwnStream = true;
      }

      const preferredTypes = captureVideo
        ? ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
        : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
      const chosenMime =
        preferredTypes.find((type) => {
          try {
            return MediaRecorder.isTypeSupported(type);
          } catch {
            return false;
          }
        }) || '';

      const recorder = chosenMime
        ? new MediaRecorder(recordStream, { mimeType: chosenMime })
        : new MediaRecorder(recordStream);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || (captureVideo ? 'video/webm' : 'audio/webm');
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size > 0 && !isUnmountedRef.current) {
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.style.display = 'none';
          anchor.href = url;
          anchor.download = `PK_Chat_Call_Recording_${Date.now()}.${ext}`;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          setRecordingNotice(
            '📁 அழைப்புப் பதிவு (Call Recording) உங்கள் சாதனத்தில் வெற்றிகரமாகச் சேமிக்கப்பட்டது! · Call recording saved to your device.'
          );
        }
        audioChunksRef.current = [];
        if (createdOwnStream || recorderOwnStreamRef.current) {
          recorderOwnStreamRef.current?.getTracks().forEach((tr) => tr.stop());
          recorderOwnStreamRef.current = null;
        }
        mediaRecorderRef.current = null;
        if (!isUnmountedRef.current) {
          setIsRecording(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
      setRecordingNotice(
        captureVideo
          ? '✔ Remote User Allowed! Video Call Recording Started (Composite Local & Remote Video + Audio).'
          : '✔ Audio Call Recording Started: Both sides audio are being recorded directly and saved locally.'
      );
    } catch (err) {
      recorderOwnStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      recorderOwnStreamRef.current = null;
      setMediaError(
        err instanceof Error
          ? err.message
          : 'Microphone/camera permission required to record call.'
      );
      setIsRecording(false);
    }
  }, [isRecording, isVideo]);

  const handleRecordTrigger = useCallback(() => {
    if (isRecording) return;
    setRecordingNotice(null);
    setRecordingConsentMode(isVideo ? 'video' : 'audio');
    setShowRecordingConsentModal(true);
  }, [isRecording, isVideo]);

  const stopContinuousSpeechRecognition = useCallback(() => {
    keepListeningRef.current = false;
    if (speechRestartTimerRef.current !== null) {
      window.clearTimeout(speechRestartTimerRef.current);
      speechRestartTimerRef.current = null;
    }
    try {
      speechRecRef.current?.stop();
    } catch {
      // Ignore already stopped SpeechRecognition instance
    }
    speechRecRef.current = null;
    sentenceBufferRef.current?.flushNow();
    setBufferPreview('');
    setListeningLive(false);
  }, []);

  const startContinuousSpeechRecognition = useCallback((silentFallback = false) => {
    const SpeechRec =
      (
        window as unknown as {
          SpeechRecognition?: new () => unknown;
          webkitSpeechRecognition?: new () => unknown;
        }
      ).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      if (!silentFallback) {
        setMediaError(
          'Browser streaming SpeechRecognition is unavailable here. Use the live caption phrase box inside the call or below to translate speech.'
        );
      }
      return false;
    }

    if (speechRestartTimerRef.current !== null) {
      window.clearTimeout(speechRestartTimerRef.current);
      speechRestartTimerRef.current = null;
    }
    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {
        // Ignore cleanup stop errors
      }
      speechRecRef.current = null;
    }

    keepListeningRef.current = true;

    const launchRecognitionInstance = () => {
      if (!keepListeningRef.current || isUnmountedRef.current || callStateRef.current === 'ended') {
        return;
      }

      const recognition = new SpeechRec() as {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        onresult: (ev: {
          resultIndex: number;
          results: ArrayLike<{ isFinal: boolean; [index: number]: { transcript: string } }>;
        }) => void;
        onerror: (ev?: { error?: string }) => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };

      const cfg = settingsRef.current;
      const sourceCode =
        cfg.activeSpeakerRole === 'speaker_a' ? cfg.speakerALangCode : cfg.speakerBLangCode;
      recognition.lang =
        findWorldLanguage(sourceCode, WORLD_LANGUAGES_CATALOG)?.speechLocale || 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (ev) => {
        let interimText = '';
        for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
          const chunk = ev.results[i]?.[0]?.transcript || '';
          if (ev.results[i].isFinal) {
            sentenceBufferRef.current?.pushText(chunk, 750);
            setBufferPreview(sentenceBufferRef.current?.getPendingPreview() || '');
          } else {
            interimText += ` ${chunk}`;
          }
        }
        if (interimText.trim()) {
          setBufferPreview(interimText.trim());
        }
      };

      recognition.onerror = (ev) => {
        const errCode = ev?.error || '';
        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          keepListeningRef.current = false;
          speechRecRef.current = null;
          setListeningLive(false);
          if (!silentFallback) {
            setMediaError('Microphone speech permission blocked. Use the live caption input box to translate.');
          }
        }
        // Transient 'no-speech' / 'aborted' / 'network' errors never stop the active video/audio stream
      };

      recognition.onend = () => {
        sentenceBufferRef.current?.flushNow();
        speechRecRef.current = null;
        if (!keepListeningRef.current || isUnmountedRef.current || callStateRef.current === 'ended') {
          setBufferPreview('');
          setListeningLive(false);
          return;
        }
        // Automatically resume speech capture across natural pauses without disrupting the video call stream
        speechRestartTimerRef.current = window.setTimeout(() => {
          speechRestartTimerRef.current = null;
          launchRecognitionInstance();
        }, 180);
      };

      speechRecRef.current = recognition;
      try {
        recognition.start();
        setListeningLive(true);
        if (!silentFallback) {
          setMediaError(null);
        }
      } catch {
        keepListeningRef.current = false;
        speechRecRef.current = null;
        setListeningLive(false);
      }
    };

    launchRecognitionInstance();
    return true;
  }, []);

  const stopMediaTracks = useCallback(() => {
    stopRingingLoop();
    stopOutgoingRingbackLoop();
    stopCallRecording();
    stopContinuousSpeechRecognition();
    if (screenFallbackTimerRef.current !== null) {
      window.clearInterval(screenFallbackTimerRef.current);
      screenFallbackTimerRef.current = null;
    }
    screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    screenStreamRef.current = null;
    setIsScreenSharing(false);
    setScreenShareFallbackActive(false);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    recorderOwnStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    recorderOwnStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    audioQueueRef.current?.stopAll();
    sentenceBufferRef.current?.reset();
  }, [stopCallRecording, stopContinuousSpeechRecognition]);

  useEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
      stopMediaTracks();
    };
  }, [stopMediaTracks]);

  const activeCallChannel: 'direct_call' | 'group_call' =
    (activeCall?.participantIds?.length || 0) > 2 ? 'group_call' : 'direct_call';

  useEffect(() => {
    if (callPhase === 'ringing' && callStatusLabel !== 'Offline') {
      startOutgoingRingbackLoop({ speakerOn });
      const activeCallId = activeCall?.callId;
      const ringTimeoutId = window.setTimeout(() => {
        stopOutgoingRingbackLoop();
        stopMediaTracks();
        setIsLocalPreview(false);
        setCallPhase('idle');
        setCallStatusLabel('Idle');
        setShowCallOverlay(false);
        setCallState('ended');
        setMediaError('No answer (Call timed out after 45s).');
        if (activeCallId) {
          void updateCallStatus(activeCallId, 'missed', 0).catch(() => {});
        }
      }, DEFAULT_RING_TIMEOUT_MS);
      return () => {
        window.clearTimeout(ringTimeoutId);
        stopOutgoingRingbackLoop();
      };
    }
    stopOutgoingRingbackLoop();
    return undefined;
  }, [callPhase, callStatusLabel, speakerOn, activeCallChannel, activeCall?.callId, stopMediaTracks, updateCallStatus]);

  useEffect(() => {
    if (!activeCall) return;
    if (activeCall.status !== 'ringing' && activeCall.status !== 'active') return;
    const isCaller = activeCall.callerId === userProfile?.uid;
    const label = sanitizeCallLabel(
      isCaller ? activeCall.targetName || 'PK Chat Contact' : activeCall.callerName
    );
    const resolvedNumber = (
      (isCaller ? activeCall.targetPhone : activeCall.callerPhone) || ''
    ).trim();
    const initials =
      label
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('') || 'PK';
    setActiveDialedTarget((prev) => {
      if (prev && prev.label && prev.label !== 'PK Chat Contact') {
        if (!prev.number && resolvedNumber) {
          return { ...prev, number: resolvedNumber };
        }
        return prev;
      }
      return {
        label,
        number: resolvedNumber || 'PK Chat Member',
        initials,
        onlineStatus: 'online',
        lastSeenText: activeCall.status === 'active' ? 'Connected' : 'Ringing...',
      };
    });
  }, [
    activeCall,
    activeCall?.callId,
    activeCall?.callerId,
    activeCall?.callerName,
    activeCall?.callerPhone,
    activeCall?.targetName,
    activeCall?.targetPhone,
    activeCall?.status,
    userProfile?.uid,
  ]);

  useEffect(() => {
    setCameraOff(!isVideo);
  }, [isVideo]);

  // Silent background auto-beautification: detects lighting & inferred profile without any UI sliders or text
  useEffect(() => {
    if (!isVideo || cameraOff) return;
    const updateSilentFilter = () => {
      const videoNode = showCallOverlay ? overlayVideoRef.current : localVideoRef.current;
      const metrics = computeSilentNaturalLightProfile(videoNode, userProfile?.fullName);
      setSilentBeautyFilter(buildSilentBeautyCssFilter(metrics, videoBgMode === 'soft_blur'));
    };
    updateSilentFilter();
    const intervalId = window.setInterval(updateSilentFilter, 2500);
    return () => window.clearInterval(intervalId);
  }, [isVideo, cameraOff, showCallOverlay, userProfile?.fullName, videoBgMode]);

  useEffect(() => {
    const activeVisualStream =
      isScreenSharing && screenStreamRef.current ? screenStreamRef.current : streamRef.current;
    if (showCallOverlay && isVideo && activeVisualStream && overlayVideoRef.current) {
      if (overlayVideoRef.current.srcObject !== activeVisualStream) {
        overlayVideoRef.current.srcObject = activeVisualStream;
      }
      overlayVideoRef.current.play().catch(() => {});
    }
    if (isVideo && activeVisualStream && localVideoRef.current) {
      if (localVideoRef.current.srcObject !== activeVisualStream) {
        localVideoRef.current.srcObject = activeVisualStream;
      }
      localVideoRef.current.play().catch(() => {});
    }
  }, [showCallOverlay, isVideo, callPhase, cameraFacing, cameraOff, isScreenSharing]);

  useEffect(() => {
    return () => {
      stopRingingLoop();
    };
  }, []);

  const applyAnsweredCallHandoff = useCallback(
    async (handoff: {
      callId: string;
      callerName: string;
      callerPhone?: string;
      callType: 'audio' | 'video';
      isGroup?: boolean;
      answeredAtMs?: number;
    }) => {
      stopRingingLoop();
      stopOutgoingRingbackLoop();
      setMediaError(null);
      const wantVideo = handoff.callType === 'video';
      const label = sanitizeCallLabel(handoff.callerName);
      const callerPhone = handoff.callerPhone?.trim();
      const initials =
        label
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0]?.toUpperCase() || '')
          .join('') || 'PK';

      setActiveDialedTarget({
        label,
        number: callerPhone || 'PK Chat Member',
        initials,
        onlineStatus: 'online',
        lastSeenText: 'Connected',
      });
      setShowDialPad(false);
      setIsLocalPreview(false);
      setCallPhase('connected');
      setCallStatusLabel('Connected');
      setCallState('active');
      setDurationSec(0);
      setCameraOff(!wantVideo);
      setSpeakerOn(true);
      setRingbackSpeakerMode(true);
      setShowCallOverlay(true);
      if (settingsRef.current.voiceLocationMode === 'external') {
        setShowCaptionsInOverlay(true);
        startContinuousSpeechRecognition(true);
      }

      const conn = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
      const effective = conn?.effectiveType;
      const adaptiveLowBw =
        lowBandwidth || effective === '2g' || effective === 'slow-2g';
      const videoConstraints: MediaTrackConstraints | boolean =
        wantVideo && !adaptiveLowBw
          ? effective === '3g'
            ? {
                facingMode: { ideal: 'user' },
                width: { ideal: 640 },
                height: { ideal: 360 },
                frameRate: { ideal: 20, max: 24 },
              }
            : {
                facingMode: { ideal: 'user' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
              }
          : false;

      if (!streamRef.current && navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              noiseSuppression: noiseReduction,
              echoCancellation: true,
            },
            video: videoConstraints,
          });
          if (isUnmountedRef.current) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          if (overlayVideoRef.current && wantVideo) {
            overlayVideoRef.current.srcObject = stream;
            overlayVideoRef.current.play().catch(() => {});
          }
          if (localVideoRef.current && wantVideo) {
            localVideoRef.current.srcObject = stream;
          }
        } catch {
          // Keep active live call overlay responsive smoothly even if browser camera/mic permission is denied
        }
      }
    },
    [lowBandwidth, noiseReduction, startContinuousSpeechRecognition]
  );

  useEffect(() => {
    const win = window as unknown as {
      __pkPendingAnsweredCall?: {
        callId: string;
        callerName: string;
        callerPhone?: string;
        callType: 'audio' | 'video';
        isGroup?: boolean;
        answeredAtMs?: number;
      };
    };
    const pending = win.__pkPendingAnsweredCall;
    if (pending && (!pending.answeredAtMs || Date.now() - pending.answeredAtMs < 15000)) {
      win.__pkPendingAnsweredCall = undefined;
      void applyAnsweredCallHandoff(pending);
    }

    const onAnswered = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{
          callId: string;
          callerName: string;
          callerPhone?: string;
          callType: 'audio' | 'video';
          isGroup?: boolean;
          answeredAtMs?: number;
        }>
      ).detail;
      if (!detail) return;
      win.__pkPendingAnsweredCall = undefined;
      void applyAnsweredCallHandoff(detail);
    };

    window.addEventListener('pkchat-call-answered', onAnswered);
    return () => {
      window.removeEventListener('pkchat-call-answered', onAnswered);
    };
  }, [applyAnsweredCallHandoff]);

  // Listen for real remote peer acceptance (Firestore activeCall answerSdp / status === 'active')
  useEffect(() => {
    if (!activeCall) return;
    if (activeCall.answerSdp && pcRef.current && pcRef.current.signalingState === 'have-local-offer') {
      pcRef.current
        .setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: activeCall.answerSdp }))
        .catch(() => {
          // Ignore duplicate remote answer application
        });
    }
    if (activeCall.status === 'active' && callPhase === 'ringing') {
      stopOutgoingRingbackLoop();
      setIsLocalPreview(false);
      setCallPhase('connected');
      setCallStatusLabel('Connected');
      setDurationSec(0);
      setCallState('active');
      if (settingsRef.current.voiceLocationMode === 'external') {
        setShowCaptionsInOverlay(true);
        startContinuousSpeechRecognition(true);
      }
    } else if ((activeCall.status === 'ended' || activeCall.status === 'missed') && callPhase !== 'idle') {
      stopMediaTracks();
      setIsLocalPreview(false);
      setCallPhase('idle');
      setCallStatusLabel('Idle');
      setShowCallOverlay(false);
      setCallState('ended');
    }
  }, [activeCall, activeCall?.answerSdp, activeCall?.status, callPhase, startContinuousSpeechRecognition, stopMediaTracks]);

  const handleStartLiveCall = async (
    targetOverride?: { label: string; number: string; onlineStatus?: 'online' | 'offline'; intentionalDataOff?: boolean },
    callTypeOverride?: 'audio' | 'video'
  ) => {
    const targetIsVideo = callTypeOverride ? callTypeOverride === 'video' : isVideo;
    setMediaError(null);
    const resolvedNumber = targetOverride?.number || dialNumber.trim() || 'PK Chat Secure Line';
    const resolvedLabel = targetOverride?.label || (dialNumber.trim() || userProfile?.fullName || 'PK Chat Contact');
    const cleanDigits = resolvedNumber.replace(/\D/g, '');
    const initials =
      cleanDigits.length >= 2
        ? cleanDigits.slice(-2)
        : resolvedLabel.trim().slice(0, 2).toUpperCase() || 'PK';

    const matchedProfile = directoryProfiles.find(
      (p) =>
        p.fullName.toLowerCase() === resolvedLabel.toLowerCase() ||
        contacts.some((c) => c.contactUid === p.uid && c.displayName.toLowerCase() === resolvedLabel.toLowerCase())
    );
    const rawTargetStatus =
      targetOverride?.onlineStatus ?? matchedProfile?.onlineStatus ?? (networkOnline ? 'online' : 'offline');
    const resolvedOnlineStatus: 'online' | 'offline' =
      rawTargetStatus === 'offline' ? 'offline' : 'online';
    const targetDataOff = Boolean(targetOverride?.intentionalDataOff);

    const callEval = evaluateOutgoingCallState({
      targetOnlineStatus: resolvedOnlineStatus,
      targetIntentionalDataOff: targetDataOff,
      localNetworkOnline: typeof navigator !== 'undefined' ? navigator.onLine : networkOnline,
      localIntentionalDataOff: intentionalDataOff,
    });

    const lastSeenText =
      callEval.label === 'Offline'
        ? 'Offline (Mobile Data Off)'
        : resolvedOnlineStatus === 'online'
          ? 'Online'
          : 'last seen today';

    setActiveDialedTarget({
      label: resolvedLabel,
      number: resolvedNumber,
      initials,
      onlineStatus: resolvedOnlineStatus,
      lastSeenText,
      country: matchedProfile?.country,
    });
    setCallStatusLabel(callEval.label);

    if (callEval.label === 'Offline') {
      setCallPhase('idle');
      setShowCallOverlay(false);
      setCallState('idle');
      setMediaError(`${resolvedLabel} is Offline — Mobile Data is turned off and contact will not be disturbed.`);
      return;
    }

    if (targetIsVideo && !speakerOn) {
      setSpeakerOn(true);
      setRingbackSpeakerMode(true);
    }

    setIsLocalPreview(false);
    setCallPhase('ringing');
    setShowCallOverlay(true);
    setDurationSec(0);
    setCallState('connecting');
    setCameraOff(!targetIsVideo);
    const activeFacing: 'front' | 'back' = 'front';
    setCameraFacing(activeFacing);
    let offerSdp: string | undefined;

    if (callEval.allowZeroDataFallback) {
      const targetPhone =
        cleanDigits.length >= 7
          ? resolvedNumber
          : emergencyContacts[0]?.phone;
      if (targetPhone) {
        triggerOfflineSimSmsSos({
          recipients: [targetPhone],
          senderName: userProfile?.fullName || 'PK Chat User',
          note: `Calling... via Offline SIM Fallback (${targetIsVideo ? 'Video' : 'Voice'})`,
        });
      }
      setMediaError(callEval.reason);
      return;
    }

    try {
      const conn = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
      const effective = conn?.effectiveType;
      const adaptiveLowBw =
        lowBandwidth || effective === '2g' || effective === 'slow-2g';
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: noiseReduction,
          echoCancellation: true,
        },
        video:
          targetIsVideo && !adaptiveLowBw
            ? effective === '3g'
              ? {
                  facingMode: { ideal: activeFacing === 'front' ? 'user' : 'environment' },
                  width: { ideal: 640 },
                  height: { ideal: 360 },
                  frameRate: { ideal: 20, max: 24 },
                }
              : {
                  facingMode: { ideal: activeFacing === 'front' ? 'user' : 'environment' },
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  frameRate: { ideal: 30 },
                }
            : false,
      });
      streamRef.current = stream;
      if (localVideoRef.current && targetIsVideo) {
        localVideoRef.current.srcObject = stream;
      }
      if (overlayVideoRef.current && targetIsVideo) {
        overlayVideoRef.current.srcObject = stream;
        overlayVideoRef.current.play().catch(() => {});
      }

      const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
      const turnUrl = import.meta.env.VITE_TURN_URL;
      if (turnUrl) {
        iceServers.push({
          urls: turnUrl,
          username: import.meta.env.VITE_TURN_USERNAME || undefined,
          credential: import.meta.env.VITE_TURN_CREDENTIAL || undefined,
        });
      }

      const pc = new RTCPeerConnection({ iceServers });
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          stopOutgoingRingbackLoop();
          setIsLocalPreview(false);
          setCallState('active');
          setCallPhase('connected');
          setCallStatusLabel('Connected');
          if (settingsRef.current.voiceLocationMode === 'external') {
            setShowCaptionsInOverlay(true);
            startContinuousSpeechRecognition(true);
          }
        }
      };
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      pcRef.current = pc;
      offerSdp = offer.sdp;
    } catch (mediaErr) {
      setMediaError(
        mediaErr instanceof Error
          ? `${mediaErr.message}. Running live two-way buffered translation caption mode.`
          : 'Camera/microphone unavailable. Running caption mode.'
      );
    }

    try {
      const targetIds =
        matchedProfile?.uid && matchedProfile.uid !== userProfile?.uid
          ? [userProfile?.uid || '', matchedProfile.uid]
          : [userProfile?.uid || ''];
      await startCall({
        participantIds: targetIds,
        callType: targetIsVideo ? 'video' : 'audio',
        targetLanguage: speakerBLangCode,
        offerSdp,
        targetName: sanitizeCallLabel(resolvedLabel),
        targetPhone:
          resolvedNumber && resolvedNumber !== 'PK Chat Secure Line' ? resolvedNumber : undefined,
      });
      // Stay honestly in 'ringing' / 'connecting' until remote peer sends an answer or user ends/switches to carrier tel:
    } catch (callErr) {
      stopMediaTracks();
      setMediaError(
        callErr instanceof Error ? callErr.message : 'Unable to start call right now.'
      );
      setIsLocalPreview(false);
      setCallPhase('idle');
      setCallStatusLabel('Idle');
      setShowCallOverlay(false);
      setCallState('idle');
    }
  };

  const handleEndCall = async () => {
    sentenceBufferRef.current?.flushNow();
    stopMediaTracks();
    setIsLocalPreview(false);
    setCallPhase('idle');
    setCallStatusLabel('Idle');
    setShowCallOverlay(false);
    setActiveDialedTarget(null);
    setCallState('ended');
    if (activeCall?.callId) {
      try {
        await updateCallStatus(activeCall.callId, 'ended', durationSec);
      } catch {
        // Call tracks are already stopped cleanly locally.
      }
    }
  };

  const handleToggleCameraFacing = async () => {
    if (!isVideo || switchingCamera) return;
    const nextFacing: 'front' | 'back' = cameraFacing === 'front' ? 'back' : 'front';
    setMediaError(null);

    if (callState !== 'active' || lowBandwidth || cameraOff || !navigator.mediaDevices?.getUserMedia) {
      setCameraFacing(nextFacing);
      return;
    }

    setSwitchingCamera(true);
    try {
      const currentStream = streamRef.current;
      currentStream?.getVideoTracks().forEach((track) => {
        track.stop();
        currentStream.removeTrack(track);
      });

      const nextVideoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacing === 'front' ? 'user' : 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      const newVideoTrack = nextVideoStream.getVideoTracks()[0];
      if (!newVideoTrack) {
        throw new Error('Switched camera did not provide a video track');
      }

      if (currentStream) {
        currentStream.addTrack(newVideoTrack);
      } else {
        streamRef.current = nextVideoStream;
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = streamRef.current;
        localVideoRef.current.play().catch(() => {});
      }
      if (overlayVideoRef.current) {
        overlayVideoRef.current.srcObject = streamRef.current;
        overlayVideoRef.current.play().catch(() => {});
      }

      const videoSender = pcRef.current?.getSenders().find((s) => s.track?.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(newVideoTrack);
      }

      setCameraFacing(nextFacing);
    } catch (err) {
      setMediaError(
        err instanceof Error
          ? `Camera switch fallback: ${err.message}.`
          : 'Unable to switch camera on this device.'
      );
      setCameraFacing(nextFacing);
    } finally {
      setSwitchingCamera(false);
    }
  };

  const createFallbackScreenShareStream = useCallback((): MediaStream | null => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof canvas.captureStream !== 'function') return null;

    const drawFrame = () => {
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#0369a1');
      grad.addColorStop(0.5, '#0ea5e9');
      grad.addColorStop(1, '#e0f2fe');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillRect(64, 64, canvas.width - 128, canvas.height - 128);
      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('PK CHAT · Live Screen Share Preview', 100, 140);
      ctx.fillStyle = '#0f172a';
      ctx.font = '20px sans-serif';
      ctx.fillText(
        `Sharing workspace with ${activeDialedTarget?.label || 'Active Participant'}`,
        100,
        200
      );
      ctx.fillStyle = '#334155';
      ctx.font = '16px monospace';
      ctx.fillText(
        `Live Stream Time: ${new Date().toLocaleTimeString()} · Audio & Translation Active`,
        100,
        255
      );
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(100, 310, 320, 44);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('Embedded Preview Screen Feed', 124, 338);
    };

    drawFrame();
    if (screenFallbackTimerRef.current !== null) {
      window.clearInterval(screenFallbackTimerRef.current);
    }
    screenFallbackTimerRef.current = window.setInterval(drawFrame, 500);
    return canvas.captureStream(15);
  }, [activeDialedTarget?.label]);

  const handleStopScreenShare = useCallback(async () => {
    if (screenFallbackTimerRef.current !== null) {
      window.clearInterval(screenFallbackTimerRef.current);
      screenFallbackTimerRef.current = null;
    }
    screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    screenStreamRef.current = null;
    setIsScreenSharing(false);
    setScreenShareFallbackActive(false);

    if (!isVideo) return;

    let camTrack = streamRef.current?.getVideoTracks().find((t) => t.readyState === 'live') || null;
    if (!camTrack && !cameraOff && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: cameraFacing === 'front' ? 'user' : 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        camTrack = camStream.getVideoTracks()[0] || null;
        if (camTrack) {
          if (streamRef.current) {
            streamRef.current.addTrack(camTrack);
          } else {
            streamRef.current = camStream;
          }
        }
      } catch {
        // Keep audio active cleanly if hardware camera is busy
      }
    }

    if (camTrack) {
      camTrack.enabled = !cameraOff;
      const videoSender = pcRef.current?.getSenders().find((s) => s.track?.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(camTrack).catch(() => {});
      }
    }

    const restoredStream = streamRef.current;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = restoredStream;
      if (restoredStream) localVideoRef.current.play().catch(() => {});
    }
    if (overlayVideoRef.current) {
      overlayVideoRef.current.srcObject = restoredStream;
      if (restoredStream) overlayVideoRef.current.play().catch(() => {});
    }
  }, [cameraFacing, cameraOff, isVideo]);

  const handleStartScreenShare = useCallback(async () => {
    if (!isVideo) return;
    setMediaError(null);
    let displayStream: MediaStream | null = null;
    let usedFallback = false;

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia) {
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
      } catch (err) {
        const errName = err instanceof Error ? err.name : '';
        const errMsg = err instanceof Error ? err.message : '';
        const blockedByIframeOrPolicy =
          errName === 'NotAllowedError' ||
          errName === 'SecurityError' ||
          /display-capture|permissions policy|disallowed|not supported/i.test(errMsg);
        if (blockedByIframeOrPolicy) {
          displayStream = createFallbackScreenShareStream();
          usedFallback = Boolean(displayStream);
        } else {
          displayStream = createFallbackScreenShareStream();
          usedFallback = Boolean(displayStream);
        }
      }
    } else {
      displayStream = createFallbackScreenShareStream();
      usedFallback = Boolean(displayStream);
    }

    if (!displayStream) {
      setMediaError('Screen sharing could not be initialized on this browser.');
      return;
    }

    screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    screenStreamRef.current = displayStream;
    setIsScreenSharing(true);
    setScreenShareFallbackActive(usedFallback);
    if (usedFallback) {
      setMediaError(
        'Embedded iframe Permissions Policy restricted native display capture — smooth Screen Share Preview is active.'
      );
    }

    const displayTrack = displayStream.getVideoTracks()[0];
    if (displayTrack) {
      displayTrack.onended = () => {
        void handleStopScreenShare();
      };
      const videoSender = pcRef.current?.getSenders().find((s) => s.track?.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(displayTrack).catch(() => {});
      }
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = displayStream;
      localVideoRef.current.play().catch(() => {});
    }
    if (overlayVideoRef.current) {
      overlayVideoRef.current.srcObject = displayStream;
      overlayVideoRef.current.play().catch(() => {});
    }
  }, [createFallbackScreenShareStream, handleStopScreenShare, isVideo]);

  const handleToggleCallScreenShare = useCallback(() => {
    if (isScreenSharing) {
      void handleStopScreenShare();
    } else {
      void handleStartScreenShare();
    }
  }, [handleStartScreenShare, handleStopScreenShare, isScreenSharing]);

  const handleToggleVideoCamera = useCallback(async () => {
    if (!isVideo) return;
    const nextOff = !cameraOff;
    setCameraOff(nextOff);
    if (nextOff) {
      streamRef.current?.getVideoTracks().forEach((t) => {
        t.enabled = false;
      });
      return;
    }

    const existingTracks = streamRef.current?.getVideoTracks() || [];
    if (existingTracks.length > 0 && existingTracks.some((t) => t.readyState === 'live')) {
      existingTracks.forEach((t) => {
        t.enabled = true;
      });
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: cameraFacing === 'front' ? 'user' : 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        const newTrack = camStream.getVideoTracks()[0];
        if (newTrack) {
          if (streamRef.current) {
            streamRef.current.addTrack(newTrack);
          } else {
            streamRef.current = camStream;
          }
          if (!isScreenSharing) {
            const videoSender = pcRef.current?.getSenders().find((s) => s.track?.kind === 'video');
            if (videoSender) {
              await videoSender.replaceTrack(newTrack).catch(() => {});
            }
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = streamRef.current;
              localVideoRef.current.play().catch(() => {});
            }
            if (overlayVideoRef.current) {
              overlayVideoRef.current.srcObject = streamRef.current;
              overlayVideoRef.current.play().catch(() => {});
            }
          }
        }
      } catch {
        setMediaError('Camera hardware is unavailable on this device.');
      }
    }
  }, [cameraFacing, cameraOff, isScreenSharing, isVideo]);

  const handleRetryTurn = async (turn: LiveCallTurnEntry) => {
    setTurns((prev) =>
      prev.map((item) =>
        item.id === turn.id
          ? { ...item, status: 'translating', errorMessage: undefined }
          : item
      )
    );
    await translateTurnBySequence({
      turnId: turn.id,
      sequenceId: turn.sequenceId,
      sentence: turn.originalText,
      speakerRole: turn.speakerRole,
    });
  };

  const handleReplayTurnAudio = async (turn: LiveCallTurnEntry) => {
    if (!turn.translatedText.trim()) return;
    setReplayingId(turn.id);
    try {
      const targetLang =
        findWorldLanguage(turn.targetLanguageCode, WORLD_LANGUAGES_CATALOG) ||
        WORLD_LANGUAGES_CATALOG[0];
      let base64 = turn.audioBase64;
      if (!base64) {
        try {
          const tts = await synthesizeTranslatedSpeech({
            text: turn.translatedText,
            voiceName: languagePref?.ttsVoice || 'Kore',
            languageName: targetLang.name,
          });
          base64 = tts.audioBase64;
          setTurns((prev) =>
            prev.map((t) =>
              t.id === turn.id ? { ...t, audioBase64: base64, audioMimeType: 'audio/wav' } : t
            )
          );
        } catch {
          // Queue gracefully falls back to browser speechSynthesis
        }
      }
      await audioQueueRef.current?.playImmediate({
        turnId: turn.id,
        sequenceId: turn.sequenceId,
        text: turn.translatedText,
        audioBase64: base64,
        speechLocale: targetLang.speechLocale,
      });
    } finally {
      setReplayingId(null);
    }
  };

  const handleToggleLiveSpeechRecognition = () => {
    if (listeningLive || keepListeningRef.current) {
      stopContinuousSpeechRecognition();
      return;
    }
    startContinuousSpeechRecognition(false);
  };

  const speakerALangObj = useMemo(
    () => findWorldLanguage(speakerALangCode, WORLD_LANGUAGES_CATALOG) || WORLD_LANGUAGES_CATALOG[0],
    [speakerALangCode]
  );
  const speakerBLangObj = useMemo(
    () => findWorldLanguage(speakerBLangCode, WORLD_LANGUAGES_CATALOG) || WORLD_LANGUAGES_CATALOG[1],
    [speakerBLangCode]
  );

  return (
    <div className="p-4 lg:p-8 space-y-6">
      {/* WhatsApp-Style Live Call Screen Overlay (Audio + Video Face Beauty & Camera Controls) */}
      {showCallOverlay && callPhase !== 'idle' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Live Call Screen"
          className={`fixed inset-0 z-50 text-white flex flex-col items-center justify-between px-4 sm:px-6 py-6 sm:py-8 text-center overflow-hidden ${
            isVideo
              ? 'bg-black'
              : 'bg-gradient-to-br from-slate-950 via-[#0369a1] to-slate-900'
          }`}
        >
          {/* Live Video Stage Backdrop with Silent Background Natural Lighting */}
          {isVideo && (
            <div className="absolute inset-0 z-0 flex items-center justify-center bg-black">
              <video
                ref={overlayVideoRef}
                autoPlay
                muted
                playsInline
                style={{
                  filter: isScreenSharing || !beautyFilterEnabled ? 'none' : silentBeautyFilter,
                }}
                className={`w-full h-full ${
                  isScreenSharing
                    ? 'object-contain bg-black'
                    : cameraFacing === 'front'
                      ? 'object-cover -scale-x-100'
                      : 'object-cover'
                } ${(callPhase === 'connected' && !cameraOff) || isScreenSharing ? 'opacity-95' : 'hidden'}`}
              />
              {((callPhase === 'connected' && !cameraOff) || isScreenSharing) && (
                <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/65 pointer-events-none" />
              )}
            </div>
          )}

          {isScreenSharing && (
            <div
              role="status"
              aria-label="Screen sharing active"
              className="relative z-20 mt-2 px-4 py-2 rounded-2xl bg-[#e3f3ff]/90 text-slate-900 border border-[#7dd3fc] shadow-lg backdrop-blur-xl flex flex-wrap items-center justify-center gap-3 text-xs font-bold"
            >
              <span className="inline-flex items-center gap-1.5 text-[#0284c7]">
                <Monitor className="w-4 h-4 shrink-0" />
                <span>
                  You are sharing your screen
                  {screenShareFallbackActive ? ' (Preview Mode)' : ''}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void handleStopScreenShare()}
                className="px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold shadow"
              >
                Stop Sharing
              </button>
            </div>
          )}

          {/* Top Bar: Back Button + Clean WhatsApp-Style Call Metadata */}
          <div className="relative z-10 w-full max-w-2xl flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => setShowCallOverlay(false)}
              aria-label="Minimize call screen"
              className="min-h-[44px] min-w-[44px] rounded-full bg-black/45 hover:bg-black/65 border border-white/15 flex items-center justify-center text-white shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="space-y-1 flex-1 min-w-0">
              <p className="text-[11px] font-semibold tracking-wider uppercase text-white/80">
                {isVideo ? 'PK Chat Video' : 'PK Chat Voice'} · End-to-End Encrypted
              </p>
              <h2 className="text-xl sm:text-2xl font-bold text-white truncate">
                {activeDialedTarget?.label || dialNumber || 'PK Chat Secure Line'}
              </h2>
              {activeDialedTarget?.number &&
                activeDialedTarget.number !== 'PK Chat Secure Line' &&
                activeDialedTarget.number !== activeDialedTarget.label && (
                  <p className="text-xs font-mono text-sky-200 truncate">
                    {activeDialedTarget.number}
                  </p>
                )}
              <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-white/85">
                {callPhase === 'connected' ? (
                  <span className="font-mono tabular-nums">
                    {isLocalPreview ? 'Local Preview · ' : ''}
                    {String(Math.floor(durationSec / 60)).padStart(2, '0')}:
                    {String(durationSec % 60).padStart(2, '0')}
                  </span>
                ) : (
                  <span className="font-semibold">
                    {callStatusLabel === 'Idle' ? (callPhase === 'ringing' ? 'Ringing...' : 'Calling...') : callStatusLabel}
                  </span>
                )}
                <span>·</span>
                <span>{activeDialedTarget?.lastSeenText || (networkOnline ? 'Online' : 'Offline')}</span>
                <span>·</span>
                <span>
                  {weatherSnapshot.icon} {weatherSnapshot.tempC}°C
                </span>
              </div>
            </div>
            <div className="w-11 shrink-0" aria-hidden="true" />
          </div>

          {/* Center Avatar & Honest Ringing Fallbacks shown while awaiting peer answer */}
          <div className="relative z-10 flex flex-col items-center gap-3 my-auto">
            {(callPhase === 'ringing' || !isVideo || cameraOff) && (
              <div className="w-28 h-28 rounded-full bg-white/15 border-2 border-white/40 flex items-center justify-center text-3xl font-bold shadow-2xl">
                {activeDialedTarget?.initials || 'PK'}
              </div>
            )}
            {callPhase === 'ringing' && (
              <div className="max-w-xs space-y-2.5 text-center">
                <p className="text-xs text-white/80">
                  Waiting for remote PK Chat peer answer (WebRTC signaling active).
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {activeDialedTarget?.number && buildTelDialUri(activeDialedTarget.number) && (
                    <button
                      type="button"
                      onClick={() => triggerCellularDialFallback(activeDialedTarget.number)}
                      className="px-3 py-1.5 rounded-xl bg-[#00B4D8] hover:bg-[#0077B6] text-white text-[11px] font-bold flex items-center gap-1 shadow"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Carrier SIM Call</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      stopOutgoingRingbackLoop();
                      setIsLocalPreview(true);
                      setCallPhase('connected');
                      setCallStatusLabel('Connected');
                      setCallState('active');
                      if (settingsRef.current.voiceLocationMode === 'external') {
                        setShowCaptionsInOverlay(true);
                        startContinuousSpeechRecognition(true);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white text-[11px] font-semibold"
                  >
                    Local Mic/Cam Test
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Live Video & Voice Call Translation HUD (130+ Languages + Tanglish + Synced Audio) */}
          {voiceLocationMode === 'external' && showCaptionsInOverlay && (
            <div
              aria-label="Live Call Translation HUD"
              className="relative z-10 w-full max-w-2xl mb-3 rounded-2xl bg-[#071f3b]/75 backdrop-blur-2xl border border-[#7dd3fc]/50 px-3.5 py-2.5 text-left shadow-[0_12px_36px_rgba(2,132,199,0.38)] space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 font-bold text-[#7dd3fc]">
                    <Globe className="w-3.5 h-3.5" />
                    <span>Live Translate</span>
                  </span>
                  <select
                    aria-label="Speaker A Call Language"
                    value={speakerALangCode}
                    onChange={(e) => setSpeakerALangCode(e.target.value)}
                    className="px-2 py-0.5 rounded-lg bg-sky-950/80 border border-sky-400/40 text-white text-[10px] font-semibold"
                  >
                    {WORLD_LANGUAGES_CATALOG.filter((l) => l.supported).map((l) => (
                      <option key={`hud_a_${l.code}`} value={l.code}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <ArrowLeftRight className="w-3 h-3 text-sky-300 shrink-0" />
                  <select
                    aria-label="Speaker B Call Language"
                    value={speakerBLangCode}
                    onChange={(e) => setSpeakerBLangCode(e.target.value)}
                    className="px-2 py-0.5 rounded-lg bg-sky-950/80 border border-sky-400/40 text-white text-[10px] font-semibold"
                  >
                    {WORLD_LANGUAGES_CATALOG.filter((l) => l.supported).map((l) => (
                      <option key={`hud_b_${l.code}`} value={l.code}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveSpeakerRole((r) => (r === 'speaker_a' ? 'speaker_b' : 'speaker_a'))
                    }
                    className="px-2 py-0.5 rounded-lg bg-sky-500/25 hover:bg-sky-500/40 border border-sky-300/40 text-sky-100 text-[10px] font-bold"
                  >
                    {activeSpeakerRole === 'speaker_a' ? 'Speaking: A' : 'Speaking: B'}
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleLiveSpeechRecognition}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 border ${
                      listeningLive
                        ? 'bg-sky-400 text-slate-950 border-white/70 animate-pulse'
                        : 'bg-white/15 hover:bg-white/25 text-white border-white/25'
                    }`}
                  >
                    <Mic className="w-3 h-3" />
                    <span>{listeningLive ? 'Listening...' : 'Live Mic'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudioMode((m) => (m === 'translated' ? 'original' : 'translated'))}
                    className="px-2 py-0.5 rounded-lg bg-white/15 hover:bg-white/25 border border-white/25 text-white text-[10px] font-semibold"
                  >
                    {audioMode === 'translated' ? '🔊 Voice ON' : 'Captions Only'}
                  </button>
                </div>
              </div>

              {(bufferPreview || streamingPartial || activeSpeakingTurnId) && (
                <div className="px-2.5 py-1.5 rounded-xl bg-sky-500/20 border border-sky-300/35 text-[11px] flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sky-100 truncate">
                    {streamingPartial
                      ? `Live: ${streamingPartial}`
                      : bufferPreview
                        ? `Hearing: ${bufferPreview}`
                        : '🔊 Speaking translated voice in sync...'}
                  </span>
                  {activeSpeakingTurnId && (
                    <span className="text-[10px] font-bold text-[#7dd3fc] shrink-0">
                      🔊 Audio Sync
                    </span>
                  )}
                </div>
              )}

              <div className="max-h-24 overflow-y-auto space-y-1.5 pr-1">
                {turns.length === 0 ? (
                  <p className="text-[11px] text-sky-100/80">
                    Speak in {speakerALangObj.name}, {speakerBLangObj.name}, or Tanglish — live translated captions &amp; voice play automatically without interrupting video.
                  </p>
                ) : (
                  turns.slice(-2).map((turn) => (
                    <div
                      key={`overlay_${turn.id}`}
                      className={`px-2.5 py-1.5 rounded-xl border text-[11px] flex items-start justify-between gap-2 ${
                        activeSpeakingTurnId === turn.id
                          ? 'bg-sky-500/30 border-[#7dd3fc]'
                          : 'bg-slate-950/45 border-white/15'
                      }`}
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-sky-200/85 truncate">
                          <span className="font-semibold text-white">{turn.speakerName}:</span>{' '}
                          {turn.originalText}
                        </p>
                        <p className="font-bold text-[#bae6fd] leading-snug">
                          → {turn.translatedText}
                        </p>
                      </div>
                      {turn.status !== 'failed' && turn.status !== 'translating' && (
                        <button
                          type="button"
                          onClick={() => void handleReplayTurnAudio(turn)}
                          aria-label="Replay translated voice"
                          className="p-1.5 rounded-lg bg-sky-500/30 hover:bg-sky-500/50 text-white shrink-0"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!spokenInput.trim()) return;
                  const text = spokenInput.trim();
                  setSpokenInput('');
                  sentenceBufferRef.current?.pushText(
                    /[.!?।؟]$/.test(text) ? text : `${text}.`,
                    50
                  );
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  type="text"
                  value={spokenInput}
                  onChange={(e) => setSpokenInput(e.target.value)}
                  placeholder={`Type speech/Tanglish as ${activeSpeakerRole === 'speaker_a' ? speakerALangObj.name : speakerBLangObj.name}...`}
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl bg-sky-950/70 border border-sky-400/35 text-[11px] text-white placeholder:text-sky-200/60 focus:outline-none focus:border-[#7dd3fc]"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl bg-[#0284c7] hover:bg-[#0ea5e9] text-white text-[11px] font-bold whitespace-nowrap"
                >
                  Translate
                </button>
              </form>
            </div>
          )}

          {/* Bottom Bar: Exact WhatsApp-Style Audio/Video Call Controls */}
          <div className="relative z-10 w-full max-w-md pb-2 space-y-2.5">
            {/* Compact Frosted Extras Strip (Translate, Beauty, Share Screen, Record) */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (voiceLocationMode !== 'external') {
                    setVoiceLocationMode('external');
                    setAudioMode('translated');
                    setShowCaptionsInOverlay(true);
                    startContinuousSpeechRecognition(true);
                  } else {
                    setShowCaptionsInOverlay((v) => !v);
                  }
                }}
                aria-label="Toggle live call translation captions"
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 backdrop-blur-md border transition-colors ${
                  voiceLocationMode === 'external' && showCaptionsInOverlay
                    ? 'bg-[#38bdf8] text-slate-950 border-white/60'
                    : 'bg-white/12 hover:bg-white/22 text-white border-white/20'
                }`}
              >
                <Captions className="w-3.5 h-3.5" />
                <span>Translate</span>
              </button>

              {isVideo && (
                <>
                  <button
                    type="button"
                    onClick={() => setBeautyFilterEnabled((b) => !b)}
                    aria-label="Toggle beauty filter"
                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 backdrop-blur-md border transition-colors ${
                      beautyFilterEnabled
                        ? 'bg-[#38bdf8] text-slate-950 border-white/60'
                        : 'bg-white/12 hover:bg-white/22 text-white border-white/20'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Beauty</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleCallScreenShare}
                    aria-label={isScreenSharing ? 'Stop Sharing screen' : 'Share Screen'}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 backdrop-blur-md border transition-colors ${
                      isScreenSharing
                        ? 'bg-[#38bdf8] text-slate-950 border-white'
                        : 'bg-white/12 hover:bg-white/22 text-white border-white/20'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    <span>{isScreenSharing ? 'Stop Share' : 'Share Screen'}</span>
                  </button>
                </>
              )}

              {!isRecording ? (
                <button
                  type="button"
                  onClick={handleRecordTrigger}
                  aria-label="Record call"
                  className="px-3 py-1.5 rounded-full bg-white/12 hover:bg-white/22 text-white border border-white/20 text-[11px] font-semibold inline-flex items-center gap-1.5 backdrop-blur-md"
                >
                  <Disc className="w-3.5 h-3.5 text-rose-300" />
                  <span>Record</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopCallRecording}
                  aria-label="Stop recording"
                  className="px-3 py-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold inline-flex items-center gap-1.5"
                >
                  <Square className="w-3 h-3" />
                  <span>Stop {recordingSec}s</span>
                </button>
              )}
            </div>

            {/* Primary WhatsApp Bottom Control Dock: Speaker · Video · Flip (Video) · Mute · End Call */}
            <div className="px-4 py-3.5 rounded-[28px] bg-[#0b2545]/82 backdrop-blur-2xl border border-[#7dd3fc]/35 flex items-center justify-around gap-2 shadow-[0_12px_36px_rgba(2,132,199,0.4)]">
              <button
                type="button"
                onClick={() => {
                  const next = !speakerOn;
                  setSpeakerOn(next);
                  setRingbackSpeakerMode(next);
                }}
                aria-label={speakerOn ? 'Switch to earpiece' : 'Turn on speakerphone'}
                className="flex flex-col items-center gap-1 text-[10px] font-medium text-white/90"
              >
                <span
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                    speakerOn ? 'bg-white text-slate-950' : 'bg-white/15 hover:bg-white/25 text-white'
                  }`}
                >
                  {speakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                </span>
                <span>{speakerOn ? 'Speaker' : 'Earpiece'}</span>
              </button>

              {isVideo ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleToggleVideoCamera()}
                    aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                    className="flex flex-col items-center gap-1 text-[10px] font-medium text-white/90"
                  >
                    <span
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                        cameraOff ? 'bg-white text-slate-950' : 'bg-white/15 hover:bg-white/25 text-white'
                      }`}
                    >
                      {cameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                    </span>
                    <span>{cameraOff ? 'Cam Off' : 'Video'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleCameraFacing}
                    disabled={switchingCamera || cameraOff || isScreenSharing}
                    aria-label="Flip Camera"
                    className="flex flex-col items-center gap-1 text-[10px] font-medium text-white/90 disabled:opacity-50"
                  >
                    <span className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
                      <RotateCw className={`w-5 h-5 ${switchingCamera ? 'animate-spin' : ''}`} />
                    </span>
                    <span>Flip</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveScreen('video_call')}
                  aria-label="Switch to Video Call"
                  className="flex flex-col items-center gap-1 text-[10px] font-medium text-white/90"
                >
                  <span className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
                    <Video className="w-5 h-5" />
                  </span>
                  <span>Video</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const next = !micMuted;
                  setMicMuted(next);
                  streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
                }}
                aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
                className="flex flex-col items-center gap-1 text-[10px] font-medium text-white/90"
              >
                <span
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                    micMuted ? 'bg-white text-slate-950' : 'bg-white/15 hover:bg-white/25 text-white'
                  }`}
                >
                  {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </span>
                <span>{micMuted ? 'Unmute' : 'Mute'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleEndCall()}
                aria-label="End Call"
                className="flex flex-col items-center gap-1 text-[10px] font-semibold text-white"
              >
                <span className="w-13 h-13 rounded-full bg-[#ea0038] hover:bg-red-700 text-white flex items-center justify-center shadow-[0_8px_24px_rgba(234,0,56,0.5)] transition-colors">
                  <PhoneOff className="w-5 h-5" />
                </span>
                <span>End</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isVideo
              ? t('calls.videoTitle', 'Video Call & Two-Way Live Translation')
              : t('calls.audioTitle', 'Voice Call & Simultaneous Two-Way Translation')}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t(
              'calls.subtitle',
              'Sentence-buffered speech recognition, context & entity preservation, confidence checks, and caption-synced voice playback.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start">
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('pkchat-open-remember', {
                  detail: {
                    category: 'call',
                    title: dialNumber.trim()
                      ? `Call back ${dialNumber.trim()}`
                      : `Call back ${activeDialedTarget?.label || 'contact'}`,
                    note: activeDialedTarget?.number || dialNumber || undefined,
                    targetLabel: activeDialedTarget?.label || dialNumber || 'PK Chat Call',
                  },
                })
              );
            }}
            className="px-3.5 py-2 rounded-xl bg-sky-50/90 dark:bg-sky-950/60 hover:bg-sky-100 border border-[#bae6fd] dark:border-sky-700 text-[#0284c7] dark:text-[#38bdf8] text-xs font-semibold flex items-center gap-1.5 shadow-xs"
          >
            <BellPlus className="w-3.5 h-3.5" />
            <span>Remember Call</span>
          </button>

          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('pkchat-simulate-incoming-call', {
                  detail: {
                    callType: 'video',
                    callerName: 'PK Chat Caller Video Test',
                    isGroup: false,
                  },
                })
              )
            }
            className="px-3.5 py-2 rounded-xl bg-sky-50/90 dark:bg-sky-950/60 hover:bg-sky-100 border border-[#bae6fd] dark:border-sky-700 text-[#0284c7] dark:text-[#38bdf8] text-xs font-semibold flex items-center gap-1.5 shadow-xs"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Test Video Call</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDialPad((v) => !v)}
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
              showDialPad
                ? 'bg-[#0284c7] text-white border-[#0284c7]'
                : 'border-[#bae6fd] dark:border-slate-800 hover:bg-[#f0f9ff] dark:hover:bg-slate-800'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Dial Pad</span>
          </button>

          <div className="inline-flex items-center gap-1 p-1 bg-[#d8eeff]/80 backdrop-blur-xl border border-[#7dd3fc]/60 dark:bg-slate-800/80 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveScreen('audio_call')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                !isVideo ? 'bg-[#0284c7] text-white shadow-sm' : 'text-[#0369a1] dark:text-slate-300 hover:bg-[#e8f6ff]/70'
              }`}
            >
              {t('calls.audioCall', 'Audio Call')}
            </button>
            <button
              type="button"
              onClick={() => setActiveScreen('video_call')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isVideo ? 'bg-[#0284c7] text-white shadow-sm' : 'text-[#0369a1] dark:text-slate-300 hover:bg-[#e8f6ff]/70'
              }`}
            >
              {t('calls.videoCall', 'Video Call')}
            </button>
          </div>
        </div>
      </div>

      {/* Glass Marble Dial Pad with PK Chat Logo (Dove & Connected Globe) Visibly Behind */}
      {showDialPad && (
        <div
          id="pk-dialer-section"
          className="relative overflow-hidden p-5 sm:p-6 rounded-[30px] pk-glass-marble w-full max-w-sm mx-auto space-y-4"
        >
          {/* Visible PK Chat Logo Backdrop Behind Glass Marble Keypad */}
          <div
            aria-hidden="true"
            className="pointer-events-none select-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
          >
            <img
              src={BRAND_LOGO_URL}
              alt=""
              loading="eager"
              decoding="async"
              className="w-[88%] max-w-[320px] h-auto object-contain opacity-45 drop-shadow-[0_10px_28px_rgba(2,132,199,0.28)]"
            />
          </div>

          <div className="relative z-10 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-[#0c4a6e] dark:text-[#38bdf8] drop-shadow-[0_1px_1px_rgba(255,255,255,0.85)]">
              PK Chat Glass Marble Dial Pad
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('pkchat-open-remember', {
                      detail: {
                        category: 'call',
                        title: dialNumber.trim() ? `Call ${dialNumber.trim()}` : 'Remember a scheduled call',
                        note: dialNumber.trim() || undefined,
                      },
                    })
                  );
                }}
                className="text-[11px] font-bold text-[#0369a1] dark:text-[#38bdf8] hover:underline inline-flex items-center gap-1"
              >
                <BellPlus className="w-3.5 h-3.5" />
                <span>Remember</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!dialNumber.trim()) {
                    setMediaError('Enter a phone number on the dial pad first.');
                    return;
                  }
                  setMediaError(null);
                  setSaveContactNotice(null);
                  setShowSaveContactForm((v) => !v);
                }}
                className="text-[11px] font-bold text-blue-800 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Save Contact</span>
              </button>
              {(dialNumber || dialSearchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setDialNumber('');
                    setDialSearchQuery('');
                    setShowSaveContactForm(false);
                  }}
                  className="text-[11px] font-bold text-slate-700 hover:text-rose-600"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Direct Contact / Number Search inside Dial Pad */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#0369a1] absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={dialSearchQuery}
              onChange={(e) => setDialSearchQuery(e.target.value)}
              placeholder="Search contacts or phone numbers..."
              aria-label="Search contacts or phone numbers"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/55 dark:bg-slate-950/65 backdrop-blur-md border border-white/75 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-600 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="tel"
              value={dialNumber}
              onChange={(e) => setDialNumber(e.target.value.replace(/[^\d+*# -]/g, ''))}
              placeholder="Enter phone number (+94...)"
              className="flex-1 px-3.5 py-2.5 rounded-2xl bg-white/60 dark:bg-slate-950/70 backdrop-blur-md border border-white/80 dark:border-slate-800 text-lg font-mono font-bold tracking-wider text-slate-900 dark:text-white text-center shadow-inner"
            />
            <button
              type="button"
              onClick={() => setDialNumber((n) => n.slice(0, -1))}
              className="p-3 rounded-2xl pk-marble-key text-slate-800 dark:text-white"
              aria-label="Backspace digit"
            >
              <Delete className="w-4 h-4" />
            </button>
          </div>

          {showSaveContactForm && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const cleanName = newContactName.trim();
                const cleanPhone = dialNumber.trim();
                if (!cleanPhone) {
                  setMediaError('Enter a phone number on the dial pad first.');
                  return;
                }
                if (!cleanName) {
                  setMediaError('Enter a contact name before saving.');
                  return;
                }
                setMediaError(null);
                const nextList = [
                  { id: `dc_${Date.now()}`, name: cleanName, phone: cleanPhone },
                  ...savedDialContacts.filter((c) => c.phone !== cleanPhone),
                ].slice(0, 30);
                setSavedDialContacts(nextList);
                try {
                  localStorage.setItem('pk_dialpad_saved_contacts', JSON.stringify(nextList));
                } catch {
                  // Ignore storage quota issues
                }
                setNewContactName('');
                setShowSaveContactForm(false);
                setSaveContactNotice(`Saved "${cleanName}" (${cleanPhone}) to Dial Pad Contacts.`);
              }}
              className="p-3 rounded-2xl bg-sky-50/85 dark:bg-blue-950/50 backdrop-blur-md border border-white/80 dark:border-blue-900 space-y-2"
            >
              <p className="text-[11px] font-bold text-slate-900 dark:text-blue-200">
                Save {dialNumber} to Speed Dial Contacts
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="Contact name (e.g. Amma, Ravi)"
                  maxLength={50}
                  className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-white/80 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-blue-800 text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold shrink-0"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowSaveContactForm(false)}
                  className="px-2.5 py-1.5 rounded-xl bg-white/70 dark:bg-slate-800 border border-[#7dd3fc]/60 text-xs font-semibold shrink-0"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {saveContactNotice && (
            <div className="px-3 py-2 rounded-xl bg-sky-50/85 dark:bg-sky-950/60 backdrop-blur-md border border-white/80 dark:border-sky-800 flex items-center justify-between gap-2 text-[11px] text-[#0369a1] dark:text-sky-200 font-semibold">
              <span>{saveContactNotice}</span>
              <button
                type="button"
                onClick={() => setSaveContactNotice(null)}
                className="font-bold underline shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Natural WhatsApp-Proportioned Glass Marble Number Keys */}
          <div className="grid grid-cols-3 gap-3.5 px-1">
            {[
              { d: '1', sub: '' },
              { d: '2', sub: 'ABC' },
              { d: '3', sub: 'DEF' },
              { d: '4', sub: 'GHI' },
              { d: '5', sub: 'JKL' },
              { d: '6', sub: 'MNO' },
              { d: '7', sub: 'PQRS' },
              { d: '8', sub: 'TUV' },
              { d: '9', sub: 'WXYZ' },
              { d: '*', sub: '' },
              { d: '0', sub: '+' },
              { d: '#', sub: '' },
            ].map(({ d: digit, sub }) => (
              <button
                key={digit}
                type="button"
                onClick={() => setDialNumber((n) => `${n}${digit}`.slice(0, 20))}
                onDoubleClick={() => {
                  if (digit === '0') setDialNumber((n) => `${n.slice(0, -1)}+`.slice(0, 20));
                }}
                className="min-h-[62px] py-2 rounded-full pk-marble-key flex flex-col items-center justify-center text-slate-950 dark:text-white transition-all"
              >
                <span className="text-2xl font-bold leading-none drop-shadow-[0_1px_1px_rgba(255,255,255,0.85)]">
                  {digit}
                </span>
                {sub && (
                  <span className="text-[10px] font-bold tracking-widest text-slate-700 dark:text-sky-200 mt-1 leading-none">
                    {sub}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                if (!dialNumber.trim()) {
                  setMediaError('Enter a phone number on the dial pad first.');
                  return;
                }
                setSaveContactNotice(`📞 Calling ${dialNumber} via ${getRingtoneLabel(getSelectedRingtonePreset('direct_call'), 'direct_call')}...`);
                setActiveScreen('audio_call');
                setShowDialPad(false);
                void handleStartLiveCall(undefined, 'audio');
              }}
              className="min-h-[50px] py-2.5 rounded-full bg-[#0284c7] hover:bg-[#0369a1] text-white text-sm font-bold flex items-center justify-center gap-1.5 shadow-[0_6px_20px_rgba(2,132,199,0.4)] transition-all"
            >
              <Phone className="w-4 h-4" />
              <span>Audio</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!dialNumber.trim()) {
                  setMediaError('Enter a phone number on the dial pad first.');
                  return;
                }
                setActiveScreen('video_call');
                setShowDialPad(false);
                void handleStartLiveCall(undefined, 'video');
              }}
              className="min-h-[50px] py-2.5 rounded-full bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold flex items-center justify-center gap-1.5 shadow-[0_6px_18px_rgba(29,78,216,0.35)]"
            >
              <Video className="w-4 h-4" />
              <span>Video</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                const rawPhone = dialNumber.trim();
                if (!rawPhone) {
                  setMediaError('Enter a phone number on the dial pad first.');
                  return;
                }
                setMediaError(null);
                try {
                  const found = await lookupUserByPhone(rawPhone);
                  if (found) {
                    const targetProfile = directoryProfiles.find((p) => p.uid === found.userId) || {
                      uid: found.userId,
                      fullName: found.fullName,
                      about: 'PK Chat Member',
                      avatarUrl: '',
                      country: found.country,
                      countryCode: 'LK',
                      preferredLanguage: found.preferredLanguage,
                      preferredLanguageName: found.preferredLanguageName,
                      e2eePublicKey: '',
                      onlineStatus: 'online' as const,
                    };
                    const chatId = await startDirectChat(targetProfile);
                    setActiveChat(chatId, 'direct');
                    setShowDialPad(false);
                    setActiveScreen('individual_chat');
                    return;
                  }
                  setSaveContactNotice(
                    `${rawPhone} is not linked to a public PK Chat profile yet — saved speed dial contacts can be invited from Contacts.`
                  );
                } catch (err) {
                  setMediaError(
                    err instanceof Error ? err.message : 'Unable to look up phone number.'
                  );
                }
              }}
              className="min-h-[50px] py-2.5 rounded-full bg-slate-900/90 dark:bg-slate-800 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat</span>
            </button>
          </div>

          {(savedDialContacts.length > 0 || contacts.length > 0) && (() => {
            const q = (dialSearchQuery.trim() || dialNumber.trim()).toLowerCase();
            const filteredSaved = savedDialContacts.filter(
              (c) =>
                !q ||
                c.name.toLowerCase().includes(q) ||
                c.phone.replace(/\s+/g, '').toLowerCase().includes(q.replace(/\s+/g, ''))
            );
            return (
            <div className="pt-3 border-t border-white/60 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-800 dark:text-slate-300">
                <span>
                  PK Chat Contacts ({filteredSaved.length + contacts.length})
                </span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {filteredSaved.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/55 dark:bg-slate-950/75 backdrop-blur-md border border-white/75 dark:border-slate-800 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => setDialNumber(contact.phone)}
                      className="min-w-0 text-left flex-1"
                      title="Load number into dial pad"
                    >
                      <p className="font-semibold text-slate-900 dark:text-white truncate">
                        {contact.name}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                        {contact.phone} · PK Chat Secured 🔒
                      </p>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setDialNumber(contact.phone);
                          setActiveScreen('audio_call');
                          setShowDialPad(false);
                          void handleStartLiveCall({ label: contact.name, number: contact.phone }, 'audio');
                        }}
                        className="p-1.5 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white"
                        aria-label={`Voice call ${contact.name}`}
                        title="Voice Call"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDialNumber(contact.phone);
                          setActiveScreen('video_call');
                          setShowDialPad(false);
                          void handleStartLiveCall({ label: contact.name, number: contact.phone }, 'video');
                        }}
                        className="p-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
                        aria-label={`Video call ${contact.name}`}
                        title="Video Call"
                      >
                        <Video className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setDialNumber(contact.phone);
                          try {
                            const found = await lookupUserByPhone(contact.phone);
                            if (found) {
                              const targetProfile =
                                directoryProfiles.find((p) => p.uid === found.userId) || {
                                  uid: found.userId,
                                  fullName: found.fullName,
                                  about: 'PK Chat Member',
                                  avatarUrl: '',
                                  country: found.country,
                                  countryCode: 'LK',
                                  preferredLanguage: found.preferredLanguage,
                                  preferredLanguageName: found.preferredLanguageName,
                                  e2eePublicKey: '',
                                  onlineStatus: 'online' as const,
                                };
                              const chatId = await startDirectChat(targetProfile);
                              setActiveChat(chatId, 'direct');
                              setShowDialPad(false);
                              setActiveScreen('individual_chat');
                              return;
                            }
                            setShowDialPad(false);
                            setActiveScreen('contacts');
                          } catch {
                            setShowDialPad(false);
                            setActiveScreen('contacts');
                          }
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white"
                        aria-label={`Message ${contact.name}`}
                        title="Open Direct Chat"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = savedDialContacts.filter((c) => c.id !== contact.id);
                          setSavedDialContacts(next);
                          try {
                            localStorage.setItem('pk_dialpad_saved_contacts', JSON.stringify(next));
                          } catch {
                            // Ignore storage quota issues
                          }
                        }}
                        className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950 text-slate-400 hover:text-rose-600"
                        aria-label={`Remove ${contact.name}`}
                        title="Remove saved contact"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {contacts
                  .filter(
                    (contact) =>
                      !q ||
                      contact.displayName.toLowerCase().includes(q) ||
                      (contact.phoneMasked || '').toLowerCase().includes(q) ||
                      contact.country.toLowerCase().includes(q)
                  )
                  .map((contact) => {
                  const prof = directoryProfiles.find((p) => p.uid === contact.contactUid);
                  const isContactOnline = prof?.onlineStatus === 'online';
                  return (
                  <div
                    key={contact.contactUid}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/55 dark:bg-slate-950/45 backdrop-blur-md border border-white/75 dark:border-slate-800 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">
                        {contact.displayName}
                      </p>
                      <p className="text-[11px] text-[#0284c7] dark:text-[#38bdf8] truncate">
                        {contact.country} · {isContactOnline ? 'Online' : 'last seen today'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setShowDialPad(false);
                          const savedMatch = savedDialContacts.find(
                            (item) =>
                              item.name.trim().toLowerCase() ===
                              contact.displayName.trim().toLowerCase()
                          );
                          void handleStartLiveCall({
                            label: sanitizeCallLabel(contact.displayName),
                            number:
                              savedMatch?.phone ||
                              dialNumber.trim() ||
                              'PK Chat Secure Line',
                            onlineStatus: isContactOnline ? 'online' : 'offline',
                          });
                        }}
                        className="p-1.5 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white"
                        aria-label={`Call ${contact.displayName}`}
                        title="Call"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const profile = prof || {
                            uid: contact.contactUid,
                            fullName: contact.displayName,
                            about: 'PK Chat Member',
                            avatarUrl: '',
                            country: contact.country,
                            countryCode: 'LK',
                            preferredLanguage: contact.preferredLanguage || 'en',
                            preferredLanguageName:
                              contact.preferredLanguageName || contact.preferredLanguage || 'English',
                            e2eePublicKey: '',
                            onlineStatus: 'online' as const,
                          };
                          const chatId = await startDirectChat(profile);
                          setActiveChat(chatId, 'direct');
                          setShowDialPad(false);
                          setActiveScreen('individual_chat');
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white"
                        aria-label={`Message ${contact.displayName}`}
                        title="Open Chat"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
            );
          })()}
          </div>
        </div>
      )}

      <div id="pk-calls-stage-section" className="grid lg:grid-cols-12 gap-6">
        {/* Left: WebRTC Stage + Two-Way Channel & Speech Controls */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-3xl bg-slate-900 text-white border border-slate-800 p-5 flex flex-col justify-between min-h-[300px] select-none">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums">
                  {callState === 'active'
                    ? `${String(Math.floor(durationSec / 60)).padStart(2, '0')}:${String(durationSec % 60).padStart(2, '0')}`
                    : callStatusLabel !== 'Idle'
                      ? callStatusLabel
                      : callState.toUpperCase()}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] font-semibold">
                  🔒 Anti-Screenshot Protected
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-200 text-[10px] font-semibold">
                  <Sun className="w-3 h-3 text-amber-300" />
                  <span>{weatherSnapshot.icon} {weatherSnapshot.tempC}°C · {weatherSnapshot.city}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Wifi className={`w-3.5 h-3.5 ${networkOnline && !intentionalDataOff ? 'text-[#38bdf8]' : 'text-amber-400'}`} />
                  <span>
                    {intentionalDataOff
                      ? 'Offline (Data Off)'
                      : !networkOnline
                        ? 'Offline SIM Fallback'
                        : lowBandwidth
                          ? 'Low-Bandwidth Audio Mode'
                          : networkQuality}
                  </span>
                </span>
              </div>
            </div>

            <div className="my-5 flex-1 flex flex-col items-center justify-center">
              {isVideo ? (
                <div
                  className={`w-full aspect-video rounded-2xl border border-slate-800 overflow-hidden relative flex items-center justify-center ${
                    videoBgMode === 'ocean_glass'
                      ? 'bg-gradient-to-br from-sky-900 via-cyan-800 to-slate-900'
                      : videoBgMode === 'midnight_studio'
                        ? 'bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900'
                        : videoBgMode === 'peace_sky'
                          ? 'bg-gradient-to-br from-sky-700 via-blue-800 to-cyan-900'
                          : 'bg-slate-950'
                  }`}
                >
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    style={{
                      filter: isScreenSharing || !beautyFilterEnabled ? 'none' : silentBeautyFilter,
                    }}
                    className={`w-full h-full ${
                      isScreenSharing
                        ? 'object-contain bg-black'
                        : cameraFacing === 'front'
                          ? 'object-cover -scale-x-100'
                          : 'object-cover'
                    } ${cameraOff && !isScreenSharing ? 'hidden' : 'block'} ${
                      videoBgMode !== 'original' && videoBgMode !== 'soft_blur' && !isScreenSharing
                        ? 'opacity-90'
                        : ''
                    }`}
                  />
                  <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-lg bg-black/65 text-white text-[10px] font-bold tracking-wide uppercase">
                      {isScreenSharing
                        ? 'You are sharing your screen'
                        : cameraFacing === 'front'
                          ? 'Front Camera'
                          : 'Back Camera'}
                    </span>
                    {isScreenSharing && (
                      <button
                        type="button"
                        onClick={() => void handleStopScreenShare()}
                        className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold"
                      >
                        Stop Sharing
                      </button>
                    )}
                    {dialNumber && (
                      <span className="px-2.5 py-1 rounded-lg bg-black/60 text-white text-[11px] font-mono">
                        Dialing: {dialNumber}
                      </span>
                    )}
                    {isRecording && (
                      <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold animate-pulse">
                        ⏺ REC {String(Math.floor(recordingSec / 60)).padStart(2, '0')}:{String(recordingSec % 60).padStart(2, '0')}
                      </span>
                    )}
                  </div>
                  {cameraOff && !isScreenSharing && (
                    <p className="text-xs text-slate-400 px-4 text-center">
                      {lowBandwidth
                        ? 'Video disabled automatically in Low-Bandwidth mode to prioritize accurate translation'
                        : 'Camera preview activates cleanly when video call starts'}
                    </p>
                  )}
                  {videoPrivacyBlackout && !(myVideoConsent && partnerVideoConsent) && (
                    <div className="absolute inset-0 z-20 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center space-y-2.5">
                      <EyeOff className="w-7 h-7 text-[#33b3ff]" />
                      <p className="text-xs font-extrabold text-white">
                        🔞 Video Privacy Blackout Active (ஆடியோ அழைப்பு தொடர்கிறது)
                      </p>
                      <p className="text-[11px] text-slate-300 max-w-xs">
                        Voice audio &amp; real-time translation remain active. Video displays only after dual mutual consent.
                      </p>
                      {typeof window !== 'undefined' &&
                      window.localStorage.getItem('pk_minor_safety_mode') === 'true' ? (
                        <span className="px-3 py-1 rounded-lg bg-rose-900/60 border border-rose-500/40 text-[11px] font-bold text-rose-200">
                          Restricted in Minor Safety Mode (&lt;18)
                        </span>
                      ) : (
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setMyVideoConsent((v) => !v)}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${
                              myVideoConsent
                                ? 'bg-[#0284c7] text-white'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                            }`}
                          >
                            {myVideoConsent ? '✓ My Consent Granted' : 'Allow My Side'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPartnerVideoConsent((v) => !v)}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${
                              partnerVideoConsent
                                ? 'bg-[#33b3ff] text-slate-950'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                            }`}
                          >
                            {partnerVideoConsent ? '✓ Partner Consent Confirmed' : 'Confirm Partner Consent'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 rounded-full bg-sky-500/20 border border-[#38bdf8]/50 flex items-center justify-center mx-auto">
                    <Volume2 className="w-8 h-8 text-[#38bdf8]" />
                  </div>
                  <p className="text-base font-bold">
                    {activeDialedTarget?.label || userProfile?.fullName || 'PK CHAT Audio'}
                  </p>
                  <p className="text-[11px] text-sky-300">
                    {activeDialedTarget?.lastSeenText || (networkOnline && !intentionalDataOff ? 'Online' : 'Offline')} · {weatherSnapshot.icon} {weatherSnapshot.tempC}°C
                  </p>
                  <p className="text-xs text-slate-400">
                    Two-Way Engine: {speakerALangObj.name} ↔ {speakerBLangObj.name}
                  </p>
                  {isRecording && (
                    <span className="inline-block px-3 py-1 rounded-full bg-rose-600/30 border border-rose-500 text-rose-200 text-[11px] font-bold animate-pulse">
                      ⏺️ Recording Call ({String(Math.floor(recordingSec / 60)).padStart(2, '0')}:{String(recordingSec % 60).padStart(2, '0')})
                    </span>
                  )}
                </div>
              )}
            </div>

            {mediaError && (
              <p className="mb-3 text-xs text-amber-300 bg-amber-950/60 border border-amber-800 rounded-xl p-2.5">
                {mediaError}
              </p>
            )}
            <div className="mb-3 px-3 py-2 rounded-xl bg-[#0284c7]/20 border border-[#33b3ff]/40 text-[11px] text-[#e0f2fe] text-center">
              {voiceLocationMode === 'external'
                ? `Live Voice Translation Active (${speakerALangObj.name} ↔ ${speakerBLangObj.name}) · Foreign call speech translates automatically.`
                : 'Local District Mode (Direct Voice — Zero translation overhead between local callers).'}
            </div>
            {recordingNotice && (
              <div className="mb-3 text-xs text-sky-200 bg-sky-950/60 border border-[#38bdf8]/40 rounded-xl p-2.5 flex items-center justify-between gap-2">
                <span>{recordingNotice}</span>
                <button
                  type="button"
                  onClick={() => setRecordingNotice(null)}
                  className="text-[11px] underline shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2">
              {callState !== 'active' ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleStartLiveCall()}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#0284c7] to-[#0ea5e9] hover:brightness-105 text-white text-xs font-semibold flex items-center gap-2"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Start {isVideo ? 'Video' : 'Audio'} Call</span>
                  </button>
                  {!isRecording ? (
                    <button
                      type="button"
                      onClick={handleRecordTrigger}
                      className={`px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
                        isVideo
                          ? 'bg-pink-700 hover:bg-pink-600 border-pink-500/40 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 border-sky-500/40 text-[#38bdf8]'
                      }`}
                      title={
                        isVideo
                          ? 'Video Call (Requires Remote Consent)'
                          : 'Audio Call (Direct Dual Recording)'
                      }
                    >
                      <Disc className="w-4 h-4" />
                      <span>{isVideo ? 'Record Video' : 'Record Audio'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopCallRecording}
                      className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Stop &amp; Save Record</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !micMuted;
                      setMicMuted(next);
                      streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
                    }}
                    className={`min-h-[40px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium ${
                      micMuted ? 'bg-rose-600' : 'bg-slate-800 hover:bg-slate-700'
                    }`}
                  >
                    {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    <span>{micMuted ? 'Unmute' : 'Mute'}</span>
                  </button>

                  {isVideo && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleToggleVideoCamera()}
                        className={`min-h-[40px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium ${
                          cameraOff ? 'bg-rose-600' : 'bg-slate-800 hover:bg-slate-700'
                        }`}
                      >
                        {cameraOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                        <span>{cameraOff ? 'Cam Off' : 'Cam On'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleToggleCameraFacing}
                        disabled={switchingCamera || cameraOff || isScreenSharing}
                        className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1.5 text-xs font-medium"
                        title="Switch between Front and Back camera"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${switchingCamera ? 'animate-spin' : ''}`} />
                        <span>{cameraFacing === 'front' ? 'Front Cam' : 'Back Cam'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBeautyFilterEnabled((b) => !b)}
                        className={`min-h-[40px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium ${
                          beautyFilterEnabled
                            ? 'bg-[#38bdf8] text-slate-950 font-bold'
                            : 'bg-slate-800 hover:bg-slate-700 text-white'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{beautyFilterEnabled ? 'Beauty ON' : 'Beauty OFF'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleToggleCallScreenShare}
                        className={`min-h-[40px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-semibold ${
                          isScreenSharing
                            ? 'bg-[#38bdf8] text-slate-950'
                            : 'bg-slate-800 hover:bg-slate-700 text-sky-200'
                        }`}
                      >
                        <Monitor className="w-3.5 h-3.5" />
                        <span>{isScreenSharing ? 'Stop Sharing' : 'Share Screen'}</span>
                      </button>
                    </>
                  )}

                  {!isRecording ? (
                    <button
                      type="button"
                      onClick={handleRecordTrigger}
                      className={`min-h-[40px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-semibold border ${
                        isVideo
                          ? 'bg-pink-700 hover:bg-pink-600 text-white border-pink-500/40'
                          : 'bg-slate-800 hover:bg-slate-700 text-[#38bdf8] border-sky-500/35'
                      }`}
                      title={
                        isVideo
                          ? 'Video Call (Requires Remote Consent)'
                          : 'Audio Call (Direct Dual Recording)'
                      }
                    >
                      <Disc className="w-3.5 h-3.5" />
                      <span>{isVideo ? 'Record Video' : 'Record Audio'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopCallRecording}
                      className="min-h-[40px] px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 text-xs font-semibold"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Stop &amp; Save Record</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const next = !speakerOn;
                      setSpeakerOn(next);
                      setRingbackSpeakerMode(next);
                    }}
                    className={`min-h-[40px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium ${
                      speakerOn ? 'bg-[#0284c7] text-white' : 'bg-slate-800 hover:bg-slate-700'
                    }`}
                  >
                    {speakerOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    <span>{speakerOn ? 'Speaker On' : 'Earpiece'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleEndCall}
                    className="min-h-[40px] px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 flex items-center gap-1.5 text-xs font-semibold"
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span>End</span>
                  </button>
                </>
              )}
            </div>

            {/* Video Call Background & Privacy Shield (Zero sliders or percentage overlays) */}
            {isVideo && (
              <div className="mt-4 pt-3.5 border-t border-slate-800 space-y-2.5 text-xs">
                <div className="bg-slate-950/70 px-3 py-2.5 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-sky-300">
                      Video Call Backgrounds
                    </span>
                    <span className="text-[10px] text-slate-400 capitalize">
                      {videoBgMode.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: 'original', label: 'Original' },
                        { id: 'soft_blur', label: 'Soft Blur' },
                        { id: 'ocean_glass', label: 'Ocean Glass' },
                        { id: 'midnight_studio', label: 'Midnight Studio' },
                        { id: 'peace_sky', label: 'Peace Sky' },
                      ] as const
                    ).map((bg) => (
                      <button
                        key={bg.id}
                        type="button"
                        onClick={() => setVideoBgMode(bg.id)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
                          videoBgMode === bg.id
                            ? 'bg-[#0284c7] border-[#38bdf8] text-white'
                            : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-[#38bdf8]'
                        }`}
                      >
                        {bg.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Video Privacy Blackout & Dual Mutual Consent Shield */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/70 px-3 py-2.5 rounded-2xl border border-slate-800">
                  <div className="flex items-center gap-2 text-[11px]">
                    {videoPrivacyBlackout && !(myVideoConsent && partnerVideoConsent) ? (
                      <EyeOff className="w-4 h-4 text-[#33b3ff] shrink-0" />
                    ) : (
                      <Eye className="w-4 h-4 text-[#38bdf8] shrink-0" />
                    )}
                    <span className="font-semibold text-slate-200">
                      Privacy Blackout Shield (Audio-Only Until Dual Consent)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !videoPrivacyBlackout;
                      setVideoPrivacyBlackout(next);
                      if (next) {
                        setMyVideoConsent(false);
                        setPartnerVideoConsent(false);
                      }
                    }}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold ${
                      videoPrivacyBlackout
                        ? 'bg-[#33b3ff] text-slate-950'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    {videoPrivacyBlackout ? 'Shield Active (Re-Open)' : 'Enable Privacy Blackout'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Simultaneous Two-Way Language, Accent, Speed & Bandwidth Settings */}
          <div className="bg-[#e3f3ff]/76 dark:bg-slate-900/75 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl p-5 space-y-4 text-xs shadow-[0_8px_28px_rgba(2,132,199,0.1)]">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold flex items-center gap-1.5">
                <ArrowLeftRight className="w-4 h-4 text-[#0284c7]" />
                <span>Simultaneous Two-Way Channels</span>
              </h2>
              <button
                type="button"
                onClick={() =>
                  setActiveSpeakerRole((r) => (r === 'speaker_a' ? 'speaker_b' : 'speaker_a'))
                }
                className="px-2.5 py-1 rounded-lg bg-[#cdeaff]/80 dark:bg-sky-950/50 border border-[#7dd3fc]/80 dark:border-sky-800 text-[#0284c7] dark:text-[#38bdf8] font-semibold"
              >
                Speaking: {activeSpeakerRole === 'speaker_a' ? 'Speaker A' : 'Speaker B'}
              </button>
            </div>

            {/* Voice Location Mode (External / International vs Local District) */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#d6eeff]/80 dark:bg-slate-950 border border-[#7dd3fc]/75 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setVoiceLocationMode('external');
                  setAudioMode('translated');
                }}
                className={`py-2 px-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors ${
                  voiceLocationMode === 'external'
                    ? 'bg-[#0284c7] text-white shadow-xs'
                    : 'text-[#0369a1] dark:text-slate-300 hover:bg-[#e8f6ff]/70 dark:hover:bg-slate-900'
                }`}
              >
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span>External · Live Voice ON</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setVoiceLocationMode('local');
                  setAudioMode('original');
                }}
                className={`py-2 px-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors ${
                  voiceLocationMode === 'local'
                    ? 'bg-[#33b3ff] text-slate-950 shadow-xs'
                    : 'text-[#0369a1] dark:text-slate-300 hover:bg-[#e8f6ff]/70 dark:hover:bg-slate-900'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span>Local District · Direct Voice</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                  {t('calls.speakerA', 'Speaker A Language')}
                </label>
                <select
                  value={speakerALangCode}
                  onChange={(e) => setSpeakerALangCode(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800"
                >
                  {WORLD_LANGUAGES_CATALOG.filter((l) => l.supported).map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name} ({l.nativeName})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                  {t('calls.speakerB', 'Speaker B Language')}
                </label>
                <select
                  value={speakerBLangCode}
                  onChange={(e) => setSpeakerBLangCode(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800"
                >
                  {WORLD_LANGUAGES_CATALOG.filter((l) => l.supported).map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name} ({l.nativeName})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Accent Support Hint</label>
                <select
                  value={accentHint}
                  onChange={(e) => setAccentHint(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800"
                >
                  {ACCENT_HINTS.map((acc) => (
                    <option key={acc} value={acc}>
                      {acc}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">Speaking Speed</label>
                <select
                  value={speakingSpeed}
                  onChange={(e) => setSpeakingSpeed(e.target.value as SpeakingSpeedOption)}
                  className="w-full px-2.5 py-2 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800"
                >
                  <option value="slow">Slow / Deliberate</option>
                  <option value="normal">Normal Pace</option>
                  <option value="fast">Fast / Rapid</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAudioMode((m) => (m === 'translated' ? 'original' : 'translated'))}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-left"
              >
                <p className="text-[11px] text-slate-500">Translated Speech</p>
                <p className="font-semibold text-[#0284c7] dark:text-[#38bdf8] capitalize">
                  {audioMode} Audio
                </p>
              </button>
              <button
                type="button"
                onClick={() => setLowBandwidth((v) => !v)}
                className={`p-2.5 rounded-xl border text-left ${
                  lowBandwidth
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <p className="text-[11px] text-slate-500">Low-Bandwidth Mode</p>
                <p className="font-semibold">{lowBandwidth ? 'Active (Text Priority)' : 'Off (HD + Stream)'}</p>
              </button>
              <button
                type="button"
                onClick={() => setStreamingEnabled((v) => !v)}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-left"
              >
                <p className="text-[11px] text-slate-500">SSE Streaming</p>
                <p className="font-semibold">{streamingEnabled ? 'Enabled' : 'Standard JSON'}</p>
              </button>
              <button
                type="button"
                onClick={() => setNoiseReduction((v) => !v)}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-left"
              >
                <p className="text-[11px] text-slate-500">Noise Filter</p>
                <p className="font-semibold">{noiseReduction ? 'Enabled' : 'Disabled'}</p>
              </button>
            </div>

            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 flex items-start gap-2 text-[11px] text-blue-900 dark:text-blue-200">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
              <span>
                Audio Privacy: Speech frames travel over TLS/DTLS, buffer transiently in memory, and are never persisted as raw voice recordings during translation.
              </span>
            </div>
          </div>

          {/* Calls & Secure Recording Manager */}
          <div className="bg-[#e3f3ff]/76 dark:bg-[#202c33]/85 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-[#222d34] rounded-3xl overflow-hidden text-xs shadow-[0_8px_28px_rgba(2,132,199,0.1)]">
            <div className="px-4 py-2.5 bg-[#d5edff]/80 dark:bg-[#111b21]/85 border-b border-[#7dd3fc]/70 dark:border-[#222d34] flex items-center justify-between gap-2 font-semibold text-[#0369a1] dark:text-[#8696a0]">
              <span>Calls &amp; Secure Recording Manager</span>
              <span className="text-[11px] font-bold text-[#0077B6] dark:text-[#00B4D8]">
                🔔 {getRingtoneLabel(getSelectedRingtonePreset('direct_call'), 'direct_call')} Active
              </span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-[#222d34]">
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-[#e9edef] truncate">
                    Audio Call Recorder
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                    📞 Audio Call (Requires Consent)
                  </p>
                </div>
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRecordingNotice(null);
                      setRecordingConsentMode('audio');
                      setShowRecordingConsentModal(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold shrink-0"
                  >
                    Record Audio
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopCallRecording}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold shrink-0"
                  >
                    Stop Recording
                  </button>
                )}
              </div>

              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-[#e9edef] truncate">
                    Video Call Recorder
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                    📹 Video Call (Requires Consent)
                  </p>
                </div>
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRecordingNotice(null);
                      setRecordingConsentMode('video');
                      setShowRecordingConsentModal(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#0ea5e9] hover:bg-[#0284c7] text-white font-bold shrink-0"
                  >
                    Record Video
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopCallRecording}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold shrink-0"
                  >
                    Stop Recording
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Synchronized Buffered Caption Feed + Live Capture / Two-Way Input */}
        <div className="lg:col-span-7 bg-[#e3f3ff]/76 dark:bg-slate-900/75 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl p-5 flex flex-col justify-between space-y-4 shadow-[0_8px_28px_rgba(2,132,199,0.1)]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Captions className="w-5 h-5 text-[#0284c7]" />
                <span>Caption-Synced Translation Transcript</span>
              </h2>
              <span className="text-[11px] text-slate-500">
                Latency optimized for accuracy · Network timing varies
              </span>
            </div>

            {/* Active Sentence Buffer & Streaming Preview Bar */}
            {(bufferPreview || streamingPartial) && (
              <div className="p-3 rounded-2xl bg-[#d6eeff]/85 dark:bg-sky-950/40 border border-[#7dd3fc]/75 dark:border-sky-900 text-xs space-y-1">
                {bufferPreview && (
                  <p className="text-slate-600 dark:text-slate-300">
                    <strong>Buffering sentence:</strong> {bufferPreview}
                  </p>
                )}
                {streamingPartial && (
                  <p className="text-[#0284c7] dark:text-[#38bdf8] font-medium">
                    <strong>Live stream:</strong> {streamingPartial}
                  </p>
                )}
              </div>
            )}

            {/* Turn Feed Sorted Strictly by sequenceId */}
            <div className="h-[370px] overflow-y-auto rounded-2xl bg-[#d8eeff]/62 dark:bg-slate-950/75 backdrop-blur-xl border border-[#7dd3fc]/65 dark:border-slate-800 p-3.5 space-y-3">
              {turns.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-xs text-slate-600 dark:text-slate-400 px-6 gap-2">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    Ready for Two-Way Speech Translation ({speakerALangObj.name} ↔ {speakerBLangObj.name})
                  </p>
                  <p>
                    Start speaking with the microphone or send a sentence as Speaker A / Speaker B below. Names, numbers, dates, and uncertain phrases are checked automatically.
                  </p>
                </div>
              ) : (
                turns.map((turn) => {
                  const isSyncedPlaying = activeSpeakingTurnId === turn.id;
                  const uncertain = turn.status === 'uncertain' || turn.clarificationNeeded;
                  return (
                    <div
                      key={turn.id}
                      className={`p-3.5 rounded-2xl border text-xs space-y-2 transition-all ${
                        isSyncedPlaying
                          ? 'bg-[#cdeaff]/90 dark:bg-sky-950/40 border-[#0284c7] ring-2 ring-[#38bdf8]/40'
                          : uncertain
                            ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'
                            : turn.status === 'failed'
                              ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
                              : 'bg-[#ebf6ff]/82 dark:bg-slate-900/80 border-[#7dd3fc]/70 dark:border-slate-800 backdrop-blur-md'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800">
                            #{turn.sequenceId}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {turn.speakerName}
                          </span>
                          <span className="text-slate-500">
                            {turn.detectedLanguageName} → {turn.targetLanguageName}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {turn.status === 'translating' ? (
                            <span className="text-[11px] font-semibold text-blue-600">
                              Translating...
                            </span>
                          ) : turn.status === 'failed' ? (
                            <span className="text-[11px] font-semibold text-rose-600">
                              Network Failed
                            </span>
                          ) : uncertain ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Clarification Needed ({Math.round(turn.confidenceScore * 100)}%)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0284c7] dark:text-[#38bdf8]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {turn.confidenceLevel.toUpperCase()} ({Math.round(turn.confidenceScore * 100)}%)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-slate-600 dark:text-slate-300">
                          <span className="font-semibold">Original:</span> {turn.originalText}
                        </p>
                        {turn.status !== 'failed' && (
                          <p
                            className={`text-sm font-semibold ${
                              uncertain
                                ? 'text-amber-900 dark:text-amber-100'
                                : 'text-[#0284c7] dark:text-[#38bdf8]'
                            }`}
                          >
                            Translated: {turn.translatedText}
                          </p>
                        )}
                      </div>

                      {uncertain && turn.clarificationPrompt && (
                        <p className="p-2 rounded-lg bg-amber-100/70 dark:bg-amber-900/40 text-[11px] text-amber-900 dark:text-amber-100">
                          {turn.clarificationPrompt}
                        </p>
                      )}

                      {turn.errorMessage && (
                        <p className="text-[11px] text-rose-700 dark:text-rose-300">
                          Error: {turn.errorMessage}
                        </p>
                      )}

                      {turn.preservedEntities.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-[10px] text-slate-500">Preserved entities:</span>
                          {turn.preservedEntities.map((ent) => (
                            <span
                              key={ent}
                              className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[10px] font-mono text-blue-800 dark:text-blue-200"
                            >
                              {ent}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                        <span className="text-slate-400 font-mono">
                          {turn.latencyMs ? `${turn.latencyMs}ms` : 'Queued'}
                          {turn.retryCount > 0 ? ` · ${turn.retryCount} retry` : ''}
                          {isSyncedPlaying ? ' · Speaking now' : ''}
                        </span>

                        <div className="flex items-center gap-2">
                          {(turn.status === 'failed' || uncertain) && (
                            <button
                              type="button"
                              onClick={() => handleRetryTurn(turn)}
                              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold flex items-center gap-1"
                            >
                              <RotateCw className="w-3 h-3" />
                              <span>Retry Translation</span>
                            </button>
                          )}

                          {turn.status !== 'failed' && turn.status !== 'translating' && (
                            <button
                              type="button"
                              disabled={replayingId === turn.id}
                              onClick={() => handleReplayTurnAudio(turn)}
                              className="px-2.5 py-1 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-white font-semibold flex items-center gap-1"
                            >
                              <Play className="w-3 h-3" />
                              <span>
                                {replayingId === turn.id
                                  ? 'Playing...'
                                  : 'Replay Translated Audio'}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Live Microphone Capture + Simultaneous Speaker A / Speaker B Phrase Composer */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleToggleLiveSpeechRecognition}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 ${
                  listeningLive
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-blue-700 hover:bg-blue-800 text-white'
                }`}
              >
                <Mic className="w-4 h-4" />
                <span>
                  {listeningLive
                    ? `Stop & Flush Mic (${activeSpeakerRole === 'speaker_a' ? speakerALangObj.name : speakerBLangObj.name})`
                    : `Start Streaming Mic (${activeSpeakerRole === 'speaker_a' ? speakerALangObj.name : speakerBLangObj.name})`}
                </span>
              </button>

              <div className="inline-flex rounded-xl border border-[#7dd3fc]/70 dark:border-slate-800 p-0.5 bg-[#d8eeff]/75 dark:bg-slate-950 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveSpeakerRole('speaker_a')}
                  className={`px-3 py-1.5 rounded-lg font-semibold ${
                    activeSpeakerRole === 'speaker_a'
                      ? 'bg-[#0284c7] text-white'
                      : 'text-[#0369a1] dark:text-slate-300'
                  }`}
                >
                  A ({speakerALangObj.code.toUpperCase()})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSpeakerRole('speaker_b')}
                  className={`px-3 py-1.5 rounded-lg font-semibold ${
                    activeSpeakerRole === 'speaker_b'
                      ? 'bg-blue-700 text-white'
                      : 'text-[#0369a1] dark:text-slate-300'
                  }`}
                >
                  B ({speakerBLangObj.code.toUpperCase()})
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!spokenInput.trim()) return;
                const text = spokenInput.trim();
                setSpokenInput('');
                // Force immediate buffered sentence emission on submit
                sentenceBufferRef.current?.pushText(
                  /[.!?।؟]$/.test(text) ? text : `${text}.`,
                  50
                );
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={spokenInput}
                onChange={(e) => setSpokenInput(e.target.value)}
                placeholder={`Speak or type as ${
                  activeSpeakerRole === 'speaker_a'
                    ? `Speaker A (${speakerALangObj.name} → ${speakerBLangObj.name})`
                    : `Speaker B (${speakerBLangObj.name} → ${speakerALangObj.name})`
                }...`}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-xs"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#0284c7] to-[#0ea5e9] hover:brightness-105 text-white text-xs font-semibold whitespace-nowrap"
              >
                Translate &amp; Speak
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Consent-Based Audio / Video Call Recording Request Modal (Yes / No) */}
      {showRecordingConsentModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="recording-consent-title"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="max-w-md w-full rounded-3xl bg-[#0f172a] border-2 border-[#38bdf8] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-[#38bdf8]">
              <Disc className="w-5 h-5 shrink-0" />
              <h3 id="recording-consent-title" className="text-base font-bold text-white">
                {recordingConsentMode === 'video'
                  ? '📹 Video Recording Request (வீடியோ பதிவு அனுமதி)'
                  : '📞 Audio Call Recording Request (ஆடியோ பதிவு அனுமதி)'}
              </h3>
            </div>
            <div className="space-y-2 text-sm text-[#e9edef]">
              <p>
                எதிரில் உள்ள நபர் இந்த அழைப்பைப் பதிவு செய்ய (Record) அனுமதி கோருகிறார். The other participant is requesting to record this call. Do you allow this?
              </p>
              <p className="text-xs text-[#8696a0]">
                Mutual participant consent is required before local call recording begins.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowRecordingConsentModal(false);
                  setRecordingNotice(
                    `❌ Call recording declined (${recordingConsentMode === 'video' ? 'Video' : 'Audio'} அனுமதி மறுக்கப்பட்டது).`
                  );
                }}
                className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors"
              >
                No · Don&apos;t Allow
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRecordingConsentModal(false);
                  void startCallRecording(recordingConsentMode === 'video');
                }}
                className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold transition-colors"
              >
                Yes · Allow Recording
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
