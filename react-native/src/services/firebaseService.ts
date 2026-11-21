import {
  Timestamp,
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { mobileDb } from '../config/firebase';
import type {
  MobileCallRecord,
  MobileChatMessage,
  MobileChatThread,
  MobileStatusUpdate,
  MobileSubscriptionState,
  MobileUserProfile,
} from '../types/models';
import {
  ANNUAL_SUBSCRIPTION_PRICE_USD,
  createRegistrationTrialState,
  isVipFounderNumber,
} from './subscriptionService';

export function subscribeUserProfile(
  uid: string,
  onChange: (profile: MobileUserProfile | null) => void
) {
  return onSnapshot(doc(mobileDb, 'users', uid), (snap) => {
    if (!snap.exists()) {
      onChange(null);
      return;
    }
    const data = snap.data();
    onChange({
      uid,
      fullName: String(data.fullName || 'PK Chat User'),
      phoneNumber: String(data.phoneNumber || ''),
      about: String(data.about || 'Available on PK Chat'),
      avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : undefined,
      dateOfBirth: String(data.dateOfBirth || '2000-01-01'),
      country: String(data.country || 'Sri Lanka'),
      preferredLanguageCode: String(data.preferredLanguage || 'en'),
      preferredLanguageName: String(data.preferredLanguageName || 'English'),
      createdAtMs:
        data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now(),
    });
  });
}

export async function updateProfileDob(uid: string, dateOfBirth: string): Promise<void> {
  await setDoc(
    doc(mobileDb, 'users', uid),
    {
      dateOfBirth,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function updateProfileBasics(
  uid: string,
  patch: Partial<Pick<MobileUserProfile, 'fullName' | 'about' | 'dateOfBirth'>>
): Promise<void> {
  await setDoc(
    doc(mobileDb, 'users', uid),
    {
      ...patch,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function subscribeSubscription(
  uid: string,
  phoneNumber: string | undefined,
  onChange: (sub: MobileSubscriptionState) => void
) {
  return onSnapshot(doc(mobileDb, 'subscriptions', uid), (snap) => {
    if (!snap.exists()) {
      const initial = createRegistrationTrialState();
      if (isVipFounderNumber(phoneNumber)) {
        onChange({ ...initial, plan: 'vip_founder', status: 'active', annualPriceUsd: 0 });
      } else {
        onChange(initial);
      }
      return;
    }
    const data = snap.data();
    const startMs =
      data.trialStartAt instanceof Timestamp ? data.trialStartAt.toMillis() : Date.now();
    const endMs =
      data.trialEndAt instanceof Timestamp
        ? data.trialEndAt.toMillis()
        : startMs + 30 * 24 * 60 * 60 * 1000;
    const periodEndMs =
      data.currentPeriodEnd instanceof Timestamp ? data.currentPeriodEnd.toMillis() : undefined;

    onChange({
      plan:
        data.plan === 'vip_founder'
          ? 'vip_founder'
          : data.status === 'active'
            ? 'annual_10_usd'
            : 'trial_30_day',
      status: data.status || 'trialing',
      trialStartAtMs: startMs,
      trialEndAtMs: endMs,
      currentPeriodEndMs: periodEndMs,
      annualPriceUsd:
        typeof data.annualPriceUsd === 'number'
          ? data.annualPriceUsd
          : ANNUAL_SUBSCRIPTION_PRICE_USD,
      autoRenew: data.autoRenew !== false,
    });
  });
}

export async function activateAnnualSubscription(uid: string): Promise<void> {
  const now = Date.now();
  const nextYear = new Date(now + 365 * 24 * 60 * 60 * 1000);
  await setDoc(
    doc(mobileDb, 'subscriptions', uid),
    {
      uid,
      plan: 'annual_10_usd',
      status: 'active',
      annualPriceUsd: ANNUAL_SUBSCRIPTION_PRICE_USD,
      autoRenew: true,
      currentPeriodEnd: Timestamp.fromDate(nextYear),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function subscribeDirectChats(
  uid: string,
  onChange: (chats: MobileChatThread[]) => void
) {
  const q = query(
    collection(mobileDb, 'chats'),
    where('participantIds', 'array-contains', uid)
  );
  return onSnapshot(q, (snap) => {
    const items: MobileChatThread[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        chatId: d.id,
        title: String(data.title || 'PK Chat Contact'),
        participantIds: Array.isArray(data.participantIds) ? data.participantIds : [uid],
        lastMessageText: String(data.lastMessageText || 'Tap to start messaging'),
        lastMessageAtMs:
          data.lastMessageAt instanceof Timestamp ? data.lastMessageAt.toMillis() : Date.now(),
        unreadCount: Number(data.unreadCount || 0),
        phoneNumber: typeof data.phoneNumber === 'string' ? data.phoneNumber : undefined,
      };
    });
    items.sort((a, b) => b.lastMessageAtMs - a.lastMessageAtMs);
    onChange(items);
  });
}

export function subscribeChatMessages(
  chatId: string,
  onChange: (messages: MobileChatMessage[]) => void
) {
  const q = query(
    collection(mobileDb, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(q, (snap) => {
    const rows: MobileChatMessage[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        messageId: d.id,
        chatId,
        senderUid: String(data.senderUid || ''),
        senderName: String(data.senderName || 'User'),
        text: String(data.originalText || data.text || ''),
        createdAtMs:
          data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now(),
        readByUids: Array.isArray(data.readByUids) ? data.readByUids : [],
      };
    });
    onChange(rows);
  });
}

export async function sendChatTextMessage(params: {
  chatId: string;
  senderUid: string;
  senderName: string;
  text: string;
}): Promise<void> {
  const trimmed = params.text.trim();
  if (!trimmed) return;
  await addDoc(collection(mobileDb, 'chats', params.chatId, 'messages'), {
    chatId: params.chatId,
    senderUid: params.senderUid,
    senderName: params.senderName,
    originalText: trimmed,
    readByUids: [params.senderUid],
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(mobileDb, 'chats', params.chatId), {
    lastMessageText: trimmed,
    lastMessageAt: serverTimestamp(),
  });
}

export function subscribeStatuses(onChange: (items: MobileStatusUpdate[]) => void) {
  const q = query(collection(mobileDb, 'statuses'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    const now = Date.now();
    const list: MobileStatusUpdate[] = snap.docs
      .map((d) => {
        const data = d.data();
        const created =
          data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : now;
        const expires =
          data.expiresAt instanceof Timestamp
            ? data.expiresAt.toMillis()
            : created + 24 * 60 * 60 * 1000;
        return {
          statusId: d.id,
          authorUid: String(data.authorUid || ''),
          authorName: String(data.authorName || 'PK Chat Member'),
          caption: String(data.caption || ''),
          createdAtMs: created,
          expiresAtMs: expires,
          viewed: false,
        };
      })
      .filter((item) => item.expiresAtMs > now);
    onChange(list);
  });
}

export async function publishMobileStatus(params: {
  authorUid: string;
  authorName: string;
  caption: string;
}): Promise<void> {
  const text = params.caption.trim();
  if (!text) return;
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
  await addDoc(collection(mobileDb, 'statuses'), {
    authorUid: params.authorUid,
    authorName: params.authorName,
    caption: text,
    createdAt: serverTimestamp(),
    expiresAt,
  });
}

export function subscribeCallsHistory(
  uid: string,
  onChange: (calls: MobileCallRecord[]) => void
) {
  const q = query(
    collection(mobileDb, 'calls'),
    where('participantIds', 'array-contains', uid)
  );
  return onSnapshot(q, (snap) => {
    const list: MobileCallRecord[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        callId: d.id,
        peerName: String(data.peerName || 'PK Chat Contact'),
        peerPhone: String(data.peerPhone || ''),
        direction:
          data.direction === 'incoming' || data.direction === 'missed'
            ? data.direction
            : 'outgoing',
        mediaType: data.mediaType === 'video' ? 'video' : 'voice',
        timestampMs:
          data.startedAt instanceof Timestamp ? data.startedAt.toMillis() : Date.now(),
        durationSeconds: Number(data.durationSeconds || 0),
      };
    });
    list.sort((a, b) => b.timestampMs - a.timestampMs);
    onChange(list);
  });
}
