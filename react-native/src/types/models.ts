export interface MobileUserProfile {
  uid: string;
  fullName: string;
  phoneNumber: string;
  about: string;
  avatarUrl?: string;
  dateOfBirth: string; // YYYY-MM-DD
  country: string;
  preferredLanguageCode: string;
  preferredLanguageName: string;
  createdAtMs: number;
}

export interface MobileChatThread {
  chatId: string;
  title: string;
  participantIds: string[];
  lastMessageText: string;
  lastMessageAtMs: number;
  unreadCount: number;
  avatarColor?: string;
  phoneNumber?: string;
}

export interface MobileChatMessage {
  messageId: string;
  chatId: string;
  senderUid: string;
  senderName: string;
  text: string;
  createdAtMs: number;
  readByUids: string[];
}

export interface MobileStatusUpdate {
  statusId: string;
  authorUid: string;
  authorName: string;
  caption: string;
  createdAtMs: number;
  expiresAtMs: number;
  viewed: boolean;
}

export interface MobileCallRecord {
  callId: string;
  peerName: string;
  peerPhone: string;
  direction: 'incoming' | 'outgoing' | 'missed';
  mediaType: 'voice' | 'video';
  timestampMs: number;
  durationSeconds: number;
}

export interface MobileSubscriptionState {
  plan: 'trial_30_day' | 'annual_10_usd' | 'vip_founder';
  status: 'trialing' | 'active' | 'expired' | 'cancelled';
  trialStartAtMs: number;
  trialEndAtMs: number;
  currentPeriodEndMs?: number;
  annualPriceUsd: number;
  autoRenew: boolean;
}
