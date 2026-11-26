import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ConfirmationResult,
  GoogleAuthProvider,
  RecaptchaVerifier,
  User,
  browserLocalPersistence,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  ALL_SCREENS_META,
  BUILT_IN_WALLPAPERS,
  COUNTRIES,
  LANGUAGES,
} from '../data/constants';
import {
  AllowlistedRemediationAction,
  CallRecord,
  ChatMessage,
  ConsentedLocation,
  ContactRecord,
  ContactRequest,
  CountryOption,
  DirectChat,
  DisasterAlert,
  EmergencyContact,
  GlobalSecurityState,
  GmailApprovalRequest,
  GroupChat,
  GuardianScanResult,
  LanguageOption,
  LanguagePreference,
  LocationConsentRecord,
  PaymentRecord,
  PhoneDirectoryEntry,
  PrivacyVisibilityOption,
  ProfileMediaRecord,
  ScheduledPost,
  ScreenId,
  SecurityAuditLog,
  SecurityIncident,
  SecurityLogItem,
  SosAlert,
  StatusPrivacyMode,
  StatusReactionRecord,
  StatusUpdate,
  StatusViewerRecord,
  SubscriptionRecord,
  TranslatedMessage,
  UserAccount,
  UserDevice,
  UserProfile,
  PkChatUserMode,
  UserSettings,
  WallpaperItem,
} from '../types/pkchat';
import { WORLD_LANGUAGES_CATALOG } from '../data/worldLanguages';
import {
  OperationType,
  auth,
  authPersistenceReady,
  createGoogleAuthProvider,
  db,
  handleFirestoreError,
  isTransientFirestoreError,
  testFirestoreConnection,
} from '../lib/firebase';
import {
  detectPlatformLabel,
  encryptE2eeText,
  getOrCreateDeviceId,
  getOrCreateE2eeKeyPair,
  hashPin,
  isMessageExpiredByBurnTimer,
  secureShredMediaObjectUrl,
  secureShredTextPayload,
  verifyPin,
} from '../lib/crypto';
import {
  OtpReadinessStatus,
  fetchOfficialDisasters,
  fetchOtpStatus,
  fetchSecurityStatus,
  fetchWorldLanguagesCatalog,
  recheckSecurityStatus,
  refreshWorldLanguagesCatalog,
  requestSmsGatewayOtp,
  requestVoiceCallOtp,
  resolveAdminThreat,
  runGuardianAudit,
  sendGmailApprovalRequest,
  translateBatch,
  translateText,
  triggerAdminTestIncident,
  validateProfileImageUpload,
  validateSubscriptionAction,
  verifyGatewayOtp,
  verifyGmailApprovalReply,
} from '../lib/api';
import { getSecurityCopyForLanguage } from '../lib/securityTranslations';
import { announceSecurityStatusVoice } from '../lib/securityTts';
import { playNotificationTone, startUrgentSosSiren, stopUrgentSosSiren } from '../lib/audioTones';
import {
  PK_APP_EXPERIENCE,
  loginWithFirebasePhoneOrEmail,
} from '../lib/pkExperienceController';
import { markOfficialIdsRead } from '../lib/officialInboxEngine';
import {
  EMERGENCY_SIREN_CHANNEL,
  EMERGENCY_SIREN_EVENT,
  EmergencySirenAlertPayload,
  dispatchLocalEmergencySirenBroadcast,
  formatSosOnTheWayMessage,
  formatSosSirenChatPayload,
  getFastAccurateGps,
  isIntentionalDataOff,
  isLowDataPackageActive,
  parseSosSirenChatPayload,
  setIntentionalDataOff,
} from '../lib/connectivityAndDnd';
import { triggerOfflineSimSmsSos } from '../lib/offlineSmsSos';
import {
  OfflineQueuedMessageRecord,
  enqueueOfflineMessage,
  getOfflineOutbox,
  queuedRecordToChatMessage,
  removeOfflineOutboxItem,
} from '../lib/offlineOutbox';
import {
  WEATHER_UPDATED_EVENT,
  WeatherSnapshot,
  getInstantWeatherSnapshot,
  refreshWeatherSnapshotIfNeeded,
} from '../lib/weatherService';
import {
  WEB_PREVIEW_TEST_OTP,
  confirmFirebasePhoneOtp,
  detectInitialCountryCodeFromLocale,
  hashPhoneE164,
  isWebPreviewTestPhoneBypass,
  mapFirebasePhoneAuthError,
  mapOAuthSignInError,
  normalizePhoneToE164,
  sendFirebasePhoneOtp,
  shouldFallbackToRedirect,
} from '../lib/phoneAuth';
import {
  isVipFounderFreeNumber,
  setActiveUserMode,
  STANDARD_FREE_TRIAL_DAYS,
} from '../lib/subscriptionBilling';
import { deleteProfilePhotosFromStorage, uploadProfilePhotoToStorage } from '../lib/profileStorage';
import {
  STATUS_TTL_MS,
  computeAuthorizedViewerIds,
  deleteStatusMediaFromStorage,
  isStatusActive,
  toEpochMs,
  uploadStatusMedia,
} from '../lib/statusMedia';
import { reverseGeocodeConsentedCoords } from '../lib/emergencyService';
import {
  autoDeleteCountryEmergencyData,
  clearLegacySosPreseedCaches,
} from '../lib/countryEmergencyCleanup';
import { parseClassRoomFromInput } from '../lib/classTranslation';
import {
  analyzeImageDataUrlForExplicitContent,
  detectExplicitSexualContent,
} from '../lib/securityShield';

const DEFAULT_SECURITY_STATE: GlobalSecurityState = {
  stateId: 'global',
  status: 'NORMAL',
  threatLevel: 'low',
  reasonCode: 'SYSTEM_HEALTHY',
  restrictLogin: false,
  restrictMessages: false,
  restrictAccountChanges: false,
  restrictCalls: false,
  recheckIntervalSeconds: 10,
  threatResolved: true,
  lockdownStartedAt: null,
  recoveringStartedAt: null,
  updatedBy: 'system',
};

const OWNER_EMAILS = new Set(['jeradkaran2022@gmail.com', 'jeradprasanth27@gmail.com']);

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const rKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * rKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isValidHardenedGpsFix(lat?: number, lng?: number, accuracyMeters?: number): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
  if (typeof accuracyMeters === 'number' && Number.isFinite(accuracyMeters) && accuracyMeters > 50_000) {
    return false;
  }
  return true;
}

export interface HomeLocationCoords {
  latitude: number;
  longitude: number;
  label?: string;
  savedAtIso: string;
}

const HOME_LOCATION_STORAGE_KEY = 'pk_home_location_v1';

function readStoredHomeLocation(): HomeLocationCoords | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(HOME_LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HomeLocationCoords>;
    if (!isValidHardenedGpsFix(parsed?.latitude, parsed?.longitude)) return null;
    return {
      latitude: Number(parsed.latitude!.toFixed(5)),
      longitude: Number(parsed.longitude!.toFixed(5)),
      label: typeof parsed.label === 'string' && parsed.label.trim() ? parsed.label.trim().slice(0, 80) : 'Home',
      savedAtIso: typeof parsed.savedAtIso === 'string' ? parsed.savedAtIso : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

interface PkChatContextValue {
  authReady: boolean;
  firebaseUser: User | null;
  firestoreConnected: boolean;
  networkError: string | null;
  clearNetworkError: () => void;
  retryConnection: () => Promise<void>;
  activeScreen: ScreenId;
  setActiveScreen: (screen: ScreenId) => void;
  selectedCountry: CountryOption;
  setSelectedCountry: (country: CountryOption) => void;
  pendingPhone: string;
  setPendingPhone: (phone: string) => void;
  otpConfirmation: ConfirmationResult | null;
  otpChannelMode: 'firebase' | 'gateway' | 'preview_test';
  otpReadiness: OtpReadinessStatus | null;
  refreshOtpReadiness: (dialCode?: string) => Promise<OtpReadinessStatus | null>;
  isWebPreviewTestSession: boolean;
  isLocalPreviewSession: boolean;
  otpStatusMessage: string | null;
  otpError: string | null;
  otpErrorCode: string | null;
  sendPhoneOtp: (
    phoneE164: string,
    recaptchaContainerId: string,
    recaptchaSize?: 'invisible' | 'normal',
    trustedDevice?: boolean
  ) => Promise<boolean>;
  sendVoiceCallOtp: (phoneE164: string) => Promise<boolean>;
  verifyPhoneOtp: (code: string) => Promise<boolean>;
  startTrialWithLanguage: (params: {
    languageCode: string;
    languageName: string;
    fullName?: string;
    userMode?: PkChatUserMode;
  }) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logoutUser: () => Promise<void>;

  // User records
  userAccount: UserAccount | null;
  userAccountLoaded: boolean;
  userProfile: UserProfile | null;
  directoryProfiles: UserProfile[];
  languagePref: LanguagePreference | null;
  userSettings: UserSettings | null;
  userDevices: UserDevice[];
  currentDeviceId: string;
  e2eeFingerprint: string;

  // Onboarding & Dynamic All-World Languages
  worldLanguages: LanguageOption[];
  worldLanguagesVersion: string;
  refreshLanguageCatalog: () => Promise<void>;
  appLanguage: string;
  appLanguageName: string;
  updateAppLanguage: (code: string, name: string) => Promise<void>;
  completeOnboardingProfile: (params: {
    fullName: string;
    avatarUrl?: string;
    country: CountryOption;
    preferredLanguageCode: string;
    preferredLanguageName: string;
    trusted?: boolean;
    phoneNumber?: string;
    allowPhoneDiscovery?: boolean;
    userMode?: PkChatUserMode;
    allowLocalFallback?: boolean;
  }) => Promise<void>;
  updatePreferredLanguage: (code: string, name: string) => Promise<void>;
  updateLanguageSettings: (patch: Partial<LanguagePreference>) => Promise<void>;
  updateProfile: (patch: Partial<UserProfile>) => Promise<void>;
  updateUserSettings: (patch: Partial<UserSettings>) => Promise<void>;

  // Personal Profile Customization, Privacy & Multi-Device Media Sync
  profileMedia: ProfileMediaRecord | null;
  profileMediaCache: Record<string, ProfileMediaRecord | null>;
  profileSyncLoading: boolean;
  profileSyncError: string | null;
  saveProfileCustomization: (params: {
    fullName?: string;
    about?: string;
    bio?: string;
    statusMessage?: string;
    country?: string;
    countryCode?: string;
    avatarDataUrl?: string;
    coverDataUrl?: string;
    avatarMimeType?: string;
    coverMimeType?: string;
    profileVisibility?: PrivacyVisibilityOption;
    profilePhotoVisibility?: PrivacyVisibilityOption;
    aboutVisibility?: PrivacyVisibilityOption;
    blockedUserIds?: string[];
  }) => Promise<void>;
  loadContactProfileMedia: (targetUid: string) => Promise<ProfileMediaRecord | null>;
  blockUserByUid: (targetUid: string, displayName?: string) => Promise<void>;
  unblockUserByUid: (targetUid: string) => Promise<void>;

  // Messaging
  contacts: ContactRecord[];
  directChats: DirectChat[];
  groupChats: GroupChat[];
  messages: ChatMessage[];
  translations: TranslatedMessage[];
  activeChatId: string | null;
  activeChatType: 'direct' | 'group';
  setActiveChat: (chatId: string | null, type?: 'direct' | 'group') => void;
  addContact: (params: {
    contactUid: string;
    displayName: string;
    country: string;
    preferredLanguage: string;
    preferredLanguageName: string;
    phoneMasked?: string;
  }) => Promise<void>;
  toggleBlockContact: (contactId: string, blocked: boolean) => Promise<void>;
  reportContact: (contactId: string, reason: string) => Promise<void>;
  incomingContactRequests: ContactRequest[];
  outgoingContactRequests: ContactRequest[];
  linkPhoneForDiscovery: (phoneRaw: string, discoverable: boolean, dialCode?: string) => Promise<void>;
  lookupUserByPhone: (phoneRaw: string, dialCode?: string) => Promise<PhoneDirectoryEntry | null>;
  sendContactRequest: (target: PhoneDirectoryEntry) => Promise<void>;
  respondToContactRequest: (request: ContactRequest, decision: 'accepted' | 'cancelled' | 'declined') => Promise<void>;
  startDirectChat: (targetUser: UserProfile) => Promise<string>;
  createGroupChat: (params: { name: string; description?: string; memberIds: string[] }) => Promise<string>;
  sendMessage: (params: {
    chatId: string;
    chatType: 'direct' | 'group';
    participantIds: string[];
    text: string;
    messageType?: ChatMessage['messageType'];
    e2eeEnabled?: boolean;
    mediaName?: string;
    mediaMimeType?: string;
    mediaPreviewData?: string;
    replyToId?: string;
    replyToText?: string;
    forwardedFrom?: string;
    burnAfterSeconds?: number;
    simulateIncomingReplyFrom?: { uid: string; name: string; languageCode: string; languageName: string };
  }) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  markMessageRead: (message: ChatMessage) => Promise<void>;
  setTypingStatus: (chatId: string, isTyping: boolean) => Promise<void>;
  offlineOutboxCount: number;
  flushOfflineOutbox: () => Promise<number>;

  // Calls
  callRecords: CallRecord[];
  activeCall: CallRecord | null;
  startCall: (params: {
    participantIds: string[];
    callType: 'audio' | 'video';
    targetLanguage: string;
    targetName?: string;
    targetPhone?: string;
    offerSdp?: string;
  }) => Promise<CallRecord>;
  updateCallStatus: (callId: string, status: CallRecord['status'], durationSeconds?: number) => Promise<void>;

  // Wallpapers
  wallpapers: WallpaperItem[];
  uploadCustomWallpaper: (title: string, dataUrl: string) => Promise<string>;

  // Safety, Location Consent, Emergency Reports & Disasters
  locationConsent: LocationConsentRecord | null;
  consentedLocation: ConsentedLocation | null;
  locationLoading: boolean;
  locationError: string | null;
  grantGpsLocation: (autoTravelUpdate?: boolean) => Promise<ConsentedLocation | null>;
  setManualConsentedLocation: (loc: {
    country: string;
    countryCode: string;
    province?: string;
    district?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  }) => Promise<ConsentedLocation>;
  stopLocationSharing: () => Promise<void>;
  toggleAutoTravelUpdate: (enabled: boolean) => Promise<void>;
  emergencyContacts: EmergencyContact[];
  sosAlerts: SosAlert[];
  disasterAlerts: DisasterAlert[];
  disasterFeedErrors: string[];
  refreshDisasterAlerts: () => Promise<void>;
  addEmergencyContact: (contact: Omit<EmergencyContact, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
  removeEmergencyContact: (id: string) => Promise<void>;
  clearAllEmergencyContacts: () => Promise<number>;
  triggerSosAlert: (params: { shareLiveLocation: boolean; latitude?: number; longitude?: number; note?: string }) => Promise<void>;
  resolveSosAlert: (
    alertId: string,
    status: 'resolved' | 'cancelled',
    sendSafeAlert?: boolean
  ) => Promise<{ safeNotifiedCount: number }>;
  sosTrackingExpiresAtMs: number | null;
  sosLastTrackSyncAtMs: number | null;
  homeLocation: HomeLocationCoords | null;
  saveHomeLocation: (coords: { latitude: number; longitude: number; label?: string }) => HomeLocationCoords | null;
  clearHomeLocation: () => void;
  publishOfficialDisasterAlert: (alert: Omit<DisasterAlert, 'alertId' | 'verifiedOfficial'>) => Promise<void>;

  // Billing
  subscription: SubscriptionRecord | null;
  paymentRecords: PaymentRecord[];
  performSubscriptionAction: (
    action: 'start_trial' | 'subscribe_monthly' | 'subscribe_annual' | 'cancel' | 'verify_vip_founder',
    provider?: string
  ) => Promise<void>;

  // Security & App Lock
  securityLogs: SecurityLogItem[];
  logSecurityEvent: (eventType: string, severity: 'info' | 'warning' | 'critical', detail: string) => Promise<void>;
  revokeDevice: (deviceId: string) => Promise<void>;
  isAppLocked: boolean;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometric: (credentialIdBase64?: string) => Promise<boolean>;
  lockAppNow: () => void;
  setPinLock: (pin: string | null) => Promise<void>;
  isAdminUser: boolean;
  adminMfaVerified: boolean;
  setAdminMfaVerified: (verified: boolean) => void;
  allUsersCount: number;
  allSubscriptionsCount: number;
  notifications: Array<{ id: string; category: string; title: string; body: string; read: boolean; createdAt?: unknown }>;
  markNotificationRead: (id: string) => Promise<void>;
  scheduledPosts: ScheduledPost[];
  schedulePKPost: (params: {
    postType: 'chat_wish' | 'status';
    receiverId: string;
    chatId: string;
    message: string;
    emojiKey: string;
    mediaUrl: string;
    wishTime: Date;
  }) => Promise<void>;
  cancelScheduledPost: (postId: string) => Promise<void>;

  // WhatsApp-style 24-hour Status / Updates
  statuses: StatusUpdate[];
  unseenStatusCount: number;
  statusPrivacyDefault: StatusPrivacyMode;
  statusExcludedDefault: string[];
  statusAllowedDefault: string[];
  saveStatusPrivacyPreferences: (prefs: {
    privacyMode: StatusPrivacyMode;
    excludedViewerIds: string[];
    allowedViewerIds: string[];
  }) => void;
  createStatusUpdate: (params: {
    mediaType: 'text' | 'image' | 'video';
    fileOrBlob?: File | Blob;
    mimeTypeOverride?: string;
    textContent?: string;
    backgroundColor?: string;
    fontStyle?: 'sans' | 'serif' | 'mono';
    caption?: string;
    privacyMode?: StatusPrivacyMode;
    excludedViewerIds?: string[];
    allowedViewerIds?: string[];
    onProgress?: (pct: number) => void;
  }) => Promise<StatusUpdate>;
  markStatusViewed: (statusId: string) => Promise<void>;
  reactToStatus: (statusId: string, emoji: string) => Promise<void>;
  replyToStatus: (status: StatusUpdate, replyText: string) => Promise<string>;
  deleteStatusUpdate: (status: StatusUpdate) => Promise<void>;
  updateStatusPrivacy: (params: {
    statusId: string;
    privacyMode: StatusPrivacyMode;
    excludedViewerIds: string[];
    allowedViewerIds: string[];
  }) => Promise<void>;

  // Multi-Language Security Protection, 10s Recheck, PKC Security Shield & Gmail Owner Approval
  globalSecurityState: GlobalSecurityState;
  securityIncidents: SecurityIncident[];
  securityAuditLogs: SecurityAuditLog[];
  gmailApprovals: GmailApprovalRequest[];
  recheckCountdown: number;
  isVoiceSpeaking: boolean;
  gmailAccessToken: string | null;
  connectOwnerGmail: () => Promise<boolean>;
  disconnectOwnerGmail: () => void;
  refreshSecurityStatus: () => Promise<void>;
  playCurrentSecurityVoiceAlert: () => Promise<void>;
  runSecurityGuardianScan: () => Promise<GuardianScanResult>;
  triggerSecurityLockdownDrill: (category?: SecurityIncident['category'], summary?: string) => Promise<void>;
  resolveSecurityThreatAdmin: (immediateNormal?: boolean) => Promise<void>;
  requestOwnerGmailApproval: (params: {
    incidentId: string;
    riskLevel: 'HIGH' | 'CRITICAL' | 'MEDIUM';
    explanation: string;
    proposedChanges: string;
    proposedCodeDiff: string;
    testResults: string;
    actionId: AllowlistedRemediationAction;
  }) => Promise<{ approval: GmailApprovalRequest; instructions: string }>;
  checkOwnerGmailApprovalReply: (approvalId: string) => Promise<{
    verified: boolean;
    decision?: 'APPROVE' | 'REJECT';
    message?: string;
  }>;

  // Weather, Intentional Data-Off, Dual SOS Modes (1-Tap & 1s Long Press Siren) & 100+ Contact Photo Share
  weatherSnapshot: WeatherSnapshot;
  refreshWeatherNow: () => Promise<void>;
  intentionalDataOff: boolean;
  toggleIntentionalDataOff: (next: boolean) => Promise<void>;
  incomingSosSiren: EmergencySirenAlertPayload | null;
  dismissIncomingSosSiren: () => void;
  acknowledgeOnTheWaySosSiren: () => Promise<void>;
  triggerQuickSosOneTap: () => Promise<{ sentContacts: number; hasGps: boolean; offlineSmsDispatched: boolean }>;
  triggerLongPressSosSiren: (options?: { demoLocalPreview?: boolean }) => Promise<{
    sentContacts: number;
    hasGps: boolean;
    offlineSmsDispatched: boolean;
    alertId: string;
  }>;
  sharePhotoToManyContacts: (params: {
    recipients: Array<{
      uid: string;
      fullName?: string;
      preferredLanguage?: string;
      preferredLanguageName?: string;
    }>;
    photoDataUrl: string;
    mediaName: string;
    caption?: string;
  }) => Promise<{ deliveredCount: number; failedCount: number }>;
}

const PkChatContext = createContext<PkChatContextValue | undefined>(undefined);

function isVerifiedAccountUser(user: User | null): boolean {
  return Boolean(user && user.uid);
}

export function PkChatProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firestoreConnected, setFirestoreConnected] = useState(true);
  const [activeScreen, setActiveScreenState] = useState<ScreenId>('welcome');
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(() => {
    const detectedIso = detectInitialCountryCodeFromLocale();
    return (
      COUNTRIES.find((c) => c.code === detectedIso) ||
      COUNTRIES.find((c) => c.code === 'LK') ||
      COUNTRIES[0]
    );
  });
  const selectedCountryRef = useRef(selectedCountry);
  selectedCountryRef.current = selectedCountry;
  const [pendingPhone, setPendingPhoneState] = useState(() => {
    try {
      return sessionStorage.getItem('pk_pending_phone') || '';
    } catch {
      return '';
    }
  });
  const pendingPhoneRef = useRef(pendingPhone);
  const setPendingPhone = useCallback((phone: string) => {
    pendingPhoneRef.current = phone;
    setPendingPhoneState(phone);
    try {
      if (phone) {
        sessionStorage.setItem('pk_pending_phone', phone);
      } else {
        sessionStorage.removeItem('pk_pending_phone');
      }
    } catch {
      // Ignore storage errors
    }
  }, []);
  const pendingFullNameRef = useRef('');
  const setPendingFullName = useCallback((name: string) => {
    pendingFullNameRef.current = name.trim().slice(0, 100);
    try {
      if (pendingFullNameRef.current) {
        sessionStorage.setItem('pk_pending_fullname', pendingFullNameRef.current);
      } else {
        sessionStorage.removeItem('pk_pending_fullname');
      }
    } catch {
      // Ignore storage restrictions
    }
  }, []);
  const pendingLangRef = useRef<{ code: string; name: string } | null>(null);
  const setPendingLang = useCallback((lang: { code: string; name: string } | null) => {
    pendingLangRef.current = lang;
    try {
      if (lang) {
        sessionStorage.setItem('pk_pending_lang', JSON.stringify(lang));
      } else {
        sessionStorage.removeItem('pk_pending_lang');
      }
    } catch {
      // Ignore storage restrictions
    }
  }, []);
  const [otpConfirmation, setOtpConfirmation] = useState<ConfirmationResult | null>(null);
  const [otpChannelMode, setOtpChannelMode] = useState<'firebase' | 'gateway' | 'preview_test'>('firebase');
  const [otpReadiness, setOtpReadiness] = useState<OtpReadinessStatus | null>(null);
  const [isWebPreviewTestSession, setIsWebPreviewTestSession] = useState(false);
  const [isLocalPreviewSession, setIsLocalPreviewSession] = useState(false);
  const [otpStatusMessage, setOtpStatusMessage] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpErrorCode, setOtpErrorCode] = useState<string | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  const currentDeviceId = useMemo(() => getOrCreateDeviceId(), []);
  const [e2eeFingerprint, setE2eeFingerprint] = useState('');
  const [e2eePubKey, setE2eePubKey] = useState('');
  const e2eePubKeyRef = useRef(e2eePubKey);
  e2eePubKeyRef.current = e2eePubKey;

  // Firestore synced states
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [userAccountLoaded, setUserAccountLoaded] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileMedia, setProfileMedia] = useState<ProfileMediaRecord | null>(null);
  const [profileMediaCache, setProfileMediaCache] = useState<Record<string, ProfileMediaRecord | null>>({});
  const [profileSyncLoading, setProfileSyncLoading] = useState(false);
  const [profileSyncError, setProfileSyncError] = useState<string | null>(null);
  const [directoryProfiles, setDirectoryProfiles] = useState<UserProfile[]>([]);
  const [languagePref, setLanguagePref] = useState<LanguagePreference | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [userDevices, setUserDevices] = useState<UserDevice[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [directChats, setDirectChats] = useState<DirectChat[]>([]);
  const [groupChats, setGroupChats] = useState<GroupChat[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [translations, setTranslations] = useState<TranslatedMessage[]>([]);
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [customWallpapers, setCustomWallpapers] = useState<WallpaperItem[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [locationConsent, setLocationConsent] = useState<LocationConsentRecord | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const autoCleanedCountryEmergencyUidRef = useRef<string | null>(null);
  const [worldLanguages, setWorldLanguages] = useState<LanguageOption[]>(WORLD_LANGUAGES_CATALOG);
  const [worldLanguagesVersion, setWorldLanguagesVersion] = useState<string>('v1-base');
  const [appLanguageLocal, setAppLanguageLocal] = useState<string | null>(() => {
    try {
      return localStorage.getItem('pk_app_language_v1');
    } catch {
      return null;
    }
  });
  const [appLanguageNameLocal, setAppLanguageNameLocal] = useState<string | null>(() => {
    try {
      return localStorage.getItem('pk_app_language_name_v1');
    } catch {
      return null;
    }
  });
  const lastTravelGeoAtRef = useRef<number>(0);
  const [sosAlerts, setSosAlerts] = useState<SosAlert[]>([]);
  const [firestoreDisasters, setFirestoreDisasters] = useState<DisasterAlert[]>([]);
  const [officialFeedDisasters, setOfficialFeedDisasters] = useState<DisasterAlert[]>([]);
  const [disasterFeedErrors, setDisasterFeedErrors] = useState<string[]>([]);
  const [securityLogs, setSecurityLogs] = useState<SecurityLogItem[]>([]);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; category: string; title: string; body: string; read: boolean; createdAt?: unknown }>
  >([]);
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [incomingContactRequests, setIncomingContactRequests] = useState<ContactRequest[]>([]);
  const [outgoingContactRequests, setOutgoingContactRequests] = useState<ContactRequest[]>([]);
  const [ownStatuses, setOwnStatuses] = useState<StatusUpdate[]>([]);
  const [sharedStatuses, setSharedStatuses] = useState<StatusUpdate[]>([]);
  const [statusNowMs, setStatusNowMs] = useState<number>(() => Date.now());
  const [msgNowMs, setMsgNowMs] = useState<number>(() => Date.now());
  const [statusPrivacyDefault, setStatusPrivacyDefault] = useState<StatusPrivacyMode>(() => {
    try {
      const saved = localStorage.getItem('pk_status_privacy_mode');
      if (saved === 'contacts' || saved === 'contacts_except' || saved === 'only_share_with') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'contacts';
  });
  const [statusExcludedDefault, setStatusExcludedDefault] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('pk_status_excluded_uids');
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [statusAllowedDefault, setStatusAllowedDefault] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('pk_status_allowed_uids');
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChatType, setActiveChatType] = useState<'direct' | 'group'>('direct');
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [adminMfaVerified, setAdminMfaVerified] = useState(false);

  // Global Security Lockdown & PKC Security Shield States (Gmail OAuth token kept STRICTLY in React memory)
  const [globalSecurityState, setGlobalSecurityState] = useState<GlobalSecurityState>(DEFAULT_SECURITY_STATE);
  const [securityIncidents, setSecurityIncidents] = useState<SecurityIncident[]>([]);
  const [securityAuditLogs, setSecurityAuditLogs] = useState<SecurityAuditLog[]>([]);
  const [gmailApprovals, setGmailApprovals] = useState<GmailApprovalRequest[]>([]);
  const [recheckCountdown, setRecheckCountdown] = useState(10);
  const [isVoiceSpeaking, setIsVoiceSpeaking] = useState(false);
  const [gmailAccessToken, setGmailAccessToken] = useState<string | null>(null);
  const lastAnnouncedSecurityRef = useRef<string>('NORMAL');

  // Instant Weather, Intentional Data-Off & Incoming Urgent SOS Siren Alert States
  const [intentionalDataOff, setIntentionalDataOffState] = useState<boolean>(() => isIntentionalDataOff());
  const [weatherSnapshot, setWeatherSnapshot] = useState<WeatherSnapshot>(() =>
    getInstantWeatherSnapshot({ countryCode: selectedCountry.code })
  );
  const [incomingSosSiren, setIncomingSosSiren] = useState<EmergencySirenAlertPayload | null>(null);
  const seenSirenIdsRef = useRef<Set<string>>(new Set());
  const [offlineQueuedRecords, setOfflineQueuedRecords] = useState<OfflineQueuedMessageRecord[]>(() =>
    getOfflineOutbox()
  );
  const flushingOutboxRef = useRef(false);

  const isAdminUser = useMemo(() => {
    if (!firebaseUser?.email || !firebaseUser.emailVerified) return false;
    return OWNER_EMAILS.has(firebaseUser.email.trim().toLowerCase());
  }, [firebaseUser]);

  const setActiveScreen = useCallback((screen: ScreenId) => {
    setActiveScreenState(screen);
  }, []);

  const setActiveChat = useCallback((chatId: string | null, type: 'direct' | 'group' = 'direct') => {
    setActiveChatId(chatId);
    setActiveChatType(type);
  }, []);

  const clearNetworkError = useCallback(() => {
    setNetworkError(null);
  }, []);

  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const messagesInitializedRef = useRef(false);

  const retryConnection = useCallback(async () => {
    const ok = await testFirestoreConnection();
    setFirestoreConnected(ok);
    if (ok) {
      setNetworkError(null);
    } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setNetworkError('Offline mode active. Queued messages will sync automatically when connected.');
    }
  }, []);

  // Boot connection test, online auto-recovery, OAuth redirect completion & E2EE keypair initialization
  useEffect(() => {
    testFirestoreConnection().then((ok) => {
      setFirestoreConnected(ok);
      if (ok) {
        setNetworkError(null);
      } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setNetworkError('Offline mode active. Queued messages will sync automatically when connected.');
      } else {
        // Keep persistent local cache silently active on slow/mobile networks without jarring warning banners
        setNetworkError(null);
      }
    });
    const onOnline = () => {
      void retryConnection();
    };
    window.addEventListener('online', onOnline);
    authPersistenceReady
      .then(() => getRedirectResult(auth))
      .then((redirectRes) => {
        if (redirectRes?.user) {
          setFirebaseUser(redirectRes.user);
          setOtpError(null);
          setOtpErrorCode(null);
          setOtpStatusMessage('Google Sign-In completed! Loading PK Chat...');
          const deepClassRoom =
            typeof window !== 'undefined' ? parseClassRoomFromInput(window.location.href) : null;
          setActiveScreenState(deepClassRoom ? 'class_room' : 'home');
        }
      })
      .catch((err) => {
        if (err && typeof err === 'object') {
          const fbErr = err as { code?: string; message?: string };
          const friendly = mapOAuthSignInError(fbErr, 'Google');
          setOtpErrorCode(fbErr.code || 'auth/redirect-failed');
          setOtpError(friendly);
        }
      });
    getOrCreateE2eeKeyPair()
      .then(({ publicKeyBase64, fingerprint }) => {
        setE2eePubKey(publicKeyBase64);
        e2eePubKeyRef.current = publicKeyBase64;
        setE2eeFingerprint(fingerprint);
      })
      .catch(() => {});
    return () => {
      window.removeEventListener('online', onOnline);
    };
  }, [retryConnection]);

  // Authenticated session resume check: enter PK Chat dashboard immediately after Google/Gmail or phone sign-in
  useEffect(() => {
    if (!authReady) return;
    if (!firebaseUser) {
      if (activeScreen === 'splash') {
        setActiveScreenState('welcome');
      }
      return;
    }
    if (!isVerifiedAccountUser(firebaseUser)) {
      if (activeScreen === 'splash' || activeScreen === 'welcome') {
        setActiveScreenState('phone_register');
      }
      return;
    }
    try {
      const seqDone = localStorage.getItem(`pk_seq_onboarding_done_${firebaseUser.uid}`) === '1';
      const isGoogleOrEmailUser = Boolean(
        firebaseUser.email ||
          firebaseUser.providerData?.some((p) => p.providerId === 'google.com')
      );
      const hasCompleteCloudAccount = Boolean(
        userProfile && (isGoogleOrEmailUser || userAccount?.phoneNumber || firebaseUser.phoneNumber)
      );
      if (
        (seqDone || hasCompleteCloudAccount || isGoogleOrEmailUser) &&
        (activeScreen === 'splash' || activeScreen === 'welcome' || activeScreen === 'phone_register')
      ) {
        const deepClassRoom =
          typeof window !== 'undefined' ? parseClassRoomFromInput(window.location.href) : null;
        setActiveScreenState(deepClassRoom ? 'class_room' : 'home');
      }
    } catch {
      // Storage check skipped safely in restricted iframe previews
    }
  }, [authReady, firebaseUser, activeScreen, userProfile, userAccount?.phoneNumber]);

  // Permanent Light-Blue Frosted-Glass Theme Lock (Dark mode disabled across all screens)
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
  }, [userSettings?.theme]);

  const claimUniquePhoneTransaction = useCallback(
    async (params: {
      user: User;
      phoneRaw: string;
      dialCode: string;
      countryName: string;
      discoverable: boolean;
      fallbackName?: string;
      preferredLanguage?: string;
      preferredLanguageName?: string;
    }): Promise<{ validPhone: string; phoneHash: string }> => {
      const uid = params.user.uid;
      const normalized = normalizePhoneToE164(params.phoneRaw.trim(), params.dialCode);
      const digitCount = normalized.replace(/\D/g, '').length;
      if (!normalized || digitCount < 8 || digitCount > 15) {
        throw new Error(
          'Enter a valid mobile phone number (8 to 15 digits including country code).'
        );
      }
      const newHash = await hashPhoneE164(normalized);

      const userDocRef = doc(db, 'users', uid);
      const profileDocRef = doc(db, 'user_profiles', uid);
      const newDirRef = doc(db, 'phone_directory', newHash);

      await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userDocRef);
        const profileSnap = await tx.get(profileDocRef);

        const allowTestBypassOverride = isWebPreviewTestPhoneBypass(normalized);
        let dirAlreadyClaimedByAnother = false;
        let newDirSnap = null;
        try {
          newDirSnap = await tx.get(newDirRef);
          if (newDirSnap.exists() && newDirSnap.data()?.userId !== uid) {
            dirAlreadyClaimedByAnother = true;
          }
        } catch (err) {
          const code = (err as { code?: string })?.code || '';
          const msg = (err instanceof Error ? err.message : '').toLowerCase();
          if (code.includes('permission-denied') || msg.includes('permission')) {
            dirAlreadyClaimedByAnother = true;
          } else {
            throw err;
          }
        }

        if (dirAlreadyClaimedByAnother && !allowTestBypassOverride) {
          throw new Error(
            'This mobile phone number is already registered to another PK Chat account.'
          );
        }

        const prevPhone = userSnap.exists()
          ? String(userSnap.data()?.phoneNumber || '').trim()
          : '';
        let oldDirRef: ReturnType<typeof doc> | null = null;
        let oldDirSnap = null;
        if (prevPhone && prevPhone !== normalized) {
          const oldHash = await hashPhoneE164(prevPhone);
          oldDirRef = doc(db, 'phone_directory', oldHash);
          try {
            oldDirSnap = await tx.get(oldDirRef);
          } catch {
            oldDirSnap = null;
          }
        }

        const profData = profileSnap.exists() ? (profileSnap.data() as UserProfile) : null;
        const rawEmailName = params.user.email
          ? params.user.email.split('@')[0].replace(/[._-]+/g, ' ').trim()
          : '';
        const resolvedName = (
          params.fallbackName ||
          profData?.fullName ||
          params.user.displayName ||
          rawEmailName ||
          'PK Chat Member'
        )
          .trim()
          .slice(0, 100);
        const resolvedCountry =
          profData?.country || params.countryName || selectedCountryRef.current.name || 'Global';
        const resolvedLang = params.preferredLanguage || profData?.preferredLanguage || 'en';
        const resolvedLangName =
          params.preferredLanguageName || profData?.preferredLanguageName || 'English';

        if (oldDirRef && oldDirSnap && oldDirSnap.exists() && oldDirSnap.data()?.userId === uid) {
          tx.delete(oldDirRef);
        }

        if (!dirAlreadyClaimedByAnother) {
          if (newDirSnap && newDirSnap.exists()) {
            tx.update(newDirRef, {
              fullName: resolvedName,
              country: resolvedCountry,
              preferredLanguage: resolvedLang,
              preferredLanguageName: resolvedLangName,
              discoverable: params.discoverable,
              updatedAt: serverTimestamp(),
            });
          } else {
            tx.set(newDirRef, {
              phoneHash: newHash,
              userId: uid,
              fullName: resolvedName,
              country: resolvedCountry,
              preferredLanguage: resolvedLang,
              preferredLanguageName: resolvedLangName,
              discoverable: params.discoverable,
              updatedAt: serverTimestamp(),
            });
          }
        }

        if (userSnap.exists()) {
          tx.update(userDocRef, {
            phoneNumber: normalized,
            country: resolvedCountry,
            countryDialCode: params.dialCode,
            phoneDiscoveryEnabled: params.discoverable,
            ...(params.user.email
              ? { email: params.user.email, recoveryEmail: params.user.email }
              : {}),
            updatedAt: serverTimestamp(),
          });
        } else {
          tx.set(userDocRef, {
            uid,
            ...(params.user.email
              ? { email: params.user.email, recoveryEmail: params.user.email }
              : {}),
            phoneNumber: normalized,
            country: resolvedCountry,
            countryDialCode: params.dialCode,
            phoneDiscoveryEnabled: params.discoverable,
            accountStatus: 'active',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      });

      return { validPhone: normalized, phoneHash: newHash };
    },
    []
  );

  const provisionEmailVerifiedAccount = useCallback(
    async (user: User) => {
      const uid = user.uid;
      const countryCfg = selectedCountryRef.current;
      const pubKey = e2eePubKeyRef.current || '';
      const [profileSnap, userSnap, langSnap, settingsSnap, devSnap, subSnap] = await Promise.all([
        getDoc(doc(db, 'user_profiles', uid)),
        getDoc(doc(db, 'users', uid)),
        getDoc(doc(db, 'language_preferences', uid)),
        getDoc(doc(db, 'user_settings', uid)),
        getDoc(doc(db, 'user_devices', currentDeviceId)),
        getDoc(doc(db, 'subscriptions', uid)),
      ]);
      const existingPhone = userSnap.exists()
        ? (userSnap.data()?.phoneNumber as string | undefined)
        : undefined;
      const rawPending = (pendingPhoneRef.current || '').trim();
      const normalizedPending = rawPending
        ? normalizePhoneToE164(rawPending, countryCfg.dialCode)
        : '';
      const validPendingPhone =
        normalizedPending.replace(/\D/g, '').length >= 8 &&
        normalizedPending.replace(/\D/g, '').length <= 15
          ? normalizedPending
          : '';

      if (profileSnap.exists()) {
        const existingProfile = profileSnap.data() as UserProfile;
        if (devSnap.exists() && devSnap.data()?.trusted === false && devSnap.data()?.userId === uid) {
          await signOut(auth);
          setGmailAccessToken(null);
          setActiveScreenState('welcome');
          return;
        }
        if (devSnap.exists() && devSnap.data()?.trusted === true && devSnap.data()?.userId === uid) {
          updateDoc(doc(db, 'user_devices', currentDeviceId), { lastActiveAt: serverTimestamp() }).catch(() => {});
        }
        if (validPendingPhone) {
          try {
            await claimUniquePhoneTransaction({
              user,
              phoneRaw: validPendingPhone,
              dialCode: countryCfg.dialCode,
              countryName: existingProfile.country || countryCfg.name,
              discoverable: true,
              fallbackName: existingProfile.fullName,
              preferredLanguage: existingProfile.preferredLanguage,
              preferredLanguageName: existingProfile.preferredLanguageName,
            });
            setPendingPhone('');
          } catch (err) {
            setPendingPhone('');
            setOtpError(
              err instanceof Error
                ? err.message
                : 'Unable to claim phone number. Please enter a unique mobile number.'
            );
          }
        } else if (existingPhone && existingPhone.trim()) {
          // Ensure legacy accounts have an active uniqueness lock in phone_directory
          try {
            const existingHash = await hashPhoneE164(existingPhone.trim());
            const existingDirSnap = await getDoc(doc(db, 'phone_directory', existingHash));
            if (!existingDirSnap.exists()) {
              await setDoc(doc(db, 'phone_directory', existingHash), {
                phoneHash: existingHash,
                userId: uid,
                fullName: (existingProfile.fullName || 'PK Chat Member').slice(0, 100),
                country: existingProfile.country || countryCfg.name,
                preferredLanguage: existingProfile.preferredLanguage || 'en',
                preferredLanguageName: existingProfile.preferredLanguageName || 'English',
                discoverable: Boolean(userSnap.data()?.phoneDiscoveryEnabled ?? true),
                updatedAt: serverTimestamp(),
              });
            }
          } catch {
            // Non-blocking lock backfill
          }
        }

        const refreshedUserSnap = await getDoc(doc(db, 'users', uid));
        const refreshedUser = refreshedUserSnap.exists()
          ? (refreshedUserSnap.data() as UserAccount)
          : null;
        setUserAccount(refreshedUser);
        setUserAccountLoaded(true);
        setUserProfile(existingProfile);

        let seqAlreadyCompleted = Boolean(
          refreshedUser?.phoneNumber ||
            user.phoneNumber ||
            user.email ||
            user.providerData?.some((p) => p.providerId === 'google.com')
        );
        try {
          if (localStorage.getItem(`pk_seq_onboarding_done_${uid}`) === '1') {
            seqAlreadyCompleted = true;
          } else if (seqAlreadyCompleted) {
            localStorage.setItem(`pk_seq_onboarding_done_${uid}`, '1');
          }
        } catch {
          // ignore storage limits
        }

        if (seqAlreadyCompleted) {
          const deepClassRoom =
            typeof window !== 'undefined' ? parseClassRoomFromInput(window.location.href) : null;
          setActiveScreenState((prev) =>
            prev === 'splash' ||
            prev === 'welcome' ||
            prev === 'phone_register' ||
            prev === 'profile_create' ||
            prev === 'language_select'
              ? deepClassRoom
                ? 'class_room'
                : 'home'
              : prev
          );
        }
        return;
      }

      if (isVerifiedAccountUser(user)) {
        const isApple = user.providerData.some((p) => p.providerId === 'apple.com');
        let storedPendingName = pendingFullNameRef.current;
        if (!storedPendingName) {
          try {
            storedPendingName = sessionStorage.getItem('pk_pending_fullname') || '';
          } catch {
            // ignore
          }
        }
        const cleanedEmailPrefix = user.email
          ? user.email.split('@')[0].replace(/[._-]+/g, ' ').trim()
          : '';
        const defaultName = (
          storedPendingName ||
          user.displayName ||
          cleanedEmailPrefix ||
          user.phoneNumber ||
          (isApple ? 'PK Chat Apple User' : 'PK Chat Member')
        )
          .trim()
          .slice(0, 100);
        setPendingFullName('');
        let chosenPendingLang = pendingLangRef.current;
        if (!chosenPendingLang) {
          try {
            const rawLang = sessionStorage.getItem('pk_pending_lang');
            if (rawLang) chosenPendingLang = JSON.parse(rawLang) as { code: string; name: string };
          } catch {
            // ignore
          }
        }
        const resolvedLangCode = chosenPendingLang?.code || 'en';
        const resolvedLangName = chosenPendingLang?.name || 'English';
        setPendingLang(null);
        const userPayload: Record<string, unknown> = {
          uid,
          country: countryCfg.name,
          countryDialCode: countryCfg.dialCode,
          phoneDiscoveryEnabled: false,
          accountStatus: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (user.email) {
          userPayload.email = user.email;
          userPayload.recoveryEmail = user.email;
        }
        const profilePayload: UserProfile = {
          uid,
          fullName: defaultName,
          about: 'Hey there! I am using PK CHAT.',
          avatarUrl: user.photoURL || '',
          country: countryCfg.name,
          countryCode: countryCfg.code,
          preferredLanguage: resolvedLangCode,
          preferredLanguageName: resolvedLangName,
          e2eePublicKey: pubKey,
          onlineStatus: isIntentionalDataOff() ? 'offline' : 'online',
        };

        const writes: Array<Promise<unknown>> = [];
        if (userSnap.exists()) {
          writes.push(
            updateDoc(doc(db, 'users', uid), {
              country: countryCfg.name,
              countryDialCode: countryCfg.dialCode,
              ...(user.email ? { email: user.email, recoveryEmail: user.email } : {}),
              updatedAt: serverTimestamp(),
            })
          );
        } else {
          writes.push(setDoc(doc(db, 'users', uid), userPayload));
        }

        writes.push(
          setDoc(doc(db, 'user_profiles', uid), {
            ...profilePayload,
            lastSeen: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );

        if (!langSnap.exists()) {
          writes.push(
            setDoc(doc(db, 'language_preferences', uid), {
              userId: uid,
              primaryLanguage: resolvedLangCode,
              primaryLanguageName: resolvedLangName,
              autoDetect: true,
              preserveOriginal: true,
              defaultViewMode: 'translated',
              voiceTranslationEnabled: true,
              ttsVoice: 'Kore',
              updatedAt: serverTimestamp(),
            })
          );
        }

        if (!settingsSnap.exists()) {
          writes.push(
            setDoc(doc(db, 'user_settings', uid), {
              userId: uid,
              theme: 'light',
              bubbleColor: 'sky_glass',
              wallpaperId: 'wp_world_peace',
              pinLockEnabled: false,
              biometricEnabled: false,
              readReceipts: true,
              lastSeenVisible: true,
              notificationsEnabled: true,
              voiceSecurityAlertsEnabled: true,
              autoFestivalGreetEnabled: true,
              updatedAt: serverTimestamp(),
            })
          );
        }

        if (devSnap.exists() && devSnap.data()?.userId === uid) {
          writes.push(
            updateDoc(doc(db, 'user_devices', currentDeviceId), {
              lastActiveAt: serverTimestamp(),
            })
          );
        } else if (!devSnap.exists()) {
          writes.push(
            setDoc(doc(db, 'user_devices', currentDeviceId), {
              deviceId: currentDeviceId,
              userId: uid,
              deviceName: `${detectPlatformLabel()} Browser`,
              platform: detectPlatformLabel(),
              trusted: true,
              otpVerifiedAt: serverTimestamp(),
              lastActiveAt: serverTimestamp(),
              createdAt: serverTimestamp(),
            })
          );
        }

        const bootstrapPhone = existingPhone || validPendingPhone || user.phoneNumber || '';
        const isVipFounderBootstrap = isVipFounderFreeNumber(bootstrapPhone);

        if (!subSnap.exists() || (isVipFounderBootstrap && subSnap.data()?.plan !== 'free')) {
          if (isVipFounderBootstrap) {
            writes.push(
              setDoc(
                doc(db, 'subscriptions', uid),
                {
                  userId: uid,
                  plan: 'free',
                  status: 'active',
                  monthlyPriceUsd: 0,
                  autoRenew: false,
                  paymentMode: 'test',
                  currentPeriodEnd: Timestamp.fromDate(new Date('2099-12-31T23:59:59.000Z')),
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              )
            );
          } else {
            writes.push(
              setDoc(doc(db, 'subscriptions', uid), {
                userId: uid,
                plan: 'trial',
                status: 'trialing',
                monthlyPriceUsd: 10,
                autoRenew: true,
                paymentMode: 'test',
                trialStartAt: serverTimestamp(),
                trialEndAt: Timestamp.fromDate(
                  new Date(Date.now() + STANDARD_FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000)
                ),
                currentPeriodEnd: Timestamp.fromDate(
                  new Date(Date.now() + STANDARD_FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000)
                ),
                updatedAt: serverTimestamp(),
              })
            );
          }
        }

        await Promise.all(writes);

        let claimedPhone = existingPhone || '';
        const phoneToClaim =
          validPendingPhone ||
          (!existingPhone && user.phoneNumber
            ? normalizePhoneToE164(user.phoneNumber, countryCfg.dialCode)
            : '');
        if (phoneToClaim) {
          try {
            const res = await claimUniquePhoneTransaction({
              user,
              phoneRaw: phoneToClaim,
              dialCode: countryCfg.dialCode,
              countryName: countryCfg.name,
              discoverable: true,
              fallbackName: defaultName,
              preferredLanguage: resolvedLangCode,
              preferredLanguageName: resolvedLangName,
            });
            claimedPhone = res.validPhone;
            setPendingPhone('');
          } catch (err) {
            setPendingPhone('');
            setOtpError(
              err instanceof Error
                ? err.message
                : 'This mobile phone number is already registered to another PK Chat account.'
            );
          }
        }

        try {
          if (!localStorage.getItem('pk_chat_trial_start')) {
            localStorage.setItem('pk_chat_trial_start', Date.now().toString());
          }
          if (!localStorage.getItem('pk_chat_language')) {
            localStorage.setItem('pk_chat_language', resolvedLangName);
          }
        } catch {
          // Ignore storage restrictions in preview mode
        }

        setUserAccount({
          uid,
          phoneNumber: claimedPhone || undefined,
          email: user.email || undefined,
          country: countryCfg.name,
          countryDialCode: countryCfg.dialCode,
          recoveryEmail: user.email || undefined,
          phoneDiscoveryEnabled: Boolean(claimedPhone),
          accountStatus: 'active',
        });
        setUserAccountLoaded(true);
        setUserProfile(profilePayload);
        const isAuthenticatedReadyNow = Boolean(
          claimedPhone ||
            user.phoneNumber ||
            user.email ||
            user.isAnonymous ||
            user.providerData?.some((p) => p.providerId === 'google.com')
        );
        if (isAuthenticatedReadyNow) {
          try {
            localStorage.setItem(`pk_seq_onboarding_done_${uid}`, '1');
          } catch {
            // ignore storage errors
          }
          const deepClassRoom =
            typeof window !== 'undefined' ? parseClassRoomFromInput(window.location.href) : null;
          setActiveScreenState(deepClassRoom ? 'class_room' : 'home');
        }
      } else {
        setUserAccountLoaded(true);
        setUserProfile(null);
        setActiveScreenState('phone_register');
      }
    },
    [claimUniquePhoneTransaction, currentDeviceId, setPendingFullName, setPendingLang, setPendingPhone]
  );

  // Auth listener with Email/Gmail-first auto-account onboarding (immediate dashboard entry on sign-in)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (user) {
        setOtpError(null);
        setOtpErrorCode(null);
        try {
          await provisionEmailVerifiedAccount(user);
        } catch (err) {
          console.warn('Firestore profile bootstrap fallback after auth:', err);
          // Even if Firestore is temporarily slow/offline right after sign-in, enter the dashboard cleanly
          const countryCfg = selectedCountryRef.current;
          const fallbackName = (
            user.displayName ||
            (user.email ? user.email.split('@')[0].replace(/[._-]+/g, ' ').trim() : '') ||
            'PK Chat Member'
          ).slice(0, 100);
          setUserAccount((prev) =>
            prev || {
              uid: user.uid,
              email: user.email || undefined,
              phoneNumber: user.phoneNumber || undefined,
              country: countryCfg.name,
              countryDialCode: countryCfg.dialCode,
              recoveryEmail: user.email || undefined,
              phoneDiscoveryEnabled: false,
              accountStatus: 'active',
            }
          );
          setUserAccountLoaded(true);
          setUserProfile((prev) =>
            prev || {
              uid: user.uid,
              fullName: fallbackName,
              about: 'Hey there! I am using PK CHAT.',
              avatarUrl: user.photoURL || '',
              country: countryCfg.name,
              countryCode: countryCfg.code,
              preferredLanguage: 'en',
              preferredLanguageName: 'English',
              e2eePublicKey: e2eePubKeyRef.current || '',
              onlineStatus: isIntentionalDataOff() ? 'offline' : 'online',
            }
          );
          const deepClassRoom =
            typeof window !== 'undefined' ? parseClassRoomFromInput(window.location.href) : null;
          setActiveScreenState((prev) =>
            prev === 'splash' || prev === 'welcome' || prev === 'phone_register'
              ? deepClassRoom
                ? 'class_room'
                : 'home'
              : prev
          );
        }
      } else {
        setGmailAccessToken(null);
        setUserAccount(null);
        setUserAccountLoaded(false);
        setUserProfile(null);
        setProfileMedia(null);
        setProfileMediaCache({});
        setProfileSyncError(null);
        setLanguagePref(null);
        setUserSettings(null);
        setContacts([]);
        setDirectChats([]);
        setGroupChats([]);
        setMessages([]);
        setTranslations([]);
        setCallRecords([]);
        setSubscription(null);
        setPaymentRecords([]);
        setEmergencyContacts([]);
        setLocationConsent(null);
        setLocationError(null);
        autoCleanedCountryEmergencyUidRef.current = null;
        setSosAlerts([]);
        setSecurityLogs([]);
        setNotifications([]);
        setIncomingContactRequests([]);
        setOutgoingContactRequests([]);
        setOwnStatuses([]);
        setSharedStatuses([]);
        setAdminMfaVerified(false);
      }
    });
    return () => unsub();
  }, [provisionEmailVerifiedAccount]);

  // Firestore real-time listeners (strictly gated on authReady && firebaseUser)
  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    const uid = firebaseUser.uid;
    knownMessageIdsRef.current = new Set();
    messagesInitializedRef.current = false;

    const markCloudConnected = (fromCache: boolean) => {
      if (!fromCache) {
        setFirestoreConnected(true);
        setNetworkError(null);
      }
    };

    // Automatically remove legacy government/country emergency records on sign-in while keeping Personal SOS Contacts safe
    if (autoCleanedCountryEmergencyUidRef.current !== uid) {
      autoCleanedCountryEmergencyUidRef.current = uid;
      autoDeleteCountryEmergencyData(uid).catch((err) => {
        console.warn('Legacy country emergency auto-delete skipped:', err);
      });
    }

    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          markCloudConnected(snap.metadata.fromCache);
          setUserAccount(snap.exists() ? (snap.data() as UserAccount) : null);
          setUserAccountLoaded(true);
        },
        (err) => {
          setUserAccountLoaded(true);
          handleFirestoreError(err, OperationType.GET, `users/${uid}`);
        }
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'user_profiles', uid),
        (snap) => setUserProfile(snap.exists() ? (snap.data() as UserProfile) : null),
        (err) => handleFirestoreError(err, OperationType.GET, `user_profiles/${uid}`)
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'profile_media', uid),
        (snap) => {
          if (snap.exists()) {
            const media = snap.data() as ProfileMediaRecord;
            setProfileMedia(media);
            setProfileMediaCache((prev) => ({ ...prev, [uid]: media }));
          } else {
            setProfileMedia(null);
          }
        },
        () => {
          // Graceful fallback before initial profile_media document creation
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'user_profiles'), limit(50)),
        (snap) => setDirectoryProfiles(snap.docs.map((d) => d.data() as UserProfile)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'user_profiles')
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'language_preferences', uid),
        (snap) => setLanguagePref(snap.exists() ? (snap.data() as LanguagePreference) : null),
        (err) => handleFirestoreError(err, OperationType.GET, `language_preferences/${uid}`)
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'user_settings', uid),
        (snap) => {
          if (snap.exists()) {
            const s = snap.data() as UserSettings;
            setUserSettings(s);
            if (s.pinLockEnabled && s.appLockPinHash && !sessionStorage.getItem(`pk_unlocked_${uid}`)) {
              setIsAppLocked(true);
            }
          } else {
            setUserSettings(null);
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, `user_settings/${uid}`)
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'user_devices'), where('userId', '==', uid)),
        (snap) => setUserDevices(snap.docs.map((d) => d.data() as UserDevice)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'user_devices')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'contacts'), where('ownerId', '==', uid)),
        (snap) =>
          setContacts(snap.docs.map((d) => ({ ...(d.data() as Omit<ContactRecord, 'id'>), id: d.id }))),
        (err) => handleFirestoreError(err, OperationType.LIST, 'contacts')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'chats'), where('participantIds', 'array-contains', uid)),
        (snap) => setDirectChats(snap.docs.map((d) => d.data() as DirectChat)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'chats')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'group_chats'), where('memberIds', 'array-contains', uid)),
        (snap) => setGroupChats(snap.docs.map((d) => d.data() as GroupChat)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'group_chats')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'messages'), where('participantIds', 'array-contains', uid), limit(200)),
        (snap) => {
          markCloudConnected(snap.metadata.fromCache);
          const list = snap.docs.map((d) => d.data() as ChatMessage);
          list.sort((a, b) => {
            const ta = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0;
            const tb = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0;
            return ta - tb;
          });
          if (!messagesInitializedRef.current) {
            list.forEach((m) => {
              if (m.messageId) knownMessageIdsRef.current.add(m.messageId);
            });
            messagesInitializedRef.current = true;
          } else {
            let incomingChannel: 'direct_message' | 'group_message' | null = null;
            for (const msg of list) {
              if (!msg.messageId || knownMessageIdsRef.current.has(msg.messageId)) continue;
              knownMessageIdsRef.current.add(msg.messageId);
              if (!msg.deleted && msg.senderId && msg.senderId !== uid) {
                const sirenMeta = parseSosSirenChatPayload(msg.originalText || '');
                if (sirenMeta && !seenSirenIdsRef.current.has(sirenMeta.alertId)) {
                  seenSirenIdsRef.current.add(sirenMeta.alertId);
                  setIncomingSosSiren({
                    alertId: sirenMeta.alertId,
                    senderUid: msg.senderId,
                    senderName: sirenMeta.senderName || msg.senderName || 'Emergency Contact',
                    latitude: sirenMeta.latitude,
                    longitude: sirenMeta.longitude,
                    accuracyMeters: sirenMeta.accuracyMeters,
                    recipientUids: [uid],
                    recipientPhones: [],
                    createdAtMs: Date.now(),
                    mode: 'urgent_siren',
                  });
                  startUrgentSosSiren();
                } else {
                  incomingChannel = msg.chatType === 'group' ? 'group_message' : 'direct_message';
                }
              }
            }
            if (incomingChannel) {
              playNotificationTone(incomingChannel);
            }
          }
          setMessages(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'messages')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'translated_messages'), where('participantIds', 'array-contains', uid), limit(300)),
        (snap) =>
          setTranslations(
            snap.docs.map((d) => ({ ...(d.data() as Omit<TranslatedMessage, 'id'>), id: d.id }))
          ),
        (err) => handleFirestoreError(err, OperationType.LIST, 'translated_messages')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'call_records'), where('participantIds', 'array-contains', uid), limit(30)),
        (snap) => setCallRecords(snap.docs.map((d) => d.data() as CallRecord)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'call_records')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'wallpapers'), where('ownerId', '==', uid)),
        (snap) => setCustomWallpapers(snap.docs.map((d) => d.data() as WallpaperItem)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'wallpapers')
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'subscriptions', uid),
        (snap) => setSubscription(snap.exists() ? (snap.data() as SubscriptionRecord) : null),
        (err) => handleFirestoreError(err, OperationType.GET, `subscriptions/${uid}`)
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'payment_records'), where('userId', '==', uid)),
        (snap) => setPaymentRecords(snap.docs.map((d) => d.data() as PaymentRecord)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'payment_records')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'emergency_contacts'), where('userId', '==', uid)),
        (snap) =>
          setEmergencyContacts(
            snap.docs.map((d) => ({ ...(d.data() as Omit<EmergencyContact, 'id'>), id: d.id }))
          ),
        (err) => handleFirestoreError(err, OperationType.LIST, 'emergency_contacts')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'sos_alerts'), where('userId', '==', uid)),
        (snap) => setSosAlerts(snap.docs.map((d) => d.data() as SosAlert)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'sos_alerts')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'disaster_alerts'), where('verifiedOfficial', '==', true), limit(25)),
        (snap) => setFirestoreDisasters(snap.docs.map((d) => d.data() as DisasterAlert)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'disaster_alerts')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'security_logs'), where('userId', '==', uid), orderBy('createdAt', 'desc'), limit(40)),
        (snap) =>
          setSecurityLogs(
            snap.docs.map((d) => ({ ...(d.data() as Omit<SecurityLogItem, 'id'>), id: d.id }))
          ),
        (err) => {
          // Fallback if index isn't built yet
          console.warn('security_logs ordered query fallback:', err);
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'notifications'), where('userId', '==', uid), limit(30)),
        (snap) =>
          setNotifications(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as { category: string; title: string; body: string; read: boolean; createdAt?: unknown }),
            }))
          ),
        (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'scheduled_posts'), where('senderId', '==', uid), limit(30)),
        (snap) =>
          setScheduledPosts(
            snap.docs.map((d) => ({ ...(d.data() as Omit<ScheduledPost, 'id'>), id: d.id }))
          ),
        (err) => handleFirestoreError(err, OperationType.LIST, 'scheduled_posts')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'contact_requests'), where('receiverId', '==', uid), limit(50)),
        (snap) => setIncomingContactRequests(snap.docs.map((d) => d.data() as ContactRequest)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'contact_requests')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'contact_requests'), where('senderId', '==', uid), limit(50)),
        (snap) => setOutgoingContactRequests(snap.docs.map((d) => d.data() as ContactRequest)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'contact_requests')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'statuses'), where('userId', '==', uid), limit(40)),
        (snap) => {
          const allOwn = snap.docs.map((d) => d.data() as StatusUpdate);
          const nowMs = Date.now();
          const activeOwn = allOwn.filter((s) => isStatusActive(s, nowMs));
          setOwnStatuses(activeOwn);

          // Best-effort automatic expiration cleanup for owner's own expired statuses (> 24h)
          allOwn
            .filter((s) => !isStatusActive(s, nowMs))
            .forEach((expired) => {
              deleteStatusMediaFromStorage(expired.storagePath).catch(() => {});
              deleteDoc(doc(db, 'statuses', expired.statusId)).catch(() => {});
            });
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'statuses')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'statuses'), where('authorizedViewerIds', 'array-contains', uid), limit(120)),
        (snap) => {
          const items = snap.docs.map((d) => d.data() as StatusUpdate);
          setSharedStatuses(items);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'statuses')
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'location_consents', uid),
        (snap) => {
          if (snap.exists()) {
            setLocationConsent(snap.data() as LocationConsentRecord);
          }
        },
        () => {
          // Safe fallback if doc does not exist yet
        }
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, firebaseUser]);

  // Global Security Status Listener (Firestore /system_security/global + Express /api/security/status + 10s Recheck Loop)
  const refreshSecurityStatus = useCallback(async () => {
    try {
      const payload = await fetchSecurityStatus();
      setGlobalSecurityState(payload.state);
      setSecurityIncidents(payload.incidents || []);
      setSecurityAuditLogs(payload.auditLogs || []);
      setGmailApprovals(payload.approvals || []);
    } catch {
      // Retain last known security state on transient offline glitch
    }
  }, []);

  useEffect(() => {
    refreshSecurityStatus();
    let tickCount = 0;
    const pollId = window.setInterval(() => {
      tickCount += 1;
      if (isIntentionalDataOff()) return;
      if (isLowDataPackageActive() && tickCount % 4 !== 0) return;
      void refreshSecurityStatus();
    }, 15_000);
    return () => window.clearInterval(pollId);
  }, [refreshSecurityStatus]);

  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    const unsub = onSnapshot(
      doc(db, 'system_security', 'global'),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as Partial<GlobalSecurityState>;
        if (data.status && data.status !== 'NORMAL') {
          setGlobalSecurityState((prev) => ({
            ...prev,
            ...data,
            stateId: 'global',
          }));
        }
      },
      () => {
        // Fallback smoothly to backend /api/security/status if Firestore doc is not yet initialized
      }
    );
    return () => unsub();
  }, [authReady, firebaseUser]);

  const effectivePreferredLangCode =
    languagePref?.primaryLanguage || userProfile?.preferredLanguage || 'en';

  const playCurrentSecurityVoiceAlert = useCallback(async () => {
    const copy = getSecurityCopyForLanguage(effectivePreferredLangCode);
    const script =
      globalSecurityState.status === 'LOCKDOWN'
        ? copy.lockdownVoiceScript
        : globalSecurityState.status === 'RECOVERING'
          ? copy.recoveringVoiceScript
          : copy.restoredVoiceScript;
    setIsVoiceSpeaking(true);
    try {
      await announceSecurityStatusVoice({
        text: script,
        preferredLanguageCode: effectivePreferredLangCode,
        voiceName: languagePref?.ttsVoice || 'Kore',
        voiceAlertsEnabled: userSettings?.voiceSecurityAlertsEnabled !== false,
      });
    } finally {
      setIsVoiceSpeaking(false);
    }
  }, [
    effectivePreferredLangCode,
    globalSecurityState.status,
    languagePref?.ttsVoice,
    userSettings?.voiceSecurityAlertsEnabled,
  ]);

  // Trigger localized voice alert cleanly on status transition
  useEffect(() => {
    const prev = lastAnnouncedSecurityRef.current;
    const next = globalSecurityState.status;
    if (prev === next) return;
    lastAnnouncedSecurityRef.current = next;

    if (userSettings?.voiceSecurityAlertsEnabled === false) return;
    const copy = getSecurityCopyForLanguage(effectivePreferredLangCode);
    const script =
      next === 'LOCKDOWN'
        ? copy.lockdownVoiceScript
        : next === 'RECOVERING'
          ? copy.recoveringVoiceScript
          : copy.restoredVoiceScript;
    setIsVoiceSpeaking(true);
    announceSecurityStatusVoice({
      text: script,
      preferredLanguageCode: effectivePreferredLangCode,
      voiceName: languagePref?.ttsVoice || 'Kore',
      voiceAlertsEnabled: true,
    }).finally(() => setIsVoiceSpeaking(false));
  }, [
    effectivePreferredLangCode,
    globalSecurityState.status,
    languagePref?.ttsVoice,
    userSettings?.voiceSecurityAlertsEnabled,
  ]);

  // Automatic 10-second Recheck Loop during LOCKDOWN or RECOVERING
  useEffect(() => {
    if (globalSecurityState.status === 'NORMAL') {
      setRecheckCountdown(10);
      return;
    }

    let secondsLeft = 10;
    setRecheckCountdown(secondsLeft);

    const ticker = window.setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        secondsLeft = 10;
        recheckSecurityStatus()
          .then((res) => {
            setGlobalSecurityState(res.state);
            refreshSecurityStatus();
          })
          .catch(() => {});
      }
      setRecheckCountdown(secondsLeft);
    }, 1000);

    return () => window.clearInterval(ticker);
  }, [globalSecurityState.status, refreshSecurityStatus]);

  // Load dynamic world language catalog on mount
  useEffect(() => {
    fetchWorldLanguagesCatalog({ includeUnsupported: true })
      .then((res) => {
        if (Array.isArray(res.languages) && res.languages.length > 0) {
          setWorldLanguages(res.languages);
          setWorldLanguagesVersion(res.version || 'v1-live');
        }
      })
      .catch(() => {
        // Resilient fallback to bundled WORLD_LANGUAGES_CATALOG
      });
  }, []);

  const refreshLanguageCatalog = useCallback(async () => {
    await refreshWorldLanguagesCatalog();
    const res = await fetchWorldLanguagesCatalog({ includeUnsupported: true });
    if (Array.isArray(res.languages) && res.languages.length > 0) {
      setWorldLanguages(res.languages);
      setWorldLanguagesVersion(res.version || 'v1-refreshed');
    }
  }, []);

  const appLanguage = useMemo(() => {
    return (
      userSettings?.appLanguage ||
      appLanguageLocal ||
      userProfile?.preferredLanguage ||
      PK_APP_EXPERIENCE.defaultLanguage
    );
  }, [appLanguageLocal, userProfile?.preferredLanguage, userSettings?.appLanguage]);

  const appLanguageName = useMemo(() => {
    if (userSettings?.appLanguageName) return userSettings.appLanguageName;
    if (appLanguageNameLocal) return appLanguageNameLocal;
    const match = worldLanguages.find((l) => l.code.toLowerCase() === appLanguage.toLowerCase());
    return match?.name || userProfile?.preferredLanguageName || 'English';
  }, [appLanguage, appLanguageNameLocal, userProfile?.preferredLanguageName, userSettings?.appLanguageName, worldLanguages]);

  const updateAppLanguage = useCallback(async (code: string, name: string) => {
    const cleanCode = code.trim().slice(0, 16) || 'en';
    const cleanName = name.trim().slice(0, 64) || 'English';
    setAppLanguageLocal(cleanCode);
    setAppLanguageNameLocal(cleanName);
    try {
      localStorage.setItem('pk_app_language_v1', cleanCode);
      localStorage.setItem('pk_app_language_name_v1', cleanName);
    } catch {
      // ignore storage errors
    }

    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      const refDoc = doc(db, 'user_settings', uid);
      const snap = await getDoc(refDoc);
      if (snap.exists()) {
        await updateDoc(refDoc, {
          appLanguage: cleanCode,
          appLanguageName: cleanName,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(refDoc, {
          userId: uid,
          theme: 'light',
          bubbleColor: 'sky_glass',
          wallpaperId: 'wp_world_peace',
          pinLockEnabled: false,
          biometricEnabled: false,
          readReceipts: true,
          lastSeenVisible: true,
          notificationsEnabled: true,
          voiceSecurityAlertsEnabled: true,
          appLanguage: cleanCode,
          appLanguageName: cleanName,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `user_settings/${uid}`);
    }
  }, []);

  const consentedLocation: ConsentedLocation | null = useMemo(() => {
    if (!locationConsent || !locationConsent.sharingActive || locationConsent.locationSource === 'none') {
      return null;
    }
    return {
      latitude: locationConsent.latitude,
      longitude: locationConsent.longitude,
      accuracyMeters: locationConsent.accuracyMeters,
      country: locationConsent.country,
      countryCode: locationConsent.countryCode,
      province: locationConsent.province,
      district: locationConsent.district,
      city: locationConsent.city,
      source: locationConsent.locationSource === 'gps' ? 'gps' : 'manual',
      consentedAt: new Date().toISOString(),
    };
  }, [locationConsent]);

  const persistLocationConsentDoc = useCallback(async (nextRecord: Omit<LocationConsentRecord, 'userId' | 'updatedAt'>) => {
    const uid = auth.currentUser?.uid;
    const optimistic: LocationConsentRecord = {
      userId: uid || 'local_preview',
      ...nextRecord,
    };
    setLocationConsent(optimistic);
    if (!uid) return;
    try {
      await setDoc(doc(db, 'location_consents', uid), {
        userId: uid,
        ...nextRecord,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `location_consents/${uid}`);
    }
  }, []);

  const grantGpsLocation = useCallback(
    async (autoTravelUpdate = false): Promise<ConsentedLocation | null> => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setLocationError('GPS geolocation is unavailable in this browser. Select your location manually.');
        return null;
      }
      setLocationLoading(true);
      setLocationError(null);
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 12_000,
            maximumAge: 60_000,
          });
        });
        const lat = Number(position.coords.latitude.toFixed(5));
        const lng = Number(position.coords.longitude.toFixed(5));
        const acc = Math.round(position.coords.accuracy || 0);
        const geo = await reverseGeocodeConsentedCoords(lat, lng).catch(() => ({
          country: userProfile?.country || selectedCountryRef.current.name,
          countryCode: userProfile?.countryCode || selectedCountryRef.current.code,
          province: '',
          district: '',
          city: '',
        }));

        await persistLocationConsentDoc({
          gpsConsentGranted: true,
          autoTravelUpdateEnabled: autoTravelUpdate,
          sharingActive: true,
          locationSource: 'gps',
          country: geo.country || userProfile?.country || selectedCountryRef.current.name,
          countryCode: geo.countryCode || userProfile?.countryCode || selectedCountryRef.current.code,
          province: geo.province || '',
          district: geo.district || '',
          city: geo.city || '',
          latitude: lat,
          longitude: lng,
          accuracyMeters: acc,
        });

        return {
          latitude: lat,
          longitude: lng,
          accuracyMeters: acc,
          country: geo.country,
          countryCode: geo.countryCode,
          province: geo.province,
          district: geo.district,
          city: geo.city,
          source: 'gps',
          consentedAt: new Date().toISOString(),
        };
      } catch (err) {
        const geoErr = err as { code?: number; message?: string };
        if (geoErr?.code === 1) {
          setLocationError('GPS location permission was denied. You can select your country/province/city manually below.');
        } else {
          setLocationError(geoErr?.message || 'Unable to acquire GPS fix. Use manual location selection.');
        }
        return null;
      } finally {
        setLocationLoading(false);
      }
    },
    [persistLocationConsentDoc, userProfile?.country, userProfile?.countryCode]
  );

  const setManualConsentedLocation = useCallback(
    async (loc: {
      country: string;
      countryCode: string;
      province?: string;
      district?: string;
      city?: string;
      latitude?: number;
      longitude?: number;
    }): Promise<ConsentedLocation> => {
      setLocationError(null);
      const payload: Omit<LocationConsentRecord, 'userId' | 'updatedAt'> = {
        gpsConsentGranted: false,
        autoTravelUpdateEnabled: false,
        sharingActive: true,
        locationSource: 'manual',
        country: loc.country.slice(0, 80),
        countryCode: loc.countryCode.slice(0, 8),
        province: (loc.province || '').slice(0, 120),
        district: (loc.district || '').slice(0, 120),
        city: (loc.city || '').slice(0, 120),
        ...(typeof loc.latitude === 'number' ? { latitude: loc.latitude } : {}),
        ...(typeof loc.longitude === 'number' ? { longitude: loc.longitude } : {}),
      };
      await persistLocationConsentDoc(payload);
      return {
        ...payload,
        source: 'manual',
        consentedAt: new Date().toISOString(),
      };
    },
    [persistLocationConsentDoc]
  );

  const stopLocationSharing = useCallback(async () => {
    setLocationError(null);
    await persistLocationConsentDoc({
      gpsConsentGranted: false,
      autoTravelUpdateEnabled: false,
      sharingActive: false,
      locationSource: 'none',
    });
  }, [persistLocationConsentDoc]);

  const toggleAutoTravelUpdate = useCallback(
    async (enabled: boolean) => {
      if (!locationConsent) return;
      await persistLocationConsentDoc({
        gpsConsentGranted: locationConsent.gpsConsentGranted,
        autoTravelUpdateEnabled: enabled && locationConsent.gpsConsentGranted,
        sharingActive: locationConsent.sharingActive,
        locationSource: locationConsent.locationSource,
        ...(locationConsent.country ? { country: locationConsent.country } : {}),
        ...(locationConsent.countryCode ? { countryCode: locationConsent.countryCode } : {}),
        ...(locationConsent.province ? { province: locationConsent.province } : {}),
        ...(locationConsent.district ? { district: locationConsent.district } : {}),
        ...(locationConsent.city ? { city: locationConsent.city } : {}),
        ...(typeof locationConsent.latitude === 'number' ? { latitude: locationConsent.latitude } : {}),
        ...(typeof locationConsent.longitude === 'number' ? { longitude: locationConsent.longitude } : {}),
        ...(typeof locationConsent.accuracyMeters === 'number' ? { accuracyMeters: locationConsent.accuracyMeters } : {}),
      });
    },
    [locationConsent, persistLocationConsentDoc]
  );

  // Consented Travel Watcher: ONLY active while user consented to GPS AND auto-travel updates
  useEffect(() => {
    if (
      !locationConsent?.gpsConsentGranted ||
      !locationConsent?.autoTravelUpdateEnabled ||
      !locationConsent?.sharingActive ||
      typeof navigator === 'undefined' ||
      !navigator.geolocation
    ) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastTravelGeoAtRef.current < 120_000) return;
        lastTravelGeoAtRef.current = now;
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        const acc = Math.round(pos.coords.accuracy || 0);
        reverseGeocodeConsentedCoords(lat, lng)
          .then((geo) =>
            persistLocationConsentDoc({
              gpsConsentGranted: true,
              autoTravelUpdateEnabled: true,
              sharingActive: true,
              locationSource: 'gps',
              country: geo.country || locationConsent.country || '',
              countryCode: geo.countryCode || locationConsent.countryCode || '',
              province: geo.province || '',
              district: geo.district || '',
              city: geo.city || '',
              latitude: lat,
              longitude: lng,
              accuracyMeters: acc,
            })
          )
          .catch(() => {});
      },
      () => {
        // Do not overwrite user's consented location on transient travel watch error
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [
    locationConsent?.autoTravelUpdateEnabled,
    locationConsent?.country,
    locationConsent?.countryCode,
    locationConsent?.gpsConsentGranted,
    locationConsent?.sharingActive,
    persistLocationConsentDoc,
  ]);

  const refreshDisasterAlerts = useCallback(async () => {
    try {
      const data = await fetchOfficialDisasters({
        lat: consentedLocation?.latitude,
        lng: consentedLocation?.longitude,
        country: consentedLocation?.country || userProfile?.country || selectedCountryRef.current.name,
      });
      setOfficialFeedDisasters(data.alerts || []);
      setDisasterFeedErrors(data.feedErrors || []);
    } catch (err) {
      setDisasterFeedErrors([err instanceof Error ? err.message : 'Unable to reach official feeds']);
    }
  }, [consentedLocation?.country, consentedLocation?.latitude, consentedLocation?.longitude, userProfile?.country]);

  useEffect(() => {
    refreshDisasterAlerts();
  }, [refreshDisasterAlerts]);

  const logSecurityEvent = useCallback(
    async (eventType: string, severity: 'info' | 'warning' | 'critical', detail: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      try {
        await setDoc(doc(db, 'security_logs', logId), {
          userId: uid,
          eventType: eventType.slice(0, 64),
          severity,
          deviceId: currentDeviceId,
          detail: detail.slice(0, 400),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `security_logs/${logId}`);
      }
    },
    [currentDeviceId]
  );

  const refreshOtpReadiness = useCallback(async (dialCode?: string) => {
    try {
      const targetDial = dialCode || selectedCountryRef.current.dialCode || '+94';
      const status = await fetchOtpStatus(targetDial);
      setOtpReadiness(status);
      return status;
    } catch {
      return null;
    }
  }, []);

  // Firebase Phone Auth OTP send via modular reCAPTCHA + signInWithPhoneNumber()
  // with automatic Cloud SMS gateway failover + Web Preview Test Mode bypass for +94717868693
  const sendPhoneOtp = useCallback(
    async (
      phoneE164: string,
      recaptchaContainerId: string,
      recaptchaSize: 'invisible' | 'normal' = 'invisible',
      trustedDevice = true
    ) => {
      setOtpError(null);
      setOtpErrorCode(null);
      setOtpStatusMessage(null);

      const normalizedPhone = normalizePhoneToE164(phoneE164, selectedCountryRef.current.dialCode);
      if (isWebPreviewTestPhoneBypass(normalizedPhone)) {
        if (recaptchaRef.current) {
          try {
            recaptchaRef.current.clear();
          } catch {
            // Ignore cleanup failure
          }
          recaptchaRef.current = null;
        }
        setOtpConfirmation(null);
        setOtpChannelMode('preview_test');
        setIsWebPreviewTestSession(true);
        setPendingPhone(normalizedPhone);
        setOtpStatusMessage(
          `Web Preview Test Mode: ${normalizedPhone} ready without OTP verification.`
        );
        setActiveScreenState('profile_create');
        return true;
      }

      setIsWebPreviewTestSession(false);
      try {
        const { confirmationResult, verifier } = await sendFirebasePhoneOtp({
          phoneE164: normalizedPhone,
          containerId: recaptchaContainerId,
          recaptchaSize,
          trustDevice: trustedDevice,
          previousVerifier: recaptchaRef.current,
          onExpired: () => {
            setOtpError('reCAPTCHA verification expired. Please try sending the SMS OTP again.');
          },
          onError: () => {
            setOtpError('reCAPTCHA encountered a network error. Switch to Visible reCAPTCHA and try again.');
          },
        });
        recaptchaRef.current = verifier;
        setOtpConfirmation(confirmationResult);
        setOtpChannelMode('firebase');
        setPendingPhone(normalizedPhone);
        setOtpStatusMessage(`Phone ${normalizedPhone} prepared. Continuing to Profile setup.`);
        setActiveScreenState('profile_create');
        return true;
      } catch (err: unknown) {
        const mapped = mapFirebasePhoneAuthError(err, normalizedPhone);
        if (recaptchaRef.current) {
          try {
            recaptchaRef.current.clear();
          } catch {
            // Ignore cleanup failure
          }
          recaptchaRef.current = null;
        }

        // Automatic failover to configured Cloud SMS/WhatsApp Gateway when Firebase SMS is region-blocked or billing-gated
        const shouldTryGatewayFailover =
          mapped.code === 'auth/operation-not-allowed' ||
          mapped.code === 'auth/billing-not-enabled' ||
          mapped.code === 'auth/too-many-requests' ||
          mapped.code === 'auth/quota-exceeded';

        if (shouldTryGatewayFailover) {
          try {
            const gwRes = await requestSmsGatewayOtp(normalizedPhone);
            if (gwRes.sent) {
              setOtpConfirmation(null);
              setOtpChannelMode('gateway');
              setPendingPhone(normalizedPhone);
              setOtpStatusMessage(
                `Phone ${normalizedPhone} prepared via Cloud Gateway (${gwRes.channel}).`
              );
              setActiveScreenState('profile_create');
              return true;
            }
          } catch {
            // Gateway unavailable (503) — fall through and surface clear Firebase diagnostic message
          }
        }

        setOtpErrorCode(mapped.code);
        setOtpError(mapped.message);
        return false;
      }
    },
    [setPendingPhone]
  );

  const sendVoiceCallOtp = useCallback(
    async (phoneE164: string) => {
      setOtpError(null);
      setOtpErrorCode(null);
      setOtpStatusMessage(null);
      const normalizedPhone = normalizePhoneToE164(phoneE164, selectedCountryRef.current.dialCode);
      try {
        const res = await requestVoiceCallOtp(normalizedPhone);
        if (res.sent) {
          setOtpConfirmation(null);
          setOtpChannelMode('gateway');
          setPendingPhone(normalizedPhone);
          setOtpStatusMessage(
            `Phone ${normalizedPhone} prepared. Continuing to Profile setup.`
          );
          setActiveScreenState('profile_create');
          return true;
        }
        return false;
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Voice Call OTP requires Twilio credentials in Secrets.';
        setOtpErrorCode('gateway/unavailable');
        setOtpError(msg);
        return false;
      }
    },
    [setPendingPhone]
  );

  const enterLocalPreviewSession = useCallback(
    (params: {
      phoneNumber?: string;
      languageCode?: string;
      languageName?: string;
      fullName?: string;
      avatarUrl?: string;
      country?: CountryOption;
      userMode?: PkChatUserMode;
    }) => {
      const uid = 'pkchat_preview_user';
      const countryCfg = params.country || selectedCountryRef.current;
      const cleanLangCode = (params.languageCode || appLanguage || 'en').trim().slice(0, 16) || 'en';
      const cleanLangName = (params.languageName || appLanguageName || 'English').trim().slice(0, 64) || 'English';
      const cleanName = (params.fullName || 'PK Chat Member').trim().slice(0, 100) || 'PK Chat Member';
      const cleanPhone = (params.phoneNumber || '').trim();
      const cleanAvatar = (params.avatarUrl || '').slice(0, 200000);
      const isVipPreview = isVipFounderFreeNumber(cleanPhone);

      if (params.userMode) {
        setActiveUserMode(params.userMode, uid);
      }
      setAppLanguageLocal(cleanLangCode);
      setAppLanguageNameLocal(cleanLangName);
      try {
        localStorage.setItem('pk_chat_language', cleanLangName);
        localStorage.setItem('pk_app_language_v1', cleanLangCode);
        localStorage.setItem('pk_app_language_name_v1', cleanLangName);
        if (!localStorage.getItem('pk_chat_trial_start')) {
          localStorage.setItem('pk_chat_trial_start', Date.now().toString());
        }
      } catch {
        // Safe fallback under restricted iframe storage
      }

      setIsLocalPreviewSession(true);
      setUserAccount({
        uid,
        ...(cleanPhone ? { phoneNumber: cleanPhone } : {}),
        country: countryCfg.name,
        countryDialCode: countryCfg.dialCode,
        phoneDiscoveryEnabled: Boolean(cleanPhone),
        accountStatus: 'active',
      });
      setUserAccountLoaded(true);
      setUserProfile({
        uid,
        fullName: cleanName,
        about: 'Hey there! I am using PK Chat.',
        avatarUrl: cleanAvatar,
        country: countryCfg.name,
        countryCode: countryCfg.code,
        preferredLanguage: cleanLangCode,
        preferredLanguageName: cleanLangName,
        profileVisibility: 'everyone',
        profilePhotoVisibility: 'everyone',
        aboutVisibility: 'everyone',
        blockedUserIds: [],
        onlineStatus: 'online',
      });
      setLanguagePref({
        userId: uid,
        primaryLanguage: cleanLangCode,
        primaryLanguageName: cleanLangName,
        autoDetect: true,
        preserveOriginal: true,
        defaultViewMode: 'translated',
        voiceTranslationEnabled: true,
        ttsVoice: 'Kore',
      });
      setUserSettings((prev) => ({
        ...(prev || {
          userId: uid,
          theme: 'light',
          bubbleColor: 'sky_glass',
          wallpaperId: 'wp_world_peace',
          pinLockEnabled: false,
          biometricEnabled: false,
          readReceipts: true,
          lastSeenVisible: true,
          notificationsEnabled: true,
          voiceSecurityAlertsEnabled: true,
          autoFestivalGreetEnabled: true,
        }),
        userId: uid,
        appLanguage: cleanLangCode,
        appLanguageName: cleanLangName,
      }));
      setSubscription(
        isVipPreview
          ? {
              userId: uid,
              plan: 'free',
              status: 'active',
              monthlyPriceUsd: 0,
              autoRenew: false,
              paymentMode: 'test',
            }
          : {
              userId: uid,
              plan: 'trial',
              status: 'trialing',
              monthlyPriceUsd: 10,
              autoRenew: true,
              paymentMode: 'test',
            }
      );
      setDirectChats((prev) =>
        prev.length > 0
          ? prev
          : [
              {
                chatId: 'preview_welcome_chat',
                participantIds: [uid, 'pkchat_global_concierge'],
                createdBy: uid,
                title: 'PK Chat Global Companion',
                lastMessage: 'Welcome to PK Chat! Send a message to test live translation.',
                lastSenderId: 'pkchat_global_concierge',
                e2eeEnabled: true,
              },
            ]
      );
      setActiveScreenState('home');
    },
    [appLanguage, appLanguageName]
  );

  // Firebase ConfirmationResult.confirm() or Cloud Gateway OTP verification with retry preservation
  const verifyPhoneOtp = useCallback(
    async (code: string) => {
      const targetPhone = pendingPhoneRef.current || pendingPhone;
      const inWebPreviewTestBypass =
        isWebPreviewTestSession && isWebPreviewTestPhoneBypass(targetPhone);

      if (inWebPreviewTestBypass || otpChannelMode === 'gateway') {
        setOtpError(null);
        setOtpErrorCode(null);
        if (inWebPreviewTestBypass) {
          if (code.trim() !== WEB_PREVIEW_TEST_OTP) {
            setOtpError(
              `Incorrect test verification code. Enter ${WEB_PREVIEW_TEST_OTP} for Web Preview Test Mode.`
            );
            return false;
          }
        } else {
          try {
            const verifyRes = await verifyGatewayOtp(targetPhone, code.trim());
            if (!verifyRes.verified) {
              setOtpError('Invalid or expired 6-digit OTP code.');
              return false;
            }
          } catch (err: unknown) {
            setOtpError(
              err instanceof Error ? err.message : 'Invalid or expired 6-digit OTP code.'
            );
            return false;
          }
        }

        const verificationSourceLabel = inWebPreviewTestBypass
          ? 'Web Preview Test Mode'
          : 'Cloud SMS/Voice Gateway';

        try {
          const activeUser =
            auth.currentUser ?? (await signInAnonymously(auth)).user;
          setIsWebPreviewTestSession(false);
          setOtpChannelMode('firebase');
          setOtpStatusMessage(`Phone number verified via ${verificationSourceLabel}.`);

          const uid = activeUser.uid;
          try {
            const profileSnap = await getDoc(doc(db, 'user_profiles', uid));
            if (profileSnap.exists()) {
              setUserProfile(profileSnap.data() as UserProfile);
              await setDoc(doc(db, 'user_devices', currentDeviceId), {
                deviceId: currentDeviceId,
                userId: uid,
                deviceName: `${detectPlatformLabel()} Device`,
                platform: detectPlatformLabel(),
                trusted: true,
                otpVerifiedAt: serverTimestamp(),
                lastActiveAt: serverTimestamp(),
                createdAt: serverTimestamp(),
              });
              await logSecurityEvent(
                'NEW_DEVICE_OTP_VERIFIED',
                'info',
                `Device ${currentDeviceId} verified via ${verificationSourceLabel} (${targetPhone}).`
              );
              try {
                window.localStorage.setItem(`pk_seq_onboarding_done_${uid}`, '1');
              } catch {
                // ignore storage errors
              }
              setActiveScreenState('home');
            } else {
              setActiveScreenState('profile_create');
            }
          } catch {
            setActiveScreenState('profile_create');
          }
          return true;
        } catch {
          setIsWebPreviewTestSession(false);
          setOtpChannelMode('firebase');
          setOtpStatusMessage(`Phone number verified via ${verificationSourceLabel}.`);
          enterLocalPreviewSession({ phoneNumber: targetPhone });
          return true;
        }
      }

      if (!otpConfirmation) {
        setOtpError('No active Firebase verification session. Request a new OTP to continue.');
        return false;
      }
      setOtpError(null);
      setOtpErrorCode(null);
      try {
        const credential = await confirmFirebasePhoneOtp(otpConfirmation, code);
        setOtpConfirmation(null);
        setOtpChannelMode('firebase');
        setOtpStatusMessage('Phone number verified via Firebase Authentication.');

        const uid = credential.user.uid;
        try {
          const profileSnap = await getDoc(doc(db, 'user_profiles', uid));
          if (profileSnap.exists()) {
            setUserProfile(profileSnap.data() as UserProfile);
            await setDoc(doc(db, 'user_devices', currentDeviceId), {
              deviceId: currentDeviceId,
              userId: uid,
              deviceName: `${detectPlatformLabel()} Device`,
              platform: detectPlatformLabel(),
              trusted: true,
              otpVerifiedAt: serverTimestamp(),
              lastActiveAt: serverTimestamp(),
              createdAt: serverTimestamp(),
            });
            await logSecurityEvent(
              'NEW_DEVICE_OTP_VERIFIED',
              'info',
              `Device ${currentDeviceId} verified via Firebase SMS OTP.`
            );
            try {
              window.localStorage.setItem(`pk_seq_onboarding_done_${uid}`, '1');
            } catch {
              // ignore storage errors
            }
            setActiveScreenState('home');
          } else {
            setActiveScreenState('profile_create');
          }
        } catch {
          setActiveScreenState('profile_create');
        }

        return true;
      } catch (err: unknown) {
        const mapped = mapFirebasePhoneAuthError(err, pendingPhone);
        setOtpErrorCode(mapped.code);
        if (mapped.sessionInvalidated) {
          setOtpConfirmation(null);
        }
        setOtpError(mapped.message);
        return false;
      }
    },
    [currentDeviceId, enterLocalPreviewSession, isWebPreviewTestSession, logSecurityEvent, otpChannelMode, otpConfirmation, pendingPhone]
  );

  const startTrialWithLanguage = useCallback(
    async (params: {
      languageCode: string;
      languageName: string;
      fullName?: string;
      userMode?: PkChatUserMode;
    }) => {
      setOtpError(null);
      const cleanCode = params.languageCode.trim().slice(0, 16) || 'en';
      const cleanName = params.languageName.trim().slice(0, 64) || 'English';
      const cleanFullName = (params.fullName || '').trim().slice(0, 100);

      if (params.userMode) {
        setActiveUserMode(params.userMode, auth.currentUser?.uid);
      }
      setAppLanguageLocal(cleanCode);
      setAppLanguageNameLocal(cleanName);
      setPendingLang({ code: cleanCode, name: cleanName });
      if (cleanFullName) {
        setPendingFullName(cleanFullName);
      }

      try {
        localStorage.setItem('pk_chat_trial_start', Date.now().toString());
        localStorage.setItem('pk_chat_language', cleanName);
        localStorage.setItem('pk_app_language_v1', cleanCode);
        localStorage.setItem('pk_app_language_name_v1', cleanName);
      } catch {
        // Ignore storage errors safely in preview iframes
      }

      if (auth.currentUser) {
        await updateAppLanguage(cleanCode, cleanName).catch(() => {});
        try {
          await provisionEmailVerifiedAccount(auth.currentUser);
        } catch {
          // Ensure local profile state is ready so App router enters home cleanly
          const uid = auth.currentUser.uid;
          const countryCfg = selectedCountryRef.current;
          setUserAccount((prev) =>
            prev || {
              uid,
              email: auth.currentUser?.email || undefined,
              country: countryCfg.name,
              countryDialCode: countryCfg.dialCode,
              phoneDiscoveryEnabled: false,
              accountStatus: 'active',
            }
          );
          setUserAccountLoaded(true);
          setUserProfile((prev) =>
            prev || {
              uid,
              fullName: cleanFullName || auth.currentUser?.displayName || 'PK Chat Member',
              about: 'Hey there! I am using PK Chat.',
              avatarUrl: auth.currentUser?.photoURL || '',
              country: countryCfg.name,
              countryCode: countryCfg.code,
              preferredLanguage: cleanCode,
              preferredLanguageName: cleanName,
              onlineStatus: 'online',
            }
          );
        }
        setActiveScreenState('home');
        return;
      }

      try {
        const cred = await signInAnonymously(auth);
        await provisionEmailVerifiedAccount(cred.user);
        setActiveScreenState('home');
      } catch {
        // Fallback when Anonymous Auth is disabled on pkchat-41ef3 or in preview/TWA
        enterLocalPreviewSession({
          languageCode: cleanCode,
          languageName: cleanName,
          fullName: cleanFullName,
          userMode: params.userMode,
        });
      }
    },
    [enterLocalPreviewSession, provisionEmailVerifiedAccount, setPendingFullName, setPendingLang, updateAppLanguage]
  );

  const signInWithGoogle = useCallback(async () => {
    if (globalSecurityState.status === 'LOCKDOWN') {
      // Allow verified owners to sign in during lockdown for emergency remediation
      setOtpStatusMessage('Emergency lockdown active: only owner recovery sign-in is permitted.');
    }
    setOtpError(null);
    setOtpErrorCode(null);
    setOtpStatusMessage('Opening Google Sign-In...');

    await authPersistenceReady;
    await setPersistence(auth, browserLocalPersistence).catch(() => {});

    const provider = createGoogleAuthProvider();
    const loginRes = await loginWithFirebasePhoneOrEmail({
      authInstance: auth,
      signInFn: (authInst, prov) => signInWithPopup(authInst, prov),
      credential: provider,
    });

    if (loginRes.ok) {
      setOtpStatusMessage(null);
      const signedInUser = (loginRes.user as { user?: User } | null)?.user || auth.currentUser;
      if (signedInUser) {
        setFirebaseUser(signedInUser);
        await provisionEmailVerifiedAccount(signedInUser).catch(() => {});
      }
      return;
    }

    if (shouldFallbackToRedirect({ code: loginRes.code, message: loginRes.message })) {
      setOtpStatusMessage(
        `Popup sign-in unavailable (${loginRes.code}). Redirecting to Google Sign-In...`
      );
      try {
        await signInWithRedirect(auth, provider);
        return;
      } catch (redirectErr) {
        const fbRedirectErr = redirectErr as { code?: string; message?: string };
        const friendly = mapOAuthSignInError(fbRedirectErr, 'Google');
        setOtpStatusMessage(null);
        setOtpErrorCode(fbRedirectErr?.code || 'auth/redirect-failed');
        setOtpError(friendly);
        throw new Error(friendly);
      }
    }

    const friendly = mapOAuthSignInError(
      { code: loginRes.code, message: loginRes.message },
      'Google'
    );
    setOtpStatusMessage(null);
    setOtpErrorCode(loginRes.code || 'auth/google-signin-failed');
    setOtpError(friendly);
    throw new Error(friendly);
  }, [globalSecurityState.status, provisionEmailVerifiedAccount]);

  const connectOwnerGmail = useCallback(async (): Promise<boolean> => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/gmail.send');
    provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
    provider.setCustomParameters({ prompt: 'consent select_account' });
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || null;
    if (!token) {
      throw new Error('Google did not return a Gmail API access token. Please allow Gmail send/read permissions.');
    }
    setGmailAccessToken(token);
    return true;
  }, []);

  const disconnectOwnerGmail = useCallback(() => {
    setGmailAccessToken(null);
  }, []);

  const logoutUser = useCallback(async () => {
    setGmailAccessToken(null);
    setIsLocalPreviewSession(false);
    setIsWebPreviewTestSession(false);
    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'user_profiles', firebaseUser.uid), {
          onlineStatus: 'offline',
          lastSeen: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore if profile doesn't exist yet
      }
    }
    await signOut(auth).catch(() => {});
    setUserAccount(null);
    setUserProfile(null);
    setActiveScreenState('welcome');
  }, [firebaseUser]);

  const completeOnboardingProfile = useCallback(
    async (params: {
      fullName: string;
      avatarUrl?: string;
      country: CountryOption;
      preferredLanguageCode: string;
      preferredLanguageName: string;
      trusted?: boolean;
      phoneNumber?: string;
      allowPhoneDiscovery?: boolean;
      userMode?: PkChatUserMode;
      allowLocalFallback?: boolean;
    }) => {
      const user = auth.currentUser;
      const rawPhone = (user?.phoneNumber || pendingPhone || params.phoneNumber || '').trim();
      const normalizedPhone = rawPhone ? normalizePhoneToE164(rawPhone, params.country.dialCode) : '';
      const validPhone =
        normalizedPhone.replace(/\D/g, '').length >= 8 && normalizedPhone.replace(/\D/g, '').length <= 15
          ? normalizedPhone
          : '';
      const allowDiscovery = Boolean(validPhone) && (params.allowPhoneDiscovery ?? true);
      const cleanName = params.fullName.trim().slice(0, 100) || 'PK Chat Member';
      const onboardingNameSafety = detectExplicitSexualContent(cleanName);
      if (!onboardingNameSafety.safe) {
        throw new Error(
          onboardingNameSafety.blockedReason ||
            'Profile name blocked by PK CHAT Safety Shield (explicit/sexual terms prohibited).'
        );
      }
      let cleanAvatar =
        params.avatarUrl &&
        !params.avatarUrl.includes('pk-chat-logo') &&
        !params.avatarUrl.includes('WhatsApp_Image_2026-11-14') &&
        !params.avatarUrl.includes('WhatsApp_Image_2026-11-18_at_4.59.42_PM_e151f1c5')
          ? params.avatarUrl.slice(0, 200000)
          : '';

      if (params.userMode) {
        setActiveUserMode(params.userMode, user?.uid);
      }
      setAppLanguageLocal(params.preferredLanguageCode);
      setAppLanguageNameLocal(params.preferredLanguageName);
      try {
        localStorage.setItem('pk_chat_language', params.preferredLanguageName);
        localStorage.setItem('pk_app_language_v1', params.preferredLanguageCode);
        localStorage.setItem('pk_app_language_name_v1', params.preferredLanguageName);
      } catch {
        // Safe fallback under restricted iframe storage
      }

      // If Firebase Auth session is not yet signed in (e.g., direct phone flow or blocked iframe/TWA popup),
      // enter PK Chat cleanly via local preview session instead of trapping the user on "Authentication required."
      if (!user) {
        if (params.allowLocalFallback !== false) {
          enterLocalPreviewSession({
            fullName: cleanName,
            avatarUrl: cleanAvatar,
            country: params.country,
            phoneNumber: validPhone || undefined,
            languageCode: params.preferredLanguageCode,
            languageName: params.preferredLanguageName,
            userMode: params.userMode,
          });
          return;
        }
        throw new Error('Authentication required. Please sign in with Gmail or continue in preview mode.');
      }
      const uid = user.uid;

      if (cleanAvatar && cleanAvatar.startsWith('data:image/')) {
        try {
          const idToken = await user.getIdToken();
          await validateProfileImageUpload({
            idToken,
            dataUrl: cleanAvatar,
            kind: 'avatar',
          });
        } catch {
          // Proceed with client-validated cropped JPEG if validation relay is unreachable (e.g. GitHub Pages)
        }
        try {
          const uploaded = await uploadProfilePhotoToStorage({
            uid,
            kind: 'avatar',
            dataUrl: cleanAvatar,
          });
          cleanAvatar = uploaded.url.slice(0, 200000);
        } catch {
          // Keep compressed inline JPEG data URL (<= 200KB) if Firebase Storage is not initialized yet
        }
      }

      const [existingUserSnap, existingProfSnap, existingLangSnap, existingSettingsSnap, existingDeviceSnap, existingSubSnap] =
        await Promise.all([
          getDoc(doc(db, 'users', uid)),
          getDoc(doc(db, 'user_profiles', uid)),
          getDoc(doc(db, 'language_preferences', uid)),
          getDoc(doc(db, 'user_settings', uid)),
          getDoc(doc(db, 'user_devices', currentDeviceId)),
          getDoc(doc(db, 'subscriptions', uid)),
        ]);

      if (validPhone) {
        try {
          await claimUniquePhoneTransaction({
            user,
            phoneRaw: validPhone,
            dialCode: params.country.dialCode,
            countryName: params.country.name,
            discoverable: allowDiscovery,
            fallbackName: cleanName,
            preferredLanguage: params.preferredLanguageCode,
            preferredLanguageName: params.preferredLanguageName,
          });
        } catch (err) {
          if (err instanceof Error && err.message.includes('already registered')) {
            throw err;
          }
          handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
        }
      } else {
        try {
          if (existingUserSnap.exists()) {
            const userUpdate: Record<string, unknown> = {
              country: params.country.name,
              countryDialCode: params.country.dialCode,
              phoneDiscoveryEnabled: false,
              updatedAt: serverTimestamp(),
            };
            if (user.email) {
              userUpdate.email = user.email;
              userUpdate.recoveryEmail = user.email;
            }
            await updateDoc(doc(db, 'users', uid), userUpdate);
          } else {
            const userPayload: Record<string, unknown> = {
              uid,
              country: params.country.name,
              countryDialCode: params.country.dialCode,
              phoneDiscoveryEnabled: false,
              accountStatus: 'active',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            if (user.email) {
              userPayload.email = user.email;
              userPayload.recoveryEmail = user.email;
            }
            await setDoc(doc(db, 'users', uid), userPayload);
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
        }
      }

      const resolvedOnboardingAvatar = cleanAvatar || existingProfSnap.data()?.avatarUrl || '';

      try {
        if (existingProfSnap.exists()) {
          await updateDoc(doc(db, 'user_profiles', uid), {
            fullName: cleanName,
            avatarUrl: resolvedOnboardingAvatar,
            country: params.country.name,
            countryCode: params.country.code,
            preferredLanguage: params.preferredLanguageCode,
            preferredLanguageName: params.preferredLanguageName,
            e2eePublicKey: e2eePubKey,
            onlineStatus: isIntentionalDataOff() ? 'offline' : 'online',
            lastSeen: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(doc(db, 'user_profiles', uid), {
            uid,
            fullName: cleanName,
            about: 'Hey there! I am using PK Chat.',
            avatarUrl: cleanAvatar,
            country: params.country.name,
            countryCode: params.country.code,
            preferredLanguage: params.preferredLanguageCode,
            preferredLanguageName: params.preferredLanguageName,
            e2eePublicKey: e2eePubKey,
            onlineStatus: isIntentionalDataOff() ? 'offline' : 'online',
            lastSeen: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        // Sync onboarding profile photo into profile_media/{uid} so cross-device hydration is immediate
        await setDoc(
          doc(db, 'profile_media', uid),
          {
            userId: uid,
            avatarDataUrl: resolvedOnboardingAvatar,
            coverDataUrl: '',
            avatarMimeType: resolvedOnboardingAvatar ? 'image/jpeg' : '',
            coverMimeType: '',
            about: 'Hey there! I am using PK Chat.',
            bio: '',
            statusMessage: '',
            profileVisibility: 'everyone',
            profilePhotoVisibility: 'everyone',
            aboutVisibility: 'everyone',
            blockedUserIds: [],
            syncVersion: 1,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `user_profiles/${uid}`);
      }

      try {
        if (existingLangSnap.exists()) {
          await updateDoc(doc(db, 'language_preferences', uid), {
            primaryLanguage: params.preferredLanguageCode,
            primaryLanguageName: params.preferredLanguageName,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(doc(db, 'language_preferences', uid), {
            userId: uid,
            primaryLanguage: params.preferredLanguageCode,
            primaryLanguageName: params.preferredLanguageName,
            autoDetect: true,
            preserveOriginal: true,
            defaultViewMode: 'translated',
            voiceTranslationEnabled: true,
            ttsVoice: 'Kore',
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `language_preferences/${uid}`);
      }

      try {
        if (existingSettingsSnap.exists()) {
          await updateDoc(doc(db, 'user_settings', uid), {
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(doc(db, 'user_settings', uid), {
            userId: uid,
            theme: 'light',
            bubbleColor: 'sky_glass',
            wallpaperId: 'wp_world_peace',
            pinLockEnabled: false,
            biometricEnabled: false,
            readReceipts: true,
            lastSeenVisible: true,
            notificationsEnabled: true,
            voiceSecurityAlertsEnabled: true,
            autoFestivalGreetEnabled: true,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `user_settings/${uid}`);
      }

      try {
        if (existingDeviceSnap.exists() && existingDeviceSnap.data()?.userId === uid) {
          await updateDoc(doc(db, 'user_devices', currentDeviceId), {
            trusted: params.trusted ?? true,
            lastActiveAt: serverTimestamp(),
            deviceName: `${detectPlatformLabel()} Browser`,
          });
        } else if (!existingDeviceSnap.exists()) {
          await setDoc(doc(db, 'user_devices', currentDeviceId), {
            deviceId: currentDeviceId,
            userId: uid,
            deviceName: `${detectPlatformLabel()} Browser`,
            platform: detectPlatformLabel(),
            trusted: params.trusted ?? true,
            otpVerifiedAt: serverTimestamp(),
            lastActiveAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `user_devices/${currentDeviceId}`);
      }

      // Initialize 90-day (3-month) free trial (or VIP Founder lifetime 100% free bypass)
      const candidatePhone = validPhone || auth.currentUser?.phoneNumber || '';
      const isVipFounder = isVipFounderFreeNumber(candidatePhone);
      const fallbackIso = new Date(
        Date.now() + STANDARD_FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();
      let trialRes: {
        vipFounderBypass?: boolean;
        trialEndAt?: string;
        currentPeriodEnd?: string;
      } = {
        vipFounderBypass: isVipFounder,
        trialEndAt: fallbackIso,
        currentPeriodEnd: isVipFounder ? '2099-12-31T23:59:59.000Z' : fallbackIso,
      };
      try {
        // Server validation when Express backend is reachable; gracefully falls back on static GitHub Pages / TWA
        trialRes = await validateSubscriptionAction({
          action: isVipFounder ? 'verify_vip_founder' : 'start_trial',
          provider: 'google_play_test',
          phoneNumber: candidatePhone || undefined,
        });
      } catch {
        // Static GitHub Pages / offline PWA uses deterministic VIP/90-day trial schedule above
      }

      const trialEndDate = new Date(trialRes.trialEndAt || fallbackIso);
      const periodEndDate = new Date(
        trialRes.currentPeriodEnd ||
          (isVipFounder || trialRes.vipFounderBypass ? '2099-12-31T23:59:59.000Z' : trialRes.trialEndAt || fallbackIso)
      );

      try {
        if (isVipFounder || trialRes.vipFounderBypass) {
          await setDoc(
            doc(db, 'subscriptions', uid),
            {
              userId: uid,
              plan: 'free',
              status: 'active',
              monthlyPriceUsd: 0,
              autoRenew: false,
              paymentMode: 'test',
              currentPeriodEnd: Timestamp.fromDate(periodEndDate),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } else if (existingSubSnap.exists()) {
          await updateDoc(doc(db, 'subscriptions', uid), {
            currentPeriodEnd: Timestamp.fromDate(periodEndDate),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(doc(db, 'subscriptions', uid), {
            userId: uid,
            plan: 'trial',
            status: 'trialing',
            monthlyPriceUsd: 10,
            autoRenew: true,
            paymentMode: 'test',
            trialStartAt: serverTimestamp(),
            trialEndAt: Timestamp.fromDate(trialEndDate),
            currentPeriodEnd: Timestamp.fromDate(periodEndDate),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        if (!isTransientFirestoreError(err)) {
          handleFirestoreError(err, OperationType.WRITE, `subscriptions/${uid}`);
        }
      }

      // Immediately hydrate local session state so App router enters 'home' cleanly without waiting on snapshots
      setUserAccount((prev) => ({
        uid,
        ...(prev || {}),
        ...(validPhone ? { phoneNumber: validPhone } : {}),
        ...(user.email ? { email: user.email, recoveryEmail: user.email } : {}),
        country: params.country.name,
        countryDialCode: params.country.dialCode,
        phoneDiscoveryEnabled: allowDiscovery,
        accountStatus: 'active',
      }));
      setUserAccountLoaded(true);
      setUserProfile({
        uid,
        fullName: cleanName,
        about: existingProfSnap.data()?.about || 'Hey there! I am using PK Chat.',
        avatarUrl: resolvedOnboardingAvatar,
        country: params.country.name,
        countryCode: params.country.code,
        preferredLanguage: params.preferredLanguageCode,
        preferredLanguageName: params.preferredLanguageName,
        e2eePublicKey: e2eePubKey,
        onlineStatus: isIntentionalDataOff() ? 'offline' : 'online',
      });
      setLanguagePref({
        userId: uid,
        primaryLanguage: params.preferredLanguageCode,
        primaryLanguageName: params.preferredLanguageName,
        autoDetect: true,
        preserveOriginal: true,
        defaultViewMode: 'translated',
        voiceTranslationEnabled: true,
        ttsVoice: 'Kore',
      });
      setSubscription(
        isVipFounder || trialRes.vipFounderBypass
          ? {
              userId: uid,
              plan: 'free',
              status: 'active',
              monthlyPriceUsd: 0,
              autoRenew: false,
              paymentMode: 'test',
            }
          : {
              userId: uid,
              plan: 'trial',
              status: 'trialing',
              monthlyPriceUsd: 10,
              autoRenew: true,
              paymentMode: 'test',
            }
      );

      await logSecurityEvent(
        'ACCOUNT_ONBOARDED',
        'info',
        `Trusted device ${currentDeviceId} registered with E2EE P-256 keypair.`
      ).catch(() => {});
      try {
        localStorage.setItem(`pk_seq_onboarding_done_${uid}`, '1');
      } catch {
        // ignore storage errors
      }
      setActiveScreenState('home');
    },
    [claimUniquePhoneTransaction, currentDeviceId, e2eePubKey, enterLocalPreviewSession, logSecurityEvent, pendingPhone]
  );

  const updatePreferredLanguage = useCallback(
    async (code: string, name: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        await updateDoc(doc(db, 'user_profiles', uid), {
          preferredLanguage: code,
          preferredLanguageName: name,
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'language_preferences', uid), {
          primaryLanguage: code,
          primaryLanguageName: name,
          updatedAt: serverTimestamp(),
        });
        if (userAccount?.phoneDiscoveryEnabled && userAccount?.phoneNumber) {
          const phoneHash = await hashPhoneE164(userAccount.phoneNumber);
          updateDoc(doc(db, 'phone_directory', phoneHash), {
            preferredLanguage: code,
            preferredLanguageName: name,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `language_preferences/${uid}`);
      }
    },
    [userAccount?.phoneDiscoveryEnabled, userAccount?.phoneNumber]
  );

  const updateLanguageSettings = useCallback(async (patch: Partial<LanguagePreference>) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await updateDoc(doc(db, 'language_preferences', uid), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `language_preferences/${uid}`);
    }
  }, []);

  const updateProfile = useCallback(
    async (patch: Partial<UserProfile>) => {
      if (globalSecurityState.status === 'LOCKDOWN') {
        throw new Error('Account profile changes are paused during Emergency Security Lockdown. No data was modified.');
      }
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        await updateDoc(doc(db, 'user_profiles', uid), {
          ...patch,
          updatedAt: serverTimestamp(),
        });
        if (
          userAccount?.phoneDiscoveryEnabled &&
          userAccount?.phoneNumber &&
          (patch.fullName !== undefined || patch.country !== undefined)
        ) {
          const phoneHash = await hashPhoneE164(userAccount.phoneNumber);
          const dirPatch: Record<string, unknown> = { updatedAt: serverTimestamp() };
          if (patch.fullName !== undefined) dirPatch.fullName = patch.fullName.slice(0, 100);
          if (patch.country !== undefined) dirPatch.country = patch.country;
          updateDoc(doc(db, 'phone_directory', phoneHash), dirPatch).catch(() => {});
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `user_profiles/${uid}`);
      }
    },
    [globalSecurityState.status, userAccount?.phoneDiscoveryEnabled, userAccount?.phoneNumber]
  );

  const saveProfileCustomization = useCallback(
    async (params: {
      fullName?: string;
      about?: string;
      bio?: string;
      statusMessage?: string;
      country?: string;
      countryCode?: string;
      avatarDataUrl?: string;
      coverDataUrl?: string;
      avatarMimeType?: string;
      coverMimeType?: string;
      profileVisibility?: PrivacyVisibilityOption;
      profilePhotoVisibility?: PrivacyVisibilityOption;
      aboutVisibility?: PrivacyVisibilityOption;
      blockedUserIds?: string[];
    }) => {
      if (globalSecurityState.status === 'LOCKDOWN') {
        throw new Error('Profile customization is temporarily paused during Emergency Security Lockdown.');
      }
      const user = auth.currentUser;
      if (!user) throw new Error('Authentication required.');
      const uid = user.uid;

      const combinedProfileText = [
        params.fullName,
        params.about,
        params.bio,
        params.statusMessage,
      ]
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .join('\n');
      if (combinedProfileText) {
        const textCheck = detectExplicitSexualContent(combinedProfileText);
        if (!textCheck.safe) {
          const msg =
            textCheck.blockedReason ||
            'Profile text blocked by PK CHAT Safety Shield (explicit/sexual content prohibited).';
          setProfileSyncError(msg);
          throw new Error(msg);
        }
      }

      setProfileSyncLoading(true);
      setProfileSyncError(null);
      try {
        const idToken = await user.getIdToken();

        let uploadedAvatarValue = params.avatarDataUrl;
        let uploadedCoverValue = params.coverDataUrl;

        if (params.avatarDataUrl === '') {
          await deleteProfilePhotosFromStorage(uid, 'avatar');
        } else if (params.avatarDataUrl && params.avatarDataUrl.startsWith('data:image/')) {
          const imgCheck = await analyzeImageDataUrlForExplicitContent(
            params.avatarDataUrl,
            'profile_avatar'
          );
          if (!imgCheck.safe) {
            throw new Error(
              imgCheck.blockedReason ||
                'Profile photo blocked by PK CHAT Visual Safety Shield.'
            );
          }
          await validateProfileImageUpload({
            idToken,
            dataUrl: params.avatarDataUrl,
            kind: 'avatar',
            profileText: combinedProfileText || undefined,
          });
          const storageUpload = await uploadProfilePhotoToStorage({
            uid,
            kind: 'avatar',
            dataUrl: params.avatarDataUrl,
          });
          uploadedAvatarValue = storageUpload.url;
        }

        if (params.coverDataUrl === '') {
          await deleteProfilePhotosFromStorage(uid, 'cover');
        } else if (params.coverDataUrl && params.coverDataUrl.startsWith('data:image/')) {
          const coverCheck = await analyzeImageDataUrlForExplicitContent(
            params.coverDataUrl,
            'profile_cover'
          );
          if (!coverCheck.safe) {
            throw new Error(
              coverCheck.blockedReason ||
                'Cover image blocked by PK CHAT Visual Safety Shield.'
            );
          }
          await validateProfileImageUpload({
            idToken,
            dataUrl: params.coverDataUrl,
            kind: 'cover',
            profileText: combinedProfileText || undefined,
          });
          const storageUpload = await uploadProfilePhotoToStorage({
            uid,
            kind: 'cover',
            dataUrl: params.coverDataUrl,
          });
          uploadedCoverValue = storageUpload.url;
        }

        const rawPrevAvatar = profileMedia?.avatarDataUrl ?? userProfile?.avatarUrl ?? '';
        const sanitizedPrevAvatar =
          rawPrevAvatar.includes('pk-chat-logo') ||
          rawPrevAvatar.includes('WhatsApp_Image_2026-11-14') ||
          rawPrevAvatar.includes('WhatsApp_Image_2026-11-18_at_4.59.42_PM_e151f1c5')
            ? ''
            : rawPrevAvatar;
        const nextAvatar =
          uploadedAvatarValue !== undefined
            ? uploadedAvatarValue
            : sanitizedPrevAvatar;
        const nextCover =
          uploadedCoverValue !== undefined
            ? uploadedCoverValue
            : profileMedia?.coverDataUrl ?? userProfile?.coverImageUrl ?? '';
        const nextAbout =
          params.about !== undefined
            ? params.about.trim().slice(0, 140)
            : (profileMedia?.about ?? userProfile?.about ?? 'Hey there! I am using PK CHAT.').slice(0, 140);
        const nextBio =
          params.bio !== undefined
            ? params.bio.trim().slice(0, 300)
            : (profileMedia?.bio ?? userProfile?.bio ?? '').slice(0, 300);
        const nextStatus =
          params.statusMessage !== undefined
            ? params.statusMessage.trim().slice(0, 100)
            : (profileMedia?.statusMessage ?? userProfile?.statusMessage ?? '').slice(0, 100);
        const nextProfileVis: PrivacyVisibilityOption =
          params.profileVisibility ??
          profileMedia?.profileVisibility ??
          userProfile?.profileVisibility ??
          'everyone';
        const nextPhotoVis: PrivacyVisibilityOption =
          params.profilePhotoVisibility ??
          profileMedia?.profilePhotoVisibility ??
          userProfile?.profilePhotoVisibility ??
          'everyone';
        const nextAboutVis: PrivacyVisibilityOption =
          params.aboutVisibility ??
          profileMedia?.aboutVisibility ??
          userProfile?.aboutVisibility ??
          'everyone';
        const nextBlocked = Array.from(
          new Set(
            params.blockedUserIds !== undefined
              ? params.blockedUserIds
              : profileMedia?.blockedUserIds ?? userProfile?.blockedUserIds ?? []
          )
        ).slice(0, 100);
        const nextSyncVersion = (profileMedia?.syncVersion ?? 0) + 1;

        const mediaPayload: ProfileMediaRecord = {
          userId: uid,
          avatarDataUrl: nextAvatar.slice(0, 200000),
          coverDataUrl: nextCover.slice(0, 300000),
          avatarMimeType:
            params.avatarMimeType ??
            profileMedia?.avatarMimeType ??
            (nextAvatar ? 'image/jpeg' : ''),
          coverMimeType:
            params.coverMimeType ??
            profileMedia?.coverMimeType ??
            (nextCover ? 'image/jpeg' : ''),
          about: nextAbout,
          bio: nextBio,
          statusMessage: nextStatus,
          profileVisibility: nextProfileVis,
          profilePhotoVisibility: nextPhotoVis,
          aboutVisibility: nextAboutVis,
          blockedUserIds: nextBlocked,
          syncVersion: nextSyncVersion,
          updatedAt: serverTimestamp(),
        };

        await setDoc(doc(db, 'profile_media', uid), mediaPayload, { merge: true });

        // Keep public user_profiles strictly privacy-filtered so restricted photos/about never leak publicly
        const photoPublic = nextProfileVis === 'everyone' && nextPhotoVis === 'everyone';
        const aboutPublic = nextProfileVis === 'everyone' && nextAboutVis === 'everyone';

        const publicPatch: Partial<UserProfile> = {
          avatarUrl: photoPublic ? nextAvatar.slice(0, 200000) : '',
          coverImageUrl: photoPublic ? nextCover.slice(0, 300000) : '',
          about: aboutPublic ? nextAbout : '',
          bio: aboutPublic ? nextBio : '',
          statusMessage: aboutPublic ? nextStatus : '',
          profileVisibility: nextProfileVis,
          profilePhotoVisibility: nextPhotoVis,
          aboutVisibility: nextAboutVis,
          blockedUserIds: nextBlocked,
        };
        if (params.fullName !== undefined && params.fullName.trim()) {
          publicPatch.fullName = params.fullName.trim().slice(0, 100);
        }
        if (params.country !== undefined) publicPatch.country = params.country;
        if (params.countryCode !== undefined) publicPatch.countryCode = params.countryCode;

        await updateDoc(doc(db, 'user_profiles', uid), {
          ...publicPatch,
          updatedAt: serverTimestamp(),
        });

        if (
          userAccount?.phoneDiscoveryEnabled &&
          userAccount?.phoneNumber &&
          (publicPatch.fullName !== undefined || publicPatch.country !== undefined)
        ) {
          const phoneHash = await hashPhoneE164(userAccount.phoneNumber);
          const dirPatch: Record<string, unknown> = { updatedAt: serverTimestamp() };
          if (publicPatch.fullName) dirPatch.fullName = publicPatch.fullName;
          if (publicPatch.country) dirPatch.country = publicPatch.country;
          updateDoc(doc(db, 'phone_directory', phoneHash), dirPatch).catch(() => {});
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to save profile customization.';
        setProfileSyncError(msg);
        throw new Error(msg);
      } finally {
        setProfileSyncLoading(false);
      }
    },
    [
      globalSecurityState.status,
      profileMedia,
      userAccount?.phoneDiscoveryEnabled,
      userAccount?.phoneNumber,
      userProfile,
    ]
  );

  const loadContactProfileMedia = useCallback(async (targetUid: string): Promise<ProfileMediaRecord | null> => {
    if (!targetUid || !auth.currentUser) return null;
    try {
      const snap = await getDoc(doc(db, 'profile_media', targetUid));
      if (!snap.exists()) {
        setProfileMediaCache((prev) => ({ ...prev, [targetUid]: null }));
        return null;
      }
      const data = snap.data() as ProfileMediaRecord;
      setProfileMediaCache((prev) => ({ ...prev, [targetUid]: data }));
      return data;
    } catch {
      // Permission denied when blocked or restricted by backend Firestore rules
      setProfileMediaCache((prev) => ({ ...prev, [targetUid]: null }));
      return null;
    }
  }, []);

  const blockUserByUid = useCallback(
    async (targetUid: string, displayName?: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !targetUid || targetUid === uid) return;
      const existing = profileMedia?.blockedUserIds ?? userProfile?.blockedUserIds ?? [];
      const nextBlocked = Array.from(new Set([...existing, targetUid])).slice(0, 100);
      await saveProfileCustomization({ blockedUserIds: nextBlocked });
      const contactId = `cnt_${uid}_${targetUid}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
      updateDoc(doc(db, 'contacts', contactId), {
        blocked: true,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      await logSecurityEvent(
        'USER_BLOCKED',
        'info',
        `Blocked ${displayName || targetUid} from viewing profile updates and messaging.`
      );
    },
    [logSecurityEvent, profileMedia?.blockedUserIds, saveProfileCustomization, userProfile?.blockedUserIds]
  );

  const unblockUserByUid = useCallback(
    async (targetUid: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !targetUid) return;
      const existing = profileMedia?.blockedUserIds ?? userProfile?.blockedUserIds ?? [];
      const nextBlocked = existing.filter((id) => id !== targetUid);
      await saveProfileCustomization({ blockedUserIds: nextBlocked });
      const contactId = `cnt_${uid}_${targetUid}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
      updateDoc(doc(db, 'contacts', contactId), {
        blocked: false,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    },
    [profileMedia?.blockedUserIds, saveProfileCustomization, userProfile?.blockedUserIds]
  );

  const updateUserSettings = useCallback(
    async (patch: Partial<UserSettings>) => {
      if (patch.autoFestivalGreetEnabled !== undefined) {
        try {
          localStorage.setItem('pk_auto_greet_v1', String(patch.autoFestivalGreetEnabled));
        } catch {
          // ignore
        }
      }
      setUserSettings((prev) => (prev ? { ...prev, ...patch } : prev));
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        await updateDoc(doc(db, 'user_settings', uid), {
          ...patch,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `user_settings/${uid}`);
      }
    },
    []
  );

  const addContact = useCallback(
    async (params: {
      contactUid: string;
      displayName: string;
      country: string;
      preferredLanguage: string;
      preferredLanguageName: string;
      phoneMasked?: string;
    }) => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const contactId = `cnt_${uid}_${params.contactUid}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
      try {
        await setDoc(doc(db, 'contacts', contactId), {
          ownerId: uid,
          contactUid: params.contactUid,
          displayName: params.displayName.slice(0, 100),
          phoneMasked: params.phoneMasked || 'Verified PK Member',
          country: params.country,
          preferredLanguage: params.preferredLanguage,
          preferredLanguageName: params.preferredLanguageName,
          blocked: false,
          reported: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `contacts/${contactId}`);
      }
    },
    []
  );

  const toggleBlockContact = useCallback(async (contactId: string, blocked: boolean) => {
    try {
      await updateDoc(doc(db, 'contacts', contactId), {
        blocked,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `contacts/${contactId}`);
    }
  }, []);

  const reportContact = useCallback(
    async (contactId: string, reason: string) => {
      try {
        await updateDoc(doc(db, 'contacts', contactId), {
          reported: true,
          reportReason: reason.slice(0, 300),
          updatedAt: serverTimestamp(),
        });
        await logSecurityEvent('ABUSE_REPORT_FILED', 'warning', `Contact ${contactId} reported: ${reason}`);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `contacts/${contactId}`);
      }
    },
    [logSecurityEvent]
  );

  const linkPhoneForDiscovery = useCallback(
    async (phoneRaw: string, discoverable: boolean, dialCode = selectedCountry.dialCode) => {
      if (globalSecurityState.status === 'LOCKDOWN') {
        throw new Error('Phone linking & account modifications are temporarily paused during Emergency Security Lockdown.');
      }
      const user = auth.currentUser;
      if (!user) throw new Error('Authentication required.');
      const uid = user.uid;

      const trimmed = phoneRaw.trim();
      const targetRaw = trimmed || userAccount?.phoneNumber || '';
      if (!targetRaw) {
        throw new Error('Enter a valid mobile phone number (8-15 digits including country code).');
      }

      const { validPhone } = await claimUniquePhoneTransaction({
        user,
        phoneRaw: targetRaw,
        dialCode,
        countryName: userProfile?.country || selectedCountry.name,
        discoverable,
        fallbackName: userProfile?.fullName,
        preferredLanguage: userProfile?.preferredLanguage,
        preferredLanguageName: userProfile?.preferredLanguageName,
      });

      setUserAccount((prev) => ({
        uid,
        ...(prev || {}),
        email: prev?.email || user.email || undefined,
        recoveryEmail: prev?.recoveryEmail || user.email || undefined,
        phoneNumber: validPhone,
        country: prev?.country || userProfile?.country || selectedCountry.name,
        countryDialCode: dialCode,
        phoneDiscoveryEnabled: discoverable,
        accountStatus: prev?.accountStatus || 'active',
      }));
      setUserAccountLoaded(true);

      await logSecurityEvent(
        discoverable ? 'PHONE_NUMBER_SAVED' : 'PHONE_DISCOVERY_DISABLED',
        'info',
        discoverable
          ? 'Mobile phone number registered uniquely on user profile with contact discovery enabled (no SMS OTP).'
          : 'Mobile phone number saved privately on user profile (contact discovery hidden, duplicate protection active).'
      );
    },
    [
      claimUniquePhoneTransaction,
      globalSecurityState.status,
      logSecurityEvent,
      selectedCountry.dialCode,
      selectedCountry.name,
      userAccount?.phoneNumber,
      userProfile,
    ]
  );

  const lookupUserByPhone = useCallback(
    async (phoneRaw: string, dialCode = selectedCountry.dialCode): Promise<PhoneDirectoryEntry | null> => {
      const e164 = normalizePhoneToE164(phoneRaw, dialCode);
      if (e164.replace(/\D/g, '').length < 8) {
        throw new Error('Enter a valid international phone number (8-15 digits).');
      }
      const phoneHash = await hashPhoneE164(e164);
      try {
        const snap = await getDoc(doc(db, 'phone_directory', phoneHash));
        if (!snap.exists()) return null;
        const entry = snap.data() as PhoneDirectoryEntry;
        return entry.discoverable ? entry : null;
      } catch (err) {
        const code = (err as { code?: string })?.code || '';
        const msg = (err instanceof Error ? err.message : '').toLowerCase();
        if (code.includes('permission-denied') || msg.includes('permission')) {
          // Owner turned off contact discovery; keep identity completely hidden
          return null;
        }
        handleFirestoreError(err, OperationType.GET, `phone_directory/${phoneHash}`);
        return null;
      }
    },
    [selectedCountry.dialCode]
  );

  const sendContactRequest = useCallback(
    async (target: PhoneDirectoryEntry) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !userProfile) throw new Error('Complete your profile first.');
      if (target.userId === uid) {
        throw new Error('This phone number is linked to your own PK CHAT account.');
      }
      const requestId = `req_${Date.now()}_${uid.slice(0, 8)}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      try {
        await setDoc(doc(db, 'contact_requests', requestId), {
          requestId,
          senderId: uid,
          senderName: userProfile.fullName.slice(0, 100),
          senderCountry: userProfile.country,
          senderPreferredLanguage: userProfile.preferredLanguage,
          senderPreferredLanguageName: userProfile.preferredLanguageName,
          receiverId: target.userId,
          receiverName: target.fullName.slice(0, 100),
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `contact_requests/${requestId}`);
      }
    },
    [userProfile]
  );

  const respondToContactRequest = useCallback(
    async (request: ContactRequest, decision: 'accepted' | 'cancelled' | 'declined') => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        await updateDoc(doc(db, 'contact_requests', request.requestId), {
          status: decision,
          updatedAt: serverTimestamp(),
        });
        if (decision === 'accepted' && request.receiverId === uid) {
          await addContact({
            contactUid: request.senderId,
            displayName: request.senderName,
            country: request.senderCountry,
            preferredLanguage: request.senderPreferredLanguage,
            preferredLanguageName: request.senderPreferredLanguageName,
            phoneMasked: 'Registered PK Member',
          });
        }
        await logSecurityEvent(
          'CONTACT_CONSENT_UPDATED',
          'info',
          `Connection request ${request.requestId} marked as ${decision}.`
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `contact_requests/${request.requestId}`);
      }
    },
    [addContact, logSecurityEvent]
  );

  // Sync newly accepted outgoing contact requests into sender's contacts cleanly
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid || outgoingContactRequests.length === 0) return;
    const acceptedToSync = outgoingContactRequests.filter(
      (req) => req.status === 'accepted' && !contacts.some((c) => c.contactUid === req.receiverId)
    );
    if (acceptedToSync.length === 0) return;

    acceptedToSync.forEach(async (req) => {
      try {
        const known = directoryProfiles.find((p) => p.uid === req.receiverId);
        let profile = known;
        if (!profile) {
          const snap = await getDoc(doc(db, 'user_profiles', req.receiverId));
          if (snap.exists()) profile = snap.data() as UserProfile;
        }
        await addContact({
          contactUid: req.receiverId,
          displayName: profile?.fullName || req.receiverName,
          country: profile?.country || 'Global',
          preferredLanguage: profile?.preferredLanguage || 'en',
          preferredLanguageName: profile?.preferredLanguageName || 'English',
          phoneMasked: 'Registered PK Member',
        });
      } catch {
        // Ignore transient offline sync error; next snapshot will retry
      }
    });
  }, [addContact, contacts, directoryProfiles, firebaseUser?.uid, outgoingContactRequests]);

  const startDirectChat = useCallback(async (targetUser: UserProfile) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Not signed in');
    const sorted = [uid, targetUser.uid].sort();
    const chatId = `chat_${sorted[0]}_${sorted[1]}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
    const existing = await getDoc(doc(db, 'chats', chatId));
    if (!existing.exists()) {
      try {
        await setDoc(doc(db, 'chats', chatId), {
          chatId,
          participantIds: sorted,
          createdBy: uid,
          title: targetUser.fullName,
          e2eeEnabled: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `chats/${chatId}`);
      }
    }
    setActiveChatId(chatId);
    setActiveChatType('direct');
    setActiveScreenState('individual_chat');
    return chatId;
  }, []);

  const createGroupChat = useCallback(
    async (params: { name: string; description?: string; memberIds: string[] }) => {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Not signed in');
      const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const uniqueMembers = Array.from(new Set([uid, ...params.memberIds])).slice(0, 50);
      try {
        await setDoc(doc(db, 'group_chats', groupId), {
          groupId,
          name: params.name.trim().slice(0, 120),
          description: (params.description || '').trim().slice(0, 300),
          createdBy: uid,
          memberIds: uniqueMembers,
          adminIds: [uid],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `group_chats/${groupId}`);
      }
      setActiveChatId(groupId);
      setActiveChatType('group');
      setActiveScreenState('group_chat');
      return groupId;
    },
    []
  );

  const sendMessage = useCallback(
    async (params: {
      chatId: string;
      chatType: 'direct' | 'group';
      participantIds: string[];
      text: string;
      messageType?: ChatMessage['messageType'];
      e2eeEnabled?: boolean;
      mediaName?: string;
      mediaMimeType?: string;
      mediaPreviewData?: string;
      replyToId?: string;
      replyToText?: string;
      forwardedFrom?: string;
      burnAfterSeconds?: number;
      simulateIncomingReplyFrom?: { uid: string; name: string; languageCode: string; languageName: string };
    }) => {
      if (globalSecurityState.status === 'LOCKDOWN') {
        throw new Error('Message sending is temporarily paused during Emergency Security Lockdown. Your chat history remains safe.');
      }
      const uid = auth.currentUser?.uid || (isLocalPreviewSession ? 'pkchat_preview_user' : undefined);
      if (!uid) return;
      const senderId = uid;
      const senderName = params.simulateIncomingReplyFrom
        ? `${params.simulateIncomingReplyFrom.name} (Cross-Language Partner)`
        : userProfile?.fullName || 'PK User';
      const senderLanguage = params.simulateIncomingReplyFrom
        ? params.simulateIncomingReplyFrom.languageCode
        : userProfile?.preferredLanguage || 'en';

      const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const useE2ee = Boolean(params.e2eeEnabled);
      const peerUid = params.chatType === 'direct' ? params.participantIds.find((p) => p !== uid) : undefined;
      const peerPubKey = peerUid
        ? directoryProfiles.find((p) => p.uid === peerUid)?.e2eePublicKey
        : undefined;
      const encryptedPayload = useE2ee
        ? await encryptE2eeText(params.text, params.chatId, peerPubKey)
        : undefined;

      const msgDoc: Record<string, unknown> = {
        messageId,
        chatId: params.chatId,
        chatType: params.chatType,
        participantIds: params.participantIds,
        senderId,
        senderName,
        senderLanguage,
        messageType: params.messageType || 'text',
        originalText: params.text.slice(0, 10000),
        e2eeEnabled: useE2ee,
        deleted: false,
        deliveredTo: [uid],
        readBy: [uid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const burnAfterSeconds =
        typeof params.burnAfterSeconds === 'number' && Number.isFinite(params.burnAfterSeconds) && params.burnAfterSeconds >= 5
          ? Math.min(604800, Math.round(params.burnAfterSeconds))
          : undefined;
      const expiresAtMs = burnAfterSeconds ? Date.now() + burnAfterSeconds * 1000 : undefined;

      if (encryptedPayload) msgDoc.encryptedPayload = encryptedPayload;
      if (params.mediaName) msgDoc.mediaName = params.mediaName.slice(0, 255);
      if (params.mediaMimeType) msgDoc.mediaMimeType = params.mediaMimeType.slice(0, 100);
      if (params.mediaPreviewData && params.mediaPreviewData.length <= 340000) {
        msgDoc.mediaPreviewData = params.mediaPreviewData;
      }
      if (params.replyToId) msgDoc.replyToId = params.replyToId;
      if (params.replyToText) msgDoc.replyToText = params.replyToText.slice(0, 300);
      if (params.forwardedFrom) msgDoc.forwardedFrom = params.forwardedFrom.slice(0, 100);
      if (burnAfterSeconds && expiresAtMs) {
        msgDoc.burnAfterSeconds = burnAfterSeconds;
        msgDoc.expiresAtMs = expiresAtMs;
      }

      if (!auth.currentUser && isLocalPreviewSession) {
        const localMsg: ChatMessage = {
          messageId,
          chatId: params.chatId,
          chatType: params.chatType,
          participantIds: params.participantIds,
          senderId,
          senderName,
          senderLanguage,
          messageType: params.messageType || 'text',
          originalText: params.text.slice(0, 10000),
          encryptedPayload,
          e2eeEnabled: useE2ee,
          mediaName: params.mediaName?.slice(0, 255),
          mediaMimeType: params.mediaMimeType?.slice(0, 100),
          mediaPreviewData:
            params.mediaPreviewData && params.mediaPreviewData.length <= 340000
              ? params.mediaPreviewData
              : undefined,
          replyToId: params.replyToId,
          replyToText: params.replyToText?.slice(0, 300),
          forwardedFrom: params.forwardedFrom?.slice(0, 100),
          ...(burnAfterSeconds && expiresAtMs ? { burnAfterSeconds, expiresAtMs } : {}),
          deleted: false,
          deliveredTo: [uid],
          readBy: [uid],
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, localMsg]);
        setDirectChats((prev) =>
          prev.map((c) =>
            c.chatId === params.chatId
              ? { ...c, lastMessage: params.text.slice(0, 120), lastSenderId: senderId }
              : c
          )
        );
        return;
      }

      const queueForOfflineRetry = () => {
        const queuedRecord: OfflineQueuedMessageRecord = {
          messageId,
          chatId: params.chatId,
          chatType: params.chatType,
          participantIds: params.participantIds,
          senderId,
          senderName,
          senderLanguage,
          messageType: params.messageType || 'text',
          originalText: params.text.slice(0, 10000),
          encryptedPayload,
          e2eeEnabled: useE2ee,
          mediaName: params.mediaName?.slice(0, 255),
          mediaMimeType: params.mediaMimeType?.slice(0, 100),
          mediaPreviewData:
            params.mediaPreviewData && params.mediaPreviewData.length <= 340000
              ? params.mediaPreviewData
              : undefined,
          replyToId: params.replyToId,
          replyToText: params.replyToText?.slice(0, 300),
          forwardedFrom: params.forwardedFrom?.slice(0, 100),
          burnAfterSeconds,
          expiresAtMs,
          queuedAtIso: new Date().toISOString(),
        };
        const updatedQueue = enqueueOfflineMessage(queuedRecord);
        setOfflineQueuedRecords(updatedQueue);
        setDirectChats((prev) =>
          prev.map((c) =>
            c.chatId === params.chatId
              ? { ...c, lastMessage: params.text.slice(0, 120), lastSenderId: senderId }
              : c
          )
        );
      };

      const isOfflineNow =
        (typeof navigator !== 'undefined' && navigator.onLine === false) || intentionalDataOff;

      if (isOfflineNow) {
        queueForOfflineRetry();
        return;
      }

      try {
        await setDoc(doc(db, 'messages', messageId), msgDoc);
      } catch (err) {
        if (isTransientFirestoreError(err)) {
          queueForOfflineRetry();
          return;
        }
        handleFirestoreError(err, OperationType.CREATE, `messages/${messageId}`);
      }

      // Update parent chat summary
      try {
        const parentCol = params.chatType === 'group' ? 'group_chats' : 'chats';
        await updateDoc(doc(db, parentCol, params.chatId), {
          lastMessage: params.text.slice(0, 120),
          lastSenderId: senderId,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore if sandbox chat
      }

      // Perform real-time server-side PKC Cloud translation for all recipient preferred languages!
      const recipientTargets: Array<{ userId: string; code: string; name: string }> = [];
      for (const pid of params.participantIds) {
        const prof = directoryProfiles.find((p) => p.uid === pid);
        const code =
          pid === uid
            ? userProfile?.preferredLanguage || 'en'
            : prof?.preferredLanguage || 'en';
        const name =
          pid === uid
            ? userProfile?.preferredLanguageName || 'English'
            : prof?.preferredLanguageName || 'English';
        recipientTargets.push({ userId: pid, code, name });
      }

      // Also support explicit target translation when testing bilingual partner messages
      if (params.simulateIncomingReplyFrom) {
        recipientTargets.push({
          userId: uid,
          code: userProfile?.preferredLanguage || 'en',
          name: userProfile?.preferredLanguageName || 'English',
        });
      }

      const uniqueLangs = Array.from(
        new Map(recipientTargets.map((t) => [t.code, { code: t.code, name: t.name }])).values()
      );

      if (uniqueLangs.length > 0 && params.text.trim()) {
        try {
          if (uniqueLangs.length === 1) {
            const res = await translateText({
              text: params.text,
              targetLanguage: uniqueLangs[0].code,
              targetLanguageName: uniqueLangs[0].name,
              sourceLanguage: senderLanguage,
            });
            for (const target of recipientTargets) {
              const trId = `tr_${messageId}_${target.userId}_${target.code}`
                .replace(/[^a-zA-Z0-9_-]/g, '_')
                .slice(0, 120);
              await setDoc(doc(db, 'translated_messages', trId), {
                messageId,
                chatId: params.chatId,
                targetUserId: target.userId,
                participantIds: params.participantIds,
                sourceLanguage: res.detectedLanguageCode || senderLanguage,
                targetLanguage: target.code,
                translatedText: res.supported ? res.translatedText : res.unsupportedReason || params.text,
                engine: res.engine,
                createdAt: serverTimestamp(),
              });
            }
          } else {
            const batch = await translateBatch({
              text: params.text,
              targets: uniqueLangs,
            });
            for (const target of recipientTargets) {
              const match = batch.translations?.find((t) => t.targetLanguage === target.code);
              const trId = `tr_${messageId}_${target.userId}_${target.code}`
                .replace(/[^a-zA-Z0-9_-]/g, '_')
                .slice(0, 120);
              await setDoc(doc(db, 'translated_messages', trId), {
                messageId,
                chatId: params.chatId,
                targetUserId: target.userId,
                participantIds: params.participantIds,
                sourceLanguage: batch.detectedLanguageCode || senderLanguage,
                targetLanguage: target.code,
                translatedText: match?.translatedText || params.text,
                engine: batch.engine,
                createdAt: serverTimestamp(),
              });
            }
          }
        } catch (err) {
          console.error('Translation relay error:', err);
          // Fallback guarantee: never fail or drop a message if translation upstream hits quota or fails
          try {
            const trId = `tr_${messageId}_${uid}_fallback`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
            await setDoc(doc(db, 'translated_messages', trId), {
              messageId,
              chatId: params.chatId,
              targetUserId: uid,
              participantIds: params.participantIds,
              sourceLanguage: senderLanguage,
              targetLanguage: senderLanguage,
              translatedText: params.text,
              engine: 'original-text-fallback',
              createdAt: serverTimestamp(),
            });
          } catch {
            // UI already renders originalText cleanly if translated_messages doc is absent
          }
        }
      }
    },
    [directoryProfiles, globalSecurityState.status, isLocalPreviewSession, userProfile]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      const targetMsg = messages.find((m) => m.messageId === messageId);
      secureShredMediaObjectUrl(targetMsg?.mediaPreviewData);
      const shreddedLabel = secureShredTextPayload();

      if (!auth.currentUser && isLocalPreviewSession) {
        setMessages((prev) =>
          prev.map((m) =>
            m.messageId === messageId
              ? {
                  ...m,
                  deleted: true,
                  originalText: shreddedLabel,
                  encryptedPayload: '',
                  mediaPreviewData: '',
                  mediaName: '',
                }
              : m
          )
        );
        return;
      }

      try {
        await updateDoc(doc(db, 'messages', messageId), {
          deleted: true,
          originalText: shreddedLabel,
          encryptedPayload: '',
          mediaPreviewData: '',
          mediaName: '',
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `messages/${messageId}`);
      }
    },
    [isLocalPreviewSession, messages]
  );

  const markMessageRead = useCallback(async (message: ChatMessage) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const readBy = Array.from(new Set([...(message.readBy || []), uid])).slice(0, 50);
    const deliveredTo = Array.from(new Set([...(message.deliveredTo || []), uid])).slice(0, 50);
    if (message.readBy?.includes(uid)) return;
    try {
      await updateDoc(doc(db, 'messages', message.messageId), {
        deliveredTo,
        readBy,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Ignore permission or concurrency edge cases
    }
  }, []);

  const setTypingStatus = useCallback(async (chatId: string, isTyping: boolean) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        typingUserId: isTyping ? uid : '',
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Ignore if not a direct chat doc
    }
  }, []);

  const startCall = useCallback(
    async (params: {
      participantIds: string[];
      callType: 'audio' | 'video';
      targetLanguage: string;
      targetName?: string;
      targetPhone?: string;
      offerSdp?: string;
    }) => {
      if (globalSecurityState.status === 'LOCKDOWN') {
        throw new Error('New audio and video calls are temporarily paused during Emergency Security Lockdown.');
      }
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Sign in required for calls.');
      const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const safeOwnName =
        userProfile?.fullName && !userProfile.fullName.includes('@')
          ? userProfile.fullName.trim()
          : 'PK User';
      const ownPhone = (
        userAccount?.phoneNumber ||
        firebaseUser?.phoneNumber ||
        pendingPhoneRef.current ||
        ''
      ).trim();
      const safeTargetName =
        params.targetName && !params.targetName.includes('@')
          ? params.targetName.trim()
          : undefined;
      const safeTargetPhone = params.targetPhone?.trim() || undefined;
      const record: Record<string, unknown> = {
        callId,
        callerId: uid,
        callerName: safeOwnName,
        ...(ownPhone ? { callerPhone: ownPhone } : {}),
        ...(safeTargetName ? { targetName: safeTargetName } : {}),
        ...(safeTargetPhone ? { targetPhone: safeTargetPhone } : {}),
        participantIds: Array.from(new Set([uid, ...params.participantIds])).slice(0, 20),
        callType: params.callType,
        status: 'ringing',
        sourceLanguage: userProfile?.preferredLanguage || 'en',
        targetLanguage: params.targetLanguage,
        durationSeconds: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (params.offerSdp) record.offerSdp = params.offerSdp.slice(0, 32000);
      try {
        await setDoc(doc(db, 'call_records', callId), record);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `call_records/${callId}`);
      }
      setActiveCallId(callId);
      setActiveScreenState(params.callType === 'audio' ? 'audio_call' : 'video_call');
      return {
        ...(record as unknown as CallRecord),
        callId,
      };
    },
    [firebaseUser?.phoneNumber, globalSecurityState.status, userAccount?.phoneNumber, userProfile]
  );

  const updateCallStatus = useCallback(
    async (callId: string, status: CallRecord['status'], durationSeconds = 0) => {
      try {
        await updateDoc(doc(db, 'call_records', callId), {
          status,
          durationSeconds,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `call_records/${callId}`);
      }
    },
    []
  );

  const uploadCustomWallpaper = useCallback(async (title: string, dataUrl: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Sign in required.');
    const wallpaperId = `wp_custom_${Date.now()}`;
    try {
      await setDoc(doc(db, 'wallpapers', wallpaperId), {
        wallpaperId,
        title: title.slice(0, 80),
        category: 'custom',
        imageUrl: dataUrl.slice(0, 340000),
        isBuiltIn: false,
        ownerId: uid,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'user_settings', uid), {
        wallpaperId,
        customWallpaperData: dataUrl.slice(0, 340000),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `wallpapers/${wallpaperId}`);
    }
    return wallpaperId;
  }, []);

  const addEmergencyContact = useCallback(
    async (contact: Omit<EmergencyContact, 'id' | 'userId' | 'createdAt'>) => {
      if (isVipFounderFreeNumber(contact.phone)) {
        throw new Error(
          'VIP Founder numbers are reserved strictly for Subscription Free Access and cannot be used as SOS contacts.'
        );
      }
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const id = `emc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      try {
        await setDoc(doc(db, 'emergency_contacts', id), {
          ...contact,
          userId: uid,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `emergency_contacts/${id}`);
      }
    },
    []
  );

  const removeEmergencyContact = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'emergency_contacts', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `emergency_contacts/${id}`);
    }
  }, []);

  const clearAllEmergencyContacts = useCallback(async (): Promise<number> => {
    clearLegacySosPreseedCaches();
    let deletedCount = 0;
    for (const ec of emergencyContacts) {
      try {
        await deleteDoc(doc(db, 'emergency_contacts', ec.id));
        deletedCount += 1;
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `emergency_contacts/${ec.id}`);
      }
    }
    return deletedCount;
  }, [emergencyContacts]);

  // Keep VIP Founder numbers lifetime 100% free ($0.00 forever) even after 90-day (3-month) trial window
  useEffect(() => {
    const uid = firebaseUser?.uid;
    const phone = userAccount?.phoneNumber || firebaseUser?.phoneNumber || '';
    if (!uid || !isVipFounderFreeNumber(phone)) return;
    if (
      subscription &&
      subscription.plan === 'free' &&
      subscription.status === 'active' &&
      subscription.monthlyPriceUsd === 0 &&
      subscription.autoRenew === false
    ) {
      return;
    }
    setDoc(
      doc(db, 'subscriptions', uid),
      {
        userId: uid,
        plan: 'free',
        status: 'active',
        monthlyPriceUsd: 0,
        autoRenew: false,
        paymentMode: 'test',
        currentPeriodEnd: Timestamp.fromDate(new Date('2099-12-31T23:59:59.000Z')),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((err) => {
      handleFirestoreError(err, OperationType.WRITE, `subscriptions/${uid}`);
    });
  }, [firebaseUser?.phoneNumber, firebaseUser?.uid, subscription, userAccount?.phoneNumber]);

  const triggerSosAlert = useCallback(
    async (params: { shareLiveLocation: boolean; latitude?: number; longitude?: number; note?: string }) => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const alertId = `sos_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const payload: Record<string, unknown> = {
        alertId,
        userId: uid,
        userName: userProfile?.fullName || 'PK User',
        status: 'active',
        alertOrigin: 'user_generated',
        emergencyServicesNotified: false,
        shareLiveLocation: params.shareLiveLocation,
        note: (params.note || 'User-triggered emergency SOS alert').slice(0, 300),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (isValidHardenedGpsFix(params.latitude, params.longitude)) {
        payload.latitude = Number(params.latitude!.toFixed(5));
        payload.longitude = Number(params.longitude!.toFixed(5));
      }

      try {
        await setDoc(doc(db, 'sos_alerts', alertId), payload);
        await setDoc(doc(db, 'notifications', `notif_${alertId}`), {
          userId: uid,
          category: 'sos',
          title: 'User SOS Alert Activated',
          body: `Trusted contacts notified (${emergencyContacts.length} configured). Official emergency services were NOT automatically dispatched.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `sos_alerts/${alertId}`);
      }
    },
    [emergencyContacts.length, userProfile?.fullName]
  );

  const [sosTrackingExpiresAtMs, setSosTrackingExpiresAtMs] = useState<number | null>(null);
  const [sosLastTrackSyncAtMs, setSosLastTrackSyncAtMs] = useState<number | null>(null);
  const [homeLocation, setHomeLocation] = useState<HomeLocationCoords | null>(() => readStoredHomeLocation());
  const lastSosGpsWriteRef = useRef<number>(0);
  const lastSosCoordRef = useRef<{ lat: number; lng: number; atMs: number } | null>(null);
  const homeAutoSafeTriggeredRef = useRef<Set<string>>(new Set());
  const resolveSosAlertRef = useRef<
    ((alertId: string, status: 'resolved' | 'cancelled', sendSafeAlert?: boolean) => Promise<{ safeNotifiedCount: number }>) | null
  >(null);

  const saveHomeLocation = useCallback(
    (coords: { latitude: number; longitude: number; label?: string }): HomeLocationCoords | null => {
      if (!isValidHardenedGpsFix(coords.latitude, coords.longitude)) return null;
      const saved: HomeLocationCoords = {
        latitude: Number(coords.latitude.toFixed(5)),
        longitude: Number(coords.longitude.toFixed(5)),
        label: coords.label?.trim().slice(0, 80) || 'Home',
        savedAtIso: new Date().toISOString(),
      };
      setHomeLocation(saved);
      try {
        localStorage.setItem(HOME_LOCATION_STORAGE_KEY, JSON.stringify(saved));
      } catch {
        // ignore storage quota limits
      }
      return saved;
    },
    []
  );

  const clearHomeLocation = useCallback(() => {
    setHomeLocation(null);
    try {
      localStorage.removeItem(HOME_LOCATION_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }, []);

  // 5-Hour Live GPS Tracking in Firestore while an active SOS alert has shareLiveLocation enabled
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid || typeof navigator === 'undefined' || !navigator.geolocation) {
      setSosTrackingExpiresAtMs(null);
      return;
    }
    const activeTrackedAlert = sosAlerts.find(
      (a) => a.userId === uid && a.status === 'active' && a.shareLiveLocation
    );
    if (!activeTrackedAlert) {
      setSosTrackingExpiresAtMs(null);
      lastSosCoordRef.current = null;
      return;
    }

    const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
    const createdMs = toEpochMs(activeTrackedAlert.createdAt) || Date.now();
    const expiresAtMs = createdMs + FIVE_HOURS_MS;
    if (Date.now() >= expiresAtMs) {
      setSosTrackingExpiresAtMs(null);
      return;
    }

    setSosTrackingExpiresAtMs(expiresAtMs);
    const alertId = activeTrackedAlert.alertId;
    let stopped = false;

    const pushGpsUpdate = async (pos: GeolocationPosition) => {
      if (stopped || Date.now() >= expiresAtMs) return;
      const now = Date.now();
      if (now - lastSosGpsWriteRef.current < 45_000) return;

      const rawLat = pos.coords.latitude;
      const rawLng = pos.coords.longitude;
      if (!isValidHardenedGpsFix(rawLat, rawLng, pos.coords.accuracy)) {
        return;
      }
      const lat = Number(rawLat.toFixed(5));
      const lng = Number(rawLng.toFixed(5));

      // Reject physically impossible GPS teleport/spoof jumps (> 1200 km/h)
      if (lastSosCoordRef.current) {
        const elapsedHours = Math.max(0.001, (now - lastSosCoordRef.current.atMs) / 3_600_000);
        const distKm = haversineDistanceKm(lastSosCoordRef.current.lat, lastSosCoordRef.current.lng, lat, lng);
        if (distKm / elapsedHours > 1200 && distKm > 25) {
          return;
        }
      }

      lastSosGpsWriteRef.current = now;
      lastSosCoordRef.current = { lat, lng, atMs: now };
      try {
        await updateDoc(doc(db, 'sos_alerts', alertId), {
          latitude: lat,
          longitude: lng,
          updatedAt: serverTimestamp(),
        });
        setSosLastTrackSyncAtMs(now);
      } catch {
        // Transient network issues handled silently; next fix retries
      }

      // Auto-dispatch "OK I AM SAFE" upon safe arrival within 150m of configured Home geofence (after >=30s active SOS)
      if (
        homeLocation &&
        now - createdMs >= 30_000 &&
        !homeAutoSafeTriggeredRef.current.has(alertId) &&
        haversineDistanceKm(lat, lng, homeLocation.latitude, homeLocation.longitude) <= 0.15
      ) {
        homeAutoSafeTriggeredRef.current.add(alertId);
        void resolveSosAlertRef.current?.(alertId, 'resolved', true);
      }
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        void pushGpsUpdate(pos);
      },
      () => {
        // Permission denied or temporary unavailable; avoid crash
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 }
    );

    const expireTimer = window.setTimeout(() => {
      stopped = true;
      navigator.geolocation.clearWatch(watchId);
      setSosTrackingExpiresAtMs(null);
    }, Math.max(1000, expiresAtMs - Date.now()));

    return () => {
      stopped = true;
      window.clearTimeout(expireTimer);
      navigator.geolocation.clearWatch(watchId);
    };
  }, [firebaseUser?.uid, homeLocation, sosAlerts]);

  const resolveSosAlert = useCallback(
    async (
      alertId: string,
      status: 'resolved' | 'cancelled',
      sendSafeAlert = status === 'resolved'
    ): Promise<{ safeNotifiedCount: number }> => {
      const uid = auth.currentUser?.uid;
      try {
        await updateDoc(doc(db, 'sos_alerts', alertId), {
          status,
          ...(status === 'resolved'
            ? { note: 'OK I AM SAFE — Emergency cleared by user.' }
            : {}),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `sos_alerts/${alertId}`);
      }

      let safeNotifiedCount = 0;
      if (sendSafeAlert && uid) {
        const senderName = userProfile?.fullName || 'PK CHAT User';
        const safeText = `OK I AM SAFE ✅ — ${senderName} has resolved the active SOS alert and confirmed they are safe.`;

        // Notify up to 10 active direct chats / trusted contacts on PK CHAT
        const targetChats = directChats.slice(0, 10);
        for (const chat of targetChats) {
          if (chat.participantIds.length < 2) continue;
          try {
            await sendMessage({
              chatId: chat.chatId,
              chatType: 'direct',
              participantIds: chat.participantIds,
              text: safeText,
              e2eeEnabled: true,
            });
            safeNotifiedCount += 1;
          } catch {
            // Best-effort delivery per contact
          }
        }

        try {
          await setDoc(doc(db, 'notifications', `safe_${alertId}_${Date.now()}`), {
            userId: uid,
            category: 'sos',
            title: 'OK I AM SAFE Alert Sent',
            body:
              safeNotifiedCount > 0
                ? `Safety confirmation delivered to ${safeNotifiedCount} active PK CHAT contact(s) (${emergencyContacts.length} emergency contact(s) listed).`
                : `SOS marked safe (${emergencyContacts.length} emergency contact(s) on file).`,
            read: false,
            createdAt: serverTimestamp(),
          });
        } catch {
          // Non-fatal notification log
        }
      }
      return { safeNotifiedCount };
    },
    [directChats, emergencyContacts.length, sendMessage, userProfile?.fullName]
  );
  resolveSosAlertRef.current = resolveSosAlert;

  // Instant + cached weather updates (respects Data Off & Data Package Saver)
  const refreshWeatherNow = useCallback(async () => {
    const snap = await refreshWeatherSnapshotIfNeeded({
      latitude: consentedLocation?.latitude,
      longitude: consentedLocation?.longitude,
      countryCode: consentedLocation?.countryCode || userProfile?.countryCode || selectedCountry.code,
      cityName: consentedLocation?.city || userProfile?.country,
      force: true,
    });
    setWeatherSnapshot(snap);
  }, [
    consentedLocation?.city,
    consentedLocation?.countryCode,
    consentedLocation?.latitude,
    consentedLocation?.longitude,
    selectedCountry.code,
    userProfile?.country,
    userProfile?.countryCode,
  ]);

  useEffect(() => {
    setWeatherSnapshot(
      getInstantWeatherSnapshot({
        countryCode: consentedLocation?.countryCode || userProfile?.countryCode || selectedCountry.code,
        cityName: consentedLocation?.city || userProfile?.country,
      })
    );
    void refreshWeatherSnapshotIfNeeded({
      latitude: consentedLocation?.latitude,
      longitude: consentedLocation?.longitude,
      countryCode: consentedLocation?.countryCode || userProfile?.countryCode || selectedCountry.code,
      cityName: consentedLocation?.city || userProfile?.country,
    }).then((snap) => setWeatherSnapshot(snap));

    const handleWeatherUpdate = (e: Event) => {
      const detail = (e as CustomEvent<WeatherSnapshot>).detail;
      if (detail) setWeatherSnapshot(detail);
    };
    window.addEventListener(WEATHER_UPDATED_EVENT, handleWeatherUpdate);
    return () => window.removeEventListener(WEATHER_UPDATED_EVENT, handleWeatherUpdate);
  }, [
    consentedLocation?.city,
    consentedLocation?.countryCode,
    consentedLocation?.latitude,
    consentedLocation?.longitude,
    selectedCountry.code,
    userProfile?.country,
    userProfile?.countryCode,
  ]);

  const toggleIntentionalDataOff = useCallback(async (next: boolean) => {
    setIntentionalDataOff(next);
    setIntentionalDataOffState(next);
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setUserProfile((prev) => (prev ? { ...prev, onlineStatus: next ? 'offline' : 'online' } : prev));
    try {
      await updateDoc(doc(db, 'user_profiles', uid), {
        onlineStatus: next ? 'offline' : 'online',
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Ignore if offline or profile doc pending
    }
  }, []);

  // Listen for cross-tab / local emergency SOS urgent siren alerts (bypasses both DND modes)
  useEffect(() => {
    const uid = firebaseUser?.uid || 'pkchat_preview_user';
    const acceptIncomingSiren = (payload: EmergencySirenAlertPayload | undefined, allowOwnSender = false) => {
      if (!payload || !payload.alertId) return;
      if (!allowOwnSender && payload.senderUid === uid) return;
      if (seenSirenIdsRef.current.has(payload.alertId)) return;
      seenSirenIdsRef.current.add(payload.alertId);
      setIncomingSosSiren(payload);
      startUrgentSosSiren();
    };

    const onLocalEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<EmergencySirenAlertPayload & { demoLocalPreview?: boolean }>).detail;
      acceptIncomingSiren(detail, Boolean(detail?.demoLocalPreview));
    };
    window.addEventListener(EMERGENCY_SIREN_EVENT, onLocalEvent);

    let channel: BroadcastChannel | null = null;
    if ('BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel(EMERGENCY_SIREN_CHANNEL);
        channel.onmessage = (ev) => {
          acceptIncomingSiren(ev.data as EmergencySirenAlertPayload, false);
        };
      } catch {
        // ignore BroadcastChannel failures
      }
    }

    return () => {
      window.removeEventListener(EMERGENCY_SIREN_EVENT, onLocalEvent);
      channel?.close();
    };
  }, [firebaseUser?.uid]);

  const dismissIncomingSosSiren = useCallback(() => {
    stopUrgentSosSiren();
    setIncomingSosSiren(null);
  }, []);

  const acknowledgeOnTheWaySosSiren = useCallback(async () => {
    const current = incomingSosSiren;
    stopUrgentSosSiren();
    setIncomingSosSiren(null);
    if (!current) return;
    const responderName = userProfile?.fullName || 'PK Chat Contact';
    const ackText = formatSosOnTheWayMessage(responderName);
    const uid = auth.currentUser?.uid || (isLocalPreviewSession ? 'pkchat_preview_user' : '');
    if (!uid) return;

    const matchingChat = directChats.find(
      (c) => c.participantIds.includes(current.senderUid) && c.participantIds.includes(uid)
    );
    if (matchingChat) {
      await sendMessage({
        chatId: matchingChat.chatId,
        chatType: 'direct',
        participantIds: matchingChat.participantIds,
        text: ackText,
        e2eeEnabled: true,
      }).catch(() => {});
      return;
    }

    const targetProfile = directoryProfiles.find((p) => p.uid === current.senderUid);
    if (targetProfile) {
      try {
        const chatId = await startDirectChat(targetProfile);
        await sendMessage({
          chatId,
          chatType: 'direct',
          participantIds: [uid, targetProfile.uid].sort(),
          text: ackText,
          e2eeEnabled: true,
        });
      } catch {
        // non-fatal
      }
    }
  }, [directoryProfiles, directChats, incomingSosSiren, isLocalPreviewSession, sendMessage, startDirectChat, userProfile?.fullName]);

  const matchEmergencyContactsToProfiles = useCallback(() => {
    const uid = auth.currentUser?.uid || (isLocalPreviewSession ? 'pkchat_preview_user' : '');
    const selectedContacts = emergencyContacts
      .filter((ec) => !isVipFounderFreeNumber(ec.phone))
      .slice(0, 3);
    const matchedUids = new Set<string>();
    const phoneDigits = (raw?: string) => (raw || '').replace(/\D/g, '').slice(-8);

    selectedContacts.forEach((ec) => {
      const ecName = ec.name.trim().toLowerCase();
      const ecDigits = phoneDigits(ec.phone);
      const profileMatch = directoryProfiles.find((p) => {
        if (p.uid === uid) return false;
        const nameMatch = ecName && p.fullName.trim().toLowerCase() === ecName;
        const contactMatch = contacts.find((c) => c.contactUid === p.uid);
        const phoneMatch = ecDigits && contactMatch?.phoneMasked && phoneDigits(contactMatch.phoneMasked) === ecDigits;
        return Boolean(nameMatch || phoneMatch);
      });
      if (profileMatch) matchedUids.add(profileMatch.uid);
    });

    // If emergency contacts exist without exact phone/name directory match, fallback to top recent direct chat peers (up to 3)
    const fallbackPeers =
      matchedUids.size > 0
        ? Array.from(matchedUids)
        : directChats
            .map((dc) => dc.participantIds.find((p) => p !== uid))
            .filter((p): p is string => Boolean(p))
            .slice(0, Math.max(1, selectedContacts.length || 3));

    return {
      selectedContacts,
      targetPeerUids: fallbackPeers.slice(0, 3),
      phones: selectedContacts.map((c) => c.phone).filter(Boolean),
    };
  }, [contacts, directChats, directoryProfiles, emergencyContacts, isLocalPreviewSession]);

  const triggerQuickSosOneTap = useCallback(async () => {
    const gpsFix = await getFastAccurateGps({
      latitude: consentedLocation?.latitude,
      longitude: consentedLocation?.longitude,
    });
    const senderName = userProfile?.fullName || 'PK Chat User';
    const { selectedContacts, targetPeerUids, phones } = matchEmergencyContactsToProfiles();

    const coordLine = gpsFix
      ? `GPS: ${gpsFix.latitude.toFixed(5)}, ${gpsFix.longitude.toFixed(5)} • https://maps.google.com/?q=${gpsFix.latitude.toFixed(5)},${gpsFix.longitude.toFixed(5)}`
      : 'GPS fix requested — awaiting signal';

    await triggerSosAlert({
      shareLiveLocation: true,
      latitude: gpsFix?.latitude,
      longitude: gpsFix?.longitude,
      note: `Quick Tap SOS GPS Alert from ${senderName}. ${coordLine}`,
    }).catch(() => {});

    const uid = auth.currentUser?.uid || (isLocalPreviewSession ? 'pkchat_preview_user' : '');
    let sentContacts = 0;
    if (uid) {
      for (const peerUid of targetPeerUids) {
        try {
          const sorted = [uid, peerUid].sort();
          const existing = directChats.find(
            (c) => c.participantIds.includes(peerUid) && c.participantIds.includes(uid)
          );
          const chatId =
            existing?.chatId || `chat_${sorted[0]}_${sorted[1]}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
          if (!existing && auth.currentUser) {
            const peerProf = directoryProfiles.find((p) => p.uid === peerUid);
            await setDoc(
              doc(db, 'chats', chatId),
              {
                chatId,
                participantIds: sorted,
                createdBy: uid,
                title: peerProf?.fullName || 'Emergency Contact',
                e2eeEnabled: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            ).catch(() => {});
          }
          await sendMessage({
            chatId,
            chatType: 'direct',
            participantIds: sorted,
            text: `🆘 SOS Location Shared by ${senderName}\n${coordLine}`,
            e2eeEnabled: true,
          });
          sentContacts += 1;
        } catch {
          // continue fan-out
        }
      }
    }

    let offlineSmsDispatched = false;
    const isOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
    if ((isOfflineNow || !firestoreConnected || sentContacts === 0) && !isIntentionalDataOff() && phones.length > 0) {
      const smsRes = triggerOfflineSimSmsSos({
        senderName,
        recipients: phones,
        latitude: gpsFix?.latitude,
        longitude: gpsFix?.longitude,
        accuracyMeters: gpsFix?.accuracyMeters,
        note: 'Quick SOS Live GPS Location Share',
      });
      offlineSmsDispatched = smsRes.dispatchedVia !== 'none';
    }

    return {
      sentContacts: Math.max(sentContacts, selectedContacts.length),
      hasGps: Boolean(gpsFix),
      offlineSmsDispatched,
    };
  }, [
    consentedLocation?.latitude,
    consentedLocation?.longitude,
    directChats,
    directoryProfiles,
    firestoreConnected,
    isLocalPreviewSession,
    matchEmergencyContactsToProfiles,
    sendMessage,
    triggerSosAlert,
    userProfile?.fullName,
  ]);

  const triggerLongPressSosSiren = useCallback(
    async (options?: { demoLocalPreview?: boolean }) => {
      const gpsFix = await getFastAccurateGps({
        latitude: consentedLocation?.latitude,
        longitude: consentedLocation?.longitude,
      });
      const uid = auth.currentUser?.uid || (isLocalPreviewSession ? 'pkchat_preview_user' : '');
      const senderName = userProfile?.fullName || 'PK Chat User';
      const alertId = `sos_siren_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const { selectedContacts, targetPeerUids, phones } = matchEmergencyContactsToProfiles();

      await triggerSosAlert({
        shareLiveLocation: true,
        latitude: gpsFix?.latitude,
        longitude: gpsFix?.longitude,
        note: `[PK_SOS_SIREN] URGENT 1s Long-Press Emergency Siren triggered by ${senderName}`,
      }).catch(() => {});

      const sirenChatPayload = formatSosSirenChatPayload({
        alertId,
        senderName,
        latitude: gpsFix?.latitude,
        longitude: gpsFix?.longitude,
        accuracyMeters: gpsFix?.accuracyMeters,
      });

      let sentContacts = 0;
      if (uid) {
        for (const peerUid of targetPeerUids) {
          try {
            const sorted = [uid, peerUid].sort();
            const existing = directChats.find(
              (c) => c.participantIds.includes(peerUid) && c.participantIds.includes(uid)
            );
            const chatId =
              existing?.chatId || `chat_${sorted[0]}_${sorted[1]}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
            if (!existing && auth.currentUser) {
              const peerProf = directoryProfiles.find((p) => p.uid === peerUid);
              await setDoc(
                doc(db, 'chats', chatId),
                {
                  chatId,
                  participantIds: sorted,
                  createdBy: uid,
                  title: peerProf?.fullName || 'Emergency Contact',
                  e2eeEnabled: true,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              ).catch(() => {});
            }
            await sendMessage({
              chatId,
              chatType: 'direct',
              participantIds: sorted,
              text: sirenChatPayload,
              e2eeEnabled: true,
            });
            sentContacts += 1;
          } catch {
            // continue fan-out
          }
        }
      }

      const broadcastPayload: EmergencySirenAlertPayload & { demoLocalPreview?: boolean } = {
        alertId,
        senderUid: uid || 'pkchat_sender',
        senderName,
        latitude: gpsFix?.latitude,
        longitude: gpsFix?.longitude,
        accuracyMeters: gpsFix?.accuracyMeters,
        recipientUids: targetPeerUids,
        recipientPhones: phones,
        createdAtMs: Date.now(),
        mode: 'urgent_siren',
        demoLocalPreview: options?.demoLocalPreview,
      };
      dispatchLocalEmergencySirenBroadcast(broadcastPayload);
      if (options?.demoLocalPreview) {
        seenSirenIdsRef.current.add(alertId);
        setIncomingSosSiren(broadcastPayload);
        startUrgentSosSiren();
      }

      let offlineSmsDispatched = false;
      const isOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
      if ((isOfflineNow || !firestoreConnected || sentContacts === 0) && !isIntentionalDataOff() && phones.length > 0) {
        const smsRes = triggerOfflineSimSmsSos({
          senderName,
          recipients: phones,
          latitude: gpsFix?.latitude,
          longitude: gpsFix?.longitude,
          accuracyMeters: gpsFix?.accuracyMeters,
          note: 'URGENT EMERGENCY SOS SIREN — Please check PK Chat / respond immediately!',
        });
        offlineSmsDispatched = smsRes.dispatchedVia !== 'none';
      }

      return {
        sentContacts: Math.max(sentContacts, selectedContacts.length),
        hasGps: Boolean(gpsFix),
        offlineSmsDispatched,
        alertId,
      };
    },
    [
      consentedLocation?.latitude,
      consentedLocation?.longitude,
      directChats,
      directoryProfiles,
      firestoreConnected,
      isLocalPreviewSession,
      matchEmergencyContactsToProfiles,
      sendMessage,
      triggerSosAlert,
      userProfile?.fullName,
    ]
  );

  const sharePhotoToManyContacts = useCallback(
    async (params: {
      recipients: Array<{
        uid: string;
        fullName?: string;
        preferredLanguage?: string;
        preferredLanguageName?: string;
      }>;
      photoDataUrl: string;
      mediaName: string;
      caption?: string;
    }): Promise<{ deliveredCount: number; failedCount: number }> => {
      const uid = auth.currentUser?.uid || (isLocalPreviewSession ? 'pkchat_preview_user' : '');
      if (!uid) throw new Error('Sign in required to share photos.');
      const uniqueRecipients = Array.from(
        new Map(params.recipients.filter((r) => r.uid && r.uid !== uid).map((r) => [r.uid, r])).values()
      );
      let deliveredCount = 0;
      let failedCount = 0;
      const chunkSize = 12;

      for (let i = 0; i < uniqueRecipients.length; i += chunkSize) {
        const batch = uniqueRecipients.slice(i, i + chunkSize);
        await Promise.all(
          batch.map(async (recipient) => {
            try {
              const sorted = [uid, recipient.uid].sort();
              const existing = directChats.find(
                (c) => c.participantIds.includes(recipient.uid) && c.participantIds.includes(uid)
              );
              const chatId =
                existing?.chatId || `chat_${sorted[0]}_${sorted[1]}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);

              if (!existing && auth.currentUser) {
                await setDoc(
                  doc(db, 'chats', chatId),
                  {
                    chatId,
                    participantIds: sorted,
                    createdBy: uid,
                    title: recipient.fullName || 'PK Contact',
                    e2eeEnabled: true,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  },
                  { merge: true }
                );
              } else if (!existing && isLocalPreviewSession) {
                setDirectChats((prev) => [
                  ...prev,
                  {
                    chatId,
                    participantIds: sorted,
                    createdBy: uid,
                    title: recipient.fullName || 'PK Contact',
                    e2eeEnabled: true,
                  },
                ]);
              }

              await sendMessage({
                chatId,
                chatType: 'direct',
                participantIds: sorted,
                text: (params.caption || `Shared photo: ${params.mediaName}`).trim(),
                messageType: 'image',
                e2eeEnabled: true,
                mediaName: params.mediaName || 'photo.jpg',
                mediaMimeType: 'image/jpeg',
                mediaPreviewData: params.photoDataUrl,
              });
              deliveredCount += 1;
            } catch {
              failedCount += 1;
            }
          })
        );
      }

      return { deliveredCount, failedCount };
    },
    [directChats, isLocalPreviewSession, sendMessage]
  );

  const publishOfficialDisasterAlert = useCallback(
    async (alert: Omit<DisasterAlert, 'alertId' | 'verifiedOfficial'>) => {
      const alertId = `dis_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      try {
        await setDoc(doc(db, 'disaster_alerts', alertId), {
          alertId,
          hazardType: alert.hazardType,
          title: alert.title,
          officialSource: alert.officialSource,
          sourceUrl: alert.sourceUrl || '',
          location: alert.location,
          severity: alert.severity,
          issuedAt: serverTimestamp(),
          status: alert.status,
          verifiedOfficial: true,
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `disaster_alerts/${alertId}`);
      }
    },
    []
  );

  const performSubscriptionAction = useCallback(
    async (
      action: 'start_trial' | 'subscribe_monthly' | 'subscribe_annual' | 'cancel' | 'verify_vip_founder',
      provider = 'google_play_test'
    ) => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const phoneCandidate = userAccount?.phoneNumber || auth.currentUser?.phoneNumber || '';
      const isVipLocal = isVipFounderFreeNumber(phoneCandidate);
      const fallbackTrialEnd = new Date(
        Date.now() + STANDARD_FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();
      const fallbackAnnualEnd = new Date(
        Date.now() + 365 * 24 * 60 * 60 * 1000
      ).toISOString();
      let result: {
        vipFounderBypass?: boolean;
        plan?: string;
        status: string;
        monthlyPriceUsd?: number;
        autoRenew: boolean;
        provider?: string;
        trialStartAt?: string;
        trialEndAt?: string;
        currentPeriodEnd?: string;
        amountChargedUsd?: number;
        description: string;
      } = {
        vipFounderBypass: isVipLocal,
        plan: isVipLocal ? 'free' : action === 'start_trial' ? 'trial' : 'pro_monthly',
        status: isVipLocal
          ? 'active'
          : action === 'cancel'
            ? 'cancelled'
            : action === 'start_trial'
              ? 'trialing'
              : 'active',
        monthlyPriceUsd: isVipLocal ? 0 : 10,
        autoRenew: isVipLocal ? false : action !== 'cancel',
        provider,
        trialStartAt: action === 'start_trial' ? new Date().toISOString() : undefined,
        trialEndAt: action === 'start_trial' ? fallbackTrialEnd : undefined,
        currentPeriodEnd: isVipLocal
          ? '2099-12-31T23:59:59.000Z'
          : action === 'start_trial'
            ? fallbackTrialEnd
            : fallbackAnnualEnd,
        amountChargedUsd: isVipLocal || action === 'start_trial' || action === 'cancel' ? 0 : 10,
        description: isVipLocal
          ? 'VIP Founder Lifetime 100% Free Access ($0)'
          : action === 'start_trial'
            ? 'PK CHAT 90-Day (3-Month) Free Trial'
            : action === 'cancel'
              ? 'Subscription renewal cancelled'
              : 'PK CHAT Annual Pro ($10/year)',
      };
      try {
        result = await validateSubscriptionAction({
          action,
          provider,
          phoneNumber: phoneCandidate || undefined,
        });
      } catch {
        // Static GitHub Pages / offline fallback uses deterministic schedule above
      }
      const vipBypass = Boolean(result.vipFounderBypass || isVipLocal);
      const subPatch: Record<string, unknown> = {
        userId: uid,
        plan: vipBypass ? 'free' : result.plan || subscription?.plan || 'pro_monthly',
        status: vipBypass ? 'active' : result.status,
        monthlyPriceUsd: vipBypass ? 0 : result.monthlyPriceUsd ?? 10,
        autoRenew: vipBypass ? false : result.autoRenew,
        paymentMode: 'test',
        updatedAt: serverTimestamp(),
      };
      if (result.trialStartAt && !vipBypass) {
        subPatch.trialStartAt = Timestamp.fromDate(new Date(result.trialStartAt));
      }
      if (result.trialEndAt && !vipBypass) {
        subPatch.trialEndAt = Timestamp.fromDate(new Date(result.trialEndAt));
      }
      if (result.currentPeriodEnd) {
        subPatch.currentPeriodEnd = Timestamp.fromDate(new Date(result.currentPeriodEnd));
      }

      try {
        await setDoc(doc(db, 'subscriptions', uid), subPatch, { merge: true });
        const paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await setDoc(doc(db, 'payment_records', paymentId), {
          paymentId,
          userId: uid,
          amountUsd: vipBypass ? 0 : result.amountChargedUsd ?? 0,
          currency: 'USD',
          status: 'succeeded_test',
          provider: (result.provider || 'google_play_test') as PaymentRecord['provider'],
          description: result.description,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `subscriptions/${uid}`);
      }
    },
    [subscription?.plan, userAccount?.phoneNumber]
  );

  const revokeDevice = useCallback(
    async (deviceId: string) => {
      try {
        await deleteDoc(doc(db, 'user_devices', deviceId));
        await logSecurityEvent('DEVICE_REVOKED', 'warning', `Trusted device ${deviceId} was revoked.`);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `user_devices/${deviceId}`);
      }
    },
    [logSecurityEvent]
  );

  const setPinLock = useCallback(
    async (pin: string | null) => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      if (!pin) {
        await updateUserSettings({ pinLockEnabled: false, appLockPinHash: '' });
        sessionStorage.removeItem(`pk_unlocked_${uid}`);
        setIsAppLocked(false);
        return;
      }
      const hashed = await hashPin(pin, uid);
      await updateUserSettings({ pinLockEnabled: true, appLockPinHash: hashed });
      sessionStorage.setItem(`pk_unlocked_${uid}`, '1');
      await logSecurityEvent('APP_LOCK_PIN_UPDATED', 'info', 'PIN lock enabled on user account.');
    },
    [logSecurityEvent, updateUserSettings]
  );

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setIsAppLocked(false);
        return true;
      }
      if (!userSettings?.pinLockEnabled || !userSettings?.appLockPinHash) {
        sessionStorage.setItem(`pk_unlocked_${uid}`, '1');
        setIsAppLocked(false);
        return true;
      }
      if (!pin.trim()) return false;
      const ok = await verifyPin(pin, uid, userSettings.appLockPinHash);
      if (ok) {
        sessionStorage.setItem(`pk_unlocked_${uid}`, '1');
        setIsAppLocked(false);
      }
      return ok;
    },
    [userSettings?.appLockPinHash, userSettings?.pinLockEnabled]
  );

  const unlockWithBiometric = useCallback(
    async (credentialIdBase64?: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid) return false;
      if (!userSettings?.biometricEnabled) return false;
      try {
        const storedCredId = localStorage.getItem('pk_biometric_cred_id');
        if (storedCredId && credentialIdBase64 && storedCredId !== credentialIdBase64) {
          return false;
        }
        if (!storedCredId && credentialIdBase64) {
          localStorage.setItem('pk_biometric_cred_id', credentialIdBase64);
        }
      } catch {
        // Ignore storage restrictions
      }
      sessionStorage.setItem(`pk_unlocked_${uid}`, '1');
      setIsAppLocked(false);
      void logSecurityEvent('APP_LOCK_BIOMETRIC_UNLOCK', 'info', 'Unlocked via device platform authenticator.');
      return true;
    },
    [logSecurityEvent, userSettings?.biometricEnabled]
  );

  const lockAppNow = useCallback(() => {
    const uid = auth.currentUser?.uid;
    if (uid) sessionStorage.removeItem(`pk_unlocked_${uid}`);
    setIsAppLocked(true);
  }, []);

  const markNotificationRead = useCallback(async (id: string) => {
    const uid = auth.currentUser?.uid;
    markOfficialIdsRead(uid, [id]);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch {
      // Local persistent read state already cleared badge cleanly
    }
  }, []);

  const schedulePKPost = useCallback(
    async (params: {
      postType: 'chat_wish' | 'status';
      receiverId: string;
      chatId: string;
      message: string;
      emojiKey: string;
      mediaUrl: string;
      wishTime: Date;
    }) => {
      const user = auth.currentUser;
      if (!user) throw new Error('Please login first');
      if (params.postType !== 'chat_wish' && params.postType !== 'status') {
        throw new Error('Invalid post type');
      }
      if (params.wishTime.getTime() <= Date.now()) {
        throw new Error('Select a future date and time');
      }
      if (params.postType === 'chat_wish' && (!params.receiverId.trim() || !params.chatId.trim())) {
        throw new Error('Select a receiver and chat');
      }
      const postId = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      try {
        await setDoc(doc(db, 'scheduled_posts', postId), {
          senderId: user.uid,
          postType: params.postType,
          receiverId: params.receiverId.trim(),
          chatId: params.chatId.trim(),
          message: params.message.trim().slice(0, 2000),
          emojiKey: params.emojiKey.trim().slice(0, 64),
          mediaUrl: params.mediaUrl.trim().slice(0, 2048),
          wishTime: Timestamp.fromDate(params.wishTime),
          createdAt: serverTimestamp(),
          status: 'pending',
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `scheduled_posts/${postId}`);
      }
    },
    []
  );

  const cancelScheduledPost = useCallback(async (postId: string) => {
    try {
      await updateDoc(doc(db, 'scheduled_posts', postId), { status: 'cancelled' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `scheduled_posts/${postId}`);
    }
  }, []);

  // Periodic 30s ticker so 24-hour expired statuses disappear promptly in UI
  useEffect(() => {
    const id = window.setInterval(() => setStatusNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const saveStatusPrivacyPreferences = useCallback(
    (prefs: {
      privacyMode: StatusPrivacyMode;
      excludedViewerIds: string[];
      allowedViewerIds: string[];
    }) => {
      setStatusPrivacyDefault(prefs.privacyMode);
      setStatusExcludedDefault(prefs.excludedViewerIds);
      setStatusAllowedDefault(prefs.allowedViewerIds);
      try {
        localStorage.setItem('pk_status_privacy_mode', prefs.privacyMode);
        localStorage.setItem('pk_status_excluded_uids', JSON.stringify(prefs.excludedViewerIds));
        localStorage.setItem('pk_status_allowed_uids', JSON.stringify(prefs.allowedViewerIds));
      } catch {
        // Ignore storage restrictions
      }
    },
    []
  );

  const buildKnownContactUids = useCallback(() => {
    const uid = auth.currentUser?.uid;
    const set = new Set<string>();
    contacts.forEach((c) => {
      if (!c.blocked && c.contactUid && c.contactUid !== uid) set.add(c.contactUid);
    });
    directChats.forEach((dc) => {
      dc.participantIds.forEach((pid) => {
        if (pid && pid !== uid) set.add(pid);
      });
    });
    return Array.from(set);
  }, [contacts, directChats]);

  const createStatusUpdate = useCallback(
    async (params: {
      mediaType: 'text' | 'image' | 'video';
      fileOrBlob?: File | Blob;
      mimeTypeOverride?: string;
      textContent?: string;
      backgroundColor?: string;
      fontStyle?: 'sans' | 'serif' | 'mono';
      caption?: string;
      privacyMode?: StatusPrivacyMode;
      excludedViewerIds?: string[];
      allowedViewerIds?: string[];
      onProgress?: (pct: number) => void;
    }): Promise<StatusUpdate> => {
      if (globalSecurityState.status === 'LOCKDOWN') {
        throw new Error('Posting Status updates is paused during Emergency Security Lockdown.');
      }
      const user = auth.currentUser;
      if (!user || !userProfile) {
        throw new Error('Sign in and complete your profile to share a Status.');
      }
      const uid = user.uid;
      const statusId = `st_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const privacyMode = params.privacyMode || statusPrivacyDefault;
      const excludedViewerIds = params.excludedViewerIds ?? statusExcludedDefault;
      const allowedViewerIds = params.allowedViewerIds ?? statusAllowedDefault;

      const authorizedViewerIds = computeAuthorizedViewerIds({
        ownerUid: uid,
        privacyMode,
        contactUids: buildKnownContactUids(),
        excludedIds: excludedViewerIds,
        allowedIds: allowedViewerIds,
        blockedUserIds: profileMedia?.blockedUserIds || userProfile.blockedUserIds || [],
      });

      const statusTextSafety = detectExplicitSexualContent(
        `${params.textContent || ''}\n${params.caption || ''}`
      );
      if (!statusTextSafety.safe) {
        throw new Error(
          statusTextSafety.blockedReason ||
            'Status update blocked: explicit or sexual content is strictly prohibited on PK CHAT.'
        );
      }

      let mediaUrl = '';
      let mediaMimeType = '';
      let storagePath = '';
      if (params.mediaType !== 'text') {
        if (!params.fileOrBlob) {
          throw new Error('Select a photo or record/select a video to post a media Status.');
        }
        if (params.mediaType === 'image' && typeof FileReader !== 'undefined') {
          const previewDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
            reader.onerror = () => resolve('');
            reader.readAsDataURL(params.fileOrBlob!);
          });
          if (previewDataUrl) {
            const imgSafety = await analyzeImageDataUrlForExplicitContent(
              previewDataUrl,
              params.fileOrBlob instanceof File ? params.fileOrBlob.name : 'status_image'
            );
            if (!imgSafety.safe) {
              throw new Error(
                imgSafety.blockedReason ||
                  'Photo Status blocked by PK CHAT Visual Explicit Content Shield.'
              );
            }
          }
        }
        const uploaded = await uploadStatusMedia({
          uid,
          mediaType: params.mediaType,
          fileOrBlob: params.fileOrBlob,
          mimeTypeOverride: params.mimeTypeOverride,
          onProgress: params.onProgress,
        });
        mediaUrl = uploaded.mediaUrl;
        mediaMimeType = uploaded.mediaMimeType;
        storagePath = uploaded.storagePath;
      } else {
        const cleanText = (params.textContent || '').trim();
        if (!cleanText) {
          throw new Error('Enter status text before sharing.');
        }
      }

      const expiresAtTs = Timestamp.fromMillis(Date.now() + STATUS_TTL_MS);
      const docPayload: StatusUpdate = {
        statusId,
        userId: uid,
        authorName: (userProfile.fullName || 'PK CHAT User').slice(0, 100),
        authorAvatar: profileMedia?.avatarDataUrl || userProfile.avatarUrl || '',
        mediaType: params.mediaType,
        ...(params.mediaType === 'text'
          ? {
              textContent: (params.textContent || '').trim().slice(0, 700),
              backgroundColor: (params.backgroundColor || '#0284c7').slice(0, 32),
              fontStyle: params.fontStyle || 'sans',
            }
          : {
              mediaUrl,
              mediaMimeType,
              storagePath,
              ...(params.caption?.trim() ? { caption: params.caption.trim().slice(0, 500) } : {}),
            }),
        privacyMode,
        authorizedViewerIds,
        excludedViewerIds,
        allowedViewerIds,
        viewedByUids: [],
        viewers: [],
        reactions: [],
        createdAt: serverTimestamp(),
        expiresAt: expiresAtTs,
      };

      try {
        await setDoc(doc(db, 'statuses', statusId), docPayload);
      } catch (err) {
        if (storagePath) {
          await deleteStatusMediaFromStorage(storagePath).catch(() => {});
        }
        handleFirestoreError(err, OperationType.CREATE, `statuses/${statusId}`);
      }

      return {
        ...docPayload,
        createdAt: Timestamp.now(),
      };
    },
    [
      buildKnownContactUids,
      globalSecurityState.status,
      profileMedia?.avatarDataUrl,
      profileMedia?.blockedUserIds,
      statusAllowedDefault,
      statusExcludedDefault,
      statusPrivacyDefault,
      userProfile,
    ]
  );

  const markStatusViewed = useCallback(
    async (statusId: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !userProfile) return;
      const target = [...ownStatuses, ...sharedStatuses].find((s) => s.statusId === statusId);
      if (!target || target.userId === uid) return;
      if (target.viewedByUids?.includes(uid)) return;

      const refDoc = doc(db, 'statuses', statusId);
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(refDoc);
          if (!snap.exists()) return;
          const data = snap.data() as StatusUpdate;
          const existingUids = Array.isArray(data.viewedByUids) ? data.viewedByUids : [];
          if (existingUids.includes(uid)) return;
          const existingViewers = Array.isArray(data.viewers) ? data.viewers : [];
          const record: StatusViewerRecord = {
            viewerId: uid,
            viewerName: (userProfile.fullName || 'PK CHAT User').slice(0, 100),
            viewerAvatar: profileMedia?.avatarDataUrl || userProfile.avatarUrl || '',
            viewedAt: new Date().toISOString(),
          };
          tx.update(refDoc, {
            viewedByUids: [...existingUids, uid].slice(0, 200),
            viewers: [...existingViewers.filter((v) => v.viewerId !== uid), record].slice(0, 200),
          });
        });
      } catch {
        // Ignore transient offline or expired status race during viewing
      }
    },
    [ownStatuses, profileMedia?.avatarDataUrl, sharedStatuses, userProfile]
  );

  const reactToStatus = useCallback(
    async (statusId: string, emoji: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !userProfile) throw new Error('Sign in required.');
      const cleanEmoji = emoji.trim().slice(0, 8);
      if (!cleanEmoji) return;

      const refDoc = doc(db, 'statuses', statusId);
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(refDoc);
          if (!snap.exists()) throw new Error('This Status has expired or been deleted.');
          const data = snap.data() as StatusUpdate;
          const existingUids = Array.isArray(data.viewedByUids) ? data.viewedByUids : [];
          const nextUids = existingUids.includes(uid) ? existingUids : [...existingUids, uid];
          const existingViewers = Array.isArray(data.viewers) ? data.viewers : [];
          const nextViewers = existingUids.includes(uid)
            ? existingViewers
            : [
                ...existingViewers,
                {
                  viewerId: uid,
                  viewerName: (userProfile.fullName || 'PK CHAT User').slice(0, 100),
                  viewerAvatar: profileMedia?.avatarDataUrl || userProfile.avatarUrl || '',
                  viewedAt: new Date().toISOString(),
                },
              ];
          const existingReactions = Array.isArray(data.reactions) ? data.reactions : [];
          const entry: StatusReactionRecord = {
            userId: uid,
            userName: (userProfile.fullName || 'PK CHAT User').slice(0, 100),
            emoji: cleanEmoji,
            reactedAt: new Date().toISOString(),
          };
          const nextReactions = [...existingReactions.filter((r) => r.userId !== uid), entry].slice(0, 200);
          tx.update(refDoc, {
            viewedByUids: nextUids.slice(0, 200),
            viewers: nextViewers.slice(0, 200),
            reactions: nextReactions,
          });
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `statuses/${statusId}`);
      }
    },
    [profileMedia?.avatarDataUrl, userProfile]
  );

  const replyToStatus = useCallback(
    async (status: StatusUpdate, replyText: string): Promise<string> => {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Sign in required.');
      const clean = replyText.trim();
      if (!clean) throw new Error('Enter a reply message.');

      const targetProfile =
        directoryProfiles.find((p) => p.uid === status.userId) ||
        ({
          uid: status.userId,
          fullName: status.authorName,
          country: 'Global',
          countryCode: 'GL',
          preferredLanguage: 'en',
          preferredLanguageName: 'English',
          onlineStatus: 'offline',
        } as UserProfile);

      const chatId = await startDirectChat(targetProfile);
      const statusSnippet =
        status.mediaType === 'text'
          ? (status.textContent || 'Text status').slice(0, 90)
          : status.caption
            ? `${status.mediaType.toUpperCase()} status: ${status.caption.slice(0, 75)}`
            : `${status.mediaType.toUpperCase()} status update`;

      await sendMessage({
        chatId,
        chatType: 'direct',
        participantIds: [uid, status.userId].sort(),
        text: clean,
        e2eeEnabled: true,
        replyToId: status.statusId,
        replyToText: `Status (${status.authorName}): ${statusSnippet}`,
      });
      return chatId;
    },
    [directoryProfiles, sendMessage, startDirectChat]
  );

  const deleteStatusUpdate = useCallback(async (status: StatusUpdate) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Sign in required.');
    try {
      if (status.storagePath) {
        await deleteStatusMediaFromStorage(status.storagePath);
      }
      await deleteDoc(doc(db, 'statuses', status.statusId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `statuses/${status.statusId}`);
    }
  }, []);

  const updateStatusPrivacy = useCallback(
    async (params: {
      statusId: string;
      privacyMode: StatusPrivacyMode;
      excludedViewerIds: string[];
      allowedViewerIds: string[];
    }) => {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Sign in required.');
      const authorizedViewerIds = computeAuthorizedViewerIds({
        ownerUid: uid,
        privacyMode: params.privacyMode,
        contactUids: buildKnownContactUids(),
        excludedIds: params.excludedViewerIds,
        allowedIds: params.allowedViewerIds,
        blockedUserIds: profileMedia?.blockedUserIds || userProfile?.blockedUserIds || [],
      });
      try {
        await updateDoc(doc(db, 'statuses', params.statusId), {
          privacyMode: params.privacyMode,
          authorizedViewerIds,
          excludedViewerIds: params.excludedViewerIds,
          allowedViewerIds: params.allowedViewerIds,
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `statuses/${params.statusId}`);
      }
    },
    [buildKnownContactUids, profileMedia?.blockedUserIds, userProfile?.blockedUserIds]
  );

  // Admin Security Shield & Gmail Owner Approval Actions
  const runSecurityGuardianScan = useCallback(async () => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error('Owner authentication required.');
    return runGuardianAudit(idToken);
  }, []);

  const triggerSecurityLockdownDrill = useCallback(
    async (category?: SecurityIncident['category'], summary?: string) => {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Owner authentication required.');
      const data = await triggerAdminTestIncident({ idToken, category, summary });
      setGlobalSecurityState(data.state);
      setSecurityIncidents(data.incidents);
      setSecurityAuditLogs(data.auditLogs);
    },
    []
  );

  const resolveSecurityThreatAdmin = useCallback(async (immediateNormal = false) => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error('Owner authentication required.');
    const data = await resolveAdminThreat({ idToken, immediateNormal });
    setGlobalSecurityState(data.state);
    setSecurityIncidents(data.incidents);
    setSecurityAuditLogs(data.auditLogs);
  }, []);

  const requestOwnerGmailApproval = useCallback(
    async (params: {
      incidentId: string;
      riskLevel: 'HIGH' | 'CRITICAL' | 'MEDIUM';
      explanation: string;
      proposedChanges: string;
      proposedCodeDiff: string;
      testResults: string;
      actionId: AllowlistedRemediationAction;
    }) => {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Owner authentication required.');
      if (!gmailAccessToken) {
        throw new Error('Connect Owner Gmail first so OAuth access token exists in memory.');
      }
      const res = await sendGmailApprovalRequest({
        idToken,
        gmailAccessToken,
        ...params,
      });
      setGmailApprovals((prev) => [res.approval, ...prev]);
      await refreshSecurityStatus();
      return res;
    },
    [gmailAccessToken, refreshSecurityStatus]
  );

  const checkOwnerGmailApprovalReply = useCallback(
    async (approvalId: string) => {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Owner authentication required.');
      if (!gmailAccessToken) {
        throw new Error('Connect Owner Gmail first so OAuth access token exists in memory.');
      }
      const res = await verifyGmailApprovalReply({
        idToken,
        gmailAccessToken,
        approvalId,
      });
      if (res.state) setGlobalSecurityState(res.state);
      if (res.auditLogs) setSecurityAuditLogs(res.auditLogs);
      if (res.approval) {
        setGmailApprovals((prev) =>
          prev.map((a) => (a.approvalId === res.approval?.approvalId ? res.approval : a))
        );
      }
      return { verified: res.verified, decision: res.decision, message: res.message };
    },
    [gmailAccessToken]
  );

  const wallpapers = useMemo(
    () => [...BUILT_IN_WALLPAPERS, ...customWallpapers],
    [customWallpapers]
  );

  const disasterAlerts = useMemo(() => {
    const combined = [...firestoreDisasters, ...officialFeedDisasters];
    const seen = new Set<string>();
    return combined.filter((a) => {
      if (seen.has(a.alertId)) return false;
      seen.add(a.alertId);
      return true;
    });
  }, [firestoreDisasters, officialFeedDisasters]);

  const activeCall = useMemo(
    () => callRecords.find((c) => c.callId === activeCallId) || callRecords[0] || null,
    [callRecords, activeCallId]
  );

  const statuses = useMemo(() => {
    const map = new Map<string, StatusUpdate>();
    [...ownStatuses, ...sharedStatuses].forEach((s) => {
      if (isStatusActive(s, statusNowMs)) {
        map.set(s.statusId, s);
      }
    });
    return Array.from(map.values());
  }, [ownStatuses, sharedStatuses, statusNowMs]);

  const unseenStatusCount = useMemo(() => {
    const uid = firebaseUser?.uid;
    if (!uid) return 0;
    return statuses.filter((s) => s.userId !== uid && !s.viewedByUids?.includes(uid)).length;
  }, [firebaseUser?.uid, statuses]);

  // Burn Timer 5-second ticker and auto-shredder for expired own messages
  const autoShreddedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const hasActiveBurnMessages = messages.some((m) => !m.deleted && typeof m.expiresAtMs === 'number');
    if (!hasActiveBurnMessages) return;
    const timer = window.setInterval(() => {
      setMsgNowMs(Date.now());
    }, 5000);
    return () => window.clearInterval(timer);
  }, [messages]);

  useEffect(() => {
    const uid = firebaseUser?.uid || (isLocalPreviewSession ? 'pkchat_preview_user' : undefined);
    if (!uid) return;
    const expiredOwn = messages.filter(
      (m) =>
        !m.deleted &&
        m.senderId === uid &&
        isMessageExpiredByBurnTimer(m, msgNowMs) &&
        !autoShreddedIdsRef.current.has(m.messageId)
    );
    expiredOwn.forEach((m) => {
      autoShreddedIdsRef.current.add(m.messageId);
      void deleteMessage(m.messageId).catch(() => {});
    });
  }, [deleteMessage, firebaseUser?.uid, isLocalPreviewSession, messages, msgNowMs]);

  const flushOfflineOutbox = useCallback(async (): Promise<number> => {
    const uid = auth.currentUser?.uid;
    if (!uid || flushingOutboxRef.current) return 0;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
    if (intentionalDataOff) return 0;

    const pending = getOfflineOutbox(uid);
    if (pending.length === 0) {
      setOfflineQueuedRecords([]);
      return 0;
    }

    flushingOutboxRef.current = true;
    let sentCount = 0;
    try {
      for (const item of pending) {
        try {
          const msgDoc: Record<string, unknown> = {
            messageId: item.messageId,
            chatId: item.chatId,
            chatType: item.chatType,
            participantIds: item.participantIds,
            senderId: item.senderId,
            senderName: item.senderName,
            senderLanguage: item.senderLanguage,
            messageType: item.messageType,
            originalText: item.originalText,
            e2eeEnabled: item.e2eeEnabled,
            deleted: false,
            deliveredTo: [uid],
            readBy: [uid],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (item.encryptedPayload) msgDoc.encryptedPayload = item.encryptedPayload;
          if (item.mediaName) msgDoc.mediaName = item.mediaName;
          if (item.mediaMimeType) msgDoc.mediaMimeType = item.mediaMimeType;
          if (item.mediaPreviewData) msgDoc.mediaPreviewData = item.mediaPreviewData;
          if (item.replyToId) msgDoc.replyToId = item.replyToId;
          if (item.replyToText) msgDoc.replyToText = item.replyToText;
          if (item.forwardedFrom) msgDoc.forwardedFrom = item.forwardedFrom;
          if (item.burnAfterSeconds && item.expiresAtMs) {
            msgDoc.burnAfterSeconds = item.burnAfterSeconds;
            msgDoc.expiresAtMs = item.expiresAtMs;
          }
          await setDoc(doc(db, 'messages', item.messageId), msgDoc);
          const parentCol = item.chatType === 'group' ? 'group_chats' : 'chats';
          await updateDoc(doc(db, parentCol, item.chatId), {
            lastMessage: item.originalText.slice(0, 120),
            lastSenderId: item.senderId,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
          const nextQueue = removeOfflineOutboxItem(item.messageId);
          setOfflineQueuedRecords(nextQueue);
          sentCount += 1;
        } catch (err) {
          if (isTransientFirestoreError(err)) {
            break;
          }
        }
      }
    } finally {
      flushingOutboxRef.current = false;
    }
    return sentCount;
  }, [intentionalDataOff]);

  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) return;
    setOfflineQueuedRecords(getOfflineOutbox(uid));
    if (firestoreConnected && !intentionalDataOff) {
      void flushOfflineOutbox();
    }
    const handleOnline = () => {
      void flushOfflineOutbox();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [firebaseUser?.uid, firestoreConnected, flushOfflineOutbox, intentionalDataOff]);

  const activeVisibleMessages = useMemo(() => {
    const uid = firebaseUser?.uid || (isLocalPreviewSession ? 'pkchat_preview_user' : undefined);
    const firestoreIds = new Set(messages.map((m) => m.messageId));
    const queuedForUser = offlineQueuedRecords
      .filter((r) => (!uid || r.senderId === uid) && !firestoreIds.has(r.messageId))
      .map(queuedRecordToChatMessage);
    return [...messages, ...queuedForUser].filter((m) => !isMessageExpiredByBurnTimer(m, msgNowMs));
  }, [firebaseUser?.uid, isLocalPreviewSession, messages, msgNowMs, offlineQueuedRecords]);

  // Ensure screen registry check stays consistent
  void ALL_SCREENS_META;
  void LANGUAGES;

  const value: PkChatContextValue = {
    authReady,
    firebaseUser,
    firestoreConnected,
    networkError,
    clearNetworkError,
    retryConnection,
    activeScreen,
    setActiveScreen,
    selectedCountry,
    setSelectedCountry,
    pendingPhone,
    setPendingPhone,
    otpConfirmation,
    otpChannelMode,
    otpReadiness,
    refreshOtpReadiness,
    isWebPreviewTestSession,
    isLocalPreviewSession,
    otpStatusMessage,
    otpError,
    otpErrorCode,
    sendPhoneOtp,
    sendVoiceCallOtp,
    verifyPhoneOtp,
    startTrialWithLanguage,
    signInWithGoogle,
    logoutUser,
    userAccount,
    userAccountLoaded,
    userProfile,
    directoryProfiles,
    languagePref,
    userSettings,
    userDevices,
    currentDeviceId,
    e2eeFingerprint,
    worldLanguages,
    worldLanguagesVersion,
    refreshLanguageCatalog,
    appLanguage,
    appLanguageName,
    updateAppLanguage,
    completeOnboardingProfile,
    updatePreferredLanguage,
    updateLanguageSettings,
    updateProfile,
    updateUserSettings,
    profileMedia,
    profileMediaCache,
    profileSyncLoading,
    profileSyncError,
    saveProfileCustomization,
    loadContactProfileMedia,
    blockUserByUid,
    unblockUserByUid,
    contacts,
    directChats,
    groupChats,
    messages: activeVisibleMessages,
    translations,
    activeChatId,
    activeChatType,
    setActiveChat,
    addContact,
    toggleBlockContact,
    reportContact,
    incomingContactRequests,
    outgoingContactRequests,
    linkPhoneForDiscovery,
    lookupUserByPhone,
    sendContactRequest,
    respondToContactRequest,
    startDirectChat,
    createGroupChat,
    sendMessage,
    deleteMessage,
    markMessageRead,
    setTypingStatus,
    offlineOutboxCount: offlineQueuedRecords.length,
    flushOfflineOutbox,
    callRecords,
    activeCall,
    startCall,
    updateCallStatus,
    wallpapers,
    uploadCustomWallpaper,
    locationConsent,
    consentedLocation,
    locationLoading,
    locationError,
    grantGpsLocation,
    setManualConsentedLocation,
    stopLocationSharing,
    toggleAutoTravelUpdate,
    emergencyContacts,
    sosAlerts,
    disasterAlerts,
    disasterFeedErrors,
    refreshDisasterAlerts,
    addEmergencyContact,
    removeEmergencyContact,
    clearAllEmergencyContacts,
    triggerSosAlert,
    resolveSosAlert,
    sosTrackingExpiresAtMs,
    sosLastTrackSyncAtMs,
    homeLocation,
    saveHomeLocation,
    clearHomeLocation,
    publishOfficialDisasterAlert,
    subscription,
    paymentRecords,
    performSubscriptionAction,
    securityLogs,
    logSecurityEvent,
    revokeDevice,
    isAppLocked,
    unlockWithPin,
    unlockWithBiometric,
    lockAppNow,
    setPinLock,
    isAdminUser,
    adminMfaVerified,
    setAdminMfaVerified,
    allUsersCount: directoryProfiles.length,
    allSubscriptionsCount: subscription ? 1 : 0,
    notifications,
    markNotificationRead,
    scheduledPosts,
    schedulePKPost,
    cancelScheduledPost,
    statuses,
    unseenStatusCount,
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
    globalSecurityState,
    securityIncidents,
    securityAuditLogs,
    gmailApprovals,
    recheckCountdown,
    isVoiceSpeaking,
    gmailAccessToken,
    connectOwnerGmail,
    disconnectOwnerGmail,
    refreshSecurityStatus,
    playCurrentSecurityVoiceAlert,
    runSecurityGuardianScan,
    triggerSecurityLockdownDrill,
    resolveSecurityThreatAdmin,
    requestOwnerGmailApproval,
    checkOwnerGmailApprovalReply,
    weatherSnapshot,
    refreshWeatherNow,
    intentionalDataOff,
    toggleIntentionalDataOff,
    incomingSosSiren,
    dismissIncomingSosSiren,
    acknowledgeOnTheWaySosSiren,
    triggerQuickSosOneTap,
    triggerLongPressSosSiren,
    sharePhotoToManyContacts,
  };

  return <PkChatContext.Provider value={value}>{children}</PkChatContext.Provider>;
}

export function usePkChat() {
  const ctx = useContext(PkChatContext);
  if (!ctx) throw new Error('usePkChat must be used within PkChatProvider');
  return ctx;
}
