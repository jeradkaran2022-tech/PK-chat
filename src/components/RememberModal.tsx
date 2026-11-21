import React, { useEffect, useState } from 'react';
import { BellPlus, CalendarClock, CheckCircle2, Clock, Sparkles, X } from 'lucide-react';
import {
  RememberCategory,
  RememberPreset,
  RememberReminder,
  computePresetRemindAtMs,
  formatReminderTimeLabel,
  saveReminder,
} from '../lib/rememberReminders';
import { playNotificationTone } from '../lib/audioTones';

export interface RememberModalDraft {
  category: RememberCategory;
  title: string;
  note?: string;
  targetId?: string;
  targetLabel?: string;
}

export function RememberModal({
  open,
  userId,
  draft,
  onClose,
  onSaved,
}: {
  open: boolean;
  userId: string;
  draft: RememberModalDraft | null;
  onClose: () => void;
  onSaved?: (reminder: RememberReminder) => void;
}) {
  const [category, setCategory] = useState<RememberCategory>('message');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [preset, setPreset] = useState<RememberPreset>('15m');
  const [customDateTime, setCustomDateTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSavedToast(null);
    setCategory(draft?.category || 'task');
    setTitle(draft?.title || '');
    setNote(draft?.note || '');
    setPreset('15m');
    const nextHour = new Date(Date.now() + 60 * 60_000);
    const localIso = new Date(nextHour.getTime() - nextHour.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    setCustomDateTime(localIso);
  }, [open, draft]);

  if (!open) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Enter what you want PK Chat to remember.');
      return;
    }

    let customMs: number | undefined;
    if (preset === 'custom') {
      const parsed = Date.parse(customDateTime);
      if (!Number.isFinite(parsed) || parsed <= Date.now()) {
        setError('Pick a future date and time.');
        return;
      }
      customMs = parsed;
    }

    const remindAtMs = computePresetRemindAtMs(preset, customMs);
    const created = saveReminder({
      userId: userId || 'local_user',
      title: cleanTitle,
      note,
      category,
      targetId: draft?.targetId,
      targetLabel: draft?.targetLabel,
      remindAtMs,
    });

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    playNotificationTone('pk_direct_chime', 'direct_message', { allowDuringPreview: true });

    setSavedToast(`Saved for ${formatReminderTimeLabel(created.remindAtMs)}`);
    onSaved?.(created);
    window.setTimeout(() => {
      onClose();
    }, 650);
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Remember Reminder"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-[#e6f4ff]/88 dark:bg-[#0f172a]/95 backdrop-blur-2xl border border-[#7dd3fc] dark:border-sky-500/35 shadow-[0_18px_48px_rgba(2,132,199,0.28)] overflow-hidden"
      >
        <div className="px-5 py-4 bg-gradient-to-r from-[#0284c7] to-[#38bdf8] text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
              <BellPlus className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold truncate">PK Chat Remember</h2>
              <p className="text-[11px] text-sky-50 truncate">
                Save instant personal alerts so you never forget
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close reminder dialog"
            className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[#0369a1] dark:text-[#38bdf8]">
              Category
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'message', label: 'Message' },
                  { id: 'call', label: 'Call' },
                  { id: 'class', label: 'Live Class' },
                  { id: 'task', label: 'Task' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`py-2 px-2 rounded-xl font-bold border transition-all ${
                    category === cat.id
                      ? 'bg-[#0284c7] text-white border-[#0284c7] shadow-xs'
                      : 'bg-sky-50/70 dark:bg-slate-900 border-[#bae6fd] dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[#0369a1] dark:text-[#38bdf8]">
              What should PK Chat remember?
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
              placeholder="e.g. Reply to Amma, Call Ravi, Join Physics Class..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-sky-50/60 dark:bg-slate-900 border border-[#bae6fd] dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[#0369a1] dark:text-[#38bdf8]">
              Context / Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Message snippet, class link note, or phone number..."
              className="w-full px-3.5 py-2 rounded-xl bg-sky-50/60 dark:bg-slate-900 border border-[#bae6fd] dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[#0369a1] dark:text-[#38bdf8] flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>When should PK Chat alert you?</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {(
                [
                  { id: '15m', label: 'In 15 mins' },
                  { id: '1h', label: 'In 1 hour' },
                  { id: 'tonight_8pm', label: 'Tonight 8 PM' },
                  { id: 'tomorrow_8am', label: 'Tomorrow 8 AM' },
                  { id: 'custom', label: 'Custom Time' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPreset(opt.id)}
                  className={`py-2 px-2.5 rounded-xl font-semibold border transition-colors ${
                      preset === opt.id
                        ? 'bg-gradient-to-r from-[#0284c7] to-[#38bdf8] text-white border-[#0284c7]'
                        : 'bg-[#d8eeff]/75 dark:bg-slate-900 border-[#7dd3fc]/70 dark:border-slate-700 text-slate-800 dark:text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {preset === 'custom' && (
              <input
                type="datetime-local"
                value={customDateTime}
                onChange={(e) => setCustomDateTime(e.target.value)}
                className="mt-2 w-full px-3 py-2 rounded-xl bg-sky-50/70 dark:bg-slate-900 border border-[#bae6fd] dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              />
            )}
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-[11px] font-medium">
              {error}
            </div>
          )}

          {savedToast && (
            <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-[#bae6fd] dark:border-sky-700 text-[#0284c7] dark:text-[#38bdf8] text-[11px] font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{savedToast}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#0284c7] to-[#0ea5e9] hover:brightness-105 text-white font-bold inline-flex items-center gap-1.5 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Save Remember Alert</span>
              <CalendarClock className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
