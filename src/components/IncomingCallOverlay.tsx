import React, { useEffect, useState } from 'react';
import { Phone, PhoneOff, Video, Volume2, VolumeX } from 'lucide-react';
import { usePkChat } from '../context/PkChatContext';
import {
  DEFAULT_RING_TIMEOUT_MS,
  RINGTONE_STATE_EVENT,
  isRingingActive,
  startRingingLoop,
  stopRingingLoop,
} from '../lib/audioTones';

interface SimulatedIncomingCall {
  callId: string;
  callerName: string;
  callerPhone?: string;
  callType: 'audio' | 'video';
  isGroup: boolean;
}

function sanitizeIncomingDisplayName(raw?: string): string {
  const cleaned = (raw || '').trim();
  if (!cleaned || cleaned.includes('@')) {
    return 'PK Chat Caller';
  }
  return cleaned;
}

export function IncomingCallOverlay() {
  const { callRecords, userProfile, contacts, updateCallStatus, setActiveScreen } = usePkChat();
  const [simulatedCall, setSimulatedCall] = useState<SimulatedIncomingCall | null>(null);
  const [dismissedCallId, setDismissedCallId] = useState<string | null>(null);
  const [mutedRing, setMutedRing] = useState(false);
  const [ringingNow, setRingingNow] = useState<boolean>(() => isRingingActive());

  useEffect(() => {
    const onRingState = (ev: Event) => {
      const active = (ev as CustomEvent<{ active?: boolean }>).detail?.active;
      setRingingNow(typeof active === 'boolean' ? active : isRingingActive());
    };
    const onSimulateIncoming = (ev: Event) => {
      const detail = (ev as CustomEvent<Partial<SimulatedIncomingCall> | undefined>).detail;
      setMutedRing(false);
      setDismissedCallId(null);
      setSimulatedCall({
        callId: `sim_call_${Date.now()}`,
        callerName: sanitizeIncomingDisplayName(detail?.callerName) || 'PK Chat Incoming Call',
        callerPhone: detail?.callerPhone?.trim() || '+94 77 123 4567',
        callType: detail?.callType === 'video' ? 'video' : 'audio',
        isGroup: Boolean(detail?.isGroup),
      });
    };
    window.addEventListener(RINGTONE_STATE_EVENT, onRingState);
    window.addEventListener('pkchat-simulate-incoming-call', onSimulateIncoming);
    return () => {
      window.removeEventListener(RINGTONE_STATE_EVENT, onRingState);
      window.removeEventListener('pkchat-simulate-incoming-call', onSimulateIncoming);
    };
  }, []);

  const currentUid = userProfile?.uid;
  const realIncomingCall = currentUid
    ? callRecords.find(
        (c) =>
          c.status === 'ringing' &&
          c.callerId !== currentUid &&
          c.callId !== dismissedCallId &&
          Array.isArray(c.participantIds) &&
          c.participantIds.includes(currentUid)
      ) || null
    : null;

  const matchedContact = realIncomingCall
    ? contacts.find((c) => c.contactUid === realIncomingCall.callerId)
    : null;

  const activeIncoming = realIncomingCall
    ? {
        callId: realIncomingCall.callId,
        callerName: sanitizeIncomingDisplayName(matchedContact?.displayName || realIncomingCall.callerName),
        callerPhone:
          realIncomingCall.callerPhone ||
          matchedContact?.phoneMasked ||
          undefined,
        callType: realIncomingCall.callType,
        isGroup: (realIncomingCall.participantIds?.length || 0) > 2,
        isSimulated: false,
      }
    : simulatedCall
      ? {
          ...simulatedCall,
          isSimulated: true,
        }
      : null;

  const activeCallKey = activeIncoming?.callId || null;
  const activeCallIsGroup = Boolean(activeIncoming?.isGroup);
  const activeCallIsSimulated = Boolean(activeIncoming?.isSimulated);

  useEffect(() => {
    if (!activeCallKey) {
      return undefined;
    }
    setMutedRing(false);
    startRingingLoop(undefined, activeCallIsGroup ? 'group_call' : 'direct_call');

    const missedTimer = window.setTimeout(() => {
      stopRingingLoop();
      if (activeCallIsSimulated) {
        setSimulatedCall(null);
      } else {
        setDismissedCallId(activeCallKey);
        void updateCallStatus(activeCallKey, 'missed', 0).catch(() => {});
      }
    }, DEFAULT_RING_TIMEOUT_MS);

    return () => {
      window.clearTimeout(missedTimer);
      stopRingingLoop();
    };
  }, [activeCallKey, activeCallIsGroup, activeCallIsSimulated, updateCallStatus]);

  if (!activeIncoming) return null;

  const handleAnswer = () => {
    stopRingingLoop();
    const handoff = {
      callId: activeIncoming.callId,
      callerName: activeIncoming.callerName,
      callerPhone: activeIncoming.callerPhone,
      callType: activeIncoming.callType,
      isGroup: activeIncoming.isGroup,
      isSimulated: activeIncoming.isSimulated,
      answeredAtMs: Date.now(),
    };
    (window as unknown as { __pkPendingAnsweredCall?: typeof handoff }).__pkPendingAnsweredCall = handoff;
    window.dispatchEvent(new CustomEvent('pkchat-call-answered', { detail: handoff }));

    if (activeIncoming.isSimulated) {
      setSimulatedCall(null);
      setActiveScreen(activeIncoming.callType === 'video' ? 'video_call' : 'audio_call');
      return;
    }

    setDismissedCallId(activeIncoming.callId);
    setActiveScreen(activeIncoming.callType === 'video' ? 'video_call' : 'audio_call');
    void updateCallStatus(activeIncoming.callId, 'active', 0).catch(() => {
      // Navigate immediately even if status update completes asynchronously
    });
  };

  const handleDecline = async () => {
    stopRingingLoop();
    if (activeIncoming.isSimulated) {
      setSimulatedCall(null);
      return;
    }
    setDismissedCallId(activeIncoming.callId);
    try {
      await updateCallStatus(activeIncoming.callId, 'ended', 0);
    } catch {
      // dismiss locally on transient failure
    }
  };

  const handleToggleMuteRing = () => {
    if (mutedRing) {
      setMutedRing(false);
      startRingingLoop(undefined, activeIncoming.isGroup ? 'group_call' : 'direct_call');
    } else {
      setMutedRing(true);
      stopRingingLoop();
    }
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Incoming PK Chat Call"
      className="fixed inset-x-0 top-16 z-[82] p-3 sm:p-5 flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto w-full max-w-md rounded-3xl border-2 border-[#38bdf8] bg-gradient-to-b from-white/95 via-[#f0f9ff]/95 to-[#e0f2fe]/95 text-slate-900 shadow-[0_14px_45px_rgba(2,132,199,0.34)] backdrop-blur-2xl overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-[#0284c7] via-[#0ea5e9] to-[#0077B6] text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center animate-pulse shrink-0">
              {activeIncoming.callType === 'video' ? (
                <Video className="w-4 h-4 text-white" />
              ) : (
                <Phone className="w-4 h-4 text-white" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-sky-100 truncate">
                {activeIncoming.isGroup ? 'Incoming Group Call' : 'Incoming PK Chat Call'} ·{' '}
                {mutedRing ? 'Muted' : ringingNow ? 'Ringing...' : 'Active'}
              </p>
              <p className="text-sm sm:text-base font-bold text-white truncate">
                {activeIncoming.callerName}
              </p>
              {activeIncoming.callerPhone && (
                <p className="text-[11px] font-mono text-sky-100 truncate">
                  {activeIncoming.callerPhone}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleMuteRing}
            aria-label={mutedRing ? 'Unmute Ringtone' : 'Mute Ringtone'}
            className="px-2.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 border border-white/30 text-white text-[11px] font-bold flex items-center gap-1 shrink-0"
          >
            {mutedRing ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{mutedRing ? 'Unmute' : 'Mute Ring'}</span>
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-slate-600 text-center">
            {activeIncoming.isSimulated
              ? 'PK CHAT Signature Melody (soft marimba, bell & ambient notes) looping until you Answer, Mute, or Decline.'
              : 'PK CHAT Signature Melody playing smoothly · Choose Answer, Mute Ring, or Decline.'}
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => void handleAnswer()}
              className="min-h-[46px] px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#0284c7] to-[#0ea5e9] hover:from-[#0369a1] hover:to-[#0284c7] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md transition-all"
            >
              {activeIncoming.callType === 'video' ? (
                <Video className="w-4 h-4 shrink-0" />
              ) : (
                <Phone className="w-4 h-4 shrink-0" />
              )}
              <span>Answer</span>
            </button>
            <button
              type="button"
              onClick={() => void handleDecline()}
              className="min-h-[46px] px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              <PhoneOff className="w-4 h-4 shrink-0" />
              <span>Decline</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
