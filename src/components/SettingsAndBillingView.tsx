import React, { useEffect, useRef, useState } from 'react';
import {
  Ban,
  BellPlus,
  BellRing,
  Briefcase,
  Camera,
  Check,
  Clock,
  CreditCard,
  Download,
  Fingerprint,
  Globe,
  HelpCircle,
  KeyRound,
  Languages,
  Lock,
  LogOut,
  Palette,
  PhoneCall,
  QrCode,
  RefreshCw,
  ScanFace,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Store,
  Sun,
  Trash2,
  Upload,
  User,
  Volume2,
} from 'lucide-react';
import { Timestamp, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  BUBBLE_COLOR_OPTIONS,
  BUILT_IN_WALLPAPERS,
  COUNTRIES,
  INTEGRATION_CHECKLIST,
  LANGUAGES,
  PK_WORLD_PEACE_WALLPAPER_URL,
} from '../data/constants';
import { usePkChat } from '../context/PkChatContext';
import { auth, db } from '../lib/firebase';
import {
  GOOGLE_PLAY_BILLING_CONFIG,
  STANDARD_FREE_TRIAL_DAYS,
  UNLIMITED_ADS_ANNUAL_PRICE_USD,
  USER_MODE_CHANGED_EVENT,
  getActiveUserMode,
  getSubscriptionEntitlement,
  hasFreeVipStatusAndAdAccess,
  setActiveUserMode,
} from '../lib/subscriptionBilling';
import { detectExplicitSexualContent, securityShield } from '../lib/securityShield';
import { useAppI18n } from '../lib/i18n';
import {
  activateAdvertiserUnlimitedPass,
  fetchAdPlatformConfig,
  fetchAdvertiserUnlimitedPassStatus,
  translateText,
} from '../lib/api';
import { renderMonogramAvatarDataUrl } from '../lib/chatMediaUtils';
import {
  AUDIO_SETTINGS_CHANGED_EVENT,
  AudioChannelId,
  CustomAudioTrackMeta,
  DIRECT_CALL_PRESETS,
  DIRECT_MESSAGE_PRESETS,
  GROUP_CALL_PRESETS,
  GROUP_MESSAGE_PRESETS,
  MAX_CUSTOM_AUDIO_BYTES,
  NotificationTonePresetId,
  RINGTONE_STATE_EVENT,
  RingtonePresetId,
  clearCustomAudioTrack,
  getCustomAudioTrack,
  getNotificationToneLabel,
  getRingtoneLabel,
  getSelectedNotificationTonePreset,
  getSelectedRingtonePreset,
  isMasterSoundEnabled,
  pkSignatureAudio,
  playNotificationTone,
  playRingtonePreview,
  setCustomAudioTrack,
  setMasterSoundEnabled,
  setSelectedNotificationTonePreset,
  setSelectedRingtonePreset,
  stopRingingLoop,
} from '../lib/audioTones';
import {
  AdvertiserUnlimitedPassStatus,
  PkChatUserMode,
  PrivacyVisibilityOption,
  RemoteAdPricingConfig,
} from '../types/pkchat';
import { ProfileImageEditorModal } from './ProfileImageEditorModal';
import { GlobalSecurityOverlay } from './GlobalSecurityOverlay';
import { StoreDownloadModal } from './StoreDownloadModal';
import { QrCodeModal, QrModalInitialTab } from './QrCodeModal';
import { UserAvatar, sanitizeUserAvatarUrl } from './UserAvatar';
import {
  BRAND_THEME_EVENT,
  LightBrandTheme,
  WALLPAPER_FIT_EVENT,
  WallpaperFitMode,
  getLightBrandTheme,
  getWallpaperFitMode,
  setLightBrandTheme,
  setWallpaperFitMode,
} from '../lib/appearanceTheme';
import {
  CONNECTIVITY_DND_EVENT,
  DataPackageMode,
  getDataPackageMode,
  getPkChatDndUntilMs,
  isPkChatDndEnabled,
  setDataPackageMode,
  setPkChatDndEnabled,
  setPkChatDndOvernight,
} from '../lib/connectivityAndDnd';
import {
  REMINDERS_CHANGED_EVENT,
  RememberReminder,
  deleteReminder,
  getRemindersList,
  markReminderDone,
  snoozeReminder,
} from '../lib/rememberReminders';

const AVATAR_MONOGRAM_THEMES = [
  { id: 'sky_crystal', label: 'Sky Crystal', bgStart: '#0284c7', bgEnd: '#38bdf8', accent: '#ffffff' },
  { id: 'ocean', label: 'Ocean', bgStart: '#0f172a', bgEnd: '#0284c7', accent: '#38bdf8' },
  { id: 'indigo', label: 'Royal', bgStart: '#312e81', bgEnd: '#6366f1', accent: '#facc15' },
  { id: 'amber', label: 'Sunset', bgStart: '#9a3412', bgEnd: '#f59e0b', accent: '#fef3c7' },
];

const STATUS_PRESETS = [
  'Available on PK CHAT',
  'Using live voice translation',
  'In a meeting · messages only',
  'Traveling across time zones',
];

export function SettingsAndBillingView() {
  const {
    activeScreen,
    setActiveScreen,
    userProfile,
    profileMedia,
    profileSyncLoading,
    profileSyncError,
    saveProfileCustomization,
    directoryProfiles,
    blockUserByUid,
    unblockUserByUid,
    userAccount,
    languagePref,
    userSettings,
    userDevices,
    currentDeviceId,
    e2eeFingerprint,
    updatePreferredLanguage,
    updateLanguageSettings,
    updateProfile,
    updateUserSettings,
    wallpapers,
    uploadCustomWallpaper,
    subscription,
    paymentRecords,
    performSubscriptionAction,
    securityLogs,
    logSecurityEvent,
    revokeDevice,
    setPinLock,
    lockAppNow,
    logoutUser,
    linkPhoneForDiscovery,
    selectedCountry,
    playCurrentSecurityVoiceAlert,
    isVoiceSpeaking,
    worldLanguages,
    worldLanguagesVersion,
    refreshLanguageCatalog,
    appLanguage,
    updateAppLanguage,
    emergencyContacts,
    addEmergencyContact,
    lookupUserByPhone,
    contacts,
    sendContactRequest,
    intentionalDataOff,
    toggleIntentionalDataOff,
    weatherSnapshot,
  } = usePkChat();

  const [shieldBusy, setShieldBusy] = useState(false);
  const [antiDebugGuard, setAntiDebugGuard] = useState(() => securityShield.isAntiDebugEnabled());
  const [storageClearMessage, setStorageClearMessage] = useState<string | null>(null);
  const [storageStatsTick, setStorageStatsTick] = useState(0);

  const { t, isRtl, loadingPack } = useAppI18n();
  const [langSearchQuery, setLangSearchQuery] = useState('');
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);

  // Translation tester state
  const [testSourceText, setTestSourceText] = useState('Vanakkam! Neengal saptirgala?');
  const [testTargetCode, setTestTargetCode] = useState(userProfile?.preferredLanguage || 'en');
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

  // Wallpaper filter & appearance theme state
  const [wpCategory, setWpCategory] = useState<string>('all');
  const [lightBrandTheme, setLightBrandThemeState] = useState<LightBrandTheme>(() =>
    getLightBrandTheme()
  );
  const [wallpaperFit, setWallpaperFitState] = useState<WallpaperFitMode>(() =>
    getWallpaperFitMode()
  );

  useEffect(() => {
    const onBrandTheme = (ev: Event) => {
      const detail = (ev as CustomEvent<LightBrandTheme>).detail;
      setLightBrandThemeState(
        detail === 'sky_glass' || detail === 'ocean_blue' ? detail : getLightBrandTheme()
      );
    };
    const onWallpaperFit = (ev: Event) => {
      const detail = (ev as CustomEvent<WallpaperFitMode>).detail;
      setWallpaperFitState(detail === 'cover' || detail === 'contain' ? detail : getWallpaperFitMode());
    };
    window.addEventListener(BRAND_THEME_EVENT, onBrandTheme);
    window.addEventListener(WALLPAPER_FIT_EVENT, onWallpaperFit);
    return () => {
      window.removeEventListener(BRAND_THEME_EVENT, onBrandTheme);
      window.removeEventListener(WALLPAPER_FIT_EVENT, onWallpaperFit);
    };
  }, []);

  // Billing busy state (Google Play Store Billing ONLY)
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingProvider, setBillingProvider] = useState<'google_play_test'>('google_play_test');

  // Personal Profile Customization state (synchronized with Firestore profile_media + user_profiles)
  const [editName, setEditName] = useState(userProfile?.fullName || '');
  const [editAbout, setEditAbout] = useState(profileMedia?.about || userProfile?.about || '');
  const [editBio, setEditBio] = useState(profileMedia?.bio || userProfile?.bio || '');
  const [editStatusMsg, setEditStatusMsg] = useState(
    profileMedia?.statusMessage || userProfile?.statusMessage || ''
  );
  const [profileVis, setProfileVis] = useState<PrivacyVisibilityOption>(
    profileMedia?.profileVisibility || userProfile?.profileVisibility || 'everyone'
  );
  const [photoVis, setPhotoVis] = useState<PrivacyVisibilityOption>(
    profileMedia?.profilePhotoVisibility || userProfile?.profilePhotoVisibility || 'everyone'
  );
  const [aboutVis, setAboutVis] = useState<PrivacyVisibilityOption>(
    profileMedia?.aboutVisibility || userProfile?.aboutVisibility || 'everyone'
  );
  const [photoEditorMode, setPhotoEditorMode] = useState<'avatar' | 'cover' | null>(null);
  const [qrModalTab, setQrModalTab] = useState<QrModalInitialTab | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [blockCandidateUid, setBlockCandidateUid] = useState('');

  const [linkPhoneInput, setLinkPhoneInput] = useState(userAccount?.phoneNumber || '');
  const [linkDialCode, setLinkDialCode] = useState(userAccount?.countryDialCode || selectedCountry.dialCode || '+94');
  const [linkAllowDiscovery, setLinkAllowDiscovery] = useState<boolean>(
    userAccount?.phoneDiscoveryEnabled ?? true
  );
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [discoveryMsg, setDiscoveryMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const seededPhoneRef = useRef(false);

  useEffect(() => {
    if (userAccount?.phoneNumber && !seededPhoneRef.current) {
      seededPhoneRef.current = true;
      setLinkPhoneInput((prev) => prev || userAccount.phoneNumber || '');
      if (userAccount.countryDialCode) {
        setLinkDialCode(userAccount.countryDialCode);
      }
      if (typeof userAccount.phoneDiscoveryEnabled === 'boolean') {
        setLinkAllowDiscovery(userAccount.phoneDiscoveryEnabled);
      }
    }
  }, [userAccount?.countryDialCode, userAccount?.phoneDiscoveryEnabled, userAccount?.phoneNumber]);

  // Synchronize remote cross-device profile updates into editor fields cleanly
  useEffect(() => {
    if (userProfile?.fullName) setEditName(userProfile.fullName);
    setEditAbout(profileMedia?.about ?? userProfile?.about ?? 'Hey there! I am using PK CHAT.');
    setEditBio(profileMedia?.bio ?? userProfile?.bio ?? '');
    setEditStatusMsg(profileMedia?.statusMessage ?? userProfile?.statusMessage ?? '');
    setProfileVis(profileMedia?.profileVisibility ?? userProfile?.profileVisibility ?? 'everyone');
    setPhotoVis(
      profileMedia?.profilePhotoVisibility ?? userProfile?.profilePhotoVisibility ?? 'everyone'
    );
    setAboutVis(profileMedia?.aboutVisibility ?? userProfile?.aboutVisibility ?? 'everyone');
  }, [profileMedia, userProfile]);

  // App lock PIN state
  const [newPin, setNewPin] = useState('');
  const [pinMsg, setPinMsg] = useState<string | null>(null);

  // Auto-Greeting toggle state
  const [autoGreetEnabled, setAutoGreetEnabled] = useState<boolean>(() => {
    if (typeof userSettings?.autoFestivalGreetEnabled === 'boolean') {
      return userSettings.autoFestivalGreetEnabled;
    }
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('pk_auto_greet_v1');
      if (stored !== null) return stored !== 'false';
    }
    return true;
  });

  const [profileDob, setProfileDob] = useState<string>(() => {
    try {
      return window.localStorage.getItem('pk_user_dob') || '2000-01-01';
    } catch {
      return '2000-01-01';
    }
  });
  const [dobConfirmed, setDobConfirmed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('pk_user_dob_confirmed') === 'true';
    } catch {
      return false;
    }
  });
  const [masterSoundEnabled, setMasterSoundEnabledState] = useState<boolean>(() =>
    isMasterSoundEnabled()
  );
  const [directMsgPreset, setDirectMsgPreset] = useState<NotificationTonePresetId>(() =>
    getSelectedNotificationTonePreset('direct_message')
  );
  const [groupMsgPreset, setGroupMsgPreset] = useState<NotificationTonePresetId>(() =>
    getSelectedNotificationTonePreset('group_message')
  );
  const [directCallPreset, setDirectCallPreset] = useState<RingtonePresetId>(() =>
    getSelectedRingtonePreset('direct_call')
  );
  const [groupCallPreset, setGroupCallPreset] = useState<RingtonePresetId>(() =>
    getSelectedRingtonePreset('group_call')
  );
  const [customAudioTracks, setCustomAudioTracks] = useState<
    Record<AudioChannelId, CustomAudioTrackMeta | null>
  >(() => ({
    direct_message: getCustomAudioTrack('direct_message'),
    group_message: getCustomAudioTrack('group_message'),
    direct_call: getCustomAudioTrack('direct_call'),
    group_call: getCustomAudioTrack('group_call'),
  }));
  const [audioUploadError, setAudioUploadError] = useState<string | null>(null);
  const [audioPreviewActive, setAudioPreviewActive] = useState<AudioChannelId | null>(null);
  const isLocalPreviewActiveRef = useRef(false);
  const [pkDndEnabled, setPkDndEnabledState] = useState<boolean>(() => isPkChatDndEnabled());
  const [pkDndUntilMs, setPkDndUntilMsState] = useState<number | null>(() => getPkChatDndUntilMs());
  const [dataPackageMode, setDataPackageModeState] = useState<DataPackageMode>(() =>
    getDataPackageMode()
  );
  const [rememberItems, setRememberItems] = useState<RememberReminder[]>(() => getRemindersList());

  useEffect(() => {
    if (!audioPreviewActive) return;
    const isCallChannel = audioPreviewActive === 'direct_call' || audioPreviewActive === 'group_call';
    // Call ringtones keep looping continuously like a real incoming call until Stop / Mute / Dismiss
    if (isCallChannel) return;
    const timer = window.setTimeout(() => {
      setAudioPreviewActive(null);
    }, 1050);
    return () => window.clearTimeout(timer);
  }, [audioPreviewActive]);

  useEffect(() => {
    const syncDndAndData = () => {
      setPkDndEnabledState(isPkChatDndEnabled());
      setPkDndUntilMsState(getPkChatDndUntilMs());
      setDataPackageModeState(getDataPackageMode());
    };
    const syncReminders = () => {
      setRememberItems(getRemindersList());
    };
    window.addEventListener(CONNECTIVITY_DND_EVENT, syncDndAndData);
    window.addEventListener(REMINDERS_CHANGED_EVENT, syncReminders);
    return () => {
      window.removeEventListener(CONNECTIVITY_DND_EVENT, syncDndAndData);
      window.removeEventListener(REMINDERS_CHANGED_EVENT, syncReminders);
    };
  }, []);

  useEffect(() => {
    const syncAudioState = () => {
      setMasterSoundEnabledState(isMasterSoundEnabled());
      setDirectMsgPreset(getSelectedNotificationTonePreset('direct_message'));
      setGroupMsgPreset(getSelectedNotificationTonePreset('group_message'));
      setDirectCallPreset(getSelectedRingtonePreset('direct_call'));
      setGroupCallPreset(getSelectedRingtonePreset('group_call'));
      setCustomAudioTracks({
        direct_message: getCustomAudioTrack('direct_message'),
        group_message: getCustomAudioTrack('group_message'),
        direct_call: getCustomAudioTrack('direct_call'),
        group_call: getCustomAudioTrack('group_call'),
      });
    };
    const onRingState = (ev: Event) => {
      const active = (ev as CustomEvent<{ active?: boolean }>).detail?.active;
      if (active === false) {
        isLocalPreviewActiveRef.current = false;
        setAudioPreviewActive((prev) =>
          prev === 'direct_call' || prev === 'group_call' ? null : prev
        );
      }
    };
    window.addEventListener(AUDIO_SETTINGS_CHANGED_EVENT, syncAudioState);
    window.addEventListener(RINGTONE_STATE_EVENT, onRingState);
    return () => {
      window.removeEventListener(AUDIO_SETTINGS_CHANGED_EVENT, syncAudioState);
      window.removeEventListener(RINGTONE_STATE_EVENT, onRingState);
      if (isLocalPreviewActiveRef.current) {
        isLocalPreviewActiveRef.current = false;
        stopRingingLoop();
      }
    };
  }, []);

  const handleCustomAudioUpload = (
    channel: AudioChannelId,
    file: File | undefined
  ) => {
    if (!file) return;
    setAudioUploadError(null);
    if (!file.type.startsWith('audio/')) {
      setAudioUploadError('Please select a valid audio file (MP3, WAV, M4A, or OGG).');
      return;
    }
    if (file.size > MAX_CUSTOM_AUDIO_BYTES) {
      setAudioUploadError('Audio file must be smaller than 2.5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        setCustomAudioTrack(channel, {
          name: file.name,
          mimeType: file.type || 'audio/mpeg',
          dataUrl,
          sizeBytes: file.size,
        });
        if (channel === 'direct_call' || channel === 'group_call') {
          playRingtonePreview('custom', channel);
        } else {
          playNotificationTone('custom', channel, { allowDuringPreview: true });
        }
        setAudioPreviewActive(channel);
      } catch (err) {
        setAudioUploadError(err instanceof Error ? err.message : 'Unable to save custom audio.');
      }
    };
    reader.onerror = () => setAudioUploadError('Failed to read audio file from device.');
    reader.readAsDataURL(file);
  };
  const [passkeyEnrollBusy, setPasskeyEnrollBusy] = useState(false);
  const [hasPasskeyEnrolled, setHasPasskeyEnrolled] = useState<boolean>(() => {
    try {
      return Boolean(window.localStorage.getItem('pk_biometric_cred_id'));
    } catch {
      return false;
    }
  });

  // WhatsApp Business-Style Custom Away Auto-Reply state
  const [autoReplyEnabled, setAutoReplyEnabled] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('pk_autoreply_enabled') === 'true';
    } catch {
      return false;
    }
  });
  const [autoReplyMsg, setAutoReplyMsg] = useState<string>(() => {
    try {
      return (
        window.localStorage.getItem('pk_autoreply_msg') ||
        'வணக்கம்! நான் தற்போது வேலையாக உள்ளேன். விரைவில் பதில் தருகிறேன். நன்றி! 🙏'
      );
    } catch {
      return 'வணக்கம்! நான் தற்போது வேலையாக உள்ளேன். விரைவில் பதில் தருகிறேன். நன்றி! 🙏';
    }
  });
  const [autoReplyNotice, setAutoReplyNotice] = useState<string | null>(null);

  const handleSaveAutoReplySettings = (nextEnabled = autoReplyEnabled, nextMsg = autoReplyMsg) => {
    try {
      window.localStorage.setItem('pk_autoreply_enabled', nextEnabled ? 'true' : 'false');
      window.localStorage.setItem('pk_autoreply_msg', nextMsg.trim());
      window.dispatchEvent(new CustomEvent('pkchat-autoreply-updated'));
      setAutoReplyNotice(
        nextEnabled
          ? '💬 ஆட்டோ-ரிப்ளை (Custom Auto-Reply) வெற்றிகரமாக இயக்கப்பட்டுச் சேமிக்கப்பட்டது!'
          : 'ஆட்டோ-ரிப்ளை தற்காலிகமாக நிறுத்தப்பட்டது (Saved).'
      );
    } catch {
      setAutoReplyNotice('Unable to persist auto-reply settings locally.');
    }
  };

  useEffect(() => {
    if (typeof userSettings?.autoFestivalGreetEnabled === 'boolean') {
      setAutoGreetEnabled(userSettings.autoFestivalGreetEnabled);
    }
  }, [userSettings?.autoFestivalGreetEnabled]);

  // Triple Emergency Contacts Setup & PK CHAT User Verification state
  const [tripleSlots, setTripleSlots] = useState<Array<{ name: string; phone: string }>>([
    { name: '', phone: '' },
    { name: '', phone: '' },
    { name: '', phone: '' },
  ]);
  const [tripleVerifyBusy, setTripleVerifyBusy] = useState(false);
  const [tripleStatusLines, setTripleStatusLines] = useState<string[]>([]);
  const [tripleErrorMsg, setTripleErrorMsg] = useState<string | null>(null);
  const seededTripleRef = useRef(false);

  useEffect(() => {
    if (emergencyContacts.length > 0 && !seededTripleRef.current) {
      seededTripleRef.current = true;
      setTripleSlots([
        {
          name: emergencyContacts[0]?.name || '',
          phone: emergencyContacts[0]?.phone || '',
        },
        {
          name: emergencyContacts[1]?.name || '',
          phone: emergencyContacts[1]?.phone || '',
        },
        {
          name: emergencyContacts[2]?.name || '',
          phone: emergencyContacts[2]?.phone || '',
        },
      ]);
    }
  }, [emergencyContacts]);

  const activeSettingsWallpaperUrl =
    userSettings?.customWallpaperData ||
    wallpapers.find((w) => w.wallpaperId === userSettings?.wallpaperId)?.imageUrl ||
    PK_WORLD_PEACE_WALLPAPER_URL;

  const renderSettingsShell = (children: React.ReactNode) => (
    <div className="relative min-h-full overflow-hidden bg-gradient-to-br from-[#d2ebff] via-[#e4f5ff] to-[#b9e2ff] dark:from-[#0b141a] dark:via-slate-950 dark:to-slate-900">
      <div
        aria-hidden="true"
        className="pointer-events-none select-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden opacity-25 dark:opacity-15"
      >
        <img
          src={activeSettingsWallpaperUrl}
          alt=""
          className="w-full h-full object-contain object-center"
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );

  // Screen 15: Translation Settings
  if (activeScreen === 'translation_settings') {
    const filteredWorldLangs = worldLanguages.filter((l) => {
      const q = langSearchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q)
      );
    });

    return (
      <div className="p-4 lg:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {t('settings.languageTitle', 'Universal Language & App Translation Settings')}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t(
                'settings.languageSub',
                'Select your App Language and messaging language independently of country across 130+ world languages.'
              )}
            </p>
          </div>
          <button
            type="button"
            disabled={refreshingCatalog}
            onClick={async () => {
              setRefreshingCatalog(true);
              try {
                await refreshLanguageCatalog();
              } finally {
                setRefreshingCatalog(false);
              }
            }}
            className="px-3.5 py-2 rounded-xl bg-[#eef8ff]/75 dark:bg-transparent border border-[#7dd3fc]/75 dark:border-slate-800 hover:bg-[#dff1ff] dark:hover:bg-slate-800 text-[#0369a1] dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 self-start shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingCatalog ? 'animate-spin' : ''}`} />
            <span>
              {t('settings.refreshCatalog', 'Refresh Catalog')} ({worldLanguages.length})
            </span>
          </button>
        </div>

        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl p-6 space-y-5 shadow-[0_8px_28px_rgba(2,132,199,0.12)]">
            {/* Search Filter across 130+ World Languages */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={langSearchQuery}
                onChange={(e) => setLangSearchQuery(e.target.value)}
                placeholder={t('settings.searchLanguages', 'Search 130+ languages or ISO codes...')}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-xs"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {t('settings.appLanguageLabel', 'App Display Language (All Screens)')}
                </label>
                {isRtl && (
                  <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                    {t('settings.rtlActive', 'RTL Active')}
                  </span>
                )}
              </div>
              <select
                value={appLanguage}
                onChange={(e) => {
                  const lang = worldLanguages.find((l) => l.code === e.target.value);
                  if (lang) {
                    void updateAppLanguage(lang.code, lang.name);
                  }
                }}
                className="w-full px-4 py-3 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-sm"
              >
                {filteredWorldLangs.map((l) => (
                  <option key={`app_${l.code}`} value={l.code}>
                    {l.name} ({l.nativeName}) [{l.code}]
                  </option>
                ))}
              </select>
              {loadingPack && (
                <p className="text-[11px] text-[#0284c7] mt-1">
                  Loading localized screen dictionary...
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                {t('settings.preferredLangLabel', 'Chat & Voice Preferred Language')} ({worldLanguagesVersion})
              </label>
              <select
                value={userProfile?.preferredLanguage || 'en'}
                onChange={(e) => {
                  const lang = worldLanguages.find((l) => l.code === e.target.value);
                  if (lang && lang.supported) {
                    void updatePreferredLanguage(lang.code, lang.name);
                  } else if (lang) {
                    setTestError(`"${lang.name}" is listed for directory visibility and may have limited automatic voice translation.`);
                  }
                }}
                className="w-full px-4 py-3 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-sm"
              >
                {filteredWorldLangs.map((l) => (
                  <option key={`pref_${l.code}`} value={l.code}>
                    {l.name} ({l.nativeName}) {l.supported ? '' : '— Directory Only'}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 cursor-pointer">
                <span className="text-sm font-medium">Automatic Language Detection</span>
                <input
                  type="checkbox"
                  checked={languagePref?.autoDetect ?? true}
                  onChange={(e) => updateLanguageSettings({ autoDetect: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 cursor-pointer">
                <span className="text-sm font-medium">Preserve Original Messages</span>
                <input
                  type="checkbox"
                  checked={languagePref?.preserveOriginal ?? true}
                  onChange={(e) => updateLanguageSettings({ preserveOriginal: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 cursor-pointer">
                <span className="text-sm font-medium">Live Call Speech Translation</span>
                <input
                  type="checkbox"
                  checked={languagePref?.voiceTranslationEnabled ?? true}
                  onChange={(e) =>
                    updateLanguageSettings({ voiceTranslationEnabled: e.target.checked })
                  }
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 cursor-pointer">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Volume2 className="w-4 h-4 text-[#0284c7]" />
                  <span>Voice Security Alerts (Multilingual TTS)</span>
                </span>
                <input
                  type="checkbox"
                  checked={userSettings?.voiceSecurityAlertsEnabled ?? true}
                  onChange={(e) =>
                    updateUserSettings({ voiceSecurityAlertsEnabled: e.target.checked })
                  }
                />
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                Translated Speech Playback Voice
              </label>
              <div className="flex gap-2">
                <select
                  value={languagePref?.ttsVoice || 'Kore'}
                  onChange={(e) =>
                    updateLanguageSettings({
                      ttsVoice: e.target.value as 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr',
                    })
                  }
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-sm"
                >
                  {['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={isVoiceSpeaking}
                  onClick={() => playCurrentSecurityVoiceAlert()}
                  className="px-4 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap"
                >
                  {isVoiceSpeaking ? 'Speaking...' : 'Preview Voice Alert'}
                </button>
              </div>
            </div>

            <GlobalSecurityOverlay showNormalBadge />
          </div>

          {/* Live Translation & Unsupported Language Checker */}
          <div className="lg:col-span-6 bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-[0_8px_28px_rgba(2,132,199,0.12)]">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Languages className="w-5 h-5 text-blue-700 dark:text-blue-400" />
              <span>Test Real-Time Cloud Translation</span>
            </h2>
            <textarea
              rows={3}
              value={testSourceText}
              onChange={(e) => setTestSourceText(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-sm"
            />
            <div className="flex gap-2">
              <select
                value={testTargetCode}
                onChange={(e) => setTestTargetCode(e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-sm"
              >
                {worldLanguages.map((l) => (
                  <option key={`test_${l.code}`} value={l.code}>
                    {l.name} ({l.nativeName})
                  </option>
                ))}
              </select>
              <button
                onClick={async () => {
                  setTranslating(true);
                  setTestError(null);
                  setTestOutput(null);
                  try {
                    const lang =
                      worldLanguages.find((l) => l.code === testTargetCode) ||
                      LANGUAGES.find((l) => l.code === testTargetCode);
                    const res = await translateText({
                      text: testSourceText,
                      targetLanguage: testTargetCode,
                      targetLanguageName: lang?.name || testTargetCode,
                    });
                    if (!res.supported) {
                      setTestError(res.unsupportedReason || 'Language unsupported.');
                    } else {
                      setTestOutput(
                        `Detected: ${res.detectedLanguageName} → ${res.translatedText}`
                      );
                    }
                  } catch (err) {
                    setTestError(err instanceof Error ? err.message : 'Translation failed.');
                  } finally {
                    setTranslating(false);
                  }
                }}
                disabled={translating}
                className="px-5 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-sm font-semibold"
              >
                {translating ? 'Translating...' : 'Translate'}
              </button>
            </div>
            {testOutput && (
              <div className="p-3.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-[#bae6fd] dark:border-sky-900 text-sm text-[#0369a1] dark:text-sky-200">
                {testOutput}
              </div>
            )}
            {testError && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-200">
                {testError}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Screen 16: Wallpaper Gallery & Appearance
  if (activeScreen === 'wallpaper_gallery') {
    const categories = ['all', 'signature', 'nature', 'flowers', 'ocean', 'mountains', 'abstract', 'romantic', 'custom'];
    const filteredWallpapers = wallpapers.filter(
      (w) => wpCategory === 'all' || w.category === wpCategory
    );

    const handleCustomWallpaperFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        if (typeof reader.result === 'string') {
          await uploadCustomWallpaper(file.name.replace(/\.[^.]+$/, ''), reader.result);
        }
      };
      reader.readAsDataURL(file);
    };

    return renderSettingsShell(
      <div className="p-4 lg:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Chat Appearance &amp; Wallpaper Gallery
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Instant PK Chat Signature Wallpaper &amp; custom gallery wallpapers fitted cleanly without half-cut cropping.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start">
            <button
              type="button"
              onClick={() => {
                setWallpaperFitMode('contain');
                updateUserSettings({
                  wallpaperId: BUILT_IN_WALLPAPERS[0].wallpaperId,
                  customWallpaperData: '',
                });
              }}
              className="px-4 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold shadow-xs"
            >
              ✨ Apply Signature Wallpaper
            </button>
            <button
              onClick={() => {
                setLightBrandTheme('ocean_blue');
                setWallpaperFitMode('contain');
                updateUserSettings({
                  theme: 'light',
                  bubbleColor: 'sky_glass',
                  wallpaperId: BUILT_IN_WALLPAPERS[0].wallpaperId,
                  customWallpaperData: '',
                });
              }}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset Appearance</span>
            </button>
          </div>
        </div>

        {/* Theme & Bubble Colors */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="bg-[#e3f3ff]/80 backdrop-blur-2xl border border-[#7dd3fc]/75 rounded-3xl p-6 space-y-4 shadow-[0_8px_28px_rgba(2,132,199,0.12)]">
            <h2 className="text-base font-bold text-slate-900">PK CHAT Signature Theme</h2>
            <div className="p-3.5 rounded-2xl border border-[#0284c7] bg-sky-50 text-[#0284c7] flex items-center gap-3">
              <Sun className="w-5 h-5 shrink-0" />
              <div>
                <p className="text-xs font-bold">Light-Blue Frosted Glass (Locked Permanent)</p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Ocean sky glass canvas locked across all screens for crystal clarity.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#e3f3ff]/80 backdrop-blur-2xl border border-[#7dd3fc]/75 rounded-3xl p-6 space-y-4 shadow-[0_8px_28px_rgba(2,132,199,0.12)]">
            <h2 className="text-base font-bold text-slate-900">Header &amp; Canvas Style</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setLightBrandTheme('ocean_blue');
                  updateUserSettings({ theme: 'light' });
                }}
                className={`p-3 rounded-2xl border text-left transition-colors ${
                  lightBrandTheme === 'ocean_blue'
                    ? 'border-[#0284c7] bg-sky-50 text-[#0284c7]'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#0284c7] shrink-0" />
                  <span className="text-xs font-bold">Ocean Frost</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  #0284c7 Header · Frosted Ice
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLightBrandTheme('sky_glass');
                  updateUserSettings({
                    theme: 'light',
                    bubbleColor: 'sky_glass',
                  });
                }}
                className={`p-3 rounded-2xl border text-left transition-colors ${
                  lightBrandTheme === 'sky_glass'
                    ? 'border-[#0369a1] bg-[#e0f2fe]/70 text-[#0369a1]'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#38bdf8] shrink-0" />
                  <span className="text-xs font-bold">Crystal Sky Blue</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  #38bdf8 Glow · Soft Frost
                </p>
              </button>
            </div>
          </div>

          <div className="bg-[#e3f3ff]/80 dark:bg-slate-900/85 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-[0_8px_28px_rgba(2,132,199,0.12)]">
            <h2 className="text-base font-bold">Chat Bubble Color</h2>
            <div className="flex flex-wrap gap-2.5">
              {BUBBLE_COLOR_OPTIONS.map((b) => {
                const active = (userSettings?.bubbleColor || 'sky_glass') === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => updateUserSettings({ bubbleColor: b.id })}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
                      active
                        ? 'border-[#0284c7] dark:border-white ring-2 ring-[#38bdf8]/40'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/10"
                      style={{ backgroundColor: b.hex }}
                    />
                    <span>{b.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Wallpaper Categories, Uncropped Fit Mode & Gallery Upload */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap gap-1 p-1 bg-[#cdeaff]/80 dark:bg-slate-800 border border-[#7dd3fc]/70 rounded-xl">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setWpCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${
                  wpCategory === cat
                    ? 'bg-[#e8f5ff]/95 dark:bg-slate-900 text-[#0369a1] shadow-sm'
                    : 'text-[#0c4a6e] dark:text-slate-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center p-1 bg-[#cdeaff]/80 dark:bg-slate-800 border border-[#7dd3fc]/70 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setWallpaperFitMode('contain')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  wallpaperFit === 'contain'
                    ? 'bg-[#e8f5ff]/95 dark:bg-slate-900 text-[#0284c7] dark:text-[#38bdf8] shadow-sm'
                    : 'text-[#0c4a6e] dark:text-slate-300'
                }`}
              >
                Fit Full Photo (No Crop)
              </button>
              <button
                type="button"
                onClick={() => setWallpaperFitMode('cover')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  wallpaperFit === 'cover'
                    ? 'bg-[#e8f5ff]/95 dark:bg-slate-900 text-[#0369a1] dark:text-white shadow-sm'
                    : 'text-[#0c4a6e] dark:text-slate-300'
                }`}
              >
                Fill Screen
              </button>
            </div>
            <label className="px-4 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold cursor-pointer flex items-center gap-2">
              <Upload className="w-4 h-4" />
              <span>Choose From Phone/Gallery</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleCustomWallpaperFile}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWallpapers.map((wp) => {
            const active = userSettings?.wallpaperId === wp.wallpaperId;
            return (
              <button
                key={wp.wallpaperId}
                onClick={() =>
                  updateUserSettings({
                    wallpaperId: wp.wallpaperId,
                    customWallpaperData: wp.isBuiltIn ? '' : wp.imageUrl,
                  })
                }
                className={`group relative aspect-[4/3] rounded-2xl overflow-hidden border text-left transition-all bg-[#e0f2fe]/40 dark:bg-slate-950 ${
                  active
                    ? 'border-[#0284c7] ring-2 ring-[#0284c7]'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <img
                  src={wp.imageUrl}
                  alt={wp.title}
                  className={`w-full h-full transition-transform duration-300 ${
                    wallpaperFit === 'contain'
                      ? 'object-contain object-center p-1'
                      : 'object-cover object-center group-hover:scale-105'
                  }`}
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent p-4 flex flex-col justify-end">
                  <div className="flex items-center justify-between text-white">
                    <div>
                      <p className="text-sm font-bold">{wp.title}</p>
                      <p className="text-xs capitalize opacity-80">{wp.category}</p>
                    </div>
                    {active && <Check className="w-5 h-5 text-[#38bdf8]" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Screens 19 & 20: Subscription & Payment Status
  if (activeScreen === 'subscription' || activeScreen === 'payment_status') {
    const isPaymentTab = activeScreen === 'payment_status';
    const entitlement = getSubscriptionEntitlement({
      phoneNumber: userAccount?.phoneNumber || auth.currentUser?.phoneNumber,
      subscription,
    });
    return (
      <BillingAndUserModeSection
        isPaymentTab={isPaymentTab}
        entitlement={entitlement}
        setActiveScreen={setActiveScreen}
        billingProvider={billingProvider}
        setBillingProvider={setBillingProvider}
        billingBusy={billingBusy}
        setBillingBusy={setBillingBusy}
        billingError={billingError}
        setBillingError={setBillingError}
        performSubscriptionAction={performSubscriptionAction}
        subscription={subscription}
        paymentRecords={paymentRecords}
        userUid={userProfile?.uid || auth.currentUser?.uid}
        userPhone={userAccount?.phoneNumber || auth.currentUser?.phoneNumber || undefined}
      />
    );
  }

  // Screen 21: Personal Profile Customization Screen
  if (activeScreen === 'profile') {
    const createdStr =
      userProfile?.createdAt instanceof Timestamp
        ? userProfile.createdAt.toDate().toLocaleDateString()
        : 'Active';
    const currentAvatar = sanitizeUserAvatarUrl(profileMedia?.avatarDataUrl || userProfile?.avatarUrl);
    const currentCover = profileMedia?.coverDataUrl || userProfile?.coverImageUrl || '';
    const blockedIds = profileMedia?.blockedUserIds ?? userProfile?.blockedUserIds ?? [];
    const blockCandidates = directoryProfiles.filter(
      (p) => p.uid !== userProfile?.uid && !blockedIds.includes(p.uid)
    );

    const handleSaveAllProfileFields = async () => {
      setProfileError(null);
      const profileSafety = detectExplicitSexualContent(
        `${editName}\n${editAbout}\n${editBio}\n${editStatusMsg}`
      );
      if (!profileSafety.safe) {
        setProfileError(
          profileSafety.blockedReason ||
            'Blocked by PK CHAT Explicit Content Shield: sexual or adult content is prohibited in profiles.'
        );
        return;
      }
      try {
        await Promise.all([
          saveProfileCustomization({
            fullName: editName.trim() || userProfile?.fullName || 'PK CHAT User',
            about: editAbout,
            bio: editBio,
            statusMessage: editStatusMsg,
            profileVisibility: profileVis,
            profilePhotoVisibility: photoVis,
            aboutVisibility: aboutVis,
          }),
          updateUserSettings({
            autoFestivalGreetEnabled: autoGreetEnabled,
          }),
        ]);
        setProfileSaved(true);
        window.setTimeout(() => setProfileSaved(false), 2500);
      } catch (err) {
        setProfileError(err instanceof Error ? err.message : 'Unable to save profile.');
      }
    };

    return renderSettingsShell(
      <div className="p-4 lg:p-8 max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Personal Profile &amp; PK Chat Settings
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real-time multi-device sync · Sync #{profileMedia?.syncVersion ?? 1} · Frosted World-Peace theme &amp; server-verified privacy
            </p>
          </div>
          {profileSyncLoading && (
            <span className="px-3 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/50 text-[#0284c7] dark:text-[#38bdf8] text-xs font-semibold flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Syncing across devices...</span>
            </span>
          )}
        </div>

        {(profileError || profileSyncError) && (
          <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-200">
            {profileError || profileSyncError}
          </div>
        )}

        {!dobConfirmed && (
          <div
            role="status"
            aria-label="Profile DOB Reminder"
            className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950 dark:text-amber-100"
          >
            <div className="space-y-1">
              <p className="font-bold">
                ⚠️ PK Chat நினைவூட்டல்: தயவுசெய்து உங்களுடைய பிறந்த தேதியைச் (DOB) சரிசெய்து கொள்ளுங்கள் (விருப்பத்திற்கேற்ப).
              </p>
              <p className="opacity-85">
                Confirm your Date of Birth below to personalize birthday greetings and age safety controls.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById('profile-dob-input')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#eef8ff]/90 dark:bg-slate-900 border border-amber-300 dark:border-amber-700 font-semibold text-amber-900 dark:text-amber-200"
              >
                Edit DOB
              </button>
              <button
                type="button"
                onClick={() => {
                  setDobConfirmed(true);
                  try {
                    window.localStorage.setItem('pk_user_dob_confirmed', 'true');
                  } catch {
                    // ignore
                  }
                }}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold"
              >
                Confirm DOB ✓
              </button>
            </div>
          </div>
        )}

        <div className="bg-[#e3f3ff]/80 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl overflow-hidden shadow-[0_12px_36px_rgba(2,132,199,0.14)]">
          {/* Profile Cover Banner (Light Blue WhatsApp) */}
          <div className="relative h-44 sm:h-52 bg-gradient-to-r from-[#0284c7] via-[#0369a1] to-sky-700">
            {currentCover && (
              <img
                src={currentCover}
                alt="Profile cover"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="absolute top-3 right-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPhotoEditorMode('cover')}
                className="px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/80 text-white text-xs font-semibold flex items-center gap-1.5 backdrop-blur-sm"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{currentCover ? 'Change Cover' : 'Add Cover Image'}</span>
              </button>
              {currentCover && (
                <button
                  type="button"
                  onClick={() =>
                    saveProfileCustomization({ coverDataUrl: '', coverMimeType: '' }).catch((e) =>
                      setProfileError(e instanceof Error ? e.message : 'Unable to remove cover')
                    )
                  }
                  className="px-3 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Avatar + Photo Actions overlapping Cover */}
            <div className="-mt-16 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="flex items-end gap-4">
                <div className="relative rounded-full bg-[#d8eeff] dark:bg-slate-900 border-4 border-[#e3f3ff] dark:border-slate-900 shadow-lg shrink-0">
                  <UserAvatar
                    src={currentAvatar}
                    name={userProfile?.fullName || 'PK CHAT User'}
                    size="xl"
                  />
                </div>
                <div className="pb-1">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    {userProfile?.fullName}
                  </h2>
                  {userAccount?.phoneNumber && (
                    <p className="text-xs font-mono font-semibold text-[#0284c7] dark:text-[#38bdf8]">
                      Active Number: {userAccount.phoneNumber}
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    {userProfile?.country} · {userProfile?.preferredLanguageName} · Joined {createdStr}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setQrModalTab('my_code')}
                  title="Show My PK Chat QR Code"
                  aria-label="My PK Chat QR Code"
                  className="px-3 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                >
                  <QrCode className="w-4 h-4" />
                  <span>My QR Code</span>
                </button>
                <button
                  type="button"
                  onClick={() => setQrModalTab('scan_code')}
                  title="Scan PK Chat QR Code"
                  aria-label="Scan PK Chat QR Code"
                  className="px-3 py-2 rounded-xl bg-[#eef8ff]/90 dark:bg-slate-900 border border-[#7dd3fc]/80 dark:border-slate-700 hover:border-[#0284c7] text-[#0284c7] dark:text-[#38bdf8] text-xs font-semibold flex items-center gap-1.5 shadow-xs"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Scan QR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoEditorMode('avatar')}
                  className="px-3.5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{currentAvatar ? 'Change / Crop Photo' : 'Add Profile Photo'}</span>
                </button>
                {currentAvatar && (
                  <button
                    type="button"
                    onClick={() =>
                      saveProfileCustomization({ avatarDataUrl: '', avatarMimeType: '' }).catch(
                        (e) =>
                          setProfileError(e instanceof Error ? e.message : 'Unable to remove photo')
                      )
                    }
                    className="px-3 py-2 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-600 text-xs font-semibold flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Photo</span>
                  </button>
                )}
              </div>
            </div>

            {/* Official Verified User Summary & Editable Date of Birth */}
            <div className="rounded-2xl bg-[#f0f9ff] dark:bg-slate-950 border border-[#bae6fd] dark:border-slate-800 p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-center text-xs">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-[#0369a1] dark:text-[#33b3ff]">
                  🪪 Account Type
                </p>
                <p className="font-medium text-slate-900 dark:text-white truncate">
                  {userAccount?.phoneNumber ? 'Phone Verified Account' : 'Cloud Member'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-[#0369a1] dark:text-[#33b3ff]">
                  📞 Phone
                </p>
                <p className="font-mono font-medium text-slate-900 dark:text-white truncate">
                  {userAccount?.phoneNumber || 'Not linked'}
                </p>
              </div>
              <div className="space-y-1">
                <label htmlFor="profile-dob-input" className="block text-[11px] font-semibold text-[#0369a1] dark:text-[#33b3ff]">
                  🎂 Date of Birth (DOB)
                </label>
                <input
                  id="profile-dob-input"
                  type="date"
                  value={profileDob}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => {
                    const nextDob = e.target.value;
                    setProfileDob(nextDob);
                    setDobConfirmed(true);
                    try {
                      window.localStorage.setItem('pk_user_dob', nextDob);
                      window.localStorage.setItem('pk_user_dob_confirmed', 'true');
                      const parsed = new Date(nextDob);
                      const now = new Date();
                      let age = now.getFullYear() - parsed.getFullYear();
                      const mDiff = now.getMonth() - parsed.getMonth();
                      if (mDiff < 0 || (mDiff === 0 && now.getDate() < parsed.getDate())) age -= 1;
                      window.localStorage.setItem(
                        'pk_minor_safety_mode',
                        !Number.isNaN(age) && age < 18 ? 'true' : 'false'
                      );
                      window.dispatchEvent(new CustomEvent('pkchat-dob-updated'));
                    } catch {
                      // ignore storage errors
                    }
                  }}
                  className="w-full h-9 px-2.5 rounded-lg bg-[#eef8ff]/90 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-[#0369a1] dark:text-[#33b3ff]">
                  🛡️ Account Status
                </p>
                <p className="font-bold text-[#0284c7] dark:text-[#38bdf8]">
                  Verified Official User
                </p>
              </div>
            </div>

            {/* WhatsApp-Exact Interactive Settings List */}
            <div
              aria-label="WhatsApp Settings Directory"
              className="rounded-2xl bg-[#dff1ff]/82 dark:bg-slate-950 backdrop-blur-xl border border-[#7dd3fc]/75 dark:border-slate-800 divide-y divide-[#bae6fd]/70 dark:divide-slate-800 overflow-hidden text-xs"
            >
              {[
                {
                  label: 'QR Code · Share & Scan Profile Code',
                  action: () => setQrModalTab('my_code'),
                },
                {
                  label: '🔑 Account (Profile, Country Phone, DOB & Face/Eye Recovery)',
                  action: () => setActiveScreen('app_lock'),
                },
                {
                  label: `📞 Call Ring Tone (${getRingtoneLabel(directCallPreset, 'direct_call')} Active)`,
                  action: () =>
                    document
                      .getElementById('audio-tone-settings-section')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                },
                {
                  label: `🔔 Notifications & Ringtones (${getNotificationToneLabel(directMsgPreset, 'direct_message')} Active)`,
                  action: () =>
                    document
                      .getElementById('audio-tone-settings-section')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                },
                {
                  label: '🔒 Privacy (Last seen, Profile photo, About, Status exclusion & Blocked)',
                  action: () =>
                    document
                      .getElementById('privacy-permissions-section')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                },
                {
                  label: '💬 Business Auto-Reply (ஆட்டோ-ரிப்ளை செய்தி)',
                  action: () =>
                    document
                      .getElementById('auto-reply-settings-section')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                },
                {
                  label: `⏰ My Remember Alerts (${rememberItems.filter((r) => r.status !== 'done').length} Pending)`,
                  action: () =>
                    document
                      .getElementById('remember-alerts-settings-section')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                },
                {
                  label: '🎨 Wallpaper, World Peace Theme & Bubble Color',
                  action: () => setActiveScreen('wallpaper_gallery'),
                },
                {
                  label: '💬 Chats (Dynamic Backgrounds, Bubble Color & History)',
                  action: () => setActiveScreen('wallpaper_gallery'),
                },
                {
                  label: '📊 Storage & Data (Usage, Data Saver & Security Logs)',
                  action: () => setActiveScreen('privacy_security'),
                },
                {
                  label: '❓ Help (Help Center, App Stores & Contact Us)',
                  action: () => setActiveScreen('help_support'),
                },
              ].map((row) => (
                <button
                  key={row.label}
                  type="button"
                  onClick={row.action}
                  className="w-full min-h-[44px] px-4 py-3 flex items-center justify-between text-left font-medium text-slate-800 dark:text-slate-200 hover:bg-[#e0f2fe]/60 dark:hover:bg-slate-900 transition-colors"
                >
                  <span>{row.label}</span>
                  <span className="text-[#0284c7] dark:text-[#33b3ff] text-base leading-none">›</span>
                </button>
              ))}
            </div>

            {/* Founder Attribution (Strictly English) */}
            <div className="p-4 rounded-2xl bg-[#f0f9ff] border border-[#bae6fd] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <p className="font-bold text-[#0369a1]">PK CHAT Founder Credits</p>
                <p className="text-slate-600 mt-0.5">
                  Created &amp; lovingly dedicated to global peace &amp; families by{' '}
                  <span translate="no" className="font-bold text-[#0284c7]">
                    Prashanth keransiya
                  </span>
                </p>
              </div>
              <span translate="no" className="px-3 py-1 rounded-xl bg-[#dff1ff]/90 border border-[#7dd3fc] text-[11px] font-bold text-[#0284c7]">
                Prashanth keransiya
              </span>
            </div>

            {/* Exclusive PK Chat Signature Sound & Notification Channels (Web Audio API + Device Upload) */}
            <div
              id="audio-tone-settings-section"
              className="p-4 sm:p-5 rounded-2xl bg-[#dff1ff]/82 dark:bg-slate-950/90 backdrop-blur-xl border border-[#7dd3fc]/75 dark:border-slate-800 space-y-4 text-xs shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <PhoneCall className="w-4 h-4 text-[#0284c7] dark:text-[#38bdf8]" />
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">
                      Settings · Notifications &amp; Ringtones (Unified for PK Chat &amp; PK Live Class)
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Distinctive PK CHAT continuous incoming call melodies &amp; crisp signature chimes — zero WhatsApp tones
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      isLocalPreviewActiveRef.current = false;
                      stopRingingLoop();
                      setAudioPreviewActive(null);
                      window.dispatchEvent(
                        new CustomEvent('pkchat-simulate-incoming-call', {
                          detail: {
                            callerName: 'PK Chat Signature Test',
                            callType: 'audio',
                            isGroup: false,
                          },
                        })
                      );
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-[#e0f2fe] hover:bg-[#bae6fd] border border-[#7dd3fc] text-[11px] font-bold text-[#0369a1]"
                  >
                    Test Incoming Call
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      isLocalPreviewActiveRef.current = false;
                      stopRingingLoop();
                      setAudioPreviewActive(null);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-[#eef8ff]/90 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-[#0284c7]"
                  >
                    Stop Ringtone
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={masterSoundEnabled}
                    onClick={() => {
                      const next = setMasterSoundEnabled(!masterSoundEnabled);
                      setMasterSoundEnabledState(next);
                      if (!next) {
                        isLocalPreviewActiveRef.current = false;
                        setAudioPreviewActive(null);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                      masterSoundEnabled
                        ? 'bg-[#0284c7] text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {masterSoundEnabled ? '🔊 Sounds ON' : '🔇 Sounds Muted'}
                  </button>
                </div>
              </div>

              {audioUploadError && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-[11px] text-rose-700 dark:text-rose-200 flex items-center justify-between">
                  <span>{audioUploadError}</span>
                  <button
                    type="button"
                    onClick={() => setAudioUploadError(null)}
                    className="font-bold underline ml-2"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                {(
                  [
                    {
                      channel: 'direct_message' as const,
                      title: 'Direct Message Tone',
                      selected: directMsgPreset,
                      presets: DIRECT_MESSAGE_PRESETS,
                      kind: 'message' as const,
                    },
                    {
                      channel: 'group_message' as const,
                      title: 'Group Message Tone',
                      selected: groupMsgPreset,
                      presets: GROUP_MESSAGE_PRESETS,
                      kind: 'message' as const,
                    },
                    {
                      channel: 'direct_call' as const,
                      title: '1-on-1 Call Ringtone',
                      selected: directCallPreset,
                      presets: DIRECT_CALL_PRESETS,
                      kind: 'call' as const,
                    },
                    {
                      channel: 'group_call' as const,
                      title: 'Group Call Ringtone',
                      selected: groupCallPreset,
                      presets: GROUP_CALL_PRESETS,
                      kind: 'call' as const,
                    },
                  ] as const
                ).map((cfg) => {
                  const customTrack = customAudioTracks[cfg.channel];
                  const isPreviewing = audioPreviewActive === cfg.channel;
                  return (
                    <div
                      key={cfg.channel}
                      className="p-3 rounded-2xl bg-[#dff1ff]/82 dark:bg-slate-900/70 backdrop-blur-xl border border-[#7dd3fc]/75 dark:border-slate-800 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[11px] font-bold text-[#0369a1] dark:text-[#38bdf8] flex items-center gap-1.5">
                          {cfg.kind === 'call' ? (
                            <Volume2 className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <BellRing className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>{cfg.title}</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (isPreviewing) {
                              isLocalPreviewActiveRef.current = false;
                              stopRingingLoop();
                              setAudioPreviewActive(null);
                              return;
                            }
                            if (cfg.kind === 'call') {
                              const started = playRingtonePreview(
                                cfg.selected as RingtonePresetId,
                                cfg.channel
                              );
                              isLocalPreviewActiveRef.current = started;
                              setAudioPreviewActive(started ? cfg.channel : null);
                            } else {
                              isLocalPreviewActiveRef.current = false;
                              stopRingingLoop();
                              const played = playNotificationTone(
                                cfg.selected as NotificationTonePresetId,
                                cfg.channel,
                                { allowDuringPreview: true }
                              );
                              setAudioPreviewActive(played ? cfg.channel : null);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                            isPreviewing
                              ? 'bg-rose-600 hover:bg-rose-700 text-white'
                              : 'bg-[#0284c7] hover:bg-[#0369a1] text-white'
                          }`}
                        >
                          {isPreviewing
                            ? cfg.kind === 'call'
                              ? 'Stop Loop'
                              : 'Playing...'
                            : cfg.kind === 'call'
                              ? 'Loop Preview'
                              : 'Play Chime'}
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {cfg.presets.map((preset) => {
                          const active = cfg.selected === preset.id;
                          if (preset.id === 'custom') {
                            return (
                              <div
                                key={`${cfg.channel}-custom`}
                                className={`w-full px-3 py-2 rounded-xl border transition-all space-y-1.5 ${
                                  active
                                    ? 'bg-[#e0f2fe]/60 dark:bg-slate-900 border-[#0284c7] ring-1 ring-[#0284c7]/40'
                                    : 'bg-[#eef8ff]/75 dark:bg-slate-950/60 border-dashed border-[#7dd3fc] dark:border-slate-700'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold text-slate-900 dark:text-white text-[11px]">
                                    {preset.label}
                                  </span>
                                  {active && <Check className="w-4 h-4 text-[#0284c7] shrink-0" />}
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {customTrack ? `Selected: ${customTrack.name}` : preset.subtitle}
                                </p>
                                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                  <label className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white text-[11px] font-semibold">
                                    <Upload className="w-3 h-3" />
                                    <span>{customTrack ? 'Replace Audio' : 'Choose Audio'}</span>
                                    <input
                                      type="file"
                                      accept="audio/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        handleCustomAudioUpload(cfg.channel, e.target.files?.[0]);
                                        e.currentTarget.value = '';
                                      }}
                                    />
                                  </label>
                                  {customTrack && (
                                    <button
                                      type="button"
                                      onClick={() => clearCustomAudioTrack(cfg.channel)}
                                      className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:border-rose-400 hover:text-rose-600"
                                    >
                                      Reset Default
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          }

                          return (
                            <button
                              key={`${cfg.channel}-${preset.id}`}
                              type="button"
                              onClick={() => {
                                if (cfg.kind === 'call') {
                                  const saved = setSelectedRingtonePreset(
                                    preset.id as RingtonePresetId,
                                    cfg.channel
                                  );
                                  if (cfg.channel === 'direct_call') setDirectCallPreset(saved);
                                  else setGroupCallPreset(saved);
                                  if (saved === 'silent') {
                                    isLocalPreviewActiveRef.current = false;
                                    stopRingingLoop();
                                    setAudioPreviewActive(null);
                                  } else {
                                    const started = playRingtonePreview(saved, cfg.channel);
                                    isLocalPreviewActiveRef.current = started;
                                    setAudioPreviewActive(started ? cfg.channel : null);
                                  }
                                } else {
                                  const saved = setSelectedNotificationTonePreset(
                                    preset.id as NotificationTonePresetId,
                                    cfg.channel
                                  );
                                  if (cfg.channel === 'direct_message') setDirectMsgPreset(saved);
                                  else setGroupMsgPreset(saved);
                                  isLocalPreviewActiveRef.current = false;
                                  stopRingingLoop();
                                  if (saved === 'silent') {
                                    setAudioPreviewActive(null);
                                  } else {
                                    const played = playNotificationTone(saved, cfg.channel, {
                                      allowDuringPreview: true,
                                    });
                                    setAudioPreviewActive(played ? cfg.channel : null);
                                  }
                                }
                              }}
                              className={`w-full min-h-[42px] px-3 py-2 rounded-xl border text-left transition-all ${
                                active
                                  ? 'bg-[#e0f2fe]/50 dark:bg-slate-900 border-[#0284c7] ring-1 ring-[#0284c7]/40'
                                  : 'bg-[#eef8ff]/75 dark:bg-slate-950/60 border-[#7dd3fc]/70 dark:border-slate-800 hover:border-[#0284c7]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-slate-900 dark:text-white text-[11px]">
                                  {preset.label}
                                </span>
                                {active && <Check className="w-4 h-4 text-[#0284c7] shrink-0" />}
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {preset.subtitle}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 p-3 rounded-xl bg-[#dff1ff]/75 dark:bg-slate-900/80 border border-[#7dd3fc]/70 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold text-[#0369a1] dark:text-[#38bdf8]">
                    PK Chat Signature Instrumental Marimba Engine (2-Phrase Motif)
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Pure warm marimba ringtone cadence (2100ms loop) and crisp message chime.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      stopRingingLoop();
                      pkSignatureAudio.startIncomingRingtone();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white text-[11px] font-semibold transition-colors"
                  >
                    Preview Marimba Ring
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopRingingLoop();
                      pkSignatureAudio.playNotificationTone();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#e3f3ff] hover:bg-[#cdeaff] text-[#0369a1] border border-[#7dd3fc]/80 text-[11px] font-semibold transition-colors"
                  >
                    Marimba Chime
                  </button>
                  <button
                    type="button"
                    onClick={() => stopRingingLoop()}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold transition-colors"
                  >
                    Stop
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Monogram Portrait Presets */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                Or pick a quick portrait style:
              </span>
              {AVATAR_MONOGRAM_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  disabled={profileSyncLoading}
                  onClick={() => {
                    const dataUrl = renderMonogramAvatarDataUrl(
                      userProfile?.fullName || 'PK',
                      theme
                    );
                    if (!dataUrl) return;
                    saveProfileCustomization({
                      avatarDataUrl: dataUrl,
                      avatarMimeType: 'image/jpeg',
                    }).catch((e) =>
                      setProfileError(e instanceof Error ? e.message : 'Unable to apply style')
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-[#7dd3fc]/70 dark:border-slate-700 hover:border-[#0284c7] bg-[#eef8ff]/85 dark:bg-slate-950 font-medium"
                >
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ background: `linear-gradient(135deg, ${theme.bgStart}, ${theme.bgEnd})` }}
                  />
                  <span>{theme.label}</span>
                </button>
              ))}
            </div>

            {/* Display Name, Country, Status & About */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Display Name</label>
                <input
                  type="text"
                  maxLength={100}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Country</label>
                <select
                  value={userProfile?.countryCode || 'GB'}
                  onChange={(e) => {
                    const c = COUNTRIES.find((x) => x.code === e.target.value);
                    if (c) updateProfile({ country: c.name, countryCode: c.code });
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-sm"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Personal Status Line ({editStatusMsg.length}/100)
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={editStatusMsg}
                  onChange={(e) => setEditStatusMsg(e.target.value)}
                  placeholder="e.g. Available on PK CHAT"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-sm"
                />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {STATUS_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setEditStatusMsg(preset.slice(0, 100))}
                      className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-sky-950/40 text-[10px] text-slate-600 dark:text-slate-300"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  About Tagline ({editAbout.length}/140)
                </label>
                <input
                  type="text"
                  maxLength={140}
                  value={editAbout}
                  onChange={(e) => setEditAbout(e.target.value)}
                  placeholder="Hey there! I am using PK CHAT."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Personal Biography (Max 300 characters · {editBio.length}/300)
              </label>
              <textarea
                rows={3}
                maxLength={300}
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder="Share your languages, role, city, or personal note..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-sm"
              />
            </div>

            {/* Granular Backend-Enforced Privacy Controls */}
            <div
              id="privacy-permissions-section"
              className="p-4 rounded-2xl bg-[#dff1ff]/80 dark:bg-slate-950 backdrop-blur-xl border border-[#7dd3fc]/75 dark:border-slate-800 space-y-3"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#0284c7] dark:text-[#38bdf8]" />
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  Profile Visibility &amp; Privacy Permissions (Enforced by Backend Firestore Rules)
                </p>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Who can see my Profile
                  </label>
                  <select
                    value={profileVis}
                    onChange={(e) => setProfileVis(e.target.value as PrivacyVisibilityOption)}
                    className="w-full px-3 py-2 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800"
                  >
                    <option value="everyone">Everyone</option>
                    <option value="contacts">My Contacts Only</option>
                    <option value="nobody">Nobody (Private)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Who can view Profile &amp; Cover Photo
                  </label>
                  <select
                    value={photoVis}
                    onChange={(e) => setPhotoVis(e.target.value as PrivacyVisibilityOption)}
                    className="w-full px-3 py-2 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800"
                  >
                    <option value="everyone">Everyone</option>
                    <option value="contacts">My Contacts Only</option>
                    <option value="nobody">Nobody (Hidden)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Who can view About, Bio &amp; Status
                  </label>
                  <select
                    value={aboutVis}
                    onChange={(e) => setAboutVis(e.target.value as PrivacyVisibilityOption)}
                    className="w-full px-3 py-2 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800"
                  >
                    <option value="everyone">Everyone</option>
                    <option value="contacts">My Contacts Only</option>
                    <option value="nobody">Nobody (Hidden)</option>
                  </select>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3 pt-1 text-xs">
                <label className="flex items-center justify-between p-3 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800 cursor-pointer">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    Last Seen &amp; Online Visibility
                  </span>
                  <input
                    type="checkbox"
                    checked={userSettings?.lastSeenVisible ?? true}
                    onChange={(e) => updateUserSettings({ lastSeenVisible: e.target.checked })}
                    className="rounded accent-[#0284c7]"
                  />
                </label>
                <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      Status (Exclude specific people)
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      My contacts except / Favorites VIP
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveScreen('status_updates');
                      window.setTimeout(
                        () => window.dispatchEvent(new CustomEvent('pkchat-open-status-privacy')),
                        60
                      );
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#0077B6] hover:bg-[#0284c7] text-white text-[11px] font-semibold shrink-0"
                  >
                    Manage
                  </button>
                </div>
              </div>

              {/* PK Chat Do Not Disturb (DND), Overnight Until 7:00 AM & Intentional Data Off */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900/90 border border-[#7dd3fc]/75 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">
                          PK Chat Do Not Disturb (DND)
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Silences regular chat &amp; call tones (1s SOS Urgent Siren always rings through).
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={pkDndEnabled}
                        onClick={() => {
                          const next = setPkChatDndEnabled(!pkDndEnabled);
                          setPkDndEnabledState(next);
                          setPkDndUntilMsState(getPkChatDndUntilMs());
                        }}
                        className={`px-3 py-1.5 rounded-lg font-bold shrink-0 ${
                          pkDndEnabled
                            ? 'bg-indigo-600 text-white'
                            : 'bg-sky-50 dark:bg-slate-800 text-[#0284c7] dark:text-slate-300 border border-[#bae6fd] dark:border-slate-700'
                        }`}
                      >
                        {pkDndEnabled ? 'DND ON' : 'DND OFF'}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-[#0284c7]" />
                        {pkDndUntilMs && pkDndUntilMs > Date.now()
                          ? `Overnight active until ${new Date(pkDndUntilMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : 'Sleep overnight silence'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const until = setPkChatDndOvernight(7);
                          setPkDndEnabledState(true);
                          setPkDndUntilMsState(until);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white text-[11px] font-semibold"
                      >
                        🌙 Until 7:00 AM
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900/90 border border-[#7dd3fc]/75 dark:border-slate-800">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">
                        Intentional Mobile Data Off
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Shows "Offline" to callers &amp; suppresses SMS/call interruptions. ({weatherSnapshot.icon} {weatherSnapshot.tempC}°C)
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={intentionalDataOff}
                      onClick={() => void toggleIntentionalDataOff(!intentionalDataOff)}
                      className={`px-3 py-1.5 rounded-lg font-bold shrink-0 ${
                        intentionalDataOff
                          ? 'bg-amber-600 text-white'
                          : 'bg-[#0284c7] hover:bg-[#0369a1] text-white'
                      }`}
                    >
                      {intentionalDataOff ? 'Data Off' : 'Data Active'}
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">
                      Data Package Mode &amp; Offline SIM Fallback
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Optimize for Social/Low-Data packages or use standard SIM SMS &amp; cellular dialer when internet is unavailable.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    {(
                      [
                        { id: 'standard', label: 'Standard' },
                        { id: 'social_saver', label: 'Social Saver' },
                        { id: 'zero_data_continuity', label: 'Offline SIM Fallback' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setDataPackageMode(m.id);
                          setDataPackageModeState(m.id);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${
                          dataPackageMode === m.id
                            ? 'bg-[#0284c7] border-[#0284c7] text-white'
                            : 'bg-[#dff1ff]/80 dark:bg-slate-950 border-[#7dd3fc]/70 dark:border-slate-800 text-[#0c4a6e] dark:text-slate-300'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Blocked Users Management */}
            <div className="p-4 rounded-2xl bg-[#dff1ff]/80 dark:bg-slate-950 backdrop-blur-xl border border-[#7dd3fc]/75 dark:border-slate-800 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Ban className="w-4 h-4 text-rose-600" />
                  <span>Blocked Users ({blockedIds.length})</span>
                </p>
                <span className="text-[11px] text-slate-500">
                  Blocked users cannot read your profile photos, bio, or send requests.
                </span>
              </div>

              {blockCandidates.length > 0 && (
                <div className="flex gap-2">
                  <select
                    value={blockCandidateUid}
                    onChange={(e) => setBlockCandidateUid(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800"
                  >
                    <option value="">Select a member to block...</option>
                    {blockCandidates.map((m) => (
                      <option key={m.uid} value={m.uid}>
                        {m.fullName} ({m.country})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!blockCandidateUid}
                    onClick={async () => {
                      const target = blockCandidates.find((c) => c.uid === blockCandidateUid);
                      if (!blockCandidateUid) return;
                      await blockUserByUid(blockCandidateUid, target?.fullName);
                      setBlockCandidateUid('');
                    }}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold"
                  >
                    Block User
                  </button>
                </div>
              )}

              {blockedIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {blockedIds.map((bUid) => {
                    const prof = directoryProfiles.find((p) => p.uid === bUid);
                    return (
                      <div
                        key={bUid}
                        className="px-3 py-1.5 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900 border border-rose-200 dark:border-rose-900 flex items-center gap-2"
                      >
                        <span>{prof?.fullName || bUid}</span>
                        <button
                          type="button"
                          onClick={() => unblockUserByUid(bUid)}
                          className="text-[#0284c7] dark:text-[#38bdf8] font-semibold hover:underline"
                        >
                          Unblock
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* My Remember Alerts Section */}
            <div
              id="remember-alerts-settings-section"
              className="p-4 rounded-2xl bg-[#f0f9ff]/90 dark:bg-slate-950/90 border border-[#bae6fd] dark:border-slate-800 space-y-3 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BellPlus className="w-4 h-4 text-[#0284c7] dark:text-[#38bdf8]" />
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">
                      My Remember Alerts ({rememberItems.filter((r) => r.status !== 'done').length} Active)
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Quick message, call, PK Live Class &amp; personal reminders with 10m snooze support.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent('pkchat-open-remember', {
                        detail: { category: 'task', title: 'Personal Reminder' },
                      })
                    )
                  }
                  className="px-3 py-1.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-[11px] font-bold flex items-center gap-1"
                >
                  <BellPlus className="w-3.5 h-3.5" />
                  <span>+ New Remember</span>
                </button>
              </div>
              {rememberItems.length === 0 ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 py-2">
                  No Remember alerts yet. Tap "+ New Remember" or tap Remember on any chat message, call, or PK Live Class.
                </p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {rememberItems.map((rem) => {
                    const isDone = rem.status === 'done';
                    return (
                      <div
                        key={rem.reminderId}
                        className={`p-3 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900 border flex flex-wrap items-center justify-between gap-2 ${
                          isDone
                            ? 'border-[#7dd3fc]/50 dark:border-slate-800 opacity-60'
                            : 'border-[#7dd3fc] dark:border-sky-800'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900 dark:text-white truncate">
                            {rem.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {rem.category.toUpperCase()} · {new Date(rem.remindAtMs).toLocaleString()}
                            {rem.note ? ` · ${rem.note}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!isDone && (
                            <>
                              <button
                                type="button"
                                onClick={() => snoozeReminder(rem.reminderId, 10)}
                                className="px-2 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/60 border border-[#bae6fd] dark:border-sky-800 text-[#0284c7] dark:text-[#38bdf8] text-[10px] font-bold"
                              >
                                +10m
                              </button>
                              <button
                                type="button"
                                onClick={() => markReminderDone(rem.reminderId)}
                                className="px-2 py-1 rounded-lg bg-[#0284c7] text-white text-[10px] font-bold"
                              >
                                Done
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteReminder(rem.reminderId)}
                            className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                            aria-label="Delete reminder"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-[#dff1ff]/80 dark:bg-slate-950 border border-[#7dd3fc]/75 dark:border-slate-800 text-xs space-y-1">
              <p className="font-semibold">Isolated Account Identity (Private PII)</p>
              <p className="font-mono text-slate-500">
                UID: {userProfile?.uid} · Phone: {userAccount?.phoneNumber || 'Not linked'}
              </p>
              <p className="font-mono text-[#0284c7] dark:text-[#38bdf8]">
                E2EE Key Fingerprint: {e2eeFingerprint || 'Generating...'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#dff1ff]/80 dark:bg-slate-950 border border-[#7dd3fc]/75 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Mobile Phone Number ({userAccount?.phoneNumber ? `Saved: ${userAccount.phoneNumber}` : 'Not saved yet'})
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Save or update your mobile phone number securely in your PK Chat profile (no SMS OTP required). Duplicate numbers registered by other accounts are blocked automatically.
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={linkDialCode}
                  onChange={(e) => setLinkDialCode(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800 text-xs font-mono"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.dialCode}>
                      {c.flag} {c.dialCode}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  inputMode="tel"
                  value={linkPhoneInput}
                  onChange={(e) => setLinkPhoneInput(e.target.value)}
                  placeholder="Enter or update mobile number (e.g. 071 786 0693)"
                  className="flex-1 px-3.5 py-2 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800 text-xs font-mono"
                />
                <button
                  type="button"
                  disabled={discoveryBusy || !linkPhoneInput.trim()}
                  onClick={async () => {
                    setDiscoveryBusy(true);
                    setDiscoveryMsg(null);
                    try {
                      await linkPhoneForDiscovery(
                        linkPhoneInput,
                        linkAllowDiscovery,
                        linkDialCode
                      );
                      setDiscoveryMsg({
                        type: 'ok',
                        text: userAccount?.phoneNumber
                          ? 'Mobile phone number updated securely on your PK Chat profile.'
                          : 'Mobile phone number saved securely to your PK Chat profile.',
                      });
                    } catch (err) {
                      setDiscoveryMsg({
                        type: 'err',
                        text: err instanceof Error ? err.message : 'Unable to save phone number.',
                      });
                    } finally {
                      setDiscoveryBusy(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap"
                >
                  {discoveryBusy ? 'Saving...' : userAccount?.phoneNumber ? 'Update Phone' : 'Save Phone'}
                </button>
                {userAccount?.phoneDiscoveryEnabled && (
                  <button
                    type="button"
                    disabled={discoveryBusy}
                    onClick={async () => {
                      setDiscoveryBusy(true);
                      setDiscoveryMsg(null);
                      try {
                        await linkPhoneForDiscovery(
                          linkPhoneInput || userAccount?.phoneNumber || '',
                          false,
                          linkDialCode
                        );
                        setLinkAllowDiscovery(false);
                        setDiscoveryMsg({
                          type: 'ok',
                          text: 'Contact discovery turned off. Your phone number remains saved privately on your profile.',
                        });
                      } catch (err) {
                        setDiscoveryMsg({
                          type: 'err',
                          text: err instanceof Error ? err.message : 'Unable to update discovery preference.',
                        });
                      } finally {
                        setDiscoveryBusy(false);
                      }
                    }}
                    className="px-4 py-2 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-600 text-xs font-semibold whitespace-nowrap"
                  >
                    Hide Discovery
                  </button>
                )}
              </div>
              <label className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={linkAllowDiscovery}
                  onChange={(e) => setLinkAllowDiscovery(e.target.checked)}
                  className="mt-0.5 rounded accent-[#0284c7]"
                />
                <span>
                  Allow PK Chat contacts searching my phone number (via encrypted SHA-256 hash) to find me
                </span>
              </label>
              {discoveryMsg && (
                <p
                  className={`text-xs font-medium ${
                    discoveryMsg.type === 'err'
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-[#0284c7] dark:text-[#38bdf8]'
                  }`}
                >
                  {discoveryMsg.text}
                </p>
              )}
            </div>

            {/* WhatsApp Business-Style Custom Away Auto-Reply Settings */}
            <div
              id="auto-reply-settings-section"
              className="p-4 rounded-2xl bg-[#f0f9ff] dark:bg-slate-950 border border-[#bae6fd] dark:border-slate-800 space-y-3 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-[#0369a1] dark:text-white flex items-center gap-1.5">
                  <span>💬</span>
                  <span>வாட்ஸ்அப் பிசினஸ் பாணி ஆட்டோ-ரிப்ளை (Custom Away Auto-Reply)</span>
                </p>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    autoReplyEnabled
                      ? 'bg-sky-100 dark:bg-sky-950/60 text-[#0284c7] dark:text-[#38bdf8]'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {autoReplyEnabled ? 'Active' : 'Paused'}
                </span>
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoReplyEnabled}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setAutoReplyEnabled(next);
                    handleSaveAutoReplySettings(next, autoReplyMsg);
                  }}
                  className="rounded accent-[#0284c7]"
                />
                <span>
                  Enable Auto-Reply (தனிப்பட்ட ஆட்டோ-ரிப்ளை செய்தியை இயக்கு)
                </span>
              </label>

              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Custom Away Message (பயனர் இல்லாத நேரத்தில் தானாகச் செல்லும் பதில்)
                </label>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={autoReplyMsg}
                  onChange={(e) => setAutoReplyMsg(e.target.value)}
                  placeholder="உங்களது ஆட்டோ-ரிப்ளை செய்தியை உள்ளிடவும்..."
                  className="w-full px-3.5 py-2 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveAutoReplySettings(autoReplyEnabled, autoReplyMsg)}
                  className="px-4 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold shadow-xs"
                >
                  💾 Save Auto-Reply (ஆட்டோ-ரிப்ளை சேமி)
                </button>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Works automatically on incoming messages in Chats
                </span>
              </div>

              {autoReplyNotice && (
                <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/50 border border-[#bae6fd] dark:border-sky-800 text-xs text-[#0369a1] dark:text-sky-200 font-medium">
                  {autoReplyNotice}
                </div>
              )}
            </div>

            {/* Triple Emergency Contacts & Cascade Setup with PK CHAT Verification */}
            <div className="p-4 rounded-2xl bg-[#dff1ff]/80 dark:bg-slate-950 border border-rose-200 dark:border-rose-900/60 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                  <p className="font-bold text-slate-900 dark:text-white">
                    🚨 3 அவசரத் தொடர்புகள் அமைப்பு (Triple Emergency Contacts &amp; Cascade)
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 text-[10px] font-bold">
                  {emergencyContacts.length} Saved in Firestore
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                நீங்கள் கொடுக்கும் 3 எண்களையும் PK CHAT கோப்பகத்தில் (phone_directory) சரிபார்த்து, செயலிப் பயனர்களுக்கு அனுமதி கோரிக்கையும் ஆஃப்லைன் SMS காப்புப் பாதுகாப்பும் இணைக்கப்படும்.
              </p>

              <div className="grid sm:grid-cols-3 gap-2.5">
                {tripleSlots.map((slot, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800 space-y-1.5"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Emergency Contact {idx + 1}
                    </p>
                    <input
                      type="text"
                      value={slot.name}
                      onChange={(e) =>
                        setTripleSlots((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, name: e.target.value } : item))
                        )
                      }
                      placeholder="Name (e.g. Kumar)"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#dff1ff]/80 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-xs"
                    />
                    <input
                      type="tel"
                      value={slot.phone}
                      onChange={(e) =>
                        setTripleSlots((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, phone: e.target.value } : item))
                        )
                      }
                      placeholder={`${selectedCountry.dialCode || '+94'} 7X XXX XXXX`}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#dff1ff]/80 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-xs font-mono"
                    />
                  </div>
                ))}
              </div>

              {tripleErrorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200">
                  {tripleErrorMsg}
                </div>
              )}

              {tripleStatusLines.length > 0 && (
                <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/50 border border-[#bae6fd] dark:border-sky-800 text-[11px] text-[#0369a1] dark:text-sky-200 space-y-1">
                  {tripleStatusLines.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={tripleVerifyBusy}
                  onClick={async () => {
                    setTripleErrorMsg(null);
                    setTripleStatusLines([]);
                    const incomplete = tripleSlots.some(
                      (s) => !s.name.trim() || s.phone.replace(/\D/g, '').length < 8
                    );
                    if (incomplete) {
                      setTripleErrorMsg(
                        '⚠️ தயவுசெய்து 3 அவசரத் தொடர்புகளின் பெயரையும் செல்லுபடியாகும் தொலைபேசி எண்களையும் உள்ளிடவும்.'
                      );
                      return;
                    }
                    setTripleVerifyBusy(true);
                    try {
                      const statuses: string[] = [];
                      for (let idx = 0; idx < tripleSlots.length; idx++) {
                        const slot = tripleSlots[idx];
                        const match = await lookupUserByPhone(
                          slot.phone.trim(),
                          selectedCountry.dialCode || '+94'
                        );
                        const normalized = slot.phone.trim();
                        const alreadySaved = emergencyContacts.some(
                          (ec) => ec.phone.replace(/\s+/g, '') === normalized.replace(/\s+/g, '')
                        );
                        if (!alreadySaved) {
                          await addEmergencyContact({
                            name: slot.name.trim(),
                            phone: normalized,
                            relationship: `Cascade Priority ${idx + 1}`,
                            countryCode: selectedCountry.code,
                            notifyOnSos: true,
                          });
                        }
                        if (match) {
                          const alreadyContact = contacts.some((c) => c.contactUid === match.userId);
                          if (!alreadyContact && match.userId !== userProfile?.uid) {
                            await sendContactRequest(match).catch(() => {});
                          }
                          statuses.push(
                            `✔ Contact ${idx + 1} (${slot.name.trim()}): Registered PK CHAT user (${match.fullName}) — Cascade + permission linked.`
                          );
                        } else {
                          statuses.push(
                            `📱 Contact ${idx + 1} (${slot.name.trim()}): Saved in Firestore with Offline SIM SMS Cascade Fallback (not discoverable in phone directory).`
                          );
                        }
                      }
                      setTripleStatusLines(statuses);
                    } catch (err) {
                      setTripleErrorMsg(
                        err instanceof Error ? err.message : 'Unable to verify and save emergency contacts.'
                      );
                    } finally {
                      setTripleVerifyBusy(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-white text-xs font-bold"
                >
                  {tripleVerifyBusy
                    ? 'Verifying PK CHAT Directory...'
                    : 'சரிபார்த்துச் சேமி (Verify & Save 3 Contacts)'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveScreen('sos_emergency')}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                >
                  Open SOS Contacts Manager
                </button>
              </div>
            </div>

            {/* Cyber Security Shield Card */}
            <div className="p-4 rounded-2xl bg-sky-50/70 dark:bg-slate-950 border border-[#bae6fd] dark:border-sky-900/60 space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#0284c7] shrink-0" />
                  <p className="font-bold text-slate-900 dark:text-white">
                    🛡️ Cyber Security Shield
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveScreen('privacy_security')}
                  className="px-2.5 py-1 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white text-[11px] font-semibold"
                >
                  Open Security Console
                </button>
              </div>
              <div className="grid sm:grid-cols-3 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                <div className="p-2.5 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800">
                  <p className="font-bold text-[#0284c7] dark:text-[#38bdf8]">Cyber Shield Status</p>
                  <p className="mt-0.5">Active · 10-Min Tamper Lockout &amp; XSS Script Neutralizer.</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800">
                  <p className="font-bold text-[#0284c7] dark:text-[#38bdf8]">Encrypted Delivery</p>
                  <p className="mt-0.5">Direct HTTPS / TLS 1.3 &amp; Cloud Routing Active worldwide.</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#eef8ff]/88 dark:bg-slate-900 border border-[#7dd3fc]/75 dark:border-slate-800">
                  <p className="font-bold text-[#0284c7] dark:text-[#38bdf8]">Anti-Malware Sandbox</p>
                  <p className="mt-0.5">Automatic payload &amp; attachment scanning blocks risky scripts/executables.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={profileSyncLoading}
                onClick={handleSaveAllProfileFields}
                className="px-6 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-white text-sm font-semibold"
              >
                {profileSaved
                  ? 'Profile & Privacy Synced ✓'
                  : profileSyncLoading
                    ? 'Saving & Syncing...'
                    : 'Save Profile & Privacy'}
              </button>
              <button
                type="button"
                onClick={logoutUser}
                className="px-4 py-2.5 rounded-xl border border-rose-300 dark:border-rose-900 text-rose-600 text-sm font-semibold flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Secure Sign Out</span>
              </button>
            </div>
          </div>
        </div>

        <ProfileImageEditorModal
          open={photoEditorMode !== null}
          mode={photoEditorMode || 'avatar'}
          initialImageUrl={photoEditorMode === 'cover' ? currentCover : currentAvatar}
          onClose={() => setPhotoEditorMode(null)}
          onSaveComplete={async (res) => {
            if (photoEditorMode === 'cover') {
              await saveProfileCustomization({
                coverDataUrl: res.dataUrl,
                coverMimeType: res.mimeType,
              });
            } else {
              await saveProfileCustomization({
                avatarDataUrl: res.dataUrl,
                avatarMimeType: res.mimeType,
              });
            }
          }}
        />

        <QrCodeModal
          open={qrModalTab !== null}
          initialTab={qrModalTab || 'my_code'}
          onClose={() => setQrModalTab(null)}
        />
      </div>
    );
  }

  // Screen 22: Privacy, Storage & Security Settings
  if (activeScreen === 'privacy_security') {
    void storageStatsTick;
    let cachedBytes = 0;
    let cachedKeysCount = 0;
    try {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        cachedKeysCount += 1;
        cachedBytes += key.length + (window.localStorage.getItem(key)?.length || 0);
      }
    } catch {
      // ignore storage inspection restrictions
    }
    const cachedKb = Math.max(1, Math.round((cachedBytes * 2) / 1024));

    return (
      <div className="p-4 lg:p-8 space-y-6">
        <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
          <h1 className="text-2xl font-bold">Storage &amp; Data · Privacy &amp; Cybersecurity</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Manage Storage &amp; Data usage, Data Saver mode, zero-trust Firestore rules, E2EE private chats, and trusted devices.
          </p>
        </div>

        {/* WhatsApp-Style Storage & Data Usage Card */}
        <div className="bg-[#e3f3ff]/80 backdrop-blur-2xl border border-[#7dd3fc]/75 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[0_8px_28px_rgba(2,132,199,0.12)]">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900">Storage &amp; Data Manager</h2>
            <p className="text-xs text-slate-600">
              Cached Local Storage: <strong className="font-mono text-[#0284c7]">{cachedKb} KB</strong> across{' '}
              <strong>{cachedKeysCount}</strong> entries · Active Network Package:{' '}
              <strong className="capitalize">{dataPackageMode.replace(/_/g, ' ')}</strong>
            </p>
            {storageClearMessage && (
              <p className="text-xs font-semibold text-[#0284c7]">{storageClearMessage}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              aria-label="Data Saver Package Mode"
              value={dataPackageMode}
              onChange={(e) => {
                const next = e.target.value as DataPackageMode;
                setDataPackageModeState(next);
                setDataPackageMode(next);
              }}
              className="px-3 py-2 rounded-xl bg-[#eef8ff]/90 border border-[#7dd3fc]/75 text-xs font-semibold text-slate-900"
            >
              <option value="standard">Standard Media Quality</option>
              <option value="social_saver">Low-Data Saver Mode</option>
              <option value="zero_data_continuity">Text &amp; SIM Continuity Priority</option>
            </select>
            <button
              type="button"
              onClick={() => {
                try {
                  window.localStorage.removeItem('pk_offline_outbox_v1');
                  setStorageStatsTick((v) => v + 1);
                  setStorageClearMessage('Cleared cached offline outbox queue & temporary drafts safely.');
                } catch {
                  setStorageClearMessage('Unable to clear local cache.');
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Cached Drafts</span>
            </button>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs text-blue-900 dark:text-blue-200 space-y-1.5">
          <p>
            <strong>Encrypted Cloud Routing &amp; Cyber Shield:</strong> PK CHAT operates over direct HTTPS / TLS 1.3 channels with automatic Anti-Malware payload sanitization, executable attachment quarantine, strict attribute-based Firestore rules, rate limiting, and Web Crypto ECDH/AES-GCM encryption.
          </p>
          <p className="opacity-85">
            No internet system is 100% immune to cyberattacks—keep your device locked and review trusted devices regularly.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-[0_8px_28px_rgba(2,132,199,0.12)]">
            <h2 className="text-base font-bold">Privacy Controls</h2>
            <label className="flex items-center justify-between p-3 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 cursor-pointer text-sm">
              <span>Show Online &amp; Last-Seen Status</span>
              <input
                type="checkbox"
                checked={userSettings?.lastSeenVisible ?? true}
                onChange={(e) => updateUserSettings({ lastSeenVisible: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between p-3 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 cursor-pointer text-sm">
              <span>Send Read Receipts</span>
              <input
                type="checkbox"
                checked={userSettings?.readReceipts ?? true}
                onChange={(e) => updateUserSettings({ readReceipts: e.target.checked })}
              />
            </label>
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-sm">
              <div>
                <p className="font-medium">Discoverable by Phone Number</p>
                <p className="text-xs text-slate-500">
                  {userAccount?.phoneDiscoveryEnabled
                    ? 'Active (Encrypted SHA-256 hash)'
                    : 'Cancelled / Hidden'}
                </p>
              </div>
              {userAccount?.phoneDiscoveryEnabled ? (
                <button
                  type="button"
                  disabled={discoveryBusy}
                  onClick={async () => {
                    setPrivacyError(null);
                    setDiscoveryBusy(true);
                    try {
                      await linkPhoneForDiscovery(userAccount?.phoneNumber || '', false, linkDialCode);
                    } catch (err) {
                      setPrivacyError(
                        err instanceof Error ? err.message : 'Unable to cancel phone discovery.'
                      );
                    } finally {
                      setDiscoveryBusy(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-600 text-xs font-semibold"
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveScreen('profile')}
                  className="px-3 py-1.5 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold"
                >
                  Set in Profile
                </button>
              )}
            </div>
            {privacyError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{privacyError}</p>
            )}

            <h3 className="text-sm font-bold pt-2">Trusted Devices ({userDevices.length})</h3>
            <div className="space-y-2">
              {userDevices.map((d) => (
                <div
                  key={d.deviceId}
                  className="p-3 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-semibold">
                      {d.deviceName}{' '}
                      {d.deviceId === currentDeviceId ? '(Current Device)' : ''}
                    </p>
                    <p className="font-mono text-slate-500">{d.deviceId}</p>
                  </div>
                  <button
                    onClick={() => revokeDevice(d.deviceId)}
                    className="text-rose-600 font-semibold hover:underline"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold flex items-center gap-1.5 text-slate-900 dark:text-white">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  <span>PK CHAT Security Shield (10-Min Lockout)</span>
                </h3>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-950/60 text-[#0284c7] dark:text-[#38bdf8]">
                  Active
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                அனுமதிக்கப்படாத ஊடுருவல் அல்லது ஆய்வு முயற்சி கண்டறியப்பட்டால், செயலி உடனடியாக 10 நிமிடத்திற்கு இடைநிறுத்தப்பட்டு தானியங்கி பாதுகாப்பு எச்சரிக்கை அனுப்பப்படும்.
              </p>
              <label className="flex items-center justify-between p-3 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 cursor-pointer text-xs">
                <span>Real-Time Anti-Debugging Resize Guard (DevTools Inspection)</span>
                <input
                  type="checkbox"
                  checked={antiDebugGuard}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAntiDebugGuard(checked);
                    securityShield.setAntiDebugEnabled(checked);
                  }}
                />
              </label>
              <button
                type="button"
                disabled={shieldBusy}
                onClick={async () => {
                  setShieldBusy(true);
                  const reason =
                    'அனுமதிக்கப்படாத ஊடுருவல் அல்லது ஆய்வு முயற்சி கண்டறியப்பட்டது';
                  try {
                    await securityShield.triggerSecurityLockdown(reason, {
                      onDispatchAlert: async (alertMessage, lockReason) => {
                        const uid = userProfile?.uid;
                        if (uid) {
                          const notifId = `sec_${Date.now()}`;
                          await setDoc(doc(db, 'notifications', notifId), {
                            userId: uid,
                            category: 'security',
                            title: 'PK Chat பாதுகாப்பு எச்சரிக்கை (10m Shield)',
                            body: alertMessage.slice(0, 295),
                            read: false,
                            createdAt: serverTimestamp(),
                          });
                          await logSecurityEvent(
                            'SECURITY_SHIELD_LOCKDOWN',
                            'critical',
                            `10-minute Security Shield activated: ${lockReason}`
                          );
                        }
                      },
                    });
                  } finally {
                    setShieldBusy(false);
                  }
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>
                  {shieldBusy
                    ? 'Activating 10-Min Shield...'
                    : 'Activate 10-Minute Security Shield Lockout'}
                </span>
              </button>
            </div>
          </div>

          <div className="bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-[0_8px_28px_rgba(2,132,199,0.12)]">
            <h2 className="text-base font-bold">Account Security Audit Log</h2>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {securityLogs.length === 0 ? (
                <p className="text-slate-500 py-4">No security events logged yet.</p>
              ) : (
                securityLogs.map((log) => (
                  <div key={log.id} className="py-2.5">
                    <p className="font-semibold">
                      {log.eventType} · {log.severity.toUpperCase()}
                    </p>
                    <p className="text-slate-500 mt-0.5">{log.detail}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Screen 23: App Lock Settings
  if (activeScreen === 'app_lock') {
    return (
      <div className="p-4 lg:p-8 max-w-xl space-y-6">
        <h1 className="text-2xl font-bold">App Lock &amp; Biometrics</h1>
        <div className="bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl p-6 space-y-5 shadow-[0_8px_28px_rgba(2,132,199,0.12)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">PIN Lock Status</p>
              <p className="text-xs text-slate-500">
                {userSettings?.pinLockEnabled ? 'Enabled (SHA-256 salted hash)' : 'Disabled'}
              </p>
            </div>
            {userSettings?.pinLockEnabled && (
              <button
                onClick={lockAppNow}
                className="px-3.5 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] dark:bg-white text-white dark:text-slate-900 text-xs font-semibold"
              >
                Lock Screen Now
              </button>
            )}
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!/^\d{4,6}$/.test(newPin)) {
                setPinMsg('Enter a 4 to 6 digit numeric PIN.');
                return;
              }
              try {
                await setPinLock(newPin);
                setNewPin('');
                setPinMsg('PIN lock saved securely.');
              } catch (err) {
                setPinMsg(err instanceof Error ? err.message : 'Unable to save PIN lock.');
              }
            }}
            className="space-y-3"
          >
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Set 4-6 digit PIN"
              className="w-full px-4 py-3 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-sm font-mono"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <KeyRound className="w-4 h-4" />
                <span>Save PIN Lock</span>
              </button>
              {userSettings?.pinLockEnabled && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await setPinLock(null);
                      setPinMsg('PIN lock disabled.');
                    } catch (err) {
                      setPinMsg(err instanceof Error ? err.message : 'Unable to disable PIN lock.');
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                >
                  Disable PIN
                </button>
              )}
            </div>
          </form>

          <label className="flex items-center justify-between p-3.5 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 cursor-pointer">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Fingerprint className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <span>Enable Fingerprint / Face Unlock (WebAuthn)</span>
            </span>
            <input
              type="checkbox"
              checked={userSettings?.biometricEnabled ?? false}
              onChange={(e) => updateUserSettings({ biometricEnabled: e.target.checked })}
            />
          </label>

          <div className="p-4 rounded-2xl bg-[#f0f9ff] dark:bg-slate-950 border border-[#bae6fd] dark:border-slate-800 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <ScanFace className="w-4 h-4 text-[#0284c7]" />
                <span>Eye &amp; Face Passkey Enrollment (Lost Phone Recovery)</span>
              </div>
              {hasPasskeyEnrolled && (
                <span className="text-[11px] font-bold text-[#0284c7] dark:text-[#38bdf8]">
                  Enrolled ✓
                </span>
              )}
            </div>
            <p className="text-slate-600 dark:text-slate-400">
              Register this device&apos;s biometric passkey so Old User Eye/Face Recovery can verify your device hardware rapidly.
            </p>
            <button
              type="button"
              disabled={passkeyEnrollBusy}
              onClick={async () => {
                setPinMsg(null);
                setPasskeyEnrollBusy(true);
                try {
                  if (typeof window.PublicKeyCredential === 'undefined' || !navigator.credentials?.create) {
                    throw new Error('WebAuthn passkey enrollment is not supported on this browser.');
                  }
                  const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
                  if (!available) {
                    throw new Error('No platform Face/Fingerprint authenticator detected on this device.');
                  }
                  const challenge = new Uint8Array(32);
                  window.crypto.getRandomValues(challenge);
                  const userIdBytes = new TextEncoder().encode(userProfile?.uid || 'pkchat-user');
                  const cred = (await navigator.credentials.create({
                    publicKey: {
                      challenge,
                      rp: { name: 'PK CHAT' },
                      user: {
                        id: userIdBytes,
                        name: userProfile?.fullName || userAccount?.phoneNumber || 'pkchat-user',
                        displayName: userProfile?.fullName || 'PK CHAT User',
                      },
                      pubKeyCredParams: [
                        { alg: -7, type: 'public-key' },
                        { alg: -257, type: 'public-key' },
                      ],
                      authenticatorSelection: {
                        authenticatorAttachment: 'platform',
                        userVerification: 'required',
                      },
                      timeout: 45000,
                    },
                  })) as PublicKeyCredential | null;
                  if (!cred) {
                    throw new Error('Passkey registration cancelled.');
                  }
                  const b64Id = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
                  window.localStorage.setItem('pk_biometric_cred_id', b64Id);
                  setHasPasskeyEnrolled(true);
                  await updateUserSettings({ biometricEnabled: true });
                  setPinMsg('Eye / Face Passkey enrolled successfully for device recovery!');
                } catch (err) {
                  setPinMsg(err instanceof Error ? err.message : 'Unable to register biometric passkey.');
                } finally {
                  setPasskeyEnrollBusy(false);
                }
              }}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2"
            >
              <ScanFace className="w-4 h-4" />
              <span>
                {passkeyEnrollBusy
                  ? 'Registering Biometric Passkey...'
                  : hasPasskeyEnrolled
                    ? 'Re-Enroll Eye / Face Passkey'
                    : 'Register Eye / Face Passkey'}
              </span>
            </button>
          </div>

          {pinMsg && <p className="text-xs text-[#0284c7] dark:text-[#38bdf8]">{pinMsg}</p>}
        </div>
      </div>
    );
  }

  // Screen 25: Help & Support + Mobile Store Install + Integration Checklist
  return renderSettingsShell(
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold">Help, Mobile Install &amp; Cloud Architecture</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Install PK CHAT directly as an app, configure Google Play Store bundles, or review cloud status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStoreModalOpen(true)}
          className="px-5 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold flex items-center gap-2 self-start"
        >
          <Store className="w-4 h-4" />
          <span>Install App &amp; Google Play Guide</span>
        </button>
      </div>

      <div className="p-5 rounded-3xl bg-sky-50/85 dark:bg-sky-950/30 backdrop-blur-md border border-[#bae6fd] dark:border-sky-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-bold text-[#0369a1] dark:text-sky-200 flex items-center gap-2">
            <Download className="w-4 h-4" />
            <span>Install PK CHAT App · Google Play Store · Bank Payouts</span>
          </p>
          <p className="text-xs text-[#0284c7] dark:text-sky-300">
            Immediate PWA installation works right now on Android and Desktop. Google Play Console Bubblewrap &amp; TWA bundle steps are available inside the Store Guide.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStoreModalOpen(true)}
          className="px-4 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold shrink-0"
        >
          Open Store &amp; Install Guide
        </button>
      </div>

      <div className="bg-[#e3f3ff]/80 dark:bg-slate-900/85 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-[0_8px_28px_rgba(2,132,199,0.12)]">
        <h2 className="text-base font-bold flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-[#0284c7]" />
          <span>External APIs, Cloud Functions &amp; Production Readiness Checklist</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th className="py-2.5 pr-4">Area</th>
                <th className="py-2.5 pr-4">Component</th>
                <th className="py-2.5 pr-4">Status</th>
                <th className="py-2.5">Engineering Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {INTEGRATION_CHECKLIST.map((item) => (
                <tr key={item.component}>
                  <td className="py-3 pr-4 font-semibold">{item.area}</td>
                  <td className="py-3 pr-4">{item.component}</td>
                  <td className="py-3 pr-4 whitespace-nowrap font-semibold">
                    {item.status === 'configured' && (
                      <span className="text-[#0284c7] dark:text-[#38bdf8]">Configured &amp; Active</span>
                    )}
                    {item.status === 'test_mode' && (
                      <span className="text-blue-700 dark:text-blue-400">Test Mode</span>
                    )}
                    {item.status === 'external_setup_required' && (
                      <span className="text-amber-700 dark:text-amber-400">External Setup Required</span>
                    )}
                  </td>
                  <td className="py-3 text-slate-600 dark:text-slate-300">{item.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-[#e3f3ff]/82 backdrop-blur-2xl border border-[#7dd3fc]/75 rounded-3xl p-6 flex flex-wrap items-center justify-between gap-3 shadow-[0_8px_28px_rgba(2,132,199,0.12)]">
        <div>
          <h2 className="text-base font-bold text-slate-900">About PK CHAT &amp; Founder Attribution</h2>
          <p className="text-xs text-slate-600 mt-1">
            Official PK CHAT global messenger &amp; family safety platform founded by{' '}
            <span translate="no" className="font-bold text-[#0284c7]">
              Prashanth keransiya
            </span>
            .
          </p>
        </div>
        <span translate="no" className="px-3.5 py-1.5 rounded-xl bg-sky-50 border border-[#bae6fd] text-xs font-bold text-[#0369a1]">
          Prashanth keransiya
        </span>
      </div>

      <StoreDownloadModal open={storeModalOpen} onClose={() => setStoreModalOpen(false)} />
    </div>
  );
}

interface BillingAndUserModeSectionProps {
  isPaymentTab: boolean;
  entitlement: ReturnType<typeof getSubscriptionEntitlement>;
  setActiveScreen: ReturnType<typeof usePkChat>['setActiveScreen'];
  billingProvider: 'google_play_test';
  setBillingProvider: React.Dispatch<React.SetStateAction<'google_play_test'>>;
  billingBusy: boolean;
  setBillingBusy: React.Dispatch<React.SetStateAction<boolean>>;
  billingError: string | null;
  setBillingError: React.Dispatch<React.SetStateAction<string | null>>;
  performSubscriptionAction: ReturnType<typeof usePkChat>['performSubscriptionAction'];
  subscription: ReturnType<typeof usePkChat>['subscription'];
  paymentRecords: ReturnType<typeof usePkChat>['paymentRecords'];
  userUid?: string;
  userPhone?: string;
}

function BillingAndUserModeSection({
  isPaymentTab,
  entitlement,
  setActiveScreen,
  billingProvider,
  setBillingProvider,
  billingBusy,
  setBillingBusy,
  billingError,
  setBillingError,
  performSubscriptionAction,
  subscription,
  paymentRecords,
  userUid,
  userPhone,
}: BillingAndUserModeSectionProps) {
  const [userMode, setUserMode] = useState<PkChatUserMode>(() => getActiveUserMode(userUid));
  const [remoteConfig, setRemoteConfig] = useState<RemoteAdPricingConfig | null>(null);
  const [unlimitedPass, setUnlimitedPass] = useState<AdvertiserUnlimitedPassStatus | null>(null);
  const [unlimitedBusy, setUnlimitedBusy] = useState(false);

  useEffect(() => {
    setUserMode(getActiveUserMode(userUid));
    const onModeChange = () => setUserMode(getActiveUserMode(userUid));
    window.addEventListener(USER_MODE_CHANGED_EVENT, onModeChange);
    fetchAdPlatformConfig()
      .then((cfg) => setRemoteConfig(cfg))
      .catch(() => {});
    if (userUid) {
      fetchAdvertiserUnlimitedPassStatus(userUid, userPhone)
        .then((res) => setUnlimitedPass(res))
        .catch(() => {});
    }
    return () => window.removeEventListener(USER_MODE_CHANGED_EVENT, onModeChange);
  }, [userPhone, userUid]);

  const smallPrice = remoteConfig?.smallAdPriceUsd ?? GOOGLE_PLAY_BILLING_CONFIG.adTiers.small.priceUsd;
  const largePrice = remoteConfig?.largeAdPriceUsd ?? GOOGLE_PLAY_BILLING_CONFIG.adTiers.large.priceUsd;
  const unlimitedPrice = remoteConfig?.unlimitedAdPriceUsd ?? UNLIMITED_ADS_ANNUAL_PRICE_USD;
  const annualPrice = remoteConfig?.annualProPriceUsd ?? 10;
  const trialDays = Math.max(STANDARD_FREE_TRIAL_DAYS, remoteConfig?.freeTrialDays ?? STANDARD_FREE_TRIAL_DAYS);
  const billingLibVersion =
    remoteConfig?.billingLibraryVersion ?? GOOGLE_PLAY_BILLING_CONFIG.billingLibraryVersion;
  const vipAllFree = hasFreeVipStatusAndAdAccess(userPhone) || entitlement.isVipFounder;

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isPaymentTab ? 'Payment Status & Billing History' : 'PK CHAT Google Play Billing & Dual-Mode Plans'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {vipAllFree
              ? 'VIP Founder Lifetime 100% Free Access active · Subscription, Business Ads & Video Status fees bypassed completely ($0.00).'
              : `${trialDays}-day (3-month) free trial · Then $${annualPrice.toFixed(2)}/year (once every 12 months) via Google Play Store Billing ONLY · Ads: $${smallPrice}/$${largePrice} or $${unlimitedPrice}/year Unlimited Ads & Videos.`}
          </p>
        </div>
        <div className="inline-flex gap-1 p-1 bg-[#cdeaff]/80 dark:bg-slate-800 border border-[#7dd3fc]/70 rounded-xl self-start">
          <button
            onClick={() => setActiveScreen('subscription')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
              !isPaymentTab ? 'bg-[#e8f5ff]/95 dark:bg-slate-900 text-[#0369a1] shadow-sm' : 'text-[#0c4a6e]'
            }`}
          >
            Plans &amp; Modes
          </button>
          <button
            onClick={() => setActiveScreen('payment_status')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
              isPaymentTab ? 'bg-[#e8f5ff]/95 dark:bg-slate-900 text-[#0369a1] shadow-sm' : 'text-[#0c4a6e]'
            }`}
          >
            Payment Status
          </button>
        </div>
      </div>

      {/* Dual User Mode Switcher (General User Mode vs Business / Advertiser Mode) */}
      <div className="bg-[#e3f3ff]/82 backdrop-blur-2xl border border-[#7dd3fc]/75 rounded-3xl p-5 space-y-4 shadow-[0_8px_28px_rgba(2,132,199,0.12)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-[#0284c7]" />
              <span>Dual User Mode · Google Play Store Billing ONLY ({billingLibVersion}+)</span>
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Zero upfront fees on download, login, or entering Business Mode. Pay-per-ad ($5/$10) or choose $100/year Unlimited Ads &amp; Videos via Google Play Store Billing ONLY.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveScreen('status_updates')}
            className="px-4 py-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold self-start sm:self-center"
          >
            Open Sponsored Business Studio
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setUserMode('general');
              setActiveUserMode('general', userUid);
            }}
            className={`p-4 rounded-2xl border text-left transition-all ${
              userMode === 'general'
                ? 'bg-[#e8f5ff] border-[#0284c7] ring-2 ring-[#0284c7]/30'
                : 'bg-[#eef8ff]/65 border-[#7dd3fc]/65 hover:bg-[#e3f3ff]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-slate-900">General User Mode</span>
              <span className="text-[11px] font-bold text-[#0284c7]">
                {userMode === 'general' ? 'Active' : 'Select'}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Chat, Calls, PK Live Class, Offline Compass, SOS &amp; 130+ Language Translation · {trialDays}-day (3-month) free trial, then ${annualPrice}/year ({GOOGLE_PLAY_BILLING_CONFIG.generalSubscription.sku}).
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setUserMode('business');
              setActiveUserMode('business', userUid);
            }}
            className={`p-4 rounded-2xl border text-left transition-all ${
              userMode === 'business'
                ? 'bg-[#e8f5ff] border-[#0284c7] ring-2 ring-[#0284c7]/30'
                : 'bg-[#eef8ff]/65 border-[#7dd3fc]/65 hover:bg-[#e3f3ff]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-slate-900">Business / Advertiser Mode</span>
              <span className="text-[11px] font-bold text-[#0284c7]">
                {userMode === 'business' ? 'Active' : 'Select'}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              $0 profile setup · Pay ${smallPrice} (Small Ad), ${largePrice} (Large Ad), or ${unlimitedPrice}/year Unlimited Ads &amp; Videos ({GOOGLE_PLAY_BILLING_CONFIG.unlimitedPackage.sku}).
            </p>
          </button>
        </div>

        {/* $100/Year Unlimited Ads & Videos Card */}
        <div className="p-4 rounded-2xl bg-[#eef8ff]/90 border border-[#7dd3fc] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5 text-xs">
            <p className="font-bold text-slate-900">
              Unlimited Business Ads &amp; Videos Pass ({GOOGLE_PLAY_BILLING_CONFIG.unlimitedPackage.sku})
            </p>
            <p className="text-slate-600">
              {vipAllFree
                ? 'VIP Founder Free Access Active — $0.00 Free Unlimited Ads & Video Statuses.'
                : unlimitedPass?.active
                ? `Active via Google Play Billing until ${unlimitedPass.expiresAt ? new Date(unlimitedPass.expiresAt).toLocaleDateString() : '12 months'}. All Ads & Video Statuses publish at $0.00.`
                : `Publish unlimited ads & videos across any target country or All Country for 1 full year ($${unlimitedPrice}.00 USD via Google Play Store Billing ONLY).`}
            </p>
          </div>
          {!vipAllFree && (
            <button
              type="button"
              disabled={unlimitedBusy || unlimitedPass?.active || !userUid}
              onClick={async () => {
                if (!userUid) return;
                setUnlimitedBusy(true);
                setBillingError(null);
                try {
                  const res = await activateAdvertiserUnlimitedPass({
                    uid: userUid,
                    sellerPhone: userPhone,
                    playBillingPurchaseToken: `gpb_unlim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  });
                  setUnlimitedPass(res);
                } catch (err) {
                  setBillingError(
                    err instanceof Error ? err.message : 'Unable to activate $100/year Unlimited Pass.'
                  );
                } finally {
                  setUnlimitedBusy(false);
                }
              }}
              className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-bold whitespace-nowrap"
            >
              {unlimitedPass?.active
                ? 'Unlimited Pass Active ✓'
                : unlimitedBusy
                ? 'Activating...'
                : `Activate $${unlimitedPrice}/yr Unlimited (Play Billing)`}
            </button>
          )}
        </div>
      </div>

      {vipAllFree && (
        <div className="p-5 rounded-3xl bg-gradient-to-r from-[#1d4ed8] via-[#2563eb] to-[#0284c7] text-white shadow-[0_8px_24px_rgba(37,99,235,0.28)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-sky-100">
              VIP Founder Free Access · Subscription, Business Ads &amp; Video Statuses
            </p>
            <h2 className="text-xl font-bold">Lifetime 100% Free Access Verified</h2>
            <p className="text-xs text-sky-50">{entitlement.summaryText}</p>
          </div>
          <span className="px-4 py-2 rounded-2xl bg-white/15 border border-white/30 text-sm font-bold whitespace-nowrap self-start sm:self-center">
            $0.00 · Lifetime Free
          </span>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl p-6 space-y-5 shadow-[0_8px_28px_rgba(2,132,199,0.12)]">
          <div>
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
              Google Play Store Billing ONLY · Library {billingLibVersion}+ · SKU {GOOGLE_PLAY_BILLING_CONFIG.generalSubscription.sku}
            </p>
            <h2 className="mt-1 text-xl font-bold">PK CHAT Global Pass</h2>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {vipAllFree ? (
                <>
                  $0.00 <span className="text-sm font-normal text-[#0284c7] dark:text-[#38bdf8]">/ lifetime (VIP Founder)</span>
                </>
              ) : (
                <>
                  ${annualPrice.toFixed(2)} <span className="text-sm font-normal text-slate-500">/ year (12 months)</span>
                </>
              )}
            </p>
            <p className="mt-1 text-xs text-[#0284c7] dark:text-[#38bdf8] font-medium">
              {entitlement.summaryText}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Billing Provider (Google Play Store Billing ONLY)
            </label>
            <select
              value={billingProvider}
              onChange={(e) => setBillingProvider(e.target.value as 'google_play_test')}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#eef8ff]/85 dark:bg-slate-950 border border-[#7dd3fc]/70 dark:border-slate-800 text-xs"
            >
              <option value="google_play_test">Google Play Store Billing ONLY (Library 8.0.0+)</option>
            </select>
          </div>

          <div className="space-y-2.5">
            {billingError && (
              <p className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300">
                {billingError}
              </p>
            )}
            {entitlement.isVipFounder ? (
              <button
                disabled={billingBusy}
                onClick={async () => {
                  setBillingError(null);
                  setBillingBusy(true);
                  try {
                    await performSubscriptionAction('verify_vip_founder', billingProvider);
                  } catch (err) {
                    setBillingError(
                      err instanceof Error ? err.message : 'Unable to sync VIP Founder pass.'
                    );
                  } finally {
                    setBillingBusy(false);
                  }
                }}
                className="w-full py-3 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold"
              >
                Sync VIP Founder Lifetime Free Pass
              </button>
            ) : (
              <>
                <button
                  disabled={billingBusy}
                  onClick={async () => {
                    setBillingError(null);
                    setBillingBusy(true);
                    try {
                      await performSubscriptionAction('start_trial', billingProvider);
                    } catch (err) {
                      setBillingError(
                        err instanceof Error ? err.message : 'Unable to start free trial.'
                      );
                    } finally {
                      setBillingBusy(false);
                    }
                  }}
                  className="w-full py-3 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-60 text-white text-sm font-semibold"
                >
                  Start / Refresh {trialDays}-Day Free Trial
                </button>
                <button
                  disabled={billingBusy}
                  onClick={async () => {
                    setBillingError(null);
                    setBillingBusy(true);
                    try {
                      await performSubscriptionAction('subscribe_annual', billingProvider);
                    } catch (err) {
                      setBillingError(
                        err instanceof Error ? err.message : 'Unable to activate subscription.'
                      );
                    } finally {
                      setBillingBusy(false);
                    }
                  }}
                  className="w-full py-3 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold"
                >
                  Activate ${annualPrice}/year via Google Play Billing
                </button>
                <button
                  disabled={billingBusy}
                  onClick={async () => {
                    setBillingError(null);
                    setBillingBusy(true);
                    try {
                      await performSubscriptionAction('cancel', billingProvider);
                    } catch (err) {
                      setBillingError(
                        err instanceof Error ? err.message : 'Unable to cancel auto-renewal.'
                      );
                    } finally {
                      setBillingBusy(false);
                    }
                  }}
                  className="w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 disabled:opacity-60 text-xs font-semibold"
                >
                  Cancel Auto-Renewal
                </button>
              </>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 bg-[#e3f3ff]/78 dark:bg-slate-900 backdrop-blur-2xl border border-[#7dd3fc]/75 dark:border-slate-800 rounded-3xl p-6 space-y-5 shadow-[0_8px_28px_rgba(2,132,199,0.12)]">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <p className="text-xs text-slate-500">Current Subscription Status</p>
              <p className="text-lg font-bold capitalize">
                {entitlement.isVipFounder
                  ? 'VIP Founder · Lifetime 100% Free'
                  : `${subscription?.status || 'trialing'} · ${subscription?.plan === 'pro_monthly' ? `$${annualPrice}/year` : `${trialDays}-day free trial`}`}
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>
                {entitlement.isVipFounder
                  ? 'Fee: $0.00 Forever'
                  : `Auto-Renew: ${subscription?.autoRenew ? 'Enabled' : 'Cancelled'}`}
              </p>
              <p>{entitlement.badgeLabel}</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold mb-3">Payment History</h3>
            {paymentRecords.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                No payment transactions recorded yet. Business Mode setup &amp; Buyer Product Received confirmations are 100% free ($0).
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {paymentRecords.map((pr) => (
                  <div key={pr.paymentId} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {pr.description}
                      </p>
                      <p className="text-slate-500">
                        {pr.provider} · {pr.status}
                      </p>
                    </div>
                    <span className="font-mono font-bold tabular-nums">
                      ${pr.amountUsd.toFixed(2)} {pr.currency}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

