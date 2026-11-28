import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellPlus,
  Camera,
  CircleDot,
  CreditCard,
  Download,
  Grid,
  HelpCircle,
  Languages,
  Lock,
  MessageSquare,
  MoreVertical,
  Palette,
  Phone,
  QrCode,
  Search,
  Shield,
  ShieldCheck,
  Smartphone,
  User,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { ALL_SCREENS_META, BRAND_LOGO_URL } from '../data/constants';
import { usePkChat } from '../context/PkChatContext';
import { ScreenId } from '../types/pkchat';
import { GlobalSecurityOverlay } from './GlobalSecurityOverlay';
import { EmergencySosIncomingOverlay } from './EmergencySosIncomingOverlay';
import { IncomingCallOverlay } from './IncomingCallOverlay';
import { QrCodeModal, QrModalInitialTab } from './QrCodeModal';
import { StoreDownloadModal } from './StoreDownloadModal';
import { UserAvatar } from './UserAvatar';
import { useOnlineStatus } from '../hooks/usePWAInstall';
import { UiTranslationKey, useAppI18n } from '../lib/i18n';
import {
  BRAND_THEME_EVENT,
  LightBrandTheme,
  getLightBrandTheme,
  setLightBrandTheme,
} from '../lib/appearanceTheme';
import { PkLiveClassIcon } from './PkLiveClassIcon';
import { RememberModal, RememberModalDraft } from './RememberModal';
import { RememberDueOverlay } from './RememberDueOverlay';
import {
  REMINDERS_CHANGED_EVENT,
  REMINDERS_CHANNEL,
  getActivePendingRemindersCount,
} from '../lib/rememberReminders';
import { OFFICIAL_READ_CHANGED_EVENT, getReadOfficialIds } from '../lib/officialInboxEngine';

const PRIMARY_NAV: Array<{
  id: ScreenId;
  navKey: string;
  labelKey: UiTranslationKey;
  fallback: string;
  icon: React.ComponentType<{ className?: string }>;
  isDialPad?: boolean;
}> = [
  { id: 'chat_list', navKey: 'chat_list', labelKey: 'nav.chats', fallback: 'Chats', icon: MessageSquare },
  { id: 'status_updates', navKey: 'status_updates', labelKey: 'nav.updates', fallback: 'Updates', icon: CircleDot },
  { id: 'class_room', navKey: 'class_room', labelKey: 'nav.class', fallback: 'PK Live Class', icon: PkLiveClassIcon },
  { id: 'audio_call', navKey: 'audio_call', labelKey: 'nav.calls', fallback: 'Calls', icon: Phone },
  { id: 'audio_call', navKey: 'dial_pad', labelKey: 'nav.calls', fallback: 'Dial Pad', icon: Grid, isDialPad: true },
  { id: 'contacts', navKey: 'contacts', labelKey: 'nav.contacts', fallback: 'Contacts', icon: Users },
  { id: 'sos_emergency', navKey: 'sos_emergency', labelKey: 'nav.sos', fallback: 'SOS', icon: AlertTriangle },
  { id: 'disaster_alerts', navKey: 'disaster_alerts', labelKey: 'nav.alerts', fallback: 'Alerts', icon: Bell },
];

const SECONDARY_NAV: Array<{
  id: ScreenId;
  labelKey: UiTranslationKey;
  fallback: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'profile', labelKey: 'nav.profile', fallback: 'Profile & Settings', icon: User },
  { id: 'translation_settings', labelKey: 'nav.language', fallback: 'Language & Translation', icon: Languages },
  { id: 'wallpaper_gallery', labelKey: 'nav.appearance', fallback: 'Appearance & Wallpaper', icon: Palette },
  { id: 'subscription', labelKey: 'nav.subscription', fallback: 'Subscription', icon: CreditCard },
  { id: 'privacy_security', labelKey: 'nav.security', fallback: 'Security', icon: Shield },
  { id: 'app_lock', labelKey: 'nav.appLock', fallback: 'App Lock', icon: Lock },
  { id: 'admin_dashboard', labelKey: 'nav.adminConsole', fallback: 'Admin Console', icon: ShieldCheck },
  { id: 'mirror_preview', labelKey: 'nav.mirrorPreview', fallback: 'Mobile Mirror View', icon: Smartphone },
  { id: 'help_support', labelKey: 'nav.helpStores', fallback: 'Help & Stores', icon: HelpCircle },
];

export function ScreenNavigator({ children }: { children: React.ReactNode }) {
  const {
    activeScreen,
    setActiveScreen,
    userProfile,
    profileMedia,
    userAccount,
    isAdminUser,
    lockAppNow,
    userSettings,
    consentedLocation,
    selectedCountry,
    unseenStatusCount,
    weatherSnapshot,
    refreshWeatherNow,
    intentionalDataOff,
    emergencyContacts,
    triggerQuickSosOneTap,
    triggerLongPressSosSiren,
    disasterAlerts,
  } = usePkChat();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [qrModalTab, setQrModalTab] = useState<QrModalInitialTab | null>(null);
  const [rememberModalOpen, setRememberModalOpen] = useState(false);
  const [rememberDraft, setRememberDraft] = useState<RememberModalDraft | null>(null);
  const [pendingRemindersCount, setPendingRemindersCount] = useState<number>(() =>
    getActivePendingRemindersCount(userProfile?.uid)
  );
  const [dialPadModeActive, setDialPadModeActive] = useState<boolean>(false);
  const [sosHoldProgress, setSosHoldProgress] = useState(0);
  const [sosFeedbackToast, setSosFeedbackToast] = useState<string | null>(null);
  const sosPressTimerRef = useRef<number | null>(null);
  const sosProgressTimerRef = useRef<number | null>(null);
  const sosLongTriggeredRef = useRef(false);
  const quickMenuRef = useRef<HTMLDivElement | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isOnline = useOnlineStatus();
  const { t } = useAppI18n();

  const SWIPEABLE_SCREENS: ScreenId[] = ['chat_list', 'status_updates', 'audio_call', 'class_room'];
  const handleMainTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (e.touches.length !== 1) return;
    const target = e.target as HTMLElement | null;
    if (
      target?.closest(
        'input, textarea, select, canvas, [data-no-swipe="true"], .stories-container, .overflow-x-auto'
      )
    ) {
      swipeStartRef.current = null;
      return;
    }
    const touch = e.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  const handleMainTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || e.changedTouches.length !== 1) return;
    const idx = SWIPEABLE_SCREENS.indexOf(activeScreen);
    if (idx < 0) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const elapsed = Date.now() - start.time;
    if (elapsed > 600 || Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    if (dx < 0 && idx < SWIPEABLE_SCREENS.length - 1) {
      setDialPadModeActive(false);
      setActiveScreen(SWIPEABLE_SCREENS[idx + 1]);
    } else if (dx > 0 && idx > 0) {
      setDialPadModeActive(false);
      setActiveScreen(SWIPEABLE_SCREENS[idx - 1]);
    }
  };
  const [lightBrandTheme, setLightBrandThemeState] = useState<LightBrandTheme>(() =>
    getLightBrandTheme()
  );
  const isOceanBlue = lightBrandTheme === 'ocean_blue' || lightBrandTheme === 'sky_glass';
  void consentedLocation;
  void selectedCountry;
  void isOceanBlue;

  const [officialReadTick, setOfficialReadTick] = useState(0);
  const unreadDisasterAlertsCount = React.useMemo(() => {
    void officialReadTick;
    const readSet = new Set(getReadOfficialIds(userProfile?.uid));
    return disasterAlerts.filter((a) => !readSet.has(`disaster_${a.alertId}`)).length;
  }, [disasterAlerts, officialReadTick, userProfile?.uid]);

  useEffect(() => {
    const syncCount = () => {
      setPendingRemindersCount(getActivePendingRemindersCount(userProfile?.uid));
    };
    const syncOfficialRead = () => setOfficialReadTick((v) => v + 1);
    syncCount();
    const onOpenRemember = (ev: Event) => {
      const detail = (ev as CustomEvent<RememberModalDraft | undefined>).detail || null;
      setRememberDraft(detail);
      setRememberModalOpen(true);
    };
    const onCallsMode = (ev: Event) => {
      const mode = (ev as CustomEvent<'calls' | 'dialer'>).detail;
      setDialPadModeActive(mode === 'dialer');
    };
    window.addEventListener(REMINDERS_CHANGED_EVENT, syncCount);
    window.addEventListener(OFFICIAL_READ_CHANGED_EVENT, syncOfficialRead);
    window.addEventListener('pkchat-open-remember', onOpenRemember);
    window.addEventListener('pkchat-calls-mode', onCallsMode);
    let ch: BroadcastChannel | null = null;
    if ('BroadcastChannel' in window) {
      try {
        ch = new BroadcastChannel(REMINDERS_CHANNEL);
        ch.onmessage = syncCount;
      } catch {
        ch = null;
      }
    }
    return () => {
      window.removeEventListener(REMINDERS_CHANGED_EVENT, syncCount);
      window.removeEventListener(OFFICIAL_READ_CHANGED_EVENT, syncOfficialRead);
      window.removeEventListener('pkchat-open-remember', onOpenRemember);
      window.removeEventListener('pkchat-calls-mode', onCallsMode);
      ch?.close();
    };
  }, [userProfile?.uid]);

  useEffect(() => {
    const onBrandTheme = (ev: Event) => {
      const detail = (ev as CustomEvent<LightBrandTheme>).detail;
      if (detail === 'sky_glass' || detail === 'ocean_blue') {
        setLightBrandThemeState(detail);
      } else {
        setLightBrandThemeState(getLightBrandTheme());
      }
    };
    window.addEventListener(BRAND_THEME_EVENT, onBrandTheme);
    return () => {
      window.removeEventListener(BRAND_THEME_EVENT, onBrandTheme);
    };
  }, []);

  useEffect(() => {
    if (!quickMenuOpen) return;
    const handleClickOutside = (ev: MouseEvent) => {
      if (quickMenuRef.current && !quickMenuRef.current.contains(ev.target as Node)) {
        setQuickMenuOpen(false);
      }
    };
    const handleEscape = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setQuickMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [quickMenuOpen]);

  const showTemporarySosToast = (msg: string) => {
    setSosFeedbackToast(msg);
    window.setTimeout(() => {
      setSosFeedbackToast((curr) => (curr === msg ? null : curr));
    }, 5200);
  };

  const clearSosHoldTimers = () => {
    if (sosPressTimerRef.current !== null) {
      window.clearTimeout(sosPressTimerRef.current);
      sosPressTimerRef.current = null;
    }
    if (sosProgressTimerRef.current !== null) {
      window.clearInterval(sosProgressTimerRef.current);
      sosProgressTimerRef.current = null;
    }
    setSosHoldProgress(0);
  };

  const handleSosPointerDown = () => {
    clearSosHoldTimers();
    sosLongTriggeredRef.current = false;
    const startedAt = Date.now();
    sosProgressTimerRef.current = window.setInterval(() => {
      const pct = Math.min(100, Math.round(((Date.now() - startedAt) / 1000) * 100));
      setSosHoldProgress(pct);
    }, 40);

    sosPressTimerRef.current = window.setTimeout(() => {
      sosLongTriggeredRef.current = true;
      clearSosHoldTimers();
      try {
        navigator.vibrate?.([120, 60, 140]);
      } catch {
        // ignore vibrate errors
      }
      void triggerLongPressSosSiren().then((res) => {
        showTemporarySosToast(
          `🚨 URGENT SOS SIREN SENT (${Math.min(3, Math.max(1, res.sentContacts))} contact${res.sentContacts === 1 ? '' : 's'}${res.hasGps ? ' · Live GPS attached' : ''}${res.offlineSmsDispatched ? ' · SIM SMS' : ''})`
        );
      });
    }, 1000);
  };

  const handleSosPointerUpOrLeave = (triggerQuickIfShort: boolean) => {
    const wasLong = sosLongTriggeredRef.current;
    const hadTimer = sosPressTimerRef.current !== null;
    clearSosHoldTimers();
    if (!triggerQuickIfShort || wasLong || !hadTimer) return;

    if (emergencyContacts.length === 0) {
      setActiveScreen('sos_emergency');
      showTemporarySosToast('Add up to 3 Emergency Contacts for 1-Tap GPS & 1s Long-Press SOS.');
      return;
    }

    void triggerQuickSosOneTap().then((res) => {
      showTemporarySosToast(
        `📍 Quick SOS GPS sent to ${Math.min(3, Math.max(1, res.sentContacts))} saved contact(s)${res.offlineSmsDispatched ? ' via Zero-Data SIM SMS' : ''}. Hold 1s for Urgent Siren.`
      );
    });
  };

  useEffect(() => {
    return () => {
      clearSosHoldTimers();
    };
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col bg-gradient-to-br from-[#d5eeff] via-[#e6f5ff] to-[#bfe4ff] dark:bg-[#020617] dark:bg-[radial-gradient(ellipse_at_top,rgba(0,198,255,0.14),rgba(10,25,47,0.92)_45%,#020617_100%)] text-slate-900 dark:text-[#f8fafc] overflow-x-clip">
      {/* Ambient Light-Blue Atmospheric Orbs for True Frosted Glass Depth */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden dark:hidden">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[#7dd3fc]/45 blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-[#38bdf8]/30 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 w-96 h-96 rounded-full bg-[#0ea5e9]/25 blur-3xl" />
      </div>
      {/* Clean Light-Blue Frosted Glass Header (No duplicate nav links) */}
      <header className="sticky top-0 z-30 h-14 bg-gradient-to-r from-[#0284c7]/90 via-[#0ea5e9]/88 to-[#0077B6]/92 dark:bg-[#0a192f]/85 dark:from-[#0a192f]/85 dark:to-[#0a192f]/85 backdrop-blur-2xl text-white border-b border-sky-200/50 dark:border-white/10 shadow-[0_4px_24px_rgba(2,132,199,0.22)] px-2.5 sm:px-4 lg:px-6 flex items-center justify-between gap-2">
        {/* Zone 1: Brand + Live Weather Pill */}
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <button
            onClick={() => setActiveScreen('chat_list')}
            className="flex items-center gap-2 whitespace-nowrap text-left min-h-[44px] group"
          >
            <span className="relative flex items-center justify-center w-9 h-9 rounded-full bg-[#01123A] p-0.5 ring-2 ring-[#38bdf8]/90 shadow-[0_0_16px_rgba(56,189,248,0.65)] group-hover:scale-105 transition-transform shrink-0">
              <img
                src={BRAND_LOGO_URL}
                alt="PK CHAT"
                className="w-full h-full rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            </span>
            <span className="text-base font-extrabold tracking-tight text-white dark:bg-gradient-to-r dark:from-white dark:to-[#38bdf8] dark:bg-clip-text dark:text-transparent">
              PK Chat
            </span>
          </button>

          {/* Compact Instant Weather Pill in Top Header */}
          <button
            type="button"
            onClick={() => void refreshWeatherNow()}
            title={`${weatherSnapshot.city}: ${weatherSnapshot.condition} (${weatherSnapshot.tempC}°C) · Tap to refresh`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/18 hover:bg-white/28 border border-white/25 text-[11px] font-semibold text-white whitespace-nowrap shrink-0 transition-colors"
          >
            <span aria-hidden="true">{weatherSnapshot.icon}</span>
            <span className="tabular-nums font-bold">{weatherSnapshot.tempC}°C</span>
            <span className="hidden sm:inline text-[#e0f2fe] max-w-[90px] truncate">
              · {weatherSnapshot.city}
            </span>
          </button>
        </div>

        {/* Zone 3: Quick Actions (Theme, Quick Camera, Remember, Search, Install, SOS, Avatar, Menu) */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {intentionalDataOff && (
            <button
              type="button"
              onClick={() => setActiveScreen('profile')}
              title="Intentional Data-Off Mode active"
              className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-900/70 border border-white/25 text-[10px] font-bold text-slate-200 whitespace-nowrap"
            >
              <WifiOff className="w-3 h-3 text-slate-300" />
              <span>Data Off</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (
                activeScreen !== 'individual_chat' &&
                activeScreen !== 'group_chat' &&
                activeScreen !== 'status_updates'
              ) {
                setActiveScreen('status_updates');
              }
              window.setTimeout(() => window.dispatchEvent(new CustomEvent('pkchat-quick-camera')), 80);
            }}
            title="Quick Camera"
            aria-label="Open Quick Camera"
            className="flex min-h-[38px] min-w-[34px] items-center justify-center rounded-xl hover:bg-white/15 text-[#e0f2fe] hover:text-white transition-colors"
          >
            <Camera className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setRememberDraft({ category: 'task', title: '' });
              setRememberModalOpen(true);
            }}
            title="PK Chat Remember Alerts"
            aria-label="Create Remember Alert"
            className="relative flex min-h-[38px] min-w-[34px] items-center justify-center rounded-xl hover:bg-white/15 text-[#e0f2fe] hover:text-white transition-colors"
          >
            <BellPlus className="w-4 h-4" />
            {pendingRemindersCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-white text-[#0284c7] text-[9px] font-extrabold flex items-center justify-center shadow-xs">
                {pendingRemindersCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveScreen('chat_list');
              window.setTimeout(() => window.dispatchEvent(new CustomEvent('pkchat-focus-search')), 60);
            }}
            title="Search Chats"
            aria-label="Search Chats"
            className="flex min-h-[38px] min-w-[34px] items-center justify-center rounded-xl hover:bg-white/15 text-[#e0f2fe] hover:text-white transition-colors"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setStoreOpen(true)}
            className="hidden lg:flex min-h-[34px] px-2.5 py-1 rounded-xl bg-white/18 hover:bg-white/28 border border-white/25 text-white text-xs font-semibold items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t('nav.installApp', 'Install App')}</span>
          </button>

          {/* Dual-Mode Emergency SOS Button: Tap = Instant GPS Share | Hold 1s = Urgent Siren */}
          <button
            type="button"
            onPointerDown={handleSosPointerDown}
            onPointerUp={() => handleSosPointerUpOrLeave(true)}
            onPointerLeave={() => handleSosPointerUpOrLeave(false)}
            onPointerCancel={() => handleSosPointerUpOrLeave(false)}
            onContextMenu={(e) => e.preventDefault()}
            title="Tap: Send Live GPS to 3 Emergency Contacts · Hold 1s: Trigger Urgent SOS Siren"
            aria-label="Emergency SOS (Tap for GPS, Hold 1 second for Urgent Siren)"
            className="relative overflow-hidden min-h-[34px] px-2.5 py-1 rounded-full bg-[#FF3333] hover:bg-[#dc2626] border border-white/85 text-white text-xs font-bold whitespace-nowrap shrink-0 transition-all shadow-[0_0_12px_rgba(255,51,51,0.5)] inline-flex items-center gap-1 select-none touch-none"
          >
            {sosHoldProgress > 0 && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-white/35 transition-none"
                style={{ width: `${sosHoldProgress}%` }}
              />
            )}
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 relative z-10" />
            <span className="relative z-10">{t('nav.sos', 'SOS')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveScreen('profile')}
            title="Settings & Profile"
            aria-label="Open Settings & Profile"
            className="hidden sm:inline-flex rounded-full ring-2 ring-white/40 hover:ring-white transition-all shrink-0"
          >
            <UserAvatar
              src={profileMedia?.avatarDataUrl || userProfile?.avatarUrl}
              name={userProfile?.fullName}
              size="sm"
            />
          </button>
          <div ref={quickMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setQuickMenuOpen((v) => !v)}
              title="Settings, PK Live Class, Language & More"
              aria-label="Open Quick Menu"
              aria-expanded={quickMenuOpen}
              className="flex min-h-[36px] min-w-[30px] items-center justify-center rounded-xl hover:bg-white/15 text-sky-100 hover:text-white transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {quickMenuOpen && (
              <div
                role="menu"
                aria-label="PK Chat Quick Actions"
                className="absolute right-0 mt-2 w-64 rounded-2xl bg-[#e3f3ff]/88 dark:bg-[#10263e]/90 backdrop-blur-2xl border border-[#7dd3fc]/80 dark:border-[#2a3942] shadow-2xl py-1.5 z-50 text-xs text-slate-900 dark:text-[#e9edef]"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setQuickMenuOpen(false);
                    setActiveScreen('class_room');
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-sky-50 dark:hover:bg-[#2a3942] flex items-center gap-2.5 font-bold text-[#0284c7] dark:text-[#38bdf8]"
                >
                  <PkLiveClassIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>PK Live Class &amp; Class Settings</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setQuickMenuOpen(false);
                    setActiveScreen('profile');
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-[#2a3942] flex items-center gap-2.5 font-medium"
                >
                  <span>⚙️</span>
                  <span>Settings · Profile, DND &amp; Data</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setQuickMenuOpen(false);
                    setRememberDraft({ category: 'task', title: '' });
                    setRememberModalOpen(true);
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-sky-50 dark:hover:bg-[#2a3942] flex items-center gap-2.5 font-semibold text-[#0284c7] dark:text-[#38bdf8]"
                >
                  <BellPlus className="w-3.5 h-3.5 shrink-0" />
                  <span>PK Chat Remember ({pendingRemindersCount})</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setQuickMenuOpen(false);
                    setActiveScreen('profile');
                    window.setTimeout(() => {
                      document
                        .getElementById('audio-tone-settings-section')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 80);
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-[#2a3942] flex items-center gap-2.5 font-medium"
                >
                  <span>🔔</span>
                  <span>Settings · Ringtones &amp; Notifications</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setQuickMenuOpen(false);
                    setActiveScreen('translation_settings');
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-[#2a3942] flex items-center gap-2.5 font-medium"
                >
                  <span>🌐</span>
                  <span>Settings · Language &amp; Translation</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setQuickMenuOpen(false);
                    setActiveScreen('wallpaper_gallery');
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-[#2a3942] flex items-center gap-2.5 font-medium"
                >
                  <span>🎨</span>
                  <span>Settings · World-Peace Wallpaper</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setQuickMenuOpen(false);
                    setQrModalTab('my_code');
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-[#2a3942] flex items-center gap-2.5 font-medium"
                >
                  <QrCode className="w-3.5 h-3.5 text-[#0284c7] dark:text-[#38bdf8]" />
                  <span>My QR Code &amp; Scanner</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setQuickMenuOpen(false);
                    setActiveScreen('sos_emergency');
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-sky-50 dark:hover:bg-[#2a3942] text-red-600 dark:text-red-400 flex items-center gap-2.5 font-bold"
                >
                  <span>🛡️</span>
                  <span>Emergency SOS Contacts (Up to 3)</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setQuickMenuOpen(false);
                    setActiveScreen('disaster_alerts');
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-[#2a3942] flex items-center gap-2.5 font-medium"
                >
                  <span>⚠️</span>
                  <span>Disaster &amp; Weather Alerts</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const next: LightBrandTheme = 'ocean_blue';
                    setLightBrandTheme(next);
                    setQuickMenuOpen(false);
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-[#2a3942] flex items-center justify-between gap-2 font-medium"
                >
                  <span className="flex items-center gap-2.5">
                    <span>🖌️</span>
                    <span>Header Style</span>
                  </span>
                  <span className="text-[10px] font-bold text-[#0284c7] dark:text-[#38bdf8]">
                    Light-Blue Frost
                  </span>
                </button>
                <div className="my-1 border-t border-slate-200 dark:border-[#2a3942]" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setQuickMenuOpen(false);
                    setDrawerOpen(true);
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-[#2a3942] text-[#0284c7] dark:text-[#33b3ff] flex items-center gap-2.5 font-semibold"
                >
                  <span>📱</span>
                  <span>All App Screens ({ALL_SCREENS_META.length})</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Non-blocking SOS Dispatch Toast */}
      {sosFeedbackToast && (
        <div
          role="status"
          className="fixed top-16 right-3 left-3 sm:left-auto sm:w-96 z-50 rounded-2xl bg-slate-950/95 border border-red-400/50 text-white px-4 py-3 text-xs shadow-2xl backdrop-blur-xl flex items-center justify-between gap-2"
        >
          <span className="font-medium leading-relaxed">{sosFeedbackToast}</span>
          <button
            type="button"
            onClick={() => {
              setSosFeedbackToast(null);
              setActiveScreen('sos_emergency');
            }}
            className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold shrink-0"
          >
            SOS Hub
          </button>
        </div>
      )}

      {/* Subtle Offline SIM Fallback & Outbox Info Pill (Never shows "Reconnecting...") */}
      {!isOnline && !intentionalDataOff && (
        <div
          role="status"
          className="bg-sky-900/90 text-sky-100 text-[11px] font-medium text-center py-1 px-4 border-b border-sky-400/30"
        >
          Offline Mode — Messages queue locally &amp; Cellular SIM SOS / Carrier Dialer remain ready.
        </div>
      )}

      <GlobalSecurityOverlay />
      <EmergencySosIncomingOverlay />
      <IncomingCallOverlay />
      <RememberDueOverlay />
      <RememberModal
        open={rememberModalOpen}
        userId={userProfile?.uid || 'local_user'}
        draft={rememberDraft}
        onClose={() => setRememberModalOpen(false)}
        onSaved={() => setPendingRemindersCount(getActivePendingRemindersCount(userProfile?.uid))}
      />
      <StoreDownloadModal open={storeOpen} onClose={() => setStoreOpen(false)} />
      <QrCodeModal
        open={Boolean(qrModalTab)}
        initialTab={qrModalTab || 'my_code'}
        onClose={() => setQrModalTab(null)}
      />

      {/* Main Workspace with Desktop Sidebar + Viewport */}
      <div className="relative z-10 flex-1 flex max-w-[1440px] w-full mx-auto">
        <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-[#7dd3fc]/65 dark:border-[#1e3a8a]/70 bg-[#dff1ff]/70 backdrop-blur-2xl dark:bg-[#0a192f]/85 dark:backdrop-blur-xl p-4 justify-between">
          <div className="space-y-6">
            <div>
              <p className="px-3 mb-2 text-xs font-medium text-slate-400 dark:text-slate-500">
                {t('nav.coreWorkspace', 'Core Workspace')}
              </p>
              <div className="space-y-1">
                {PRIMARY_NAV.map((item) => {
                  const Icon = item.icon;
                  const isCallsTab = item.navKey === 'audio_call';
                  const active = item.isDialPad
                    ? (activeScreen === 'audio_call' || activeScreen === 'video_call') && dialPadModeActive
                    : isCallsTab
                      ? (activeScreen === 'audio_call' || activeScreen === 'video_call') && !dialPadModeActive
                      : activeScreen === item.id;
                  const isLiveClass = item.id === 'class_room';
                  return (
                    <button
                      key={item.navKey}
                      onClick={() => {
                        if (item.isDialPad) {
                          setDialPadModeActive(true);
                          setActiveScreen('audio_call');
                          window.setTimeout(
                            () =>
                              window.dispatchEvent(
                                new CustomEvent('pkchat-calls-mode', { detail: 'dialer' })
                              ),
                            40
                          );
                        } else if (isCallsTab) {
                          setDialPadModeActive(false);
                          setActiveScreen('audio_call');
                          window.setTimeout(
                            () =>
                              window.dispatchEvent(
                                new CustomEvent('pkchat-calls-mode', { detail: 'calls' })
                              ),
                            40
                          );
                        } else {
                          setDialPadModeActive(false);
                          setActiveScreen(item.id);
                        }
                      }}
                      className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between text-sm transition-all whitespace-nowrap ${
                        isLiveClass
                          ? active
                            ? 'bg-gradient-to-r from-[#0284c7] to-[#00b4d8] text-white font-bold shadow-[0_0_16px_rgba(56,189,248,0.45)]'
                            : 'bg-sky-50 dark:bg-[#0ea5e9]/15 border border-sky-300/70 dark:border-[#38bdf8]/40 text-[#0369a1] dark:text-[#38bdf8] font-bold hover:bg-sky-100'
                          : active
                            ? 'bg-sky-50 dark:bg-[#00c6ff]/15 dark:border dark:border-[#00c6ff]/40 text-[#0284c7] dark:text-[#00c6ff] font-semibold'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-sky-50/70 dark:hover:bg-[#1e3a8a]/35 font-medium'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>
                          {isLiveClass
                            ? 'PK Live Class'
                            : item.isDialPad
                              ? 'Dial Pad'
                              : t(item.labelKey, item.fallback)}
                        </span>
                      </span>
                      {item.id === 'status_updates' && unseenStatusCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#0284c7] text-white text-[10px] font-bold">
                          {unseenStatusCount}
                        </span>
                      )}
                      {item.id === 'disaster_alerts' && unreadDisasterAlertsCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                          {unreadDisasterAlertsCount}
                        </span>
                      )}
                      {isLiveClass && (
                        <span className="px-1.5 py-0.5 rounded-full bg-white/25 text-[10px] font-extrabold">
                          LIVE
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="px-3 mb-2 text-xs font-medium text-slate-400 dark:text-slate-500">
                {t('nav.settingsCloud', 'Settings & Cloud')}
              </p>
              <div className="space-y-1">
                {SECONDARY_NAV.map((item) => {
                  const Icon = item.icon;
                  const active = activeScreen === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveScreen(item.id)}
                      className={`w-full px-3 py-2 rounded-xl flex items-center justify-between text-sm font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-sky-50 dark:bg-sky-950/60 text-[#0284c7] dark:text-[#38bdf8]'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-sky-50/70 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{t(item.labelKey, item.fallback)}</span>
                      </span>
                      {item.id === 'admin_dashboard' && isAdminUser && (
                        <span className="text-[11px] text-[#0284c7] dark:text-[#38bdf8]">Owner</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <button
              type="button"
              onClick={() => setActiveScreen('profile')}
              className="w-full px-3 py-2 rounded-xl bg-[#cdeaff]/75 dark:bg-slate-950/75 hover:bg-[#bae6fd]/80 dark:hover:bg-slate-800 border border-[#7dd3fc]/65 dark:border-slate-800 flex items-center gap-2.5 text-left transition-colors"
            >
              <UserAvatar
                src={profileMedia?.avatarDataUrl || userProfile?.avatarUrl}
                name={userProfile?.fullName}
                size="sm"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {userProfile?.fullName || 'PK CHAT Member'}
                </p>
                {userAccount?.phoneNumber && (
                  <p className="text-[11px] font-mono font-medium text-[#0284c7] dark:text-[#38bdf8] truncate">
                    {userAccount.phoneNumber}
                  </p>
                )}
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {userProfile?.country} · {userProfile?.preferredLanguageName}
                </p>
              </div>
            </button>
            {userSettings?.pinLockEnabled && (
              <button
                onClick={lockAppNow}
                className="w-full px-3 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Lock App Now</span>
              </button>
            )}
          </div>
        </aside>

        {/* Active Screen Canvas (supports horizontal swipe to Updates, Calls, and dedicated PK Live Class) */}
        <main
          onTouchStart={handleMainTouchStart}
          onTouchEnd={handleMainTouchEnd}
          className="flex-1 min-w-0 pb-20 lg:pb-8"
        >
          {children}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (Natural WhatsApp 5-Tab Proportions: Chats | Updates | Calls | Live Class | Settings) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-[66px] bg-[#eaf6ff]/82 dark:bg-[#0b141a]/92 backdrop-blur-2xl border-t border-white/75 dark:border-white/10 grid grid-cols-5 items-center px-1.5 shadow-[0_-6px_24px_rgba(2,132,199,0.12)]"
      >
        {[
          {
            key: 'chats',
            label: t('nav.chats', 'Chats'),
            icon: MessageSquare,
            isLiveClass: false,
            hasBadge: false,
            isActive:
              activeScreen === 'chat_list' ||
              activeScreen === 'individual_chat' ||
              activeScreen === 'group_chat' ||
              activeScreen === 'home',
            onSelect: () => {
              setDialPadModeActive(false);
              setActiveScreen('chat_list');
            },
          },
          {
            key: 'updates',
            label: t('nav.updates', 'Updates'),
            icon: CircleDot,
            isLiveClass: false,
            hasBadge: unseenStatusCount > 0,
            isActive: activeScreen === 'status_updates',
            onSelect: () => {
              setDialPadModeActive(false);
              setActiveScreen('status_updates');
            },
          },
          {
            key: 'calls',
            label: t('nav.calls', 'Calls'),
            icon: Phone,
            isLiveClass: false,
            hasBadge: false,
            isActive: activeScreen === 'audio_call' || activeScreen === 'video_call',
            onSelect: () => {
              setDialPadModeActive(false);
              setActiveScreen('audio_call');
              window.setTimeout(
                () => window.dispatchEvent(new CustomEvent('pkchat-calls-mode', { detail: 'calls' })),
                50
              );
            },
          },
          {
            key: 'pk_live_class',
            label: 'Live Class',
            icon: PkLiveClassIcon,
            isLiveClass: true,
            hasBadge: false,
            isActive: activeScreen === 'class_room',
            onSelect: () => {
              setDialPadModeActive(false);
              setActiveScreen('class_room');
            },
          },
          {
            key: 'settings',
            label: 'Settings',
            icon: User,
            isLiveClass: false,
            hasBadge: false,
            isActive:
              activeScreen === 'profile' ||
              activeScreen === 'wallpaper_gallery' ||
              activeScreen === 'translation_settings' ||
              activeScreen === 'privacy_security' ||
              activeScreen === 'app_lock' ||
              activeScreen === 'subscription' ||
              activeScreen === 'payment_status' ||
              activeScreen === 'help_support',
            onSelect: () => {
              setDialPadModeActive(false);
              setActiveScreen('profile');
            },
          },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={tab.onSelect}
              className={`relative min-h-[50px] flex flex-col items-center justify-center text-[11px] font-medium transition-colors ${
                tab.isLiveClass
                  ? 'text-[#0284c7] dark:text-[#38bdf8] font-bold'
                  : tab.isActive
                    ? 'text-[#0284c7] dark:text-[#38bdf8] font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <div
                className={`px-3.5 py-1 rounded-full transition-all ${
                  tab.isLiveClass
                    ? tab.isActive
                      ? 'bg-gradient-to-r from-[#0284c7] to-[#00b4d8] text-white shadow-[0_2px_12px_rgba(2,132,199,0.45)]'
                      : 'bg-sky-100/80 dark:bg-sky-900/40 ring-1 ring-[#38bdf8]/60 text-[#0284c7] dark:text-[#38bdf8]'
                    : tab.isActive
                      ? 'bg-sky-100/90 dark:bg-[#0284c7]/25'
                      : ''
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              {tab.hasBadge && (
                <span className="absolute top-1.5 right-4 w-2 h-2 rounded-full bg-[#0284c7] dark:bg-[#38bdf8]" />
              )}
              <span className="mt-0.5 truncate max-w-full px-0.5 leading-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Complete Screen Directory Modal */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-sky-950/45 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-3xl w-full max-h-[85vh] flex flex-col rounded-3xl bg-[#e6f4ff]/88 dark:bg-slate-900/95 backdrop-blur-2xl border border-[#7dd3fc] dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  PK CHAT Screen Directory ({ALL_SCREENS_META.length} Screens)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Navigate directly to any module in the PK CHAT system
                </p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close directory"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto grid sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {ALL_SCREENS_META.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveScreen(s.id);
                    setDrawerOpen(false);
                  }}
                  className={`p-3 rounded-2xl border text-left transition-colors ${
                    activeScreen === s.id
                      ? 'border-[#0284c7] bg-sky-50 dark:bg-sky-950/40'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-sky-50/60 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <p className="text-xs font-mono text-blue-700 dark:text-blue-400 tabular-nums">
                    {String(s.number).padStart(2, '0')} · {s.group}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                    {s.title}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
