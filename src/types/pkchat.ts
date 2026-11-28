export type ScreenId =
  | 'splash'
  | 'welcome'
  | 'phone_register'
  | 'profile_create'
  | 'language_select'
  | 'home'
  | 'contacts'
  | 'chat_list'
  | 'individual_chat'
  | 'group_chat'
  | 'status_updates'
  | 'audio_call'
  | 'video_call'
  | 'translation_settings'
  | 'wallpaper_gallery'
  | 'sos_emergency'
  | 'disaster_alerts'
  | 'subscription'
  | 'payment_status'
  | 'profile'
  | 'privacy_security'
  | 'app_lock'
  | 'admin_dashboard'
  | 'help_support'
  | 'class_room'
  | 'mirror_preview';

export interface CountryOption {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
}

export interface LanguageOption {
  code: string;
  iso639_1?: string;
  iso639_3?: string;
  name: string;
  nativeName: string;
  region?: string;
  script?: string;
  rtl?: boolean;
  category?: 'major' | 'regional' | 'minority' | 'indigenous' | 'unsupported';
  parentCode?: string;
  supported: boolean;
  speechLocale: string;
  sttSupported?: boolean;
  ttsSupported?: boolean;
}

export interface WallpaperItem {
  wallpaperId: string;
  title: string;
  category: 'signature' | 'nature' | 'flowers' | 'ocean' | 'mountains' | 'abstract' | 'romantic' | 'custom';
  imageUrl: string;
  isBuiltIn: boolean;
  ownerId: string;
}

export interface UserProfile {
  uid: string;
  fullName: string;
  about?: string;
  bio?: string;
  statusMessage?: string;
  avatarUrl?: string;
  coverImageUrl?: string;
  country: string;
  countryCode: string;
  preferredLanguage: string;
  preferredLanguageName: string;
  profileVisibility?: 'everyone' | 'contacts' | 'nobody';
  profilePhotoVisibility?: 'everyone' | 'contacts' | 'nobody';
  aboutVisibility?: 'everyone' | 'contacts' | 'nobody';
  blockedUserIds?: string[];
  e2eePublicKey?: string;
  onlineStatus: 'online' | 'away' | 'offline';
  lastSeen?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserAccount {
  uid: string;
  phoneNumber?: string;
  email?: string;
  country: string;
  countryDialCode: string;
  recoveryEmail?: string;
  phoneDiscoveryEnabled?: boolean;
  accountStatus: 'active' | 'suspended' | 'deleted';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserDevice {
  deviceId: string;
  userId: string;
  deviceName: string;
  platform: string;
  trusted: boolean;
  otpVerifiedAt?: unknown;
  lastActiveAt?: unknown;
  createdAt?: unknown;
}

export interface LanguagePreference {
  userId: string;
  primaryLanguage: string;
  primaryLanguageName: string;
  autoDetect: boolean;
  preserveOriginal: boolean;
  defaultViewMode: 'translated' | 'original' | 'bilingual';
  voiceTranslationEnabled: boolean;
  ttsVoice: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
  updatedAt?: unknown;
}

export interface ContactRecord {
  id: string;
  ownerId: string;
  contactUid: string;
  displayName: string;
  phoneMasked?: string;
  country: string;
  preferredLanguage: string;
  preferredLanguageName?: string;
  blocked: boolean;
  reported: boolean;
  reportReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DirectChat {
  chatId: string;
  participantIds: string[];
  createdBy: string;
  title?: string;
  lastMessage?: string;
  lastSenderId?: string;
  typingUserId?: string;
  wallpaperId?: string;
  e2eeEnabled: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GroupChat {
  groupId: string;
  name: string;
  description?: string;
  createdBy: string;
  memberIds: string[];
  adminIds: string[];
  lastMessage?: string;
  lastSenderId?: string;
  wallpaperId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatMessage {
  messageId: string;
  chatId: string;
  chatType: 'direct' | 'group';
  participantIds: string[];
  senderId: string;
  senderName: string;
  senderLanguage: string;
  messageType: 'text' | 'image' | 'video' | 'document' | 'voice' | 'sticker';
  originalText: string;
  encryptedPayload?: string;
  e2eeEnabled: boolean;
  mediaName?: string;
  mediaMimeType?: string;
  mediaPreviewData?: string;
  replyToId?: string;
  replyToText?: string;
  forwardedFrom?: string;
  deleted: boolean;
  deletedForUserIds?: string[];
  burnAfterSeconds?: number;
  expiresAtMs?: number;
  deliveredTo?: string[];
  readBy?: string[];
  pendingOfflineSync?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TranslatedMessage {
  id: string;
  messageId: string;
  chatId: string;
  targetUserId: string;
  participantIds: string[];
  sourceLanguage: string;
  targetLanguage: string;
  translatedText: string;
  engine: string;
  createdAt?: unknown;
}

export interface CallRecord {
  callId: string;
  callerId: string;
  callerName: string;
  callerPhone?: string;
  targetName?: string;
  targetPhone?: string;
  participantIds: string[];
  callType: 'audio' | 'video';
  status: 'ringing' | 'active' | 'ended' | 'missed';
  sourceLanguage: string;
  targetLanguage: string;
  durationSeconds: number;
  offerSdp?: string;
  answerSdp?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserSettings {
  userId: string;
  theme: 'light' | 'dark' | 'system';
  bubbleColor: string;
  wallpaperId: string;
  customWallpaperData?: string;
  pinLockEnabled: boolean;
  appLockPinHash?: string;
  biometricEnabled: boolean;
  readReceipts: boolean;
  lastSeenVisible: boolean;
  notificationsEnabled: boolean;
  voiceSecurityAlertsEnabled?: boolean;
  appLanguage?: string;
  appLanguageName?: string;
  autoFestivalGreetEnabled?: boolean;
  updatedAt?: unknown;
}

export interface SubscriptionRecord {
  userId: string;
  plan: 'trial' | 'pro_monthly' | 'free';
  status: 'trialing' | 'active' | 'cancelled' | 'expired';
  monthlyPriceUsd: number;
  autoRenew: boolean;
  paymentMode: 'test';
  trialStartAt?: unknown;
  trialEndAt?: unknown;
  currentPeriodEnd?: unknown;
  updatedAt?: unknown;
}

export interface PaymentRecord {
  paymentId: string;
  userId: string;
  amountUsd: number;
  currency: string;
  status: 'succeeded_test' | 'refunded_test' | 'failed_test';
  provider: 'test_mode_gateway' | 'google_play_test' | 'apple_iap_test';
  description: string;
  createdAt?: unknown;
}

export interface EmergencyContact {
  id: string;
  userId: string;
  name: string;
  phone: string;
  relationship: string;
  countryCode: string;
  notifyOnSos: boolean;
  createdAt?: unknown;
}

export interface SosAlert {
  alertId: string;
  userId: string;
  userName: string;
  status: 'active' | 'resolved' | 'cancelled';
  alertOrigin: 'user_generated';
  emergencyServicesNotified: false;
  shareLiveLocation: boolean;
  latitude?: number;
  longitude?: number;
  note?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DisasterAlert {
  alertId: string;
  hazardType: 'flood' | 'tsunami' | 'earthquake' | 'severe_weather' | 'cyclone' | 'landslide' | 'wildfire';
  title: string;
  officialSource: string;
  sourceUrl?: string;
  location: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  expiresAt?: string;
  shelterAdvice?: string;
  evacuationInstructions?: string;
  severity: 'advisory' | 'watch' | 'warning' | 'extreme';
  issuedAt: string;
  status: 'active' | 'monitoring' | 'resolved';
  verifiedOfficial: boolean;
}

export interface SecurityLogItem {
  id: string;
  userId: string;
  eventType: string;
  severity: 'info' | 'warning' | 'critical';
  deviceId?: string;
  detail: string;
  createdAt?: unknown;
}

export interface ScheduledPost {
  id: string;
  senderId: string;
  postType: 'chat_wish' | 'status';
  receiverId: string;
  chatId: string;
  message: string;
  emojiKey: string;
  mediaUrl: string;
  wishTime?: unknown;
  createdAt?: unknown;
  status: 'pending' | 'sent' | 'cancelled';
}

export interface PhoneDirectoryEntry {
  phoneHash: string;
  userId: string;
  fullName: string;
  country: string;
  preferredLanguage: string;
  preferredLanguageName: string;
  discoverable: boolean;
  updatedAt?: unknown;
}

export interface ContactRequest {
  requestId: string;
  senderId: string;
  senderName: string;
  senderCountry: string;
  senderPreferredLanguage: string;
  senderPreferredLanguageName: string;
  receiverId: string;
  receiverName: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'declined';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type SystemSecurityStatus = 'NORMAL' | 'LOCKDOWN' | 'RECOVERING';

export interface GlobalSecurityState {
  stateId: string;
  status: SystemSecurityStatus;
  threatLevel: 'low' | 'elevated' | 'critical';
  reasonCode: string;
  incidentId?: string;
  restrictLogin: boolean;
  restrictMessages: boolean;
  restrictAccountChanges: boolean;
  restrictCalls: boolean;
  recheckIntervalSeconds: number;
  threatResolved: boolean;
  lockdownStartedAt?: string | null;
  recoveringStartedAt?: string | null;
  lastCheckedAt?: string;
  nextRecheckAt?: string;
  updatedBy: string;
  updatedAt?: unknown;
}

export interface SecurityIncident {
  incidentId: string;
  category:
    | 'rate_limit_abuse'
    | 'auth_brute_force'
    | 'privilege_escalation'
    | 'payload_tampering'
    | 'anomalous_flood';
  severity: 'warning' | 'critical';
  status: 'active' | 'mitigating' | 'resolved';
  sourceSignal: string;
  summary: string;
  proposedSolution?: string;
  proposedCodeSnippet?: string;
  testResultsSummary?: string;
  detectedBy: string;
  resolvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SecurityAuditLog {
  auditId: string;
  actorId: string;
  action: string;
  fromStatus: SystemSecurityStatus;
  toStatus: SystemSecurityStatus;
  detail: string;
  createdAt: string;
}

export type AllowlistedRemediationAction =
  | 'VERIFY_AND_RECOVER'
  | 'ENABLE_STRICT_RATE_LIMIT'
  | 'KEEP_LOCKDOWN_ACTIVE'
  | 'HALT_AFFECTED_ENDPOINTS';

export interface GmailApprovalRequest {
  approvalId: string;
  incidentId: string;
  ownerEmail: string;
  riskLevel: 'HIGH' | 'CRITICAL' | 'MEDIUM';
  explanation: string;
  proposedChanges: string;
  proposedCodeDiff: string;
  testResults: string;
  actionId: AllowlistedRemediationAction;
  threadId?: string;
  sentMessageId?: string;
  status: 'pending_send' | 'pending_reply' | 'approved' | 'rejected' | 'expired';
  expiresAt: string;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  confirmationMessageId?: string;
}

export interface GuardianScanFinding {
  id: string;
  file: string;
  line: number;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  proposedAlternative: string;
}

export interface GuardianScanResult {
  scannedAt: string;
  filesScanned: number;
  testsPassed: number;
  testsTotal: number;
  findings: GuardianScanFinding[];
  automatedChecks: Array<{ name: string; passed: boolean; detail: string }>;
}

export type PrivacyVisibilityOption = 'everyone' | 'contacts' | 'nobody';

export interface ProfileMediaRecord {
  userId: string;
  avatarDataUrl: string;
  coverDataUrl: string;
  avatarMimeType: string;
  coverMimeType: string;
  about: string;
  bio: string;
  statusMessage: string;
  profileVisibility: PrivacyVisibilityOption;
  profilePhotoVisibility: PrivacyVisibilityOption;
  aboutVisibility: PrivacyVisibilityOption;
  blockedUserIds: string[];
  syncVersion: number;
  updatedAt?: unknown;
}

export type TranslationConfidenceLevel = 'high' | 'medium' | 'low' | 'uncertain';
export type SpeakingSpeedOption = 'slow' | 'normal' | 'fast';

export interface LiveCallTurnEntry {
  id: string;
  sequenceId: number;
  speakerRole: 'speaker_a' | 'speaker_b';
  speakerName: string;
  originalText: string;
  translatedText: string;
  detectedLanguageCode: string;
  detectedLanguageName: string;
  targetLanguageCode: string;
  targetLanguageName: string;
  confidenceScore: number;
  confidenceLevel: TranslationConfidenceLevel;
  clarificationNeeded: boolean;
  clarificationPrompt?: string;
  preservedEntities: string[];
  audioBase64?: string;
  audioMimeType?: string;
  status: 'buffering' | 'translating' | 'ready' | 'uncertain' | 'failed';
  retryCount: number;
  errorMessage?: string;
  latencyMs?: number;
  createdAt: string;
}

export type StatusPrivacyMode = 'contacts' | 'contacts_except' | 'only_share_with';

export interface StatusViewerRecord {
  viewerId: string;
  viewerName: string;
  viewerAvatar?: string;
  viewedAt: string;
}

export interface StatusReactionRecord {
  userId: string;
  userName: string;
  emoji: string;
  reactedAt: string;
}

export interface StatusUpdate {
  statusId: string;
  userId: string;
  authorName: string;
  authorAvatar?: string;
  mediaType: 'text' | 'image' | 'video';
  textContent?: string;
  backgroundColor?: string;
  fontStyle?: 'sans' | 'serif' | 'mono';
  caption?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  storagePath?: string;
  privacyMode: StatusPrivacyMode;
  authorizedViewerIds: string[];
  excludedViewerIds: string[];
  allowedViewerIds: string[];
  viewedByUids: string[];
  viewers: StatusViewerRecord[];
  reactions: StatusReactionRecord[];
  createdAt?: unknown;
  expiresAt?: unknown;
}

export type EmergencyCategory =
  | 'flood'
  | 'earthquake'
  | 'tsunami'
  | 'cyclone_storm'
  | 'landslide'
  | 'fire'
  | 'road_accident'
  | 'medical'
  | 'missing_person'
  | 'other';

export interface ConsentedLocation {
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  country?: string;
  countryCode?: string;
  province?: string;
  district?: string;
  city?: string;
  displayAddress?: string;
  source: 'gps' | 'manual' | 'none';
  consentedAt: string;
}

export interface LocationConsentRecord {
  userId: string;
  gpsConsentGranted: boolean;
  autoTravelUpdateEnabled: boolean;
  sharingActive: boolean;
  locationSource: 'gps' | 'manual' | 'none';
  country?: string;
  countryCode?: string;
  province?: string;
  district?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  updatedAt?: unknown;
}

export type NearbyEmergencyServiceType =
  | 'hospital'
  | 'ambulance'
  | 'police'
  | 'fire_rescue'
  | 'disaster_center'
  | 'shelter'
  | 'relief';

export interface NearbyEmergencyService {
  serviceId: string;
  name: string;
  serviceType: NearbyEmergencyServiceType;
  categoryLabel: string;
  address: string;
  phone: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  directionsUrl: string;
  osmUrl: string;
  source: string;
  verifiedPhone: boolean;
}

export interface EmergencyReportRecord {
  reportId: string;
  userId: string;
  userName: string;
  category: EmergencyCategory;
  description: string;
  mediaType?: 'none' | 'image' | 'video';
  mediaUrl?: string;
  storagePath?: string;
  voiceTranscript?: string;
  consentedLocation?: ConsentedLocation | null;
  aiSuggestedCategory?: EmergencyCategory;
  aiVerified: false;
  verifiedOfficial: false;
  emergencyServicesNotified: false;
  status: 'active' | 'resolved' | 'cancelled';
  sharedWithContacts: boolean;
  authorizedRecipientIds: string[];
  notifiedRecipientsCount?: number;
  failedRecipientsCount?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type PkChatUserMode = 'general' | 'business';
export type AdScaleTier = 'small' | 'large';
export type SponsoredAdStatus = 'active' | 'under_review' | 'suspended';
export type AdFulfillmentType = 'deliver_to_location' | 'direct_pickup' | 'scheduled_delivery';
export type AdRequestStatus = 'requested' | 'confirmed' | 'received';
export type AdReportCategory =
  | 'spam_misleading'
  | 'prohibited_scam'
  | 'explicit_adult'
  | 'harassment_hate'
  | 'counterfeit_ip'
  | 'fake_business';

export interface RemoteAdPricingConfig {
  billingLibraryVersion: string;
  smallAdPriceUsd: number;
  largeAdPriceUsd: number;
  unlimitedAdPriceUsd: number;
  unlimitedAdDurationDays: number;
  annualProPriceUsd: number;
  freeTrialDays: number;
  smallAdSku: string;
  largeAdSku: string;
  unlimitedAdSku: string;
  annualProSku: string;
  updatedAt: string;
}

export interface AdvertiserUnlimitedPassStatus {
  active: boolean;
  vipFree: boolean;
  sku: string;
  pricePaidUsd: number;
  activatedAt?: string;
  expiresAt?: string;
}

export interface BusinessAdCardProfile {
  businessId: string;
  ownerUid: string;
  businessName: string;
  category: string;
  tagline: string;
  city: string;
  country: string;
  countryCode: string;
  primaryLanguage: string;
  enableDirectCall: boolean;
  enableLiveClass: boolean;
  selfieVerified: boolean;
  selfieVerifiedAt?: string;
  selfieVerificationHash?: string;
  updatedAt: string;
}

export interface AdSafetyEvaluationResult {
  safe: boolean;
  blockedReason?: string;
  adScale: AdScaleTier;
  priceUsd: number;
  skuId: string;
  tierLabel: string;
  aiSummary: string;
  engine: string;
}

export interface SponsoredPublicAd {
  adId: string;
  businessId: string;
  sellerUid: string;
  businessName: string;
  category: string;
  title: string;
  description: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  mediaMimeType: string;
  durationSeconds?: number;
  targetCountry: string;
  targetCountries?: string[];
  targetLanguage: string;
  adScale: AdScaleTier;
  pricePaidUsd: number;
  playBillingSku: string;
  billingTokenMasked?: string;
  selfieVerified: boolean;
  enableDirectCall: boolean;
  enableLiveClass: boolean;
  city?: string;
  status: SponsoredAdStatus;
  reportCount: number;
  underReviewThreshold: number;
  aiModerationSummary: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdFulfillmentRequest {
  requestId: string;
  adId: string;
  adTitle: string;
  businessName: string;
  sellerUid: string;
  buyerUid: string;
  buyerName: string;
  fulfillmentType: AdFulfillmentType;
  deliveryNote?: string;
  scheduledDateTime?: string;
  buyerLocation?: {
    latitude: number;
    longitude: number;
    displayAddress?: string;
  } | null;
  callRelayCode: string;
  privateChatRoomId: string;
  feeUsd: 0;
  status: AdRequestStatus;
  createdAt: string;
  receivedAt?: string;
}

export interface AdViolationWarningNotice {
  warningId: string;
  adId: string;
  sellerUid: string;
  businessName: string;
  violationCategory: AdReportCategory;
  evidenceSummary: string;
  reporterCount: number;
  policyClause: string;
  actionTaken: 'suspended' | 'formal_warning';
  issuedBy: string;
  issuedAt: string;
  read: boolean;
}

