import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Hand,
  LayoutGrid,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  OperationType,
  auth,
  db,
  handleFirestoreError,
  isTransientFirestoreError,
} from '../lib/firebase';
import { usePkChat } from '../context/PkChatContext';
import { buildSilentBeautyCssFilter, computeSilentNaturalLightProfile } from '../lib/silentBeautify';
import { UserAvatar } from './UserAvatar';

export interface PkLiveClassUser {
  uid: string;
  displayName?: string;
  fullName?: string;
  photoURL?: string;
  avatarUrl?: string;
}

export interface PkLiveClassRoomProps {
  roomId?: string;
  roomTitle?: string;
  currentUser?: PkLiveClassUser | null;
  isHost?: boolean;
  onLeave?: () => void;
}

interface ClassParticipantDoc {
  id: string;
  uid: string;
  roomId: string;
  name: string;
  photoURL?: string;
  role: 'host' | 'participant';
  micOn: boolean;
  camOn: boolean;
  handRaised: boolean;
  joinedAt?: unknown;
}

interface ClassWaitingDoc {
  id: string;
  uid: string;
  roomId: string;
  name: string;
  photoURL?: string;
  requestedAt?: unknown;
}

interface ClassMessageDoc {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt?: unknown;
}

function sanitizeRoomId(raw?: string): string {
  const cleaned = (raw || 'pkc-global-class').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
  return cleaned || 'pkc-global-class';
}

export function PkLiveClassRoom({
  roomId: propRoomId,
  roomTitle = 'PK Live Class',
  currentUser: propUser,
  isHost = false,
  onLeave,
}: PkLiveClassRoomProps) {
  const pkChat = usePkChat();
  const cleanRoomId = useMemo(() => sanitizeRoomId(propRoomId), [propRoomId]);

  const effectiveUid =
    propUser?.uid || auth.currentUser?.uid || pkChat.userProfile?.uid || '';
  const effectiveName =
    propUser?.displayName ||
    propUser?.fullName ||
    pkChat.userProfile?.fullName ||
    (isHost ? 'Host' : 'Student');
  const effectivePhoto =
    propUser?.photoURL ||
    propUser?.avatarUrl ||
    pkChat.profileMedia?.avatarDataUrl ||
    pkChat.userProfile?.avatarUrl ||
    '';

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [beautyEnabled, setBeautyEnabled] = useState(true);
  const [layoutMode, setLayoutMode] = useState<'grid' | 'speaker'>('grid');

  const [participants, setParticipants] = useState<ClassParticipantDoc[]>([]);
  const [waitingList, setWaitingList] = useState<ClassWaitingDoc[]>([]);
  const [chatMessages, setChatMessages] = useState<ClassMessageDoc[]>([]);
  const [chatInput, setChatInput] = useState('');

  const [activeSidePanel, setActiveSidePanel] = useState<'participants' | 'chat' | null>(null);
  const [admitted, setAdmitted] = useState<boolean>(isHost);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [roomEnded, setRoomEnded] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micOnRef = useRef(micOn);
  micOnRef.current = micOn;

  const beautyFilter = useMemo(
    () => buildSilentBeautyCssFilter(computeSilentNaturalLightProfile(null, effectiveName)),
    [effectiveName]
  );

  const stopAllMediaTracks = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
  }, []);

  // Attach active video stream whenever video element toggles between camera, screen share, or avatar
  const syncVideoElement = useCallback(() => {
    const el = localVideoRef.current;
    if (!el) return;
    if (isScreenSharing && screenStreamRef.current) {
      el.srcObject = screenStreamRef.current;
      el.play().catch(() => {});
    } else if (localStreamRef.current) {
      el.srcObject = localStreamRef.current;
      el.play().catch(() => {});
    }
  }, [isScreenSharing]);

  useEffect(() => {
    syncVideoElement();
  }, [admitted, camOn, isScreenSharing, syncVideoElement]);

  // 1. Start local camera and microphone when admitted to classroom
  useEffect(() => {
    if (!admitted) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatusNotice('Camera/microphone preview requires secure browser device permissions.');
      return;
    }

    let active = true;
    const startMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.getAudioTracks().forEach((t) => {
          t.enabled = micOnRef.current;
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(() => {});
        }
      } catch {
        setCamOn(false);
        setStatusNotice('Camera/mic unavailable; joined in listen-only mode.');
      }
    };

    void startMedia();

    return () => {
      active = false;
      stopAllMediaTracks();
    };
  }, [admitted, stopAllMediaTracks]);

  // 2. Host initializes room + joins participants; Student enters Waiting Room cleanly
  useEffect(() => {
    if (!cleanRoomId || !effectiveUid || !auth.currentUser) return;
    let cancelled = false;

    const joinClass = async () => {
      const classRef = doc(db, 'classes', cleanRoomId);
      try {
        if (isHost) {
          const existingSnap = await getDoc(classRef);
          if (!existingSnap.exists()) {
            await setDoc(classRef, {
              roomId: cleanRoomId,
              hostUid: effectiveUid,
              hostName: effectiveName.slice(0, 100),
              title: roomTitle.slice(0, 120),
              status: 'active',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else if (existingSnap.data()?.status === 'ended') {
            setRoomEnded(true);
            return;
          }

          if (cancelled) return;
          const partPath = `classes/${cleanRoomId}/participants/${effectiveUid}`;
          try {
            await setDoc(doc(db, 'classes', cleanRoomId, 'participants', effectiveUid), {
              uid: effectiveUid,
              roomId: cleanRoomId,
              name: effectiveName.slice(0, 100),
              photoURL: effectivePhoto,
              role: 'host',
              micOn: true,
              camOn: true,
              handRaised: false,
              joinedAt: serverTimestamp(),
            });
          } catch (err) {
            if (!isTransientFirestoreError(err)) {
              handleFirestoreError(err, OperationType.WRITE, partPath);
            }
          }
          setAdmitted(true);
        } else {
          const roomSnap = await getDoc(classRef);
          if (!roomSnap.exists()) {
            setStatusNotice('Waiting for host to open this PK Live Class room...');
            return;
          }
          if (roomSnap.data()?.status === 'ended') {
            setRoomEnded(true);
            return;
          }

          // Check if already admitted
          const selfPartSnap = await getDoc(
            doc(db, 'classes', cleanRoomId, 'participants', effectiveUid)
          );
          if (selfPartSnap.exists()) {
            setAdmitted(true);
            return;
          }

          if (cancelled) return;
          const waitPath = `classes/${cleanRoomId}/waitingRoom/${effectiveUid}`;
          try {
            await setDoc(doc(db, 'classes', cleanRoomId, 'waitingRoom', effectiveUid), {
              uid: effectiveUid,
              roomId: cleanRoomId,
              name: effectiveName.slice(0, 100),
              photoURL: effectivePhoto,
              requestedAt: serverTimestamp(),
            });
          } catch (err) {
            if (!isTransientFirestoreError(err)) {
              handleFirestoreError(err, OperationType.WRITE, waitPath);
            }
          }
        }
      } catch (err) {
        if (!isTransientFirestoreError(err)) {
          setStatusNotice(err instanceof Error ? err.message : 'Unable to connect to classroom.');
        }
      }
    };

    void joinClass();
    return () => {
      cancelled = true;
    };
  }, [cleanRoomId, effectiveName, effectivePhoto, effectiveUid, isHost, roomTitle]);

  // 3. Real-time room lifecycle + self admission watcher
  useEffect(() => {
    if (!cleanRoomId || !effectiveUid || !auth.currentUser) return;

    const unsubRoom = onSnapshot(
      doc(db, 'classes', cleanRoomId),
      (snap) => {
        if (snap.exists() && snap.data()?.status === 'ended') {
          setRoomEnded(true);
          stopAllMediaTracks();
        }
      },
      (err) => {
        if (!isTransientFirestoreError(err)) {
          setStatusNotice(err.message);
        }
      }
    );

    const selfPartRef = doc(db, 'classes', cleanRoomId, 'participants', effectiveUid);
    const unsubSelf = onSnapshot(
      selfPartRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as ClassParticipantDoc;
          setAdmitted(true);
          // Sync host "Mute All" immediately to student audio track
          if (!data.micOn && micOnRef.current) {
            if (localStreamRef.current) {
              localStreamRef.current.getAudioTracks().forEach((t) => {
                t.enabled = false;
              });
            }
            setMicOn(false);
            setStatusNotice('Host muted participants.');
          }
        }
      },
      () => {
        // Ignore until admitted
      }
    );

    return () => {
      unsubRoom();
      unsubSelf();
    };
  }, [cleanRoomId, effectiveUid, stopAllMediaTracks]);

  // 4. Real-time Participants, Host Waiting Room, and In-Class Chat (only after admission)
  useEffect(() => {
    if (!cleanRoomId || !auth.currentUser) return;

    let unsubWaiting: (() => void) | null = null;
    if (isHost) {
      const waitPath = `classes/${cleanRoomId}/waitingRoom`;
      unsubWaiting = onSnapshot(
        collection(db, waitPath),
        (snap) => {
          setWaitingList(
            snap.docs.map((d) => ({
              ...(d.data() as Omit<ClassWaitingDoc, 'id'>),
              id: d.id,
            }))
          );
        },
        (err) => {
          if (!isTransientFirestoreError(err)) {
            handleFirestoreError(err, OperationType.LIST, waitPath);
          }
        }
      );
    }

    if (!admitted) {
      return () => {
        unsubWaiting?.();
      };
    }

    const partPath = `classes/${cleanRoomId}/participants`;
    const unsubParticipants = onSnapshot(
      collection(db, partPath),
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<ClassParticipantDoc, 'id'>),
          id: d.id,
        }));
        setParticipants(list);
      },
      (err) => {
        if (!isTransientFirestoreError(err)) {
          handleFirestoreError(err, OperationType.LIST, partPath);
        }
      }
    );

    const msgPath = `classes/${cleanRoomId}/messages`;
    const chatQ = query(collection(db, msgPath), orderBy('sentAt', 'asc'));
    const unsubChat = onSnapshot(
      chatQ,
      (snap) => {
        setChatMessages(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<ClassMessageDoc, 'id'>),
            id: d.id,
          }))
        );
      },
      (err) => {
        if (!isTransientFirestoreError(err)) {
          handleFirestoreError(err, OperationType.LIST, msgPath);
        }
      }
    );

    return () => {
      unsubWaiting?.();
      unsubParticipants();
      unsubChat();
    };
  }, [admitted, cleanRoomId, isHost]);

  const toggleMic = async () => {
    const nextState = !micOn;
    setMicOn(nextState);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = nextState;
      });
    }
    if (!effectiveUid || !admitted) return;
    const path = `classes/${cleanRoomId}/participants/${effectiveUid}`;
    try {
      await updateDoc(doc(db, 'classes', cleanRoomId, 'participants', effectiveUid), {
        micOn: nextState,
      });
    } catch (err) {
      if (!isTransientFirestoreError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    }
  };

  const toggleCamera = async () => {
    const nextState = !camOn;
    setCamOn(nextState);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = nextState;
      });
    }
    if (!effectiveUid || !admitted) return;
    const path = `classes/${cleanRoomId}/participants/${effectiveUid}`;
    try {
      await updateDoc(doc(db, 'classes', cleanRoomId, 'participants', effectiveUid), {
        camOn: nextState,
      });
    } catch (err) {
      if (!isTransientFirestoreError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          setStatusNotice('Screen sharing is not supported in this browser preview.');
          return;
        }
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        screenStreamRef.current = screenStream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
          localVideoRef.current.play().catch(() => {});
        }
        setIsScreenSharing(true);

        const firstTrack = screenStream.getVideoTracks()[0];
        if (firstTrack) {
          firstTrack.onended = () => {
            screenStreamRef.current = null;
            setIsScreenSharing(false);
            if (localVideoRef.current && localStreamRef.current) {
              localVideoRef.current.srcObject = localStreamRef.current;
            }
          };
        }
      } else {
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
        setIsScreenSharing(false);
        if (localVideoRef.current && localStreamRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      }
    } catch {
      setStatusNotice('Screen share was cancelled.');
    }
  };

  const toggleRaiseHand = async () => {
    const nextHand = !handRaised;
    setHandRaised(nextHand);
    if (!effectiveUid || !admitted) return;
    const path = `classes/${cleanRoomId}/participants/${effectiveUid}`;
    try {
      await updateDoc(doc(db, 'classes', cleanRoomId, 'participants', effectiveUid), {
        handRaised: nextHand,
      });
    } catch (err) {
      if (!isTransientFirestoreError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    }
  };

  // Host Control: Atomically admit student from Waiting Room into Participants
  const admitStudent = async (student: ClassWaitingDoc) => {
    if (!isHost) return;
    const batch = writeBatch(db);
    batch.set(doc(db, 'classes', cleanRoomId, 'participants', student.uid), {
      uid: student.uid,
      roomId: cleanRoomId,
      name: student.name.slice(0, 100),
      photoURL: student.photoURL || '',
      role: 'participant',
      micOn: false,
      camOn: true,
      handRaised: false,
      joinedAt: serverTimestamp(),
    });
    batch.delete(doc(db, 'classes', cleanRoomId, 'waitingRoom', student.uid));
    try {
      await batch.commit();
      setStatusNotice(`Admitted ${student.name} to PK Live Class.`);
    } catch (err) {
      if (!isTransientFirestoreError(err)) {
        handleFirestoreError(err, OperationType.WRITE, `classes/${cleanRoomId}/participants/${student.uid}`);
      }
    }
  };

  // Host Control: Atomically Mute All non-host participants
  const muteAllParticipants = async () => {
    if (!isHost) return;
    const targets = participants.filter((p) => p.role !== 'host' && p.micOn);
    if (targets.length === 0) return;
    const batch = writeBatch(db);
    for (const p of targets) {
      batch.update(doc(db, 'classes', cleanRoomId, 'participants', p.uid), {
        micOn: false,
      });
    }
    try {
      await batch.commit();
      setStatusNotice('All students muted.');
    } catch (err) {
      if (!isTransientFirestoreError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, `classes/${cleanRoomId}/participants`);
      }
    }
  };

  const sendClassMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = chatInput.trim().slice(0, 2000);
    if (!cleanText || !effectiveUid || !admitted) return;

    const msgRef = doc(collection(db, 'classes', cleanRoomId, 'messages'));
    const path = `classes/${cleanRoomId}/messages/${msgRef.id}`;
    try {
      await setDoc(msgRef, {
        id: msgRef.id,
        roomId: cleanRoomId,
        senderId: effectiveUid,
        senderName: effectiveName.slice(0, 100),
        text: cleanText,
        sentAt: serverTimestamp(),
      });
      setChatInput('');
    } catch (err) {
      if (!isTransientFirestoreError(err)) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    }
  };

  const handleLeaveClass = async () => {
    stopAllMediaTracks();
    if (effectiveUid) {
      try {
        if (isHost) {
          await updateDoc(doc(db, 'classes', cleanRoomId), {
            status: 'ended',
            updatedAt: serverTimestamp(),
          });
        }
        await deleteDoc(doc(db, 'classes', cleanRoomId, 'participants', effectiveUid)).catch(
          () => {}
        );
        await deleteDoc(doc(db, 'classes', cleanRoomId, 'waitingRoom', effectiveUid)).catch(
          () => {}
        );
      } catch {
        // Ignore cleanup errors on exit
      }
    }
    if (onLeave) {
      onLeave();
    } else {
      pkChat.setActiveScreen('home');
    }
  };

  if (roomEnded) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-[#021b38] via-[#0a2342] to-[#0f172a] text-white flex flex-col items-center justify-center p-6 text-center">
        <ShieldCheck className="w-14 h-14 text-[#38bdf8] mb-4" />
        <h2 className="text-xl font-bold mb-2">This PK Live Class has ended</h2>
        <p className="text-sm text-sky-200 mb-6">Room ID: {cleanRoomId}</p>
        <button
          type="button"
          onClick={() => (onLeave ? onLeave() : pkChat.setActiveScreen('home'))}
          className="px-6 py-2.5 bg-[#0284c7] hover:bg-[#0369a1] rounded-2xl text-sm font-semibold text-white"
        >
          Return to PK Chat
        </button>
      </div>
    );
  }

  // Waiting Room Screen
  if (!admitted) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-[#021b38] via-[#0a2342] to-[#0f172a] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full rounded-3xl bg-[#e3f3ff]/15 backdrop-blur-2xl border border-[#7dd3fc]/40 p-8 shadow-2xl space-y-4">
          <ShieldCheck className="w-14 h-14 text-[#38bdf8] mx-auto animate-pulse" />
          <h2 className="text-xl font-bold">
            Please wait, the class host will let you in soon
          </h2>
          <p className="text-sm text-sky-100">
            PK Live Class • Room ID: {cleanRoomId}
          </p>
          {statusNotice && (
            <p className="text-xs text-amber-200 bg-amber-500/20 border border-amber-400/30 rounded-xl px-3 py-2">
              {statusNotice}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleLeaveClass()}
            className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 rounded-xl text-sm font-semibold text-white"
          >
            Leave Waiting Room
          </button>
        </div>
      </div>
    );
  }

  const remoteParticipants = participants.filter((p) => p.uid !== effectiveUid);

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-[#021b38] via-[#071f3b] to-[#0b1b2b] text-white flex flex-col">
      {/* Top PK Live Class Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#e3f3ff]/12 backdrop-blur-xl border-b border-[#7dd3fc]/30">
        <div className="flex items-center gap-2.5 min-w-0">
          <ShieldCheck className="w-5 h-5 text-[#38bdf8] shrink-0" />
          <span className="font-bold text-sm truncate">{roomTitle}</span>
          <span className="text-xs bg-[#0284c7]/40 border border-[#7dd3fc]/40 text-sky-100 px-2.5 py-0.5 rounded-full shrink-0">
            ID: {cleanRoomId}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBeautyEnabled((b) => !b)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 border ${
              beautyEnabled
                ? 'bg-[#0284c7] border-[#7dd3fc] text-white'
                : 'bg-white/10 border-white/20 text-sky-100'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{beautyEnabled ? 'Beauty On' : 'Beauty Off'}</span>
          </button>

          <button
            type="button"
            onClick={() => setLayoutMode((m) => (m === 'grid' ? 'speaker' : 'grid'))}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold flex items-center gap-1 text-sky-100"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {layoutMode === 'grid' ? 'Grid View' : 'Speaker View'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleLeaveClass()}
            className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-xl flex items-center gap-1.5"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>{isHost ? 'End Class' : 'Leave'}</span>
          </button>
        </div>
      </div>

      {statusNotice && (
        <div className="mx-4 mt-2 px-3 py-1.5 rounded-xl bg-[#0284c7]/30 border border-[#7dd3fc]/40 text-sky-100 text-xs flex items-center justify-between">
          <span>{statusNotice}</span>
          <button type="button" onClick={() => setStatusNotice(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Content: Video Tiles Grid + Side Panel */}
      <div className="flex-1 flex overflow-hidden">
        <div
          className={`flex-1 p-4 grid gap-3 overflow-y-auto ${
            layoutMode === 'speaker' && remoteParticipants.length > 0
              ? 'grid-cols-1 lg:grid-cols-2'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          }`}
        >
          {/* Local User Tile */}
          <div className="relative bg-slate-900/90 rounded-2xl overflow-hidden border border-[#7dd3fc]/35 flex items-center justify-center min-h-[220px]">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={beautyEnabled && !isScreenSharing ? { filter: beautyFilter } : undefined}
              className={`w-full h-full object-cover ${
                !camOn && !isScreenSharing ? 'hidden' : ''
              }`}
            />
            {!camOn && !isScreenSharing && (
              <UserAvatar
                src={effectivePhoto}
                name={effectiveName}
                size="xl"
                className="ring-2 ring-[#38bdf8]"
              />
            )}
            <div className="absolute bottom-2.5 left-2.5 bg-black/65 backdrop-blur-md px-2.5 py-1 rounded-lg text-xs flex items-center gap-1.5">
              {!micOn && <MicOff className="w-3.5 h-3.5 text-rose-400" />}
              <span>
                {effectiveName} {isHost ? '(Host · You)' : '(You)'}
              </span>
            </div>
            {handRaised && (
              <div className="absolute top-2.5 right-2.5 bg-amber-500 text-slate-950 p-1.5 rounded-full shadow">
                <Hand className="w-4 h-4" />
              </div>
            )}
          </div>

          {/* Remote Participants Tiles */}
          {remoteParticipants.map((person) => (
            <div
              key={person.uid}
              className="relative bg-slate-900/90 rounded-2xl overflow-hidden border border-[#7dd3fc]/30 flex items-center justify-center min-h-[220px]"
            >
              <UserAvatar
                src={person.photoURL}
                name={person.name}
                size="xl"
                className="ring-2 ring-[#7dd3fc]/60"
              />
              <div className="absolute bottom-2.5 left-2.5 bg-black/65 backdrop-blur-md px-2.5 py-1 rounded-lg text-xs flex items-center gap-1.5">
                {!person.micOn && <MicOff className="w-3.5 h-3.5 text-rose-400" />}
                <span>
                  {person.name} {person.role === 'host' ? '(Host)' : ''}
                </span>
              </div>
              {person.handRaised && (
                <div className="absolute top-2.5 right-2.5 bg-amber-500 text-slate-950 p-1.5 rounded-full shadow">
                  <Hand className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Light-Blue Frosted Glass Side Panel: Participants or In-Class Chat */}
        {activeSidePanel && (
          <div className="w-80 bg-[#e3f3ff]/95 dark:bg-slate-900 backdrop-blur-2xl border-l border-[#7dd3fc]/70 dark:border-slate-800 text-slate-900 dark:text-white flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white">
              <span className="font-bold text-sm">
                {activeSidePanel === 'participants'
                  ? `Participants (${participants.length})`
                  : 'In-Class Chat'}
              </span>
              <button
                type="button"
                onClick={() => setActiveSidePanel(null)}
                className="p-1 rounded-full bg-white/15 hover:bg-white/25"
                aria-label="Close side panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {activeSidePanel === 'participants' ? (
              <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {isHost && waitingList.length > 0 && (
                  <div className="bg-[#d2ecff]/80 dark:bg-slate-800/80 border border-[#7dd3fc]/70 rounded-2xl p-3 space-y-2">
                    <p className="text-xs font-bold text-[#0284c7] dark:text-[#38bdf8]">
                      Waiting Room ({waitingList.length})
                    </p>
                    {waitingList.map((student) => (
                      <div
                        key={student.uid}
                        className="flex items-center justify-between gap-2 py-1"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <UserAvatar src={student.photoURL} name={student.name} size="xs" />
                          <span className="text-xs font-medium truncate">{student.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void admitStudent(student)}
                          className="bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1 shrink-0"
                        >
                          <Check className="w-3 h-3" /> Admit
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  {participants.map((p) => (
                    <div
                      key={p.uid}
                      className="flex items-center justify-between py-2 px-2.5 rounded-xl bg-[#d2ecff]/60 dark:bg-slate-800/60"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserAvatar src={p.photoURL} name={p.name} size="xs" />
                        <span className="text-xs font-semibold truncate">
                          {p.name} {p.role === 'host' ? '(Host)' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {p.handRaised && <Hand className="w-3.5 h-3.5 text-amber-500" />}
                        {p.micOn ? (
                          <Mic className="w-3.5 h-3.5 text-[#0284c7]" />
                        ) : (
                          <MicOff className="w-3.5 h-3.5 text-rose-500" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {isHost && (
                  <button
                    type="button"
                    onClick={() => void muteAllParticipants()}
                    className="w-full py-2.5 bg-[#0284c7] hover:bg-[#0369a1] text-white rounded-xl text-xs font-bold shadow-sm"
                  >
                    Mute All
                  </button>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {chatMessages.length === 0 ? (
                    <p className="text-center text-xs text-slate-500 py-8">
                      No messages yet. Say hello to the class!
                    </p>
                  ) : (
                    chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className="bg-[#d2ecff]/80 dark:bg-slate-800 rounded-2xl p-2.5 border border-[#7dd3fc]/50 dark:border-slate-700"
                      >
                        <p className="text-[11px] font-bold text-[#0284c7] dark:text-[#38bdf8]">
                          {msg.senderName}
                        </p>
                        <p className="text-xs text-slate-800 dark:text-slate-100 mt-0.5 break-words">
                          {msg.text}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <form
                  onSubmit={sendClassMessage}
                  className="p-2.5 border-t border-[#7dd3fc]/60 dark:border-slate-800 flex gap-2"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type message to class..."
                    className="flex-1 bg-white/80 dark:bg-slate-800 border border-[#7dd3fc]/70 text-xs text-slate-900 dark:text-white rounded-xl px-3 py-2 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-white p-2 rounded-xl"
                    aria-label="Send class chat message"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Live Class Toolbar */}
      <div className="bg-[#06182c]/95 backdrop-blur-xl border-t border-[#7dd3fc]/30 px-4 py-3 flex flex-wrap items-center justify-center gap-3 sm:gap-5">
        <button
          type="button"
          onClick={() => void toggleMic()}
          className="flex flex-col items-center gap-1 text-xs text-sky-100 hover:text-white"
        >
          <div className={`p-2.5 rounded-xl ${micOn ? 'bg-white/15' : 'bg-rose-600'}`}>
            {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </div>
          <span>{micOn ? 'Mute' : 'Unmute'}</span>
        </button>

        <button
          type="button"
          onClick={() => void toggleCamera()}
          className="flex flex-col items-center gap-1 text-xs text-sky-100 hover:text-white"
        >
          <div className={`p-2.5 rounded-xl ${camOn ? 'bg-white/15' : 'bg-rose-600'}`}>
            {camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </div>
          <span>{camOn ? 'Stop Video' : 'Start Video'}</span>
        </button>

        <button
          type="button"
          onClick={() => void toggleScreenShare()}
          className="flex flex-col items-center gap-1 text-xs text-sky-100 hover:text-white"
        >
          <div
            className={`p-2.5 rounded-xl ${
              isScreenSharing
                ? 'bg-[#0284c7] text-white'
                : 'bg-white/15 text-[#38bdf8]'
            }`}
          >
            <MonitorUp className="w-5 h-5" />
          </div>
          <span>{isScreenSharing ? 'Stop Share' : 'Share Screen'}</span>
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveSidePanel((prev) =>
              prev === 'participants' ? null : 'participants'
            )
          }
          className="relative flex flex-col items-center gap-1 text-xs text-sky-100 hover:text-white"
        >
          <div className="p-2.5 rounded-xl bg-white/15">
            <Users className="w-5 h-5" />
          </div>
          <span>Participants ({participants.length})</span>
          {isHost && waitingList.length > 0 && (
            <span className="absolute -top-1 right-1 bg-amber-400 text-slate-950 text-[10px] font-bold px-1.5 rounded-full">
              {waitingList.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveSidePanel((prev) => (prev === 'chat' ? null : 'chat'))
          }
          className="flex flex-col items-center gap-1 text-xs text-sky-100 hover:text-white"
        >
          <div className="p-2.5 rounded-xl bg-white/15">
            <MessageSquare className="w-5 h-5" />
          </div>
          <span>Chat</span>
        </button>

        <button
          type="button"
          onClick={() => void toggleRaiseHand()}
          className="flex flex-col items-center gap-1 text-xs text-sky-100 hover:text-white"
        >
          <div
            className={`p-2.5 rounded-xl ${
              handRaised ? 'bg-amber-400 text-slate-950' : 'bg-white/15'
            }`}
          >
            <Hand className="w-5 h-5" />
          </div>
          <span>Raise Hand</span>
        </button>
      </div>
    </div>
  );
}

export const ZoomClassRoom = PkLiveClassRoom;
export default PkLiveClassRoom;
