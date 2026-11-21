import React from 'react';
import { CheckCircle2, MapPin, Navigation, PhoneCall, Siren, X } from 'lucide-react';
import { usePkChat } from '../context/PkChatContext';

export function EmergencySosIncomingOverlay() {
  const {
    incomingSosSiren,
    acknowledgeOnTheWaySosSiren,
    dismissIncomingSosSiren,
    setActiveScreen,
  } = usePkChat();

  if (!incomingSosSiren) return null;

  const hasCoords =
    typeof incomingSosSiren.latitude === 'number' &&
    typeof incomingSosSiren.longitude === 'number';
  const latStr = hasCoords ? incomingSosSiren.latitude!.toFixed(5) : '';
  const lngStr = hasCoords ? incomingSosSiren.longitude!.toFixed(5) : '';
  const mapUrl = hasCoords ? `https://maps.google.com/?q=${latStr},${lngStr}` : null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Urgent Emergency SOS Siren Alert"
      className="fixed inset-x-0 bottom-0 z-[85] p-3 sm:p-5 flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto w-full max-w-lg rounded-3xl border-2 border-red-400 bg-gradient-to-b from-[#18070b]/98 via-[#111827]/98 to-[#090d16]/98 text-white shadow-[0_0_45px_rgba(239,68,68,0.65)] backdrop-blur-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
        {/* Urgent Siren Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center animate-pulse shrink-0">
              <Siren className="w-5 h-5 text-white" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-wider text-red-100 truncate">
                URGENT SOS SIREN · DND BYPASSED
              </p>
              <p className="text-sm sm:text-base font-bold text-white truncate">
                {incomingSosSiren.senderName}
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-black/30 border border-white/25 text-[10px] font-bold uppercase tracking-wide shrink-0">
            LIVE SOS
          </span>
        </div>

        {/* Caller & Live GPS Coordinates */}
        <div className="p-4 space-y-3">
          <div className="rounded-2xl bg-white/10 border border-white/15 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <MapPin className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" />
                <div className="min-w-0 text-xs">
                  <p className="font-semibold text-sky-100">
                    Accurate Live GPS Location
                  </p>
                  {hasCoords ? (
                    <p className="font-mono text-sm font-bold text-white mt-0.5">
                      {latStr}, {lngStr}
                      {typeof incomingSosSiren.accuracyMeters === 'number' && (
                        <span className="text-xs font-normal text-sky-200 ml-1.5">
                          (±{incomingSosSiren.accuracyMeters}m)
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-amber-200 mt-0.5">
                      Waiting for caller device GPS coordinates...
                    </p>
                  )}
                </div>
              </div>
              {mapUrl && (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1 shrink-0 transition-colors"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Open Map</span>
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300 px-1">
            <span>1-second long-press emergency alert overrides silent &amp; DND modes.</span>
            <button
              type="button"
              onClick={() => {
                dismissIncomingSosSiren();
                setActiveScreen('audio_call');
              }}
              className="text-sky-300 hover:text-sky-200 font-semibold inline-flex items-center gap-1 shrink-0"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Call Back</span>
            </button>
          </div>

          {/* Bottom-Anchored Action Buttons */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => void acknowledgeOnTheWaySosSiren()}
              className="min-h-[48px] px-4 py-3 rounded-2xl bg-gradient-to-r from-[#38bdf8] to-[#0284c7] hover:from-[#7dd3fc] hover:to-[#0369a1] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition-all border border-white/30"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>I Am On The Way</span>
            </button>
            <button
              type="button"
              onClick={dismissIncomingSosSiren}
              className="min-h-[48px] px-4 py-3 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/25 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <X className="w-4 h-4 shrink-0" />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
