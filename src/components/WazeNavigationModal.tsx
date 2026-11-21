import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Compass,
  ExternalLink,
  MapPin,
  Navigation,
  Radio,
  Route,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { tryReadAndroidBridgeGps } from '../lib/offlineSmsSos';
import { getCachedGpsFix, saveCachedGpsFix } from '../lib/connectivityAndDnd';

export interface WazeRouteStep {
  stepNumber: number;
  instruction: string;
  distanceText: string;
  bearing: number;
}

export interface WazeRouteResponse {
  mode: 'osrm_live' | 'gps_offline';
  oneWayVerified: boolean;
  destinationName: string;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  distanceKm: number;
  etaMinutes: number;
  bearingDegrees: number;
  geometry: Array<{ lat: number; lng: number }>;
  steps: WazeRouteStep[];
  osmDirectionsUrl: string;
  googleDirectionsUrl: string;
}

interface WazeNavigationModalProps {
  open: boolean;
  onClose: () => void;
  initialLat?: number;
  initialLng?: number;
  initialDestinationName?: string;
  initialMode?: 'current' | 'live_8h' | 'route';
  onShareLocationToChat?: (payload: {
    lat: number;
    lng: number;
    mode: 'current' | 'live_8h';
    label: string;
  }) => Promise<void> | void;
}

export function WazeNavigationModal({
  open,
  onClose,
  initialLat,
  initialLng,
  initialDestinationName,
  initialMode = 'route',
  onShareLocationToChat,
}: WazeNavigationModalProps) {
  const [originCoords, setOriginCoords] = useState<{
    lat: number;
    lng: number;
    accuracy?: number;
    speedKmh?: number;
  } | null>(() =>
    initialLat !== undefined && initialLng !== undefined
      ? { lat: initialLat, lng: initialLng }
      : null
  );
  const [destinationInput, setDestinationInput] = useState(
    initialDestinationName || 'Colombo Fort, Sri Lanka'
  );
  const [targetPin, setTargetPin] = useState<{ lat: number; lng: number; name?: string } | null>(
    () =>
      initialLat !== undefined && initialLng !== undefined
        ? { lat: initialLat, lng: initialLng, name: initialDestinationName }
        : null
  );
  const [routeData, setRouteData] = useState<WazeRouteResponse | null>(null);
  const [liveTrackingActive, setLiveTrackingActive] = useState(initialMode === 'live_8h');
  const [loadingGps, setLoadingGps] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [carProgress, setCarProgress] = useState(0.2);

  const captureOriginGps = useCallback(async () => {
    setLoadingGps(true);
    setErrorMsg(null);
    const bridgeGps = tryReadAndroidBridgeGps();
    if (bridgeGps) {
      setOriginCoords({
        lat: bridgeGps.latitude,
        lng: bridgeGps.longitude,
        accuracy: bridgeGps.accuracyMeters,
      });
      setLoadingGps(false);
      return { lat: bridgeGps.latitude, lng: bridgeGps.longitude };
    }

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 8000,
          })
        );
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : undefined,
          speedKmh:
            typeof pos.coords.speed === 'number' && pos.coords.speed >= 0
              ? Math.round(pos.coords.speed * 3.6)
              : 0,
        };
        setOriginCoords(coords);
        saveCachedGpsFix({
          latitude: coords.lat,
          longitude: coords.lng,
          accuracyMeters: coords.accuracy,
          source: 'live_gps',
          capturedAtMs: Date.now(),
        });
        setLoadingGps(false);
        return { lat: coords.lat, lng: coords.lng };
      } catch {
        // Check cached GPS fix when hardware GPS or permission is temporarily unavailable
      }
    }

    const cached = getCachedGpsFix();
    if (cached) {
      const cachedCoords = {
        lat: cached.latitude,
        lng: cached.longitude,
        accuracy: cached.accuracyMeters,
      };
      setOriginCoords(cachedCoords);
      setStatusNotice('Using last cached device GPS coordinates until live GPS updates.');
      setLoadingGps(false);
      return { lat: cachedCoords.lat, lng: cachedCoords.lng };
    }

    const fallback = originCoords || { lat: 6.9271, lng: 79.8612 };
    setOriginCoords(fallback);
    if (!originCoords) {
      setStatusNotice('Enable device GPS permission for exact live coordinates.');
    }
    setLoadingGps(false);
    return { lat: fallback.lat, lng: fallback.lng };
  }, [originCoords]);

  useEffect(() => {
    if (!open) return;
    if (initialLat !== undefined && initialLng !== undefined) {
      setTargetPin({ lat: initialLat, lng: initialLng, name: initialDestinationName });
      if (initialDestinationName) {
        setDestinationInput(initialDestinationName);
      }
    }
    void captureOriginGps();
  }, [open, initialLat, initialLng, initialDestinationName]);

  useEffect(() => {
    if (!open || !liveTrackingActive || typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setOriginCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : undefined,
          speedKmh:
            typeof pos.coords.speed === 'number' && pos.coords.speed >= 0
              ? Math.round(pos.coords.speed * 3.6)
              : 0,
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [open, liveTrackingActive]);

  useEffect(() => {
    if (!routeData) return;
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      setCarProgress((prev) => (prev >= 0.92 ? 0.12 : prev + 0.04));
    }, 650);
    return () => window.clearInterval(timer);
  }, [routeData]);

  const startWazeNavigation = async (overrideTarget?: { lat: number; lng: number; name?: string }) => {
    setErrorMsg(null);
    setStatusNotice(null);
    setLoadingRoute(true);
    try {
      const origin = await captureOriginGps();
      const target = overrideTarget || targetPin;
      const bodyPayload =
        target && destinationInput === (target.name || '')
          ? {
              fromLat: origin.lat,
              fromLng: origin.lng,
              toLat: target.lat,
              toLng: target.lng,
              destinationQuery: target.name || 'Pinned Destination',
            }
          : {
              fromLat: origin.lat,
              fromLng: origin.lng,
              destinationQuery: destinationInput.trim() || 'Colombo Fort, Sri Lanka',
            };

      const res = await fetch('/api/navigation/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });
      const json = (await res.json()) as WazeRouteResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || 'Unable to compute route.');
      }
      setRouteData(json);
      setLiveTrackingActive(true);
      setStatusNotice(
        json.oneWayVerified
          ? `Route verified (${json.distanceKm} km · ${json.etaMinutes} min). Road turn-by-turn & live GPS active.`
          : `Offline direct GPS compass bearing active (${json.distanceKm} km · ${json.bearingDegrees}°).`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to start route navigation.');
    } finally {
      setLoadingRoute(false);
    }
  };

  const handleSharePin = async (mode: 'current' | 'live_8h') => {
    setErrorMsg(null);
    const coords = await captureOriginGps();
    if (mode === 'live_8h') {
      setLiveTrackingActive(true);
    }
    const label =
      mode === 'live_8h'
        ? `Live Location (8h Route Tracking) · ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
        : `Current GPS Location Pin · ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
    if (onShareLocationToChat) {
      await onShareLocationToChat({ lat: coords.lat, lng: coords.lng, mode, label });
    }
    setStatusNotice(
      mode === 'live_8h'
        ? 'Shared 8-Hour Live Location with Sender Route Tracking.'
        : 'Shared Current Location pin to active chat.'
    );
  };

  const svgPolyline = useMemo(() => {
    const pts = routeData?.geometry;
    if (!pts || pts.length < 2) {
      return {
        pathD: 'M 24 92 Q 115 36 220 62 T 316 32',
        carX: 24 + (316 - 24) * carProgress,
        carY: 92 + (32 - 92) * carProgress - Math.sin(carProgress * Math.PI) * 18,
      };
    }
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const spanLat = Math.max(maxLat - minLat, 0.0008);
    const spanLng = Math.max(maxLng - minLng, 0.0008);

    const mapped = pts.map((p) => ({
      x: 24 + ((p.lng - minLng) / spanLng) * 292,
      y: 102 - ((p.lat - minLat) / spanLat) * 78,
    }));
    const d = mapped
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(' ');
    const idx = Math.min(mapped.length - 1, Math.floor(carProgress * (mapped.length - 1)));
    return { pathD: d, carX: mapped[idx].x, carY: mapped[idx].y };
  }, [routeData, carProgress]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="waze-nav-modal-title"
      className="fixed inset-0 z-50 bg-sky-950/55 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="max-w-xl w-full max-h-[90vh] overflow-y-auto rounded-3xl bg-[#e6f4ff]/88 dark:bg-[#111b21]/92 backdrop-blur-2xl border border-[#7dd3fc] dark:border-[#222d34] shadow-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-[#222d34] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0284c7]/15 text-[#0284c7] flex items-center justify-center">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <h2 id="waze-nav-modal-title" className="text-base font-bold text-slate-900 dark:text-white">
                Route Navigation &amp; Live Location Sharing
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                OpenStreetMap turn-by-turn road routing + cached offline GPS compass bearing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation panel"
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-[#202c33] text-slate-600 dark:text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* WhatsApp-Style Location Sharing Actions */}
        <div className="p-4 rounded-2xl bg-[#d6eeff]/80 dark:bg-[#202c33] border border-[#7dd3fc]/75 dark:border-[#2a3942] space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#0284c7]" />
              <span>WhatsApp-Style Location Sharing</span>
            </span>
            <span className="font-mono text-[11px] text-slate-500 dark:text-[#8696a0] tabular-nums">
              {loadingGps
                ? 'Acquiring GPS...'
                : originCoords
                  ? `${originCoords.lat.toFixed(4)}, ${originCoords.lng.toFixed(4)}`
                  : 'GPS Idle'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <button
              type="button"
              onClick={() => handleSharePin('current')}
              className="py-2.5 px-3 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-semibold flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Current Loc</span>
            </button>
            <button
              type="button"
              onClick={() => handleSharePin('live_8h')}
              className="py-2.5 px-3 rounded-xl bg-sky-50 dark:bg-[#111b21] border border-[#0284c7] text-[#0284c7] dark:text-[#38bdf8] hover:bg-[#0284c7]/10 font-semibold flex items-center justify-center gap-1.5"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Send Live Loc (8h)</span>
            </button>
          </div>
        </div>

        {/* Destination Entry + Start Waze Nav */}
        <div className="space-y-2.5">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Destination / Route Target
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={destinationInput}
              onChange={(e) => setDestinationInput(e.target.value)}
              placeholder="Enter destination (e.g. Colombo, Chennai Airport)..."
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-[#202c33] border border-[#7dd3fc]/75 dark:border-[#2a3942] text-sm text-slate-900 dark:text-white"
            />
            <button
              type="button"
              disabled={loadingRoute}
              onClick={() => startWazeNavigation()}
              className="px-4 py-2.5 rounded-xl bg-[#0084ff] hover:bg-blue-600 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0"
            >
              <Route className="w-4 h-4" />
              <span>{loadingRoute ? 'Routing...' : 'Start Route Nav'}</span>
            </button>
          </div>
        </div>

        {statusNotice && (
          <p className="text-xs text-[#0369a1] dark:text-sky-200 bg-sky-50 dark:bg-sky-950/40 border border-[#bae6fd] dark:border-sky-900 rounded-xl p-2.5">
            {statusNotice}
          </p>
        )}
        {errorMsg && (
          <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl p-2.5">
            {errorMsg}
          </p>
        )}

        {/* Interactive Route Telemetry Canvas */}
        <div className="rounded-2xl bg-[#0b141a] border-2 border-[#0284c7] p-4 space-y-3 text-white">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-[#38bdf8] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>
                {liveTrackingActive
                  ? 'Sender Live Route Monitoring Active'
                  : 'Route Telemetry Standby'}
              </span>
            </span>
            <span className="text-[11px] font-mono text-slate-300 tabular-nums">
              {routeData
                ? `${routeData.distanceKm} km · ${routeData.etaMinutes} min · ${routeData.bearingDegrees}°`
                : originCoords?.accuracy
                  ? `GPS ±${originCoords.accuracy}m`
                  : 'Ready'}
            </span>
          </div>

          <svg
            viewBox="0 0 340 120"
            className="w-full h-32 rounded-xl bg-[#111b21] border border-[#222d34]"
            role="img"
            aria-label="Live route trajectory visualization"
          >
            <path d="M 0 30 L 340 30 M 0 60 L 340 60 M 0 90 L 340 90" stroke="#1f2c34" strokeWidth="1" />
            <path d="M 85 0 L 85 120 M 170 0 L 170 120 M 255 0 L 255 120" stroke="#1f2c34" strokeWidth="1" />
            <path
              d={svgPolyline.pathD}
              fill="none"
              stroke="#0084ff"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="24" cy="92" r="5" fill="#38bdf8" />
            <circle cx="316" cy="32" r="5" fill="#e91e63" />
            <circle
              cx={svgPolyline.carX}
              cy={svgPolyline.carY}
              r="7"
              fill="#ffeb3b"
              stroke="#0b141a"
              strokeWidth="2"
            />
          </svg>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8696a0]">
            <span className="flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span>
                {routeData?.oneWayVerified
                  ? 'Route: Road-Verified OpenStreetMap OSRM Path'
                  : routeData?.mode === 'gps_offline'
                    ? 'Offline Direct GPS Bearing Mode'
                    : 'Tap Start Route Nav for road-verified turn steps'}
              </span>
            </span>
            {routeData?.osmDirectionsUrl && (
              <a
                href={routeData.osmDirectionsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#38bdf8] font-semibold hover:underline inline-flex items-center gap-1"
              >
                <span>Open Full Map</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Turn-by-Turn Instructions */}
        {routeData && routeData.steps.length > 0 && (
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Turn-by-Turn Maneuvers ({routeData.destinationName})
            </p>
            {routeData.steps.map((step) => (
              <div
                key={step.stepNumber}
                className="px-3 py-2 rounded-xl bg-[#d8eeff]/80 dark:bg-[#202c33] border border-[#7dd3fc]/70 dark:border-[#2a3942] flex items-center justify-between gap-2 text-xs"
              >
                <span className="text-slate-800 dark:text-[#e9edef]">
                  <strong className="font-mono text-[#0284c7] dark:text-[#38bdf8] mr-1.5">{step.stepNumber}.</strong>
                  {step.instruction}
                </span>
                <span className="font-mono text-[11px] text-slate-500 dark:text-[#8696a0] shrink-0 tabular-nums">
                  {step.distanceText}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
