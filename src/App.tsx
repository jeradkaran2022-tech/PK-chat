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
import { PK_WORLD_PEACE_WALLPAPER_URL } from './data/constants';

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
    firebaseUser,
    isLocalPreviewSession,
    userProfile,
    userAccount,
    userAccountLoaded,
  } = usePkChat();
  const hasActiveSession = Boolean(firebaseUser || isLocalPreviewSession);

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
    return <OnboardingFlow />;
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
