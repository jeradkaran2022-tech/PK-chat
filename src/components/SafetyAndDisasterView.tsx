import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  Compass,
  ExternalLink,
  Flashlight,
  MapPin,
  MessageSquareText,
  Navigation,
  Plus,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  Smartphone,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { usePkChat } from '../context/PkChatContext';
import { useAppI18n } from '../lib/i18n';
import {
  OfflineSmsDispatchRecord,
  getOfflineSmsDispatchLog,
  isAndroidNativeSmsBridgeAvailable,
  triggerOfflineSimSmsSos,
  tryReadAndroidBridgeGps,
} from '../lib/offlineSmsSos';
import { searchManualLocationPlaces } from '../lib/emergencyService';
import { getCachedGpsFix, saveCachedGpsFix } from '../lib/connectivityAndDnd';
import { ConsentedLocation } from '../types/pkchat';
import { WazeNavigationModal } from './WazeNavigationModal';
import { localizeRedAlert, markOfficialIdsRead } from '../lib/officialInboxEngine';
import { MessengerDisasterAlerts } from './MessengerDisasterAlerts';

function formatCountdownMs(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getCardinalDirection(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

export function SafetyAndDisasterView() {
  const {
    activeScreen,
    setActiveScreen,
    userProfile,
    contacts,
    consentedLocation,
    locationConsent,
    locationLoading,
    locationError,
    grantGpsLocation,
    setManualConsentedLocation,
    stopLocationSharing,
    toggleAutoTravelUpdate,
    emergencyContacts,
    addEmergencyContact,
    removeEmergencyContact,
    clearAllEmergencyContacts,
    sosAlerts,
    triggerSosAlert,
    resolveSosAlert,
    sosTrackingExpiresAtMs,
    sosLastTrackSyncAtMs,
    homeLocation,
    saveHomeLocation,
    clearHomeLocation,
    disasterAlerts,
    disasterFeedErrors,
    refreshDisasterAlerts,
    triggerQuickSosOneTap,
    triggerLongPressSosSiren,
    appLanguage,
  } = usePkChat();

  useEffect(() => {
    if (activeScreen !== 'disaster_alerts' || disasterAlerts.length === 0) return;
    markOfficialIdsRead(
      userProfile?.uid,
      disasterAlerts.map((a) => `disaster_${a.alertId}`)
    );
  }, [activeScreen, disasterAlerts, userProfile?.uid]);

  const { t } = useAppI18n();

  const [confirmSosOpen, setConfirmSosOpen] = useState(false);
  const [shareLocation, setShareLocation] = useState(true);
  const [alsoSendOfflineSms, setAlsoSendOfflineSms] = useState(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [sosNote, setSosNote] = useState('');
  const [sosBusy, setSosBusy] = useState(false);
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [safeAlertBanner, setSafeAlertBanner] = useState<string | null>(null);
  const [smsStatusBanner, setSmsStatusBanner] = useState<string | null>(null);
  const [smsDispatchLog, setSmsDispatchLog] = useState<OfflineSmsDispatchRecord[]>(() =>
    getOfflineSmsDispatchLog()
  );
  const [wazeNavOpen, setWazeNavOpen] = useState(false);

  // Trusted contact form
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRelation, setNewRelation] = useState('Family');

  // Manual place search
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<ConsentedLocation[]>([]);
  const [searchingPlace, setSearchingPlace] = useState(false);

  // Siren & Flashlight Override
  const [sirenActive, setSirenActive] = useState(false);
  const [flashlightActive, setFlashlightActive] = useState(false);
  const [strobePhase, setStrobePhase] = useState(false);
  const sirenCtxRef = useRef<AudioContext | null>(null);
  const sirenOscRef = useRef<OscillatorNode | null>(null);
  const sirenIntervalRef = useRef<number | null>(null);
  const torchStreamRef = useRef<MediaStream | null>(null);

  // 5-hour SOS live countdown tick
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!sosTrackingExpiresAtMs) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sosTrackingExpiresAtMs]);

  // Offline GPS & Magnetometer Compass
  const [compassHeading, setCompassHeading] = useState<number>(0);
  const [compassActive, setCompassActive] = useState(false);
  const [compassError, setCompassError] = useState<string | null>(null);
  const [offlineCoords, setOfflineCoords] = useState<{
    lat: number;
    lng: number;
    accuracy?: number;
    altitude?: number | null;
    source?: string;
    capturedAtMs?: number;
  } | null>(() => {
    if (consentedLocation?.latitude !== undefined && consentedLocation?.longitude !== undefined) {
      return {
        lat: consentedLocation.latitude,
        lng: consentedLocation.longitude,
        accuracy: consentedLocation.accuracyMeters,
        source: 'Live GPS',
        capturedAtMs: Date.now(),
      };
    }
    const cached = getCachedGpsFix();
    if (cached) {
      return {
        lat: cached.latitude,
        lng: cached.longitude,
        accuracy: cached.accuracyMeters,
        source: 'Cached GPS',
        capturedAtMs: cached.capturedAtMs,
      };
    }
    return null;
  });

  useEffect(() => {
    if (consentedLocation?.latitude !== undefined && consentedLocation?.longitude !== undefined) {
      const capturedAtMs = Date.now();
      setOfflineCoords({
        lat: consentedLocation.latitude,
        lng: consentedLocation.longitude,
        accuracy: consentedLocation.accuracyMeters,
        source: 'Live GPS',
        capturedAtMs,
      });
      saveCachedGpsFix({
        latitude: consentedLocation.latitude,
        longitude: consentedLocation.longitude,
        accuracyMeters: consentedLocation.accuracyMeters,
        source: 'live_gps',
        capturedAtMs,
      });
    }
  }, [consentedLocation]);

  const stopSiren = useCallback(() => {
    if (sirenIntervalRef.current !== null) {
      window.clearInterval(sirenIntervalRef.current);
      sirenIntervalRef.current = null;
    }
    if (sirenOscRef.current) {
      try {
        sirenOscRef.current.stop();
        sirenOscRef.current.disconnect();
      } catch {
        // ignore
      }
      sirenOscRef.current = null;
    }
    if (sirenCtxRef.current) {
      sirenCtxRef.current.close().catch(() => {});
      sirenCtxRef.current = null;
    }
    setSirenActive(false);
  }, []);

  const stopFlashlight = useCallback(() => {
    if (torchStreamRef.current) {
      torchStreamRef.current.getTracks().forEach((tr) => tr.stop());
      torchStreamRef.current = null;
    }
    setFlashlightActive(false);
    setStrobePhase(false);
  }, []);

  useEffect(() => {
    return () => {
      stopSiren();
      stopFlashlight();
    };
  }, [stopFlashlight, stopSiren]);

  useEffect(() => {
    if (!flashlightActive) return;
    const id = window.setInterval(() => setStrobePhase((p) => !p), 350);
    return () => window.clearInterval(id);
  }, [flashlightActive]);

  const toggleSiren = () => {
    if (sirenActive) {
      stopSiren();
      return;
    }
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(780, ctx.currentTime);
      gain.gain.setValueAtTime(0.28, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      let high = true;
      sirenIntervalRef.current = window.setInterval(() => {
        high = !high;
        osc.frequency.setValueAtTime(high ? 960 : 620, ctx.currentTime);
      }, 380);
      sirenCtxRef.current = ctx;
      sirenOscRef.current = osc;
      setSirenActive(true);
    } catch {
      setSafetyError('Browser blocked siren audio playback. Tap the button again to enable audio.');
    }
  };

  const toggleFlashlight = async () => {
    if (flashlightActive) {
      stopFlashlight();
      return;
    }
    setFlashlightActive(true);
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        torchStreamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        if (track && 'applyConstraints' in track) {
          await track.applyConstraints({
            advanced: [{ torch: true } as unknown as MediaTrackConstraintSet],
          });
        }
      }
    } catch {
      // Screen high-contrast strobe override remains active cleanly when hardware torch is unavailable
    }
  };

  const activateCompass = async () => {
    setCompassError(null);
    try {
      const devOrient = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (typeof devOrient?.requestPermission === 'function') {
        const res = await devOrient.requestPermission();
        if (res !== 'granted') {
          setCompassError('Compass orientation permission denied. Showing manual/GPS bearing.');
          return;
        }
      }
      setCompassActive(true);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const fixLat = Number(pos.coords.latitude.toFixed(5));
            const fixLng = Number(pos.coords.longitude.toFixed(5));
            const fixAcc = Math.round(pos.coords.accuracy || 0);
            const capturedAtMs = Date.now();
            setOfflineCoords({
              lat: fixLat,
              lng: fixLng,
              accuracy: fixAcc,
              altitude: pos.coords.altitude,
              source: 'Live GPS',
              capturedAtMs,
            });
            saveCachedGpsFix({
              latitude: fixLat,
              longitude: fixLng,
              accuracyMeters: fixAcc,
              source: 'live_gps',
              capturedAtMs,
            });
          },
          () => {
            // Works offline even if GPS fix is still acquiring
          },
          { enableHighAccuracy: true, timeout: 6000 }
        );
      }
    } catch {
      setCompassError('Device compass sensor unavailable on this desktop browser; displaying GPS fallback.');
    }
  };

  useEffect(() => {
    if (!compassActive) return;
    const handler = (ev: DeviceOrientationEvent) => {
      const iosHeading = (ev as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
      if (typeof iosHeading === 'number') {
        setCompassHeading(Math.round(iosHeading));
      } else if (typeof ev.alpha === 'number') {
        setCompassHeading(Math.round((360 - ev.alpha) % 360));
      }
    };
    window.addEventListener('deviceorientation', handler, true);
    return () => window.removeEventListener('deviceorientation', handler, true);
  }, [compassActive]);

  const [hazardFilter, setHazardFilter] = useState<'all' | 'earthquake' | 'tsunami' | 'flood' | 'severe_weather'>('all');
  const [refreshingDisasters, setRefreshingDisasters] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);

  const captureLocationAndOpenConfirm = () => {
    setGeoStatus(null);
    if (consentedLocation?.latitude !== undefined && consentedLocation?.longitude !== undefined) {
      setGeoCoords({ lat: consentedLocation.latitude, lng: consentedLocation.longitude });
      setConfirmSosOpen(true);
      return;
    }
    if (shareLocation && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setConfirmSosOpen(true);
        },
        () => {
          setGeoStatus('GPS unavailable or denied; SOS will notify contacts without coordinates.');
          setConfirmSosOpen(true);
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    } else {
      setConfirmSosOpen(true);
    }
  };

  const handleSendOfflineSimSms = (overrideRecipients?: string[]) => {
    setSafetyError(null);
    setSmsStatusBanner(null);

    const bridgeGps = tryReadAndroidBridgeGps();
    const lat =
      geoCoords?.lat ??
      offlineCoords?.lat ??
      consentedLocation?.latitude ??
      bridgeGps?.latitude;
    const lng =
      geoCoords?.lng ??
      offlineCoords?.lng ??
      consentedLocation?.longitude ??
      bridgeGps?.longitude;
    const acc =
      offlineCoords?.accuracy ??
      consentedLocation?.accuracyMeters ??
      bridgeGps?.accuracyMeters;
    const areaLabel = [
      consentedLocation?.city,
      consentedLocation?.district,
      consentedLocation?.country,
    ]
      .filter(Boolean)
      .join(', ');

    const recipients =
      overrideRecipients && overrideRecipients.length > 0
        ? overrideRecipients
        : emergencyContacts
            .filter((ec) => ec.notifyOnSos !== false)
            .map((ec) => ec.phone);

    const dispatchResult = triggerOfflineSimSmsSos({
      senderName: userProfile?.fullName || 'PK CHAT User',
      recipients,
      latitude: shareLocation ? lat : undefined,
      longitude: shareLocation ? lng : undefined,
      accuracyMeters: shareLocation ? acc : undefined,
      locationLabel: shareLocation ? areaLabel : undefined,
      note: sosNote,
    });

    if (dispatchResult.error) {
      setSafetyError(dispatchResult.error);
      return;
    }

    setSmsDispatchLog(getOfflineSmsDispatchLog());
    const coordsSummary =
      shareLocation && typeof lat === 'number' && typeof lng === 'number'
        ? `with GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`
        : 'without GPS coordinates';

    setSmsStatusBanner(
      dispatchResult.dispatchedVia === 'android_native_sim'
        ? `Offline SIM SMS SOS dispatched directly via cellular SIM to ${dispatchResult.recipients.length} contact(s) ${coordsSummary}.`
        : `Cellular SIM SMS composer opened for ${dispatchResult.recipients.length} trusted contact(s) ${coordsSummary}. Tap Send in Messages.`
    );
  };

  const handleConfirmSos = async () => {
    setSafetyError(null);
    setSafeAlertBanner(null);
    setSosBusy(true);
    try {
      if (alsoSendOfflineSms && emergencyContacts.length > 0) {
        handleSendOfflineSimSms();
      }
      if (typeof navigator === 'undefined' || navigator.onLine) {
        await triggerSosAlert({
          shareLiveLocation: shareLocation && Boolean(geoCoords),
          latitude: geoCoords?.lat,
          longitude: geoCoords?.lng,
          note: sosNote,
        });
      } else if (!alsoSendOfflineSms) {
        handleSendOfflineSimSms();
      }
      setSosNote('');
      setConfirmSosOpen(false);
    } catch (err) {
      setSafetyError(err instanceof Error ? err.message : 'Unable to send SOS alert.');
      setConfirmSosOpen(false);
    } finally {
      setSosBusy(false);
    }
  };


  // Screen 17: SOS Emergency Screen
  if (activeScreen === 'sos_emergency') {
    const remainingMs = sosTrackingExpiresAtMs ? Math.max(0, sosTrackingExpiresAtMs - nowMs) : 0;
    const activeAlerts = sosAlerts.filter((a) => a.status === 'active');

    return (
      <div className="p-4 lg:p-8 space-y-6">
        {/* Flashlight High-Contrast Strobe Override Banner */}
        {flashlightActive && (
          <div
            className={`p-4 rounded-2xl border-2 flex items-center justify-between gap-3 transition-colors ${
              strobePhase
                ? 'bg-white text-slate-950 border-amber-500 shadow-lg'
                : 'bg-amber-400 text-slate-950 border-white shadow-lg'
            }`}
          >
            <div className="flex items-center gap-2.5 text-xs font-extrabold">
              <Flashlight className="w-5 h-5" />
              <span>HIGH-VISIBILITY FLASHLIGHT / STROBE OVERRIDE ACTIVE — TAP STOP TO TURN OFF</span>
            </div>
            <button
              type="button"
              onClick={stopFlashlight}
              className="px-3 py-1.5 rounded-xl bg-slate-950 text-white text-xs font-bold shrink-0"
            >
              Stop Light
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {t('sos.dashboardTitle', 'Smart Emergency Detection, Help & SOS Dashboard')}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t(
                'sos.dashboardSub',
                '5-hour live SOS GPS tracking, siren/flashlight beacon, offline compass, OK I AM SAFE alert, and nearby verified shelters.'
              )}
            </p>
          </div>
          <button
            onClick={() => setActiveScreen('disaster_alerts')}
            className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold self-start"
          >
            {t('sos.viewOfficialAlerts', 'Official Disaster Alerts')}
          </button>
        </div>

        {/* Mandatory Honest Personal SOS & Disaster Safety Notice Banner */}
        <div className="p-4 rounded-2xl bg-sky-50 dark:bg-[#00c6ff]/[0.06] border border-[#bae6fd] dark:border-[#00c6ff]/25 text-xs text-slate-800 dark:text-slate-200 space-y-1.5">
          <p className="font-bold text-[#0284c7] dark:text-[#38bdf8]">
            {t('sos.disclaimerTitle', 'Personal SOS Contacts & Disaster Safety Notice')}
          </p>
          <p className="font-semibold text-rose-700 dark:text-rose-300">
            🚨 அரசாங்கத்தால் உறுதிப்படுத்தப்பட்ட பேரிடர் எச்சரிக்கை &amp; குடும்ப பாதுகாப்பு: உங்கள் குடும்பத்தினர் மற்றும் நம்பகமான உறவினர்களுக்கு (Max 3) உடனடி SOS தகவல் அனுப்பப்படும்.
          </p>
          <p>
            {t(
              'sos.disclaimerBody',
              'PK CHAT Personal SOS alerts notify only your saved trusted family and personal contacts with optional GPS coordinates.'
            )}
          </p>
        </div>

        {safeAlertBanner && (
          <div className="p-3.5 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-[#bae6fd] dark:border-sky-900 flex items-center justify-between gap-3 text-xs text-[#0369a1] dark:text-sky-200 font-semibold">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{safeAlertBanner}</span>
            </span>
            <button type="button" onClick={() => setSafeAlertBanner(null)} className="underline">
              Dismiss
            </button>
          </div>
        )}

        {(safetyError || locationError) && (
          <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-200">
            <span>{safetyError || locationError}</span>
            <button
              type="button"
              onClick={() => setSafetyError(null)}
              className="font-semibold underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Quick Emergency Hardware Beacon & Compass Controls */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={toggleSiren}
            className={`p-4 rounded-2xl border text-left transition-colors flex items-center gap-3 ${
              sirenActive
                ? 'bg-rose-600 text-white border-rose-500 shadow-[0_0_20px_rgba(225,29,72,0.5)]'
                : 'bg-[#e3f3ff]/78 dark:bg-white/[0.035] backdrop-blur-2xl border-[#7dd3fc]/75 dark:border-[#00c6ff]/20 hover:border-rose-400'
            }`}
          >
            {sirenActive ? <VolumeX className="w-5 h-5 shrink-0" /> : <Volume2 className="w-5 h-5 text-rose-500 shrink-0" />}
            <div>
              <p className="text-xs font-bold">{sirenActive ? 'Stop SOS Siren' : 'Emergency Siren'}</p>
              <p className={`text-[11px] ${sirenActive ? 'text-rose-100' : 'text-slate-500 dark:text-slate-400'}`}>
                {sirenActive ? 'Playing loud alarm' : 'Dual-tone audio alarm'}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={toggleFlashlight}
            className={`p-4 rounded-2xl border text-left transition-colors flex items-center gap-3 ${
              flashlightActive
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-[#e3f3ff]/78 dark:bg-white/[0.035] backdrop-blur-2xl border-[#7dd3fc]/75 dark:border-[#00c6ff]/20 hover:border-amber-400'
            }`}
          >
            <Flashlight className={`w-5 h-5 shrink-0 ${flashlightActive ? 'text-slate-950' : 'text-amber-500'}`} />
            <div>
              <p className="text-xs font-bold">
                {flashlightActive ? 'Stop Flashlight' : 'Flashlight Override'}
              </p>
              <p className={`text-[11px] ${flashlightActive ? 'text-slate-900' : 'text-slate-500 dark:text-slate-400'}`}>
                {flashlightActive ? 'Torch + strobe active' : 'Camera torch & strobe'}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={activateCompass}
            className={`p-4 rounded-2xl border text-left transition-colors flex items-center gap-3 ${
              compassActive
                ? 'bg-[#0284c7] text-white border-[#38bdf8]'
                : 'bg-[#e3f3ff]/78 dark:bg-white/[0.035] backdrop-blur-2xl border-[#7dd3fc]/75 dark:border-[#00c6ff]/20 hover:border-[#0284c7]'
            }`}
          >
            <Compass className={`w-5 h-5 shrink-0 ${compassActive ? 'text-sky-100' : 'text-[#0284c7] dark:text-[#38bdf8]'}`} />
            <div>
              <p className="text-xs font-bold">
                {compassActive
                  ? `${compassHeading}° ${getCardinalDirection(compassHeading)}`
                  : 'Offline Compass'}
              </p>
              <p className={`text-[11px] ${compassActive ? 'text-sky-100' : 'text-slate-500 dark:text-slate-400'}`}>
                {compassActive ? 'Active (Device Sensor)' : 'GPS & magnetometer heading'}
              </p>
            </div>
          </button>

          <div className="p-4 rounded-2xl bg-white/90 dark:bg-white/[0.035] dark:backdrop-blur-2xl border border-[#bae6fd] dark:border-[#00c6ff]/20 flex items-center gap-3">
            <Radio className={`w-5 h-5 shrink-0 ${sosTrackingExpiresAtMs ? 'text-rose-500' : 'text-[#38bdf8]'}`} />
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                {sosTrackingExpiresAtMs ? `5h GPS: ${formatCountdownMs(remainingMs)}` : '5-Hour Live GPS'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {sosTrackingExpiresAtMs
                  ? sosLastTrackSyncAtMs
                    ? `Synced ${new Date(sosLastTrackSyncAtMs).toLocaleTimeString()}`
                    : 'Auto-syncing Firestore'
                  : 'Starts on SOS trigger'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left Column: SOS Trigger + Location Consent + Offline Compass + Logs */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-[#e3f3ff]/78 dark:bg-white/[0.035] backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-[#00c6ff]/20 rounded-[20px] p-6 space-y-5 shadow-[0_8px_32px_rgba(2,132,199,0.14)]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold">Activate Personal SOS Alert</h2>
                {activeAlerts.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      setSafetyError(null);
                      try {
                        const res = await resolveSosAlert(activeAlerts[0].alertId, 'resolved', true);
                        stopSiren();
                        stopFlashlight();
                        setSafeAlertBanner(
                          `OK I AM SAFE sent! Delivered safety notice to ${res.safeNotifiedCount} active PK CHAT contact(s).`
                        );
                      } catch (err) {
                        setSafetyError(err instanceof Error ? err.message : 'Unable to send SAFE alert.');
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold shadow-xs"
                  >
                    OK I AM SAFE
                  </button>
                )}
              </div>

              <label className="flex items-center gap-3 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareLocation}
                  onChange={(e) => setShareLocation(e.target.checked)}
                  className="rounded text-rose-600"
                />
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-rose-600" />
                  Share 5-hour live GPS location in Firestore with trusted contacts
                </span>
              </label>

              <textarea
                rows={2}
                value={sosNote}
                onChange={(e) => setSosNote(e.target.value)}
                placeholder="Optional emergency note for trusted contacts..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-sm"
              />

              {geoStatus && <p className="text-xs text-amber-600">{geoStatus}</p>}

              <button
                onClick={captureLocationAndOpenConfirm}
                className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <AlertOctagon className="w-5 h-5" />
                <span>{t('sos.triggerSosBtn', 'Trigger SOS Confirmation')}</span>
              </button>

              {/* Dual-Mode Direct Action: 1-Tap Accurate GPS vs 1-Second Long Press Urgent Siren */}
              <div className="grid sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={sosBusy}
                  onClick={async () => {
                    setSosBusy(true);
                    setSafetyError(null);
                    try {
                      const res = await triggerQuickSosOneTap();
                      setSafeAlertBanner(
                        `1-Tap SOS Live GPS sent to ${res.sentContacts} contact(s)${res.hasGps ? ' with live GPS' : ''}${res.offlineSmsDispatched ? ' + SIM SMS dispatched' : ''}.`
                      );
                    } catch (err) {
                      setSafetyError(err instanceof Error ? err.message : 'Unable to send 1-tap GPS SOS.');
                    } finally {
                      setSosBusy(false);
                    }
                  }}
                  className="py-3 px-3.5 rounded-2xl bg-gradient-to-r from-[#0284c7] to-[#0369a1] hover:opacity-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span>1-Tap: Send Live GPS (Max 3)</span>
                </button>
                <button
                  type="button"
                  disabled={sosBusy}
                  onClick={async () => {
                    setSosBusy(true);
                    setSafetyError(null);
                    try {
                      const res = await triggerLongPressSosSiren({ demoLocalPreview: true });
                      setSafeAlertBanner(
                        `🚨 Urgent SOS Siren dispatched to ${res.sentContacts} contact(s)${res.hasGps ? ' with Live GPS' : ''} (DND Overridden).`
                      );
                    } catch (err) {
                      setSafetyError(err instanceof Error ? err.message : 'Unable to trigger Urgent Siren.');
                    } finally {
                      setSosBusy(false);
                    }
                  }}
                  className="py-3 px-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-700 hover:opacity-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Volume2 className="w-4 h-4 shrink-0" />
                  <span>🚨 Urgent Siren (DND Override)</span>
                </button>
              </div>

              {/* Offline SIM SMS + GPS Fallback Panel */}
              <div className="p-3.5 rounded-2xl bg-[#dff1ff]/80 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 space-y-2.5 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                    <Smartphone className="w-4 h-4 text-[#0284c7] shrink-0" />
                    <span>Offline SIM SMS + GPS Fallback</span>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/60 text-[#0369a1] dark:text-sky-300">
                    {isAndroidNativeSmsBridgeAvailable() ? 'Native SIM Bridge' : 'SIM SMS Ready'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  No internet required. Sends your exact GPS coordinates &amp; Google Maps pin via standard cellular SIM SMS to{' '}
                  {emergencyContacts.length} trusted contact(s).
                </p>
                <button
                  type="button"
                  onClick={() => handleSendOfflineSimSms()}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <MessageSquareText className="w-4 h-4 shrink-0" />
                  <span>Send Offline SIM SMS SOS (with GPS)</span>
                </button>
                {smsStatusBanner && (
                  <p className="text-[11px] font-medium text-[#0369a1] dark:text-sky-200 bg-sky-50 dark:bg-sky-950/40 border border-[#bae6fd] dark:border-sky-900 rounded-xl p-2">
                    {smsStatusBanner}
                  </p>
                )}
                {smsDispatchLog.length > 0 && (
                  <p className="text-[10px] text-slate-500 font-mono">
                    Last SIM SMS: {new Date(smsDispatchLog[0].createdAt).toLocaleTimeString()} ·{' '}
                    {smsDispatchLog[0].recipientCount} contact(s) ·{' '}
                    {smsDispatchLog[0].hasGps ? 'GPS attached' : 'No GPS'}
                  </p>
                )}
              </div>

              {/* Home Safe-Arrival Geofence (Auto 'OK I AM SAFE') */}
              <div className="p-3.5 rounded-2xl bg-[#f0f9ff] border border-[#bae6fd] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#0369a1]">
                    🏠 Home Safe-Arrival Geofence (Auto &quot;OK I AM SAFE&quot;)
                  </span>
                  {homeLocation && (
                    <button
                      type="button"
                      onClick={() => clearHomeLocation()}
                      className="text-[11px] font-semibold text-rose-600 hover:underline"
                    >
                      Clear Home
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-600">
                  {homeLocation
                    ? `Saved Home (${homeLocation.latitude.toFixed(4)}, ${homeLocation.longitude.toFixed(4)}) · Automatically sends "OK I AM SAFE" when arriving within 150m during active 5h SOS.`
                    : 'Set your Home GPS coordinates so active 5h SOS automatically sends "OK I AM SAFE" when you arrive home.'}
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    setSafetyError(null);
                    const loc = consentedLocation || (await grantGpsLocation(false));
                    if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
                      const saved = saveHomeLocation({
                        latitude: loc.latitude,
                        longitude: loc.longitude,
                        label: loc.city ? `Home (${loc.city})` : 'Home',
                      });
                      if (saved) {
                        setSafeAlertBanner(
                          `Home Safe-Arrival Location saved (${saved.latitude.toFixed(4)}, ${saved.longitude.toFixed(4)}).`
                        );
                      }
                    } else {
                      setSafetyError('Grant GPS or pick a manual location first to save Home coordinates.');
                    }
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-[#dff1ff]/85 hover:bg-[#bae6fd]/80 border border-[#7dd3fc]/80 text-[#0284c7] text-xs font-bold transition-colors"
                >
                  {homeLocation ? 'Update Home Location to Current GPS' : 'Save Current Location as Home'}
                </button>
              </div>

              {/* Route Navigation & Live Location Sharing Launcher */}
              <div className="p-3.5 rounded-2xl bg-[#0b141a] text-white border border-[#38bdf8]/40 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[#38bdf8] flex items-center gap-1.5">
                    <Navigation className="w-4 h-4 shrink-0" />
                    <span>Route Navigation &amp; Live Monitor</span>
                  </span>
                  <span className="text-[10px] text-sky-300 font-semibold">GPS &amp; Cached</span>
                </div>
                <p className="text-[11px] text-[#8696a0]">
                  Share Current / 8h Live Location and run turn-by-turn road navigation with cached GPS compass bearing fallback.
                </p>
                <button
                  type="button"
                  onClick={() => setWazeNavOpen(true)}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-[#0084ff] hover:bg-blue-600 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Navigation className="w-4 h-4 shrink-0" />
                  <span>Open Route Turn-by-Turn &amp; Monitor</span>
                </button>
              </div>

              {/* Active / Past SOS Alerts */}
              {sosAlerts.length > 0 && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                  <p className="text-xs font-semibold text-slate-500">Your SOS Alert Log</p>
                  {sosAlerts.slice(0, 5).map((alert) => (
                    <div
                      key={alert.alertId}
                      className="p-3 rounded-xl bg-[#dff1ff]/80 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span className="capitalize">Status: {alert.status}</span>
                        <span>Origin: User-Generated</span>
                      </div>
                      <p className="text-slate-500">
                        Emergency Services Notified: No (Manual dial required)
                      </p>
                      {alert.latitude !== undefined && alert.longitude !== undefined && (
                        <p className="font-mono text-blue-700 dark:text-blue-400">
                          GPS: {alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}
                        </p>
                      )}
                      {alert.status === 'active' && (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={async () => {
                              setSafetyError(null);
                              try {
                                const res = await resolveSosAlert(alert.alertId, 'resolved', true);
                                stopSiren();
                                stopFlashlight();
                                setSafeAlertBanner(
                                  `OK I AM SAFE sent (${res.safeNotifiedCount} PK CHAT chat(s) updated).`
                                );
                              } catch (err) {
                                setSafetyError(
                                  err instanceof Error ? err.message : 'Unable to resolve SOS alert.'
                                );
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white font-semibold"
                          >
                            OK I AM SAFE (Auto-Alert)
                          </button>
                          <button
                            onClick={async () => {
                              setSafetyError(null);
                              try {
                                await resolveSosAlert(alert.alertId, 'cancelled', false);
                                stopSiren();
                                stopFlashlight();
                              } catch (err) {
                                setSafetyError(
                                  err instanceof Error ? err.message : 'Unable to cancel SOS alert.'
                                );
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Consented Location Detection & Offline GPS/Sensor Compass Card */}
            <div className="bg-[#e3f3ff]/78 dark:bg-white/[0.035] backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-[#00c6ff]/20 rounded-[20px] p-6 space-y-4 shadow-[0_8px_32px_rgba(2,132,199,0.14)]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-blue-700 dark:text-[#38bdf8]" />
                  <span>{t('sos.locationConsentTitle', 'Consented Location & Offline Compass')}</span>
                </h2>
                {locationConsent?.sharingActive && (
                  <button
                    type="button"
                    onClick={stopLocationSharing}
                    className="text-xs font-semibold text-rose-600 hover:underline"
                  >
                    {t('sos.stopSharing', 'Stop Sharing')}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={locationLoading}
                  onClick={() => grantGpsLocation(true)}
                  className="px-3.5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{locationLoading ? 'Detecting GPS...' : t('sos.enableGps', 'Allow GPS Location')}</span>
                </button>
                <button
                  type="button"
                  onClick={activateCompass}
                  className="px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>{compassActive ? 'Compass Active' : 'Start Offline Compass'}</span>
                </button>
              </div>

              {consentedLocation && (
                <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-[#bae6fd] dark:border-sky-900 text-xs space-y-1">
                  <p className="font-semibold text-[#0369a1] dark:text-sky-200">
                    Active Area:{' '}
                    {[consentedLocation.city, consentedLocation.district, consentedLocation.province, consentedLocation.country]
                      .filter(Boolean)
                      .join(', ') || consentedLocation.country}
                  </p>
                  {consentedLocation.latitude !== undefined && consentedLocation.longitude !== undefined && (
                    <p className="font-mono text-[#0284c7] dark:text-[#38bdf8]">
                      {consentedLocation.latitude.toFixed(5)}, {consentedLocation.longitude.toFixed(5)}
                      {consentedLocation.accuracyMeters ? ` (±${consentedLocation.accuracyMeters}m)` : ''}
                    </p>
                  )}
                  <label className="flex items-center gap-2 pt-1 cursor-pointer text-[11px] text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={Boolean(locationConsent?.autoTravelUpdateEnabled)}
                      onChange={(e) => toggleAutoTravelUpdate(e.target.checked)}
                    />
                    <span>Auto-refresh regional safety context when traveling</span>
                  </label>
                </div>
              )}

              {/* Manual Place Search */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!placeQuery.trim()) return;
                  setSearchingPlace(true);
                  setSafetyError(null);
                  try {
                    const list = await searchManualLocationPlaces(placeQuery);
                    setPlaceResults(list);
                  } catch (err) {
                    setSafetyError(err instanceof Error ? err.message : 'Place search unavailable.');
                  } finally {
                    setSearchingPlace(false);
                  }
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={placeQuery}
                  onChange={(e) => setPlaceQuery(e.target.value)}
                  placeholder={t('sos.manualSearchPlaceholder', 'Search city or district manually...')}
                  className="flex-1 px-3 py-2 rounded-xl bg-[#eef8ff]/85 dark:bg-white/[0.05] border border-[#7dd3fc]/70 dark:border-[#00c6ff]/30 text-xs"
                />
                <button
                  type="submit"
                  disabled={searchingPlace}
                  className="px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>{searchingPlace ? '...' : 'Set'}</span>
                </button>
              </form>

              {placeResults.length > 0 && (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {placeResults.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={async () => {
                        await setManualConsentedLocation({
                          country: p.country || 'Unknown',
                          countryCode: p.countryCode || 'US',
                          province: p.province,
                          district: p.district,
                          city: p.city,
                          latitude: p.latitude,
                          longitude: p.longitude,
                        });
                        setPlaceResults([]);
                        setPlaceQuery('');
                      }}
                      className="w-full p-2 rounded-xl bg-[#dff1ff]/80 dark:bg-slate-950 hover:bg-[#bae6fd]/70 dark:hover:bg-blue-950/30 border border-[#7dd3fc]/70 dark:border-slate-800 text-left text-xs"
                    >
                      {p.displayAddress || [p.city, p.province, p.country].filter(Boolean).join(', ')}
                    </button>
                  ))}
                </div>
              )}

              {/* Visual Compass Gauge */}
              <div className="p-3.5 rounded-2xl bg-[#dff1ff]/80 dark:bg-[#00c6ff]/[0.05] border border-[#7dd3fc]/70 dark:border-[#00c6ff]/20 flex items-center gap-4">
                <div className="relative w-16 h-16 rounded-full border-2 border-[#0284c7] flex items-center justify-center bg-[#eef8ff]/90 dark:bg-slate-900 shrink-0">
                  <div
                    className="w-1 h-10 bg-gradient-to-b from-rose-600 via-rose-600 to-slate-400 rounded-full transition-transform duration-150"
                    style={{ transform: `rotate(${compassHeading}deg)` }}
                  />
                  <span className="absolute top-0.5 text-[9px] font-bold text-rose-600">N</span>
                </div>
                <div className="text-xs space-y-0.5">
                  <p className="font-bold text-slate-900 dark:text-white">
                    Offline GPS &amp; Sensor Compass: {compassHeading}° {getCardinalDirection(compassHeading)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {offlineCoords
                      ? `${offlineCoords.source || 'Coords'}: ${offlineCoords.lat.toFixed(4)}, ${offlineCoords.lng.toFixed(4)}${offlineCoords.capturedAtMs ? ` (${new Date(offlineCoords.capturedAtMs).toLocaleTimeString()})` : ''}`
                      : 'Tap Allow GPS or Start Compass to lock & cache coordinates'}
                  </p>
                  {compassError && <p className="text-[11px] text-amber-600">{compassError}</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Personal SOS Contacts (Trusted Emergency Contacts - Max 3) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Personal / Trusted Emergency Contacts (Max 3) - SOS Chain Management */}
            <div className="bg-[#e3f3ff]/78 dark:bg-white/[0.035] backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-[#00c6ff]/20 rounded-[20px] p-6 space-y-4 shadow-[0_8px_32px_rgba(2,132,199,0.14)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm sm:text-base font-bold text-[#0284c7] dark:text-[#38bdf8] flex items-center gap-2">
                  <span>🛡️ Personal SOS Contacts (Max 3)</span>
                  <span className="text-xs font-mono opacity-80">({emergencyContacts.length}/3)</span>
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#0284c7] dark:text-[#38bdf8]">
                    {emergencyContacts.length > 0 ? 'Active Chain' : 'Setup Chain'}
                  </span>
                  {emergencyContacts.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        setSafetyError(null);
                        try {
                          const removed = await clearAllEmergencyContacts();
                          setSafeAlertBanner(
                            `Removed ${removed} saved SOS contact(s). Only contacts you enter manually are stored.`
                          );
                        } catch (err) {
                          setSafetyError(
                            err instanceof Error ? err.message : 'Unable to clear SOS contacts.'
                          );
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[11px] font-semibold hover:brightness-105"
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-slate-700 dark:text-slate-300 bg-[#dff1ff]/80 dark:bg-white/[0.04] border border-[#7dd3fc]/70 dark:border-white/10 rounded-xl px-3 py-2">
                🔒 பயனாளர்கள் மட்டுமே (User-Provided Only): இங்கு பயனாளர்கள் நேரடியாக உள்ளிடும் குடும்ப / அவசர எண்கள் மட்டுமே சேமிக்கப்படும். சேவை அல்லது பிற முன்-சேமிக்கப்பட்ட எண்கள் எதுவும் சேர்க்கப்படாது.
              </p>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newName.trim() || !newPhone.trim()) return;
                  if (emergencyContacts.length >= 3) {
                    setSafetyError('Maximum 3 trusted contacts allowed in the SOS Chain. Remove one to add another.');
                    return;
                  }
                  setSafetyError(null);
                  try {
                    await addEmergencyContact({
                      name: newName.trim(),
                      phone: newPhone.trim(),
                      relationship: newRelation.trim() || 'Family',
                      countryCode: consentedLocation?.countryCode || 'LK',
                      notifyOnSos: true,
                    });
                    setNewName('');
                    setNewPhone('');
                    setSafeAlertBanner('Trusted Contact Added to SOS Chain!');
                  } catch (err) {
                    setSafetyError(
                      err instanceof Error ? err.message : 'Unable to add emergency contact.'
                    );
                  }
                }}
                className="space-y-2.5"
              >
                <div className="grid sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="பெயர் (Full name)"
                    disabled={emergencyContacts.length >= 3}
                    className="px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-white/[0.05] border border-[#7dd3fc]/75 dark:border-[#00c6ff]/30 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#00c6ff] disabled:opacity-50"
                  />
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="தொலைபேசி எண் (+94 7X XXX XXXX)"
                    disabled={emergencyContacts.length >= 3}
                    className="px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-white/[0.05] border border-[#7dd3fc]/75 dark:border-[#00c6ff]/30 text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#00c6ff] disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={newRelation}
                    onChange={(e) => setNewRelation(e.target.value)}
                    placeholder="உறவு (Relationship)"
                    disabled={emergencyContacts.length >= 3}
                    className="px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-white/[0.05] border border-[#7dd3fc]/75 dark:border-[#00c6ff]/30 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#00c6ff] disabled:opacity-50"
                  />
                </div>
                <button
                  type="submit"
                  disabled={emergencyContacts.length >= 3 || !newName.trim() || !newPhone.trim()}
                  className="w-full py-3 rounded-xl bg-gradient-to-br from-[#00c6ff] to-[#0072ff] hover:brightness-110 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(0,198,255,0.4)] transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {emergencyContacts.length >= 3
                      ? 'SOS Chain Full (3/3 Contacts)'
                      : 'Add to SOS Chain'}
                  </span>
                </button>
              </form>

              <div className="space-y-2 pt-1">
                {emergencyContacts.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                    No trusted contacts added yet. Add up to 3 trusted family or friends for automated SOS priority dispatch.
                  </p>
                ) : (
                  emergencyContacts.map((ec, idx) => (
                    <div
                      key={ec.id}
                      className="px-3.5 py-2.5 rounded-xl bg-sky-50/70 dark:bg-[#00c6ff]/[0.05] border border-[#bae6fd] dark:border-[#00c6ff]/15 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">
                          👤 {ec.name} <span className="font-mono text-[11px] opacity-80">({ec.phone})</span>
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {ec.relationship}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[11px] font-bold whitespace-nowrap ${
                            idx === 0
                              ? 'text-[#0284c7] dark:text-[#38bdf8]'
                              : 'text-[#0369a1] dark:text-sky-300'
                          }`}
                        >
                          Priority {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSendOfflineSimSms([ec.phone])}
                          className="px-2 py-1 rounded-lg bg-sky-50 dark:bg-[#38bdf8]/10 text-[#0284c7] dark:text-[#38bdf8] border border-[#bae6fd] dark:border-[#38bdf8]/25 text-[10px] font-semibold flex items-center gap-1 hover:brightness-110"
                          title={`Send offline SIM SMS with GPS to ${ec.name}`}
                        >
                          <MessageSquareText className="w-3 h-3" />
                          <span>SIM SMS</span>
                        </button>
                        <button
                          onClick={async () => {
                            setSafetyError(null);
                            try {
                              await removeEmergencyContact(ec.id);
                            } catch (err) {
                              setSafetyError(
                                err instanceof Error ? err.message : 'Unable to remove emergency contact.'
                              );
                            }
                          }}
                          className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                          aria-label="Remove contact"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Accidental Activation Confirmation Modal */}
        {confirmSosOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="max-w-md w-full rounded-3xl bg-[#e3f3ff]/88 dark:bg-slate-900 backdrop-blur-2xl border border-rose-300 dark:border-rose-800 p-6 space-y-4 shadow-2xl">
              <div className="flex items-center gap-2 text-rose-600">
                <ShieldAlert className="w-6 h-6" />
                <h3 className="text-lg font-bold">Confirm Personal SOS Alert</h3>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                This will notify your {emergencyContacts.length} saved Personal / Family SOS contact(s) inside PK CHAT and start 5-hour live GPS tracking if enabled.
              </p>
              {emergencyContacts.length > 0 && (
                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#dff1ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alsoSendOfflineSms}
                    onChange={(e) => setAlsoSendOfflineSms(e.target.checked)}
                    className="rounded text-[#0284c7]"
                  />
                  <span>
                    Also send <strong>Offline Cellular SIM SMS</strong> with exact GPS coordinates to trusted contacts
                  </span>
                </label>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setConfirmSosOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSos}
                  disabled={sosBusy}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold"
                >
                  {sosBusy ? 'Sending...' : 'Confirm & Send SOS'}
                </button>
              </div>
            </div>
          </div>
        )}

        <WazeNavigationModal
          open={wazeNavOpen}
          onClose={() => setWazeNavOpen(false)}
          initialLat={consentedLocation?.latitude}
          initialLng={consentedLocation?.longitude}
          initialMode="live_8h"
        />
      </div>
    );
  }

  // Screen 18: Official Disaster Alerts Screen
  const visibleDisasters = disasterAlerts.filter(
    (d) => hazardFilter === 'all' || d.hazardType === hazardFilter
  );

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t('alerts.title', 'Verified Official Disaster Alerts')}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t(
              'alerts.subtitle',
              'Live feeds from USGS Earthquakes, NOAA NWS, and NASA EONET — verified via PK Chat Master Core before regional dispatch.'
            )}
          </p>
        </div>
        <button
          onClick={async () => {
            setRefreshingDisasters(true);
            await refreshDisasterAlerts();
            setRefreshingDisasters(false);
          }}
          className="px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-2 self-start whitespace-nowrap"
        >
          <RefreshCw className={`w-4 h-4 ${refreshingDisasters ? 'animate-spin' : ''}`} />
          <span>{t('alerts.refreshFeeds', 'Refresh Official Feeds')}</span>
        </button>
      </div>

      {/* Hazard Filter Tabs */}
      <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#cdeaff]/80 dark:bg-slate-800 border border-[#7dd3fc]/70 backdrop-blur-xl rounded-xl">
        {(
          [
            { id: 'all', label: 'All Hazards' },
            { id: 'earthquake', label: 'Earthquakes' },
            { id: 'tsunami', label: 'Tsunamis' },
            { id: 'flood', label: 'Floods' },
            { id: 'severe_weather', label: 'Severe Weather' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setHazardFilter(tab.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              hazardFilter === tab.id
                ? 'bg-[#e8f5ff]/95 dark:bg-slate-900 text-[#0369a1] dark:text-white shadow-sm'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {disasterFeedErrors.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-200">
          Feed status note: {disasterFeedErrors.join(' · ')}
        </div>
      )}

      <MessengerDisasterAlerts variant="chat_message" maxVisible={4} />

      <div className="grid md:grid-cols-2 gap-4">
        {visibleDisasters.length === 0 ? (
          <div className="col-span-2 p-8 rounded-2xl bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 text-center text-sm text-slate-600">
            No active official alerts in this category from connected government agencies right now.
          </div>
        ) : (
          visibleDisasters.map((alert) => {
            const loc = localizeRedAlert(
              alert,
              userProfile?.preferredLanguage || appLanguage || 'en',
              consentedLocation?.country || userProfile?.country
            );
            return (
              <div
                key={alert.alertId}
                className={`p-5 rounded-2xl border space-y-2.5 backdrop-blur-2xl ${
                  loc.isRedAlert
                    ? 'bg-gradient-to-br from-rose-100/90 via-[#e8f4ff]/90 to-red-100/85 dark:from-rose-950/60 dark:via-slate-900 dark:to-red-950/50 border-rose-400 dark:border-rose-700 shadow-md'
                    : 'bg-[#e3f3ff]/78 dark:bg-slate-900 border-[#7dd3fc]/75 dark:border-slate-800'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-extrabold uppercase text-[11px] ${
                      loc.isRedAlert
                        ? 'bg-rose-600 text-white'
                        : 'bg-sky-100 dark:bg-sky-950 text-[#0284c7] dark:text-[#38bdf8]'
                    }`}
                  >
                    {loc.redAlertBadge}
                  </span>
                  <span className="capitalize text-slate-500 dark:text-slate-400 font-semibold">
                    {loc.hazardLabel} · {alert.status}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {loc.localizedTitle}
                </h3>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  {loc.localizedAdvice}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Area: {loc.areaLabel}
                  {typeof loc.distanceKm === 'number' ? ` (${loc.distanceKm.toFixed(0)} km away)` : ''}
                </p>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span className="font-semibold text-[#0284c7] dark:text-[#38bdf8]">
                    ✓ {loc.agencyLabel}
                  </span>
                  <span className="font-mono tabular-nums shrink-0">
                    {new Date(alert.issuedAt).toLocaleString()}
                  </span>
                </div>
                {alert.sourceUrl && (
                  <a
                    href={alert.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#0284c7] dark:text-[#38bdf8] hover:underline"
                  >
                    <span>Verify at Official Government Agency</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
