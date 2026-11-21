import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock,
  Download,
  Eye,
  Film,
  Image as ImageIcon,
  Lock,
  Pause,
  Play,
  Plus,
  Send,
  Settings,
  Shield,
  Smile,
  Square,
  Star,
  Trash2,
  Type,
  Users,
  Video,
  X,
} from 'lucide-react';
import { usePkChat } from '../context/PkChatContext';
import { StatusPrivacyMode, StatusUpdate } from '../types/pkchat';
import {
  STATUS_QUICK_REACTIONS,
  STATUS_TEXT_BACKGROUNDS,
  formatStatusRelativeTime,
  getStatusRemainingLabel,
  groupStatusesByAuthor,
} from '../lib/statusMedia';
import { formatFileSize, triggerMediaDownload } from '../lib/chatMediaUtils';
import {
  analyzeImageDataUrlForExplicitContent,
  detectExplicitSexualContent,
  inspectFileWithDeepGuard,
} from '../lib/securityShield';
import { hasFreeVipStatusAndAdAccess } from '../lib/subscriptionBilling';
import { useAppI18n } from '../lib/i18n';
import { UserAvatar } from './UserAvatar';
import { SponsoredMarketplaceSection } from './SponsoredMarketplaceSection';

function StatusRingAvatar({
  src,
  name,
  totalSegments,
  unseenSegments,
  isMine = false,
}: {
  src?: string;
  name?: string;
  totalSegments: number;
  unseenSegments: number;
  isMine?: boolean;
}) {
  const count = Math.max(0, totalSegments);
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const gap = count > 1 ? 5 : 0;
  const segLen = count > 0 ? Math.max(6, (circumference - gap * count) / count) : circumference;

  return (
    <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
      {count > 0 && (
        <svg className="absolute inset-0 w-14 h-14 -rotate-90" viewBox="0 0 60 60" aria-hidden="true">
          {Array.from({ length: count }).map((_, idx) => {
            const isUnseen = isMine ? true : idx >= count - unseenSegments;
            const offset = -(idx * (segLen + gap));
            return (
              <circle
                key={idx}
                cx="30"
                cy="30"
                r={radius}
                fill="none"
                stroke={isUnseen ? '#0284C7' : '#94A3B8'}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${segLen} ${circumference}`}
                strokeDashoffset={offset}
              />
            );
          })}
        </svg>
      )}
      <UserAvatar src={src} name={name} size="md" />
    </div>
  );
}

const PRIVACY_LABELS: Record<StatusPrivacyMode, string> = {
  contacts: 'My Contacts',
  contacts_except: 'My Contacts Except...',
  only_share_with: 'Favorites (VIP) / Selected',
};

export function StatusUpdatesView() {
  const {
    userProfile,
    userAccount,
    firebaseUser,
    setActiveScreen,
    profileMedia,
    contacts,
    directoryProfiles,
    statuses,
    statusPrivacyDefault,
    statusExcludedDefault,
    statusAllowedDefault,
    saveStatusPrivacyPreferences,
    createStatusUpdate,
    markStatusViewed,
    reactToStatus,
    replyToStatus,
    deleteStatusUpdate,
    updateStatusPrivacy,
  } = usePkChat();

  const { t } = useAppI18n();
  const uid = userProfile?.uid || '';

  const { myStatuses, recentGroups, viewedGroups } = useMemo(
    () => groupStatusesByAuthor(statuses, uid),
    [statuses, uid]
  );

  // Composer Modal state
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<'image' | 'video' | 'text'>('image');
  const [selectedFile, setSelectedFile] = useState<File | Blob | null>(null);
  const [selectedMime, setSelectedMime] = useState<string>('');
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string>('');
  const [caption, setCaption] = useState('');
  const [textContent, setTextContent] = useState('');
  const [bgIndex, setBgIndex] = useState(0);
  const [fontStyle, setFontStyle] = useState<'sans' | 'serif' | 'mono'>('sans');
  const [postingBusy, setPostingBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Camera capture (Photo Snapshot & Video Recording)
  const [cameraMode, setCameraMode] = useState<'idle' | 'photo' | 'video'>('idle');
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const galleryPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const galleryVideoInputRef = useRef<HTMLInputElement | null>(null);

  // Privacy Settings Modal state
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [privacyTargetStatusId, setPrivacyTargetStatusId] = useState<string | null>(null);
  const [draftPrivacyMode, setDraftPrivacyMode] = useState<StatusPrivacyMode>(statusPrivacyDefault);
  const [draftExcludedIds, setDraftExcludedIds] = useState<string[]>(statusExcludedDefault);
  const [draftAllowedIds, setDraftAllowedIds] = useState<string[]>(statusAllowedDefault);
  const [favoriteContactUids, setFavoriteContactUids] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('pk_favorite_status_uids');
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });

  // Story Viewer state
  const [viewerAuthorUid, setViewerAuthorUid] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerPaused, setViewerPaused] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [viewersDrawerOpen, setViewersDrawerOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [reactionToast, setReactionToast] = useState<string | null>(null);
  const storyVideoRef = useRef<HTMLVideoElement | null>(null);

  const contactOptions = useMemo(() => {
    const map = new Map<string, { uid: string; name: string; country: string; lang: string }>();
    contacts
      .filter((c) => !c.blocked && c.contactUid !== uid)
      .forEach((c) => {
        map.set(c.contactUid, {
          uid: c.contactUid,
          name: c.displayName,
          country: c.country,
          lang: c.preferredLanguageName || c.preferredLanguage,
        });
      });
    directoryProfiles
      .filter((p) => p.uid !== uid)
      .forEach((p) => {
        if (!map.has(p.uid)) {
          map.set(p.uid, {
            uid: p.uid,
            name: p.fullName,
            country: p.country,
            lang: p.preferredLanguageName || p.preferredLanguage,
          });
        }
      });
    return Array.from(map.values());
  }, [contacts, directoryProfiles, uid]);

  const stopCameraResources = useCallback(() => {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setRecordingVideo(false);
    setRecordingSeconds(0);
    setCameraMode('idle');
  }, []);

  useEffect(() => {
    return () => {
      stopCameraResources();
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    };
  }, [previewObjectUrl, stopCameraResources]);

  useEffect(() => {
    const onOpenPrivacy = () => {
      setPrivacyTargetStatusId(null);
      setDraftPrivacyMode(statusPrivacyDefault);
      setDraftExcludedIds(statusExcludedDefault);
      setDraftAllowedIds(statusAllowedDefault);
      setPrivacyModalOpen(true);
    };
    const onQuickCamera = () => {
      setComposerMode('image');
      setComposerOpen(true);
    };
    window.addEventListener('pkchat-open-status-privacy', onOpenPrivacy);
    window.addEventListener('pkchat-quick-camera', onQuickCamera);
    return () => {
      window.removeEventListener('pkchat-open-status-privacy', onOpenPrivacy);
      window.removeEventListener('pkchat-quick-camera', onQuickCamera);
    };
  }, [statusAllowedDefault, statusExcludedDefault, statusPrivacyDefault]);

  const resetComposer = () => {
    stopCameraResources();
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    setSelectedFile(null);
    setSelectedMime('');
    setPreviewObjectUrl('');
    setCaption('');
    setTextContent('');
    setUploadProgress(0);
    setStatusError(null);
  };

  const openComposer = (mode: 'image' | 'video' | 'text') => {
    resetComposer();
    setComposerMode(mode);
    setComposerOpen(true);
  };

  const handleSelectGalleryFile = async (e: React.ChangeEvent<HTMLInputElement>, expected: 'image' | 'video') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStatusError(null);
    if (file.size === 0) {
      setStatusError('Selected file appears to be empty.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setStatusError(
        `File is ${formatFileSize(file.size)}. Maximum supported Status size is 25 MB. Please trim or compress it.`
      );
      return;
    }
    const avScan = await inspectFileWithDeepGuard(file, {
      fileName: file.name,
      mimeType: file.type,
      mediaCategory: expected,
    });
    if (!avScan.safe) {
      setStatusError(avScan.blockedReason || 'Blocked by Cyber Shield Anti-Malware scan.');
      return;
    }
    if (expected === 'image') {
      const previewUrlData = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
      if (previewUrlData) {
        const imgSafety = await analyzeImageDataUrlForExplicitContent(previewUrlData, file.name);
        if (!imgSafety.safe) {
          setStatusError(
            imgSafety.blockedReason ||
              'Blocked by PK CHAT Explicit Content Shield: suggestive/explicit imagery is prohibited.'
          );
          return;
        }
      }
    }
    stopCameraResources();
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    setComposerMode(expected);
    setSelectedFile(file);
    setSelectedMime(file.type || (expected === 'video' ? 'video/mp4' : 'image/jpeg'));
    setPreviewObjectUrl(URL.createObjectURL(file));
  };

  const startLiveCamera = async (target: 'photo' | 'video') => {
    setStatusError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatusError('Camera access is not supported in this browser. Select from Gallery instead.');
      return;
    }
    try {
      stopCameraResources();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: target === 'video',
      });
      mediaStreamRef.current = stream;
      setCameraMode(target);
      window.setTimeout(() => {
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream;
          liveVideoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch (err) {
      setStatusError(
        err instanceof Error
          ? `Camera permission denied (${err.message}). Choose a file from Gallery instead.`
          : 'Camera permission denied. Choose a file from Gallery instead.'
      );
      stopCameraResources();
    }
  };

  const handleSnapCameraPhoto = async () => {
    const video = liveVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setStatusError('Camera initializing — wait a second and tap Capture again.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const camImgSafety = await analyzeImageDataUrlForExplicitContent(dataUrl, 'camera_status.jpg');
    if (!camImgSafety.safe) {
      stopCameraResources();
      setStatusError(
        camImgSafety.blockedReason ||
          'Captured snapshot blocked by PK CHAT Visual Explicit Content Shield.'
      );
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stopCameraResources();
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        setSelectedFile(blob);
        setSelectedMime('image/jpeg');
        setPreviewObjectUrl(URL.createObjectURL(blob));
      },
      'image/jpeg',
      0.92
    );
  };

  const handleToggleVideoRecord = () => {
    if (recordingVideo && recorderRef.current) {
      recorderRef.current.stop();
      setRecordingVideo(false);
      if (recordTimerRef.current !== null) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      return;
    }
    const stream = mediaStreamRef.current;
    if (!stream) return;
    setStatusError(null);
    recordChunksRef.current = [];

    const preferredMime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4';

    try {
      const recorder = new MediaRecorder(stream, { mimeType: preferredMime });
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        const mime = recorder.mimeType || preferredMime;
        const recordedBlob = new Blob(recordChunksRef.current, { type: mime });
        stopCameraResources();
        if (recordedBlob.size > 0) {
          if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
          setSelectedFile(recordedBlob);
          setSelectedMime(mime);
          setPreviewObjectUrl(URL.createObjectURL(recordedBlob));
        }
      };
      recorderRef.current = recorder;
      recorder.start(250);
      setRecordingVideo(true);
      setRecordingSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev + 1 >= 60) {
            if (recorderRef.current && recorderRef.current.state === 'recording') {
              recorderRef.current.stop();
            }
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      setStatusError('Video recording failed in this browser. Upload a video clip from Gallery.');
    }
  };

  const handlePublishStatus = async () => {
    setStatusError(null);
    const textCheck = detectExplicitSexualContent(
      composerMode === 'text' ? textContent : caption
    );
    if (!textCheck.safe) {
      setStatusError(
        textCheck.blockedReason ||
          'Blocked by PK CHAT Explicit Content Shield: sexual or adult content is strictly prohibited.'
      );
      return;
    }
    setPostingBusy(true);
    setUploadProgress(5);
    try {
      await createStatusUpdate({
        mediaType: composerMode,
        fileOrBlob: composerMode === 'text' ? undefined : selectedFile || undefined,
        mimeTypeOverride: selectedMime,
        textContent: composerMode === 'text' ? textContent : undefined,
        backgroundColor: STATUS_TEXT_BACKGROUNDS[bgIndex].css,
        fontStyle,
        caption: composerMode !== 'text' ? caption : undefined,
        privacyMode: statusPrivacyDefault,
        excludedViewerIds: statusExcludedDefault,
        allowedViewerIds: statusAllowedDefault,
        onProgress: setUploadProgress,
      });
      setStatusBanner('Your Status update is live for 24 hours!');
      setComposerOpen(false);
      resetComposer();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Unable to post Status update.');
    } finally {
      setPostingBusy(false);
    }
  };

  // Story Viewer active stack
  const viewerStack: StatusUpdate[] = useMemo(() => {
    if (!viewerAuthorUid) return [];
    if (viewerAuthorUid === uid) return myStatuses;
    const grp =
      recentGroups.find((g) => g.userId === viewerAuthorUid) ||
      viewedGroups.find((g) => g.userId === viewerAuthorUid);
    return grp?.statuses || [];
  }, [myStatuses, recentGroups, uid, viewedGroups, viewerAuthorUid]);

  const activeStory = viewerStack[viewerIndex] || null;

  const openStoryGroup = (authorUid: string, startUnseen = true) => {
    const stack =
      authorUid === uid
        ? myStatuses
        : (
            recentGroups.find((g) => g.userId === authorUid) ||
            viewedGroups.find((g) => g.userId === authorUid)
          )?.statuses || [];
    if (stack.length === 0) return;
    let initialIdx = 0;
    if (startUnseen && authorUid !== uid) {
      const firstUnseenIdx = stack.findIndex((s) => !s.viewedByUids?.includes(uid));
      if (firstUnseenIdx >= 0) initialIdx = firstUnseenIdx;
    }
    setViewerAuthorUid(authorUid);
    setViewerIndex(initialIdx);
    setViewerPaused(false);
    setProgressPct(0);
    setViewersDrawerOpen(false);
    setReplyText('');
    setReactionToast(null);
  };

  const closeViewer = useCallback(() => {
    setViewerAuthorUid(null);
    setViewerIndex(0);
    setViewersDrawerOpen(false);
    setViewerPaused(false);
  }, []);

  const handleNextStory = useCallback(() => {
    if (viewerIndex + 1 < viewerStack.length) {
      setViewerIndex((i) => i + 1);
      setProgressPct(0);
    } else {
      closeViewer();
    }
  }, [closeViewer, viewerIndex, viewerStack.length]);

  const handlePrevStory = useCallback(() => {
    if (viewerIndex > 0) {
      setViewerIndex((i) => i - 1);
      setProgressPct(0);
    } else {
      setProgressPct(0);
    }
  }, [viewerIndex]);

  // Mark status as viewed when opened
  useEffect(() => {
    if (activeStory && activeStory.userId !== uid) {
      markStatusViewed(activeStory.statusId);
    }
  }, [activeStory, markStatusViewed, uid]);

  // Progress bar auto-advance for photo/text stories
  useEffect(() => {
    if (!activeStory || viewerPaused || viewersDrawerOpen) return;
    if (activeStory.mediaType === 'video') {
      const vid = storyVideoRef.current;
      if (vid && vid.paused) vid.play().catch(() => {});
      return;
    }
    const DURATION_MS = 6000;
    const STEP_MS = 60;
    let elapsed = (progressPct / 100) * DURATION_MS;
    const timer = window.setInterval(() => {
      elapsed += STEP_MS;
      const nextPct = Math.min(100, (elapsed / DURATION_MS) * 100);
      setProgressPct(nextPct);
      if (elapsed >= DURATION_MS) {
        window.clearInterval(timer);
        handleNextStory();
      }
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [activeStory, handleNextStory, viewerPaused, viewersDrawerOpen, progressPct]);

  const handleReact = async (emoji: string) => {
    if (!activeStory) return;
    try {
      await reactToStatus(activeStory.statusId, emoji);
      setReactionToast(`Reacted ${emoji}`);
      window.setTimeout(() => setReactionToast(null), 2000);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Unable to send reaction.');
    }
  };

  const handleSendStatusReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStory || !replyText.trim()) return;
    setReplyBusy(true);
    try {
      await replyToStatus(activeStory, replyText.trim());
      setReplyText('');
      closeViewer();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Unable to send reply.');
    } finally {
      setReplyBusy(false);
    }
  };

  const handleDeleteCurrentStory = async () => {
    if (!activeStory || activeStory.userId !== uid) return;
    await deleteStatusUpdate(activeStory);
    if (viewerStack.length <= 1) {
      closeViewer();
    } else if (viewerIndex >= viewerStack.length - 1) {
      setViewerIndex(Math.max(0, viewerIndex - 1));
    }
    setStatusBanner('Status deleted.');
  };

  const handleSaveStatusToGallery = async (story: StatusUpdate) => {
    if (!story.mediaUrl || story.mediaType === 'text') return;
    const ext = story.mediaType === 'video' ? 'mp4' : 'jpg';
    const fileName = `pkchat_status_${story.statusId}.${ext}`;
    try {
      const resp = await fetch(story.mediaUrl);
      if (resp.ok) {
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        triggerMediaDownload(blobUrl, fileName);
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
      } else {
        triggerMediaDownload(story.mediaUrl, fileName);
      }
    } catch {
      triggerMediaDownload(story.mediaUrl, fileName);
    }
    setStatusBanner('Saved Status media to your device gallery!');
    setReactionToast('Saved to Gallery');
    window.setTimeout(() => setReactionToast(null), 2200);
  };

  const openPrivacyModal = (status?: StatusUpdate) => {
    if (status) {
      setPrivacyTargetStatusId(status.statusId);
      setDraftPrivacyMode(status.privacyMode);
      setDraftExcludedIds(status.excludedViewerIds || []);
      setDraftAllowedIds(status.allowedViewerIds || []);
    } else {
      setPrivacyTargetStatusId(null);
      setDraftPrivacyMode(statusPrivacyDefault);
      setDraftExcludedIds(statusExcludedDefault);
      setDraftAllowedIds(statusAllowedDefault);
    }
    setPrivacyModalOpen(true);
  };

  const handleSavePrivacyModal = async () => {
    if (privacyTargetStatusId) {
      await updateStatusPrivacy({
        statusId: privacyTargetStatusId,
        privacyMode: draftPrivacyMode,
        excludedViewerIds: draftExcludedIds,
        allowedViewerIds: draftAllowedIds,
      });
      setStatusBanner('Updated privacy settings for this Status.');
    } else {
      saveStatusPrivacyPreferences({
        privacyMode: draftPrivacyMode,
        excludedViewerIds: draftExcludedIds,
        allowedViewerIds: draftAllowedIds,
      });
      setStatusBanner(`Default Status privacy saved: ${PRIVACY_LABELS[draftPrivacyMode]}`);
    }
    setPrivacyModalOpen(false);
  };

  const toggleContactSelection = (targetUid: string, listType: 'excluded' | 'allowed') => {
    if (listType === 'excluded') {
      setDraftExcludedIds((prev) =>
        prev.includes(targetUid) ? prev.filter((id) => id !== targetUid) : [...prev, targetUid]
      );
    } else {
      setDraftAllowedIds((prev) =>
        prev.includes(targetUid) ? prev.filter((id) => id !== targetUid) : [...prev, targetUid]
      );
    }
  };

  const toggleFavoriteContact = (targetUid: string) => {
    setFavoriteContactUids((prev) => {
      const exists = prev.includes(targetUid);
      const next = exists ? prev.filter((id) => id !== targetUid) : [...prev, targetUid];
      try {
        localStorage.setItem('pk_favorite_status_uids', JSON.stringify(next));
      } catch {
        // Ignore storage restrictions
      }
      if (!exists && draftPrivacyMode === 'only_share_with') {
        setDraftAllowedIds((allowed) => (allowed.includes(targetUid) ? allowed : [...allowed, targetUid]));
      }
      return next;
    });
  };

  const applyFavoritesOnlyPreset = () => {
    setDraftPrivacyMode('only_share_with');
    const validFavs = favoriteContactUids.filter((id) => contactOptions.some((c) => c.uid === id));
    if (validFavs.length > 0) {
      setDraftAllowedIds(validFavs);
    }
  };

  const applyOnlyMePreset = () => {
    setDraftPrivacyMode('only_share_with');
    setDraftAllowedIds([]);
  };

  const formatPrivacyBadgeLabel = (mode: StatusPrivacyMode, allowedIds: string[]) => {
    if (mode === 'only_share_with' && allowedIds.length === 0) {
      return 'Private (Only Me)';
    }
    return PRIVACY_LABELS[mode];
  };

  const getStoryBgGradient = (cssColor?: string) => {
    const found = STATUS_TEXT_BACKGROUNDS.find((b) => b.css === cssColor);
    return found ? `bg-gradient-to-br ${found.gradient}` : 'bg-gradient-to-br from-[#0284c7] to-[#0369a1]';
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white p-6 shadow-md border border-white/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-sky-100 mb-1">
            <CircleDot className="w-4 h-4" />
            <span>{t('status.title', 'PK CHAT Updates & Status (24-Hour Stories)')}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold">Share Photos, Videos &amp; Moments</h1>
          <p className="text-xs text-sky-100 mt-1">
            {t(
              'status.subtitle',
              'Privacy-protected real-time Status updates uploaded securely to Firebase Storage for 24 hours.'
            )}{' '}
            <span className="font-semibold text-white">
              Storage Protected: Media stays on Cloud until you tap Save to Gallery.
            </span>
          </p>
          {hasFreeVipStatusAndAdAccess(userAccount?.phoneNumber || firebaseUser?.phoneNumber) && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/20 text-white text-[11px] font-bold">
              <Shield className="w-3.5 h-3.5" />
              <span>VIP Founder Free Access Active · $0.00 Free Video Status &amp; Business Ads</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openPrivacyModal()}
            className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Privacy: {formatPrivacyBadgeLabel(statusPrivacyDefault, statusAllowedDefault)}</span>
          </button>
          <button
            type="button"
            onClick={() => openComposer('image')}
            className="px-4 py-2 rounded-xl bg-[#e0f2fe]/90 text-[#01123A] hover:bg-[#bae6fd] border border-sky-200/80 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Status</span>
          </button>
        </div>
      </div>

      {statusBanner && (
        <div className="px-4 py-3 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-[#bae6fd] dark:border-sky-900 flex items-center justify-between text-xs text-[#0369a1] dark:text-sky-200 font-medium">
          <span>{statusBanner}</span>
          <button type="button" onClick={() => setStatusBanner(null)} aria-label="Dismiss notification">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {statusError && (
        <div className="px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-center justify-between text-xs text-rose-800 dark:text-rose-200 font-medium">
          <span>{statusError}</span>
          <button type="button" onClick={() => setStatusError(null)} aria-label="Dismiss error">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* My Status Card + Quick Creation Bar */}
      <section className="rounded-3xl bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => (myStatuses.length > 0 ? openStoryGroup(uid, false) : openComposer('image'))}
            className="flex items-center gap-3.5 text-left group"
          >
            <div className="relative">
              <StatusRingAvatar
                src={profileMedia?.avatarDataUrl || userProfile?.avatarUrl}
                name={userProfile?.fullName}
                totalSegments={myStatuses.length}
                unseenSegments={myStatuses.length}
                isMine
              />
              {myStatuses.length === 0 && (
                <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#0284c7] text-white border-2 border-white dark:border-slate-900 flex items-center justify-center">
                  <Plus className="w-3 h-3" />
                </span>
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-[#0284c7] dark:group-hover:text-[#38bdf8]">
                {t('status.myStatus', 'My Status')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {myStatuses.length > 0
                  ? `${myStatuses.length} active update${myStatuses.length > 1 ? 's' : ''} · Last updated ${formatStatusRelativeTime(myStatuses[myStatuses.length - 1].createdAt)}`
                  : 'Tap to add photo, video, or text status (expires in 24h)'}
              </p>
            </div>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                openComposer('image');
                window.setTimeout(() => {
                  void startLiveCamera('photo');
                }, 40);
              }}
              className="px-3.5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
            >
              <Camera className="w-4 h-4" />
              <span>Camera</span>
            </button>
            <button
              type="button"
              onClick={() => openComposer('image')}
              className="px-3.5 py-2 rounded-xl bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-[#0284c7] dark:text-[#38bdf8] border border-[#bae6fd] dark:border-sky-800 text-xs font-semibold flex items-center gap-1.5"
            >
              <ImageIcon className="w-4 h-4" />
              <span>Photo</span>
            </button>
            <button
              type="button"
              onClick={() => openComposer('video')}
              className="px-3.5 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center gap-1.5"
            >
              <Video className="w-4 h-4" />
              <span>Video</span>
            </button>
            <button
              type="button"
              onClick={() => openComposer('text')}
              className="px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center gap-1.5"
            >
              <Type className="w-4 h-4" />
              <span>Text</span>
            </button>
          </div>
        </div>

        {/* Owner quick list of own active statuses */}
        {myStatuses.length > 0 && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {myStatuses.map((st, idx) => (
              <div
                key={st.statusId}
                className="p-2.5 rounded-2xl bg-[#dff1ff]/80 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 flex items-center justify-between gap-2"
              >
                <button
                  type="button"
                  onClick={() => {
                    setViewerAuthorUid(uid);
                    setViewerIndex(idx);
                    setViewerPaused(false);
                    setProgressPct(0);
                    setViewersDrawerOpen(false);
                  }}
                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                >
                  {st.mediaType === 'image' && st.mediaUrl ? (
                    <img src={st.mediaUrl} alt="Status" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                  ) : st.mediaType === 'video' ? (
                    <div className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center shrink-0">
                      <Film className="w-4 h-4" />
                    </div>
                  ) : (
                    <div
                      className="w-10 h-10 rounded-xl text-white flex items-center justify-center text-[10px] font-bold shrink-0 px-1 truncate"
                      style={{ backgroundColor: st.backgroundColor || '#0284C7' }}
                    >
                      Aa
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {st.mediaType === 'text' ? st.textContent : st.caption || `${st.mediaType} update`}
                    </p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-2">
                      <span className="inline-flex items-center gap-0.5">
                        <Eye className="w-3 h-3" /> {st.viewers?.length || 0}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400 font-semibold">
                        ❤️ {st.reactions?.length || 0}
                      </span>
                      <span>{getStatusRemainingLabel(st.expiresAt)}</span>
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  {st.mediaType !== 'text' && st.mediaUrl && (
                    <button
                      type="button"
                      onClick={() => void handleSaveStatusToGallery(st)}
                      className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-950/60 text-blue-700 dark:text-blue-400"
                      title="Save to Gallery"
                      aria-label="Save Status media to gallery"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openPrivacyModal(st)}
                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
                    title="Change privacy for this status"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteStatusUpdate(st)}
                    className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-600"
                    title="Delete status"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent (Unseen) Updates */}
      <section className="rounded-3xl bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#0284c7] dark:text-[#38bdf8]">
            Recent Updates ({recentGroups.length})
          </h2>
          <span className="text-[11px] text-slate-600">Unseen stories from contacts</span>
        </div>

        {recentGroups.length === 0 ? (
          <p className="text-xs text-slate-600 dark:text-slate-400 py-4 text-center">
            No unseen updates right now. New updates from your PK CHAT contacts appear here automatically.
          </p>
        ) : (
          <div className="divide-y divide-sky-200/70 dark:divide-slate-800">
            {recentGroups.map((grp) => (
              <button
                key={grp.userId}
                type="button"
                onClick={() => openStoryGroup(grp.userId, true)}
                className="w-full py-3 px-2 rounded-2xl hover:bg-[#d2ecff]/70 dark:hover:bg-slate-800/60 flex items-center justify-between gap-3 text-left transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <StatusRingAvatar
                    src={grp.authorAvatar}
                    name={grp.authorName}
                    totalSegments={grp.statuses.length}
                    unseenSegments={grp.unseenCount}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {grp.authorName}
                    </p>
                    <p className="text-xs text-[#0284c7] dark:text-[#38bdf8] font-medium">
                      {grp.unseenCount} new · {formatStatusRelativeTime(grp.latestCreatedAtMs)}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Viewed Updates */}
      {viewedGroups.length > 0 && (
        <section className="rounded-3xl bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Viewed Updates ({viewedGroups.length})
            </h2>
            <span className="text-[11px] text-slate-600">Already seen · Expires at 24h</span>
          </div>
          <div className="divide-y divide-sky-200/70 dark:divide-slate-800">
            {viewedGroups.map((grp) => (
              <button
                key={grp.userId}
                type="button"
                onClick={() => openStoryGroup(grp.userId, false)}
                className="w-full py-3 px-2 rounded-2xl hover:bg-[#d2ecff]/70 dark:hover:bg-slate-800/60 flex items-center justify-between gap-3 text-left transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <StatusRingAvatar
                    src={grp.authorAvatar}
                    name={grp.authorName}
                    totalSegments={grp.statuses.length}
                    unseenSegments={0}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {grp.authorName}
                    </p>
                    <p className="text-xs text-slate-500">
                      Viewed · {formatStatusRelativeTime(grp.latestCreatedAtMs)}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Sponsored Public Status & Business Marketplace (Strictly Separate from My Contacts Status) */}
      <SponsoredMarketplaceSection
        uid={uid}
        userName={userProfile?.fullName || 'PK Chat User'}
        userCountry={userProfile?.country || 'Sri Lanka'}
        userCountryCode={userProfile?.countryCode || 'LK'}
        userLanguage={userProfile?.preferredLanguageName || 'English'}
        userPhone={userAccount?.phoneNumber || firebaseUser?.phoneNumber || undefined}
        userEmail={userAccount?.email || firebaseUser?.email || undefined}
        onLaunchLiveClass={() => setActiveScreen('class_room')}
      />

      {/* CREATE STATUS MODAL */}
      {composerOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-xl w-full max-h-[92vh] flex flex-col rounded-3xl bg-[#e3f3ff]/90 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/80 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Create Status Update</h3>
                <p className="text-[11px] text-sky-100">
                  Share photo, video, or text · Auto-deletes after 24 hours
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetComposer();
                  setComposerOpen(false);
                }}
                className="p-2 rounded-xl hover:bg-white/10"
                aria-label="Close Status creator"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Type Tabs */}
            <div className="px-5 pt-3 pb-2 border-b border-slate-200 dark:border-slate-800 flex gap-2">
              {(
                [
                  { id: 'image', label: 'Photo Status', icon: ImageIcon },
                  { id: 'video', label: 'Video Status', icon: Video },
                  { id: 'text', label: 'Text Status', icon: Type },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      stopCameraResources();
                      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
                      setSelectedFile(null);
                      setPreviewObjectUrl('');
                      setComposerMode(tab.id);
                    }}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
                      composerMode === tab.id
                        ? 'bg-[#0284c7] text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {/* Hidden gallery inputs */}
              <input
                ref={galleryPhotoInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/*"
                onChange={(e) => handleSelectGalleryFile(e, 'image')}
                className="hidden"
              />
              <input
                ref={galleryVideoInputRef}
                type="file"
                accept="video/*,.mp4,.webm,.mov,.m4v"
                onChange={(e) => handleSelectGalleryFile(e, 'video')}
                className="hidden"
              />

              {composerMode === 'image' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => galleryPhotoInputRef.current?.click()}
                      className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <ImageIcon className="w-4 h-4 text-[#0284c7]" />
                      <span>Upload from Gallery</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        cameraMode === 'photo' ? handleSnapCameraPhoto() : startLiveCamera('photo')
                      }
                      className="py-2.5 px-3 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center justify-center gap-1.5 border border-blue-200 dark:border-blue-800"
                    >
                      <Camera className="w-4 h-4" />
                      <span>{cameraMode === 'photo' ? 'Capture Snapshot' : 'Take Photo'}</span>
                    </button>
                  </div>

                  {cameraMode === 'photo' && (
                    <div className="rounded-2xl overflow-hidden bg-black aspect-video relative">
                      <video ref={liveVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    </div>
                  )}

                  {cameraMode === 'idle' && previewObjectUrl && (
                    <div className="rounded-2xl overflow-hidden bg-black max-h-72 flex items-center justify-center">
                      <img src={previewObjectUrl} alt="Status preview" className="max-h-72 object-contain" />
                    </div>
                  )}

                  <input
                    type="text"
                    maxLength={500}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Add a caption..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-xs"
                  />
                </div>
              )}

              {composerMode === 'video' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => galleryVideoInputRef.current?.click()}
                      className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <Film className="w-4 h-4 text-blue-600" />
                      <span>Choose Video File</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        cameraMode === 'video' ? handleToggleVideoRecord() : startLiveCamera('video')
                      }
                      className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
                        recordingVideo
                          ? 'bg-rose-600 text-white'
                          : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                      }`}
                    >
                      {recordingVideo ? <Square className="w-3.5 h-3.5" /> : <Video className="w-4 h-4" />}
                      <span>
                        {cameraMode !== 'video'
                          ? 'Record Video'
                          : recordingVideo
                            ? `Stop (${recordingSeconds}s / 60s)`
                            : 'Start Recording'}
                      </span>
                    </button>
                  </div>

                  {cameraMode === 'video' && (
                    <div className="rounded-2xl overflow-hidden bg-black aspect-video relative">
                      <video ref={liveVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                      {recordingVideo && (
                        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-rose-600 text-white text-[11px] font-bold animate-pulse">
                          REC 0:{String(recordingSeconds).padStart(2, '0')}
                        </span>
                      )}
                    </div>
                  )}

                  {cameraMode === 'idle' && previewObjectUrl && (
                    <div className="rounded-2xl overflow-hidden bg-black max-h-72">
                      <video src={previewObjectUrl} controls playsInline preload="metadata" className="w-full max-h-72" />
                    </div>
                  )}

                  <input
                    type="text"
                    maxLength={500}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Add a caption for your video..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-xs"
                  />
                </div>
              )}

              {composerMode === 'text' && (
                <div className="space-y-3">
                  <div
                    className={`rounded-2xl p-6 min-h-[210px] flex items-center justify-center bg-gradient-to-br ${STATUS_TEXT_BACKGROUNDS[bgIndex].gradient}`}
                  >
                    <textarea
                      rows={4}
                      maxLength={700}
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value)}
                      placeholder="Type a Status update..."
                      className={`w-full bg-transparent text-white placeholder-white/60 text-center text-lg sm:text-xl font-bold resize-none focus:outline-none ${
                        fontStyle === 'serif'
                          ? 'font-serif'
                          : fontStyle === 'mono'
                            ? 'font-mono'
                            : 'font-sans'
                      }`}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      {STATUS_TEXT_BACKGROUNDS.map((swatch, idx) => (
                        <button
                          key={swatch.id}
                          type="button"
                          onClick={() => setBgIndex(idx)}
                          aria-label={`Background ${swatch.label}`}
                          className={`w-6 h-6 rounded-full border-2 transition-transform ${
                            bgIndex === idx ? 'border-slate-900 dark:border-white scale-110' : 'border-white/50'
                          }`}
                          style={{ backgroundColor: swatch.css }}
                        />
                      ))}
                    </div>
                    <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 p-0.5 text-[11px]">
                      {(['sans', 'serif', 'mono'] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFontStyle(f)}
                          className={`px-2.5 py-1 rounded-lg capitalize font-semibold ${
                            fontStyle === f ? 'bg-[#0284c7] text-white' : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Privacy Row inside Composer */}
              <div className="p-3 rounded-2xl bg-[#dff1ff]/80 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <Shield className="w-4 h-4 text-[#0284c7]" />
                  <span>
                    Audience: <strong>{formatPrivacyBadgeLabel(statusPrivacyDefault, statusAllowedDefault)}</strong>
                    {statusPrivacyDefault === 'only_share_with' &&
                      (statusAllowedDefault.length === 0
                        ? ' (Only Me)'
                        : ` (${statusAllowedDefault.length} selected)`)}
                    {statusPrivacyDefault === 'contacts_except' &&
                      ` (${statusExcludedDefault.length} hidden)`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => openPrivacyModal()}
                  className="text-blue-700 dark:text-blue-400 font-semibold hover:underline"
                >
                  Change
                </button>
              </div>

              {postingBusy && (
                <div className="p-3 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-[#bae6fd] dark:border-sky-900 space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-[#0284c7] dark:text-[#38bdf8]">
                    <span>
                      {composerMode === 'text'
                        ? 'Publishing Text Status...'
                        : `Uploading ${composerMode === 'video' ? 'Video' : 'Photo'} to Firebase Storage...`}
                    </span>
                    <span className="font-mono tabular-nums">{uploadProgress}%</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#0284c7] to-blue-600 transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {statusError && (
                <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-200 space-y-2">
                  <p className="font-medium leading-relaxed">{statusError}</p>
                  {selectedFile && !postingBusy && (
                    <button
                      type="button"
                      onClick={handlePublishStatus}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                    >
                      Retry Upload
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-sky-200/70 dark:border-slate-800 flex items-center justify-end gap-2 bg-[#d8eeff]/85 dark:bg-slate-950">
              <button
                type="button"
                disabled={postingBusy}
                onClick={() => {
                  resetComposer();
                  setComposerOpen(false);
                }}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  postingBusy ||
                  recordingVideo ||
                  (composerMode === 'text' ? !textContent.trim() : !selectedFile)
                }
                onClick={handlePublishStatus}
                className="px-5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{postingBusy ? 'Posting...' : 'Share Status'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRIVACY SETTINGS MODAL */}
      {privacyModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full max-h-[88vh] flex flex-col rounded-3xl bg-[#e3f3ff]/90 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/80 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Status Privacy</h3>
                <p className="text-[11px] text-sky-100">Choose who can view your Status updates</p>
              </div>
              <button type="button" onClick={() => setPrivacyModalOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {(
                [
                  {
                    id: 'contacts',
                    title: 'My Contacts (நண்பர்கள் மட்டும்)',
                    desc: 'Share with all your verified PK CHAT contacts.',
                  },
                  {
                    id: 'contacts_except',
                    title: 'My Contacts Except...',
                    desc: 'Hide status updates from selected contacts.',
                  },
                  {
                    id: 'only_share_with',
                    title: 'Favorites Only (VIP) / Only Share With...',
                    desc: 'Allow only starred VIP Favorites or chosen contacts to view status.',
                  },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.id}
                  className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-colors ${
                    draftPrivacyMode === opt.id
                      ? 'border-[#0284c7] bg-sky-50/70 dark:bg-sky-950/40'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="statusPrivacy"
                    checked={draftPrivacyMode === opt.id}
                    onChange={() => setDraftPrivacyMode(opt.id)}
                    className="mt-0.5 accent-[#0284c7]"
                  />
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{opt.title}</p>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}

              {draftPrivacyMode !== 'contacts' && (
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[#0284c7]" />
                      <span>
                        {draftPrivacyMode === 'contacts_except'
                          ? 'Select contacts to HIDE status from:'
                          : 'Select VIP Favorites / contacts ALLOWED to view status:'}
                      </span>
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={applyOnlyMePreset}
                        className={`px-2 py-1 rounded-lg border text-[10px] font-bold ${
                          draftPrivacyMode === 'only_share_with' && draftAllowedIds.length === 0
                            ? 'bg-sky-600 text-white border-sky-600'
                            : 'bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300'
                        }`}
                      >
                        🔒 Only Me (Private)
                      </button>
                      {draftPrivacyMode === 'only_share_with' && favoriteContactUids.length > 0 && (
                        <button
                          type="button"
                          onClick={applyFavoritesOnlyPreset}
                          className="px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-[10px] font-bold"
                        >
                          Select All VIP ({favoriteContactUids.length})
                        </button>
                      )}
                    </div>
                  </div>
                  {contactOptions.length === 0 ? (
                    <p className="text-slate-500 py-2">
                      Add contacts first to select specific viewers.
                    </p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {contactOptions.map((c) => {
                        const listKey = draftPrivacyMode === 'contacts_except' ? 'excluded' : 'allowed';
                        const checked =
                          listKey === 'excluded'
                            ? draftExcludedIds.includes(c.uid)
                            : draftAllowedIds.includes(c.uid);
                        const isFav = favoriteContactUids.includes(c.uid);
                        return (
                          <div
                            key={c.uid}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-[#dff1ff]/80 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800"
                          >
                            <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleContactSelection(c.uid, listKey)}
                                className="w-4 h-4 accent-[#0284c7] shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 dark:text-white truncate">{c.name}</p>
                                <p className="text-[10px] text-slate-500">
                                  {c.country} · {c.lang}
                                </p>
                              </div>
                            </label>
                            <button
                              type="button"
                              onClick={() => toggleFavoriteContact(c.uid)}
                              className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                                isFav
                                  ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/40'
                                  : 'text-slate-400 hover:text-amber-500'
                              }`}
                              title={isFav ? 'Remove VIP Favorite' : 'Mark as VIP Favorite'}
                              aria-label={isFav ? 'Remove VIP Favorite' : 'Mark as VIP Favorite'}
                            >
                              <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-400' : ''}`} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-sky-200/70 dark:border-slate-800 flex justify-end gap-2 bg-[#d8eeff]/85 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => setPrivacyModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePrivacyModal}
                className="px-5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Save Privacy</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL-SCREEN STORY VIEWER */}
      {activeStory && (
        <div className="fixed inset-0 z-[70] bg-black flex flex-col">
          {/* Segmented Top Progress Bars */}
          <div className="px-4 pt-3 pb-2 space-y-2.5 z-10 bg-gradient-to-b from-black/75 to-transparent">
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${viewerStack.length}, minmax(0, 1fr))` }}>
              {viewerStack.map((st, idx) => {
                const widthPct =
                  idx < viewerIndex ? 100 : idx === viewerIndex ? Math.round(progressPct) : 0;
                return (
                  <div key={st.statusId} className="h-1 rounded-full bg-white/30 overflow-hidden">
                    <div
                      className="h-full bg-white transition-all duration-75"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Author Header */}
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2.5 min-w-0">
                <UserAvatar src={activeStory.authorAvatar} name={activeStory.authorName} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">
                    {activeStory.userId === uid ? 'My Status' : activeStory.authorName}
                  </p>
                  <p className="text-[11px] text-white/75 flex items-center gap-2">
                    <span>{formatStatusRelativeTime(activeStory.createdAt)}</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Clock className="w-3 h-3" /> {getStatusRemainingLabel(activeStory.expiresAt)}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {activeStory.mediaType !== 'text' && activeStory.mediaUrl && (
                  <button
                    type="button"
                    onClick={() => void handleSaveStatusToGallery(activeStory)}
                    className="px-2.5 py-1.5 rounded-full bg-blue-600/85 hover:bg-blue-600 text-white text-[11px] font-semibold flex items-center gap-1"
                    title="Save to Gallery"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Save to Gallery</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewerPaused((p) => !p)}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20"
                  title={viewerPaused ? 'Resume' : 'Pause'}
                >
                  {viewerPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
                {activeStory.userId === uid && (
                  <>
                    <button
                      type="button"
                      onClick={() => openPrivacyModal(activeStory)}
                      className="p-2 rounded-full bg-white/10 hover:bg-white/20"
                      title="Privacy"
                    >
                      <Lock className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteCurrentStory}
                      className="p-2 rounded-full bg-rose-600/80 hover:bg-rose-600"
                      title="Delete Status"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={closeViewer}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Close Status Viewer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Story Stage */}
          <div className="relative flex-1 flex items-center justify-center overflow-hidden px-4">
            {/* Prev/Next Navigation Hotspots */}
            <button
              type="button"
              onClick={handlePrevStory}
              aria-label="Previous Status"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/40 hover:bg-black/70 text-white"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={handleNextStory}
              aria-label="Next Status"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/40 hover:bg-black/70 text-white"
            >
              <ChevronRight className="w-6 h-6" />
            </button>

            {activeStory.mediaType === 'text' ? (
              <div
                className={`w-full max-w-lg rounded-3xl p-8 min-h-[360px] flex items-center justify-center text-center shadow-2xl ${getStoryBgGradient(
                  activeStory.backgroundColor
                )}`}
              >
                <p
                  className={`text-white text-2xl sm:text-3xl font-bold leading-snug whitespace-pre-wrap break-words ${
                    activeStory.fontStyle === 'serif'
                      ? 'font-serif'
                      : activeStory.fontStyle === 'mono'
                        ? 'font-mono'
                        : 'font-sans'
                  }`}
                >
                  {activeStory.textContent}
                </p>
              </div>
            ) : activeStory.mediaType === 'image' ? (
              <img
                src={activeStory.mediaUrl}
                alt={activeStory.caption || 'Status photo'}
                className="max-h-[72vh] max-w-full rounded-2xl object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (
              <video
                ref={storyVideoRef}
                src={activeStory.mediaUrl}
                controls
                autoPlay
                playsInline
                preload="metadata"
                onEnded={handleNextStory}
                onTimeUpdate={(e) => {
                  const vid = e.currentTarget;
                  if (vid.duration > 0) {
                    setProgressPct(Math.min(100, (vid.currentTime / vid.duration) * 100));
                  }
                }}
                className="max-h-[72vh] max-w-full rounded-2xl bg-black"
              />
            )}

            {reactionToast && (
              <div className="absolute bottom-24 px-4 py-1.5 rounded-full bg-[#0284c7] text-white text-xs font-bold shadow-lg">
                {reactionToast}
              </div>
            )}
          </div>

          {/* Caption + Owner Viewers / Viewer Reaction + Reply Bar */}
          <div className="p-4 bg-gradient-to-t from-black/90 via-black/70 to-transparent space-y-3">
            {activeStory.caption && (
              <p className="text-center text-sm text-white font-medium max-w-xl mx-auto">
                {activeStory.caption}
              </p>
            )}

            {activeStory.userId === uid ? (
              <div className="max-w-lg mx-auto">
                <button
                  type="button"
                  onClick={() => setViewersDrawerOpen((o) => !o)}
                  className="mx-auto px-5 py-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  <span>Viewed by {activeStory.viewers?.length || 0}</span>
                  <span className="text-rose-300 font-bold">
                    · ❤️ {activeStory.reactions?.length || 0} Likes
                  </span>
                </button>

                {viewersDrawerOpen && (
                  <div className="mt-3 p-4 rounded-2xl bg-slate-900 border border-slate-700 text-white max-h-56 overflow-y-auto space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold border-b border-slate-800 pb-2">
                      <span>Viewers &amp; Reactions ({activeStory.viewers?.length || 0})</span>
                      <button type="button" onClick={() => setViewersDrawerOpen(false)}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {(activeStory.viewers?.length || 0) === 0 ? (
                      <p className="text-xs text-slate-400">No contacts have viewed this Status yet.</p>
                    ) : (
                      activeStory.viewers.map((v) => {
                        const reaction = activeStory.reactions?.find((r) => r.userId === v.viewerId);
                        return (
                          <div key={v.viewerId} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2.5">
                              <UserAvatar src={v.viewerAvatar} name={v.viewerName} size="xs" />
                              <div>
                                <p className="font-semibold">{v.viewerName}</p>
                                <p className="text-[10px] text-slate-400">
                                  {formatStatusRelativeTime(v.viewedAt)}
                                </p>
                              </div>
                            </div>
                            {reaction && <span className="text-base">{reaction.emoji}</span>}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-lg mx-auto space-y-2.5">
                <div className="flex items-center justify-center gap-2">
                  <Smile className="w-4 h-4 text-white/70" />
                  {STATUS_QUICK_REACTIONS.map((emoji) => {
                    const isMine = activeStory.reactions?.some(
                      (r) => r.userId === uid && r.emoji === emoji
                    );
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleReact(emoji)}
                        className={`w-9 h-9 rounded-full text-lg flex items-center justify-center transition-transform hover:scale-110 ${
                          isMine ? 'bg-[#0284c7] ring-2 ring-white' : 'bg-white/15 hover:bg-white/25'
                        }`}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                </div>

                <form onSubmit={handleSendStatusReply} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Reply privately to ${activeStory.authorName}...`}
                    className="flex-1 px-4 py-2.5 rounded-full bg-white/15 border border-white/25 text-white placeholder-white/60 text-xs focus:outline-none focus:bg-white/20"
                  />
                  <button
                    type="submit"
                    disabled={replyBusy || !replyText.trim()}
                    className="p-2.5 rounded-full bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-white"
                    aria-label="Send Status Reply"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
