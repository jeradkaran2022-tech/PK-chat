import type { ChatMessage } from '../types/pkchat';

export interface OfflineQueuedMessageRecord {
  messageId: string;
  chatId: string;
  chatType: 'direct' | 'group';
  participantIds: string[];
  senderId: string;
  senderName: string;
  senderLanguage: string;
  messageType: ChatMessage['messageType'];
  originalText: string;
  encryptedPayload?: string;
  e2eeEnabled: boolean;
  mediaName?: string;
  mediaMimeType?: string;
  mediaPreviewData?: string;
  replyToId?: string;
  replyToText?: string;
  forwardedFrom?: string;
  burnAfterSeconds?: number;
  expiresAtMs?: number;
  queuedAtIso: string;
}

export const OFFLINE_OUTBOX_STORAGE_KEY = 'pk_offline_message_outbox_v1';
export const OFFLINE_OUTBOX_CHANGED_EVENT = 'pkchat-offline-outbox-changed';

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      return (globalThis as unknown as { localStorage: Storage }).localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function notifyOutboxChanged(count: number): void {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(OFFLINE_OUTBOX_CHANGED_EVENT, { detail: { count } }));
    }
  } catch {
    // Ignore dispatch issues in headless environments
  }
}

export function getOfflineOutbox(senderId?: string): OfflineQueuedMessageRecord[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(OFFLINE_OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(
      (item): item is OfflineQueuedMessageRecord =>
        Boolean(
          item &&
            typeof item.messageId === 'string' &&
            typeof item.chatId === 'string' &&
            typeof item.senderId === 'string'
        )
    );
    return senderId ? valid.filter((m) => m.senderId === senderId) : valid;
  } catch {
    return [];
  }
}

export function enqueueOfflineMessage(
  record: OfflineQueuedMessageRecord
): OfflineQueuedMessageRecord[] {
  const existing = getOfflineOutbox();
  const deduped = existing.filter((m) => m.messageId !== record.messageId);
  const next = [...deduped, record].slice(-120);
  try {
    getStorage()?.setItem(OFFLINE_OUTBOX_STORAGE_KEY, JSON.stringify(next));
    notifyOutboxChanged(next.length);
  } catch {
    // Ignore storage quota errors
  }
  return next;
}

export function removeOfflineOutboxItem(messageId: string): OfflineQueuedMessageRecord[] {
  const existing = getOfflineOutbox();
  const next = existing.filter((m) => m.messageId !== messageId);
  try {
    getStorage()?.setItem(OFFLINE_OUTBOX_STORAGE_KEY, JSON.stringify(next));
    notifyOutboxChanged(next.length);
  } catch {
    // Ignore storage quota errors
  }
  return next;
}

export function clearOfflineOutbox(senderId?: string): void {
  if (!senderId) {
    try {
      getStorage()?.removeItem(OFFLINE_OUTBOX_STORAGE_KEY);
      notifyOutboxChanged(0);
    } catch {
      // Ignore
    }
    return;
  }
  const remaining = getOfflineOutbox().filter((m) => m.senderId !== senderId);
  try {
    getStorage()?.setItem(OFFLINE_OUTBOX_STORAGE_KEY, JSON.stringify(remaining));
    notifyOutboxChanged(remaining.length);
  } catch {
    // Ignore
  }
}

export function queuedRecordToChatMessage(record: OfflineQueuedMessageRecord): ChatMessage {
  return {
    messageId: record.messageId,
    chatId: record.chatId,
    chatType: record.chatType,
    participantIds: record.participantIds,
    senderId: record.senderId,
    senderName: record.senderName,
    senderLanguage: record.senderLanguage,
    messageType: record.messageType,
    originalText: record.originalText,
    encryptedPayload: record.encryptedPayload,
    e2eeEnabled: record.e2eeEnabled,
    mediaName: record.mediaName,
    mediaMimeType: record.mediaMimeType,
    mediaPreviewData: record.mediaPreviewData,
    replyToId: record.replyToId,
    replyToText: record.replyToText,
    forwardedFrom: record.forwardedFrom,
    burnAfterSeconds: record.burnAfterSeconds,
    expiresAtMs: record.expiresAtMs,
    deleted: false,
    deliveredTo: [record.senderId],
    readBy: [record.senderId],
    createdAt: record.queuedAtIso,
    pendingOfflineSync: true,
  };
}
