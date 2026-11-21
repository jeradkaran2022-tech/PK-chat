export type RememberCategory = 'message' | 'call' | 'class' | 'task';
export type RememberPreset = '15m' | '1h' | 'tonight_8pm' | 'tomorrow_8am' | 'custom';
export type RememberStatus = 'pending' | 'due' | 'snoozed' | 'done';

export interface RememberReminder {
  reminderId: string;
  userId: string;
  title: string;
  note: string;
  category: RememberCategory;
  targetId?: string;
  targetLabel?: string;
  remindAtMs: number;
  status: RememberStatus;
  notifiedAtMs?: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export const REMINDERS_STORAGE_KEY = 'pk_remember_reminders_v1';
export const REMINDERS_CHANGED_EVENT = 'pkchat-reminders-changed';
export const REMINDERS_CHANNEL = 'pk_reminders_v1';

function readStorage(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      return (globalThis as unknown as { localStorage: Storage }).localStorage.getItem(key);
    }
  } catch {
    return null;
  }
  return null;
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    } else if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      (globalThis as unknown as { localStorage: Storage }).localStorage.setItem(key, value);
    }
    if (typeof window !== 'undefined') {
      if ('BroadcastChannel' in window) {
        try {
          const ch = new BroadcastChannel(REMINDERS_CHANNEL);
          ch.postMessage({ type: 'sync', at: Date.now() });
          ch.close();
        } catch {
          // ignore BroadcastChannel failures
        }
      }
      if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent(REMINDERS_CHANGED_EVENT));
      }
    }
  } catch {
    // ignore storage quota errors
  }
}

export function computePresetRemindAtMs(
  preset: RememberPreset,
  customTimestampMs?: number,
  nowMs: number = Date.now()
): number {
  if (preset === 'custom' && typeof customTimestampMs === 'number' && Number.isFinite(customTimestampMs)) {
    return Math.max(nowMs + 10_000, customTimestampMs);
  }
  if (preset === '15m') {
    return nowMs + 15 * 60_000;
  }
  if (preset === '1h') {
    return nowMs + 60 * 60_000;
  }
  if (preset === 'tonight_8pm') {
    const d = new Date(nowMs);
    d.setHours(20, 0, 0, 0);
    if (d.getTime() <= nowMs + 60_000) {
      d.setDate(d.getDate() + 1);
    }
    return d.getTime();
  }
  // tomorrow_8am
  const d = new Date(nowMs);
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.getTime();
}

export function getRemindersList(userId?: string): RememberReminder[] {
  const raw = readStorage(REMINDERS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const list = parsed.filter(
      (item): item is RememberReminder =>
        Boolean(item) &&
        typeof item.reminderId === 'string' &&
        typeof item.title === 'string' &&
        typeof item.remindAtMs === 'number'
    );
    const filtered = userId ? list.filter((r) => !r.userId || r.userId === userId) : list;
    return filtered.sort((a, b) => a.remindAtMs - b.remindAtMs);
  } catch {
    return [];
  }
}

function persistAllReminders(list: RememberReminder[]): void {
  writeStorage(REMINDERS_STORAGE_KEY, JSON.stringify(list.slice(0, 120)));
}

export function saveReminder(input: {
  reminderId?: string;
  userId: string;
  title: string;
  note?: string;
  category: RememberCategory;
  targetId?: string;
  targetLabel?: string;
  remindAtMs: number;
}): RememberReminder {
  const now = Date.now();
  const cleanTitle = input.title.trim().slice(0, 140) || 'PK Chat Reminder';
  const cleanNote = (input.note || '').trim().slice(0, 500);
  const existing = getRemindersList();
  const reminderId =
    input.reminderId ||
    `rem_${now}_${Math.random().toString(36).slice(2, 8)}`;

  const record: RememberReminder = {
    reminderId,
    userId: input.userId || 'local_user',
    title: cleanTitle,
    note: cleanNote,
    category: input.category,
    targetId: input.targetId?.slice(0, 128),
    targetLabel: input.targetLabel?.slice(0, 120),
    remindAtMs: input.remindAtMs,
    status: 'pending',
    createdAtMs: now,
    updatedAtMs: now,
  };

  const next = [record, ...existing.filter((r) => r.reminderId !== reminderId)];
  persistAllReminders(next);
  return record;
}

export function markReminderDone(reminderId: string): RememberReminder | null {
  const all = getRemindersList();
  let updated: RememberReminder | null = null;
  const now = Date.now();
  const next = all.map((r) => {
    if (r.reminderId !== reminderId) return r;
    updated = { ...r, status: 'done', updatedAtMs: now };
    return updated;
  });
  if (updated) persistAllReminders(next);
  return updated;
}

export function snoozeReminder(
  reminderId: string,
  minutes: number = 10,
  nowMs: number = Date.now()
): RememberReminder | null {
  const all = getRemindersList();
  let updated: RememberReminder | null = null;
  const safeMinutes = Math.max(1, Math.min(24 * 60, minutes));
  const next = all.map((r) => {
    if (r.reminderId !== reminderId) return r;
    updated = {
      ...r,
      status: 'snoozed',
      remindAtMs: nowMs + safeMinutes * 60_000,
      updatedAtMs: nowMs,
    };
    return updated;
  });
  if (updated) persistAllReminders(next);
  return updated;
}

export function deleteReminder(reminderId: string): void {
  const all = getRemindersList();
  persistAllReminders(all.filter((r) => r.reminderId !== reminderId));
}

export function collectDueReminders(nowMs: number = Date.now()): RememberReminder[] {
  const all = getRemindersList();
  const dueNow: RememberReminder[] = [];
  let changed = false;
  const next = all.map((r) => {
    if ((r.status === 'pending' || r.status === 'snoozed') && r.remindAtMs <= nowMs) {
      changed = true;
      const marked: RememberReminder = {
        ...r,
        status: 'due',
        notifiedAtMs: nowMs,
        updatedAtMs: nowMs,
      };
      dueNow.push(marked);
      return marked;
    }
    return r;
  });
  if (changed) {
    persistAllReminders(next);
  }
  return dueNow;
}

export function getActivePendingRemindersCount(userId?: string): number {
  return getRemindersList(userId).filter((r) => r.status !== 'done').length;
}

export function formatReminderTimeLabel(remindAtMs: number): string {
  const d = new Date(remindAtMs);
  const now = new Date();
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) {
    return `Today · ${timeStr}`;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow · ${timeStr}`;
  }
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${timeStr}`;
}
