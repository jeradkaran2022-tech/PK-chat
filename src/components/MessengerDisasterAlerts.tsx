import React, { useMemo } from 'react';
import { AlertTriangle, Clock, Globe, MapPin, ShieldAlert } from 'lucide-react';
import { usePkChat } from '../context/PkChatContext';
import {
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
  TAMIL_AREAS,
  filterRelevantMessengerAlerts,
  getPKFamilyCareMessage,
  mapDisasterAlertToMessengerItem,
  type MessengerDisasterAlertItem,
  type PKFamilyCareLocation,
  type PKFamilyCareMessage,
};

export interface MessengerDisasterAlertsProps {
  userLocation?: PKFamilyCareLocation | null;
  alertsOverride?: MessengerDisasterAlertItem[];
  maxVisible?: number;
  onOpenSos?: () => void;
}

export function MessengerDisasterAlerts({
  userLocation,
  alertsOverride,
  maxVisible = 3,
  onOpenSos,
}: MessengerDisasterAlertsProps) {
  const {
    disasterAlerts,
    consentedLocation,
    userProfile,
    setActiveScreen,
  } = usePkChat();

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
    }),
    [
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
    () => getPKFamilyCareMessage(resolvedLocation),
    [resolvedLocation]
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

  return (
    <div className="space-y-2.5">
      {relevantAlerts.map((alert) => {
        const isLocalCountry =
          Boolean(userCountry) &&
          Boolean(alert.country) &&
          alert.country.trim().toLowerCase() === userCountry.trim().toLowerCase();

        return (
          <div
            key={alert.id}
            className="bg-gradient-to-br from-rose-700 via-red-700 to-rose-800 text-white rounded-2xl p-3.5 shadow-md border border-rose-400/75"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-200" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide bg-black/25 px-2 py-0.5 rounded-md flex items-center gap-1">
                    {isLocalCountry ? (
                      <>
                        <MapPin className="w-3 h-3" />
                        <span>{alert.country} Alert</span>
                      </>
                    ) : (
                      <>
                        <Globe className="w-3 h-3" />
                        <span>Major Alert • {alert.country || 'International'}</span>
                      </>
                    )}
                  </span>

                  <span className="text-[11px] text-rose-100 flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3" />
                    <span>{formatMessengerAlertTimeLabel(alert.issuedAt)}</span>
                  </span>
                </div>

                <p className="font-bold text-sm mt-1.5 leading-snug">{alert.title}</p>
                <p className="text-xs text-rose-50 mt-1 leading-relaxed">
                  {alert.description}
                </p>

                <div className="mt-2.5 bg-black/25 px-3 py-2 rounded-xl border border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-amber-200 leading-snug">
                      {familyCareMsg.headline}
                    </p>
                    <p className="text-[11px] text-rose-50 mt-0.5 leading-snug">
                      {familyCareMsg.subtext}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSosAction}
                    className="px-3 py-1.5 rounded-xl bg-amber-300 hover:bg-amber-200 text-slate-950 text-[11px] font-extrabold inline-flex items-center gap-1 shrink-0 self-start sm:self-center shadow-sm"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>SOS</span>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] text-rose-100 mt-2 pt-2 border-t border-white/20">
                  <span className="truncate">
                    {alert.region || alert.country || 'Alert Zone'}
                  </span>
                  <span className="font-semibold truncate">
                    ✓ {alert.source || 'Official Authority'}
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
