import React, { useEffect, useState } from 'react';
import { BellRing, Check, Clock, X } from 'lucide-react';
import {
  REMINDERS_CHANGED_EVENT,
  REMINDERS_CHANNEL,
  RememberReminder,
  collectDueReminders,
  formatReminderTimeLabel,
  getRemindersList,
  markReminderDone,
  snoozeReminder,
} from '../lib/rememberReminders';
import { playNotificationTone } from '../lib/audioTones';
import { usePkChat } from '../context/PkChatContext';

export function RememberDueOverlay() {
  const { userProfile, setActiveScreen, setActiveChat } = usePkChat();
  const uid = userProfile?.uid;
  const [dueItems, setDueItems] = useState<RememberReminder[]>(() =>
    getRemindersList(uid).filter((r) => r.status === 'due')
  );

  useEffect(() => {
    const checkDue = () => {
      const newlyDue = collectDueReminders(Date.now());
      if (newlyDue.length > 0) {
        playNotificationTone('pk_direct_chime', 'direct_message');
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const first = newlyDue[0];
            new Notification(`PK Chat Remember (${first.category.toUpperCase()})`, {
              body: first.title + (first.note ? ` — ${first.note}` : ''),
            });
          } catch {
            // ignore Notification API restrictions inside iframes
          }
        }
      }
      setDueItems(getRemindersList(uid).filter((r) => r.status === 'due'));
    };

    checkDue();
    const timer = window.setInterval(checkDue, 5000);
    const onChanged = () => {
      setDueItems(getRemindersList(uid).filter((r) => r.status === 'due'));
    };
    window.addEventListener(REMINDERS_CHANGED_EVENT, onChanged);

    let channel: BroadcastChannel | null = null;
    if ('BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel(REMINDERS_CHANNEL);
        channel.onmessage = onChanged;
      } catch {
        channel = null;
      }
    }

    return () => {
      window.clearInterval(timer);
      window.removeEventListener(REMINDERS_CHANGED_EVENT, onChanged);
      channel?.close();
    };
  }, [uid]);

  if (dueItems.length === 0) return null;

  const active = dueItems[0];

  return (
    <div
      role="alert"
      aria-label="Remember Reminder Due"
      className="fixed bottom-20 lg:bottom-6 right-3 left-3 sm:left-auto sm:w-96 z-[65] rounded-3xl bg-[#e3f3ff]/88 dark:bg-[#0f172a]/95 backdrop-blur-2xl border border-[#38bdf8] shadow-[0_14px_40px_rgba(2,132,199,0.35)] p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#0284c7] to-[#38bdf8] text-white flex items-center justify-center shrink-0 shadow-xs">
            <BellRing className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/60 text-[#0284c7] dark:text-[#38bdf8]">
                Remember · {active.category}
              </span>
              {dueItems.length > 1 && (
                <span className="text-[10px] font-bold text-slate-500">
                  +{dueItems.length - 1} more
                </span>
              )}
            </div>
            <p className="mt-1 text-xs font-extrabold text-slate-900 dark:text-white leading-snug">
              {active.title}
            </p>
            {active.note && (
              <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2">
                {active.note}
              </p>
            )}
            <p className="mt-1 text-[10px] text-slate-400">
              Scheduled for {formatReminderTimeLabel(active.remindAtMs)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => markReminderDone(active.reminderId)}
          aria-label="Dismiss reminder"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1.5 text-[11px]">
        {active.category === 'class' && (
          <button
            type="button"
            onClick={() => {
              markReminderDone(active.reminderId);
              setActiveScreen('class_room');
            }}
            className="px-3 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-[#bae6fd] dark:border-sky-700 text-[#0284c7] dark:text-[#38bdf8] font-bold"
          >
            Open Live Class
          </button>
        )}
        {active.category === 'call' && (
          <button
            type="button"
            onClick={() => {
              markReminderDone(active.reminderId);
              setActiveScreen('audio_call');
            }}
            className="px-3 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-[#bae6fd] dark:border-sky-700 text-[#0284c7] dark:text-[#38bdf8] font-bold"
          >
            Open Calls
          </button>
        )}
        {active.category === 'message' && active.targetId && (
          <button
            type="button"
            onClick={() => {
              markReminderDone(active.reminderId);
              setActiveChat(active.targetId!, active.targetId!.startsWith('group') ? 'group' : 'direct');
              setActiveScreen(active.targetId!.startsWith('group') ? 'group_chat' : 'individual_chat');
            }}
            className="px-3 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-[#bae6fd] dark:border-sky-700 text-[#0284c7] dark:text-[#38bdf8] font-bold"
          >
            Open Chat
          </button>
        )}
        <button
          type="button"
          onClick={() => snoozeReminder(active.reminderId, 10)}
          className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold inline-flex items-center gap-1"
        >
          <Clock className="w-3 h-3" />
          <span>Snooze 10m</span>
        </button>
        <button
          type="button"
          onClick={() => markReminderDone(active.reminderId)}
          className="px-3.5 py-1.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold inline-flex items-center gap-1"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Done</span>
        </button>
      </div>
    </div>
  );
}
