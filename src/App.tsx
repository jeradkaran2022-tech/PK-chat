/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { PkChatProvider, usePkChat } from './context/PkChatContext';
import { OnboardingFlow } from './components/OnboardingFlow';
import { ScreenNavigator } from './components/ScreenNavigator';
import { ChatWorkspace } from './components/ChatWorkspace';
import { CallsView } from './components/CallsView';
import { SafetyAndDisasterView } from './components/SafetyAndDisasterView';
import { SettingsAndBillingView } from './components/SettingsAndBillingView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { StatusUpdatesView } from './components/StatusUpdatesView';
import { AppLockOverlay } from './components/AppLockOverlay';
import { AppUpdateBanner } from './components/AppUpdateBanner';
import { SecurityShieldOverlay } from './components/SecurityShieldOverlay';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ClassWhiteboardView } from './components/ClassWhiteboardView';
import { PKChatMirrorApp } from './components/PKChatMirrorApp';
import { AppI18nProvider } from './lib/i18n';
import { BRAND_LOGO_URL, PK_WORLD_PEACE_WALLPAPER_URL } from './data/constants';

const ONBOARDING_SCREENS = new Set([
  'splash',
  'welcome',
  'phone_register',
  'profile_create',
  'language_select',
]);

function LocalizedAppShell() {
  const { appLanguage, worldLanguages } = usePkChat();
  return (
    <AppI18nProvider appLanguageCode={appLanguage} dynamicLanguages={worldLanguages}>
      <PkChatRouter />
      <SecurityShieldOverlay />
      <AppUpdateBanner />
    </AppI18nProvider>
  );
}

function PkChatRouter() {
  const {
    activeScreen,
    authReady,
    firebaseUser,
    isLocalPreviewSession,
    userProfile,
    userAccountLoaded,
    appLanguage,
    appLanguageName,
    startTrialWithLanguage,
  } = usePkChat();
  const hasActiveSession = Boolean(firebaseUser || isLocalPreviewSession);

  // WhatsApp-style native launch screen while persisted Firebase Auth session resolves
  // Prevents flashing onboarding screens for signed-in returning users on Android TWA/PWA
  if (!authReady && !hasActiveSession && ONBOARDING_SCREENS.has(activeScreen)) {
    return (
      <div
        data-native-launch-screen="true"
        className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-[#0A192F] text-white px-6 select-none"
      >
        <div className="flex flex-col items-center gap-5">
          <div className="w-24 h-24 rounded-3xl overflow-hidden shadow-2xl ring-2 ring-sky-400/40 bg-[#0A192F]">
            <img
              src={BRAND_LOGO_URL}
              alt="PK Chat"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="text-center space-y-1">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">
              PK Chat
            </h1>
            <p className="text-xs font-medium text-sky-200/80">
              One World, One Chat
            </p>
          </div>
          <div
            aria-label="Loading PK Chat session"
            className="w-6 h-6 rounded-full border-2 border-sky-400 border-t-transparent animate-spin"
          />
        </div>
      </div>
    );
  }

  // Onboarding screens (1-7) or unauthenticated states
  if (ONBOARDING_SCREENS.has(activeScreen)) {
    // Allow viewing official disaster feeds or help even before full login if navigated directly
    return <OnboardingFlow />;
  }

  // If user clicked into app screens before signing in, route cleanly to onboarding unless viewing public disaster/help screens
  if (!hasActiveSession && activeScreen !== 'disaster_alerts' && activeScreen !== 'help_support') {
    return <OnboardingFlow />;
  }

  if (
    hasActiveSession &&
    (!userProfile || !userAccountLoaded) &&
    activeScreen !== 'disaster_alerts' &&
    activeScreen !== 'help_support'
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#cde9ff] via-[#e3f4ff] to-[#b5e0ff] dark:from-[#0b132b] dark:to-[#020617] px-6">
        <div className="max-w-sm w-full rounded-3xl bg-[#dff1ff]/88 dark:bg-slate-900/90 backdrop-blur-2xl border border-[#7dd3fc]/80 dark:border-slate-700 p-6 text-center space-y-4 shadow-xl">
          <div className="w-10 h-10 mx-auto rounded-full border-3 border-[#0284c7] border-t-transparent animate-spin" />
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Opening PK CHAT...
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Syncing your profile with Firebase (<span className="font-mono">pkchat-41ef3</span>).
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              void startTrialWithLanguage({
                languageCode: appLanguage || 'en',
                languageName: appLanguageName || 'English',
                fullName: firebaseUser?.displayName || undefined,
              })
            }
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold transition-colors"
          >
            Enter PK CHAT Now
          </button>
        </div>
      </div>
    );
  }

  const renderMainScreen = () => {
    switch (activeScreen) {
      case 'home':
      case 'contacts':
      case 'chat_list':
      case 'individual_chat':
      case 'group_chat':
        return <ChatWorkspace />;
      case 'status_updates':
        return <StatusUpdatesView />;
      case 'audio_call':
      case 'video_call':
        return <CallsView />;
      case 'sos_emergency':
      case 'disaster_alerts':
        return <SafetyAndDisasterView />;
      case 'class_room':
        return <ClassWhiteboardView />;
      case 'mirror_preview':
        return <PKChatMirrorApp />;
      case 'admin_dashboard':
        return <AdminDashboardView />;
      case 'translation_settings':
      case 'wallpaper_gallery':
      case 'subscription':
      case 'payment_status':
      case 'profile':
      case 'privacy_security':
      case 'app_lock':
      case 'help_support':
      default:
        return <SettingsAndBillingView />;
    }
  };

  return (
    <ScreenNavigator>
      {renderMainScreen()}
      <AppLockOverlay />
    </ScreenNavigator>
  );
}

export default function App() {
  useEffect(() => {
    if (typeof window === 'undefined' || !PK_WORLD_PEACE_WALLPAPER_URL) return;
    const img = new window.Image();
    img.src = PK_WORLD_PEACE_WALLPAPER_URL;
  }, []);

  return (
    <ErrorBoundary>
      <PkChatProvider>
        <LocalizedAppShell />
      </PkChatProvider>
    </ErrorBoundary>
  );
}
