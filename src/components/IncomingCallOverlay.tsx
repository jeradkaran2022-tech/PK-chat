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
      className="fixed inset-0 z-[82] bg-gradient-to-b from-[#071f3a]/94 via-[#0a2d52]/95 to-[#06182d]/97 backdrop-blur-2xl flex flex-col items-center justify-between p-6 sm:p-8 text-white"
    >
      {/* Top WhatsApp-style Encryption & Call Type Header */}
      <div className="w-full max-w-md pt-4 text-center space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-sky-200/90">
          End-to-End Encrypted · {activeIncoming.isGroup ? 'Incoming Group Call' : 'Incoming PK Chat Call'}
        </p>
        <p className="text-xs font-bold text-[#7dd3fc]">
          {activeIncoming.callType === 'video' ? 'PK Chat Video Call' : 'PK Chat Voice Call'} ·{' '}
          {mutedRing ? 'Muted' : ringingNow ? 'Ringing...' : 'Active'}
        </p>
      </div>

      {/* Center Caller Avatar, Name, Number & Quick Mute Ring */}
      <div className="flex flex-col items-center text-center space-y-4 my-auto">
        <div className="relative flex items-center justify-center">
          <span
            aria-hidden="true"
            className="absolute w-36 h-36 rounded-full bg-sky-400/20 animate-ping"
          />
          <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-[#38bdf8] via-[#0284c7] to-[#0369a1] border-2 border-white/45 flex items-center justify-center text-3xl font-extrabold shadow-[0_12px_40px_rgba(56,189,248,0.45)]">
            {activeIncoming.callType === 'video' ? (
              <Video className="w-11 h-11 text-white" />
            ) : (
              <Phone className="w-11 h-11 text-white" />
            )}
          </div>
        </div>

        <div className="space-y-1">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {activeIncoming.callerName}
          </h2>
          {activeIncoming.callerPhone && (
            <p className="text-sm font-mono text-sky-200">
              {activeIncoming.callerPhone}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleToggleMuteRing}
          aria-label={mutedRing ? 'Unmute Ringtone' : 'Mute Ringtone'}
          className="px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 border border-white/25 text-white text-xs font-semibold inline-flex items-center gap-1.5 backdrop-blur-md"
        >
          {mutedRing ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          <span>{mutedRing ? 'Unmute Ring' : 'Mute Ring'}</span>
        </button>

        <p className="text-[11px] text-sky-100/75 max-w-xs">
          {activeIncoming.isSimulated
            ? 'PK CHAT Signature Melody (soft marimba, bell & ambient notes) looping until you Answer, Mute, or Decline.'
            : 'PK CHAT Signature Melody playing smoothly · Tap Answer on the right or Decline on the left.'}
        </p>
      </div>

      {/* Bottom WhatsApp-Exact Positions: Decline (Left) & Answer (Right) */}
      <div className="w-full max-w-xs pb-6 flex items-center justify-between gap-8">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => void handleDecline()}
            aria-label="Decline"
            className="w-16 h-16 rounded-full bg-[#ea0038] hover:bg-rose-700 text-white flex items-center justify-center shadow-[0_10px_28px_rgba(234,0,56,0.45)] active:scale-95 transition-all"
          >
            <PhoneOff className="w-7 h-7" />
          </button>
          <span className="text-xs font-semibold text-white/90">Decline</span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => void handleAnswer()}
            aria-label="Answer"
            className="w-16 h-16 rounded-full bg-gradient-to-br from-[#38bdf8] to-[#0284c7] hover:brightness-110 text-white flex items-center justify-center shadow-[0_10px_30px_rgba(56,189,248,0.55)] ring-4 ring-sky-400/25 active:scale-95 transition-all animate-pulse"
          >
            {activeIncoming.callType === 'video' ? (
              <Video className="w-7 h-7" />
            ) : (
              <Phone className="w-7 h-7" />
            )}
          </button>
          <span className="text-xs font-semibold text-white/90">Answer</span>
        </div>
      </div>
    </div>
  );
}
