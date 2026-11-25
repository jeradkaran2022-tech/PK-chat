import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  BellPlus,
  CalendarClock,
  Camera,
  Check,
  CheckCheck,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileText,
  Film,
  Flag,
  Flame,
  Forward,
  Image as ImageIcon,
  Lock,
  MapPin,
  MessageSquarePlus,
  Mic,
  MoreVertical,
  Navigation,
  Palette,
  Paperclip,
  Pause,
  Phone,
  PhoneCall,
  Play,
  QrCode,
  Radio,
  Reply,
  Search,
  Send,
  Share2,
  Shield,
  ShieldCheck,
  Smile,
  Square,
  Sun,
  Trash2,
  Unlock,
  UserPlus,
  Video,
  X,
  ZoomIn,
} from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import {
  BUBBLE_COLOR_OPTIONS,
  BUILT_IN_WALLPAPERS,
  COUNTRIES,
  LANGUAGES,
  STICKERS,
} from '../data/constants';
import { usePkChat } from '../context/PkChatContext';
import { ChatMessage, DirectChat, PhoneDirectoryEntry } from '../types/pkchat';
import {
  generateCelebrationGreeting,
  synthesizeTranslatedSpeech,
  transcribeAndTranslateAudio,
} from '../lib/api';
import {
  CHAT_ANIMATION_META,
  CelebrationCategory,
  ChatAnimationType,
  FESTIVAL_3D_CARDS,
  detectChatKeywordAnimation,
  getUniversalBroadcastPresets,
  getUniversalCelebrationCards,
} from '../data/festivals';
import { tryReadAndroidBridgeGps } from '../lib/offlineSmsSos';
import { getFastAccurateGps } from '../lib/connectivityAndDnd';
import { FestivalCanvasOverlay } from './FestivalCanvasOverlay';
import { PeaceUnityWatermark } from './PeaceUnityWatermark';
import { TajMahalTributeModal } from './TajMahalTributeModal';
import { WazeNavigationModal } from './WazeNavigationModal';
import { MessengerDisasterAlerts } from './MessengerDisasterAlerts';
import { QrCodeModal, QrModalInitialTab } from './QrCodeModal';
import {
  compressChatPhoto,
  formatFileSize,
  getDocExtensionBadge,
  inspectVideoFileMetadata,
  prepareDocumentAttachment,
  triggerMediaDownload,
} from '../lib/chatMediaUtils';
import {
  MediaUploadProgressDetail,
  groupStatusesByAuthor,
  uploadChatMediaFile,
} from '../lib/statusMedia';
import { decryptE2eeText, secureShredMediaObjectUrl } from '../lib/crypto';
import { useAppI18n } from '../lib/i18n';
import { getSubscriptionEntitlement } from '../lib/subscriptionBilling';
import {
  inspectFileWithDeepGuard,
  isSafeMediaUrl,
  sanitizeChatPayload,
} from '../lib/securityShield';
import { playNotificationTone } from '../lib/audioTones';
import { UserAvatar, sanitizeUserAvatarUrl } from './UserAvatar';
import {
  BRAND_THEME_EVENT,
  LightBrandTheme,
  WALLPAPER_FIT_EVENT,
  WallpaperFitMode,
  getLightBrandTheme,
  getWallpaperFitMode,
  setLightBrandTheme,
  setWallpaperFitMode,
} from '../lib/appearanceTheme';
import {
  OFFICIAL_READ_CHANGED_EVENT,
  buildOfficialInboxGreetings,
  computeUnreadOfficialInboxCount,
  getReadOfficialIds,
  localizeRedAlert,
  markOfficialIdsRead,
} from '../lib/officialInboxEngine';

const TANGLISH_GREETING_CARDS = [
  {
    id: 'vanakkam',
    emoji: '👋✨',
    tanglish: 'Nalama irukkingala? Vanakkam!',
    meaning: 'How are you doing? Warm greetings',
    gradient: 'from-[#0284c7] to-sky-500',
  },
  {
    id: 'saptirgala',
    emoji: '🍲😊',
    tanglish: 'Neengal saptirgala? Nalla irukkeengala?',
    meaning: 'Have you eaten? Doing okay?',
    gradient: 'from-blue-700 to-cyan-600',
  },
  {
    id: 'nandri',
    emoji: '🙏💖',
    tanglish: 'Romba nandri nanbaa! Epodhum magizhchi.',
    meaning: 'Thanks a lot, friend! Always grateful',
    gradient: 'from-blue-800 to-indigo-600',
  },
  {
    id: 'kaalai',
    emoji: '☀️🌸',
    tanglish: 'Iniya Kaalai Vanakkam! Indha naal nalladhaga amaiyattum.',
    meaning: 'Happy Good Morning! Wishing you a great day',
    gradient: 'from-[#0369a1] to-cyan-500',
  },
  {
    id: 'birthday',
    emoji: '🎂🎉',
    tanglish: 'Iniya Pirandha Naal Vaazhthukkal! Epodhum sandhoshama irunga.',
    meaning: 'Happy Birthday wishes!',
    gradient: 'from-[#0284c7] to-blue-700',
  },
  {
    id: 'safe',
    emoji: '🛡️💙',
    tanglish: 'Naan nallamaga paadhugaappaga irukken. Kavalai padadheenga!',
    meaning: 'I am safe and well. Do not worry!',
    gradient: 'from-sky-600 to-blue-700',
  },
];

type FontStyleOption = 'normal' | 'bold' | 'fancy' | 'caps';

const THREE_D_EMOJI_CARDS = [
  {
    id: '3d_birthday',
    emoji: '🎂🎈✨',
    label: 'Birthday Card 3D',
    badge: '3D Celebration',
    animation: 'birthday' as const,
    text: '🎂🎈✨ Happy Birthday! Wishing you endless joy, health & success! Iniya Pirandha Naal Vaazhthukkal! 🥳🎉',
    gradient: 'from-amber-500 via-orange-500 to-rose-600',
  },
  {
    id: '3d_love',
    emoji: '🏛️❤️✨',
    label: 'Taj Mahal & Love 3D',
    badge: '3D Eternal Love',
    animation: 'love' as const,
    text: '🏛️❤️✨ அன்பின் நித்திய சின்னமான தாஜ்மஹால் நினைவுச் செய்தி! Eternal Love & Warm Wishes! 💐❤️',
    gradient: 'from-pink-600 via-rose-500 to-red-600',
  },
];

function applyStylishFont(text: string, style: FontStyleOption): string {
  if (!text || style === 'normal') return text;
  if (style === 'caps') return `${text.toUpperCase()} ✨`;
  const upperOffset = style === 'bold' ? 0x1d5d4 - 65 : 0x1d4d0 - 65;
  const lowerOffset = style === 'bold' ? 0x1d5ee - 97 : 0x1d4ea - 97;
  return Array.from(text)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code >= 65 && code <= 90) {
        return String.fromCodePoint(code + upperOffset);
      }
      if (code >= 97 && code <= 122) {
        return String.fromCodePoint(code + lowerOffset);
      }
      return ch;
    })
    .join('');
}


function formatMsgTime(ts: unknown): string {
  if (ts instanceof Timestamp) {
    return ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return 'Now';
}

function formatLastSeenLabel(ts: unknown): string {
  if (ts instanceof Timestamp) {
    const date = ts.toDate();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isToday = date.toDateString() === new Date().toDateString();
    return isToday
      ? `Last seen today at ${timeStr}`
      : `Last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr}`;
  }
  return 'Last seen recently';
}

interface ParsedPkLocation {
  lat: number;
  lng: number;
  mode: 'current' | 'live_8h';
  label: string;
}

function parsePkLocationPayload(text: string): ParsedPkLocation | null {
  const match = text.match(/\[PK_LOC\|(-?\d+(?:\.\d+)?)\|(-?\d+(?:\.\d+)?)\|(current|live_8h)\|([^\]]+)\]/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    mode: match[3] === 'live_8h' ? 'live_8h' : 'current',
    label: match[4],
  };
}

const CONSENT_BLUR_PREFIX = '[PK_BLUR_CONSENT]';

function parseConsentProtectedMedia(text: string): { isProtected: boolean; cleanText: string } {
  if (!text.startsWith(CONSENT_BLUR_PREFIX)) {
    return { isProtected: false, cleanText: text };
  }
  return {
    isProtected: true,
    cleanText: text.slice(CONSENT_BLUR_PREFIX.length).trim(),
  };
}

function PkReadReceiptTick({ isSeen }: { isSeen: boolean }) {
  if (isSeen) {
    return (
      <span
        title="Seen by recipient (Neon Cyan Double Ticks)"
        aria-label="Seen by recipient"
        className="inline-flex items-center shrink-0 text-[#0284c7] dark:text-[#00e5ff] font-black drop-shadow-[0_0_8px_rgba(0,229,255,0.85)]"
      >
        <CheckCheck className="w-4 h-4 stroke-[2.6]" />
      </span>
    );
  }
  return (
    <span
      title="Delivered / Sent"
      aria-label="Delivered to recipient"
      className="inline-flex items-center shrink-0 text-sky-500/80 dark:text-[#38bdf8]/75"
    >
      <CheckCheck className="w-3.5 h-3.5 stroke-[2.2]" />
    </span>
  );
}

export function ChatWorkspace() {
  const {
    activeScreen,
    setActiveScreen,
    userAccount,
    userProfile,
    profileMedia,
    profileMediaCache,
    linkPhoneForDiscovery,
    blockUserByUid,
    unblockUserByUid,
    directoryProfiles,
    contacts,
    directChats,
    groupChats,
    messages,
    translations,
    activeChatId,
    activeChatType,
    setActiveChat,
    addContact,
    toggleBlockContact,
    reportContact,
    incomingContactRequests,
    outgoingContactRequests,
    lookupUserByPhone,
    sendContactRequest,
    respondToContactRequest,
    selectedCountry,
    startDirectChat,
    createGroupChat,
    sendMessage,
    deleteMessage,
    markMessageRead,
    setTypingStatus,
    offlineOutboxCount,
    flushOfflineOutbox,
    startCall,
    userSettings,
    updateUserSettings,
    wallpapers,
    languagePref,
    disasterAlerts,
    consentedLocation,
    sosAlerts,
    emergencyContacts,
    subscription,
    notifications,
    markNotificationRead,
    scheduledPosts,
    schedulePKPost,
    cancelScheduledPost,
    statuses,
    weatherSnapshot,
    sharePhotoToManyContacts,
    intentionalDataOff,
    appLanguage,
  } = usePkChat();

  const [lightBrandTheme, setLightBrandThemeState] = useState<LightBrandTheme>(() =>
    getLightBrandTheme()
  );
  const [wallpaperFit, setWallpaperFitState] = useState<WallpaperFitMode>(() =>
    getWallpaperFitMode()
  );
  const [showChatHeaderMenu, setShowChatHeaderMenu] = useState(false);
  const chatHeaderMenuRef = useRef<HTMLDivElement | null>(null);

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [qrModalTab, setQrModalTab] = useState<QrModalInitialTab | null>(null);
  const [schedPostType, setSchedPostType] = useState<'chat_wish' | 'status'>('chat_wish');
  const [schedMessage, setSchedMessage] = useState('');
  const [schedEmoji, setSchedEmoji] = useState('🎉');
  const [schedWishDate, setSchedWishDate] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [schedError, setSchedError] = useState<string | null>(null);
  const [schedAiBusy, setSchedAiBusy] = useState(false);
  const [schedSelectedFestival, setSchedSelectedFestival] = useState('fest_global_newyear');
  const [festivalQuickFilter, setFestivalQuickFilter] = useState<'all' | CelebrationCategory>('all');

  const quickSendFestivalCards = useMemo(() => {
    return getUniversalCelebrationCards(festivalQuickFilter);
  }, [festivalQuickFilter]);

  const broadcastPresets = useMemo(
    () => getUniversalBroadcastPresets(),
    []
  );

  const statusGroups = useMemo(
    () => groupStatusesByAuthor(statuses || [], userProfile?.uid || ''),
    [statuses, userProfile?.uid]
  );
  const totalMyStatusViews = useMemo(
    () =>
      statusGroups.myStatuses.reduce(
        (sum, st) => sum + (st.viewedByUids?.filter((id) => id !== userProfile?.uid).length || 0),
        0
      ),
    [statusGroups.myStatuses, userProfile?.uid]
  );

  const [chatFilter, setChatFilter] = useState<'all' | 'unread' | 'direct' | 'groups'>('all');
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const { t } = useAppI18n();
  const [showOriginalMap, setShowOriginalMap] = useState<Record<string, boolean>>({});
  const [globalShowOriginal, setGlobalShowOriginal] = useState(
    languagePref?.defaultViewMode === 'original'
  );
  const [showStickers, setShowStickers] = useState(false);
  const [showTanglishCards, setShowTanglishCards] = useState(false);
  const [showTajTributeModal, setShowTajTributeModal] = useState(false);
  const [fontStyle, setFontStyle] = useState<FontStyleOption>('normal');
  const [chatAnimation, setChatAnimation] = useState<ChatAnimationType>(null);
  const [animatedGreetingText, setAnimatedGreetingText] = useState<string | null>(null);
  const animationTimerRef = useRef<number | null>(null);
  const lastAnimatedMsgIdRef = useRef<string | null>(null);
  const autoOpenedChatRef = useRef<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [decryptedCache, setDecryptedCache] = useState<Record<string, string>>({});
  const [chatActionError, setChatActionError] = useState<string | null>(null);
  const [chatSecurityToast, setChatSecurityToast] = useState<string | null>(null);
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);

  // Home In-App Phone Link widget
  const [homePhoneInput, setHomePhoneInput] = useState('');
  const [homePhoneDial, setHomePhoneDial] = useState(selectedCountry.dialCode || '+94');
  const [homePhoneBusy, setHomePhoneBusy] = useState(false);
  const [homePhoneStatus, setHomePhoneStatus] = useState<string | null>(null);

  // Voice note recording state (hands-free lock + pre-send audio preview)
  const [recording, setRecording] = useState(false);
  const [recordLocked, setRecordLocked] = useState(false);
  const [recordElapsedSec, setRecordElapsedSec] = useState(0);
  const [pendingVoiceNote, setPendingVoiceNote] = useState<{
    blob: Blob;
    url: string;
    durationSec: number;
  } | null>(null);
  const recordElapsedRef = useRef(0);
  const recordCancelledRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [voicePlaybackSpeed, setVoicePlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  const [voicePreviewPlaying, setVoicePreviewPlaying] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [longPressMsgId, setLongPressMsgId] = useState<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const [burnAfterSeconds, setBurnAfterSeconds] = useState<0 | 30 | 300 | 3600>(0);

  useEffect(() => {
    if (!recording) {
      setRecordElapsedSec(0);
      recordElapsedRef.current = 0;
      return;
    }
    const id = window.setInterval(() => {
      recordElapsedRef.current += 1;
      setRecordElapsedSec(recordElapsedRef.current);
    }, 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(() => {
    if (voicePreviewAudioRef.current) {
      voicePreviewAudioRef.current.playbackRate = voicePlaybackSpeed;
    }
  }, [voicePlaybackSpeed, pendingVoiceNote]);

  useEffect(() => {
    setVoicePreviewPlaying(false);
  }, [pendingVoiceNote]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        recordCancelledRef.current = true;
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore cleanup stop errors
        }
      }
      micStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      micStreamRef.current = null;
      secureShredMediaObjectUrl(pendingVoiceNote?.url);
    };
  }, [pendingVoiceNote]);

  // Add Contact, Phone Discovery & Create Group modals
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactCountry, setNewContactCountry] = useState(COUNTRIES[0].name);
  const [newContactLang, setNewContactLang] = useState('ta');
  const [lookupDialCode, setLookupDialCode] = useState(selectedCountry.dialCode || '+94');
  const [lookupPhoneInput, setLookupPhoneInput] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupMatch, setLookupMatch] = useState<PhoneDirectoryEntry | null>(null);
  const [lookupSearched, setLookupSearched] = useState(false);
  const [requestStatusMsg, setRequestStatusMsg] = useState<string | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);

  // Simulated cross-language partner reply helper inside active thread
  const [partnerLangCode, setPartnerLangCode] = useState('ta');
  const [partnerReplyText, setPartnerReplyText] = useState('');
  const [showPartnerTester, setShowPartnerTester] = useState(false);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const chatSearchInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const markedReadIdsRef = useRef<Set<string>>(new Set());

  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [attachingBusy, setAttachingBusy] = useState(false);
  const [mediaUploadProgress, setMediaUploadProgress] = useState<{
    phase: 'scanning' | 'metadata' | 'uploading';
    fileName: string;
    pct: number;
    loadedBytes: number;
    totalBytes: number;
  } | null>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<{
    messageType: 'image' | 'document' | 'video';
    mediaName: string;
    mediaMimeType: string;
    mediaPreviewData?: string;
    sizeLabel: string;
    durationLabel?: string;
    requireConsentBlur?: boolean;
  } | null>(null);
  const [revealedConsentMediaIds, setRevealedConsentMediaIds] = useState<string[]>([]);
  const [consentPromptMsg, setConsentPromptMsg] = useState<ChatMessage | null>(null);
  const [officialInboxOpen, setOfficialInboxOpen] = useState(false);
  const pendingConsentPresetRef = useRef(false);
  const [blockConfirmTarget, setBlockConfirmTarget] = useState<{
    uid: string;
    name: string;
    currentlyBlocked: boolean;
  } | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; name: string } | null>(null);
  const [sharePhotoTarget, setSharePhotoTarget] = useState<{
    src: string;
    name: string;
    caption?: string;
  } | null>(null);
  const [shareSelectedUids, setShareSelectedUids] = useState<string[]>([]);
  const [shareContactFilter, setShareContactFilter] = useState('');
  const [sharePhotoBusy, setSharePhotoBusy] = useState(false);
  const [sharePhotoResult, setSharePhotoResult] = useState<string | null>(null);

  const allShareableContacts = useMemo(() => {
    const map = new Map<string, { uid: string; name: string; subtitle: string; avatar?: string }>();
    const myUid = userProfile?.uid;
    contacts.forEach((c) => {
      if (c.contactUid && c.contactUid !== myUid && !c.blocked) {
        map.set(c.contactUid, {
          uid: c.contactUid,
          name: c.displayName,
          subtitle: c.country || 'PK Chat Contact',
        });
      }
    });
    directoryProfiles.forEach((p) => {
      if (p.uid && p.uid !== myUid) {
        const existing = map.get(p.uid);
        map.set(p.uid, {
          uid: p.uid,
          name: existing?.name || p.fullName,
          subtitle: `${p.country || 'Global'} · ${p.onlineStatus === 'online' ? 'Online' : 'Offline'}`,
          avatar: p.avatarUrl,
        });
      }
    });
    directChats.forEach((chat) => {
      const otherUid = chat.participantIds.find((id) => id !== myUid);
      if (otherUid && !map.has(otherUid)) {
        map.set(otherUid, {
          uid: otherUid,
          name: chat.title || 'Direct Contact',
          subtitle: 'Recent Chat',
        });
      }
    });
    return Array.from(map.values());
  }, [contacts, directoryProfiles, directChats, userProfile?.uid]);
  const [openedGreetingIds, setOpenedGreetingIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('pk_opened_greeting_ids');
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [wazeModalState, setWazeModalState] = useState<{
    open: boolean;
    initialLat?: number;
    initialLng?: number;
    initialDestinationName?: string;
    initialMode?: 'current' | 'live_8h' | 'route';
  }>({ open: false });

  const [userDob, setUserDob] = useState<string>(() => {
    try {
      return window.localStorage.getItem('pk_user_dob') || '';
    } catch {
      return '';
    }
  });
  const [officialReadVersion, setOfficialReadVersion] = useState<number>(0);

  useEffect(() => {
    const bump = () => setOfficialReadVersion((v) => v + 1);
    window.addEventListener(OFFICIAL_READ_CHANGED_EVENT, bump);
    return () => window.removeEventListener(OFFICIAL_READ_CHANGED_EVENT, bump);
  }, []);

  const officialGreetings = useMemo(
    () =>
      buildOfficialInboxGreetings({
        fullName: userProfile?.fullName,
        dob: userDob,
      }),
    [userDob, userProfile?.fullName]
  );

  const activeUserLang = userProfile?.preferredLanguage || appLanguage || 'en';
  const activeCountryName = consentedLocation?.country || userProfile?.country || 'Global';

  const localizedRedAlerts = useMemo(
    () =>
      disasterAlerts.map((alert) =>
        localizeRedAlert(alert, activeUserLang, activeCountryName)
      ),
    [activeCountryName, activeUserLang, disasterAlerts]
  );

  const unreadOfficialCount = useMemo(() => {
    void officialReadVersion;
    return computeUnreadOfficialInboxCount({
      uid: userProfile?.uid,
      notifications,
      disasterAlerts,
      greetings: officialGreetings,
    });
  }, [disasterAlerts, notifications, officialGreetings, officialReadVersion, userProfile?.uid]);

  const officialGreetingBroadcast = useMemo(() => {
    const topGreeting = officialGreetings.find((g) => g.activeToday) || officialGreetings[0];
    return topGreeting
      ? `${topGreeting.emoji} ${topGreeting.title} — ${topGreeting.body}`
      : '🎉 அனைத்து PK Chat பயனர்களுக்கும் அன்பான இனிய வாழ்த்துகள்! Connected cleanly worldwide.';
  }, [officialGreetings]);

  const openOfficialInboxAndMarkRead = useCallback(() => {
    setOfficialInboxOpen(true);
    const idsToMark = [
      ...notifications.map((n) => n.id),
      ...disasterAlerts.map((a) => `disaster_${a.alertId}`),
      ...officialGreetings.map((g) => g.id),
    ];
    if (idsToMark.length > 0) {
      markOfficialIdsRead(userProfile?.uid, idsToMark);
      setOfficialReadVersion((v) => v + 1);
    }
    notifications.forEach((n) => {
      if (!n.read) {
        void markNotificationRead(n.id);
      }
    });
  }, [disasterAlerts, markNotificationRead, notifications, officialGreetings, userProfile?.uid]);

  useEffect(() => {
    if (!officialInboxOpen) return;
    const idsToMark = [
      ...notifications.map((n) => n.id),
      ...disasterAlerts.map((a) => `disaster_${a.alertId}`),
      ...officialGreetings.map((g) => g.id),
    ];
    if (idsToMark.length > 0) {
      markOfficialIdsRead(userProfile?.uid, idsToMark);
      setOfficialReadVersion((v) => v + 1);
    }
    notifications.forEach((n) => {
      if (!n.read) {
        void markNotificationRead(n.id);
      }
    });
  }, [disasterAlerts, markNotificationRead, notifications, officialGreetings, officialInboxOpen, userProfile?.uid]);

  // Viber-Style Floating Emojis & WhatsApp Business Custom Auto-Reply
  const [floatingEmojis, setFloatingEmojis] = useState<
    Array<{ id: string; emoji: string; leftPct: number }>
  >([]);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('pk_autoreply_enabled') === 'true';
    } catch {
      return false;
    }
  });
  const [autoReplyMsg, setAutoReplyMsg] = useState<string>(() => {
    try {
      return (
        window.localStorage.getItem('pk_autoreply_msg') ||
        'வணக்கம்! நான் தற்போது வேலையாக உள்ளேன். விரைவில் பதில் தருகிறேன். நன்றி! 🙏'
      );
    } catch {
      return '';
    }
  });

  const spawnViberEmoji = useCallback((emoji: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const leftPct = 15 + Math.floor(Math.random() * 70);
    setFloatingEmojis((prev) => [...prev.slice(-14), { id, emoji, leftPct }]);
    window.setTimeout(() => {
      setFloatingEmojis((prev) => prev.filter((item) => item.id !== id));
    }, 2150);
  }, []);

  useEffect(() => {
    const onOpenWaze = () => setWazeModalState({ open: true, initialMode: 'route' });
    const onOpenSchedule = () => {
      setSchedError(null);
      setShowScheduleModal(true);
    };
    const onFocusSearch = () => {
      chatSearchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      chatSearchInputRef.current?.focus();
    };
    const onDobUpdated = () => {
      try {
        setUserDob(window.localStorage.getItem('pk_user_dob') || '');
      } catch {
        // ignore storage errors
      }
    };
    const onAutoReplyUpdated = () => {
      try {
        setAutoReplyEnabled(window.localStorage.getItem('pk_autoreply_enabled') === 'true');
        setAutoReplyMsg(window.localStorage.getItem('pk_autoreply_msg') || '');
      } catch {
        // ignore storage errors
      }
    };
    const onChatFilter = (ev: Event) => {
      const nextFilter = (ev as CustomEvent<'all' | 'unread' | 'direct' | 'groups'>).detail;
      if (nextFilter === 'all' || nextFilter === 'unread' || nextFilter === 'direct' || nextFilter === 'groups') {
        setChatFilter(nextFilter);
      }
    };
    const onBrandTheme = (ev: Event) => {
      const detail = (ev as CustomEvent<LightBrandTheme>).detail;
      setLightBrandThemeState(
        detail === 'sky_glass' || detail === 'ocean_blue' ? detail : getLightBrandTheme()
      );
    };
    void lightBrandTheme;
    const onWallpaperFit = (ev: Event) => {
      const detail = (ev as CustomEvent<WallpaperFitMode>).detail;
      setWallpaperFitState(detail === 'cover' || detail === 'contain' ? detail : getWallpaperFitMode());
    };
    const onQuickCamera = () => {
      pendingConsentPresetRef.current = false;
      cameraInputRef.current?.click();
    };
    window.addEventListener('pkchat-open-waze', onOpenWaze);
    window.addEventListener('pkchat-open-schedule', onOpenSchedule);
    window.addEventListener('pkchat-focus-search', onFocusSearch);
    window.addEventListener('pkchat-dob-updated', onDobUpdated);
    window.addEventListener('pkchat-autoreply-updated', onAutoReplyUpdated);
    window.addEventListener('pkchat-chat-filter', onChatFilter);
    window.addEventListener('pkchat-quick-camera', onQuickCamera);
    window.addEventListener(BRAND_THEME_EVENT, onBrandTheme);
    window.addEventListener(WALLPAPER_FIT_EVENT, onWallpaperFit);
    return () => {
      window.removeEventListener('pkchat-open-waze', onOpenWaze);
      window.removeEventListener('pkchat-open-schedule', onOpenSchedule);
      window.removeEventListener('pkchat-focus-search', onFocusSearch);
      window.removeEventListener('pkchat-dob-updated', onDobUpdated);
      window.removeEventListener('pkchat-autoreply-updated', onAutoReplyUpdated);
      window.removeEventListener('pkchat-chat-filter', onChatFilter);
      window.removeEventListener('pkchat-quick-camera', onQuickCamera);
      window.removeEventListener(BRAND_THEME_EVENT, onBrandTheme);
      window.removeEventListener(WALLPAPER_FIT_EVENT, onWallpaperFit);
    };
  }, []);

  useEffect(() => {
    if (!showChatHeaderMenu) return;
    const onOutside = (ev: MouseEvent) => {
      if (chatHeaderMenuRef.current && !chatHeaderMenuRef.current.contains(ev.target as Node)) {
        setShowChatHeaderMenu(false);
      }
    };
    const onEscape = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setShowChatHeaderMenu(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [showChatHeaderMenu]);

  useEffect(() => {
    if (!chatSecurityToast) return;
    const timer = window.setTimeout(() => setChatSecurityToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [chatSecurityToast]);

  const markGreetingOpened = useCallback((messageId: string) => {
    setOpenedGreetingIds((prev) => {
      if (prev.includes(messageId)) return prev;
      const next = [...prev, messageId].slice(-120);
      try {
        localStorage.setItem('pk_opened_greeting_ids', JSON.stringify(next));
      } catch {
        // ignore storage quota
      }
      return next;
    });
  }, []);

  const activeDirectChat = useMemo(
    () => directChats.find((c) => c.chatId === activeChatId) || directChats[0] || null,
    [directChats, activeChatId]
  );

  const activeGroupChat = useMemo(
    () => groupChats.find((g) => g.groupId === activeChatId) || groupChats[0] || null,
    [groupChats, activeChatId]
  );

  const currentChatId =
    activeScreen === 'group_chat'
      ? activeGroupChat?.groupId || null
      : activeDirectChat?.chatId || null;

  const activeMessages = useMemo(() => {
    if (!currentChatId) return [];
    return messages.filter((m) => m.chatId === currentChatId);
  }, [messages, currentChatId]);

  const activeWallpaper = useMemo(() => {
    const wpId =
      (activeScreen === 'group_chat' ? activeGroupChat?.wallpaperId : activeDirectChat?.wallpaperId) ||
      userSettings?.wallpaperId ||
      'wp_world_peace';
    return (
      wallpapers.find((w) => w.wallpaperId === wpId) ||
      BUILT_IN_WALLPAPERS[0]
    );
  }, [activeScreen, activeGroupChat, activeDirectChat, userSettings?.wallpaperId, wallpapers]);

  const activeBubbleStyle = useMemo(() => {
    return (
      BUBBLE_COLOR_OPTIONS.find((b) => b.id === userSettings?.bubbleColor)?.bgClass ||
      BUBBLE_COLOR_OPTIONS[0].bgClass
    );
  }, [userSettings?.bubbleColor]);

  const resolveDirectChatPartner = (chat: DirectChat | null) => {
    if (!chat) {
      return {
        uid: '',
        name: 'Direct Chat',
        avatar: '',
        blocked: false,
        isOnline: false,
        presenceLabel: undefined as string | undefined,
      };
    }
    const partnerUid =
      chat.participantIds.find((id) => id !== userProfile?.uid) || userProfile?.uid || '';
    const prof = directoryProfiles.find((p) => p.uid === partnerUid);
    const blockedIds = profileMedia?.blockedUserIds ?? userProfile?.blockedUserIds ?? [];
    const blocked = blockedIds.includes(partnerUid);
    const cachedMedia = partnerUid ? profileMediaCache[partnerUid] : null;
    const rawAvatar =
      partnerUid === userProfile?.uid
        ? profileMedia?.avatarDataUrl || userProfile?.avatarUrl
        : cachedMedia?.avatarDataUrl || prof?.avatarUrl;

    const showLastSeen = userSettings?.lastSeenVisible !== false;
    const isSelf = partnerUid === userProfile?.uid;
    const isOnline = !blocked && showLastSeen && (isSelf || prof?.onlineStatus === 'online');
    let presenceLabel: string | undefined;
    if (!blocked && showLastSeen) {
      if (isOnline) {
        presenceLabel = 'Online';
      } else if (prof?.lastSeen) {
        presenceLabel = formatLastSeenLabel(prof.lastSeen);
      } else if (chat.updatedAt) {
        presenceLabel = formatLastSeenLabel(chat.updatedAt);
      }
    }

    const rawName = prof?.fullName || chat.title || 'Direct Conversation';
    const cleanName = rawName.includes('@') ? 'PK Chat Contact' : rawName;
    let resolvedPhone: string | undefined;
    try {
      const savedRaw = localStorage.getItem('pk_dialpad_saved_contacts');
      if (savedRaw) {
        const savedList = JSON.parse(savedRaw) as Array<{ name?: string; phone?: string }>;
        const matchedSaved = Array.isArray(savedList)
          ? savedList.find(
              (item) =>
                item?.name &&
                cleanName &&
                item.name.trim().toLowerCase() === cleanName.trim().toLowerCase() &&
                item.phone
            )
          : undefined;
        if (matchedSaved?.phone) resolvedPhone = matchedSaved.phone;
      }
    } catch {
      // Ignore storage read failure
    }

    return {
      uid: partnerUid,
      name: cleanName,
      avatar: blocked ? '' : sanitizeUserAvatarUrl(rawAvatar),
      phone: resolvedPhone,
      blocked,
      isOnline,
      presenceLabel,
    };
  };

  useEffect(() => {
    if (
      (activeScreen !== 'individual_chat' && activeScreen !== 'group_chat') ||
      !userProfile?.uid
    ) {
      return;
    }
    const myUid = userProfile.uid;
    activeMessages.forEach((msg) => {
      if (!msg.readBy?.includes(myUid) && !markedReadIdsRef.current.has(msg.messageId)) {
        markedReadIdsRef.current.add(msg.messageId);
        markMessageRead(msg);
      }
    });
  }, [activeMessages, activeScreen, markMessageRead, userProfile?.uid]);

  useEffect(() => {
    if (activeScreen === 'individual_chat' || activeScreen === 'group_chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [activeMessages.length, currentChatId, activeScreen]);

  useEffect(() => {
    return () => {
      if (animationTimerRef.current !== null) {
        window.clearTimeout(animationTimerRef.current);
      }
    };
  }, []);

  const triggerAnimationEffect = useCallback(
    (text: string, forced?: Exclude<ChatAnimationType, null>, manual = false) => {
      const detected = forced ?? detectChatKeywordAnimation(text);
      if (!detected) return;
      setAnimatedGreetingText(text.trim() ? text.trim() : null);
      setChatAnimation(detected);
      if (animationTimerRef.current !== null) {
        window.clearTimeout(animationTimerRef.current);
        animationTimerRef.current = null;
      }
      if (!manual) {
        animationTimerRef.current = window.setTimeout(() => {
          setChatAnimation(null);
          setAnimatedGreetingText(null);
          animationTimerRef.current = null;
        }, 6500);
      }
    },
    []
  );

  useEffect(() => {
    if (
      (activeScreen !== 'individual_chat' && activeScreen !== 'group_chat') ||
      activeMessages.length === 0 ||
      !currentChatId
    ) {
      return;
    }
    const latest = activeMessages[activeMessages.length - 1];
    if (!latest || latest.deleted) return;

    // Auto-trigger festival/love animation once upon opening a chat whose latest card is a greeting
    if (autoOpenedChatRef.current !== currentChatId) {
      autoOpenedChatRef.current = currentChatId;
      lastAnimatedMsgIdRef.current = latest.messageId;
      if (detectChatKeywordAnimation(latest.originalText)) {
        triggerAnimationEffect(latest.originalText);
      }
      return;
    }

    if (latest.messageId === lastAnimatedMsgIdRef.current) return;
    lastAnimatedMsgIdRef.current = latest.messageId;
    triggerAnimationEffect(latest.originalText);
  }, [activeMessages, activeScreen, currentChatId, triggerAnimationEffect]);

  useEffect(() => {
    lastAnimatedMsgIdRef.current = null;
    autoOpenedChatRef.current = null;
    setChatAnimation(null);
    setAnimatedGreetingText(null);
  }, [currentChatId]);

  const handleSendText = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!messageInput.trim() && !pendingAttachment) || !currentChatId) return;
    setChatActionError(null);
    const participantIds =
      activeScreen === 'group_chat'
        ? activeGroupChat?.memberIds || [userProfile?.uid || '']
        : activeDirectChat?.participantIds || [userProfile?.uid || ''];

    const scanResult = sanitizeChatPayload(messageInput);
    if (!scanResult.safe) {
      setMessageInput('');
      setChatActionError(
        scanResult.blockedReason ||
          '🛡️ Cyber Shield Alert: Malicious payload detected and neutralized automatically!'
      );
      return;
    }

    const rawText = scanResult.sanitizedText;
    const attachmentToSend = pendingAttachment;
    const styledText = !attachmentToSend ? applyStylishFont(rawText, fontStyle) : rawText;
    setMessageInput('');
    setPendingAttachment(null);
    setShowAttachMenu(false);

    if (activeScreen === 'individual_chat') {
      setTypingStatus(currentChatId, false);
    }

    if (rawText) {
      triggerAnimationEffect(rawText);
    }

    try {
      const msgType = attachmentToSend ? attachmentToSend.messageType : 'text';
      const baseAttachmentText =
        attachmentToSend?.messageType === 'image'
          ? rawText || `Photo: ${attachmentToSend.mediaName}`
          : attachmentToSend?.messageType === 'document'
            ? rawText || `${attachmentToSend.mediaName} (${attachmentToSend.sizeLabel})`
            : attachmentToSend?.messageType === 'video'
              ? rawText || `Video: ${attachmentToSend.mediaName} (${attachmentToSend.sizeLabel})`
              : styledText;
      const fallbackText =
        attachmentToSend &&
        attachmentToSend.requireConsentBlur &&
        (attachmentToSend.messageType === 'image' || attachmentToSend.messageType === 'video')
          ? `${CONSENT_BLUR_PREFIX} ${baseAttachmentText}`
          : baseAttachmentText;

      await sendMessage({
        chatId: currentChatId,
        chatType: activeScreen === 'group_chat' ? 'group' : 'direct',
        participantIds,
        text: fallbackText,
        messageType: msgType,
        mediaName: attachmentToSend?.mediaName,
        mediaMimeType: attachmentToSend?.mediaMimeType,
        mediaPreviewData: attachmentToSend?.mediaPreviewData,
        e2eeEnabled:
          !attachmentToSend && activeScreen === 'individual_chat'
            ? Boolean(activeDirectChat?.e2eeEnabled)
            : false,
        replyToId: replyTarget?.messageId,
        replyToText: replyTarget?.originalText,
        burnAfterSeconds: burnAfterSeconds > 0 ? burnAfterSeconds : undefined,
      });
      setReplyTarget(null);
    } catch (err) {
      setMessageInput(rawText);
      if (attachmentToSend) setPendingAttachment(attachmentToSend);
      setChatActionError(err instanceof Error ? err.message : 'Unable to send message.');
    }
  };

  const handleSendSticker = async (sticker: string) => {
    if (!currentChatId) return;
    setChatActionError(null);
    const participantIds =
      activeScreen === 'group_chat'
        ? activeGroupChat?.memberIds || [userProfile?.uid || '']
        : activeDirectChat?.participantIds || [userProfile?.uid || ''];
    setShowStickers(false);
    try {
      await sendMessage({
        chatId: currentChatId,
        chatType: activeScreen === 'group_chat' ? 'group' : 'direct',
        participantIds,
        text: sticker,
        messageType: 'sticker',
        e2eeEnabled: false,
      });
    } catch (err) {
      setChatActionError(err instanceof Error ? err.message : 'Unable to send sticker.');
    }
  };

  const acquireCurrentGpsCoords = async (): Promise<{ lat: number; lng: number }> => {
    const fix = await getFastAccurateGps(
      consentedLocation?.latitude !== undefined && consentedLocation?.longitude !== undefined
        ? { latitude: consentedLocation.latitude, longitude: consentedLocation.longitude }
        : undefined
    );
    if (fix) {
      return { lat: fix.latitude, lng: fix.longitude };
    }
    throw new Error('Enable device GPS or set your area in Safety/SOS before sharing location.');
  };

  const sendLocationToChat = async (
    mode: 'current' | 'live_8h',
    override?: { lat: number; lng: number; label?: string }
  ) => {
    const targetChatId = currentChatId || directChats[0]?.chatId || groupChats[0]?.groupId || null;
    if (!targetChatId) {
      setChatActionError('Start or select a chat first before sharing your location pin.');
      return;
    }
    setChatActionError(null);
    setShowAttachMenu(false);
    setAttachingBusy(true);
    try {
      const coords = override || (await acquireCurrentGpsCoords());
      const cleanLabel = (
        override?.label ||
        (mode === 'live_8h'
          ? `Live Location · Route Tracking (8h)`
          : `Current Location · GPS Pin`)
      ).replace(/\|/g, '-');
      const payload = `[PK_LOC|${coords.lat.toFixed(5)}|${coords.lng.toFixed(5)}|${mode}|${cleanLabel}]`;
      const targetDirect = directChats.find((c) => c.chatId === targetChatId);
      const targetGroup = groupChats.find((g) => g.groupId === targetChatId);
      const participantIds = targetGroup
        ? targetGroup.memberIds
        : targetDirect?.participantIds || [userProfile?.uid || ''];

      await sendMessage({
        chatId: targetChatId,
        chatType: targetGroup ? 'group' : 'direct',
        participantIds,
        text: payload,
        messageType: 'text',
        e2eeEnabled: Boolean(targetDirect?.e2eeEnabled),
      });

      if (mode === 'live_8h' && !override) {
        setWazeModalState({
          open: true,
          initialLat: coords.lat,
          initialLng: coords.lng,
          initialDestinationName: cleanLabel,
          initialMode: 'live_8h',
        });
      }
    } catch (err) {
      setChatActionError(err instanceof Error ? err.message : 'Unable to share location.');
    } finally {
      setAttachingBusy(false);
    }
  };

  const handleCancelMediaUpload = () => {
    uploadAbortControllerRef.current?.abort();
    uploadAbortControllerRef.current = null;
    setMediaUploadProgress(null);
    setAttachingBusy(false);
    setChatActionError('Media upload cancelled safely.');
  };

  const handlePhotoSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentChatId) return;
    setChatActionError(null);
    setShowAttachMenu(false);
    const avScan = await inspectFileWithDeepGuard(file, {
      fileName: file.name,
      mimeType: file.type,
      mediaCategory: 'image',
    });
    if (!avScan.safe) {
      setChatActionError(avScan.blockedReason || 'Blocked by Cyber Shield Anti-Malware scan.');
      return;
    }
    const useSensitiveBlur = pendingConsentPresetRef.current;
    pendingConsentPresetRef.current = false;
    setAttachingBusy(true);
    try {
      const compressed = await compressChatPhoto(file);
      setPendingAttachment({
        messageType: 'image',
        mediaName: file.name || `photo_${Date.now()}.jpg`,
        mediaMimeType: compressed.mimeType,
        mediaPreviewData: compressed.dataUrl,
        sizeLabel: `${compressed.sizeLabel} · ${avScan.badge}`,
        requireConsentBlur: useSensitiveBlur,
      });
    } catch (err) {
      setChatActionError(err instanceof Error ? err.message : 'Could not prepare selected photo.');
    } finally {
      setAttachingBusy(false);
    }
  };

  const handleDocumentSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentChatId) return;
    setChatActionError(null);
    setShowAttachMenu(false);
    const avScan = await inspectFileWithDeepGuard(file, {
      fileName: file.name,
      mimeType: file.type,
      mediaCategory: 'document',
    });
    if (!avScan.safe) {
      setChatActionError(avScan.blockedReason || 'Blocked by Cyber Shield Anti-Malware scan.');
      return;
    }
    setAttachingBusy(true);
    try {
      if (file.size <= 240 * 1024 || !userProfile?.uid) {
        const prepared = await prepareDocumentAttachment(file);
        setPendingAttachment({
          messageType: 'document',
          mediaName: file.name,
          mediaMimeType: prepared.mimeType,
          mediaPreviewData: prepared.dataUrl,
          sizeLabel: `${prepared.sizeLabel} · ${avScan.badge}`,
        });
      } else {
        const controller = new AbortController();
        uploadAbortControllerRef.current = controller;
        setMediaUploadProgress({
          phase: 'uploading',
          fileName: file.name,
          pct: 0,
          loadedBytes: 0,
          totalBytes: file.size,
        });
        const uploaded = await uploadChatMediaFile({
          uid: userProfile.uid,
          kind: 'doc',
          blobOrFile: file,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          signal: controller.signal,
          onProgressDetail: (detail: MediaUploadProgressDetail) => {
            setMediaUploadProgress({
              phase: 'uploading',
              fileName: file.name,
              pct: detail.pct,
              loadedBytes: detail.loadedBytes,
              totalBytes: detail.totalBytes,
            });
          },
        });
        setPendingAttachment({
          messageType: 'document',
          mediaName: file.name,
          mediaMimeType: uploaded.mimeType,
          mediaPreviewData: uploaded.url,
          sizeLabel: `${formatFileSize(file.size)} · ${avScan.badge}`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not attach document.';
      if (!/cancel/i.test(msg)) {
        setChatActionError(msg);
      }
    } finally {
      uploadAbortControllerRef.current = null;
      setMediaUploadProgress(null);
      setAttachingBusy(false);
    }
  };

  const handleVideoSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentChatId || !userProfile?.uid) return;
    setChatActionError(null);
    setShowAttachMenu(false);
    setAttachingBusy(true);

    const controller = new AbortController();
    uploadAbortControllerRef.current = controller;
    const useSensitiveBlur = pendingConsentPresetRef.current;
    pendingConsentPresetRef.current = false;

    try {
      setMediaUploadProgress({
        phase: 'scanning',
        fileName: file.name,
        pct: 0,
        loadedBytes: 0,
        totalBytes: file.size,
      });

      const avScan = await inspectFileWithDeepGuard(file, {
        fileName: file.name,
        mimeType: file.type,
        mediaCategory: 'video',
      });
      if (!avScan.safe) {
        setChatActionError(avScan.blockedReason || 'Blocked by Cyber Shield Anti-Malware scan.');
        return;
      }

      setMediaUploadProgress({
        phase: 'metadata',
        fileName: file.name,
        pct: 0,
        loadedBytes: 0,
        totalBytes: file.size,
      });
      const videoMeta = await inspectVideoFileMetadata(file);

      setMediaUploadProgress({
        phase: 'uploading',
        fileName: file.name,
        pct: 1,
        loadedBytes: 0,
        totalBytes: file.size,
      });
      const uploaded = await uploadChatMediaFile({
        uid: userProfile.uid,
        kind: 'vid',
        blobOrFile: file,
        fileName: file.name,
        mimeType: file.type || 'video/mp4',
        signal: controller.signal,
        onProgressDetail: (detail: MediaUploadProgressDetail) => {
          setMediaUploadProgress({
            phase: 'uploading',
            fileName: file.name,
            pct: detail.pct,
            loadedBytes: detail.loadedBytes,
            totalBytes: detail.totalBytes,
          });
        },
      });

      setPendingAttachment({
        messageType: 'video',
        mediaName: file.name,
        mediaMimeType: uploaded.mimeType,
        mediaPreviewData: uploaded.url,
        durationLabel: videoMeta.durationLabel,
        sizeLabel: `${formatFileSize(file.size)} · ${videoMeta.durationLabel} · ${avScan.badge}`,
        requireConsentBlur: useSensitiveBlur,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to attach video clip.';
      if (!/cancel/i.test(msg)) {
        setChatActionError(msg);
      }
    } finally {
      uploadAbortControllerRef.current = null;
      setMediaUploadProgress(null);
      setAttachingBusy(false);
    }
  };

  const handleDiscardPendingVoiceNote = () => {
    if (voicePreviewAudioRef.current) {
      voicePreviewAudioRef.current.pause();
    }
    setVoicePreviewPlaying(false);
    if (pendingVoiceNote?.url) {
      URL.revokeObjectURL(pendingVoiceNote.url);
    }
    setPendingVoiceNote(null);
  };

  const handleCycleVoicePlaybackSpeed = () => {
    setVoicePlaybackSpeed((prev) => (prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1));
  };

  const handleToggleVoicePreviewPlay = async () => {
    const el = voicePreviewAudioRef.current;
    if (!el) return;
    if (el.paused) {
      el.playbackRate = voicePlaybackSpeed;
      try {
        await el.play();
        setVoicePreviewPlaying(true);
      } catch {
        setVoicePreviewPlaying(false);
      }
    } else {
      el.pause();
      setVoicePreviewPlaying(false);
    }
  };

  const handleDownloadPendingVoiceNote = () => {
    if (!pendingVoiceNote?.url) return;
    const link = document.createElement('a');
    link.href = pendingVoiceNote.url;
    link.download = `pkchat-voice-${Date.now()}.webm`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSendPendingVoiceNote = async () => {
    if (!pendingVoiceNote || !currentChatId) return;
    setChatActionError(null);
    setVoiceBusy(true);
    const { blob, url } = pendingVoiceNote;
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          const idx = result.indexOf(',');
          if (idx >= 0) resolve(result.slice(idx + 1));
          else reject(new Error('Failed to encode audio recording.'));
        };
        reader.onerror = () => reject(new Error('Unable to read recorded audio.'));
        reader.readAsDataURL(blob);
      });

      let audioPreviewUrl: string | undefined;
      if (userProfile?.uid) {
        try {
          const uploaded = await uploadChatMediaFile({
            uid: userProfile.uid,
            kind: 'aud',
            blobOrFile: blob,
            fileName: `voice_${Date.now()}.webm`,
            mimeType: blob.type || 'audio/webm',
          });
          audioPreviewUrl = uploaded.url;
        } catch {
          audioPreviewUrl = undefined;
        }
      }

      let transcriptText = '[Voice message recorded]';
      try {
        const transcribed = await transcribeAndTranslateAudio({
          audioBase64: base64,
          mimeType: blob.type || 'audio/webm',
          targetLanguage: userProfile?.preferredLanguage || 'en',
          targetLanguageName: userProfile?.preferredLanguageName || 'English',
        });
        if (transcribed.transcript) {
          transcriptText = transcribed.transcript;
        }
      } catch {
        if (!audioPreviewUrl) {
          throw new Error('Unable to transcribe or upload recorded voice note.');
        }
      }

      const participantIds =
        activeScreen === 'group_chat'
          ? activeGroupChat?.memberIds || [userProfile?.uid || '']
          : activeDirectChat?.participantIds || [userProfile?.uid || ''];
      await sendMessage({
        chatId: currentChatId,
        chatType: activeScreen === 'group_chat' ? 'group' : 'direct',
        participantIds,
        text: transcriptText,
        messageType: 'voice',
        mediaName: 'Voice Note',
        mediaMimeType: blob.type || 'audio/webm',
        mediaPreviewData: audioPreviewUrl,
        burnAfterSeconds: burnAfterSeconds > 0 ? burnAfterSeconds : undefined,
      });
      secureShredMediaObjectUrl(url);
      setPendingVoiceNote(null);
      playNotificationTone(activeScreen === 'group_chat' ? 'group_message' : 'direct_message');
    } catch (err) {
      setChatActionError(
        err instanceof Error ? err.message : 'Unable to transcribe or send voice message.'
      );
    } finally {
      setVoiceBusy(false);
    }
  };

  const handleCancelActiveRecording = () => {
    if (!recording || !mediaRecorderRef.current) return;
    recordCancelledRef.current = true;
    setRecordLocked(false);
    setRecording(false);
    mediaRecorderRef.current.stop();
  };

  const handleToggleVoiceRecord = async () => {
    if (!currentChatId) return;
    setChatActionError(null);
    if (recording && mediaRecorderRef.current) {
      recordCancelledRef.current = false;
      mediaRecorderRef.current.stop();
      setRecording(false);
      setRecordLocked(false);
      return;
    }

    if (pendingVoiceNote?.url) {
      URL.revokeObjectURL(pendingVoiceNote.url);
      setPendingVoiceNote(null);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recordCancelledRef.current = false;
      recordElapsedRef.current = 0;
      setRecordElapsedSec(0);

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
        if (recordCancelledRef.current) {
          audioChunksRef.current = [];
          return;
        }
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (blob.size === 0) return;
        const previewUrl = URL.createObjectURL(blob);
        setPendingVoiceNote({
          blob,
          url: previewUrl,
          durationSec: Math.max(1, recordElapsedRef.current),
        });
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setChatActionError('Microphone permission is required to record voice messages.');
    }
  };

  const handlePlayTranslatedTts = async (text: string, messageId?: string) => {
    if (messageId) setPlayingMsgId(messageId);
    try {
      const tts = await synthesizeTranslatedSpeech({
        text,
        voiceName: languagePref?.ttsVoice || 'Kore',
        languageName: userProfile?.preferredLanguageName || 'English',
      });
      const audio = new Audio(`data:audio/wav;base64,${tts.audioBase64}`);
      audio.onended = () => setPlayingMsgId(null);
      audio.onerror = () => setPlayingMsgId(null);
      await audio.play();
    } catch {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.onend = () => setPlayingMsgId(null);
        u.onerror = () => setPlayingMsgId(null);
        window.speechSynthesis.speak(u);
      } else {
        setPlayingMsgId(null);
      }
    }
  };

  const handleDecryptMessage = async (msg: ChatMessage) => {
    if (!msg.encryptedPayload) return;
    try {
      const chatDoc = directChats.find((c) => c.chatId === msg.chatId);
      const peerUid = chatDoc?.participantIds.find((id) => id !== userProfile?.uid);
      const peerPubKey = peerUid
        ? directoryProfiles.find((p) => p.uid === peerUid)?.e2eePublicKey
        : undefined;
      const plain = await decryptE2eeText(msg.encryptedPayload, msg.chatId, peerPubKey);
      setDecryptedCache((prev) => ({ ...prev, [msg.messageId]: plain }));
    } catch {
      setDecryptedCache((prev) => ({ ...prev, [msg.messageId]: msg.originalText }));
    }
  };

  const handleSendSimulatedPartnerMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerReplyText.trim() || !currentChatId) return;
    setChatActionError(null);
    const lang = LANGUAGES.find((l) => l.code === partnerLangCode) || LANGUAGES[1];
    const participantIds =
      activeScreen === 'group_chat'
        ? activeGroupChat?.memberIds || [userProfile?.uid || '']
        : activeDirectChat?.participantIds || [userProfile?.uid || ''];
    const text = partnerReplyText.trim();
    setPartnerReplyText('');
    triggerAnimationEffect(text);
    try {
      await sendMessage({
        chatId: currentChatId,
        chatType: activeScreen === 'group_chat' ? 'group' : 'direct',
        participantIds,
        text,
        messageType: 'text',
        simulateIncomingReplyFrom: {
          uid: `partner_${lang.code}`,
          name: lang.name === 'Tamil' ? 'Kavitha (Colombo)' : `${lang.name} Partner`,
          languageCode: lang.code,
          languageName: lang.name,
        },
      });
      if (autoReplyEnabled && autoReplyMsg.trim()) {
        const replyBody = autoReplyMsg.trim();
        window.setTimeout(() => {
          void sendMessage({
            chatId: currentChatId,
            chatType: activeScreen === 'group_chat' ? 'group' : 'direct',
            participantIds,
            text: `💬 [Auto-Reply]: ${replyBody}`,
            messageType: 'text',
            e2eeEnabled: Boolean(activeDirectChat?.e2eeEnabled),
          })
            .then(() => {
              setChatSecurityToast(`💬 Custom Auto-Reply sent: "${replyBody}"`);
            })
            .catch(() => {});
        }, 550);
      }
    } catch (err) {
      setPartnerReplyText(text);
      setChatActionError(
        err instanceof Error ? err.message : 'Unable to simulate incoming partner message.'
      );
    }
  };

  const scheduleModalNode = showScheduleModal ? (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-lg w-full max-h-[90vh] overflow-y-auto rounded-3xl bg-[#e3f3ff]/92 dark:bg-slate-900/95 backdrop-blur-2xl border border-[#7dd3fc] dark:border-slate-800 p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold">⏰ Scheduled Wishes &amp; Greetings</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Schedule family, birthday, anniversary, and midnight New Year wishes
            </p>
          </div>
          <button type="button" onClick={() => setShowScheduleModal(false)} aria-label="Close schedule modal">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(['chat_wish', 'status'] as const).map((pt) => (
            <button
              key={pt}
              type="button"
              onClick={() => setSchedPostType(pt)}
              className={`py-2 rounded-xl text-xs font-semibold border ${
                schedPostType === pt
                  ? 'border-[#0284c7] bg-sky-50 dark:bg-sky-950/40 text-[#0284c7] dark:text-[#38bdf8]'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              {pt === 'chat_wish' ? 'Chat Wish' : 'Scheduled Status'}
            </button>
          ))}
        </div>

        {/* Celebration Greeting Broadcast Preset & Composer */}
        <div className="p-3.5 rounded-2xl bg-[#dff1ff]/82 dark:bg-slate-950 backdrop-blur-xl border border-[#7dd3fc]/75 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[#0284c7] dark:text-[#38bdf8]">
              Celebration Broadcast Preset
            </label>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
                setSchedWishDate(
                  new Date(nextMidnight.getTime() - nextMidnight.getTimezoneOffset() * 60000)
                    .toISOString()
                    .slice(0, 16)
                );
                setSchedSelectedFestival('fest_global_newyear');
                setSchedEmoji('🎆');
                setSchedMessage(
                  '🎆🥂✨ இனிய ஆங்கிலப் புத்தாண்டு நல்வாழ்த்துகள்! Happy Global New Year!'
                );
              }}
              className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-[11px] font-semibold"
            >
              12:00 AM Midnight New Year
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={schedSelectedFestival}
              onChange={(e) => {
                const preset = broadcastPresets.find((p) => p.id === e.target.value);
                setSchedSelectedFestival(e.target.value);
                if (preset) {
                  setSchedEmoji(preset.emoji);
                  setSchedMessage(preset.message);
                }
              }}
              className="flex-1 px-3 py-2 rounded-xl bg-[#eef8ff]/90 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800 text-xs"
            >
              {broadcastPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={schedAiBusy}
              onClick={async () => {
                setSchedAiBusy(true);
                setSchedError(null);
                try {
                  const chosen =
                    broadcastPresets.find((p) => p.id === schedSelectedFestival) || broadcastPresets[0];
                  const targetDirect = activeDirectChat || directChats[0] || null;
                  const res = await generateCelebrationGreeting({
                    festivalTitle: chosen?.label || 'Global New Year 🎆',
                    languageCode: userProfile?.preferredLanguage || 'ta',
                    languageName: userProfile?.preferredLanguageName || 'Tamil',
                    recipientName:
                      activeScreen === 'individual_chat' ? activeDirectChat?.title || '' : targetDirect?.title || '',
                    isMidnightNewYear: chosen?.id === 'fest_global_newyear',
                  });
                  setSchedEmoji(chosen?.emoji || '✨');
                  setSchedMessage(res.greetingText);
                } catch (err) {
                  setSchedError(err instanceof Error ? err.message : 'Unable to generate celebration greeting.');
                } finally {
                  setSchedAiBusy(false);
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              <span>{schedAiBusy ? 'Generating...' : 'Compose Wish'}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {['🎉', '🎆', '🌾', '🪔', '🌙', '🎄', '🎂', '🏛️', '✨'].map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => setSchedEmoji(em)}
              className={`px-2.5 py-1 rounded-xl border text-base ${
                schedEmoji === em
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              {em}
            </button>
          ))}
        </div>

        <textarea
          rows={3}
          value={schedMessage}
          onChange={(e) => setSchedMessage(e.target.value)}
          placeholder="Write your scheduled birthday, festival, or midnight New Year wish..."
          className="w-full px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-950 border border-[#7dd3fc]/75 dark:border-slate-800 text-sm"
        />

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Future Delivery Date &amp; Time
          </label>
          <input
            type="datetime-local"
            value={schedWishDate}
            onChange={(e) => setSchedWishDate(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-950 border border-[#7dd3fc]/75 dark:border-slate-800 text-xs font-mono"
          />
        </div>

        {schedError && <p className="text-xs text-rose-600">{schedError}</p>}

        <button
          type="button"
          onClick={async () => {
            setSchedError(null);
            try {
              const targetDirect = activeDirectChat || directChats[0] || null;
              const targetChatId = currentChatId || targetDirect?.chatId || groupChats[0]?.groupId || '';
              const otherId =
                (activeScreen === 'group_chat'
                  ? activeGroupChat?.groupId
                  : targetDirect?.participantIds.find((p) => p !== userProfile?.uid)) ||
                userProfile?.uid ||
                '';
              await schedulePKPost({
                postType: schedPostType,
                receiverId: schedPostType === 'chat_wish' ? otherId : '',
                chatId: schedPostType === 'chat_wish' ? targetChatId : '',
                message: schedMessage,
                emojiKey: schedEmoji,
                mediaUrl: '',
                wishTime: new Date(schedWishDate),
              });
              setSchedMessage('');
              setShowScheduleModal(false);
            } catch (err) {
              setSchedError(err instanceof Error ? err.message : 'Unable to schedule post');
            }
          }}
          className="w-full py-3 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-sm font-semibold"
        >
          Schedule in Cloud Firestore
        </button>

        {scheduledPosts.length > 0 && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 max-h-32 overflow-y-auto">
            <p className="text-xs font-semibold text-slate-500">Scheduled Queue ({scheduledPosts.length})</p>
            {scheduledPosts.map((sp) => (
              <div key={sp.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#bae6fd]/60 dark:border-slate-800">
                <span className="truncate pr-2">
                  {sp.emojiKey} {sp.message} ({sp.status})
                </span>
                {sp.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => cancelScheduledPost(sp.id)}
                    className="text-rose-600 font-semibold shrink-0"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  ) : null;

  const tajTributeModalNode = (() => {
    const inActiveConversation =
      (activeScreen === 'individual_chat' || activeScreen === 'group_chat') && Boolean(currentChatId);
    const fallbackDirect = !inActiveConversation ? directChats[0] || null : null;
    const fallbackGroup = !inActiveConversation && !fallbackDirect ? groupChats[0] || null : null;
    const targetIsGroup = inActiveConversation
      ? activeScreen === 'group_chat'
      : Boolean(fallbackGroup);
    const targetDirect = inActiveConversation
      ? activeScreen === 'individual_chat'
        ? activeDirectChat
        : null
      : fallbackDirect;
    const targetGroup = inActiveConversation
      ? activeScreen === 'group_chat'
        ? activeGroupChat
        : null
      : fallbackGroup;
    const targetId = inActiveConversation
      ? currentChatId
      : targetDirect?.chatId || targetGroup?.groupId || null;
    const targetLabel = targetIsGroup
      ? targetGroup?.name
      : targetDirect
        ? resolveDirectChatPartner(targetDirect)?.name || targetDirect.title
        : undefined;

    return (
      <TajMahalTributeModal
        open={showTajTributeModal}
        recipientLabel={targetLabel}
        onClose={() => setShowTajTributeModal(false)}
        onSendLove={async (rawMessage) => {
          const scanResult = sanitizeChatPayload(rawMessage);
          if (!scanResult.safe) {
            throw new Error(
              scanResult.blockedReason ||
                '🛡️ Cyber Shield Alert: Unsafe payload blocked before sending.'
            );
          }
          if (!targetId) {
            throw new Error('Create or select a chat conversation before sending the Taj Mahal tribute.');
          }
          const participantIds = targetIsGroup
            ? targetGroup?.memberIds || [userProfile?.uid || '']
            : targetDirect?.participantIds || [userProfile?.uid || ''];

          await sendMessage({
            chatId: targetId,
            chatType: targetIsGroup ? 'group' : 'direct',
            participantIds,
            text: scanResult.sanitizedText,
            messageType: 'text',
            e2eeEnabled: !targetIsGroup ? Boolean(targetDirect?.e2eeEnabled) : true,
          });

          setShowTajTributeModal(false);
          if (!inActiveConversation) {
            setActiveChat(targetId, targetIsGroup ? 'group' : 'direct');
            setActiveScreen(targetIsGroup ? 'group_chat' : 'individual_chat');
          } else {
            triggerAnimationEffect(scanResult.sanitizedText, 'taj');
          }
        }}
      />
    );
  })();

  // Screen 8: Home Screen
  if (activeScreen === 'home') {
    const activeSos = sosAlerts.filter((a) => a.status === 'active');
    const myAvatar = sanitizeUserAvatarUrl(profileMedia?.avatarDataUrl || userProfile?.avatarUrl);
    const myStatus =
      profileMedia?.statusMessage ||
      userProfile?.statusMessage ||
      profileMedia?.about ||
      userProfile?.about ||
      'Hey there! I am using PK CHAT.';
    return (
      <div className="p-4 lg:p-8 space-y-6">
        {/* All Blue Glassmorphic PK CHAT Profile & Global Chat Banner */}
        <section className="rounded-[20px] bg-gradient-to-br from-[#0284c7] via-[#0369a1] to-[#0072ff] dark:bg-none dark:bg-white/[0.035] dark:backdrop-blur-2xl text-white p-5 lg:p-6 border border-[#38bdf8]/40 dark:border-[#00c6ff]/30 shadow-[0_8px_32px_rgba(0,0,0,0.37)] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setActiveScreen('profile')}
            className="flex items-center gap-4 text-left group"
          >
            <div className="rounded-full ring-2 ring-white/50 dark:ring-[#00c6ff]/70 dark:shadow-[0_0_15px_rgba(0,198,255,0.45)] shrink-0 group-hover:scale-105 transition-transform">
              <UserAvatar src={myAvatar} name={userProfile?.fullName} size="lg" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#e0f2fe] dark:text-[#38bdf8]">
                PK CHAT · Active • Zero-Trust Secured
              </p>
              <h1 className="text-xl lg:text-2xl font-bold truncate">
                {userProfile?.fullName || 'PK Member'}
              </h1>
              {userAccount?.phoneNumber && (
                <p className="text-xs font-mono font-semibold text-[#bae6fd] dark:text-[#38bdf8] flex items-center gap-1.5 mt-0.5">
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  <span>Active Number: {userAccount.phoneNumber}</span>
                </p>
              )}
              <p className="text-xs text-[#e0f2fe] dark:text-slate-300 truncate max-w-md">{myStatus}</p>
              <p className="mt-0.5 text-[11px] text-[#bae6fd] dark:text-[#38bdf8]/90">
                {userProfile?.country} · Receiving chats in{' '}
                <span className="font-semibold text-white">
                  {userProfile?.preferredLanguageName || 'English'}
                </span>{' '}
                · Tap to customize profile
              </p>
            </div>
          </button>

          <div className="flex flex-wrap gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveScreen('contacts')}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#00c6ff] to-[#0072ff] hover:brightness-110 text-white text-xs font-bold flex items-center gap-2 whitespace-nowrap shadow-[0_0_15px_rgba(0,198,255,0.4)] transition-all"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>+ Start Global Chat</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveScreen('translation_settings')}
              className="px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 dark:border-[#00c6ff]/30 text-white text-xs font-semibold whitespace-nowrap transition-colors"
            >
              Switch Language
            </button>
          </div>
        </section>

        {/* In-App Mobile Number Registration Card */}
        {userAccount && !userAccount.phoneNumber && (
          <section className="p-4 lg:p-5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Phone className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <span>Save Your Mobile Phone Number</span>
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  Enter your mobile phone number to save it securely in your PK Chat profile (no SMS OTP required). Each phone number is uniquely bound to one account.
                </p>
              </div>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setHomePhoneBusy(true);
                setHomePhoneStatus(null);
                try {
                  await linkPhoneForDiscovery(homePhoneInput, true, homePhoneDial);
                  setHomePhoneStatus('Mobile phone number saved securely to your PK Chat profile.');
                  setHomePhoneInput('');
                } catch (err) {
                  setHomePhoneStatus(
                    err instanceof Error ? err.message : 'Unable to save mobile phone number.'
                  );
                } finally {
                  setHomePhoneBusy(false);
                }
              }}
              className="flex flex-col sm:flex-row gap-2"
            >
              <select
                value={homePhoneDial}
                onChange={(e) => setHomePhoneDial(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#eef8ff]/90 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800 text-xs font-mono"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.dialCode}>
                    {c.flag} {c.dialCode}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                inputMode="tel"
                value={homePhoneInput}
                onChange={(e) => setHomePhoneInput(e.target.value)}
                placeholder="Enter mobile number (e.g. 071 786 0693)"
                className="flex-1 px-3.5 py-2 rounded-xl bg-[#eef8ff]/90 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800 text-xs font-mono"
              />
              <button
                type="submit"
                disabled={homePhoneBusy || !homePhoneInput.trim()}
                className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap"
              >
                {homePhoneBusy ? 'Saving...' : 'Save Phone Number'}
              </button>
            </form>
            {homePhoneStatus && (
              <p className="text-xs font-medium text-blue-800 dark:text-blue-200">
                {homePhoneStatus}
              </p>
            )}
          </section>
        )}

        {/* Key Overview Row */}
        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={() => setActiveScreen('chat_list')}
            className="p-5 rounded-2xl bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 text-left hover:border-[#0284c7] shadow-[0_6px_22px_rgba(2,132,199,0.1)] transition-colors"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">Active Conversations</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {directChats.length + groupChats.length}
            </p>
            <p className="mt-1 text-xs text-[#0284c7] dark:text-[#38bdf8]">
              {directChats.length} direct · {groupChats.length} groups
            </p>
          </button>

          <button
            onClick={() => setActiveScreen('contacts')}
            className="p-5 rounded-2xl bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 text-left hover:border-blue-500 shadow-[0_6px_22px_rgba(2,132,199,0.1)] transition-colors"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">Global Directory</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {directoryProfiles.length}
            </p>
            <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">
              {contacts.length} saved contacts
            </p>
          </button>

          <button
            onClick={() => setActiveScreen('disaster_alerts')}
            className="p-5 rounded-2xl bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 text-left hover:border-amber-500 shadow-[0_6px_22px_rgba(2,132,199,0.1)] transition-colors"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">Official Disaster Feed</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {disasterAlerts.length}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              USGS &amp; NOAA verified alerts
            </p>
          </button>

          <button
            onClick={() => setActiveScreen('subscription')}
            className="p-5 rounded-2xl bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 text-left hover:border-[#0284c7] shadow-[0_6px_22px_rgba(2,132,199,0.1)] transition-colors"
          >
            {(() => {
              const entitlement = getSubscriptionEntitlement({
                phoneNumber: userAccount?.phoneNumber,
                subscription,
              });
              return (
                <>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Subscription Plan</p>
                  <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white capitalize">
                    {entitlement.isVipFounder
                      ? 'VIP Founder Free'
                      : subscription?.status || 'Trialing'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {entitlement.badgeLabel}
                  </p>
                </>
              );
            })()}
          </button>
        </section>

        {/* Active SOS Notice if triggered */}
        {activeSos.length > 0 && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">
                User SOS Alert Active ({activeSos.length})
              </p>
              <p className="text-xs text-rose-700 dark:text-rose-300">
                User-generated alert shared with trusted emergency contacts. Official emergency services are not auto-dispatched.
              </p>
            </div>
            <button
              onClick={() => setActiveScreen('sos_emergency')}
              className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold whitespace-nowrap"
            >
              Manage SOS
            </button>
          </div>
        )}

        {/* Two-column Workspace Overview */}
        <section className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-[0_6px_22px_rgba(2,132,199,0.1)]">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Recent Chats &amp; Groups
              </h2>
              <button
                onClick={() => setActiveScreen('chat_list')}
                className="text-xs font-semibold text-[#0284c7] dark:text-[#38bdf8] hover:underline"
              >
                Open Chat List
              </button>
            </div>

            {directChats.length === 0 && groupChats.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No conversations yet. Start a 1-to-1 chat or a bilingual sandbox thread from Contacts.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    onClick={async () => {
                      if (!userProfile) return;
                      await startDirectChat(userProfile);
                    }}
                    className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold"
                  >
                    Open Personal Translation Sandbox Chat
                  </button>
                  <button
                    onClick={() => setActiveScreen('contacts')}
                    className="px-4 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold"
                  >
                    Browse Directory
                  </button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {directChats.slice(0, 4).map((chat) => (
                  <button
                    key={chat.chatId}
                    onClick={() => {
                      setActiveChat(chat.chatId, 'direct');
                      setActiveScreen('individual_chat');
                    }}
                    className="w-full py-3.5 flex items-center justify-between text-left hover:bg-[#dff1ff]/80 dark:hover:bg-slate-800/50 rounded-xl px-2 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {chat.title || 'Direct Chat'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-md">
                        {chat.lastMessage || 'Encrypted bilingual channel ready'}
                      </p>
                    </div>
                    <span className="text-xs text-[#0284c7] dark:text-[#38bdf8] font-medium">
                      Open
                    </span>
                  </button>
                ))}
                {groupChats.slice(0, 3).map((grp) => (
                  <button
                    key={grp.groupId}
                    onClick={() => {
                      setActiveChat(grp.groupId, 'group');
                      setActiveScreen('group_chat');
                    }}
                    className="w-full py-3.5 flex items-center justify-between text-left hover:bg-[#dff1ff]/80 dark:hover:bg-slate-800/50 rounded-xl px-2 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {grp.name} ({grp.memberIds.length} members)
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-md">
                        {grp.lastMessage || 'Multi-language group channel'}
                      </p>
                    </div>
                    <span className="text-xs text-blue-700 dark:text-blue-400 font-medium">
                      Group
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-[0_6px_22px_rgba(2,132,199,0.1)]">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Cloud Notifications &amp; Activity
            </h2>
            {notifications.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
                No pending notifications. Messages, SOS events, and billing updates appear here in real time.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-3 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 flex items-start justify-between gap-3"
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">
                        {n.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{n.body}</p>
                    </div>
                    {!n.read && (
                      <button
                        onClick={() => markNotificationRead(n.id)}
                        className="text-xs text-[#0284c7] dark:text-[#38bdf8] font-medium shrink-0"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  // Screen 9: Contacts Screen
  if (activeScreen === 'contacts') {
    const filteredDir = directoryProfiles.filter(
      (p) =>
        p.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.preferredLanguageName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <div className="p-4 lg:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              International Contacts
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Connect across countries. Messages automatically adapt to each contact&apos;s preferred language.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start">
            <button
              type="button"
              onClick={() => setQrModalTab('scan_code')}
              className="px-4 py-2.5 rounded-xl bg-[#e3f3ff]/82 dark:bg-slate-900 backdrop-blur-xl border border-[#7dd3fc]/75 dark:border-slate-700 hover:border-[#0284c7] text-[#0284c7] dark:text-[#38bdf8] text-sm font-medium flex items-center gap-2 whitespace-nowrap shadow-sm"
            >
              <QrCode className="w-4 h-4" />
              <span>Scan QR</span>
            </button>
            <button
              onClick={() => setShowAddContact(true)}
              className="px-4 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-sm font-medium flex items-center gap-2 whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Contact</span>
            </button>
          </div>
        </div>

        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, country, or language..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900 backdrop-blur-xl border border-[#7dd3fc]/75 dark:border-slate-800 text-sm"
          />
        </div>

        {/* Encrypted Phone Lookup & Consent-Based Connection */}
        <div className="bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-[0_6px_22px_rgba(2,132,199,0.1)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#0284c7]" />
                <span>Find &amp; Connect by Phone Number</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Type a phone number to check if that person is on PK CHAT (SHA-256 encrypted lookup — raw numbers stay private). Both users can accept or cancel anytime.
              </p>
            </div>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setLookupError(null);
              setRequestStatusMsg(null);
              setLookupMatch(null);
              setLookupSearched(false);
              setLookupBusy(true);
              try {
                const match = await lookupUserByPhone(lookupPhoneInput, lookupDialCode);
                setLookupMatch(match);
                setLookupSearched(true);
              } catch (err) {
                setLookupError(err instanceof Error ? err.message : 'Unable to search phone directory.');
              } finally {
                setLookupBusy(false);
              }
            }}
            className="flex flex-col sm:flex-row gap-2.5"
          >
            <select
              value={lookupDialCode}
              onChange={(e) => setLookupDialCode(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-[#eef8ff]/90 dark:bg-slate-950 border border-[#7dd3fc]/75 dark:border-slate-800 text-xs font-mono shrink-0"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.dialCode}>
                  {c.flag} {c.name} ({c.dialCode})
                </option>
              ))}
            </select>
            <input
              type="tel"
              inputMode="tel"
              value={lookupPhoneInput}
              onChange={(e) => setLookupPhoneInput(e.target.value)}
              placeholder="Type mobile number (e.g. 071 786 0693)"
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#eef8ff]/90 dark:bg-slate-950 border border-[#7dd3fc]/75 dark:border-slate-800 text-sm font-mono"
            />
            <button
              type="submit"
              disabled={lookupBusy || !lookupPhoneInput.trim()}
              className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap"
            >
              {lookupBusy ? 'Checking...' : 'Find on PK CHAT'}
            </button>
          </form>

          {lookupError && <p className="text-xs text-rose-600 dark:text-rose-400">{lookupError}</p>}
          {requestStatusMsg && <p className="text-xs text-[#0284c7] dark:text-[#38bdf8] font-medium">{requestStatusMsg}</p>}

          {lookupSearched && !lookupMatch && !lookupError && (
            <p className="text-xs text-slate-600 dark:text-slate-400 bg-[#dff1ff]/80 dark:bg-slate-950 p-3 rounded-xl border border-[#7dd3fc]/75 dark:border-slate-800">
              No discoverable PK CHAT user found for this phone number (either they have not linked a phone number yet or they cancelled phone discovery).
            </p>
          )}

          {lookupMatch && (
            <div className="p-4 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-[#bae6fd] dark:border-sky-900 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{lookupMatch.fullName}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  PK CHAT Member · {lookupMatch.country} · Speaks {lookupMatch.preferredLanguageName}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setLookupError(null);
                    try {
                      await sendContactRequest(lookupMatch);
                      setRequestStatusMsg(`Connection request sent to ${lookupMatch.fullName}. They can accept or cancel anytime.`);
                      setLookupMatch(null);
                      setLookupSearched(false);
                      setLookupPhoneInput('');
                    } catch (err) {
                      setLookupError(err instanceof Error ? err.message : 'Unable to send request.');
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold"
                >
                  Send Connection Request
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLookupMatch(null);
                    setLookupSearched(false);
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {(incomingContactRequests.some((r) => r.status === 'pending') ||
            outgoingContactRequests.some((r) => r.status === 'pending')) && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid md:grid-cols-2 gap-4">
              {incomingContactRequests
                .filter((r) => r.status === 'pending')
                .map((req) => (
                  <div
                    key={req.requestId}
                    className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Incoming Request: {req.senderName}
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">
                        {req.senderCountry} · Speaks {req.senderPreferredLanguageName}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => respondToContactRequest(req, 'accepted')}
                        className="px-3 py-1.5 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => respondToContactRequest(req, 'declined')}
                        className="px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-600 text-xs font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}

              {outgoingContactRequests
                .filter((r) => r.status === 'pending')
                .map((req) => (
                  <div
                    key={req.requestId}
                    className="p-3.5 rounded-xl bg-[#dff1ff]/82 dark:bg-slate-950 border border-[#7dd3fc]/75 dark:border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Sent to: {req.receiverName}
                      </p>
                      <p className="text-[11px] text-slate-500">Awaiting receiver approval</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => respondToContactRequest(req, 'cancelled')}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-rose-600 shrink-0"
                    >
                      Cancel Request
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Saved Contacts */}
          <div className="bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-[0_6px_22px_rgba(2,132,199,0.1)]">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              My Saved Contacts ({contacts.length})
            </h2>
            {contacts.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
                No saved contacts yet. Add someone from the global directory or click Add Contact.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {contacts.map((c) => (
                  <div key={c.id} className="py-3.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {c.displayName}{' '}
                        {c.blocked && (
                          <span className="text-xs text-rose-600 dark:text-rose-400">· Blocked</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {c.country} · Language: {c.preferredLanguageName || c.preferredLanguage}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggleBlockContact(c.id, !c.blocked)}
                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                        title={c.blocked ? 'Unblock contact' : 'Block contact'}
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => reportContact(c.id, 'Reported spam or abusive behavior')}
                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-rose-600"
                        title="Report contact"
                      >
                        <Flag className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Global PK CHAT Directory */}
          <div className="bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-[0_6px_22px_rgba(2,132,199,0.1)]">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Verified PK CHAT Members ({filteredDir.length})
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
              {filteredDir.map((member) => {
                const blockedByMe = (
                  profileMedia?.blockedUserIds ??
                  userProfile?.blockedUserIds ??
                  []
                ).includes(member.uid);
                const cachedMedia = profileMediaCache[member.uid];
                const avatarSrc = blockedByMe
                  ? ''
                  : sanitizeUserAvatarUrl(cachedMedia?.avatarDataUrl || member.avatarUrl);
                return (
                  <div key={member.uid} className="py-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar
                        src={avatarSrc}
                        name={member.fullName}
                        blocked={blockedByMe}
                        size="md"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {member.fullName}{' '}
                          {member.uid === userProfile?.uid && (
                            <span className="text-xs text-[#0284c7] dark:text-[#38bdf8]">(You)</span>
                          )}
                          {blockedByMe && (
                            <span className="text-xs text-rose-600 dark:text-rose-400"> · Blocked</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {member.country} · Speaks {member.preferredLanguageName} · {member.onlineStatus}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {member.uid !== userProfile?.uid && (
                        <button
                          type="button"
                          onClick={() =>
                            blockedByMe
                              ? unblockUserByUid(member.uid)
                              : blockUserByUid(member.uid, member.fullName)
                          }
                          className="p-1.5 rounded-lg border border-[#7dd3fc]/70 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-[#dff1ff]/80 dark:hover:bg-slate-800"
                          title={blockedByMe ? 'Unblock user' : 'Block user'}
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          addContact({
                            contactUid: member.uid,
                            displayName: member.fullName,
                            country: member.country,
                            preferredLanguage: member.preferredLanguage,
                            preferredLanguageName: member.preferredLanguageName,
                          })
                        }
                        className="px-3 py-1.5 rounded-lg bg-[#eef8ff]/75 dark:bg-transparent border border-[#7dd3fc]/75 dark:border-slate-700 text-xs font-medium hover:bg-[#dff1ff] dark:hover:bg-slate-800"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => startDirectChat(member)}
                        className="px-3 py-1.5 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-medium"
                      >
                        Chat
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Add Contact Modal */}
        {showAddContact && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="max-w-md w-full rounded-3xl bg-[#e3f3ff]/92 dark:bg-slate-900/95 backdrop-blur-2xl border border-[#7dd3fc] dark:border-slate-800 p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">Add International Contact</h3>
                <button onClick={() => setShowAddContact(false)} className="p-2">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <input
                type="text"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder="Contact full name"
                className="w-full px-4 py-2.5 rounded-xl bg-[#eef8ff]/90 dark:bg-slate-950 border border-[#7dd3fc]/75 dark:border-slate-800 text-sm"
              />
              <select
                value={newContactCountry}
                onChange={(e) => setNewContactCountry(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-[#eef8ff]/90 dark:bg-slate-950 border border-[#7dd3fc]/75 dark:border-slate-800 text-sm"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.name}>
                    {c.flag} {c.name} ({c.dialCode})
                  </option>
                ))}
              </select>
              <select
                value={newContactLang}
                onChange={(e) => setNewContactLang(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-[#eef8ff]/90 dark:bg-slate-950 border border-[#7dd3fc]/75 dark:border-slate-800 text-sm"
              >
                {LANGUAGES.filter((l) => l.supported).map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name} ({l.nativeName})
                  </option>
                ))}
              </select>
              <button
                onClick={async () => {
                  if (!newContactName.trim()) return;
                  const lang = LANGUAGES.find((l) => l.code === newContactLang) || LANGUAGES[0];
                  await addContact({
                    contactUid: `ext_${Date.now()}`,
                    displayName: newContactName.trim(),
                    country: newContactCountry,
                    preferredLanguage: lang.code,
                    preferredLanguageName: lang.name,
                  });
                  setNewContactName('');
                  setShowAddContact(false);
                }}
                className="w-full py-3 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-sm font-semibold"
              >
                Save Contact
              </button>
            </div>
          </div>
        )}
        <QrCodeModal
          open={qrModalTab !== null}
          initialTab={qrModalTab || 'scan_code'}
          onClose={() => setQrModalTab(null)}
        />
      </div>
    );
  }

  // Screen 10: Chat List Screen
  if (activeScreen === 'chat_list') {
    return (
      <div className="relative min-h-full p-4 lg:p-8 space-y-6">
        <PeaceUnityWatermark />
        <div className="relative z-10 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Chats &amp; Groups</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              All incoming messages translate automatically into {userProfile?.preferredLanguageName}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={async () => {
                if (!userProfile) return;
                setChatActionError(null);
                try {
                  await startDirectChat(userProfile);
                } catch (err) {
                  setChatActionError(
                    err instanceof Error ? err.message : 'Unable to start 1-to-1 chat.'
                  );
                }
              }}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#0284c7] to-[#0072ff] dark:from-[#00c6ff] dark:to-[#0072ff] hover:brightness-110 text-white text-xs font-semibold whitespace-nowrap shadow-xs"
            >
              + New 1-to-1 Chat
            </button>
            <button
              onClick={() => setShowNewGroup(true)}
              className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-[#38bdf8] hover:bg-slate-800 dark:hover:brightness-110 text-white dark:text-slate-950 text-xs font-semibold whitespace-nowrap"
            >
              + New Group
            </button>
          </div>
        </div>

        {/* 24h Status Stories Bar (My Status + Contact Rings) */}
        <section
          aria-label="Status Stories"
          className="stories-container rounded-[18px] bg-[#e3f3ff]/78 dark:bg-white/[0.035] backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-[#00c6ff]/20 px-4 py-3 flex items-center gap-4 overflow-x-auto shadow-[0_8px_28px_rgba(2,132,199,0.12)]"
        >
          <button
            type="button"
            onClick={() => setActiveScreen('status_updates')}
            className="flex flex-col items-center gap-1.5 min-w-[74px] shrink-0 group text-center"
          >
            <div className="relative p-[3px] rounded-full bg-gradient-to-tr from-[#00c6ff] to-[#0284c7] shadow-[0_0_12px_rgba(0,198,255,0.35)] group-hover:scale-105 transition-transform">
              <div className="rounded-full border-2 border-white dark:border-[#0b132b]">
                <UserAvatar
                  src={profileMedia?.avatarDataUrl || userProfile?.avatarUrl}
                  name={userProfile?.fullName}
                  size="md"
                />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 px-1.5 py-0.5 rounded-full bg-slate-950 text-[#38bdf8] border border-[#00c6ff]/50 text-[9px] font-bold leading-none">
                {statusGroups.myStatuses.length > 0 ? `👁️ ${totalMyStatusViews}` : '+ Add'}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[74px]">
              My Status
            </span>
          </button>

          {[...statusGroups.recentGroups, ...statusGroups.viewedGroups].map((grp) => (
            <button
              key={grp.userId}
              type="button"
              onClick={() => setActiveScreen('status_updates')}
              className="flex flex-col items-center gap-1.5 min-w-[70px] shrink-0 group text-center"
            >
              <div
                className={`p-[3px] rounded-full transition-transform group-hover:scale-105 ${
                  grp.hasUnseen
                    ? 'bg-gradient-to-tr from-[#00c6ff] to-[#0284c7] shadow-[0_0_10px_rgba(0,198,255,0.35)]'
                    : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <div className="rounded-full border-2 border-white dark:border-[#0b132b]">
                  <UserAvatar src={grp.authorAvatar} name={grp.authorName} size="md" />
                </div>
              </div>
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate max-w-[70px]">
                {grp.authorName.split(' ')[0]}
              </span>
            </button>
          ))}

          {statusGroups.recentGroups.length === 0 &&
            statusGroups.viewedGroups.length === 0 &&
            directChats.slice(0, 4).map((chat) => {
              const partner = resolveDirectChatPartner(chat);
              return (
                <button
                  key={`story-chat-${chat.chatId}`}
                  type="button"
                  onClick={() => {
                    setActiveChat(chat.chatId, 'direct');
                    setActiveScreen('individual_chat');
                  }}
                  className="flex flex-col items-center gap-1.5 min-w-[70px] shrink-0 group text-center"
                >
                  <div className="relative p-[3px] rounded-full bg-gradient-to-tr from-[#00c6ff]/60 to-[#0072ff]/60 group-hover:scale-105 transition-transform">
                    <div className="rounded-full border-2 border-white dark:border-[#0b132b]">
                      <UserAvatar
                        src={partner.avatar}
                        name={partner.name}
                        blocked={partner.blocked}
                        size="md"
                      />
                    </div>
                    {partner.isOnline && (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#38bdf8] border-2 border-white dark:border-[#0b132b]"
                      />
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate max-w-[70px]">
                    {partner.name.split(' ')[0]}
                  </span>
                </button>
              );
            })}

          <button
            type="button"
            onClick={() => setActiveScreen('status_updates')}
            className="ml-auto px-3 py-1.5 rounded-full bg-sky-50 dark:bg-[#00c6ff]/15 border border-[#bae6fd] dark:border-[#00c6ff]/35 text-[#0284c7] dark:text-[#38bdf8] text-[11px] font-semibold whitespace-nowrap shrink-0 hover:brightness-110"
          >
            Open Updates ({statuses.length}) →
          </button>
        </section>

        {/* Instant Personal SOS Contacts Banner */}
        <div
          role="region"
          aria-label="Personal SOS Contacts Alert"
          className="rounded-2xl bg-gradient-to-r from-[#0284c7] to-[#0072ff] dark:from-[#0a192f] dark:to-[#0369a1] text-white p-4 border border-[#38bdf8]/40 shadow-[0_0_20px_rgba(0,198,255,0.2)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-extrabold flex items-center gap-2">
              <span aria-hidden="true">🛡️</span>
              <span>பர்சனல் எமர்ஜென்சி தொடர்புகள் · Personal SOS Contacts</span>
            </p>
            <p className="text-xs text-[#e0f2fe]">
              உங்களது குடும்பத்தினர் மற்றும் நம்பகமான உறவினர்களுக்கு (Max 3) GPS இருப்பிடத்துடன் தகவல் அனுப்பவும்
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveScreen('sos_emergency')}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-[#e0f2fe]/95 text-[#0369a1] hover:bg-[#bae6fd] text-xs font-extrabold whitespace-nowrap shadow-sm shrink-0"
          >
            🛡️ Personal SOS Contacts
          </button>
        </div>

        {/* PK Chat Official Broadcast Card (Routes Birthday, Festival Greetings & Red Alerts into Official PK Chat Inbox) */}
        <button
          type="button"
          onClick={openOfficialInboxAndMarkRead}
          className="w-full text-left rounded-2xl bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white p-4 border border-sky-300/40 shadow-sm hover:brightness-105 transition-all space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-extrabold flex items-center gap-2">
              <span aria-hidden="true">🛡️📢</span>
              <span>PK Chat Official Broadcast · <span translate="no">Prashanth keransiya</span></span>
            </span>
            <span className="text-[11px] font-semibold text-[#e0f2fe] shrink-0">
              {unreadOfficialCount > 0 ? `${unreadOfficialCount} New · ` : ''}Open Official PK Chat ›
            </span>
          </div>
          <p className="text-xs text-[#e0f2fe]">
            பிறந்தநாள், கிறிஸ்துமஸ், புத்தாண்டு, ரமலான் வாழ்த்துகள் &amp; 100% அரசு பேரிடர் சிவப்பு எச்சரிக்கைகள் (Official Inbox):
          </p>
          <div className="rounded-xl bg-white/15 px-3 py-2 text-xs font-medium text-white leading-relaxed">
            {officialGreetingBroadcast}
          </div>
        </button>

        {/* Official Disaster Early Warning Monitor & Pre-Loaded Offline Emergency Directory */}
        <div className="grid lg:grid-cols-12 gap-3">
          <div
            className={`lg:col-span-7 rounded-2xl p-3.5 border text-xs flex flex-col justify-between gap-2 ${
              disasterAlerts.length > 0
                ? 'bg-gradient-to-br from-rose-900 to-red-800 text-white border-rose-500/70 shadow-sm'
                : 'bg-[#e0f2fe] dark:bg-[#202c33] text-[#0369a1] dark:text-[#e9edef] border-[#bae6fd] dark:border-[#222d34]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 ${
                  disasterAlerts.length > 0 ? 'text-amber-300' : 'text-[#0284c7] dark:text-[#38bdf8]'
                }`}
              />
              <span>
                {disasterAlerts.length > 0
                  ? `⚠️ Official Disaster Alert: ${disasterAlerts[0].title}`
                  : '⚠️ Disaster Early Warning System (USGS / NOAA / NASA EONET)'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveScreen('disaster_alerts')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${
                disasterAlerts.length > 0
                  ? 'bg-black/30 hover:bg-black/45 text-white'
                  : 'bg-[#0284c7] hover:bg-[#0369a1] text-white'
              }`}
            >
              Live Alerts ({disasterAlerts.length})
            </button>
          </div>
          <p
            className={`text-[11px] leading-relaxed ${
              disasterAlerts.length > 0 ? 'text-rose-100' : 'text-slate-700 dark:text-[#8696a0]'
            }`}
          >
            {disasterAlerts.length > 0
              ? `${disasterAlerts[0].officialSource} · ${disasterAlerts[0].location} (${disasterAlerts[0].severity.toUpperCase()})`
              : `Live feeds connected for ${
                  consentedLocation?.country || userProfile?.country || 'your region'
                }. No severe weather, flood, tsunami, or earthquake alerts active in current official feed.`}
          </p>
        </div>

        <div className="lg:col-span-5 rounded-2xl bg-[#e3f3ff]/78 dark:bg-white/[0.035] backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-[#00c6ff]/20 p-3.5 space-y-2 text-xs shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-[#0284c7] dark:text-[#38bdf8] flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              <span>Personal SOS Contacts (குடும்ப / உறவினர் எண்கள்)</span>
            </span>
            <button
              type="button"
              onClick={() => setActiveScreen('sos_emergency')}
              className="text-[11px] font-semibold text-[#0284c7] dark:text-[#38bdf8] hover:underline shrink-0"
            >
              Manage ({emergencyContacts.length}/3)
            </button>
          </div>
          {emergencyContacts.length === 0 ? (
            <button
              type="button"
              onClick={() => setActiveScreen('sos_emergency')}
              className="w-full px-3 py-2.5 rounded-xl bg-sky-50/80 dark:bg-[#00c6ff]/10 border border-[#bae6fd] dark:border-[#00c6ff]/25 text-left text-[11px] text-slate-700 dark:text-slate-200 hover:border-[#00c6ff] flex items-center justify-between"
            >
              <span>+ Add Family / Relative Personal SOS Contacts</span>
              <span className="font-bold text-[#0284c7] dark:text-[#38bdf8]">Setup ›</span>
            </button>
          ) : (
            <div className="space-y-1.5 text-[11px]">
              {emergencyContacts.slice(0, 3).map((ec, idx) => (
                <div
                  key={ec.id}
                  className="px-2.5 py-1.5 rounded-lg bg-[#eef8ff]/88 dark:bg-[#00c6ff]/[0.06] border border-[#7dd3fc]/75 dark:border-[#00c6ff]/20 flex items-center justify-between gap-2"
                >
                  <span className="text-slate-700 dark:text-slate-200 truncate">
                    👤 {ec.name} ({ec.relationship || 'Family'})
                  </span>
                  <span className="font-bold font-mono text-rose-600 dark:text-[#38bdf8] shrink-0">
                    {ec.phone} · P{idx + 1}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <MessengerDisasterAlerts maxVisible={2} />

      {/* Floating Viber Emoji Overlay Layer */}
      {floatingEmojis.length > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 bottom-20 h-64 z-[65] overflow-hidden"
        >
          {floatingEmojis.map((fe) => (
            <span
              key={fe.id}
              className="animate-pk-viber-float absolute bottom-2 text-3xl select-none"
              style={{ left: `${fe.leftPct}%` }}
            >
              {fe.emoji}
            </span>
          ))}
        </div>
      )}

      {/* Universal & Special Days 3D Greeting Cards Quick Bar */}
      <div className="rounded-2xl bg-[#e3f3ff]/78 dark:bg-[#202c33] backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-[#222d34] p-3.5 space-y-2.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-[#0284c7] dark:text-[#38bdf8] flex items-center gap-1.5">
            <Smile className="w-3.5 h-3.5" />
            <span>✨ Global Celebrations &amp; Special Days ({quickSendFestivalCards.length})</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTajTributeModal(true)}
              className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-neutral-900 via-rose-900 to-[#e50914] border border-amber-400/60 text-amber-300 hover:brightness-110 text-[11px] font-bold inline-flex items-center gap-1 shadow-xs"
            >
              <span>🏛️</span>
              <span>Taj Mahal Tribute</span>
            </button>
            <span className="text-[11px] text-slate-500 dark:text-[#8696a0] hidden sm:inline">
              Tap card to send &amp; animate in chat
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'all', label: `All (${FESTIVAL_3D_CARDS.length})` },
              { id: 'family', label: 'Family & Friends' },
              { id: 'milestone', label: 'Birthdays & Milestones' },
              { id: 'global', label: 'Global New Year' },
              { id: 'special', label: 'Love & Taj Mahal' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFestivalQuickFilter(tab.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                festivalQuickFilter === tab.id
                  ? 'bg-[#0284c7] text-white dark:bg-[#38bdf8] dark:text-slate-950'
                  : 'bg-[#f0f9ff] dark:bg-[#111b21] text-[#0369a1] dark:text-[#aebac1] hover:bg-[#e0f2fe] dark:hover:bg-[#2a3942]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-2 max-h-64 overflow-y-auto pr-1">
          {quickSendFestivalCards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={async () => {
                const targetChat = directChats[0] || null;
                const targetGroup = !targetChat ? groupChats[0] || null : null;
                const targetId = targetChat?.chatId || targetGroup?.groupId;
                if (!targetId) {
                  setChatActionError('Create or select a conversation below before sending a card.');
                  return;
                }
                setChatActionError(null);
                try {
                  await sendMessage({
                    chatId: targetId,
                    chatType: targetGroup ? 'group' : 'direct',
                    participantIds: targetGroup
                      ? targetGroup.memberIds
                      : targetChat?.participantIds || [userProfile?.uid || ''],
                    text: card.text,
                    messageType: 'text',
                    e2eeEnabled: Boolean(targetChat?.e2eeEnabled),
                  });
                  setChatSecurityToast(
                    `🛡️ ${card.title} encrypted & sent securely!`
                  );
                  setActiveChat(targetId, targetGroup ? 'group' : 'direct');
                  setActiveScreen(targetGroup ? 'group_chat' : 'individual_chat');
                } catch (err) {
                  setChatActionError(err instanceof Error ? err.message : 'Unable to send card.');
                }
              }}
              className="rounded-xl bg-[#eef8ff]/85 dark:bg-[#111b21] hover:bg-[#dff1ff] dark:hover:bg-[#2a3942] border border-[#7dd3fc]/75 dark:border-[#374248] py-2 px-1.5 text-center transition-colors flex flex-col items-center gap-0.5 shadow-2xs"
            >
              <span className="text-lg">{card.emoji}</span>
              <span className="text-[10px] font-bold text-[#0369a1] dark:text-yellow-300 truncate max-w-full">
                {card.shortLabel}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Viber-Style Animated Floating Emojis Tray + Auto-Reply Status */}
      <div className="rounded-2xl bg-[#e3f3ff]/78 dark:bg-[#202c33] backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-[#222d34] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div className="space-y-1.5 min-w-0">
          <p className="text-xs font-bold text-[#0369a1] dark:text-[#33b3ff] flex items-center gap-1.5">
            <span>✨</span>
            <span>Viber பாணி அனிமேஷன் எமோஜிகள் (Tap to Launch 3D Floating Emojis)</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {(['❤️', '😂', '😍', '🎉', '🔥', '👍', '🪔'] as const).map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => spawnViberEmoji(em)}
                aria-label={`Launch floating ${em} emoji`}
                className="w-9 h-9 rounded-full bg-[#f0f9ff] dark:bg-[#111b21] hover:bg-[#e0f2fe] dark:hover:bg-[#2a3942] border border-[#bae6fd] dark:border-[#374248] text-lg flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
              >
                {em}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveScreen('profile')}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              autoReplyEnabled
                ? 'bg-sky-50 dark:bg-sky-950/60 border-[#38bdf8] dark:border-sky-700 text-[#0284c7] dark:text-[#38bdf8]'
                : 'bg-[#f0f9ff] dark:bg-[#111b21] border-[#bae6fd] dark:border-[#374248] text-[#0369a1] dark:text-slate-300'
            }`}
          >
            <span>💬</span>
            <span>{autoReplyEnabled ? 'Auto-Reply: ON' : 'Setup Auto-Reply'}</span>
          </button>
        </div>
      </div>

      {chatSecurityToast && (
        <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-[#bae6fd] dark:border-sky-800 flex items-center justify-between gap-3 text-xs text-[#0369a1] dark:text-sky-200 font-medium">
          <span>{chatSecurityToast}</span>
          <button
            type="button"
            onClick={() => setChatSecurityToast(null)}
            className="font-semibold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

        {chatActionError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-200">
            <span>{chatActionError}</span>
            <button
              type="button"
              onClick={() => setChatActionError(null)}
              className="font-semibold underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Search & Enterprise Filter Tabs (All | Unread | Direct | Groups + Calls | SOS Chain) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={chatSearchInputRef}
              type="search"
              value={chatSearchQuery}
              onChange={(e) => setChatSearchQuery(e.target.value)}
              placeholder="Search chats, contacts, or groups..."
              className="w-full pl-9 pr-3.5 py-2.5 rounded-2xl bg-[#e3f3ff]/82 dark:bg-white/[0.04] backdrop-blur-xl border border-[#7dd3fc]/75 dark:border-[#00c6ff]/30 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00c6ff]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'unread', 'direct', 'groups'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setChatFilter(tab)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${
                  chatFilter === tab
                    ? 'bg-gradient-to-r from-[#0284c7] to-[#0072ff] dark:from-[#00c6ff] dark:to-[#0072ff] text-white shadow-[0_0_12px_rgba(0,198,255,0.4)]'
                    : 'bg-[#e3f3ff]/78 dark:bg-white/[0.04] backdrop-blur-lg border border-[#7dd3fc]/75 dark:border-[#00c6ff]/30 text-slate-700 dark:text-white hover:border-[#00c6ff]'
                }`}
              >
                {tab}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setActiveScreen('audio_call')}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#e3f3ff]/78 dark:bg-white/[0.04] backdrop-blur-lg border border-[#7dd3fc]/75 dark:border-[#00c6ff]/30 text-[#0284c7] dark:text-[#38bdf8] hover:border-[#00c6ff] transition-colors"
            >
              📞 Calls
            </button>
            <button
              type="button"
              onClick={() => setActiveScreen('sos_emergency')}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-500/40 text-rose-600 dark:text-rose-300 hover:brightness-110 transition-colors"
            >
              🚨 SOS Chain
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {/* Official Verified Read-Only System Broadcast Card */}
          {chatFilter !== 'groups' &&
            (chatFilter !== 'unread' || unreadOfficialCount > 0) && (
            <button
              type="button"
              onClick={openOfficialInboxAndMarkRead}
              className="w-full p-4 rounded-[18px] bg-[#e3f3ff]/80 dark:bg-white/[0.035] backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-[#00c6ff]/20 hover:border-[#0284c7] dark:hover:border-[#00e5ff]/60 dark:hover:bg-white/[0.06] flex items-center justify-between gap-3 text-left shadow-[0_6px_24px_rgba(2,132,199,0.12)] transition-all"
            >
              <div className="flex items-center gap-3.5 min-w-0 pr-2 flex-1">
                <div className="relative shrink-0">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#0284c7] to-[#0072ff] dark:from-[#00c6ff] dark:to-[#0072ff] text-white flex items-center justify-center shadow-[0_0_14px_rgba(0,198,255,0.45)] border-2 border-[#bae6fd] dark:border-white/25">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#38bdf8] border-2 border-white dark:border-slate-900"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      PK Chat Official 🛡️✓
                    </p>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 dark:bg-[#38bdf8]/10 text-[#0284c7] dark:text-[#38bdf8] border border-[#bae6fd] dark:border-[#38bdf8]/20 whitespace-nowrap">
                      {localizedRedAlerts.some((a) => a.isRedAlert)
                        ? localizedRedAlerts[0].redAlertBadge
                        : '🛡️ 100% Gov Alerts & Greetings'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 truncate flex items-center gap-1.5">
                    <span className="truncate">
                      {localizedRedAlerts.length > 0
                        ? `${localizedRedAlerts[0].redAlertBadge}: ${localizedRedAlerts[0].localizedTitle}`
                        : notifications[0]?.title
                          ? `${notifications[0].title} — ${notifications[0].body}`
                          : officialGreetings[0]?.title ||
                            '🛡️ Birthday, Christmas, New Year, Ramzan & Official Gov Alerts'}
                    </span>
                    <span className="text-[#0284c7] dark:text-[#00e5ff] font-black text-sm shrink-0 dark:drop-shadow-[0_0_8px_rgba(0,229,255,0.85)]">
                      ✓✓
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end justify-center gap-1.5 ml-2 shrink-0">
                <span className="text-[11px] font-semibold text-[#0284c7] dark:text-[#38bdf8]">
                  Now
                </span>
                {unreadOfficialCount > 0 && (
                  <span
                    aria-label={`${unreadOfficialCount} unread official alerts`}
                    className="bg-[#0284c7] dark:bg-[#38bdf8] text-white dark:text-slate-950 text-[11px] font-bold h-5 min-w-[20px] rounded-full flex items-center justify-center px-1.5 tabular-nums"
                  >
                    {unreadOfficialCount}
                  </span>
                )}
              </div>
            </button>
          )}
          {chatFilter !== 'groups' &&
            directChats
              .map((chat) => {
                const partner = resolveDirectChatPartner(chat);
                const myUid = userProfile?.uid || '';
                const unreadCount = messages.filter(
                  (m) =>
                    m.chatId === chat.chatId &&
                    !m.deleted &&
                    m.senderId !== myUid &&
                    !(m.readBy || []).includes(myUid)
                ).length;
                return { chat, partner, unreadCount };
              })
              .filter(({ chat, partner, unreadCount }) => {
                if (chatFilter === 'unread' && unreadCount === 0) return false;
                const q = chatSearchQuery.trim().toLowerCase();
                if (!q) return true;
                return (
                  partner.name.toLowerCase().includes(q) ||
                  (chat.lastMessage || '').toLowerCase().includes(q)
                );
              })
              .map(({ chat, partner, unreadCount }) => {
              const latestOutgoing =
                chat.lastSenderId === userProfile?.uid
                  ? messages
                      .filter((m) => m.chatId === chat.chatId && m.senderId === userProfile?.uid)
                      .slice(-1)[0]
                  : null;
              const latestChatMessage = messages
                .filter((m) => m.chatId === chat.chatId && !m.deleted)
                .slice(-1)[0];
              const isSensitiveLastMessage =
                Boolean(chat.lastMessage?.includes(CONSENT_BLUR_PREFIX)) ||
                Boolean(latestChatMessage?.originalText?.includes(CONSENT_BLUR_PREFIX));
              const isSafeScannedMedia =
                !isSensitiveLastMessage &&
                Boolean(latestChatMessage) &&
                (latestChatMessage.messageType === 'image' ||
                  latestChatMessage.messageType === 'video' ||
                  latestChatMessage.messageType === 'document' ||
                  latestChatMessage.messageType === 'voice');
              const previewSeen = Boolean(
                latestOutgoing?.readBy?.some((id) => id !== latestOutgoing.senderId)
              );
              return (
                <button
                  key={chat.chatId}
                  onClick={() => {
                    setActiveChat(chat.chatId, 'direct');
                    setActiveScreen('individual_chat');
                  }}
                  className="w-full p-4 rounded-[18px] bg-[#e3f3ff]/80 dark:bg-white/[0.035] backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-[#00c6ff]/20 hover:border-[#0284c7] dark:hover:border-[#00e5ff]/60 dark:hover:bg-white/[0.06] flex items-center justify-between gap-3 text-left shadow-[0_6px_24px_rgba(2,132,199,0.12)] transition-all"
                >
                  <div className="flex items-center gap-3.5 min-w-0 pr-2 flex-1">
                    <div className="relative shrink-0">
                      <UserAvatar
                        src={partner.avatar}
                        name={partner.name}
                        blocked={partner.blocked}
                        size="md"
                      />
                      {partner.isOnline && (
                        <span
                          aria-label="Online"
                          className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#38bdf8] border-2 border-white dark:border-slate-900"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {partner.name}
                        </p>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 dark:bg-[#38bdf8]/10 text-[#0284c7] dark:text-[#38bdf8] border border-[#bae6fd] dark:border-[#38bdf8]/20 whitespace-nowrap">
                          {chat.e2eeEnabled
                            ? '🔒 Encrypted'
                            : '🛡️ Zero-Trust Secured'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-300 truncate flex items-center gap-1.5">
                        {chat.lastSenderId === userProfile?.uid && (
                          <PkReadReceiptTick isSeen={previewSeen} />
                        )}
                        <span className="truncate">
                          {chat.typingUserId
                            ? 'Typing...'
                            : isSensitiveLastMessage
                              ? '⬛ Sensitive Media (Tap with Age Verification)'
                              : isSafeScannedMedia
                                ? `📷 Scanned Safe Media${chat.lastMessage ? ` · ${chat.lastMessage}` : ''}`
                                : chat.lastMessage || 'Ready for encrypted messaging'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end justify-center gap-1.5 ml-2 shrink-0">
                    {partner.presenceLabel ? (
                      <span
                        className={`text-[11px] font-semibold tabular-nums whitespace-nowrap ${
                          partner.isOnline
                            ? 'text-[#0284c7] dark:text-[#38bdf8]'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {partner.presenceLabel}
                      </span>
                    ) : Boolean(chat.updatedAt) ? (
                      <span
                        className={`text-[11px] tabular-nums ${
                          unreadCount > 0
                            ? 'text-[#0284c7] dark:text-[#38bdf8] font-semibold'
                            : 'text-slate-400 dark:text-slate-400'
                        }`}
                      >
                        {formatMsgTime(chat.updatedAt)}
                      </span>
                    ) : null}
                    {unreadCount > 0 ? (
                      <span
                        aria-label={`${unreadCount} unread messages`}
                        className="bg-[#0284c7] dark:bg-[#38bdf8] text-white dark:text-slate-950 text-[11px] font-bold h-5 min-w-[20px] rounded-full flex items-center justify-center px-1.5 tabular-nums"
                      >
                        {unreadCount}
                      </span>
                    ) : (
                      <span className="text-[11px] font-black text-[#0284c7] dark:text-[#00e5ff] dark:drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]">
                        {chat.e2eeEnabled ? '✓✓ E2EE' : '✓✓'}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}

          {chatFilter !== 'direct' &&
            groupChats
              .map((grp) => {
                const myUid = userProfile?.uid || '';
                const groupUnreadCount = messages.filter(
                  (m) =>
                    m.chatId === grp.groupId &&
                    !m.deleted &&
                    m.senderId !== myUid &&
                    !(m.readBy || []).includes(myUid)
                ).length;
                return { grp, groupUnreadCount };
              })
              .filter(({ grp, groupUnreadCount }) => {
                if (chatFilter === 'unread' && groupUnreadCount === 0) return false;
                const q = chatSearchQuery.trim().toLowerCase();
                if (!q) return true;
                return (
                  grp.name.toLowerCase().includes(q) ||
                  (grp.lastMessage || '').toLowerCase().includes(q)
                );
              })
              .map(({ grp, groupUnreadCount }) => (
              <button
                key={grp.groupId}
                onClick={() => {
                  setActiveChat(grp.groupId, 'group');
                  setActiveScreen('group_chat');
                }}
                className="w-full p-4 rounded-[18px] bg-[#e3f3ff]/80 dark:bg-white/[0.035] backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-[#00c6ff]/20 hover:border-[#0284c7] dark:hover:border-[#00e5ff]/60 dark:hover:bg-white/[0.06] flex items-center justify-between gap-3 text-left shadow-[0_6px_24px_rgba(2,132,199,0.12)] transition-all"
              >
                <div className="flex items-center gap-3.5 min-w-0 pr-2 flex-1">
                  <UserAvatar isGroup name={grp.name} size="md" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {grp.name}
                      </p>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 dark:bg-[#38bdf8]/10 text-[#0284c7] dark:text-[#38bdf8] border border-[#bae6fd] dark:border-[#38bdf8]/20 whitespace-nowrap">
                        🔒 Multi-Language E2EE
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-300 truncate">
                      {grp.memberIds.length} members · {grp.lastMessage || 'Multi-language group active'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end justify-center gap-1.5 ml-2 shrink-0">
                  <span
                    className={`text-[11px] font-semibold ${
                      groupUnreadCount > 0
                        ? 'text-[#0284c7] dark:text-[#38bdf8]'
                        : 'text-blue-700 dark:text-[#38bdf8]'
                    }`}
                  >
                    Group
                  </span>
                  {groupUnreadCount > 0 && (
                    <span
                      aria-label={`${groupUnreadCount} unread group messages`}
                      className="bg-[#0284c7] dark:bg-[#38bdf8] text-white dark:text-slate-950 text-[11px] font-bold h-5 min-w-[20px] rounded-full flex items-center justify-center px-1.5 tabular-nums"
                    >
                      {groupUnreadCount}
                    </span>
                  )}
                </div>
              </button>
              ))}

          {directChats.length === 0 && groupChats.length === 0 && (
            <div className="p-8 rounded-[18px] bg-[#e3f3ff]/78 dark:bg-slate-900/75 backdrop-blur-xl border border-[#7dd3fc]/75 dark:border-[#1e3a8a] text-center text-sm text-slate-500 dark:text-slate-400">
              No chats found. Create a new 1-to-1 chat or group above.
            </div>
          )}
        </div>

        {/* New Group Modal */}
        {showNewGroup && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="max-w-md w-full rounded-3xl bg-[#e3f3ff]/92 dark:bg-slate-900/95 backdrop-blur-2xl border border-[#7dd3fc] dark:border-slate-800 p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">Create Multi-Language Group</h3>
                <button onClick={() => setShowNewGroup(false)} className="p-2">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name (e.g. London & Colombo Team)"
                className="w-full px-4 py-2.5 rounded-xl bg-[#eef8ff]/90 dark:bg-slate-950 border border-[#7dd3fc]/75 dark:border-slate-800 text-sm"
              />
              <input
                type="text"
                value={newGroupDesc}
                onChange={(e) => setNewGroupDesc(e.target.value)}
                placeholder="Group description (optional)"
                className="w-full px-4 py-2.5 rounded-xl bg-[#eef8ff]/90 dark:bg-slate-950 border border-[#7dd3fc]/75 dark:border-slate-800 text-sm"
              />
              <div className="max-h-40 overflow-y-auto space-y-1.5 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5">
                {directoryProfiles.map((m) => (
                  <label key={m.uid} className="flex items-center gap-2 text-xs cursor-pointer py-1">
                    <input
                      type="checkbox"
                      checked={selectedGroupMembers.includes(m.uid)}
                      onChange={(e) =>
                        setSelectedGroupMembers((prev) =>
                          e.target.checked ? [...prev, m.uid] : prev.filter((id) => id !== m.uid)
                        )
                      }
                    />
                    <span>
                      {m.fullName} ({m.preferredLanguageName})
                    </span>
                  </label>
                ))}
              </div>
              <button
                onClick={async () => {
                  if (!newGroupName.trim()) return;
                  await createGroupChat({
                    name: newGroupName.trim(),
                    description: newGroupDesc,
                    memberIds: selectedGroupMembers,
                  });
                  setNewGroupName('');
                  setNewGroupDesc('');
                  setShowNewGroup(false);
                }}
                className="w-full py-3 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-sm font-semibold"
              >
                Create Group Chat
              </button>
            </div>
          </div>
        )}

        {scheduleModalNode}
        {tajTributeModalNode}

        <WazeNavigationModal
          open={wazeModalState.open}
          onClose={() => setWazeModalState({ open: false })}
          initialLat={wazeModalState.initialLat}
          initialLng={wazeModalState.initialLng}
          initialDestinationName={wazeModalState.initialDestinationName}
          initialMode={wazeModalState.initialMode}
          onShareLocationToChat={({ lat, lng, mode, label }) =>
            sendLocationToChat(mode, { lat, lng, label })
          }
        />

        {/* Official Verified System Broadcast Modal (Greetings + 100% Gov Red Alerts, Auto-Marked Read on Open) */}
        {officialInboxOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="PK Chat Official System Broadcasts"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <div className="max-w-lg w-full max-h-[85vh] flex flex-col rounded-3xl bg-[#e3f3ff]/92 dark:bg-[#111b21] backdrop-blur-2xl border border-[#7dd3fc] dark:border-[#2a3942] shadow-2xl overflow-hidden">
              <div className="px-5 py-4 bg-[#0284c7] dark:bg-[#202c33] text-white flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#33b3ff] to-[#0369a1] text-white flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold flex items-center gap-1.5 truncate">
                      <span>PK Chat Official 🛡️✓</span>
                    </h3>
                    <p className="text-[11px] text-sky-100/90 truncate">
                      Official Greetings, Gov Red Alerts ({activeCountryName}) &amp; Security Inbox
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOfficialInboxOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-white/15"
                  aria-label="Close Official System Inbox"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3 flex-1 bg-[#d6edff]/90 dark:bg-[#0b141a]">
                <div className="p-3.5 rounded-2xl bg-[#eef8ff]/88 dark:bg-[#202c33] backdrop-blur-xl border border-[#7dd3fc]/75 text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-[#0284c7] dark:text-[#33b3ff] flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      <span>Cyber Shield &amp; Verified Agency Guard Active</span>
                    </p>
                    <span className="text-[10px] font-bold text-[#0284c7] dark:text-[#38bdf8]">✓✓ Read</span>
                  </div>
                  <p className="text-slate-600 dark:text-[#e9edef]">
                    உங்கள் செய்திகள், குரல் அழைப்புகள் மற்றும் பேரிடர் அறிவிப்புகள் அனைத்தும் 100% அரசு அதிகாரப்பூர்வ சான்றுடன் பாதுகாப்புடன் உள்ளன.
                  </p>
                </div>

                {/* Localized 100% Government-Verified Red Alerts Inside Official PK Chat */}
                {localizedRedAlerts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-300 px-1">
                      100% Government Disaster &amp; Emergency Red Alerts ({activeCountryName})
                    </p>
                    {localizedRedAlerts.slice(0, 5).map((alert) => (
                      <div
                        key={`inbox_red_${alert.alertId}`}
                        className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
                          alert.isRedAlert
                            ? 'bg-gradient-to-br from-rose-700 to-red-800 text-white border-rose-400 shadow-md'
                            : 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-100'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-black/25 font-extrabold text-[10px] uppercase">
                            {alert.redAlertBadge}
                          </span>
                          <span className="text-[10px] opacity-90 font-semibold">✓✓ Seen</span>
                        </div>
                        <p className="font-bold text-sm leading-snug">{alert.localizedTitle}</p>
                        <p className="text-[11px] opacity-95">{alert.localizedAdvice}</p>
                        <p className="text-[10px] opacity-85">
                          {alert.agencyLabel} · {alert.areaLabel}
                          {typeof alert.distanceKm === 'number' ? ` (${alert.distanceKm.toFixed(0)} km)` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Birthday, Christmas, New Year, Ramzan & Official Founder Wishes Inside Official PK Chat */}
                <div className="space-y-2">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#0369a1] dark:text-[#38bdf8] px-1">
                    Official PK Chat Greetings · Birthday, Christmas, New Year &amp; Ramzan
                  </p>
                  {officialGreetings.map((g) => (
                    <div
                      key={g.id}
                      className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
                        g.activeToday
                          ? 'bg-gradient-to-br from-[#cceaff] to-[#eef8ff] dark:from-[#0a2342] dark:to-[#132238] border-[#38bdf8] shadow-sm'
                          : 'bg-[#eef8ff]/88 dark:bg-[#202c33] backdrop-blur-xl border-[#7dd3fc]/75 dark:border-[#2a3942]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-[#0284c7] dark:text-[#38bdf8]">
                          {g.badge}
                        </span>
                        <span className="text-[10px] font-bold text-[#0284c7] dark:text-[#38bdf8]">
                          ✓✓ Read
                        </span>
                      </div>
                      <p className="font-bold text-slate-900 dark:text-white">
                        {g.title}
                        {g.founderName && (
                          <>
                            {' · '}
                            <span translate="no">{g.founderName}</span>
                          </>
                        )}
                      </p>
                      <p className="text-slate-600 dark:text-[#aebac1] leading-relaxed">{g.body}</p>
                    </div>
                  ))}
                </div>

                {notifications.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
                      System &amp; Security Log
                    </p>
                    {notifications.map((n) => {
                      const isRead = n.read || getReadOfficialIds(userProfile?.uid).includes(n.id);
                      return (
                        <div
                          key={n.id}
                          className="p-3.5 rounded-2xl bg-[#eef8ff]/88 dark:bg-[#202c33] border border-[#7dd3fc]/75 dark:border-[#2a3942] text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-900 dark:text-white">{n.title}</span>
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#111b21] text-[10px] uppercase font-semibold text-slate-500">
                              {n.category}
                            </span>
                          </div>
                          <p className="text-slate-600 dark:text-[#aebac1]">{n.body}</p>
                          <span className="inline-block text-[10px] font-bold text-[#0284c7] dark:text-[#38bdf8]">
                            {isRead ? '✓✓ Read' : 'Delivered'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="px-4 py-3 bg-[#dff1ff]/90 dark:bg-[#202c33] border-t border-[#7dd3fc]/75 dark:border-[#2a3942] text-[11px] text-center text-slate-600 dark:text-[#8696a0]">
                🔒 Official Read-Only System Thread · Replies &amp; user blocking disabled · All alerts auto-marked read
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    );
  }

  // Screens 11 & 12: Individual Chat Screen & Group Chat Screen
  const isGroup = activeScreen === 'group_chat';
  const activePartner = !isGroup ? resolveDirectChatPartner(activeDirectChat) : null;
  const currentTitle = isGroup
    ? activeGroupChat?.name || 'Group Chat'
    : activePartner?.name || 'Direct Chat';

  if (!currentChatId) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Select or start a {isGroup ? 'group' : 'direct'} conversation first.
        </p>
        <button
          onClick={() => setActiveScreen('chat_list')}
          className="px-5 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-sm font-semibold"
        >
          Go to Chat List
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] lg:h-[calc(100dvh-3.5rem)] overflow-hidden">
      {/* Frosted Light-Blue Conversation List Pane */}
      <aside className="hidden lg:flex flex-col w-72 xl:w-80 shrink-0 border-r border-[#7dd3fc]/75 dark:border-slate-800 bg-[#dff1ff]/85 dark:bg-slate-900 backdrop-blur-2xl">
        <div className="px-4 py-3 border-b border-[#7dd3fc]/60 dark:border-slate-800 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-900 dark:text-white">Conversations</p>
          <button
            type="button"
            onClick={() => setActiveScreen('chat_list')}
            className="text-xs font-semibold text-[#0284c7] dark:text-[#38bdf8] hover:underline"
          >
            All Chats
          </button>
        </div>
        <div className="p-2.5 border-b border-[#7dd3fc]/50 dark:border-slate-800">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter chats..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#eef8ff]/90 dark:bg-slate-950 border border-[#7dd3fc]/75 dark:border-slate-800 text-xs"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-[#bae6fd]/60 dark:divide-slate-800">
          {directChats
            .filter((c) =>
              (c.title || 'Direct Conversation').toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map((chat) => {
              const p = resolveDirectChatPartner(chat);
              const selected = !isGroup && chat.chatId === currentChatId;
              return (
                <button
                  key={chat.chatId}
                  type="button"
                  onClick={() => {
                    setActiveChat(chat.chatId, 'direct');
                    setActiveScreen('individual_chat');
                  }}
                  className={`w-full px-3.5 py-3 flex items-center gap-3 text-left transition-colors ${
                    selected
                      ? 'bg-[#cceaff]/90 dark:bg-sky-950/50'
                      : 'hover:bg-[#eef8ff]/75 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <UserAvatar src={p.avatar} name={p.name} blocked={p.blocked} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {p.name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {chat.typingUserId ? 'Typing...' : chat.lastMessage || 'Ready to chat'}
                    </p>
                  </div>
                </button>
              );
            })}
          {groupChats
            .filter((g) => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
            .map((grp) => {
              const selected = isGroup && grp.groupId === currentChatId;
              return (
                <button
                  key={grp.groupId}
                  type="button"
                  onClick={() => {
                    setActiveChat(grp.groupId, 'group');
                    setActiveScreen('group_chat');
                  }}
                  className={`w-full px-3.5 py-3 flex items-center gap-3 text-left transition-colors ${
                    selected
                      ? 'bg-[#cceaff]/90 dark:bg-sky-950/50'
                      : 'hover:bg-[#eef8ff]/75 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <UserAvatar isGroup name={grp.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {grp.name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {grp.memberIds.length} members · {grp.lastMessage || 'Group active'}
                    </p>
                  </div>
                </button>
              );
            })}
        </div>
      </aside>

      {/* Active Conversation Thread */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Chat Room Header (Light-Blue Frosted Glass) */}
        <div className="px-3 lg:px-6 py-3 bg-[#0284c7] text-white flex items-center justify-between gap-2 shadow-sm shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setActiveScreen('chat_list')}
              className="lg:hidden min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-white/15 shrink-0"
              aria-label="Back to Chat List"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <UserAvatar
              src={activePartner?.avatar}
              name={currentTitle}
              isGroup={isGroup}
              blocked={activePartner?.blocked}
              size="sm"
              className="border-white/30"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm lg:text-base font-bold text-white truncate">
                  {currentTitle}
                </h1>
                {!isGroup && activeDirectChat?.e2eeEnabled && (
                  <span title="End-to-End Encrypted" className="inline-flex shrink-0">
                    <Lock className="w-3.5 h-3.5 text-[#e0f2fe] dark:text-[#38bdf8]" />
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <p
                  className="text-[11px] lg:text-xs text-[#e0f2fe] dark:text-sky-100 truncate"
                >
                  {isGroup
                    ? `${activeGroupChat?.memberIds.length || 1} members · Auto-translate active`
                    : `${intentionalDataOff ? 'Offline (Data Off)' : activePartner?.presenceLabel || 'Online'} · ${userProfile?.preferredLanguageName || 'English'}`}
                </p>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/15 text-[10px] font-semibold text-white shrink-0">
                  <Sun className="w-2.5 h-2.5 text-amber-200" />
                  <span>{weatherSnapshot.icon} {weatherSnapshot.tempC}°C</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isGroup && activePartner?.uid && activePartner.uid !== userProfile?.uid && (
              <button
                type="button"
                onClick={() =>
                  setBlockConfirmTarget({
                    uid: activePartner.uid,
                    name: activePartner.name,
                    currentlyBlocked: activePartner.blocked,
                  })
                }
                className={`px-2.5 py-1.5 rounded-xl text-white text-xs font-bold whitespace-nowrap flex items-center gap-1 ${
                  activePartner.blocked
                    ? 'bg-[#0284c7] hover:bg-[#0369a1]'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
                title={activePartner.blocked ? 'Unblock User' : 'Block User'}
              >
                <Ban className="w-3.5 h-3.5 shrink-0" />
                <span>{activePartner.blocked ? 'Unblock' : 'Block User'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setGlobalShowOriginal((v) => !v)}
              className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-medium whitespace-nowrap"
            >
              {globalShowOriginal ? 'Original' : 'Translated'}
            </button>
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('pkchat-open-remember', {
                    detail: {
                      category: 'message',
                      title: `Chat Reminder · ${currentTitle}`,
                      note: messageInput.trim() || '',
                      targetId: currentChatId || undefined,
                    },
                  })
                )
              }
              className="hidden sm:inline-flex min-h-[38px] items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold whitespace-nowrap"
              title="Set Remember Alert for this chat"
            >
              <BellPlus className="w-3.5 h-3.5" />
              <span>Remember</span>
            </button>
            <button
              type="button"
              onClick={() => setShowPartnerTester((v) => !v)}
              className="hidden sm:inline-flex px-2.5 py-1.5 rounded-xl bg-[#e0f2fe]/95 text-xs font-bold whitespace-nowrap hover:bg-[#bae6fd] text-[#0369a1]"
              title="Test receiving a foreign-language reply translated live"
            >
              Test Foreign Reply
            </button>
            <button
              type="button"
              onClick={async () => {
                setChatActionError(null);
                try {
                  await startCall({
                    participantIds: isGroup
                      ? activeGroupChat?.memberIds || []
                      : activeDirectChat?.participantIds || [],
                    callType: 'audio',
                    targetLanguage: userProfile?.preferredLanguage || 'en',
                    targetName: currentTitle.includes('@') ? 'PK Chat Contact' : currentTitle,
                    targetPhone: isGroup ? undefined : activePartner?.phone || undefined,
                  });
                } catch (err) {
                  setChatActionError(err instanceof Error ? err.message : 'Unable to start audio call.');
                }
              }}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-white/15 text-white"
              aria-label="Start Audio Call"
            >
              <Phone className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={async () => {
                setChatActionError(null);
                try {
                  await startCall({
                    participantIds: isGroup
                      ? activeGroupChat?.memberIds || []
                      : activeDirectChat?.participantIds || [],
                    callType: 'video',
                    targetLanguage: userProfile?.preferredLanguage || 'en',
                    targetName: currentTitle.includes('@') ? 'PK Chat Contact' : currentTitle,
                    targetPhone: isGroup ? undefined : activePartner?.phone || undefined,
                  });
                } catch (err) {
                  setChatActionError(err instanceof Error ? err.message : 'Unable to start video call.');
                }
              }}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-white/15 text-white"
              aria-label="Start Video Call"
            >
              <Video className="w-4 h-4" />
            </button>
            <div ref={chatHeaderMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setShowChatHeaderMenu((v) => !v)}
                aria-label="Chat room options"
                aria-expanded={showChatHeaderMenu}
                className="min-h-[38px] min-w-[34px] flex items-center justify-center rounded-xl hover:bg-white/15 text-white"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {showChatHeaderMenu && (
                <div
                  role="menu"
                  aria-label="Chat room options menu"
                  className="absolute right-0 mt-2 w-64 rounded-2xl bg-[#e3f3ff]/95 dark:bg-[#1f2c34] backdrop-blur-2xl border border-[#7dd3fc] dark:border-[#2a3942] shadow-2xl py-1.5 z-50 text-xs text-slate-800 dark:text-[#e9edef]"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const nextFit: WallpaperFitMode = wallpaperFit === 'contain' ? 'cover' : 'contain';
                      setWallpaperFitMode(nextFit);
                      setShowChatHeaderMenu(false);
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-[#2a3942] flex items-center justify-between gap-2 font-medium"
                  >
                    <span className="flex items-center gap-2">
                      <ImageIcon className="w-3.5 h-3.5 text-[#0284c7] dark:text-[#38bdf8]" />
                      <span>Background Photo Fit</span>
                    </span>
                    <span className="text-[10px] font-bold text-[#0284c7] dark:text-[#38bdf8]">
                      {wallpaperFit === 'contain' ? 'No Crop' : 'Cover'}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowChatHeaderMenu(false);
                      window.dispatchEvent(
                        new CustomEvent('pkchat-open-remember', {
                          detail: {
                            category: 'message',
                            title: `Chat Reminder · ${currentTitle}`,
                            note: messageInput.trim() || '',
                            targetId: currentChatId || undefined,
                          },
                        })
                      );
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-[#2a3942] flex items-center gap-2 font-medium"
                  >
                    <BellPlus className="w-3.5 h-3.5 text-[#0284c7] dark:text-[#38bdf8]" />
                    <span>Set Remember Alert</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowChatHeaderMenu(false);
                      setActiveScreen('wallpaper_gallery');
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-[#2a3942] flex items-center gap-2 font-medium"
                  >
                    <Palette className="w-3.5 h-3.5 text-amber-500" />
                    <span>Wallpaper Gallery &amp; Bubbles</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowPartnerTester((v) => !v);
                      setShowChatHeaderMenu(false);
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-[#2a3942] flex items-center gap-2 font-medium"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5 text-[#0284c7] dark:text-[#38bdf8]" />
                    <span>{showPartnerTester ? 'Hide Foreign Reply Tester' : 'Test Foreign Reply'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Inline Error Banner (Replaces native alerts & surfaces LOCKDOWN notices) */}
        {chatActionError && (
          <div className="px-4 py-2.5 bg-rose-50 dark:bg-rose-950/60 border-b border-rose-200 dark:border-rose-800 flex items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-200 shrink-0">
            <span>{chatActionError}</span>
            <button
              type="button"
              onClick={() => setChatActionError(null)}
              className="font-semibold underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {offlineOutboxCount > 0 && (
          <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 shrink-0">
            <span className="flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>{offlineOutboxCount} queued offline — will send automatically when back online.</span>
            </span>
            <button
              type="button"
              onClick={() => void flushOfflineOutbox()}
              className="font-bold underline shrink-0"
            >
              Retry Now
            </button>
          </div>
        )}

        {/* Optional Foreign-Language Incoming Reply Tester */}
        {showPartnerTester && (
          <form
            onSubmit={handleSendSimulatedPartnerMessage}
            className="px-4 py-3 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900 flex flex-wrap items-center gap-2 shrink-0"
          >
            <span className="text-xs font-semibold text-blue-800 dark:text-blue-200">
              Simulate Partner Message:
            </span>
            <select
              value={partnerLangCode}
              onChange={(e) => setPartnerLangCode(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-[#eef8ff]/90 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-blue-800 text-xs"
            >
              {LANGUAGES.filter((l) => l.supported).map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} ({l.nativeName})
                </option>
              ))}
            </select>
            <input
              type="text"
              value={partnerReplyText}
              onChange={(e) => setPartnerReplyText(e.target.value)}
              placeholder="e.g. வணக்கம்! நீங்கள் எப்படி இருக்கிறீர்கள்?"
              className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg bg-[#eef8ff]/90 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-blue-800 text-xs"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold"
            >
              Receive &amp; Translate
            </button>
            <button
              type="button"
              onClick={() => setActiveScreen('profile')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border ${
                autoReplyEnabled
                  ? 'bg-sky-100 dark:bg-sky-950/60 border-[#38bdf8] dark:border-sky-700 text-[#0284c7] dark:text-[#38bdf8]'
                  : 'bg-[#eef8ff]/90 dark:bg-slate-900 border-[#7dd3fc]/75 dark:border-blue-800 text-slate-700 dark:text-slate-300'
              }`}
              title="Configure WhatsApp Business Auto-Reply in Profile"
            >
              💬 Auto-Reply: {autoReplyEnabled ? 'ON' : 'OFF'}
            </button>
          </form>
        )}

        {/* Message Feed Stage with Fixed Non-Scrolling World-Peace Wallpaper (Uncropped object-contain) */}
        <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden bg-[#e0f2fe]/45 dark:bg-[#0b141a]">
          <div
            aria-hidden="true"
            className="pointer-events-none select-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden bg-[#e0f2fe]/45 dark:bg-[#0b141a]"
          >
            <img
              src={userSettings?.customWallpaperData || activeWallpaper.imageUrl}
              alt=""
              className={`w-full h-full transition-all duration-200 ${
                wallpaperFit === 'contain'
                  ? 'object-contain object-center opacity-40 dark:opacity-25'
                  : 'object-cover object-center opacity-30 dark:opacity-20'
              }`}
              referrerPolicy="no-referrer"
            />
          </div>
          <PeaceUnityWatermark />

          {/* Floating Viber Emoji Stage inside Active Thread */}
          {floatingEmojis.length > 0 && (
            <div
              aria-hidden="true"
              className="pointer-events-none fixed inset-x-0 bottom-20 h-64 z-[65] overflow-hidden"
            >
              {floatingEmojis.map((fe) => (
                <span
                  key={fe.id}
                  className="animate-pk-viber-float absolute bottom-2 text-3xl select-none"
                  style={{ left: `${fe.leftPct}%` }}
                >
                  {fe.emoji}
                </span>
              ))}
            </div>
          )}

          {/* Realistic HTML5 Canvas 3D Festival & Celebration Animation Overlay */}
          {chatAnimation && (
            <FestivalCanvasOverlay
              title={CHAT_ANIMATION_META[chatAnimation].title}
              subtitle={CHAT_ANIMATION_META[chatAnimation].subtitle}
              effectKind={CHAT_ANIMATION_META[chatAnimation].effectKind}
              particleSymbol={CHAT_ANIMATION_META[chatAnimation].particleSymbol}
              floaters={CHAT_ANIMATION_META[chatAnimation].floaters}
              customMessage={animatedGreetingText}
              onSameToYou={
                currentChatId
                  ? async () => {
                      const replyText = `Same to You! 🤝✨ ${CHAT_ANIMATION_META[chatAnimation].emoji}`;
                      const targetParticipantIds =
                        activeScreen === 'group_chat'
                          ? activeGroupChat?.memberIds || [userProfile?.uid || '']
                          : activeDirectChat?.participantIds || [userProfile?.uid || ''];
                      await sendMessage({
                        chatId: currentChatId,
                        chatType: activeScreen === 'group_chat' ? 'group' : 'direct',
                        participantIds: targetParticipantIds,
                        text: replyText,
                        messageType: 'text',
                        e2eeEnabled:
                          activeScreen === 'individual_chat'
                            ? Boolean(activeDirectChat?.e2eeEnabled)
                            : false,
                      });
                      setChatSecurityToast('Same to You வாழ்த்துச் செய்தி வெற்றிகரமாக அனுப்பப்பட்டது! 🤝✨');
                      if (animationTimerRef.current !== null) {
                        window.clearTimeout(animationTimerRef.current);
                        animationTimerRef.current = null;
                      }
                      setChatAnimation(null);
                      setAnimatedGreetingText(null);
                    }
                  : undefined
              }
              onClose={() => {
                if (animationTimerRef.current !== null) {
                  window.clearTimeout(animationTimerRef.current);
                  animationTimerRef.current = null;
                }
                setChatAnimation(null);
                setAnimatedGreetingText(null);
              }}
            />
          )}

          <div className="relative z-10 flex-1 overflow-y-auto p-4 lg:p-6">
            <div className="max-w-4xl mx-auto space-y-3">
            {chatSecurityToast && (
              <div className="p-2.5 rounded-xl bg-sky-50/95 dark:bg-sky-950/80 border border-[#bae6fd] dark:border-sky-700/60 flex items-center justify-between gap-3 text-xs text-[#0369a1] dark:text-sky-200 font-medium shadow-xs">
                <span>{chatSecurityToast}</span>
                <button
                  type="button"
                  onClick={() => setChatSecurityToast(null)}
                  className="font-semibold underline shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}
            {activeMessages.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[#e3f3ff]/82 dark:bg-slate-900/90 backdrop-blur-xl border border-[#7dd3fc]/75 dark:border-slate-800 text-center text-sm text-slate-600 dark:text-slate-400">
                Send a message, photo, or document below to start chatting. All messages translate automatically.
              </div>
            ) : (
              activeMessages.map((msg) => {
                const isMine =
                  msg.senderId === userProfile?.uid && !msg.senderName.includes('Cross-Language Partner');
                const myTargetLang = userProfile?.preferredLanguage || 'en';
                const translatedObj = translations.find(
                  (t) => t.messageId === msg.messageId && t.targetLanguage === myTargetLang
                );
                const showOrig = showOriginalMap[msg.messageId] ?? globalShowOriginal;
                const decryptedText = decryptedCache[msg.messageId];
                const rawOriginal = decryptedText || msg.originalText;
                const consentMeta = parseConsentProtectedMedia(rawOriginal);
                const baseOriginal = consentMeta.cleanText;
                const isConsentMediaRevealed =
                  !consentMeta.isProtected || revealedConsentMediaIds.includes(msg.messageId);
                const minorSafetyLocked =
                  typeof window !== 'undefined' &&
                  window.localStorage.getItem('pk_minor_safety_mode') === 'true';
                const displayedText = showOrig
                  ? baseOriginal
                  : parseConsentProtectedMedia(translatedObj?.translatedText || '').cleanText ||
                    baseOriginal;
                const docBadge =
                  msg.messageType === 'document'
                    ? getDocExtensionBadge(msg.mediaName, msg.mediaMimeType)
                    : null;

                return (
                  <div
                    key={msg.messageId}
                    className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      onPointerDown={() => {
                        if (!isMine || msg.deleted) return;
                        if (longPressTimerRef.current !== null) {
                          window.clearTimeout(longPressTimerRef.current);
                        }
                        longPressTimerRef.current = window.setTimeout(() => {
                          setLongPressMsgId(msg.messageId);
                        }, 550);
                      }}
                      onPointerUp={() => {
                        if (longPressTimerRef.current !== null) {
                          window.clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = null;
                        }
                      }}
                      onPointerCancel={() => {
                        if (longPressTimerRef.current !== null) {
                          window.clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = null;
                        }
                      }}
                      className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-3 shadow-sm ${
                        isMine
                          ? activeBubbleStyle
                          : 'bg-[#e6f4ff]/88 dark:bg-slate-900 backdrop-blur-xl border border-[#7dd3fc]/75 dark:border-slate-800 text-slate-900 dark:text-white'
                      } ${longPressMsgId === msg.messageId ? 'ring-2 ring-rose-500' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-4 text-[11px] opacity-80 mb-1">
                        <span className="font-semibold">{msg.senderName}</span>
                        <span>
                          {msg.senderLanguage.toUpperCase()} → {myTargetLang.toUpperCase()}
                        </span>
                      </div>

                      {msg.replyToText && (
                        <div className="mb-2 p-2 rounded-lg bg-black/10 dark:bg-white/10 text-xs opacity-90 truncate">
                          Replying to: {msg.replyToText}
                        </div>
                      )}

                      {msg.forwardedFrom && (
                        <p className="text-[11px] italic opacity-75 mb-1">
                          Forwarded from {msg.forwardedFrom}
                        </p>
                      )}

                      {msg.mediaPreviewData && msg.messageType === 'image' && (
                        <div className="mb-2 group relative rounded-xl overflow-hidden bg-black/20">
                          {consentMeta.isProtected && !isConsentMediaRevealed ? (
                            <div className="relative overflow-hidden rounded-xl">
                              <img
                                src={msg.mediaPreviewData}
                                alt="Protected media hidden until consent"
                                className="rounded-xl max-h-64 w-full object-cover blur-2xl scale-110 brightness-50 pointer-events-none select-none"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center text-center p-4 gap-2">
                                <EyeOff className="w-6 h-6 text-[#33b3ff]" />
                                <p className="text-xs font-bold text-white">
                                  🔞 Consent-Protected Media (தனியுரிமைப் பாதுகாப்பு)
                                </p>
                                <p className="text-[11px] text-slate-300">
                                  {minorSafetyLocked
                                    ? 'Restricted in Minor Safety Mode (<18)'
                                    : 'Blurred until mutual consent is granted.'}
                                </p>
                                {!minorSafetyLocked && (
                                  <button
                                    type="button"
                                    onClick={() => setConsentPromptMsg(msg)}
                                    className="px-3 py-1.5 rounded-lg bg-[#33b3ff] hover:bg-sky-400 text-slate-950 text-[11px] font-bold flex items-center gap-1"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Tap to Grant Consent &amp; View</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setLightboxImage({
                                    src: msg.mediaPreviewData!,
                                    name: msg.mediaName || 'pk-chat-photo.jpg',
                                  })
                                }
                                className="block w-full text-left cursor-zoom-in"
                              >
                                <img
                                  src={msg.mediaPreviewData}
                                  alt={msg.mediaName || 'Photo attachment'}
                                  className="rounded-xl max-h-64 w-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              </button>
                              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLightboxImage({
                                      src: msg.mediaPreviewData!,
                                      name: msg.mediaName || 'pk-chat-photo.jpg',
                                    })
                                  }
                                  className="inline-flex items-center gap-1 opacity-90 hover:underline"
                                >
                                  <ZoomIn className="w-3.5 h-3.5" />
                                  <span>View Full Photo</span>
                                </button>
                                <div className="flex items-center gap-2">
                                  {consentMeta.isProtected && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setRevealedConsentMediaIds((prev) =>
                                          prev.filter((id) => id !== msg.messageId)
                                        )
                                      }
                                      className="inline-flex items-center gap-1 text-amber-300 hover:underline font-semibold"
                                    >
                                      <EyeOff className="w-3.5 h-3.5" />
                                      <span>Re-Hide</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSharePhotoResult(null);
                                      setShareSelectedUids([]);
                                        setSharePhotoTarget({
                                          src: msg.mediaPreviewData!,
                                          name: msg.mediaName || 'pk-chat-photo.jpg',
                                          caption: displayedText || undefined,
                                        });
                                    }}
                                    className="inline-flex items-center gap-1 opacity-95 hover:underline font-semibold text-[#0284c7] dark:text-[#38bdf8]"
                                  >
                                    <Share2 className="w-3.5 h-3.5" />
                                    <span>Share 100+</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      triggerMediaDownload(
                                        msg.mediaPreviewData!,
                                        msg.mediaName || 'pk-chat-photo.jpg'
                                      )
                                    }
                                    className="inline-flex items-center gap-1 opacity-90 hover:underline font-semibold"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Download</span>
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {msg.messageType === 'document' && (
                        <div className="mb-2 p-3 rounded-xl bg-black/10 dark:bg-white/10 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold tracking-wider shrink-0 ${
                                docBadge?.colorClass || 'bg-slate-700 text-white'
                              }`}
                            >
                              {docBadge?.ext || 'FILE'}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">
                                {msg.mediaName || 'Document'}
                              </p>
                              <p className="text-[10px] opacity-80 truncate">
                                {msg.mediaPreviewData ? 'Ready to download' : 'Document attachment'}
                              </p>
                            </div>
                          </div>
                          {msg.mediaPreviewData && (
                            <button
                              type="button"
                              onClick={() =>
                                triggerMediaDownload(
                                  msg.mediaPreviewData!,
                                  msg.mediaName || 'pk-chat-document'
                                )
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-[#e0f2fe]/95 text-[#0369a1] hover:bg-[#bae6fd] border border-[#7dd3fc] text-[11px] font-semibold inline-flex items-center gap-1 shrink-0"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download</span>
                            </button>
                          )}
                        </div>
                      )}

                      {msg.messageType === 'video' && (
                        <div className="mb-2 space-y-1.5">
                          {consentMeta.isProtected && !isConsentMediaRevealed ? (
                            <div className="p-4 rounded-xl bg-slate-950/90 border border-[#33b3ff]/40 text-center space-y-2">
                              <EyeOff className="w-6 h-6 text-[#33b3ff] mx-auto" />
                              <p className="text-xs font-bold text-white">
                                🔞 Consent-Protected Video Clip
                              </p>
                              <p className="text-[11px] text-slate-300">
                                {minorSafetyLocked
                                  ? 'Restricted in Minor Safety Mode (<18)'
                                  : 'Video playback is locked until mutual consent is confirmed.'}
                              </p>
                              {!minorSafetyLocked && (
                                <button
                                  type="button"
                                  onClick={() => setConsentPromptMsg(msg)}
                                  className="px-3 py-1.5 rounded-lg bg-[#33b3ff] hover:bg-sky-400 text-slate-950 text-[11px] font-bold inline-flex items-center gap-1"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Grant Consent &amp; Play</span>
                                </button>
                              )}
                            </div>
                          ) : (
                            <>
                              {msg.mediaPreviewData && isSafeMediaUrl(msg.mediaPreviewData) ? (
                                <video
                                  src={msg.mediaPreviewData}
                                  controls
                                  playsInline
                                  preload="metadata"
                                  className="rounded-xl max-h-64 w-full bg-black"
                                />
                              ) : (
                                <div className="p-2.5 rounded-xl bg-black/10 dark:bg-white/10 flex items-center gap-2 text-xs font-medium">
                                  <Film className="w-4 h-4 shrink-0" />
                                  <span className="truncate">{msg.mediaName || 'Video clip'}</span>
                                </div>
                              )}
                              {msg.mediaPreviewData && (
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="truncate opacity-80">{msg.mediaName || 'Video clip'}</span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {consentMeta.isProtected && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setRevealedConsentMediaIds((prev) =>
                                            prev.filter((id) => id !== msg.messageId)
                                          )
                                        }
                                        className="inline-flex items-center gap-1 text-amber-300 hover:underline font-semibold"
                                      >
                                        <EyeOff className="w-3.5 h-3.5" />
                                        <span>Re-Hide</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        triggerMediaDownload(
                                          msg.mediaPreviewData!,
                                          msg.mediaName || 'pk-chat-video.mp4'
                                        )
                                      }
                                      className="inline-flex items-center gap-1 hover:underline font-semibold"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      <span>Download</span>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {msg.messageType === 'voice' && msg.mediaPreviewData && (
                        <div className="mb-2">
                          <audio
                            src={msg.mediaPreviewData}
                            controls
                            className="w-full max-w-[260px] h-9"
                          />
                        </div>
                      )}

                      {(() => {
                        const locPayload = !msg.deleted ? parsePkLocationPayload(baseOriginal) : null;
                        if (locPayload) {
                          return (
                            <div className="p-3 rounded-xl bg-[#0b141a] text-white border border-[#38bdf8]/60 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold flex items-center gap-1.5 text-[#38bdf8]">
                                  {locPayload.mode === 'live_8h' ? (
                                    <Radio className="w-4 h-4 shrink-0" />
                                  ) : (
                                    <MapPin className="w-4 h-4 shrink-0" />
                                  )}
                                  <span>
                                    {locPayload.mode === 'live_8h'
                                      ? 'Live Location · Route Tracking (8h)'
                                      : 'Current GPS Location Pin'}
                                  </span>
                                </span>
                              </div>
                              <p className="text-xs text-slate-200">{locPayload.label}</p>
                              <p className="text-[11px] font-mono text-[#8696a0] tabular-nums">
                                Lat {locPayload.lat.toFixed(5)} · Lng {locPayload.lng.toFixed(5)}
                              </p>
                              <div className="flex flex-wrap gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setWazeModalState({
                                      open: true,
                                      initialLat: locPayload.lat,
                                      initialLng: locPayload.lng,
                                      initialDestinationName: locPayload.label,
                                      initialMode: locPayload.mode,
                                    })
                                  }
                                  className="px-3 py-1.5 rounded-lg bg-[#0084ff] hover:bg-blue-600 text-white text-[11px] font-bold inline-flex items-center gap-1.5"
                                >
                                  <Navigation className="w-3.5 h-3.5" />
                                  <span>Open Route &amp; Turn-by-Turn</span>
                                </button>
                                <a
                                  href={`https://www.openstreetmap.org/?mlat=${locPayload.lat}&mlon=${locPayload.lng}#map=16/${locPayload.lat}/${locPayload.lng}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2.5 py-1.5 rounded-lg bg-[#202c33] hover:bg-[#2a3942] text-sky-300 text-[11px] font-semibold"
                                >
                                  View Map Pin
                                </a>
                              </div>
                            </div>
                          );
                        }
                        const detectedFestival = !msg.deleted
                          ? detectChatKeywordAnimation(baseOriginal)
                          : null;
                        if (detectedFestival) {
                          const festivalMeta = CHAT_ANIMATION_META[detectedFestival];
                          const alreadyOpened = openedGreetingIds.includes(msg.messageId);
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                markGreetingOpened(msg.messageId);
                                triggerAnimationEffect(baseOriginal, detectedFestival, true);
                              }}
                              className="w-full text-left rounded-2xl bg-[#00c6ff]/10 hover:bg-[#00c6ff]/15 border border-[#00c6ff]/40 p-3.5 backdrop-blur-xl transition-transform hover:scale-[1.01] cursor-pointer space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-bold text-[#0284c7] dark:text-[#38bdf8]">
                                  {festivalMeta.title}
                                </p>
                                <Smile className="w-4 h-4 shrink-0 text-[#0284c7] dark:text-[#38bdf8]" />
                              </div>
                              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                                {displayedText}
                              </p>
                              <p className="text-[11px] font-semibold italic text-[#0284c7] dark:text-[#38bdf8] pt-0.5">
                                {alreadyOpened
                                  ? '✓✓ Viewed · 👆 மீண்டும் பார்க்க தொடுங்கள் (Replay 3D Animation)'
                                  : '👆 திறக்க இதைத் தொடுங்கள் (Tap to View Animation)'}
                              </p>
                            </button>
                          );
                        }
                        return (
                          <p className={`text-sm leading-relaxed ${msg.deleted ? 'italic opacity-70' : ''}`}>
                            {displayedText}
                          </p>
                        );
                      })()}

                      {!msg.deleted && translatedObj && (
                        <div className="mt-2 pt-1.5 border-t border-black/10 dark:border-white/15 flex flex-wrap items-center justify-between gap-3 text-[11px]">
                          <button
                            type="button"
                            onClick={() =>
                              setShowOriginalMap((prev) => ({
                                ...prev,
                                [msg.messageId]: !showOrig,
                              }))
                            }
                            className="underline opacity-90 hover:opacity-100"
                          >
                            {showOrig ? 'Show Translated' : 'Show Original'}
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handlePlayTranslatedTts(displayedText, msg.messageId)}
                              className="hover:underline font-medium"
                            >
                              {playingMsgId === msg.messageId
                                ? 'Playing...'
                                : msg.messageType === 'voice'
                                  ? 'Replay Voice'
                                  : 'Listen'}
                            </button>
                            {msg.e2eeEnabled && msg.encryptedPayload && !decryptedText && (
                              <button
                                type="button"
                                onClick={() => handleDecryptMessage(msg)}
                                className="hover:underline flex items-center gap-1"
                              >
                                <Shield className="w-3 h-3" />
                                <span>Decrypt</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px] opacity-80 tabular-nums">
                        {!msg.deleted && typeof msg.burnAfterSeconds === 'number' && msg.burnAfterSeconds > 0 && (
                          <span
                            className="inline-flex items-center gap-0.5 font-semibold text-amber-200 dark:text-amber-300"
                            title="Auto-shredding burn timer active"
                          >
                            <Flame className="w-3 h-3" />
                            <span>
                              {msg.burnAfterSeconds >= 3600
                                ? `${Math.round(msg.burnAfterSeconds / 3600)}h`
                                : msg.burnAfterSeconds >= 60
                                  ? `${Math.round(msg.burnAfterSeconds / 60)}m`
                                  : `${msg.burnAfterSeconds}s`}
                            </span>
                          </span>
                        )}
                        <span>{formatMsgTime(msg.createdAt)}</span>
                        {isMine && (
                          msg.pendingOfflineSync ? (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] text-amber-200 font-semibold"
                              title="Queued offline — sends automatically when online"
                            >
                              <Clock className="w-3 h-3" />
                              <span>Queued</span>
                            </span>
                          ) : (
                            <PkReadReceiptTick
                              isSeen={Boolean(
                                msg.readBy && msg.readBy.some((id) => id !== msg.senderId)
                              )}
                            />
                          )
                        )}
                      </div>
                    </div>

                    {/* Long-Press Unsend Prompt & Quick Message Actions */}
                    {!msg.deleted && longPressMsgId === msg.messageId && isMine && (
                      <div className="mt-1.5 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-700 flex items-center gap-2 text-xs">
                        <span className="font-semibold text-rose-800 dark:text-rose-200">
                          Unsend message?
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteMessage(msg.messageId);
                            setLongPressMsgId(null);
                            setChatSecurityToast('🗑️ Message deleted for everyone!');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold"
                        >
                          Delete for Everyone
                        </button>
                        <button
                          type="button"
                          onClick={() => setLongPressMsgId(null)}
                          className="px-2 py-1 rounded-lg text-slate-600 dark:text-slate-300 font-semibold"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* Quick message actions */}
                    {!msg.deleted && (
                      <div className="mt-1 flex items-center gap-2 px-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <button
                          onClick={() => setReplyTarget(msg)}
                          className="hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
                        >
                          <Reply className="w-3 h-3" /> Reply
                        </button>
                        <button
                          onClick={() => setForwardMsg(msg)}
                          className="hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
                        >
                          <Forward className="w-3 h-3" /> Forward
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            window.dispatchEvent(
                              new CustomEvent('pkchat-open-remember', {
                                detail: {
                                  category: 'message',
                                  title: `Reply to ${msg.senderId === userProfile?.uid ? 'My Note' : currentTitle}`,
                                  note: displayedText.slice(0, 140),
                                  targetId: currentChatId || undefined,
                                },
                              })
                            )
                          }
                          className="hover:text-[#0284c7] dark:hover:text-[#38bdf8] flex items-center gap-1"
                        >
                          <BellPlus className="w-3 h-3" /> Remember
                        </button>
                        {msg.senderId === userProfile?.uid && (
                          <button
                            onClick={async () => {
                              await deleteMessage(msg.messageId);
                              setLongPressMsgId(null);
                              setChatSecurityToast('🗑️ Message deleted for everyone!');
                            }}
                            className="hover:text-rose-600 flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {/* Composer + WhatsApp-Style Attachment Tray & Media Preview */}
        <div className="bg-[#dff1ff]/88 dark:bg-slate-900 backdrop-blur-2xl border-t border-[#7dd3fc]/75 dark:border-slate-800 p-3 lg:px-6 shrink-0">
          {recording && (
            <div className="max-w-4xl mx-auto mb-2.5 p-3 rounded-2xl bg-gradient-to-r from-[#1d4ed8] via-[#2563eb] to-[#38bdf8] border border-sky-300/60 shadow-[0_6px_22px_rgba(37,99,235,0.3)] flex flex-wrap items-center justify-between gap-3 text-xs text-white">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={handleCancelActiveRecording}
                  className="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white/90 shrink-0"
                  title="Delete recording"
                  aria-label="Delete recording"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold font-mono tabular-nums text-white">
                      {String(Math.floor(recordElapsedSec / 60)).padStart(2, '0')}:
                      {String(recordElapsedSec % 60).padStart(2, '0')}
                    </span>
                    {recordLocked && (
                      <span className="text-[11px] font-semibold text-sky-100">
                        🔒 Hands-Free Locked
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1 h-7" aria-hidden="true">
                    {Array.from({ length: 15 }).map((_, idx) => (
                      <span
                        key={idx}
                        className="w-[3px] rounded-full bg-white/95 transition-all duration-300"
                        style={{
                          height: `${
                            (idx + recordElapsedSec) % 3 === 0
                              ? 26
                              : (idx + recordElapsedSec) % 2 === 0
                              ? 16
                              : 9
                          }px`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setRecordLocked((v) => !v)}
                  className={`min-h-[36px] px-3 py-1 rounded-xl border text-xs font-semibold flex items-center gap-1 ${
                    recordLocked
                      ? 'bg-[#1e3a8a] border-white/40 text-white'
                      : 'bg-white/15 hover:bg-white/25 border-white/30 text-white'
                  }`}
                >
                  {recordLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  <span>{recordLocked ? 'Locked' : 'Lock Rec'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleVoiceRecord}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-full bg-[#1e40af] hover:bg-[#1e3a8a] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Preview Voice</span>
                </button>
              </div>
            </div>
          )}

          {pendingVoiceNote && !recording && (
            <div className="max-w-4xl mx-auto mb-2.5 p-3 rounded-2xl bg-gradient-to-r from-[#1d4ed8] via-[#2563eb] to-[#38bdf8] border border-sky-300/60 shadow-[0_6px_22px_rgba(37,99,235,0.28)] flex flex-wrap items-center justify-between gap-2.5 text-xs text-white">
              <audio
                ref={voicePreviewAudioRef}
                src={pendingVoiceNote.url}
                onEnded={() => setVoicePreviewPlaying(false)}
                onPause={() => setVoicePreviewPlaying(false)}
                onPlay={() => setVoicePreviewPlaying(true)}
                className="hidden"
              />
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <button
                  type="button"
                  disabled={voiceBusy}
                  onClick={handleDiscardPendingVoiceNote}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white shrink-0"
                  title="Delete Voice Note"
                  aria-label="Delete Voice Note"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  disabled={voiceBusy}
                  onClick={handleToggleVoicePreviewPlay}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-full bg-[#1e40af] hover:bg-[#1e3a8a] text-white shrink-0 shadow-xs"
                  title={voicePreviewPlaying ? 'Pause Voice Preview' : 'Play Voice Preview'}
                  aria-label={voicePreviewPlaying ? 'Pause Voice Preview' : 'Play Voice Preview'}
                >
                  {voicePreviewPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                <div className="flex-1 min-w-[120px] flex flex-col justify-center">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-sky-50 mb-0.5">
                    <span>Voice Preview</span>
                    <span className="font-mono tabular-nums">{pendingVoiceNote.durationSec}s</span>
                  </div>
                  <div className="flex items-center justify-between gap-1 h-7" aria-hidden="true">
                    {Array.from({ length: 15 }).map((_, idx) => (
                      <span
                        key={idx}
                        className={`w-[3px] rounded-full bg-white transition-all ${
                          voicePreviewPlaying ? 'opacity-100' : 'opacity-85'
                        }`}
                        style={{
                          height: `${
                            voicePreviewPlaying
                              ? idx % 2 === 0
                                ? 26
                                : 11
                              : idx % 3 === 0
                              ? 24
                              : idx % 2 === 0
                              ? 16
                              : 9
                          }px`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={voiceBusy}
                  onClick={handleCycleVoicePlaybackSpeed}
                  className="min-h-[38px] px-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold font-mono text-xs"
                  title="Toggle Playback Speed"
                >
                  {voicePlaybackSpeed}x
                </button>
                <button
                  type="button"
                  disabled={voiceBusy}
                  onClick={handleDownloadPendingVoiceNote}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white"
                  title="Download Voice Note"
                  aria-label="Download Voice Note"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={voiceBusy}
                  onClick={handleSendPendingVoiceNote}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-full bg-[#1e40af] hover:bg-[#1e3a8a] disabled:opacity-60 text-white font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{voiceBusy ? 'Sending...' : 'Send'}</span>
                </button>
              </div>
            </div>
          )}

          {replyTarget && (
            <div className="mb-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-between text-xs">
              <span className="truncate">Replying to: {replyTarget.originalText}</span>
              <button type="button" onClick={() => setReplyTarget(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {mediaUploadProgress && (
            <div className="mb-2.5 p-3 rounded-2xl bg-sky-50/90 dark:bg-sky-950/50 border border-[#7dd3fc] dark:border-sky-800 space-y-2 shadow-xs">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 dark:text-white truncate">
                    {mediaUploadProgress.phase === 'scanning'
                      ? `Cyber Shield scanning: ${mediaUploadProgress.fileName}`
                      : mediaUploadProgress.phase === 'metadata'
                        ? `Validating video duration (max 4 hours): ${mediaUploadProgress.fileName}`
                        : `Uploading large media: ${mediaUploadProgress.fileName}`}
                  </p>
                  <p className="text-[11px] text-[#0284c7] dark:text-[#38bdf8] font-medium tabular-nums">
                    {mediaUploadProgress.phase === 'uploading'
                      ? `${mediaUploadProgress.pct}% · ${formatFileSize(mediaUploadProgress.loadedBytes)} / ${formatFileSize(mediaUploadProgress.totalBytes)}`
                      : `Total size: ${formatFileSize(mediaUploadProgress.totalBytes)} · Zero-crash stream check`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCancelMediaUpload}
                  className="px-2.5 py-1.5 rounded-xl bg-[#eef8ff]/90 dark:bg-slate-900 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-[11px] font-bold hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0"
                >
                  Cancel Upload
                </button>
              </div>
              <div className="w-full h-2 rounded-full bg-sky-200/80 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0284c7] to-[#38bdf8] transition-all duration-200"
                  style={{ width: `${Math.max(4, mediaUploadProgress.pct)}%` }}
                />
              </div>
            </div>
          )}

          {pendingAttachment && (
            <div className="mb-2.5 p-2.5 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-[#bae6fd] dark:border-sky-900 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {pendingAttachment.messageType === 'image' && pendingAttachment.mediaPreviewData ? (
                    <img
                      src={pendingAttachment.mediaPreviewData}
                      alt={pendingAttachment.mediaName}
                      className={`w-14 h-14 rounded-xl object-cover border border-[#7dd3fc] dark:border-sky-800 shrink-0 ${
                        pendingAttachment.requireConsentBlur ? 'blur-md' : ''
                      }`}
                    />
                  ) : pendingAttachment.messageType === 'video' && pendingAttachment.mediaPreviewData ? (
                    <video
                      src={pendingAttachment.mediaPreviewData}
                      muted
                      playsInline
                      preload="metadata"
                      className={`w-14 h-14 rounded-xl object-cover border border-[#7dd3fc] dark:border-sky-800 shrink-0 bg-black ${
                        pendingAttachment.requireConsentBlur ? 'blur-md' : ''
                      }`}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-[#0284c7] text-white flex items-center justify-center shrink-0">
                      {pendingAttachment.messageType === 'video' ? (
                        <Film className="w-5 h-5" />
                      ) : (
                        <FileText className="w-5 h-5" />
                      )}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {pendingAttachment.mediaName}
                    </p>
                    <p className="text-[11px] text-[#0284c7] dark:text-[#38bdf8]">
                      {pendingAttachment.messageType === 'image'
                        ? 'Compressed & ready · Add optional caption below and tap Send'
                        : pendingAttachment.messageType === 'video'
                        ? `${pendingAttachment.sizeLabel} · Video ready · Add optional caption below and tap Send`
                        : `${pendingAttachment.sizeLabel} · Ready to send`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {pendingAttachment.messageType === 'image' && pendingAttachment.mediaPreviewData && (
                    <button
                      type="button"
                      onClick={() => {
                        setSharePhotoResult(null);
                        setShareSelectedUids([]);
                        setSharePhotoTarget({
                          src: pendingAttachment.mediaPreviewData!,
                          name: pendingAttachment.mediaName,
                          caption: messageInput.trim() || undefined,
                        });
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-[11px] font-bold flex items-center gap-1"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Send to Many (100+)</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingAttachment(null)}
                    className="p-1.5 rounded-lg hover:bg-black/10 text-slate-600 dark:text-slate-300 shrink-0"
                    aria-label="Remove attachment"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {(pendingAttachment.messageType === 'image' || pendingAttachment.messageType === 'video') && (
                <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer pt-1 border-t border-[#bae6fd]/70 dark:border-sky-900">
                  <input
                    type="checkbox"
                    checked={Boolean(pendingAttachment.requireConsentBlur)}
                    onChange={(e) =>
                      setPendingAttachment((prev) =>
                        prev ? { ...prev, requireConsentBlur: e.target.checked } : prev
                      )
                    }
                    className="rounded text-[#33b3ff]"
                  />
                  <span>
                    🔒 Blur Media &amp; Require Mutual Consent to View (செக்ஸுவல் / தனியுரிமைப் பாதுகாப்பு)
                  </span>
                </label>
              )}
            </div>
          )}

          {showAttachMenu && (
            <div className="mb-2.5 p-3 rounded-2xl bg-[#dff1ff]/88 dark:bg-[#233138] backdrop-blur-xl border border-[#7dd3fc]/75 dark:border-[#374248] grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <button
                type="button"
                onClick={() => sendLocationToChat('current')}
                className="p-2.5 rounded-xl bg-[#eef8ff]/90 dark:bg-[#111b21] border border-[#7dd3fc]/75 dark:border-[#2a3942] hover:border-[#0284c7] flex items-center gap-2 font-semibold text-slate-800 dark:text-[#e9edef]"
              >
                <MapPin className="w-4 h-4 text-[#0284c7] dark:text-[#38bdf8] shrink-0" />
                <span>Location (லொகேஷன்)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  pendingConsentPresetRef.current = true;
                  photoInputRef.current?.click();
                }}
                className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 hover:border-rose-500 flex items-center gap-2 font-semibold text-rose-800 dark:text-rose-200"
              >
                <EyeOff className="w-4 h-4 text-rose-600 shrink-0" />
                <span>🔞 Sensitive Media (Blur &amp; Consent)</span>
              </button>
              <button
                type="button"
                onClick={() => sendLocationToChat('live_8h')}
                className="p-2.5 rounded-xl bg-[#eef8ff]/90 dark:bg-[#111b21] border border-[#7dd3fc]/75 dark:border-[#2a3942] hover:border-[#0284c7] flex items-center gap-2 font-semibold text-slate-800 dark:text-[#e9edef]"
              >
                <Radio className="w-4 h-4 text-rose-500 shrink-0" />
                <span>Live Location (8h Route)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  pendingConsentPresetRef.current = false;
                  photoInputRef.current?.click();
                }}
                className="p-2.5 rounded-xl bg-[#eef8ff]/90 dark:bg-[#111b21] border border-[#7dd3fc]/75 dark:border-[#2a3942] hover:border-[#0284c7] flex items-center gap-2 font-semibold text-slate-800 dark:text-[#e9edef]"
              >
                <ImageIcon className="w-4 h-4 text-[#0284c7] dark:text-[#38bdf8] shrink-0" />
                <span>Gallery / Photos</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  pendingConsentPresetRef.current = false;
                  cameraInputRef.current?.click();
                }}
                className="p-2.5 rounded-xl bg-[#eef8ff]/90 dark:bg-[#111b21] border border-[#7dd3fc]/75 dark:border-[#2a3942] hover:border-[#0284c7] flex items-center gap-2 font-semibold text-slate-800 dark:text-[#e9edef]"
              >
                <Camera className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Camera Photo</span>
              </button>
              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                className="p-2.5 rounded-xl bg-[#eef8ff]/90 dark:bg-[#111b21] border border-[#7dd3fc]/75 dark:border-[#2a3942] hover:border-indigo-500 flex items-center gap-2 font-semibold text-slate-800 dark:text-[#e9edef]"
              >
                <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Document (Anti-Virus Scanned)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  pendingConsentPresetRef.current = false;
                  videoInputRef.current?.click();
                }}
                className="p-2.5 rounded-xl bg-[#eef8ff]/90 dark:bg-[#111b21] border border-[#7dd3fc]/75 dark:border-[#2a3942] hover:border-amber-500 flex items-center gap-2 font-semibold text-slate-800 dark:text-[#e9edef]"
              >
                <Film className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Video (Up to 4 Hours)</span>
              </button>
            </div>
          )}

          {showStickers && (
            <div className="mb-2 p-2.5 rounded-2xl bg-[#dff1ff]/88 dark:bg-slate-950 backdrop-blur-xl border border-[#7dd3fc]/75 dark:border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-[#7dd3fc]/60 dark:border-slate-800">
                <span className="text-[11px] font-bold text-[#0284c7] dark:text-[#33b3ff] mr-1">
                  ✨ Viber Float:
                </span>
                {(['❤️', '😂', '😍', '🎉', '🔥', '👍', '🪔'] as const).map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      spawnViberEmoji(em);
                      handleSendSticker(em);
                    }}
                    className="w-8 h-8 rounded-full bg-[#eef8ff]/90 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-700 text-base flex items-center justify-center hover:scale-110 transition-transform"
                    aria-label={`Send floating ${em}`}
                  >
                    {em}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {STICKERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSendSticker(s)}
                    className="px-3 py-1.5 rounded-xl bg-[#eef8ff]/90 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800 text-xs font-medium hover:border-[#0284c7]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showTanglishCards && (
            <div className="mb-2.5 p-3 rounded-2xl bg-[#dff1ff]/88 dark:bg-slate-950 backdrop-blur-xl border border-[#7dd3fc]/75 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#0284c7] dark:text-[#38bdf8] flex items-center gap-1.5">
                  <Smile className="w-3.5 h-3.5" />
                  <span>Tanglish &amp; 3D Emoji Greeting Cards (Auto-Translates Live)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowTanglishCards(false)}
                  className="text-slate-500 hover:text-slate-800 dark:hover:text-white"
                  aria-label="Close Tanglish and 3D Emoji Greeting Cards"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Universal Celebrations & Special Days 3D Cards Grid */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  🎉 Celebrations &amp; Special Days ({FESTIVAL_3D_CARDS.length} 3D Cards — Tap Card to Send &amp; Animate)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
                  {FESTIVAL_3D_CARDS.map((card) => (
                    <div
                      key={card.id}
                      className={`rounded-2xl bg-gradient-to-br ${card.gradient} text-white p-2.5 shadow-sm flex flex-col justify-between gap-2 transition-transform hover:scale-[1.02]`}
                    >
                      <button
                        type="button"
                        onClick={async () => {
                          if (!currentChatId) return;
                          setShowTanglishCards(false);
                          triggerAnimationEffect(card.text, card.animation);
                          const participantIds =
                            activeScreen === 'group_chat'
                              ? activeGroupChat?.memberIds || [userProfile?.uid || '']
                              : activeDirectChat?.participantIds || [userProfile?.uid || ''];
                          try {
                            await sendMessage({
                              chatId: currentChatId,
                              chatType: activeScreen === 'group_chat' ? 'group' : 'direct',
                              participantIds,
                              text: card.text,
                              messageType: 'text',
                              e2eeEnabled:
                                activeScreen === 'individual_chat'
                                  ? Boolean(activeDirectChat?.e2eeEnabled)
                                  : true,
                            });
                          } catch (err) {
                            setChatActionError(
                              err instanceof Error ? err.message : 'Unable to send festival card.'
                            );
                          }
                        }}
                        className="text-center flex flex-col items-center gap-0.5"
                      >
                        <span className="text-2xl drop-shadow-sm">{card.emoji}</span>
                        <span className="text-xs font-extrabold leading-tight">{card.title}</span>
                        <span className="text-[10px] text-white/85 leading-tight">{card.effectTa}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerAnimationEffect(card.text, card.animation)}
                        className="w-full py-1 rounded-lg bg-black/20 hover:bg-black/35 text-[10px] font-semibold"
                      >
                        Preview 3D
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3D Animated Emoji Cards */}
              <div className="grid sm:grid-cols-2 gap-2">
                {THREE_D_EMOJI_CARDS.map((card) => (
                  <div
                    key={card.id}
                    className={`rounded-2xl bg-gradient-to-br ${card.gradient} text-white p-3.5 flex flex-col justify-between gap-2 shadow-sm`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xl drop-shadow-sm">{card.emoji}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-white/20 px-2 py-0.5 rounded-md">
                          {card.badge}
                        </span>
                      </div>
                      <p className="text-xs font-extrabold">{card.label}</p>
                      <p className="text-[11px] text-white/90 leading-snug">{card.text}</p>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!currentChatId) return;
                          setShowTanglishCards(false);
                          triggerAnimationEffect(card.text, card.animation);
                          const participantIds =
                            activeScreen === 'group_chat'
                              ? activeGroupChat?.memberIds || [userProfile?.uid || '']
                              : activeDirectChat?.participantIds || [userProfile?.uid || ''];
                          try {
                            await sendMessage({
                              chatId: currentChatId,
                              chatType: activeScreen === 'group_chat' ? 'group' : 'direct',
                              participantIds,
                              text: card.text,
                              messageType: 'text',
                              e2eeEnabled:
                                activeScreen === 'individual_chat'
                                  ? Boolean(activeDirectChat?.e2eeEnabled)
                                  : true,
                            });
                          } catch (err) {
                            setChatActionError(
                              err instanceof Error ? err.message : 'Unable to send 3D card.'
                            );
                          }
                        }}
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#e8f5ff]/95 text-[#0369a1] hover:bg-[#bae6fd] text-[11px] font-bold"
                      >
                        Send 3D Card &amp; Animate
                      </button>
                      {card.id === '3d_love' && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowTanglishCards(false);
                            setShowTajTributeModal(true);
                          }}
                          className="py-1.5 px-2.5 rounded-lg bg-black/75 border border-amber-400/60 text-amber-300 hover:bg-black text-[11px] font-bold whitespace-nowrap"
                        >
                          🏛️ Tribute View
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {TANGLISH_GREETING_CARDS.map((card) => (
                  <div
                    key={card.id}
                    className={`rounded-2xl bg-gradient-to-br ${card.gradient} text-white p-3 flex flex-col justify-between gap-2 shadow-xs`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-lg">{card.emoji}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-white/20 px-2 py-0.5 rounded-md">
                          Tanglish
                        </span>
                      </div>
                      <p className="text-xs font-bold leading-snug">{card.tanglish}</p>
                      <p className="text-[11px] text-white/80">{card.meaning}</p>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!currentChatId) return;
                          setShowTanglishCards(false);
                          triggerAnimationEffect(card.tanglish);
                          const participantIds =
                            activeScreen === 'group_chat'
                              ? activeGroupChat?.memberIds || [userProfile?.uid || '']
                              : activeDirectChat?.participantIds || [userProfile?.uid || ''];
                          try {
                            await sendMessage({
                              chatId: currentChatId,
                              chatType: activeScreen === 'group_chat' ? 'group' : 'direct',
                              participantIds,
                              text: `${card.emoji} ${card.tanglish}`,
                              messageType: 'text',
                              e2eeEnabled: activeScreen === 'individual_chat' ? Boolean(activeDirectChat?.e2eeEnabled) : true,
                            });
                          } catch (err) {
                            setChatActionError(err instanceof Error ? err.message : 'Unable to send greeting card.');
                          }
                        }}
                        className="flex-1 py-1.5 px-2 rounded-lg bg-[#e8f5ff]/95 text-[#0369a1] hover:bg-[#bae6fd] text-[11px] font-bold"
                      >
                        Send &amp; Translate
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMessageInput(`${card.emoji} ${card.tanglish}`);
                          setShowTanglishCards(false);
                        }}
                        className="py-1.5 px-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-semibold"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stylish Unicode Font Selector Strip */}
          <div className="max-w-4xl mx-auto mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-slate-500 dark:text-slate-400">Font:</span>
              {(
                [
                  { id: 'normal', label: 'Normal' },
                  { id: 'bold', label: '𝗕𝗼𝗹𝗱' },
                  { id: 'fancy', label: '𝓕𝓪𝓷𝓬𝔂' },
                  { id: 'caps', label: 'CAPS ✨' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFontStyle(opt.id)}
                  className={`px-2.5 py-1 rounded-lg border font-semibold transition-colors ${
                    fontStyle === opt.id
                      ? 'bg-[#0284c7] text-white border-[#0284c7]'
                      : 'bg-[#eef8ff]/85 dark:bg-slate-950 border-[#7dd3fc]/75 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-[#0284c7]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {fontStyle !== 'normal' && messageInput.trim() && (
              <span className="text-[11px] text-[#0284c7] dark:text-[#38bdf8] truncate max-w-xs">
                Preview: {applyStylishFont(messageInput.trim(), fontStyle)}
              </span>
            )}
          </div>

          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
            onChange={handlePhotoSelection}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelection}
            className="hidden"
          />
          <input
            ref={docInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rtf,application/pdf,text/plain"
            onChange={handleDocumentSelection}
            className="hidden"
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*,.mp4,.webm,.mov,.m4v"
            onChange={handleVideoSelection}
            className="hidden"
          />

          <form onSubmit={handleSendText} className="max-w-4xl mx-auto flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAttachMenu(false);
                setShowTanglishCards(false);
                setShowStickers((s) => !s);
              }}
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full transition-colors ${
                showStickers
                  ? 'bg-sky-100 dark:bg-sky-950 text-[#0284c7] dark:text-[#38bdf8]'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
              aria-label="Open stickers and emojis"
              title="Stickers & Emojis"
            >
              <Smile className="w-5 h-5" />
            </button>
            <button
              type="button"
              disabled={attachingBusy}
              onClick={() => {
                setShowStickers(false);
                setShowTanglishCards(false);
                setShowAttachMenu((v) => !v);
              }}
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full transition-colors ${
                showAttachMenu
                  ? 'bg-sky-100 dark:bg-sky-950 text-[#0284c7] dark:text-[#38bdf8]'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
              aria-label="Attach photo or document"
              title="Send Photo or Document"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <button
              type="button"
              disabled={attachingBusy}
              onClick={() => {
                pendingConsentPresetRef.current = false;
                cameraInputRef.current?.click();
              }}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-[#0284c7] dark:text-[#38bdf8] transition-colors"
              aria-label="Open camera photo"
              title="Camera Photo"
            >
              <Camera className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAttachMenu(false);
                setShowStickers(false);
                setShowTanglishCards((v) => !v);
              }}
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full transition-colors ${
                showTanglishCards
                  ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-blue-700 dark:text-blue-400'
              }`}
              aria-label="Open Tanglish and 3D emoji greeting cards"
              title="Tanglish & 3D Emoji Greeting Cards"
            >
              <Smile className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setSchedError(null);
                setShowScheduleModal(true);
              }}
              className="hidden md:flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-blue-700 dark:text-blue-400"
              aria-label="Schedule wish or status post"
              title="Schedule Wish / Post"
            >
              <CalendarClock className="w-5 h-5" />
            </button>
            <input
              type="text"
              value={messageInput}
              onChange={(e) => {
                setMessageInput(e.target.value);
                if (activeScreen === 'individual_chat' && currentChatId) {
                  setTypingStatus(currentChatId, e.target.value.length > 0);
                }
              }}
              placeholder={
                pendingAttachment
                  ? 'Add an optional caption...'
                  : t('chat.typeMessage', "Type 'Pongal', '2027', 'Christmas', 'Love' or any message...")
              }
              className="flex-1 min-w-0 px-4 py-2.5 rounded-full bg-[#eef8ff]/90 dark:bg-slate-950 border border-[#7dd3fc]/75 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
            />
            <select
              aria-label="Message burn timer"
              title="Zone 1 Message Burn Timer"
              value={burnAfterSeconds}
              onChange={(e) => setBurnAfterSeconds(Number(e.target.value) as 0 | 30 | 300 | 3600)}
              className={`min-h-[40px] px-2 rounded-full border text-[11px] font-semibold focus:outline-none ${
                burnAfterSeconds > 0
                  ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-400 text-amber-800 dark:text-amber-300'
                  : 'bg-[#eef8ff]/90 dark:bg-slate-950 border-[#7dd3fc]/75 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <option value={0}>Burn: Off</option>
              <option value={30}>30s</option>
              <option value={300}>5m</option>
              <option value={3600}>1h</option>
            </select>
            <button
              type="button"
              onClick={handleToggleVoiceRecord}
              disabled={voiceBusy}
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full transition-colors ${
                recording
                  ? 'bg-[#1e40af] text-white shadow-sm'
                  : 'bg-[#0284c7] hover:bg-[#0369a1] text-white shadow-xs'
              }`}
              aria-label={recording ? 'Stop voice recording' : 'Record voice message'}
              title={recording ? 'Stop & Preview Voice Note' : 'Dynamic Voice Recorder'}
            >
              {recording ? <Square className="w-4 h-4" /> : <Mic className="w-5 h-5" />}
            </button>
            <button
              type="submit"
              disabled={attachingBusy || (!messageInput.trim() && !pendingAttachment)}
              className="min-h-[44px] px-4 rounded-full bg-[#0284c7] hover:bg-[#0369a1] dark:bg-[#0284c7] dark:hover:bg-[#0369a1] disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-1.5 shrink-0"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">{attachingBusy ? 'Preparing...' : t('chat.send', 'Send')}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Fullscreen Photo Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="max-w-3xl w-full flex items-center justify-between text-white mb-3"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm font-semibold truncate pr-4">{lightboxImage.name}</span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSharePhotoResult(null);
                  setShareSelectedUids([]);
                  setSharePhotoTarget({
                    src: lightboxImage.src,
                    name: lightboxImage.name,
                  });
                }}
                className="px-3.5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Share2 className="w-4 h-4" />
                <span>Share to 100+</span>
              </button>
              <button
                type="button"
                onClick={() => triggerMediaDownload(lightboxImage.src, lightboxImage.name)}
                className="px-3.5 py-2 rounded-xl bg-[#0369a1] hover:bg-[#0284c7] text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white"
                aria-label="Close photo preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <img
            src={lightboxImage.src}
            alt={lightboxImage.name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}

      {/* Forward Message Modal */}
      {forwardMsg && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-sm w-full rounded-3xl bg-[#e3f3ff]/92 dark:bg-slate-900/95 backdrop-blur-2xl border border-[#7dd3fc] dark:border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Forward Message</h3>
              <button onClick={() => setForwardMsg(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {directChats.map((chat) => (
                <button
                  key={chat.chatId}
                  onClick={async () => {
                    setChatActionError(null);
                    try {
                      await sendMessage({
                        chatId: chat.chatId,
                        chatType: 'direct',
                        participantIds: chat.participantIds,
                        text: forwardMsg.originalText,
                        forwardedFrom: forwardMsg.senderName,
                      });
                      setForwardMsg(null);
                    } catch (err) {
                      setChatActionError(
                        err instanceof Error ? err.message : 'Unable to forward message.'
                      );
                      setForwardMsg(null);
                    }
                  }}
                  className="w-full p-3 rounded-xl bg-[#eef8ff]/85 dark:bg-transparent border border-[#7dd3fc]/75 dark:border-slate-800 text-left text-sm hover:bg-[#dff1ff] dark:hover:bg-slate-800"
                >
                  {chat.title || chat.chatId}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Schedule Wish / Status Post Modal (scheduled_posts) */}
      {scheduleModalNode}
      {tajTributeModalNode}

      <WazeNavigationModal
        open={wazeModalState.open}
        onClose={() => setWazeModalState({ open: false })}
        initialLat={wazeModalState.initialLat}
        initialLng={wazeModalState.initialLng}
        initialDestinationName={wazeModalState.initialDestinationName}
        initialMode={wazeModalState.initialMode}
        onShareLocationToChat={({ lat, lng, mode, label }) =>
          sendLocationToChat(mode, { lat, lng, label })
        }
      />

      {/* Mutual Consent Confirmation Modal for Blurred Sensitive Media */}
      {consentPromptMsg && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Consent-Protected Media Verification"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="max-w-sm w-full rounded-3xl bg-[#202c33] border-2 border-[#33b3ff] p-6 shadow-2xl space-y-4 text-white">
            <div className="flex items-center gap-2 text-[#33b3ff]">
              <Eye className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold">
                🔞 Mutual Consent Media Verification
              </h3>
            </div>
            <p className="text-xs text-[#e9edef] leading-relaxed">
              இந்தப் புகைப்படம் / வீடியோ தனியுரிமைப் பாதுகாப்பில் (Blurred) உள்ளது. இரு தரப்பினரின் சம்மதத்துடன் இதைப் பார்க்க விரும்புகிறீர்களா?
            </p>
            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setConsentPromptMsg(null)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-bold"
              >
                Keep Hidden
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = consentPromptMsg.messageId;
                  setRevealedConsentMediaIds((prev) =>
                    prev.includes(id) ? prev : [...prev, id]
                  );
                  setConsentPromptMsg(null);
                }}
                className="flex-1 py-2.5 px-3 rounded-xl bg-[#33b3ff] hover:bg-sky-400 text-slate-950 text-xs font-bold"
              >
                Confirm Consent &amp; View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Block / Unblock Partner Confirmation Modal (No native window.confirm) */}
      {blockConfirmTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Block or Unblock User Confirmation"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="max-w-sm w-full rounded-3xl bg-[#e3f3ff]/92 dark:bg-[#202c33] backdrop-blur-2xl border border-[#7dd3fc] dark:border-[#2a3942] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <Ban className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {blockConfirmTarget.currentlyBlocked
                  ? `Unblock ${blockConfirmTarget.name}?`
                  : `Block ${blockConfirmTarget.name}?`}
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-[#aebac1] leading-relaxed">
              {blockConfirmTarget.currentlyBlocked
                ? 'இந்தப் பயனரைத் தடையிலிருந்து நீக்கினால், மீண்டும் செய்திகள் மற்றும் அழைப்புகளைப் பரிமாறலாம்.'
                : 'நீங்கள் இந்தப் பயனரை பிளாக் செய்தால், அவர்களால் உங்களுக்குச் செய்திகளோ அழைப்புகளோ அனுப்ப முடியாது.'}
            </p>
            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                disabled={blockBusy}
                onClick={() => setBlockConfirmTarget(null)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={blockBusy}
                onClick={async () => {
                  setBlockBusy(true);
                  setChatActionError(null);
                  try {
                    if (blockConfirmTarget.currentlyBlocked) {
                      await unblockUserByUid(blockConfirmTarget.uid);
                      setChatSecurityToast(`✔ ${blockConfirmTarget.name} unblocked.`);
                    } else {
                      await blockUserByUid(blockConfirmTarget.uid, blockConfirmTarget.name);
                      setChatSecurityToast(`🚫 ${blockConfirmTarget.name} blocked.`);
                    }
                    setBlockConfirmTarget(null);
                  } catch (err) {
                    setChatActionError(
                      err instanceof Error ? err.message : 'Unable to update block status.'
                    );
                    setBlockConfirmTarget(null);
                  } finally {
                    setBlockBusy(false);
                  }
                }}
                className={`flex-1 py-2.5 px-3 rounded-xl text-white text-xs font-bold ${
                  blockConfirmTarget.currentlyBlocked
                    ? 'bg-[#0284c7] hover:bg-[#0369a1]'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {blockBusy
                  ? 'Updating...'
                  : blockConfirmTarget.currentlyBlocked
                    ? 'Confirm Unblock'
                    : 'Confirm Block'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Select Unlimited Photo Share Modal (No 5-Contact Limit — 100+ Contacts Supported) */}
      {sharePhotoTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Share Photo to Multiple Contacts"
          className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="max-w-md w-full max-h-[88vh] flex flex-col rounded-3xl bg-[#e3f3ff]/92 dark:bg-slate-900/95 backdrop-blur-2xl border border-[#7dd3fc] dark:border-sky-500/30 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-gradient-to-r from-[#0284c7] to-[#00B4D8] text-white flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <Share2 className="w-4 h-4 shrink-0" />
                  <span>Multi-Select Photo Share (100+ Contacts)</span>
                </h3>
                <p className="text-[11px] text-sky-100 truncate">
                  Zero 5-person limit · Select as many contacts as needed
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSharePhotoTarget(null)}
                className="p-1.5 rounded-xl hover:bg-white/20"
                aria-label="Close multi-select share modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 flex-1 overflow-y-auto text-xs">
              <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#dff1ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/75 dark:border-slate-800">
                <img
                  src={sharePhotoTarget.src}
                  alt={sharePhotoTarget.name}
                  className="w-12 h-12 rounded-xl object-cover shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 dark:text-white truncate">
                    {sharePhotoTarget.name}
                  </p>
                  <p className="text-[11px] text-[#0284c7] dark:text-[#38bdf8] font-semibold">
                    {shareSelectedUids.length} selected · Unlimited Recipients
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={shareContactFilter}
                  onChange={(e) => setShareContactFilter(e.target.value)}
                  placeholder="Search contacts..."
                  className="flex-1 px-3 py-2 rounded-xl bg-[#eef8ff]/90 dark:bg-slate-950 border border-[#7dd3fc]/75 dark:border-slate-800 text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShareSelectedUids(allShareableContacts.map((c) => c.uid))}
                  className="px-2.5 py-2 rounded-xl bg-[#0284c7]/15 text-[#0284c7] dark:text-[#38bdf8] font-bold text-[11px] whitespace-nowrap"
                >
                  Select All ({allShareableContacts.length})
                </button>
                {shareSelectedUids.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShareSelectedUids([])}
                    className="px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-[11px]"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {allShareableContacts.length === 0 ? (
                  <p className="text-center text-slate-500 py-6">
                    Add PK Chat contacts first to share photos across multiple chats cleanly.
                  </p>
                ) : (
                  allShareableContacts
                    .filter((c) =>
                      c.name.toLowerCase().includes(shareContactFilter.trim().toLowerCase())
                    )
                    .map((contact) => {
                      const checked = shareSelectedUids.includes(contact.uid);
                      return (
                        <label
                          key={contact.uid}
                          className={`flex items-center justify-between gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                            checked
                              ? 'bg-[#cceaff]/90 dark:bg-sky-950/50 border-[#0284c7]'
                              : 'bg-[#eef8ff]/85 dark:bg-slate-950 border-[#7dd3fc]/75 dark:border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setShareSelectedUids((prev) =>
                                  e.target.checked
                                    ? [...prev, contact.uid]
                                    : prev.filter((id) => id !== contact.uid)
                                )
                              }
                              className="rounded accent-[#0284c7]"
                            />
                            <UserAvatar src={contact.avatar} name={contact.name} size="sm" />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-white truncate">
                                {contact.name}
                              </p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                {contact.subtitle}
                              </p>
                            </div>
                          </div>
                        </label>
                      );
                    })
                )}
              </div>

              {sharePhotoResult && (
                <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-[#bae6fd] dark:border-sky-800 text-[#0369a1] dark:text-sky-200 font-semibold text-xs">
                  {sharePhotoResult}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSharePhotoTarget(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold"
              >
                Close
              </button>
              <button
                type="button"
                disabled={sharePhotoBusy || shareSelectedUids.length === 0}
                onClick={async () => {
                  if (!sharePhotoTarget || shareSelectedUids.length === 0) return;
                  setSharePhotoBusy(true);
                  setSharePhotoResult(null);
                  try {
                    const recipientsPayload = shareSelectedUids.map((uid) => {
                      const c = allShareableContacts.find((item) => item.uid === uid);
                      const prof = directoryProfiles.find((p) => p.uid === uid);
                      return {
                        uid,
                        fullName: c?.name || prof?.fullName,
                        preferredLanguage: prof?.preferredLanguage,
                        preferredLanguageName: prof?.preferredLanguageName,
                      };
                    });
                    const res = await sharePhotoToManyContacts({
                      recipients: recipientsPayload,
                      photoDataUrl: sharePhotoTarget.src,
                      mediaName: sharePhotoTarget.name,
                      caption: sharePhotoTarget.caption,
                    });
                    setSharePhotoResult(
                      `✔ Photo delivered to ${res.deliveredCount} of ${shareSelectedUids.length} contact(s) with zero forwarding cap!`
                    );
                    setChatSecurityToast(
                      `📸 Photo shared simultaneously to ${res.deliveredCount} contact(s)!`
                    );
                  } catch (err) {
                    setSharePhotoResult(
                      err instanceof Error ? err.message : 'Unable to send to selected contacts.'
                    );
                  } finally {
                    setSharePhotoBusy(false);
                  }
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {sharePhotoBusy
                    ? 'Sending...'
                    : `Send to ${shareSelectedUids.length} Contact(s)`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
