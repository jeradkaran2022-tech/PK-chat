import { CountryOption, LanguageOption, ScreenId, WallpaperItem } from '../types/pkchat';
import wpWorldPeaceUrl from '../assets/images/world_peace_wallpaper_1795115031673.jpg';
import wpAbstractUrl from '../assets/images/wallpaper_abstract_1794593993034.jpg';
import wpNatureUrl from '../assets/images/wallpaper_nature_1794593992503.jpg';
import wpOceanUrl from '../assets/images/wallpaper_ocean_1794593992160.jpg';
import wpMountainsUrl from '../assets/images/wallpaper_mountains_1794593992311.jpg';
import wpFlowersUrl from '../assets/images/wallpaper_flowers_1794593992750.jpg';
import wpRomanticUrl from '../assets/images/wallpaper_romantic_1794593993856.jpg';
import {
  PK_SIGNATURE_WALLPAPER_ID,
  PK_SIGNATURE_WALLPAPER_URL,
  PK_WORLD_PEACE_WALLPAPER_ID,
} from '../lib/appearanceTheme';

const APP_BASE_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ||
  './';

export const BRAND_LOGO_URL = `${APP_BASE_URL}assets/aistudio/WhatsApp_Image_2026-11-18_at_4.59.42_PM_e151f1c5.jpeg`;
export const PK_WORLD_PEACE_WALLPAPER_URL = wpWorldPeaceUrl;
export { PK_SIGNATURE_WALLPAPER_URL };

export const BUILT_IN_WALLPAPERS: WallpaperItem[] = [
  {
    wallpaperId: PK_WORLD_PEACE_WALLPAPER_ID,
    title: 'PK World Peace & Unity',
    category: 'signature',
    imageUrl: wpWorldPeaceUrl,
    isBuiltIn: true,
    ownerId: 'system',
  },
  {
    wallpaperId: PK_SIGNATURE_WALLPAPER_ID,
    title: 'PK Chat Signature Frost',
    category: 'signature',
    imageUrl: PK_SIGNATURE_WALLPAPER_URL,
    isBuiltIn: true,
    ownerId: 'system',
  },
  {
    wallpaperId: 'wp_default_clean',
    title: 'PK Clean Slate',
    category: 'abstract',
    imageUrl: wpAbstractUrl,
    isBuiltIn: true,
    ownerId: 'system',
  },
  {
    wallpaperId: 'wp_nature_mist',
    title: 'Forest Canopy',
    category: 'nature',
    imageUrl: wpNatureUrl,
    isBuiltIn: true,
    ownerId: 'system',
  },
  {
    wallpaperId: 'wp_ocean_sapphire',
    title: 'Sapphire Tide',
    category: 'ocean',
    imageUrl: wpOceanUrl,
    isBuiltIn: true,
    ownerId: 'system',
  },
  {
    wallpaperId: 'wp_mountains_dawn',
    title: 'Alpine Sunrise',
    category: 'mountains',
    imageUrl: wpMountainsUrl,
    isBuiltIn: true,
    ownerId: 'system',
  },
  {
    wallpaperId: 'wp_flowers_jasmine',
    title: 'Jasmine & Hydrangea',
    category: 'flowers',
    imageUrl: wpFlowersUrl,
    isBuiltIn: true,
    ownerId: 'system',
  },
  {
    wallpaperId: 'wp_romantic_twilight',
    title: 'Twilight Reflection',
    category: 'romantic',
    imageUrl: wpRomanticUrl,
    isBuiltIn: true,
    ownerId: 'system',
  },
];

export const BUBBLE_COLOR_OPTIONS = [
  {
    id: 'sky_glass',
    label: 'PK Frosted Sky',
    bgClass:
      'bg-gradient-to-br from-[#0284c7]/95 to-[#0ea5e9]/90 text-white border border-sky-200/70 backdrop-blur-md shadow-sm',
    hex: '#0284c7',
  },
  {
    id: 'white_frost',
    label: 'Ice-Blue Frosted Glass',
    bgClass:
      'bg-[#dff1ff]/80 text-slate-900 border border-[#7dd3fc] backdrop-blur-xl shadow-sm dark:bg-sky-950/75 dark:text-white dark:border-sky-700/50',
    hex: '#d8f0ff',
  },
  { id: 'blue', label: 'Ocean Blue', bgClass: 'bg-[#0077B6] text-white border border-sky-300/40', hex: '#0077B6' },
  { id: 'cyan', label: 'Ice Cyan', bgClass: 'bg-sky-500 text-white border border-sky-200/60', hex: '#0ea5e9' },
  { id: 'slate', label: 'Carbon Slate', bgClass: 'bg-slate-800 text-white', hex: '#1E293B' },
  { id: 'indigo', label: 'Midnight Indigo', bgClass: 'bg-indigo-700 text-white', hex: '#4338CA' },
];

export const COUNTRIES: CountryOption[] = [
  { code: 'LK', name: 'Sri Lanka', dialCode: '+94', flag: '🇱🇰' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳' },
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
  { code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬' },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪' },
  { code: 'MY', name: 'Malaysia', dialCode: '+60', flag: '🇲🇾' },
  { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea', dialCode: '+82', flag: '🇰🇷' },
  { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪' },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷' },
  { code: 'ES', name: 'Spain', dialCode: '+34', flag: '🇪🇸' },
  { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷' },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '+966', flag: '🇸🇦' },
  { code: 'CH', name: 'Switzerland', dialCode: '+41', flag: '🇨🇭' },
  { code: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿' },
];

import { WORLD_LANGUAGES_CATALOG } from './worldLanguages';

export const LANGUAGES: LanguageOption[] = WORLD_LANGUAGES_CATALOG;

export const STICKERS = [
  '🌍 One World',
  '🤝 Hello Friend',
  '✅ Confirmed',
  '🙏 Thank You',
  '🚀 On My Way',
  '🎉 Congratulations',
  '💡 Great Idea',
  '🛡️ Stay Safe',
];

export const ALL_SCREENS_META: Array<{ id: ScreenId; number: number; title: string; group: string }> = [
  { id: 'splash', number: 1, title: 'Splash Screen', group: 'Onboarding' },
  { id: 'welcome', number: 2, title: 'Welcome Screen', group: 'Onboarding' },
  { id: 'phone_register', number: 3, title: 'Phone Number Setup', group: 'Onboarding' },
  { id: 'profile_create', number: 4, title: 'Profile Creation', group: 'Onboarding' },
  { id: 'language_select', number: 5, title: 'Preferred Language', group: 'Onboarding' },
  { id: 'home', number: 8, title: 'Home', group: 'Messaging' },
  { id: 'contacts', number: 9, title: 'Contacts', group: 'Messaging' },
  { id: 'chat_list', number: 10, title: 'Chat List', group: 'Messaging' },
  { id: 'individual_chat', number: 11, title: 'Individual Chat', group: 'Messaging' },
  { id: 'group_chat', number: 12, title: 'Group Chat', group: 'Messaging' },
  { id: 'audio_call', number: 13, title: 'Audio Call', group: 'Calls' },
  { id: 'video_call', number: 14, title: 'Video Call', group: 'Calls' },
  { id: 'translation_settings', number: 15, title: 'Translation Settings', group: 'Preferences' },
  { id: 'wallpaper_gallery', number: 16, title: 'Wallpaper Gallery', group: 'Preferences' },
  { id: 'sos_emergency', number: 17, title: 'SOS Emergency', group: 'Safety' },
  { id: 'disaster_alerts', number: 18, title: 'Disaster Alerts', group: 'Safety' },
  { id: 'subscription', number: 19, title: 'Subscription', group: 'Billing' },
  { id: 'payment_status', number: 20, title: 'Payment Status', group: 'Billing' },
  { id: 'profile', number: 21, title: 'Profile', group: 'Account' },
  { id: 'privacy_security', number: 22, title: 'Privacy & Security', group: 'Account' },
  { id: 'app_lock', number: 23, title: 'App Lock Settings', group: 'Account' },
  { id: 'admin_dashboard', number: 24, title: 'Admin Dashboard', group: 'Administration' },
  { id: 'help_support', number: 25, title: 'Help & Support', group: 'Account' },
  { id: 'status_updates', number: 26, title: 'Updates & Status', group: 'Messaging' },
  { id: 'class_room', number: 27, title: 'PK Live Class & Whiteboard', group: 'Education' },
  { id: 'mirror_preview', number: 28, title: 'Mobile Mirror View', group: 'Messaging' },
];

export interface IntegrationChecklistItem {
  area: string;
  component: string;
  status: 'configured' | 'test_mode' | 'external_setup_required';
  notes: string;
}

export const INTEGRATION_CHECKLIST: IntegrationChecklistItem[] = [
  {
    area: 'Cloud Database & Rules',
    component: 'Cloud Firestore (pk-chhat · zero-delete lockdown rules)',
    status: 'configured',
    notes: 'Provisioned on project pk-chhat and deployed with server-controlled lockdown blocking and zero-delete data preservation.',
  },
  {
    area: 'Security Shield & Lockdown',
    component: 'Lockdown / Recovering State Machine + 10s Auto-Recheck + Multi-Language Banner/Voice',
    status: 'configured',
    notes: 'Live Express backend detection, 10-second verification loop, static/automated tests, and Tamil/Sinhala/English/Hindi/Arabic voice & text banner.',
  },
  {
    area: 'Gmail Owner Approval Flow',
    component: 'Gmail REST API OAuth (gmail.send + gmail.readonly, memory-only token)',
    status: 'configured',
    notes: 'Sends structured approval requests to Jeradprasanth27@gmail.com and verifies single-use APPROVE/REJECT codes on the same thread.',
  },
  {
    area: 'Installable Mobile/Desktop App (PWA)',
    component: 'Vite PWA Manifest + Service Worker + PNG Icons',
    status: 'configured',
    notes: 'Ready for direct home-screen install via in-app Install App button on Android Chrome, desktop browsers, and iPhone Safari.',
  },
  {
    area: 'Translation, Voice & Disasters',
    component: 'PKC Cloud Translation/TTS + USGS & NOAA Feeds',
    status: 'configured',
    notes: 'Active on Express backend for live multi-language chat translation, speech synthesis, and official disaster feeds.',
  },
  {
    area: 'Firebase Cloud Functions (/functions)',
    component: 'Serverless triggers (evaluateSecurityEvent, recheckSecurityStatus, heartbeat)',
    status: 'external_setup_required',
    notes: 'Complete TypeScript source written in /functions/src/index.ts. Deploy to Firebase Blaze plan with: cd functions && npm install && npm run build && firebase deploy --only functions.',
  },
  {
    area: 'Android Jetpack Compose Module (/android)',
    component: 'PkChatSecurityManager + SecurityNotificationBanner + TTS',
    status: 'external_setup_required',
    notes: 'Complete Kotlin/Compose security source in /android/pkchat_security/. Requires Android Studio build with your google-services.json.',
  },
  {
    area: 'Google Play Store Packaging & Billing',
    component: 'Google Play TWA / APK (.aab) & Google Play Billing 8.0.0+ Payouts',
    status: 'test_mode',
    notes: 'All payments (90-day free trial -> $10/yr subscription, $5/$10 ads, and $100/yr Unlimited Ads & Videos) run strictly via Google Play Store Billing and link to Google Play Console merchant bank payouts.',
  },
];
