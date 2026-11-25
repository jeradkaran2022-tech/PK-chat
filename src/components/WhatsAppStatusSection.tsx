import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Plus,
  Send,
  Smile,
  X,
} from 'lucide-react';
import { usePkChat } from '../context/PkChatContext';
import { ContactRecord, StatusUpdate } from '../types/pkchat';
import {
  STATUS_QUICK_REACTIONS,
  STATUS_TEXT_BACKGROUNDS,
  formatStatusRelativeTime,
  groupStatusesByAuthor,
  toEpochMs,
} from '../lib/statusMedia';
import { UserAvatar } from './UserAvatar';

export interface WhatsAppStatusUser {
  uid: string;
  displayName?: string;
  fullName?: string;
  photoURL?: string;
  avatarUrl?: string;
}

export interface WhatsAppStatusSectionProps {
  currentUser?: WhatsAppStatusUser | null;
  contacts?: ContactRecord[];
  onOpenComposer?: () => void;
  onSelectStatusGroup?: (authorUid: string) => void;
}

function formatClockTime(value: unknown): string {
  const ms = toEpochMs(value);
  if (!ms) return 'Just now';
  try {
    return new Date(ms).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return formatStatusRelativeTime(value);
  }
}

function getStoryBgGradient(cssColor?: string): string {
  const found = STATUS_TEXT_BACKGROUNDS.find((b) => b.css === cssColor);
  return found
    ? `bg-gradient-to-br ${found.gradient}`
    : 'bg-gradient-to-br from-[#0284c7] to-[#0369a1]';
}

export function WhatsAppStatusSection({
  currentUser,
  contacts: propContacts,
  onOpenComposer,
  onSelectStatusGroup,
}: WhatsAppStatusSectionProps) {
  const pkChat = usePkChat();
  const uid = currentUser?.uid || pkChat.userProfile?.uid || pkChat.firebaseUser?.uid || '';
  const ownerName =
    currentUser?.displayName ||
    currentUser?.fullName ||
    pkChat.userProfile?.fullName ||
    'My Status';
  const ownerAvatar =
    currentUser?.photoURL ||
    currentUser?.avatarUrl ||
    pkChat.profileMedia?.avatarDataUrl ||
    pkChat.userProfile?.avatarUrl;

  const activeContacts = propContacts ?? pkChat.contacts;

  // 1. Group active 24-hour statuses into My Status, Recent Updates, and Viewed Updates
  const { myStatuses, recentGroups, viewedGroups } = useMemo(() => {
    const grouped = groupStatusesByAuthor(pkChat.statuses, uid);
    const contactNameMap = new Map<string, string>();
    for (const c of activeContacts) {
      if (c.contactUid && c.displayName) {
        contactNameMap.set(c.contactUid, c.displayName);
      }
    }
    const resolveGroupName = <T extends { userId: string; authorName: string }>(grp: T): T => ({
      ...grp,
      authorName: contactNameMap.get(grp.userId) || grp.authorName,
    });
    return {
      myStatuses: grouped.myStatuses,
      recentGroups: grouped.recentGroups.map(resolveGroupName),
      viewedGroups: grouped.viewedGroups.map(resolveGroupName),
    };
  }, [activeContacts, pkChat.statuses, uid]);

  const [viewerAuthorUid, setViewerAuthorUid] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [showViewersSheet, setShowViewersSheet] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyFeedback, setReplyFeedback] = useState<string | null>(null);
  const storyVideoRef = useRef<HTMLVideoElement | null>(null);

  const activeGroupStatuses: StatusUpdate[] = useMemo(() => {
    if (!viewerAuthorUid) return [];
    if (viewerAuthorUid === uid) return myStatuses;
    const found =
      recentGroups.find((g) => g.userId === viewerAuthorUid) ||
      viewedGroups.find((g) => g.userId === viewerAuthorUid);
    return found?.statuses || [];
  }, [myStatuses, recentGroups, uid, viewedGroups, viewerAuthorUid]);

  const currentItem = activeGroupStatuses[currentIndex] || null;
  const isMyStatus = Boolean(currentItem && currentItem.userId === uid);

  const closeViewer = useCallback(() => {
    setViewerAuthorUid(null);
    setCurrentIndex(0);
    setProgressPct(0);
    setShowViewersSheet(false);
    setReplyText('');
    setReplyFeedback(null);
  }, []);

  const handleOpenGroup = (authorUid: string, startUnseen = true) => {
    if (onSelectStatusGroup) {
      onSelectStatusGroup(authorUid);
      return;
    }
    const list =
      authorUid === uid
        ? myStatuses
        : (
            recentGroups.find((g) => g.userId === authorUid) ||
            viewedGroups.find((g) => g.userId === authorUid)
          )?.statuses || [];
    if (list.length === 0) return;

    let initialIdx = 0;
    if (startUnseen && authorUid !== uid) {
      const unseenIdx = list.findIndex((s) => !s.viewedByUids?.includes(uid));
      if (unseenIdx >= 0) initialIdx = unseenIdx;
    }

    setViewerAuthorUid(authorUid);
    setCurrentIndex(initialIdx);
    setProgressPct(0);
    setShowViewersSheet(false);
    setReplyText('');
    setReplyFeedback(null);
  };

  const handleNext = useCallback(() => {
    if (currentIndex + 1 < activeGroupStatuses.length) {
      setCurrentIndex((prev) => prev + 1);
      setProgressPct(0);
    } else {
      closeViewer();
    }
  }, [activeGroupStatuses.length, closeViewer, currentIndex]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setProgressPct(0);
    } else {
      setProgressPct(0);
    }
  }, [currentIndex]);

  // 2. Automatically record "Viewed by" entry whenever viewing another contact's status slide
  useEffect(() => {
    if (!currentItem || !uid || currentItem.userId === uid) return;
    void pkChat.markStatusViewed(currentItem.statusId);
  }, [currentItem, pkChat, uid]);

  // 3. Auto-advance story timer (paused automatically while Viewers Bottom Sheet is open)
  useEffect(() => {
    if (!currentItem || showViewersSheet) return;
    if (currentItem.mediaType === 'video') {
      const videoEl = storyVideoRef.current;
      if (videoEl && videoEl.paused) {
        videoEl.play().catch(() => {});
      }
      return;
    }

    const DURATION_MS = 6000;
    const STEP_MS = 60;
    let elapsed = (progressPct / 100) * DURATION_MS;
    const interval = window.setInterval(() => {
      elapsed += STEP_MS;
      const next = Math.min(100, (elapsed / DURATION_MS) * 100);
      setProgressPct(next);
      if (elapsed >= DURATION_MS) {
        window.clearInterval(interval);
        handleNext();
      }
    }, STEP_MS);

    return () => window.clearInterval(interval);
  }, [currentItem, handleNext, progressPct, showViewersSheet]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentItem || !replyText.trim() || replyBusy) return;
    setReplyBusy(true);
    setReplyFeedback(null);
    try {
      await pkChat.replyToStatus(currentItem, replyText.trim());
      setReplyText('');
      setReplyFeedback('Private reply sent to chat.');
      window.setTimeout(() => setReplyFeedback(null), 2200);
    } catch (err) {
      setReplyFeedback(err instanceof Error ? err.message : 'Unable to send reply.');
    } finally {
      setReplyBusy(false);
    }
  };

  const handleQuickReact = async (emoji: string) => {
    if (!currentItem) return;
    try {
      await pkChat.reactToStatus(currentItem.statusId, emoji);
      setReplyFeedback(`Reacted ${emoji}`);
      window.setTimeout(() => setReplyFeedback(null), 1800);
    } catch (err) {
      setReplyFeedback(err instanceof Error ? err.message : 'Unable to send reaction.');
    }
  };

  const viewersList = useMemo(() => {
    const list = currentItem?.viewers || [];
    return [...list].sort((a, b) => toEpochMs(b.viewedAt) - toEpochMs(a.viewedAt));
  }, [currentItem?.viewers]);

  return (
    <div className="space-y-4">
      {/* My Status Card */}
      <div className="rounded-3xl bg-[#e3f3ff]/82 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              if (myStatuses.length > 0) {
                handleOpenGroup(uid, false);
              } else if (onOpenComposer) {
                onOpenComposer();
              }
            }}
            className="flex items-center gap-3.5 text-left flex-1 min-w-0 group"
          >
            <div className="relative w-12 h-12 shrink-0 flex items-center justify-center">
              <div
                className={`rounded-full p-[2px] ${
                  myStatuses.length > 0
                    ? 'ring-2 ring-[#0284c7] ring-offset-2 ring-offset-[#e3f3ff] dark:ring-offset-slate-900'
                    : ''
                }`}
              >
                <UserAvatar src={ownerAvatar} name={ownerName} size="md" className="w-12 h-12" />
              </div>
              {myStatuses.length === 0 && (
                <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#0284c7] text-white border-2 border-[#e3f3ff] dark:border-slate-900 flex items-center justify-center">
                  <Plus className="w-3 h-3" />
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-[#0284c7] truncate">
                My Status
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                {myStatuses.length > 0
                  ? `${myStatuses.length} update${myStatuses.length > 1 ? 's' : ''} · ${formatStatusRelativeTime(
                      myStatuses[myStatuses.length - 1].createdAt
                    )}`
                  : 'Tap to add status update (24h)'}
              </p>
            </div>
          </button>

          {onOpenComposer && (
            <button
              type="button"
              onClick={onOpenComposer}
              className="px-3 py-1.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          )}
        </div>
      </div>

      {/* Recent Updates */}
      <div className="rounded-3xl bg-[#e3f3ff]/82 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 p-4 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-[#0284c7] dark:text-[#38bdf8] uppercase tracking-wider">
            Recent updates ({recentGroups.length})
          </h3>
          <span className="text-[11px] text-slate-500">24-hour updates</span>
        </div>

        {recentGroups.length === 0 ? (
          <p className="text-xs text-slate-500 py-2">
            No unseen contact updates right now.
          </p>
        ) : (
          <div className="divide-y divide-sky-200/70 dark:divide-slate-800">
            {recentGroups.map((group) => (
              <button
                key={group.userId}
                type="button"
                onClick={() => handleOpenGroup(group.userId, true)}
                className="w-full py-2.5 px-2 rounded-2xl flex items-center gap-3 cursor-pointer hover:bg-[#d2ecff]/70 dark:hover:bg-slate-800/60 transition text-left"
              >
                <div className="w-12 h-12 rounded-full p-[2px] border-2 border-[#0284c7] flex items-center justify-center shrink-0">
                  <UserAvatar
                    src={group.authorAvatar}
                    name={group.authorName}
                    size="md"
                    className="w-full h-full"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                    {group.authorName}
                  </p>
                  <p className="text-xs text-[#0284c7] dark:text-[#38bdf8] font-medium">
                    {group.unseenCount} new · {formatStatusRelativeTime(group.latestCreatedAtMs)}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Viewed Updates */}
      {viewedGroups.length > 0 && (
        <div className="rounded-3xl bg-[#e3f3ff]/82 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 p-4 shadow-sm space-y-2.5">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Viewed updates ({viewedGroups.length})
          </h3>
          <div className="divide-y divide-sky-200/70 dark:divide-slate-800">
            {viewedGroups.map((group) => (
              <button
                key={group.userId}
                type="button"
                onClick={() => handleOpenGroup(group.userId, false)}
                className="w-full py-2.5 px-2 rounded-2xl flex items-center gap-3 cursor-pointer hover:bg-[#d2ecff]/70 dark:hover:bg-slate-800/60 transition text-left"
              >
                <div className="w-12 h-12 rounded-full p-[2px] border-2 border-slate-400 flex items-center justify-center shrink-0">
                  <UserAvatar
                    src={group.authorAvatar}
                    name={group.authorName}
                    size="md"
                    className="w-full h-full"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">
                    {group.authorName}
                  </p>
                  <p className="text-xs text-slate-500">
                    Viewed · {formatStatusRelativeTime(group.latestCreatedAtMs)}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Full-Screen Status Viewer Modal */}
      {viewerAuthorUid && currentItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col justify-between">
          {/* Top Progress Bars + Author Header */}
          <div className="p-4 pt-5 space-y-3 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex gap-1.5 max-w-xl mx-auto w-full">
              {activeGroupStatuses.map((item, idx) => {
                const widthPct =
                  idx < currentIndex ? 100 : idx === currentIndex ? Math.round(progressPct) : 0;
                return (
                  <div
                    key={item.statusId}
                    className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden"
                  >
                    <div
                      className="h-full bg-[#38bdf8] transition-all duration-75"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-white max-w-xl mx-auto w-full">
              <div className="flex items-center gap-3 min-w-0">
                <UserAvatar
                  src={isMyStatus ? ownerAvatar : currentItem.authorAvatar}
                  name={isMyStatus ? ownerName : currentItem.authorName}
                  size="sm"
                  className="border-white/70"
                />
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {isMyStatus ? 'My Status' : currentItem.authorName}
                  </p>
                  <p className="text-[11px] text-white/75 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    <span>{formatStatusRelativeTime(currentItem.createdAt)}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeViewer}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
                aria-label="Close Status Viewer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Media / Text Stage */}
          <div className="relative flex-1 flex items-center justify-center px-4 overflow-hidden">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous Status"
              className="absolute left-3 z-10 p-2 rounded-full bg-black/45 hover:bg-black/75 text-white"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            {currentItem.mediaType === 'video' ? (
              <video
                ref={storyVideoRef}
                src={currentItem.mediaUrl}
                controls
                autoPlay
                playsInline
                onEnded={handleNext}
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  if (v.duration > 0) {
                    setProgressPct(Math.min(100, (v.currentTime / v.duration) * 100));
                  }
                }}
                className="max-h-[70vh] max-w-full rounded-2xl bg-black"
              />
            ) : currentItem.mediaType === 'image' ? (
              <img
                src={currentItem.mediaUrl}
                alt={currentItem.caption || 'Status photo'}
                className="max-h-[70vh] max-w-full rounded-2xl object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className={`w-full max-w-lg rounded-3xl p-8 min-h-[320px] flex items-center justify-center text-center shadow-2xl ${getStoryBgGradient(
                  currentItem.backgroundColor
                )}`}
              >
                <p className="text-white text-2xl font-bold leading-snug whitespace-pre-wrap break-words">
                  {currentItem.textContent || currentItem.caption}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleNext}
              aria-label="Next Status"
              className="absolute right-3 z-10 p-2 rounded-full bg-black/45 hover:bg-black/75 text-white"
            >
              <ChevronRight className="w-6 h-6" />
            </button>

            {replyFeedback && (
              <div className="absolute bottom-6 px-4 py-1.5 rounded-full bg-[#0284c7] text-white text-xs font-bold shadow-lg">
                {replyFeedback}
              </div>
            )}
          </div>

          {/* Bottom Bar: Owner "Viewed by" Counter Pill OR Contact Reaction + Reply */}
          <div className="p-4 bg-gradient-to-t from-black/90 via-black/70 to-transparent space-y-3">
            {currentItem.caption && (
              <p className="text-center text-sm text-white font-medium max-w-xl mx-auto">
                {currentItem.caption}
              </p>
            )}

            {isMyStatus ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowViewersSheet(true)}
                  className="flex items-center gap-2 bg-[#0284c7]/90 hover:bg-[#0284c7] text-white px-5 py-2.5 rounded-full text-xs font-semibold shadow-lg transition"
                >
                  <Eye className="w-4 h-4" />
                  <span>Viewed by {viewersList.length}</span>
                </button>
              </div>
            ) : (
              <div className="max-w-lg mx-auto space-y-2.5">
                <div className="flex items-center justify-center gap-2">
                  <Smile className="w-4 h-4 text-white/70" />
                  {STATUS_QUICK_REACTIONS.map((emoji) => {
                    const isMine = currentItem.reactions?.some(
                      (r) => r.userId === uid && r.emoji === emoji
                    );
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => void handleQuickReact(emoji)}
                        className={`w-9 h-9 rounded-full text-lg flex items-center justify-center transition-transform hover:scale-110 ${
                          isMine
                            ? 'bg-[#0284c7] ring-2 ring-white'
                            : 'bg-white/15 hover:bg-white/25'
                        }`}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                </div>

                <form onSubmit={handleSendReply} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Reply privately to ${currentItem.authorName}...`}
                    className="flex-1 bg-white/15 border border-white/25 text-white placeholder-white/60 px-4 py-2.5 rounded-full text-xs focus:outline-none focus:bg-white/20"
                  />
                  <button
                    type="submit"
                    disabled={replyBusy || !replyText.trim()}
                    aria-label="Send Status Reply"
                    className="p-2.5 bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 rounded-full text-white"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Real-Time "Viewed by {count}" Bottom Sheet Drawer */}
          {showViewersSheet && isMyStatus && (
            <>
              <button
                type="button"
                aria-label="Close viewers sheet backdrop"
                onClick={() => setShowViewersSheet(false)}
                className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-[2px]"
              />
              <div className="fixed inset-x-0 bottom-0 z-[60] bg-[#e3f3ff]/95 dark:bg-slate-900 backdrop-blur-2xl rounded-t-3xl border-t border-[#7dd3fc] dark:border-slate-700 shadow-2xl max-h-[60vh] flex flex-col max-w-xl mx-auto overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    <span className="font-bold text-sm">
                      Viewed by {viewersList.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowViewersSheet(false)}
                    aria-label="Close Viewed by sheet"
                    className="p-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="overflow-y-auto p-4 space-y-3">
                  {viewersList.length === 0 ? (
                    <p className="text-center text-slate-600 dark:text-slate-400 text-xs py-6">
                      No views yet
                    </p>
                  ) : (
                    viewersList.map((viewer) => {
                      const reaction = currentItem.reactions?.find(
                        (r) => r.userId === viewer.viewerId
                      );
                      return (
                        <div
                          key={viewer.viewerId}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-[#d2ecff]/70 dark:bg-slate-800/70 border border-[#7dd3fc]/50 dark:border-slate-700"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <UserAvatar
                              src={viewer.viewerAvatar}
                              name={viewer.viewerName}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                                {viewer.viewerName}
                              </p>
                              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                {formatClockTime(viewer.viewedAt)} ·{' '}
                                {formatStatusRelativeTime(viewer.viewedAt)}
                              </p>
                            </div>
                          </div>
                          {reaction && (
                            <span
                              className="text-base shrink-0"
                              title={`Reacted ${reaction.emoji}`}
                            >
                              {reaction.emoji}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default WhatsAppStatusSection;
