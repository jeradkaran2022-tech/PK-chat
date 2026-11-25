import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BellOff,
  BellPlus,
  Check,
  Copy,
  Disc,
  Download,
  Eraser,
  Globe,
  Hand,
  Highlighter,
  LayoutGrid,
  Link2,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  PenTool,
  Phone,
  PhoneOff,
  Plus,
  RotateCcw,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  Unlock,
  Users,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react';
import { usePkChat } from '../context/PkChatContext';
import { WORLD_LANGUAGES_CATALOG, findWorldLanguage } from '../data/worldLanguages';
import {
  buildClassMeetingUrl,
  ClassRoomState,
  ClassSubtitleEntry,
  evaluateSameLanguagePassThrough,
  parseClassRoomFromInput,
  sanitizeClassRoomId,
  WhiteboardPoint,
  WhiteboardStroke,
} from '../lib/classTranslation';
import { buildSilentBeautyCssFilter, computeSilentNaturalLightProfile } from '../lib/silentBeautify';
import {
  getRingtoneLabel,
  getSelectedRingtonePreset,
  setRingbackSpeakerMode,
  startOutgoingRingbackLoop,
  stopOutgoingRingbackLoop,
} from '../lib/audioTones';
import {
  DataPackageMode,
  evaluateOutgoingCallState,
  getDataPackageMode,
  isPkLiveClassDndEnabled,
  setDataPackageMode,
  setPkLiveClassDndEnabled,
} from '../lib/connectivityAndDnd';
import { useOnlineStatus } from '../hooks/usePWAInstall';
import { PkLiveClassIcon } from './PkLiveClassIcon';
import { PkLiveClassRoom } from './PkLiveClassRoom';
import {
  analyzeVideoFrameForUnsafeContent,
  evaluateClassSafetyContent,
} from '../lib/securityShield';

const BOARD_COLORS = ['#0F172A', '#0284C7', '#059669', '#DC2626', '#D97706', '#7C3AED'];

interface ClassRoomChatMessage {
  id: string;
  roomId: string;
  senderUid: string;
  senderName: string;
  senderRole: 'teacher' | 'student';
  text: string;
  createdAtMs: number;
}

interface SavedClassRecording {
  id: string;
  roomId: string;
  title: string;
  durationSec: number;
  createdAtIso: string;
  blobUrl: string;
  mimeType: string;
  sizeKb: number;
}

export function ClassWhiteboardView() {
  const { userProfile, worldLanguages, appLanguage, setActiveScreen, directoryProfiles, intentionalDataOff } = usePkChat();
  const isNetworkOnline = useOnlineStatus();
  const catalog = worldLanguages.length > 0 ? worldLanguages : WORLD_LANGUAGES_CATALOG;
  const supportedLanguages = useMemo(() => catalog.filter((l) => l.supported), [catalog]);

  const initialRoom = useMemo(() => {
    if (typeof window === 'undefined') return 'pkc-global-class';
    const parsed = parseClassRoomFromInput(window.location.href);
    return parsed || 'pkc-global-class';
  }, []);

  const [roomId, setRoomId] = useState<string>(initialRoom);
  const [joinInput, setJoinInput] = useState<string>('');
  const [roomTitle, setRoomTitle] = useState<string>('PK Live Class & Whiteboard');
  const [role, setRole] = useState<'teacher' | 'student'>('teacher');
  const [teacherLangCode, setTeacherLangCode] = useState<string>(
    userProfile?.preferredLanguage || appLanguage || 'ta'
  );
  const [studentLangCode, setStudentLangCode] = useState<string>(
    userProfile?.preferredLanguage || appLanguage || 'ta'
  );
  const [roomState, setRoomState] = useState<ClassRoomState | null>(null);
  const [strokes, setStrokes] = useState<WhiteboardStroke[]>([]);
  const [subtitles, setSubtitles] = useState<ClassSubtitleEntry[]>([]);

  // Interactive Whiteboard controls
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [penColor, setPenColor] = useState<string>(BOARD_COLORS[0]);
  const [penWidth, setPenWidth] = useState<number>(4);
  const [showWhiteboard, setShowWhiteboard] = useState<boolean>(true);

  // Class media & live caption controls
  const [micMuted, setMicMuted] = useState<boolean>(false);
  const [cameraOff, setCameraOff] = useState<boolean>(true);
  const [beautyFilterEnabled, setBeautyFilterEnabled] = useState<boolean>(true);
  const [viewLayout, setViewLayout] = useState<'speaker' | 'grid'>('speaker');
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [handRaised, setHandRaised] = useState<boolean>(false);
  const [captionInput, setCaptionInput] = useState<string>('');
  const [sendingCaption, setSendingCaption] = useState<boolean>(false);
  const [listeningSpeech, setListeningSpeech] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [showParticipants, setShowParticipants] = useState<boolean>(false);
  const [hostActionBusy, setHostActionBusy] = useState<boolean>(false);
  const [langPickerTarget, setLangPickerTarget] = useState<'student' | 'teacher' | null>(null);
  const [langSearch, setLangSearch] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);
  const [liveVideoRoomOpen, setLiveVideoRoomOpen] = useState<boolean>(false);

  // Dedicated 4-Tab PK Live Class Hub + Isolated Class Messages + Class Calls + Class Settings
  const [liveClassTab, setLiveClassTab] = useState<'board' | 'messages' | 'calls' | 'settings'>('board');
  const [classMessages, setClassMessages] = useState<ClassRoomChatMessage[]>([]);
  const [classMsgInput, setClassMsgInput] = useState<string>('');
  const [liveClassDnd, setLiveClassDnd] = useState<boolean>(() => isPkLiveClassDndEnabled());
  const [pkgMode, setPkgMode] = useState<DataPackageMode>(() => getDataPackageMode());
  const [classCallState, setClassCallState] = useState<'idle' | 'connecting' | 'active' | 'ended'>('idle');
  const [classCallType, setClassCallType] = useState<'audio' | 'video'>('video');
  const [classCallStatusLabel, setClassCallStatusLabel] = useState<'Ringing...' | 'Calling...' | 'Offline' | 'Connected' | 'Local Loopback Test Active'>('Ringing...');
  const [classCallSpeaker, setClassCallSpeaker] = useState<boolean>(true);
  const [classCallMuted, setClassCallMuted] = useState<boolean>(false);
  const [classCallTargetUid, setClassCallTargetUid] = useState<string>('');
  const [classCallSeconds, setClassCallSeconds] = useState<number>(0);

  // Direct Student Study Recording (Video + Clear Audio — Zero Permission Prompt / Silent)
  const [isRecordingClass, setIsRecordingClass] = useState<boolean>(false);
  const [classRecordSeconds, setClassRecordSeconds] = useState<number>(0);
  const [savedClassRecordings, setSavedClassRecordings] = useState<SavedClassRecording[]>([]);
  const classRecorderRef = useRef<MediaRecorder | null>(null);
  const classRecordAudioStreamRef = useRef<MediaStream | null>(null);
  const classRecordChunksRef = useRef<Blob[]>([]);
  const classRecordStartRef = useRef<number>(0);
  const discardRecordingOnSafetyRef = useRef<boolean>(false);
  const savedRecordingsRef = useRef<SavedClassRecording[]>([]);
  savedRecordingsRef.current = savedClassRecordings;

  // Real-time AI Safety Shield Blackout
  const [safetyBlackout, setSafetyBlackout] = useState<{
    active: boolean;
    reason: string;
    detectedAt: string;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const safetyScanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const callSignalChannelRef = useRef<BroadcastChannel | null>(null);
  const speechRecRef = useRef<{ stop: () => void } | null>(null);
  const activePointsRef = useRef<WhiteboardPoint[]>([]);
  const isDrawingRef = useRef<boolean>(false);
  const hostTokenRef = useRef<string | null>(null);
  const [boardLocked, setBoardLocked] = useState<boolean>(false);

  const userUid = userProfile?.uid || 'guest_class_member';
  const userName = userProfile?.fullName || 'PK Chat Member';

  const passThroughDecision = useMemo(
    () => evaluateSameLanguagePassThrough(teacherLangCode, studentLangCode, catalog),
    [teacherLangCode, studentLangCode, catalog]
  );

  const meetingUrl = useMemo(() => buildClassMeetingUrl(roomId), [roomId]);

  const silentBeautyFilter = useMemo(
    () => buildSilentBeautyCssFilter(computeSilentNaturalLightProfile(null, userProfile?.fullName)),
    [userProfile?.fullName]
  );

  const filteredLanguages = useMemo(() => {
    const q = langSearch.trim().toLowerCase();
    if (!q) return supportedLanguages;
    return supportedLanguages.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q) ||
        (l.region || '').toLowerCase().includes(q)
    );
  }, [langSearch, supportedLanguages]);

  // Listen for URL/event deep link opens while already inside app
  useEffect(() => {
    const onOpenRoom = (ev: Event) => {
      const nextRoom = (ev as CustomEvent<string>).detail;
      if (nextRoom) {
        setRoomId(sanitizeClassRoomId(nextRoom));
      }
    };
    window.addEventListener('pkchat-open-class-room', onOpenRoom);
    return () => window.removeEventListener('pkchat-open-class-room', onOpenRoom);
  }, []);

  // Join classroom & subscribe to real-time SSE whiteboard + subtitle stream
  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;

    const connectRoom = async () => {
      try {
        const joinRes = await fetch(`/api/class/${encodeURIComponent(roomId)}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: userUid,
            name: userName,
            role,
            preferredLanguage: role === 'teacher' ? teacherLangCode : studentLangCode,
          }),
        });
        if (!joinRes.ok || cancelled) {
          if (!joinRes.ok) {
            const errJson = (await joinRes.json().catch(() => ({}))) as { error?: string };
            if (errJson.error) setNotice(errJson.error);
          }
          return;
        }
        const data = (await joinRes.json()) as { room: ClassRoomState; hostAccessToken?: string };
        if (cancelled) return;
        if (data.hostAccessToken) {
          hostTokenRef.current = data.hostAccessToken;
        }
        setRoomState(data.room);
        setBoardLocked(Boolean(data.room.isLocked));
        setRoomTitle(data.room.title);
        setStrokes(data.room.strokes || []);
        setSubtitles(data.room.subtitles || []);
        if (role === 'student' && data.room.teacherLanguage) {
          setTeacherLangCode(data.room.teacherLanguage);
        }

        source = new EventSource(`/api/class/${encodeURIComponent(roomId)}/stream`);
        source.addEventListener('class_snapshot', (ev) => {
          try {
            const payload = JSON.parse((ev as MessageEvent).data) as { room: ClassRoomState };
            setRoomState(payload.room);
            setBoardLocked(Boolean(payload.room.isLocked));
            setStrokes(payload.room.strokes || []);
            setSubtitles(payload.room.subtitles || []);
          } catch {
            // ignore parse noise
          }
        });
        source.addEventListener('class_lock_changed', (ev) => {
          try {
            const payload = JSON.parse((ev as MessageEvent).data) as { isLocked: boolean };
            setBoardLocked(Boolean(payload.isLocked));
          } catch {
            // ignore
          }
        });
        source.addEventListener('whiteboard_stroke', (ev) => {
          try {
            const stroke = JSON.parse((ev as MessageEvent).data) as WhiteboardStroke;
            setStrokes((prev) =>
              prev.some((s) => s.strokeId === stroke.strokeId) ? prev : [...prev, stroke]
            );
          } catch {
            // ignore
          }
        });
        source.addEventListener('whiteboard_undo', (ev) => {
          try {
            const payload = JSON.parse((ev as MessageEvent).data) as {
              strokes: WhiteboardStroke[];
            };
            setStrokes(payload.strokes || []);
          } catch {
            // ignore
          }
        });
        source.addEventListener('whiteboard_cleared', () => {
          setStrokes([]);
        });
        source.addEventListener('class_subtitle', (ev) => {
          try {
            const sub = JSON.parse((ev as MessageEvent).data) as ClassSubtitleEntry;
            const safety = evaluateClassSafetyContent(`${sub.originalText} ${sub.translatedText}`);
            if (!safety.safe) {
              triggerImmediateSafetyBlackout(safety.reason || 'Inappropriate caption detected in live class.');
              return;
            }
            setSubtitles((prev) =>
              prev.some((item) => item.id === sub.id) ? prev : [...prev.slice(-30), sub]
            );
          } catch {
            // ignore
          }
        });
        source.addEventListener('class_safety_blackout', (ev) => {
          try {
            const payload = JSON.parse((ev as MessageEvent).data) as { reason?: string };
            triggerImmediateSafetyBlackout(
              payload.reason || 'PK Live Class Safety Shield blocked inappropriate content.'
            );
          } catch {
            triggerImmediateSafetyBlackout('PK Live Class Safety Shield activated.');
          }
        });
        source.addEventListener('participant_joined', (ev) => {
          try {
            const payload = JSON.parse((ev as MessageEvent).data) as {
              participant?: ClassRoomState['participants'][number];
              teacherLanguage?: string;
            };
            if (role === 'student' && payload.teacherLanguage) {
              setTeacherLangCode(payload.teacherLanguage);
            }
            if (payload.participant) {
              setRoomState((prev) => {
                if (!prev) return prev;
                const exists = prev.participants.some((p) => p.uid === payload.participant!.uid);
                return {
                  ...prev,
                  participants: exists
                    ? prev.participants.map((p) =>
                        p.uid === payload.participant!.uid ? payload.participant! : p
                      )
                    : [...prev.participants, payload.participant!],
                };
              });
            }
          } catch {
            // ignore
          }
        });
        source.addEventListener('hand_raised', (ev) => {
          try {
            const payload = JSON.parse((ev as MessageEvent).data) as {
              uid?: string | null;
              handRaised?: boolean;
              participants?: ClassRoomState['participants'];
            };
            if (payload.uid === null || payload.uid === userUid) {
              setHandRaised(Boolean(payload.handRaised));
            }
            if (payload.participants) {
              setRoomState((prev) => (prev ? { ...prev, participants: payload.participants! } : prev));
            }
          } catch {
            // ignore
          }
        });
        source.addEventListener('host_mute_updated', (ev) => {
          try {
            const payload = JSON.parse((ev as MessageEvent).data) as {
              targetUid?: string | null;
              muteAll?: boolean;
              muted?: boolean;
              participants?: ClassRoomState['participants'];
            };
            if (payload.participants) {
              setRoomState((prev) => (prev ? { ...prev, participants: payload.participants! } : prev));
            }
            const affected =
              (payload.muteAll && role !== 'teacher') || payload.targetUid === userUid;
            if (affected && payload.muted) {
              setMicMuted(true);
              micStreamRef.current?.getAudioTracks().forEach((tr) => {
                tr.enabled = false;
              });
              mediaStreamRef.current?.getAudioTracks().forEach((tr) => {
                tr.enabled = false;
              });
              setNotice('Your microphone was muted by the class host.');
            }
          } catch {
            // ignore
          }
        });
        source.addEventListener('participant_removed', (ev) => {
          try {
            const payload = JSON.parse((ev as MessageEvent).data) as { uid?: string };
            if (payload.uid === userUid && role !== 'teacher') {
              setNotice('You were removed from the classroom session by the host.');
              setActiveScreen('chat_list');
            }
          } catch {
            // ignore
          }
        });
        source.addEventListener('class_ended', (ev) => {
          try {
            const payload = JSON.parse((ev as MessageEvent).data) as { endedBy?: string };
            setNotice(`PK Live Class ended by ${payload.endedBy || 'Host'}.`);
            speechRecRef.current?.stop();
            micStreamRef.current?.getTracks().forEach((tr) => tr.stop());
            mediaStreamRef.current?.getTracks().forEach((tr) => tr.stop());
            screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
            setActiveScreen('chat_list');
          } catch {
            // ignore
          }
        });
        source.addEventListener('participant_left', (ev) => {
          try {
            const payload = JSON.parse((ev as MessageEvent).data) as {
              uid?: string;
              participants?: ClassRoomState['participants'];
            };
            setRoomState((prev) =>
              prev
                ? {
                    ...prev,
                    participants:
                      payload.participants ||
                      prev.participants.filter((p) => p.uid !== payload.uid),
                  }
                : prev
            );
          } catch {
            // ignore
          }
        });
      } catch {
        // Offline resilient fallback keeps local canvas usable
      }
    };

    void connectRoom();
    return () => {
      cancelled = true;
      source?.close();
    };
  }, [roomId, userUid, userName, role, teacherLangCode, studentLangCode]);

  // Camera lifecycle
  useEffect(() => {
    if (cameraOff) {
      mediaStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => {
        setCameraOff(true);
        setNotice('Camera unavailable — running whiteboard & subtitle mode.');
      });

    return () => {
      cancelled = true;
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    };
  }, [cameraOff]);

  useEffect(() => {
    return () => {
      speechRecRef.current?.stop();
      micStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      micStreamRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      mediaStreamRef.current = null;
      screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      screenStreamRef.current = null;
      callSignalChannelRef.current?.close();
      callSignalChannelRef.current = null;
      if (classRecorderRef.current && classRecorderRef.current.state !== 'inactive') {
        try {
          classRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      classRecordAudioStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      savedRecordingsRef.current.forEach((rec) => {
        try {
          URL.revokeObjectURL(rec.blobUrl);
        } catch {
          // ignore
        }
      });
      stopOutgoingRingbackLoop();
    };
  }, []);

  const stopClassStudyRecording = useCallback((discardUnsafe = false) => {
    discardRecordingOnSafetyRef.current = discardUnsafe;
    if (classRecorderRef.current && classRecorderRef.current.state !== 'inactive') {
      try {
        classRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    classRecordAudioStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    classRecordAudioStreamRef.current = null;
    setIsRecordingClass(false);
  }, []);

  const triggerImmediateSafetyBlackout = useCallback(
    (reason: string) => {
      setSafetyBlackout({
        active: true,
        reason,
        detectedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
      setMicMuted(true);
      setCameraOff(true);
      setIsScreenSharing(false);
      setListeningSpeech(false);
      speechRecRef.current?.stop();
      micStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      micStreamRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      mediaStreamRef.current = null;
      screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      screenStreamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
      stopClassStudyRecording(true);
      stopOutgoingRingbackLoop();
      setNotice('🛡️ PK Live Class Safety Blackout engaged: unsafe content was immediately blocked.');
    },
    [stopClassStudyRecording]
  );

  const handleToggleClassMic = async () => {
    const nextMuted = !micMuted;
    if (nextMuted) {
      setMicMuted(true);
      micStreamRef.current?.getAudioTracks().forEach((tr) => {
        tr.enabled = false;
      });
      mediaStreamRef.current?.getAudioTracks().forEach((tr) => {
        tr.enabled = false;
      });
      return;
    }

    if (!micStreamRef.current && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        micStreamRef.current = audioStream;
      } catch {
        setMicMuted(true);
        setNotice('Microphone permission is unavailable or denied on this device.');
        return;
      }
    }

    micStreamRef.current?.getAudioTracks().forEach((tr) => {
      tr.enabled = true;
    });
    mediaStreamRef.current?.getAudioTracks().forEach((tr) => {
      tr.enabled = true;
    });
    setMicMuted(false);
  };

  const handleLeaveClass = async () => {
    setSafetyBlackout(null);
    speechRecRef.current?.stop();
    setListeningSpeech(false);
    micStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    micStreamRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    mediaStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    screenStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
    setCameraOff(true);
    setIsScreenSharing(false);
    stopClassStudyRecording(false);
    stopOutgoingRingbackLoop();
    callSignalChannelRef.current?.close();
    callSignalChannelRef.current = null;
    try {
      await fetch(`/api/class/${encodeURIComponent(roomId)}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: userUid }),
      });
    } catch {
      // Leave cleanly even if offline
    }
    setActiveScreen('chat_list');
  };

  const handleHostAction = async (
    action:
      | 'mute_all'
      | 'unmute_all'
      | 'mute_participant'
      | 'unmute_participant'
      | 'lower_all_hands'
      | 'lower_hand'
      | 'remove_participant'
      | 'end_class',
    targetUid?: string
  ) => {
    setHostActionBusy(true);
    try {
      const res = await fetch(`/api/class/${encodeURIComponent(roomId)}/host-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(hostTokenRef.current ? { 'x-class-host-token': hostTokenRef.current } : {}),
        },
        body: JSON.stringify({ action, targetUid }),
      });
      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice(errJson.error || 'Host authorization required.');
        return;
      }
      const data = (await res.json()) as {
        participants?: ClassRoomState['participants'];
      };
      if (data.participants) {
        setRoomState((prev) => (prev ? { ...prev, participants: data.participants! } : prev));
      }
      if (action === 'lower_all_hands' || (action === 'lower_hand' && targetUid === userUid)) {
        setHandRaised(false);
      }
      if (action === 'end_class') {
        await handleLeaveClass();
        return;
      }
      const actionLabels: Record<string, string> = {
        mute_all: 'Host muted all students cleanly.',
        unmute_all: 'Host enabled student audio.',
        mute_participant: 'Participant muted by host.',
        unmute_participant: 'Participant unmuted by host.',
        lower_all_hands: 'All raised hands lowered.',
        lower_hand: 'Participant hand lowered.',
        remove_participant: 'Participant removed from class.',
      };
      setNotice(actionLabels[action] || 'Host control updated.');
    } catch {
      setNotice('Unable to apply host control while offline.');
    } finally {
      setHostActionBusy(false);
    }
  };

  // Direct Student Study Recording (Video + Crystal-Clear Audio, ZERO permission prompts or peer notifications)
  const startClassStudyRecording = useCallback(async () => {
    if (safetyBlackout?.active) {
      setNotice('Recording is disabled while PK Safety Blackout is active.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setNotice('Local video/audio class recording is not supported in this browser.');
      return;
    }

    const composedStream = new MediaStream();

    // Prefer active shared screen, then live camera, then live whiteboard canvas stream
    const activeVideoTrack =
      screenStreamRef.current?.getVideoTracks()?.[0] ||
      mediaStreamRef.current?.getVideoTracks()?.[0] ||
      canvasRef.current?.captureStream?.(24)?.getVideoTracks()?.[0];

    if (activeVideoTrack) {
      composedStream.addTrack(activeVideoTrack);
    }

    // Crystal-clear speech audio capture (silent fallback to video-only if mic blocked on desktop)
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        classRecordAudioStreamRef.current = audioStream;
        audioStream.getAudioTracks().forEach((tr) => composedStream.addTrack(tr));
      }
    } catch {
      // Keep recording whiteboard/video cleanly even if microphone permission is unavailable
    }

    if (composedStream.getTracks().length === 0) {
      setNotice('Open Whiteboard, Camera, or Audio first to record your study revision clip.');
      return;
    }

    const preferredMimes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'audio/webm;codecs=opus',
      'audio/webm',
    ];
    const selectedMime =
      preferredMimes.find((m) => MediaRecorder.isTypeSupported(m)) || '';

    classRecordChunksRef.current = [];
    discardRecordingOnSafetyRef.current = false;
    classRecordStartRef.current = Date.now();
    setClassRecordSeconds(0);

    try {
      const recorder = new MediaRecorder(composedStream, {
        ...(selectedMime ? { mimeType: selectedMime } : {}),
        audioBitsPerSecond: 128000,
        videoBitsPerSecond: 1500000,
      });

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          classRecordChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const wasDiscarded = discardRecordingOnSafetyRef.current;
        const chunks = classRecordChunksRef.current;
        classRecordChunksRef.current = [];
        classRecordAudioStreamRef.current?.getTracks().forEach((tr) => tr.stop());
        classRecordAudioStreamRef.current = null;
        setIsRecordingClass(false);

        if (wasDiscarded || chunks.length === 0) return;

        const mime = recorder.mimeType || selectedMime || 'video/webm';
        const blob = new Blob(chunks, { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        const durationSec = Math.max(1, Math.round((Date.now() - classRecordStartRef.current) / 1000));
        const item: SavedClassRecording = {
          id: `cls_rec_${Date.now()}`,
          roomId,
          title: `${roomTitle} · Revision Clip`,
          durationSec,
          createdAtIso: new Date().toISOString(),
          blobUrl,
          mimeType: mime,
          sizeKb: Math.max(1, Math.round(blob.size / 1024)),
        };
        setSavedClassRecordings((prev) => [item, ...prev].slice(0, 12));
        setNotice(`🎓 Study recording saved locally (${durationSec}s · Next-day revision ready).`);
      };

      classRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecordingClass(true);
      setNotice('🔴 Recording PK Live Class video & clear audio locally for study revision (No alerts sent).');
    } catch {
      classRecordAudioStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      classRecordAudioStreamRef.current = null;
      setNotice('Unable to initialize local class MediaRecorder on this device.');
    }
  }, [roomId, roomTitle, safetyBlackout?.active]);

  useEffect(() => {
    if (!isRecordingClass) return;
    const id = window.setInterval(() => setClassRecordSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [isRecordingClass]);

  // Continuous live camera / screen-share AI safety frame guard (runs cleanly every 1.6s when video active)
  useEffect(() => {
    if (safetyBlackout?.active || (cameraOff && !isScreenSharing)) return;
    const id = window.setInterval(() => {
      const targetEl = isScreenSharing ? screenVideoRef.current : videoRef.current;
      if (!targetEl || targetEl.readyState < 2 || targetEl.videoWidth === 0) return;
      if (!safetyScanCanvasRef.current) {
        safetyScanCanvasRef.current = document.createElement('canvas');
        safetyScanCanvasRef.current.width = 48;
        safetyScanCanvasRef.current.height = 48;
      }
      const scanCtx = safetyScanCanvasRef.current.getContext('2d', { willReadFrequently: true });
      if (!scanCtx) return;
      try {
        scanCtx.drawImage(targetEl, 0, 0, 48, 48);
        const img = scanCtx.getImageData(0, 0, 48, 48);
        const res = analyzeVideoFrameForUnsafeContent({
          data: img.data,
          width: img.width,
          height: img.height,
        });
        if (!res.safe && res.blackoutRequired) {
          triggerImmediateSafetyBlackout(
            res.reason || 'PK Vision Shield detected inappropriate visual activity.'
          );
        }
      } catch {
        // ignore cross-origin or transient canvas read frames
      }
    }, 1600);
    return () => window.clearInterval(id);
  }, [cameraOff, isScreenSharing, safetyBlackout?.active, triggerImmediateSafetyBlackout]);

  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      screenStreamRef.current = null;
      if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
      setIsScreenSharing(false);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      setNotice('Screen sharing is not supported in this browser tab. You can still share notes on the Live Whiteboard.');
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      screenStreamRef.current = displayStream;
      setIsScreenSharing(true);
      const track = displayStream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          screenStreamRef.current = null;
          if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
          setIsScreenSharing(false);
        };
      }
      window.setTimeout(() => {
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = displayStream;
          screenVideoRef.current.play().catch(() => {});
        }
      }, 40);
    } catch {
      setIsScreenSharing(false);
      setNotice('Screen sharing was cancelled or permission was denied.');
    }
  };

  // Isolated PK Live Class Messaging (never mixes with personal PK Chats)
  useEffect(() => {
    const key = `pk_live_class_msgs_${roomId}`;
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as ClassRoomChatMessage[]) : [];
      setClassMessages(Array.isArray(parsed) ? parsed : []);
    } catch {
      setClassMessages([]);
    }

    let channel: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel(`pk_live_class_chat_${roomId}`);
        channel.onmessage = (ev) => {
          const incoming = ev.data as ClassRoomChatMessage;
          if (!incoming?.id) return;
          const safety = evaluateClassSafetyContent(incoming.text);
          if (!safety.safe) {
            triggerImmediateSafetyBlackout(
              safety.reason || 'Inappropriate classroom message detected and blocked.'
            );
            return;
          }
          setClassMessages((prev) =>
            prev.some((m) => m.id === incoming.id) ? prev : [...prev.slice(-80), incoming]
          );
        };
      } catch {
        // ignore BroadcastChannel limits
      }
    }
    return () => channel?.close();
  }, [roomId, triggerImmediateSafetyBlackout]);

  const handleSendClassMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = classMsgInput.trim();
    if (!clean) return;
    const safety = evaluateClassSafetyContent(clean);
    if (!safety.safe) {
      setClassMsgInput('');
      triggerImmediateSafetyBlackout(
        safety.reason || 'Inappropriate content blocked inside PK Live Class.'
      );
      return;
    }
    const msg: ClassRoomChatMessage = {
      id: `cm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      roomId,
      senderUid: userUid,
      senderName: userName,
      senderRole: role,
      text: clean.slice(0, 1200),
      createdAtMs: Date.now(),
    };
    setClassMsgInput('');
    setClassMessages((prev) => {
      const next = [...prev.slice(-80), msg];
      try {
        localStorage.setItem(`pk_live_class_msgs_${roomId}`, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
      return next;
    });
    try {
      if ('BroadcastChannel' in window) {
        const ch = new BroadcastChannel(`pk_live_class_chat_${roomId}`);
        ch.postMessage(msg);
        ch.close();
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (classCallState !== 'active') return;
    const id = window.setInterval(() => setClassCallSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [classCallState]);

  const startLiveClassCall = (type: 'audio' | 'video') => {
    const targetPeer = directoryProfiles.find((p) => p.uid === classCallTargetUid) || null;
    const evalRes = evaluateOutgoingCallState({
      targetOnlineStatus: targetPeer?.onlineStatus === 'offline' ? 'offline' : 'online',
      targetIntentionalDataOff: targetPeer ? targetPeer.onlineStatus === 'offline' : false,
      localNetworkOnline: isNetworkOnline,
      localIntentionalDataOff: intentionalDataOff,
    });

    setClassCallType(type);
    setClassCallSeconds(0);
    setClassCallState('connecting');

    if (evalRes.label === 'Offline') {
      setClassCallStatusLabel('Offline');
      stopOutgoingRingbackLoop();
      setNotice('Selected participant turned Data Off (Offline) and will not be disturbed.');
      return;
    }

    setClassCallStatusLabel(evalRes.label);
    startOutgoingRingbackLoop({ speakerOn: classCallSpeaker });

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        callSignalChannelRef.current?.close();
        const ch = new BroadcastChannel(`pk_class_call_${roomId}`);
        callSignalChannelRef.current = ch;
        ch.onmessage = (ev) => {
          const data = ev.data as { type?: string; senderUid?: string } | null;
          if (data?.type === 'accept_class_call' && data.senderUid !== userUid) {
            stopOutgoingRingbackLoop();
            setClassCallStatusLabel('Connected');
            setClassCallState('active');
          } else if (data?.type === 'end_class_call' && data.senderUid !== userUid) {
            endLiveClassCall();
          }
        };
        ch.postMessage({
          type: 'offer_class_call',
          callType: type,
          roomId,
          senderUid: userUid,
          targetUid: classCallTargetUid || 'room',
        });
      } catch {
        // Keep ringing cleanly if BroadcastChannel is unavailable
      }
    }
  };

  const startClassLoopbackTest = async (type: 'audio' | 'video') => {
    setClassCallType(type);
    setClassCallSeconds(0);
    stopOutgoingRingbackLoop();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setNotice('Local mic/camera test requires browser media device access.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: type === 'video',
      });
      if (type === 'audio' && !micStreamRef.current) {
        micStreamRef.current = stream;
      } else if (type === 'video') {
        micStreamRef.current?.getTracks().forEach((tr) => tr.stop());
        micStreamRef.current = new MediaStream(stream.getAudioTracks());
        mediaStreamRef.current = new MediaStream(stream.getVideoTracks());
        setCameraOff(false);
        window.setTimeout(() => {
          if (videoRef.current && mediaStreamRef.current) {
            videoRef.current.srcObject = mediaStreamRef.current;
            videoRef.current.play().catch(() => {});
          }
        }, 40);
      }
      setMicMuted(false);
      setClassCallStatusLabel('Local Loopback Test Active');
      setClassCallState('active');
      setNotice('Local mic/camera capture verified cleanly.');
    } catch {
      setNotice('Microphone or camera permission was denied for local loopback test.');
    }
  };

  const endLiveClassCall = () => {
    stopOutgoingRingbackLoop();
    callSignalChannelRef.current?.close();
    callSignalChannelRef.current = null;
    setClassCallState('ended');
    window.setTimeout(() => setClassCallState('idle'), 1200);
  };

  // Redraw whiteboard strokes onto canvas cleanly
  const renderStrokeList = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, list: WhiteboardStroke[], livePoints?: WhiteboardPoint[]) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      // Subtle architectural grid guides
      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
      ctx.lineWidth = 1;
      for (let gx = 40; gx < width; gx += 40) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, height);
        ctx.stroke();
      }
      for (let gy = 40; gy < height; gy += 40) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(width, gy);
        ctx.stroke();
      }
      ctx.restore();

      const drawSingle = (
        pts: WhiteboardPoint[],
        strokeTool: WhiteboardStroke['tool'],
        color: string,
        lineWidth: number
      ) => {
        if (pts.length === 0) return;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (strokeTool === 'eraser') {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = Math.max(18, lineWidth * 3.5);
          ctx.globalAlpha = 1;
        } else if (strokeTool === 'highlighter') {
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(14, lineWidth * 3);
          ctx.globalAlpha = 0.28;
        } else {
          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          ctx.globalAlpha = 1;
        }

        ctx.beginPath();
        ctx.moveTo(pts[0].x * width, pts[0].y * height);
        if (pts.length === 1) {
          ctx.lineTo(pts[0].x * width + 0.5, pts[0].y * height + 0.5);
        } else {
          for (let i = 1; i < pts.length; i += 1) {
            ctx.lineTo(pts[i].x * width, pts[i].y * height);
          }
        }
        ctx.stroke();
        ctx.restore();
      };

      for (const s of list) {
        drawSingle(s.points, s.tool, s.color, s.width);
      }
      if (livePoints && livePoints.length > 0) {
        drawSingle(livePoints, tool, penColor, penWidth);
      }
    },
    [penColor, penWidth, tool]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderStrokeList(ctx, canvas.width, canvas.height, strokes);
  }, [strokes, renderStrokeList, showWhiteboard]);

  const toNormalizedPoint = (ev: React.PointerEvent<HTMLCanvasElement>): WhiteboardPoint => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width)));
    const y = Math.max(0, Math.min(1, (ev.clientY - rect.top) / Math.max(1, rect.height)));
    return { x, y };
  };

  const handlePointerDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    ev.currentTarget.setPointerCapture(ev.pointerId);
    isDrawingRef.current = true;
    const pt = toNormalizedPoint(ev);
    activePointsRef.current = [pt];
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      renderStrokeList(ctx, canvas.width, canvas.height, strokes, activePointsRef.current);
    }
  };

  const handlePointerMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const pt = toNormalizedPoint(ev);
    activePointsRef.current.push(pt);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      renderStrokeList(ctx, canvas.width, canvas.height, strokes, activePointsRef.current);
    }
  };

  const handlePointerUp = async () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const points = [...activePointsRef.current];
    activePointsRef.current = [];
    if (points.length === 0) return;

    const optimistic: WhiteboardStroke = {
      strokeId: `local_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
      authorUid: userUid,
      authorName: userName,
      tool,
      color: penColor,
      width: penWidth,
      points,
      createdAt: new Date().toISOString(),
    };
    setStrokes((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(`/api/class/${encodeURIComponent(roomId)}/stroke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(hostTokenRef.current ? { 'x-class-host-token': hostTokenRef.current } : {}),
        },
        body: JSON.stringify({
          authorUid: userUid,
          authorName: userName,
          tool,
          color: penColor,
          width: penWidth,
          points,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { stroke: WhiteboardStroke };
        setStrokes((prev) =>
          prev.map((s) => (s.strokeId === optimistic.strokeId ? json.stroke : s))
        );
      } else {
        setStrokes((prev) => prev.filter((s) => s.strokeId !== optimistic.strokeId));
        const errJson = (await res.json().catch(() => ({}))) as { error?: string };
        if (errJson.error) setNotice(errJson.error);
      }
    } catch {
      // keep local stroke visible
    }
  };

  const handleToggleLockBoard = async () => {
    const nextLocked = !boardLocked;
    try {
      const res = await fetch(`/api/class/${encodeURIComponent(roomId)}/lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(hostTokenRef.current ? { 'x-class-host-token': hostTokenRef.current } : {}),
        },
        body: JSON.stringify({ locked: nextLocked }),
      });
      if (res.ok) {
        setBoardLocked(nextLocked);
        setNotice(nextLocked ? 'Whiteboard locked (host-only drawing).' : 'Whiteboard unlocked.');
      } else {
        const errJson = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice(errJson.error || 'Only the class host can lock the board.');
      }
    } catch {
      // ignore
    }
  };

  const handleUndoBoard = async () => {
    try {
      const res = await fetch(`/api/class/${encodeURIComponent(roomId)}/whiteboard/undo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(hostTokenRef.current ? { 'x-class-host-token': hostTokenRef.current } : {}),
        },
      });
      if (res.ok) {
        setStrokes((prev) => prev.slice(0, -1));
      } else {
        const errJson = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice(errJson.error || 'Host permission required to undo board.');
      }
    } catch {
      // ignore
    }
  };

  const handleClearBoard = async () => {
    try {
      const res = await fetch(`/api/class/${encodeURIComponent(roomId)}/whiteboard/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(hostTokenRef.current ? { 'x-class-host-token': hostTokenRef.current } : {}),
        },
      });
      if (res.ok) {
        setStrokes([]);
      } else {
        const errJson = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice(errJson.error || 'Host permission required to clear board.');
      }
    } catch {
      // ignore
    }
  };

  const handleExportBoardPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `PK_Chat_Whiteboard_${roomId}.png`;
    a.click();
    setNotice('Whiteboard snapshot exported.');
  };

  const handleCreateNewClass = async () => {
    try {
      const res = await fetch('/api/class/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: roomTitle,
          hostUid: userUid,
          hostName: userName,
          teacherLanguage: teacherLangCode,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { roomId: string; meetingUrl: string; hostAccessToken?: string };
        if (data.hostAccessToken) {
          hostTokenRef.current = data.hostAccessToken;
        }
        setRoomId(data.roomId);
        setNotice(`New meeting room ready: ${data.meetingUrl}`);
      }
    } catch {
      setNotice('Unable to create classroom right now.');
    }
  };

  const handleJoinMeetingLink = () => {
    const parsed = parseClassRoomFromInput(joinInput);
    if (!parsed) {
      setNotice('Enter a valid class link (e.g. https://pkchat.app/class/math-101) or room ID.');
      return;
    }
    setRoomId(parsed);
    setJoinInput('');
    setNotice(`Joined classroom: https://pkchat.app/class/${parsed}`);
  };

  const handleCopyMeetingLink = async () => {
    try {
      await navigator.clipboard.writeText(meetingUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      setNotice(`Meeting Link: ${meetingUrl}`);
    }
  };

  const handleSendCaption = async (overrideText?: string) => {
    const clean = (overrideText ?? captionInput).trim();
    if (!clean) return;
    const safety = evaluateClassSafetyContent(clean);
    if (!safety.safe) {
      if (!overrideText) setCaptionInput('');
      triggerImmediateSafetyBlackout(
        safety.reason || 'Inappropriate classroom caption detected and blocked.'
      );
      return;
    }
    setSendingCaption(true);
    if (!overrideText) setCaptionInput('');
    try {
      const res = await fetch(`/api/class/${encodeURIComponent(roomId)}/subtitle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speakerUid: userUid,
          speakerName: userName,
          speakerLanguageCode: teacherLangCode,
          listenerLanguageCode: studentLangCode,
          text: clean,
        }),
      });
      if (res.status === 403) {
        const errJson = (await res.json().catch(() => ({}))) as { error?: string; blackoutTriggered?: boolean };
        if (errJson.blackoutTriggered) {
          triggerImmediateSafetyBlackout(errJson.error || 'PK Safety Blackout triggered.');
        }
        return;
      }
      if (res.ok) {
        const json = (await res.json()) as { subtitle: ClassSubtitleEntry };
        setSubtitles((prev) =>
          prev.some((s) => s.id === json.subtitle.id) ? prev : [...prev.slice(-30), json.subtitle]
        );
        if (!json.subtitle.isPassThrough && typeof window !== 'undefined' && 'speechSynthesis' in window) {
          const targetEntry = findWorldLanguage(studentLangCode, catalog);
          const utter = new SpeechSynthesisUtterance(json.subtitle.translatedText);
          if (targetEntry?.speechLocale) utter.lang = targetEntry.speechLocale;
          window.speechSynthesis.speak(utter);
        }
      }
    } finally {
      setSendingCaption(false);
    }
  };

  const handleToggleSpeechCaption = () => {
    if (listeningSpeech && speechRecRef.current) {
      speechRecRef.current.stop();
      setListeningSpeech(false);
      return;
    }
    const SpeechRec =
      (
        window as unknown as {
          SpeechRecognition?: new () => unknown;
          webkitSpeechRecognition?: new () => unknown;
        }
      ).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setNotice('Live microphone speech captioning is unavailable in this browser; type below to broadcast.');
      return;
    }

    const rec = new SpeechRec() as {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onresult: (ev: {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; [idx: number]: { transcript: string } }>;
      }) => void;
      onend: () => void;
      onerror: () => void;
      start: () => void;
      stop: () => void;
    };
    const speakerEntry = findWorldLanguage(teacherLangCode, catalog);
    rec.lang = speakerEntry?.speechLocale || 'en-US';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        if (ev.results[i].isFinal) {
          const transcript = ev.results[i]?.[0]?.transcript?.trim();
          if (transcript) {
            void handleSendCaption(transcript);
          }
        }
      }
    };
    rec.onend = () => setListeningSpeech(false);
    rec.onerror = () => setListeningSpeech(false);
    speechRecRef.current = rec;
    setListeningSpeech(true);
    rec.start();
  };

  const handleToggleHandRaise = async () => {
    const next = !handRaised;
    setHandRaised(next);
    try {
      await fetch(`/api/class/${encodeURIComponent(roomId)}/hand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: userUid, handRaised: next }),
      });
    } catch {
      // ignore
    }
  };

  const studentLangObj = findWorldLanguage(studentLangCode, catalog) || supportedLanguages[0];
  const teacherLangObj = findWorldLanguage(teacherLangCode, catalog) || supportedLanguages[0];

  return (
    <div className="p-3 sm:p-5 lg:p-6 space-y-4">
      {/* Floating Top PK Live Class Language, Pass-Through, DND & Remember Strip (130+ Languages) */}
      <div className="sticky top-[106px] z-20 rounded-2xl bg-[#0a192f]/95 dark:bg-[#0b141a]/95 backdrop-blur-xl text-white border border-sky-400/35 shadow-lg px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setLangPickerTarget('student');
              setLangSearch('');
            }}
            className="px-3 py-1.5 rounded-xl bg-[#0077B6] hover:bg-[#0284c7] border border-sky-300/40 text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-sky-200" />
            <span>
              Translate ({studentLangObj?.nativeName || studentLangObj?.name}) ▼
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setLangPickerTarget('teacher');
              setLangSearch('');
            }}
            className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-medium text-sky-100"
          >
            Speaker: {teacherLangObj?.name} ▼
          </button>

          <span className="text-[11px] font-mono text-sky-300/90 hidden sm:inline">
            {supportedLanguages.length} Languages
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Same-Language Pass-Through Status Indicator */}
          <div
            className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border ${
              passThroughDecision.isPassThrough
                ? 'bg-sky-400/20 border-sky-300/50 text-sky-200'
                : 'bg-sky-500/15 border-sky-400/40 text-sky-200'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                passThroughDecision.isPassThrough ? 'bg-[#38bdf8]' : 'bg-sky-400'
              }`}
            />
            <span>
              {passThroughDecision.isPassThrough
                ? 'Direct Pass-Through (Same Language · 0ms)'
                : `Live Subtitles & Lip-Sync (${teacherLangObj?.code.toUpperCase()} -> ${studentLangObj?.code.toUpperCase()})`}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              const next = !liveClassDnd;
              setLiveClassDnd(next);
              setPkLiveClassDndEnabled(next);
            }}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 border transition-colors ${
              liveClassDnd
                ? 'bg-[#0284c7] border-sky-300 text-white'
                : 'bg-white/10 border-white/20 text-sky-100 hover:bg-white/20'
            }`}
            title="Toggle PK Live Class DND"
          >
            <BellOff className="w-3.5 h-3.5" />
            <span>Class DND: {liveClassDnd ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('pkchat-open-remember', {
                  detail: {
                    category: 'class',
                    title: `Rejoin ${roomTitle}`,
                    note: `Room link: ${meetingUrl}`,
                    targetId: roomId,
                    targetLabel: roomTitle,
                  },
                })
              );
            }}
            className="px-2.5 py-1 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white text-[11px] font-bold flex items-center gap-1"
          >
            <BellPlus className="w-3.5 h-3.5" />
            <span>Remember Class</span>
          </button>
        </div>
      </div>

      {/* Meeting Link & Room Controls Bar */}
      <div className="rounded-2xl bg-[#e3f3ff]/78 dark:bg-[#0f172a] backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-sm">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0284c7] to-[#38bdf8] text-white flex items-center justify-center shrink-0">
              <PkLiveClassIcon className="w-4 h-4" />
            </span>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate">
              {roomTitle}
            </h1>
            <span className="px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 text-[11px] font-semibold">
              {roomState?.mediaTier === '4k_uhd' ? '4K Adaptive · Lip-Sync' : 'HD Adaptive'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-slate-800 font-mono text-[#0284c7] dark:text-[#38bdf8]">
              <Link2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[260px] sm:max-w-none">{meetingUrl}</span>
            </span>
            <button
              type="button"
              onClick={handleCopyMeetingLink}
              className="px-2.5 py-1 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white font-semibold inline-flex items-center gap-1 transition-colors"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
            </button>
            <button
              type="button"
              onClick={handleCreateNewClass}
              className="px-2.5 py-1 rounded-lg border border-[#bae6fd] dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Class Link</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-[#bae6fd] dark:border-slate-700 overflow-hidden text-xs font-semibold">
            <button
              type="button"
              onClick={() => setRole('teacher')}
              className={`px-3 py-1.5 ${
                role === 'teacher'
                  ? 'bg-[#0284c7] text-white'
                  : 'bg-transparent text-slate-600 dark:text-slate-300'
              }`}
            >
              Teacher
            </button>
            <button
              type="button"
              onClick={() => setRole('student')}
              className={`px-3 py-1.5 ${
                role === 'student'
                  ? 'bg-[#0284c7] text-white'
                  : 'bg-transparent text-slate-600 dark:text-slate-300'
              }`}
            >
              Student
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              placeholder="Paste pkchat.app/class/... link"
              className="px-3 py-1.5 rounded-xl border border-[#7dd3fc]/75 dark:border-slate-700 bg-[#eef8ff]/85 dark:bg-slate-900 text-xs text-slate-900 dark:text-white w-48 sm:w-56"
            />
            <button
              type="button"
              onClick={handleJoinMeetingLink}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#0284c7] to-[#0ea5e9] hover:brightness-105 text-white text-xs font-bold"
            >
              Join
            </button>
            <button
              type="button"
              onClick={() => setLiveVideoRoomOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Live Video Room</span>
            </button>
          </div>
        </div>
      </div>

      {notice && (
        <div className="px-4 py-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-xs text-sky-900 dark:text-sky-200 flex items-center justify-between">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="font-bold ml-3">
            ✕
          </button>
        </div>
      )}

      {/* Dedicated Highlighted PK Live Class 4-Tab Bar */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-sky-50/90 dark:bg-[#0b1b2b]/90 border border-sky-200/80 dark:border-sky-800/60">
        {[
          { id: 'board' as const, label: 'PK Live Class & Board', icon: PenTool, badge: null },
          {
            id: 'messages' as const,
            label: 'Class Messages',
            icon: MessageSquare,
            badge: classMessages.length > 0 ? String(classMessages.length) : null,
          },
          {
            id: 'calls' as const,
            label: 'Class Calls',
            icon: Phone,
            badge: classCallState === 'active' || classCallState === 'connecting' ? 'LIVE' : null,
          },
          { id: 'settings' as const, label: 'Class Settings', icon: Settings, badge: liveClassDnd ? 'DND' : null },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = liveClassTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setLiveClassTab(tab.id)}
              className={`flex-1 min-w-[130px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-[#0284c7] to-[#00b4d8] text-white shadow-md'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800/70'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{tab.label}</span>
              {tab.badge && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-extrabold ${
                    isActive ? 'bg-white/25 text-white' : 'bg-sky-200 dark:bg-sky-900 text-sky-900 dark:text-sky-200'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 2: ISOLATED PK LIVE CLASS MESSAGES */}
      {liveClassTab === 'messages' && (
        <div className="rounded-2xl bg-[#e3f3ff]/78 dark:bg-[#0f172a] backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-[500px]">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-sky-50/70 dark:bg-slate-900/80 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Isolated PK Live Class Chat · Room {roomId}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Dedicated classroom feed — strictly separated from your personal PK Chat messages.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-sky-100 dark:bg-sky-950 text-[#0284c7] dark:text-[#38bdf8] text-[10px] font-bold">
              {classMessages.length} Messages
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-sky-50/40 dark:bg-[#060f1a]">
            {classMessages.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <p className="font-semibold text-slate-700 dark:text-slate-200">
                  No PK Live Class messages yet
                </p>
                <p>Questions, homework links, and teacher notes shared here stay cleanly inside this classroom.</p>
              </div>
            ) : (
              classMessages.map((m) => {
                const isMine = m.senderUid === userUid;
                return (
                  <div
                    key={m.id}
                    className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 text-xs ${
                      isMine
                        ? 'ml-auto bg-[#0284c7] text-white'
                        : 'mr-auto bg-[#e8f5ff]/88 dark:bg-slate-900 border border-[#7dd3fc]/70 dark:border-slate-800 text-slate-900 dark:text-white backdrop-blur-xl'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 text-[10px] opacity-80 mb-0.5">
                      <span className="font-bold">
                        {m.senderName} ({m.senderRole})
                      </span>
                      <span>
                        {new Date(m.createdAtMs).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={handleSendClassMessage}
            className="p-3 border-t border-sky-200/70 dark:border-slate-800 bg-[#d8eeff]/85 dark:bg-[#0f172a] backdrop-blur-xl flex items-center gap-2"
          >
            <input
              type="text"
              value={classMsgInput}
              onChange={(e) => setClassMsgInput(e.target.value)}
              placeholder={`Message ${roomTitle} students & teacher...`}
              className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl border border-[#7dd3fc]/75 dark:border-slate-700 bg-[#eef8ff]/90 dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={!classMsgInput.trim()}
              className="px-4 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-40 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: DEDICATED PK LIVE CLASS CALLS */}
      {liveClassTab === 'calls' && (
        <div className="rounded-2xl bg-[#e3f3ff]/78 dark:bg-[#0f172a] backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 p-4 sm:p-6 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Dedicated PK Live Class Calls
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Separate from regular PK Chat calls · Uses your unified PK Chat Ringtones ({getRingtoneLabel(getSelectedRingtonePreset('group_call'), 'group_call')})
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLiveClassTab('settings')}
              className="px-3 py-1.5 rounded-xl border border-[#bae6fd] dark:border-slate-700 text-xs font-semibold text-[#0284c7] dark:text-[#38bdf8] hover:bg-sky-50 dark:hover:bg-slate-800"
            >
              Class DND: {liveClassDnd ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-[#021b38] via-[#0a2342] to-[#0f172a] text-white p-6 text-center space-y-4 border border-sky-500/30">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <label className="text-xs text-sky-200 font-medium">Call Class / Contact:</label>
              <select
                value={classCallTargetUid}
                onChange={(e) => setClassCallTargetUid(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/20 text-xs text-white"
              >
                <option value="" className="text-slate-900">
                  Entire PK Live Class Room ({roomId})
                </option>
                {directoryProfiles
                  .filter((p) => p.uid !== userUid)
                  .slice(0, 30)
                  .map((p) => (
                    <option key={p.uid} value={p.uid} className="text-slate-900">
                      {p.fullName} ({p.onlineStatus === 'offline' ? 'Offline' : 'Online'})
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1">
              <p className="text-lg font-extrabold">{roomTitle}</p>
              <p className="text-xs font-semibold text-sky-300">
                {classCallState === 'idle'
                  ? 'Ready for Class Call Signaling & Local Device Test'
                  : classCallState === 'ended'
                    ? 'Class call ended'
                    : classCallState === 'connecting'
                      ? `${classCallStatusLabel}${classCallStatusLabel === 'Offline' ? ' (Recipient Data Off)' : ' · Waiting for remote peer to answer (TURN/SFU required for cross-network calls)'}`
                      : `${classCallStatusLabel} · ${String(Math.floor(classCallSeconds / 60)).padStart(2, '0')}:${String(classCallSeconds % 60).padStart(2, '0')} · ${classCallType.toUpperCase()}`}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {classCallState === 'idle' || classCallState === 'ended' ? (
                <>
                  <button
                    type="button"
                    onClick={() => startLiveClassCall('audio')}
                    className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-white/90 hover:bg-white text-[#0284c7] font-bold text-xs inline-flex items-center gap-2 border border-[#bae6fd]"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Ring Class Audio</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startLiveClassCall('video')}
                    className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#0284c7] to-[#38bdf8] hover:brightness-105 text-white font-bold text-xs inline-flex items-center gap-2"
                  >
                    <Video className="w-4 h-4" />
                    <span>Ring Class Video</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void startClassLoopbackTest('video')}
                    className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-sky-100 font-semibold text-xs inline-flex items-center gap-2 border border-sky-400/30"
                  >
                    <Mic className="w-4 h-4" />
                    <span>Test Local Mic &amp; Cam</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (isRecordingClass) stopClassStudyRecording(false);
                      else void startClassStudyRecording();
                    }}
                    className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5 ${
                      isRecordingClass
                        ? 'bg-rose-600 text-white animate-pulse'
                        : 'bg-white/15 hover:bg-white/25 text-white border border-sky-400/40'
                    }`}
                  >
                    {isRecordingClass ? <Square className="w-3.5 h-3.5" /> : <Disc className="w-4 h-4" />}
                    <span>
                      {isRecordingClass
                        ? `Stop Recording (${classRecordSeconds}s)`
                        : 'Record Class (Study Revision)'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setClassCallMuted((m) => !m)}
                    className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5 ${
                      classCallMuted ? 'bg-white text-slate-900' : 'bg-white/15 hover:bg-white/25 text-white'
                    }`}
                  >
                    {classCallMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    <span>{classCallMuted ? 'Unmute' : 'Mute'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !classCallSpeaker;
                      setClassCallSpeaker(next);
                      setRingbackSpeakerMode(next);
                    }}
                    className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5 ${
                      classCallSpeaker ? 'bg-sky-500 text-slate-950' : 'bg-white/15 hover:bg-white/25 text-white'
                    }`}
                  >
                    <Volume2 className="w-4 h-4" />
                    <span>Speaker: {classCallSpeaker ? 'ON' : 'Earpiece'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={endLiveClassCall}
                    className="min-h-[44px] px-5 py-2 rounded-2xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span>End Class Call</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DEDICATED PK LIVE CLASS SETTINGS */}
      {liveClassTab === 'settings' && (
        <div className="rounded-2xl bg-[#e3f3ff]/78 dark:bg-[#0f172a] backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 p-4 sm:p-6 space-y-4 shadow-sm">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              PK Live Class Settings
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Dedicated controls for your online classroom experience, separate from main chat settings.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {/* PK Live Class DND */}
            <div className="p-4 rounded-2xl border border-[#bae6fd] dark:border-slate-800 bg-sky-50/60 dark:bg-slate-900/70 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <BellOff className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span>PK Live Class Do Not Disturb (DND)</span>
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Silences regular PK Chat incoming call interruptions during class. 1-second Long-Press SOS Sirens always break through safely.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={liveClassDnd}
                onClick={() => {
                  const next = !liveClassDnd;
                  setLiveClassDnd(next);
                  setPkLiveClassDndEnabled(next);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-colors ${
                  liveClassDnd
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {liveClassDnd ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Classroom Data Efficiency Mode */}
            <div className="p-4 rounded-2xl border border-[#bae6fd] dark:border-slate-800 bg-sky-50/60 dark:bg-slate-900/70 space-y-2">
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                Classroom Video &amp; Data Package Saver
              </p>
              <select
                value={pkgMode}
                onChange={(e) => {
                  const next = e.target.value as DataPackageMode;
                  setPkgMode(next);
                  setDataPackageMode(next);
                }}
                className="w-full px-3 py-2 rounded-xl border border-[#7dd3fc]/75 dark:border-slate-700 bg-[#eef8ff]/85 dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
              >
                <option value="standard">4K / HD Adaptive Quality (Standard)</option>
                <option value="social_saver">Low-Data Class Package Mode</option>
                <option value="zero_data_continuity">Ultra-Light Whiteboard &amp; Text Priority</option>
              </select>
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/30 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                Unified Ringtone &amp; Notification Sound Settings
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                Active Class Group Ringtone: <span className="font-semibold">{getRingtoneLabel(getSelectedRingtonePreset('group_call'), 'group_call')}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveScreen('profile');
                window.setTimeout(() => {
                  document
                    .getElementById('audio-tone-settings-section')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 90);
              }}
              className="px-4 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold"
            >
              Change Ringtones / Upload Audio
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: Dual-Pane Education Canvas: Interactive Whiteboard + Live Video/Subtitles */}
      {liveClassTab === 'board' && (
        <>
      <div className="relative grid lg:grid-cols-3 gap-4">
        {/* Immediate AI Safety Blackout Shield Curtain (Replaces Stage with Solid #000000 Black Screen) */}
        {safetyBlackout?.active && (
          <div
            data-testid="class-safety-blackout"
            role="alertdialog"
            aria-modal="true"
            aria-label="PK Live Class Safety Blackout"
            className="absolute inset-0 z-40 rounded-2xl bg-black text-white flex flex-col items-center justify-center p-6 text-center space-y-4 border-2 border-sky-400/50 shadow-2xl"
          >
            <div className="w-14 h-14 rounded-full bg-rose-600/20 border border-rose-500 text-rose-400 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div className="max-w-md space-y-2">
              <p className="text-base font-extrabold text-white">
                🛡️ PK Safety Blackout Activated ({safetyBlackout.detectedAt})
              </p>
              <p className="text-xs text-slate-300 leading-relaxed">
                {safetyBlackout.reason}
              </p>
              <p className="text-[11px] text-sky-300 font-medium">
                Camera, microphone, screen share, and active recording were stopped automatically to protect all classroom participants.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setSafetyBlackout(null)}
                className="px-4 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold"
              >
                Clear &amp; Return Safely
              </button>
              <button
                type="button"
                onClick={() => void handleLeaveClass()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                Leave Class
              </button>
            </div>
          </div>
        )}
        {/* Whiteboard Stage */}
        {showWhiteboard && (
          <div className="lg:col-span-2 rounded-2xl bg-[#e3f3ff]/80 dark:bg-[#0f172a] backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 overflow-hidden shadow-sm flex flex-col">
            <div className="px-3.5 py-2.5 border-b border-sky-200/70 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-[#d8eeff]/85 dark:bg-slate-900/70">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTool('pen')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                    tool === 'pen'
                      ? 'bg-[#0077B6] text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>Pen</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTool('highlighter')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                    tool === 'highlighter'
                      ? 'bg-amber-500 text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <Highlighter className="w-3.5 h-3.5" />
                  <span>Highlight</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTool('eraser')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                    tool === 'eraser'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>Eraser</span>
                </button>

                <div className="h-5 w-px bg-slate-300 dark:bg-slate-700 mx-1" />

                {BOARD_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Ink color ${hex}`}
                    onClick={() => {
                      setPenColor(hex);
                      if (tool === 'eraser') setTool('pen');
                    }}
                    style={{ backgroundColor: hex }}
                    className={`w-5 h-5 rounded-full border-2 transition-transform ${
                      penColor === hex && tool !== 'eraser'
                        ? 'border-sky-400 scale-110'
                        : 'border-white dark:border-slate-700'
                    }`}
                  />
                ))}

                <select
                  aria-label="Pen thickness"
                  value={penWidth}
                  onChange={(e) => setPenWidth(Number(e.target.value))}
                  className="ml-1 px-2 py-1 rounded-lg border border-[#7dd3fc]/75 dark:border-slate-700 bg-[#eef8ff]/85 dark:bg-slate-800 text-xs text-slate-800 dark:text-white"
                >
                  <option value={2}>Thin</option>
                  <option value={4}>Medium</option>
                  <option value={8}>Bold</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                {role === 'teacher' && (
                  <button
                    type="button"
                    onClick={handleToggleLockBoard}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 ${
                      boardLocked
                        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    {boardLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    <span>{boardLocked ? 'Locked' : 'Lock'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleUndoBoard}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Undo</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearBoard}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportBoardPng}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#0284c7] hover:bg-[#0369a1] text-white flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save PNG</span>
                </button>
              </div>
            </div>

            <div className="relative bg-white touch-none">
              <canvas
                ref={canvasRef}
                width={960}
                height={520}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className="w-full h-[320px] sm:h-[420px] cursor-crosshair block"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none select-none absolute top-3 left-3 text-[10px] font-mono text-slate-400/70"
              >
                PKC · {userName} · {roomId}
              </span>
              <span className="absolute bottom-2 right-3 text-[11px] font-medium text-slate-400 pointer-events-none">
                Live Whiteboard · {strokes.length} strokes synced
              </span>
            </div>
          </div>
        )}

        {/* Speaker / Grid Video Stage & Live Translated Subtitles Column */}
        <div
          className={`${
            showWhiteboard && viewLayout === 'speaker' ? 'lg:col-span-1' : 'lg:col-span-3'
          } rounded-2xl bg-slate-950 text-white border border-slate-800 overflow-hidden flex flex-col justify-between shadow-sm`}
        >
          {/* Layout Mode Bar inside Video Stage */}
          <div className="px-3 py-2 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold text-sky-300 flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5" />
              <span>{viewLayout === 'grid' ? 'Grid View (All Participants)' : 'Speaker View'}</span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setViewLayout((v) => (v === 'speaker' ? 'grid' : 'speaker'))}
                className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 border transition-colors ${
                  viewLayout === 'grid'
                    ? 'bg-[#0284c7] border-sky-400 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-sky-200'
                }`}
              >
                <LayoutGrid className="w-3 h-3" />
                <span>{viewLayout === 'grid' ? 'Speaker View' : 'Grid View'}</span>
              </button>
              <button
                type="button"
                onClick={() => setBeautyFilterEnabled((b) => !b)}
                className={`px-2 py-1 rounded-lg font-bold flex items-center gap-1 border transition-colors ${
                  beautyFilterEnabled
                    ? 'bg-sky-500/25 border-sky-400/60 text-sky-200'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>Beauty {beautyFilterEnabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>

          {viewLayout === 'grid' ? (
            <div
              aria-label="PK Live Class Grid View"
              className="p-3 bg-gradient-to-br from-[#01123A] via-[#0a192f] to-slate-950 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            >
              {/* Local Presenter / Active User Tile */}
              <div className="relative h-44 rounded-xl bg-slate-900 border border-[#38bdf8]/50 overflow-hidden flex items-center justify-center">
                {isScreenSharing ? (
                  <video
                    ref={screenVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-contain bg-black"
                  />
                ) : !cameraOff ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    style={{ filter: beautyFilterEnabled ? silentBeautyFilter : 'none' }}
                    className="w-full h-full object-cover -scale-x-100"
                  />
                ) : (
                  <div className="text-center space-y-1.5">
                    <div className="w-14 h-14 mx-auto rounded-full bg-[#0077B6]/50 border border-sky-400/60 flex items-center justify-center text-lg font-bold">
                      {userName.slice(0, 2).toUpperCase()}
                    </div>
                    <p className="text-xs font-semibold text-sky-200">{userName} (You)</p>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] px-2 py-1 rounded-lg bg-black/65">
                  <span className="font-semibold truncate">
                    {userName} · {role === 'teacher' ? 'Host' : 'Student'}
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    {handRaised && <Hand className="w-3 h-3 text-amber-400" />}
                    {micMuted ? <MicOff className="w-3 h-3 text-rose-400" /> : <Mic className="w-3 h-3 text-sky-300" />}
                  </span>
                </div>
              </div>

              {/* Joined Classroom Participant Tiles */}
              {(roomState?.participants || [])
                .filter((p) => p.uid !== userUid)
                .map((p) => (
                  <div
                    key={`tile_${p.uid}`}
                    className="relative h-44 rounded-xl bg-slate-900/90 border border-slate-700 overflow-hidden flex flex-col items-center justify-center p-3 text-center"
                  >
                    <div className="w-12 h-12 rounded-full bg-sky-900/60 border border-sky-400/40 flex items-center justify-center text-sm font-bold text-sky-200">
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                    <p className="mt-2 text-xs font-semibold text-white truncate max-w-full">{p.name}</p>
                    <p className="text-[10px] text-sky-300 uppercase">
                      {p.role} · {p.preferredLanguage}
                    </p>
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] px-2 py-1 rounded-lg bg-black/60">
                      <span className="truncate">{p.role === 'teacher' ? 'Presenter' : 'Participant'}</span>
                      <span className="flex items-center gap-1">
                        {p.handRaised && <Hand className="w-3 h-3 text-amber-400" />}
                        {p.muted ? <MicOff className="w-3 h-3 text-rose-400" /> : <Mic className="w-3 h-3 text-sky-300" />}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            /* Presenter Camera or Screen Share Feed (Speaker View) */
            <div className="relative h-48 sm:h-56 bg-gradient-to-br from-[#01123A] via-[#0a192f] to-slate-950 flex items-center justify-center overflow-hidden">
              {isScreenSharing ? (
                <video
                  ref={screenVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-contain bg-black"
                />
              ) : !cameraOff ? (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  style={{ filter: beautyFilterEnabled ? silentBeautyFilter : 'none' }}
                  className="w-full h-full object-cover -scale-x-100"
                />
              ) : (
                <div className="text-center space-y-2 px-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-[#0077B6]/40 border border-sky-400/50 flex items-center justify-center text-xl font-bold">
                    {userName.slice(0, 2).toUpperCase()}
                  </div>
                  <p className="text-xs font-semibold text-sky-200">{userName}</p>
                  <p className="text-[11px] text-slate-400">
                    {passThroughDecision.isPassThrough
                      ? 'Same-Language Audio/Video Pass-Through Ready'
                      : 'Cross-Language Voice & Lip-Sync Stream Ready'}
                  </p>
                </div>
              )}
              <span
                aria-hidden="true"
                className="pointer-events-none select-none absolute bottom-2 left-3 text-[10px] font-mono text-white/45"
              >
                PKC Watermark · {userUid.slice(0, 12)}
              </span>

              <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur text-[11px] font-semibold text-[#38bdf8]">
                {isScreenSharing
                  ? 'Screen Share Active'
                  : passThroughDecision.isPassThrough
                    ? 'Pass-Through 0ms'
                    : 'Lip-Sync Active'}
              </div>
              <button
                type="button"
                onClick={() => setShowParticipants((v) => !v)}
                className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur text-[11px] font-semibold text-white flex items-center gap-1"
              >
                <Users className="w-3.5 h-3.5" />
                <span>{roomState?.participants.length || 1}</span>
              </button>
            </div>
          )}

          {showParticipants && (
            <div className="p-3 border-b border-slate-800 bg-slate-900/95 max-h-56 overflow-y-auto space-y-2">
              {role === 'teacher' && (
                <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 border-b border-slate-800">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300">
                    Host Controls
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={hostActionBusy}
                      onClick={() => void handleHostAction('mute_all')}
                      className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold"
                    >
                      Mute All
                    </button>
                    <button
                      type="button"
                      disabled={hostActionBusy}
                      onClick={() => void handleHostAction('lower_all_hands')}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-200 text-[10px] font-bold"
                    >
                      Lower Hands
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggleLockBoard()}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-bold"
                    >
                      {boardLocked ? 'Unlock Room' : 'Lock Room'}
                    </button>
                  </div>
                </div>
              )}

              {(roomState?.participants || []).map((p) => (
                <div key={p.uid} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium">
                    {p.name} ({p.role})
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] text-sky-300 flex items-center gap-1">
                      {p.handRaised && <Hand className="w-3 h-3 text-amber-400" />}
                      {p.muted && <MicOff className="w-3 h-3 text-rose-400" />}
                      {p.preferredLanguage.toUpperCase()}
                    </span>
                    {role === 'teacher' && p.uid !== userUid && (
                      <>
                        <button
                          type="button"
                          disabled={hostActionBusy}
                          onClick={() =>
                            void handleHostAction(
                              p.muted ? 'unmute_participant' : 'mute_participant',
                              p.uid
                            )
                          }
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-sky-200"
                        >
                          {p.muted ? 'Unmute' : 'Mute'}
                        </button>
                        {p.handRaised && (
                          <button
                            type="button"
                            disabled={hostActionBusy}
                            onClick={() => void handleHostAction('lower_hand', p.uid)}
                            className="px-1.5 py-0.5 rounded bg-amber-900/60 hover:bg-amber-800 text-[10px] text-amber-200"
                          >
                            Lower
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={hostActionBusy}
                          onClick={() => void handleHostAction('remove_participant', p.uid)}
                          className="px-1.5 py-0.5 rounded bg-rose-900/60 hover:bg-rose-800 text-[10px] text-rose-200"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Live Subtitles Stream */}
          <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
            <div className="space-y-2 max-h-56 overflow-y-auto">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                Live Class Subtitles
              </p>
              {subtitles.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
                  Speak or enter a lesson sentence below. Matching languages run in direct 0ms Pass-Through; different languages translate live.
                </div>
              ) : (
                subtitles.slice(-6).map((sub) => (
                  <div
                    key={sub.id}
                    className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-semibold text-sky-300">{sub.speakerName}</span>
                      <span>
                        {sub.isPassThrough
                          ? 'Direct Pass-Through · 0ms'
                          : `${sub.speakerLanguageCode.toUpperCase()} -> ${sub.listenerLanguageCode.toUpperCase()}`}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm font-medium text-white leading-snug">
                      {sub.translatedText}
                    </p>
                    {!sub.isPassThrough && sub.originalText !== sub.translatedText && (
                      <p className="text-[11px] text-slate-400">{sub.originalText}</p>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Subtitle Broadcast Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSendCaption();
              }}
              className="flex items-center gap-1.5"
            >
              <button
                type="button"
                onClick={handleToggleSpeechCaption}
                title="Live Microphone Subtitles"
                className={`p-2 rounded-xl border transition-colors ${
                  listeningSpeech
                    ? 'bg-rose-600 border-rose-500 text-white'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                <Volume2 className="w-4 h-4" />
              </button>
              <input
                type="text"
                value={captionInput}
                onChange={(e) => setCaptionInput(e.target.value)}
                placeholder="Type lesson sentence..."
                className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={sendingCaption || !captionInput.trim()}
                className="p-2 rounded-xl bg-[#0077B6] hover:bg-[#0284c7] disabled:opacity-40 text-white"
                aria-label="Broadcast caption"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Full PK Live Class Classroom Control Dock */}
      <div className="rounded-2xl bg-[#0b1b2b]/95 backdrop-blur-xl text-white px-4 py-3 flex flex-wrap items-center justify-center gap-3 sm:gap-5 border border-sky-500/25 shadow-md">
        <button
          type="button"
          onClick={() => void handleToggleClassMic()}
          className="flex flex-col items-center gap-1 text-[11px] font-medium"
        >
          <span
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              micMuted ? 'bg-white text-slate-900' : 'bg-white/15 hover:bg-white/25'
            }`}
          >
            {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </span>
          <span>{micMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        <button
          type="button"
          onClick={() => setCameraOff((c) => !c)}
          className="flex flex-col items-center gap-1 text-[11px] font-medium"
        >
          <span
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              cameraOff ? 'bg-white/15 hover:bg-white/25' : 'bg-[#0284c7] text-white'
            }`}
          >
            {cameraOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
          </span>
          <span>{cameraOff ? 'Start Video' : 'Stop Video'}</span>
        </button>

        <button
          type="button"
          onClick={() => void handleToggleScreenShare()}
          className="flex flex-col items-center gap-1 text-[11px] font-medium"
        >
          <span
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isScreenSharing ? 'bg-[#38bdf8] text-slate-950' : 'bg-white/15 hover:bg-white/25'
            }`}
          >
            <Monitor className="w-4 h-4" />
          </span>
          <span>{isScreenSharing ? 'Stop Share' : 'Screen Share'}</span>
        </button>

        <button
          type="button"
          onClick={() => setLiveClassTab('messages')}
          className="flex flex-col items-center gap-1 text-[11px] font-medium"
        >
          <span className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center">
            <MessageSquare className="w-4 h-4" />
          </span>
          <span>In-Class Chat</span>
        </button>

        <button
          type="button"
          onClick={handleToggleHandRaise}
          className="flex flex-col items-center gap-1 text-[11px] font-medium"
        >
          <span
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              handRaised ? 'bg-amber-500 text-slate-950' : 'bg-white/15 hover:bg-white/25'
            }`}
          >
            <Hand className="w-4 h-4" />
          </span>
          <span>{handRaised ? 'Lower Hand' : 'Raise Hand'}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowParticipants((v) => !v)}
          className="flex flex-col items-center gap-1 text-[11px] font-medium"
        >
          <span
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              showParticipants ? 'bg-[#0284c7] text-white' : 'bg-white/15 hover:bg-white/25'
            }`}
          >
            <Users className="w-4 h-4" />
          </span>
          <span>Participants ({roomState?.participants.length || 1})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (isRecordingClass) stopClassStudyRecording(false);
            else void startClassStudyRecording();
          }}
          title="Direct Student Class Recording for Study & Next-Day Revision (No Alerts Sent)"
          className="flex flex-col items-center gap-1 text-[11px] font-medium"
        >
          <span
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isRecordingClass
                ? 'bg-rose-600 text-white animate-pulse'
                : 'bg-[#0284c7] hover:bg-[#0369a1] text-white'
            }`}
          >
            {isRecordingClass ? <Square className="w-4 h-4" /> : <Disc className="w-4 h-4" />}
          </span>
          <span>
            {isRecordingClass ? `Stop (${classRecordSeconds}s)` : 'Record Class'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setBeautyFilterEnabled((b) => !b)}
          className="flex flex-col items-center gap-1 text-[11px] font-medium"
        >
          <span
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              beautyFilterEnabled ? 'bg-[#38bdf8] text-slate-950' : 'bg-white/15 hover:bg-white/25'
            }`}
          >
            <Sparkles className="w-4 h-4" />
          </span>
          <span>{beautyFilterEnabled ? 'Beauty On' : 'Beauty Off'}</span>
        </button>

        <button
          type="button"
          onClick={() => setViewLayout((v) => (v === 'speaker' ? 'grid' : 'speaker'))}
          className="flex flex-col items-center gap-1 text-[11px] font-medium"
        >
          <span
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              viewLayout === 'grid' ? 'bg-[#0284c7] text-white' : 'bg-white/15 hover:bg-white/25'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </span>
          <span>{viewLayout === 'grid' ? 'Speaker View' : 'Grid View'}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowWhiteboard((v) => !v)}
          className="flex flex-col items-center gap-1 text-[11px] font-medium"
        >
          <span
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              showWhiteboard ? 'bg-[#0284c7] text-white' : 'bg-white/15 hover:bg-white/25'
            }`}
          >
            <PenTool className="w-4 h-4" />
          </span>
          <span>Whiteboard</span>
        </button>

        <button
          type="button"
          onClick={() => void handleLeaveClass()}
          className="flex flex-col items-center gap-1 text-[11px] font-medium"
        >
          <span className="w-10 h-10 rounded-full bg-[#ea0038] hover:bg-red-700 text-white flex items-center justify-center">
            <PhoneOff className="w-4 h-4" />
          </span>
          <span>Leave</span>
        </button>

        {role === 'teacher' && (
          <button
            type="button"
            disabled={hostActionBusy}
            onClick={() => void handleHostAction('end_class')}
            className="flex flex-col items-center gap-1 text-[11px] font-medium"
          >
            <span className="w-10 h-10 rounded-full bg-rose-700 hover:bg-rose-600 text-white flex items-center justify-center">
              <Square className="w-4 h-4" />
            </span>
            <span>End Class</span>
          </button>
        )}
      </div>

      {/* Saved Study & Next-Day Revision Recordings Shelf (Always Private, Local Study Archive) */}
      {savedClassRecordings.length > 0 && (
        <div className="rounded-2xl bg-[#e3f3ff]/78 dark:bg-[#0f172a] backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-extrabold text-[#0284c7] dark:text-[#38bdf8]">
                🎓 Saved Study &amp; Next-Day Revision Recordings ({savedClassRecordings.length})
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Recorded directly with crystal-clear audio &amp; video for personal study revision.
              </p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedClassRecordings.map((rec) => (
              <div
                key={rec.id}
                className="p-3 rounded-xl bg-sky-50/70 dark:bg-slate-900 border border-[#bae6fd] dark:border-slate-800 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-slate-900 dark:text-white truncate">{rec.title}</p>
                  <span className="text-[10px] font-mono text-[#0284c7] dark:text-[#38bdf8] shrink-0">
                    {rec.durationSec}s · {rec.sizeKb}KB
                  </span>
                </div>
                <video
                  src={rec.blobUrl}
                  controls
                  playsInline
                  className="w-full h-28 rounded-lg bg-black object-contain"
                />
                <div className="flex items-center justify-between gap-2">
                  <a
                    href={rec.blobUrl}
                    download={`PK_Live_Class_Revision_${rec.roomId}.webm`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white text-[11px] font-semibold"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download Study Clip</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(rec.blobUrl);
                      setSavedClassRecordings((prev) => prev.filter((item) => item.id !== rec.id));
                    }}
                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    aria-label="Delete recording"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
        </>
      )}

      {/* Searchable 130+ World Languages Modal */}
      {langPickerTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full max-h-[82vh] flex flex-col rounded-2xl bg-[#e3f3ff]/90 dark:bg-[#111b21] backdrop-blur-2xl border border-[#7dd3fc]/80 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-sky-200/70 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {langPickerTarget === 'teacher'
                    ? 'Select Speaker / Teacher Language'
                    : 'Select My Translation Language'}{' '}
                  ({supportedLanguages.length} Languages)
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Matching speaker & listener languages automatically enable 0ms Direct Pass-Through.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLangPickerTarget(null)}
                className="px-2.5 py-1 rounded-lg text-sm font-bold text-slate-600 hover:bg-sky-100/70 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="p-3 border-b border-sky-200/70 dark:border-slate-800">
              <input
                type="text"
                autoFocus
                value={langSearch}
                onChange={(e) => setLangSearch(e.target.value)}
                placeholder="Search 130+ languages (Tamil, Sinhala, English, Arabic, Japanese...)"
                className="w-full px-3 py-2 rounded-xl border border-[#7dd3fc]/75 dark:border-slate-700 bg-[#eef8ff]/90 dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredLanguages.map((lang) => {
                const selected =
                  langPickerTarget === 'teacher'
                    ? teacherLangCode.toLowerCase() === lang.code.toLowerCase()
                    : studentLangCode.toLowerCase() === lang.code.toLowerCase();
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => {
                      if (langPickerTarget === 'teacher') {
                        setTeacherLangCode(lang.code);
                      } else {
                        setStudentLangCode(lang.code);
                      }
                      setLangPickerTarget(null);
                    }}
                    className={`w-full px-3 py-2 rounded-xl text-left flex items-center justify-between text-xs transition-colors ${
                      selected
                        ? 'bg-sky-50 dark:bg-sky-950/60 border border-sky-400 text-sky-900 dark:text-sky-200 font-semibold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <span>
                      {lang.name} <span className="text-slate-400">· {lang.nativeName}</span>
                    </span>
                    <span className="font-mono text-[11px] uppercase text-slate-400">{lang.code}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {liveVideoRoomOpen && (
        <PkLiveClassRoom
          roomId={roomId}
          roomTitle={roomTitle}
          isHost={role === 'teacher'}
          onLeave={() => setLiveVideoRoomOpen(false)}
        />
      )}
    </div>
  );
}
