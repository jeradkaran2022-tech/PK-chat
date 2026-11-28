import React, { useMemo, useState } from 'react';
import { Clock, Globe, Languages, MapPin, ShieldAlert, ShieldCheck } from 'lucide-react';
import { usePkChat } from '../context/PkChatContext';
import {
  DISASTER_ALERT_LANGUAGES,
  DisasterAlertLanguageCode,
  MessengerDisasterAlertItem,
  PKFamilyCareLocation,
  PKFamilyCareMessage,
  TAMIL_AREAS,
  filterRelevantMessengerAlerts,
  formatMessengerAlertTimeLabel,
  getPKFamilyCareMessage,
  mapDisasterAlertToMessengerItem,
} from '../lib/messengerDisasterAlerts';

export {
  DISASTER_ALERT_LANGUAGES,
  TAMIL_AREAS,
  filterRelevantMessengerAlerts,
  getPKFamilyCareMessage,
  mapDisasterAlertToMessengerItem,
  type DisasterAlertLanguageCode,
  type MessengerDisasterAlertItem,
  type PKFamilyCareLocation,
  type PKFamilyCareMessage,
};

export interface MessengerDisasterAlertsProps {
  userLocation?: PKFamilyCareLocation | null;
  alertsOverride?: MessengerDisasterAlertItem[];
  maxVisible?: number;
  variant?: 'chat_message' | 'card';
  onOpenSos?: () => void;
}

export function MessengerDisasterAlerts({
  userLocation,
  alertsOverride,
  maxVisible = 3,
  variant = 'chat_message',
  onOpenSos,
}: MessengerDisasterAlertsProps) {
  const {
    disasterAlerts,
    consentedLocation,
    userProfile,
    setActiveScreen,
  } = usePkChat();

  // Always start in clear English for global travelers/users, with instant one-tap language switch inside the message
  const [alertLang, setAlertLang] = useState<DisasterAlertLanguageCode>('en');

  const resolvedLocation: PKFamilyCareLocation = useMemo(
    () => ({
      city:
        userLocation?.city ||
        consentedLocation?.city ||
        consentedLocation?.district ||
        '',
      region:
        userLocation?.region ||
        consentedLocation?.province ||
        consentedLocation?.district ||
        '',
      country:
        userLocation?.country ||
        consentedLocation?.country ||
        userProfile?.country ||
        '',
      language: alertLang,
    }),
    [
      alertLang,
      consentedLocation?.city,
      consentedLocation?.country,
      consentedLocation?.district,
      consentedLocation?.province,
      userLocation?.city,
      userLocation?.country,
      userLocation?.region,
      userProfile?.country,
    ]
  );

  const userCountry = resolvedLocation.country || '';
  const familyCareMsg = useMemo(
    () => getPKFamilyCareMessage({ ...resolvedLocation, language: alertLang }),
    [alertLang, resolvedLocation]
  );

  const relevantAlerts = useMemo(() => {
    const baseItems =
      alertsOverride ??
      disasterAlerts
        .filter((a) => a.verifiedOfficial === true && a.status !== 'resolved')
        .map(mapDisasterAlertToMessengerItem);
    return filterRelevantMessengerAlerts(baseItems, userCountry).slice(0, maxVisible);
  }, [alertsOverride, disasterAlerts, maxVisible, userCountry]);

  if (relevantAlerts.length === 0) return null;

  const handleSosAction = () => {
    if (onOpenSos) {
      onOpenSos();
    } else {
      setActiveScreen('sos_emergency');
    }
  };

  const bubbleWidthClass =
    variant === 'chat_message'
      ? 'max-w-[90%] sm:max-w-[78%]'
      : 'max-w-2xl';

  return (
    <div className="space-y-2.5" aria-label="PK Chat Official Emergency Alert Messages">
      {relevantAlerts.map((alert) => {
        const isLocalCountry =
          Boolean(userCountry) &&
          Boolean(alert.country) &&
          alert.country.trim().toLowerCase() === userCountry.trim().toLowerCase();

        return (
          <div key={alert.id} className="flex items-end gap-2 justify-start">
            <div
              aria-hidden="true"
              className="w-7 h-7 rounded-full bg-gradient-to-br from-[#0284c7] to-[#0072ff] text-white flex items-center justify-center shrink-0 shadow-xs border border-[#bae6fd]"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>

            <div
              className={`${bubbleWidthClass} rounded-2xl rounded-tl-sm px-3.5 py-2.5 bg-[#eef8ff]/92 dark:bg-[#1e2c3a]/92 backdrop-blur-xl border border-[#7dd3fc]/80 dark:border-sky-700/60 border-l-4 border-l-rose-500 text-slate-900 dark:text-slate-100 shadow-sm space-y-2`}
            >
              {/* Sender Header + Compact Language Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <span className="text-[12px] font-bold text-[#0369a1] dark:text-[#38bdf8]">
                    PK Chat Official 🛡️✓
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-200 border border-rose-200/80 dark:border-rose-800/60 text-[10px] font-bold uppercase tracking-wide">
                    {isLocalCountry ? (
                      <>
                        <MapPin className="w-2.5 h-2.5" />
                        <span>{alert.country} Alert</span>
                      </>
                    ) : (
                      <>
                        <Globe className="w-2.5 h-2.5" />
                        <span>{alert.country || 'International'} Alert</span>
                      </>
                    )}
                  </span>
                </div>

                <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#d9efff]/90 dark:bg-slate-800/80 border border-[#7dd3fc]/70 dark:border-slate-700 text-[11px] font-semibold text-[#0369a1] dark:text-[#38bdf8]">
                  <Languages className="w-3 h-3 shrink-0" />
                  <select
                    aria-label="Switch alert language"
                    value={alertLang}
                    onChange={(e) => setAlertLang(e.target.value as DisasterAlertLanguageCode)}
                    className="bg-transparent text-[#0369a1] dark:text-[#38bdf8] text-[11px] font-semibold focus:outline-none cursor-pointer"
                  >
                    {DISASTER_ALERT_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code} className="text-slate-900 bg-white">
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* English-First Official Country Emergency Alert Message Body */}
              <div className="space-y-1 text-[13.5px] leading-relaxed">
                <p className="font-bold text-slate-900 dark:text-white leading-snug">
                  {alert.title}
                </p>
                <p className="text-[13px] text-slate-700 dark:text-slate-200">
                  {alert.description}
                </p>
              </div>

              {/* Warm Safety Note & Founder Sign-Off (English first, switchable inline) */}
              <div className="pt-2 border-t border-[#7dd3fc]/50 dark:border-slate-700/70 space-y-1 text-[13px]">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {familyCareMsg.headline}
                </p>
                <p className="text-[12px] text-slate-600 dark:text-slate-300">
                  {familyCareMsg.subtext}
                </p>
                <p translate="no" className="text-[12px] font-semibold text-[#0369a1] dark:text-[#38bdf8]">
                  {familyCareMsg.signOff}
                </p>
              </div>

              {/* Message Footer: Verified Source, Quick SOS Action & Chat Timestamp */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="truncate">
                  ✓ {alert.source || 'Official Authority'} · {alert.region || alert.country || 'Alert Zone'}
                </span>
                <div className="flex items-center gap-2 shrink-0 ml-auto">
                  <button
                    type="button"
                    onClick={handleSosAction}
                    className="min-h-[28px] px-2.5 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-xs"
                  >
                    <ShieldAlert className="w-3 h-3" />
                    <span>SOS</span>
                  </button>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock className="w-3 h-3" />
                    <span>{formatMessengerAlertTimeLabel(alert.issuedAt)}</span>
                    <span className="text-[#0284c7] dark:text-[#38bdf8] font-bold">✓✓</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default MessengerDisasterAlerts;
