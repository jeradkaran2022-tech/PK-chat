import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { LanguageOption } from '../types/pkchat';
import { WORLD_LANGUAGES_CATALOG, findWorldLanguage, isRtlLanguage } from '../data/worldLanguages';

export const BASE_UI_STRINGS = {
  // Navigation & Global
  'nav.home': 'Home',
  'nav.chats': 'Chats',
  'nav.updates': 'Updates',
  'nav.contacts': 'Contacts',
  'nav.calls': 'Calls',
  'nav.class': 'PK Live Class',
  'nav.sos': 'SOS',
  'nav.alerts': 'Alerts',
  'nav.language': 'Language',
  'nav.allScreens': 'All Screens',
  'nav.installApp': 'Install App',
  'nav.coreWorkspace': 'Core Workspace',
  'nav.settingsCloud': 'Settings & Cloud',
  'nav.translation': 'Translation',
  'nav.appearance': 'Appearance',
  'nav.subscription': 'Subscription',
  'nav.security': 'Security',
  'nav.appLock': 'App Lock',
  'nav.profile': 'Profile',
  'nav.adminConsole': 'Admin Console',
  'nav.helpStores': 'Help & Stores',
  'nav.mirrorPreview': 'Mobile Mirror View',
  'nav.lockNow': 'Lock App Now',
  'nav.screensMobile': 'Screens',
  'nav.screenDirectory': 'PK CHAT Screen Directory',
  'nav.screenDirectorySub': 'Navigate directly to any module in the PK CHAT system',
  'nav.offlineBanner': 'You are offline — Cached PK Chat screens & messages remain available until connection returns.',

  // Home & Notifications & Directory
  'home.welcomeBack': 'Welcome back',
  'home.hubSubtitle': 'Every screen is live across direct chats, group chats, live translation, updates, calls, and emergency safety.',
  'home.directChats': 'Direct Chats',
  'home.groupChats': 'Group Chats',
  'home.unseenUpdates': 'Updates Ready',
  'home.notifications': 'Notifications',
  'home.globalDirectory': 'Global Directory',
  'home.findByPhone': 'Find Contacts by Phone',
  'home.startChat': 'Start Chat',
  'home.markRead': 'Mark read',
  'home.noNotifications': 'No notifications yet.',
  'home.newGroup': 'New Group',
  'home.addContact': 'Add Contact',

  // Chat Workspace
  'chat.title': 'Chats',
  'chat.searchPlaceholder': 'Search chats or messages...',
  'chat.typeMessage': 'Type a message in your language...',
  'chat.send': 'Send',
  'chat.originalShown': 'Showing Original',
  'chat.translatedShown': 'Showing Translated',
  'chat.viewOriginal': 'Original',
  'chat.viewTranslated': 'Translated',
  'chat.playVoice': 'Listen',
  'chat.e2eeActive': 'End-to-End Encrypted',
  'chat.translationFallbackNote': 'Original preserved (translation service unavailable)',
  'chat.recordVoice': 'Voice Note',

  // Calls
  'calls.audioTitle': 'Voice Call & Simultaneous Two-Way Translation',
  'calls.videoTitle': 'Video Call & Two-Way Live Translation',
  'calls.subtitle': 'Sentence-buffered speech recognition, context & entity preservation, confidence checks, and synthesized translated speech.',
  'calls.audioCall': 'Audio Call',
  'calls.videoCall': 'Video Call',
  'calls.startCall': 'Start Call',
  'calls.endCall': 'End',
  'calls.speakerA': 'Speaker A Language',
  'calls.speakerB': 'Speaker B Language',

  // Updates / Status
  'status.title': 'Updates & Status',
  'status.subtitle': 'Share 24-hour text, photo, or video updates with granular contact privacy.',
  'status.myStatus': 'My Status',
  'status.recentUpdates': 'Recent Updates',
  'status.viewedUpdates': 'Viewed Updates',

  // Settings & App Language
  'settings.languageTitle': 'Universal Language & App Translation Settings',
  'settings.languageSub': 'Select your App Language and messaging language independently of country. All screens, RTL direction, chat translation, and voice adapt dynamically.',
  'settings.appLanguageLabel': 'App Display Language (All Screens)',
  'settings.preferredLangLabel': 'Chat & Voice Preferred Language',
  'settings.autoDetect': 'Automatic Language Detection',
  'settings.preserveOriginal': 'Preserve Original Messages',
  'settings.liveCallTranslation': 'Live Call Speech Translation',
  'settings.voiceSecurityAlerts': 'Voice Security Alerts (Multilingual TTS)',
  'settings.searchLanguages': 'Search ~130+ world, regional, minority & indigenous languages or ISO 639 codes...',
  'settings.refreshCatalog': 'Refresh Language Database',
  'settings.rtlActive': 'Right-to-Left (RTL) Script Active',

  // Personal SOS Contacts & Trusted Alert Dashboard
  'sos.dashboardTitle': 'Personal SOS Contacts & Trusted Location Dashboard',
  'sos.dashboardSub': 'Consented location sharing, live official disaster alerts, offline compass, and Personal SOS contact notifications.',
  'sos.disclaimerTitle': 'Personal SOS Contacts Notice',
  'sos.disclaimerBody': 'PK CHAT Personal SOS alerts notify only your saved trusted family and personal contacts with optional GPS coordinates.',
  'sos.locationConsentTitle': 'Consented Location Detection',
  'sos.enableGps': 'Allow GPS Location',
  'sos.stopSharing': 'Stop Location Sharing',
  'sos.manualSearchPlaceholder': 'Search city, district, or region manually...',
  'sos.reportTitle': 'Personal SOS Contacts',
  'sos.triggerSosBtn': 'Trigger Personal SOS & Share with Trusted Contacts',
  'sos.nearbyServicesTitle': 'Trusted Personal Contacts',
  'sos.viewOfficialAlerts': 'Official Disaster Alerts',
  'sos.callDirectly': 'Call Contact',
  'sos.directions': 'Directions',

  // Official Disaster Alerts
  'alerts.title': 'Official Disaster Alerts & Shelter Guidance',
  'alerts.subtitle': 'Live verified feeds from USGS Earthquakes, NOAA NWS, and NASA EONET matched against your consented area. Never fabricated.',
  'alerts.refreshFeeds': 'Refresh Official Feeds',
  'alerts.nearbyMatch': 'Near Your Consented Area',
} as const;

export type UiTranslationKey = keyof typeof BASE_UI_STRINGS;

const BUILTIN_DICTIONARIES: Record<string, Partial<Record<UiTranslationKey, string>>> = {
  ta: {
    'nav.home': 'முகப்பு',
    'nav.chats': 'அரட்டைகள்',
    'nav.updates': 'நிலைகள்',
    'nav.contacts': 'தொடர்புகள்',
    'nav.calls': 'அழைப்புகள்',
    'nav.sos': 'அவசர SOS',
    'nav.alerts': 'எச்சரிக்கைகள்',
    'nav.language': 'மொழி',
    'nav.allScreens': 'அனைத்து திரைகள்',
    'nav.installApp': 'ஆப் நிறுவுக',
    'nav.coreWorkspace': 'முதன்மை பகுதி',
    'nav.settingsCloud': 'அமைப்புகள் & கிளவுட்',
    'nav.translation': 'மொழிபெயர்ப்பு',
    'nav.appearance': 'தோற்றம்',
    'nav.subscription': 'சந்தா',
    'nav.security': 'பாதுகாப்பு',
    'nav.appLock': 'ஆப் பூட்டு',
    'nav.profile': 'சுயவிவரம்',
    'nav.adminConsole': 'நிர்வாகி பகுதி',
    'nav.helpStores': 'உதவி & ஸ்டோர்',
    'nav.mirrorPreview': 'மொபைல் மிரர் காட்சி',
    'nav.lockNow': 'இப்போது பூட்டு',
    'nav.screensMobile': 'திரைகள்',
    'nav.screenDirectory': 'PK CHAT திரை பட்டியல்',
    'nav.screenDirectorySub': 'PK CHAT செயலியின் எந்தப் பகுதிக்கும் நேரடியாகச் செல்லவும்',
    'nav.offlineBanner': 'இணையம் இல்லை — சேமிக்கப்பட்ட செய்திகளும் திரைகளும் தொடர்ந்து கிடைக்கும்.',
    'home.welcomeBack': 'நல்வரவு',
    'home.hubSubtitle': 'நேரடி அரட்டை, குழு அரட்டை, நேரடி மொழிபெயர்ப்பு, நிலைகள், அழைப்புகள் மற்றும் அவசர பாதுகாப்பு அனைத்தும் தயாராக உள்ளன.',
    'home.directChats': 'நேரடி அரட்டைகள்',
    'home.groupChats': 'குழு அரட்டைகள்',
    'home.unseenUpdates': 'புதிய நிலைகள்',
    'home.notifications': 'அறிவிப்புகள்',
    'home.globalDirectory': 'உலகளாவிய பட்டியல்',
    'home.findByPhone': 'தொலைபேசி எண் மூலம் தேடுக',
    'home.startChat': 'அரட்டை தொடங்கு',
    'home.markRead': 'படித்ததாக குறி',
    'home.noNotifications': 'இப்போதைக்கு அறிவிப்புகள் இல்லை.',
    'home.newGroup': 'புதிய குழு',
    'home.addContact': 'தொடர்பு சேர்க்க',
    'chat.title': 'அரட்டைகள்',
    'chat.searchPlaceholder': 'அரட்டை அல்லது செய்திகளைத் தேடுக...',
    'chat.typeMessage': 'உங்கள் மொழியில் செய்தியைத் தட்டச்சு செய்யவும்...',
    'chat.send': 'அனுப்பு',
    'chat.originalShown': 'மூல உரை காட்டப்படுகிறது',
    'chat.translatedShown': 'மொழிபெயர்ப்பு காட்டப்படுகிறது',
    'chat.viewOriginal': 'மூல உரை',
    'chat.viewTranslated': 'மொழிபெயர்ப்பு',
    'chat.playVoice': 'கேள்',
    'chat.e2eeActive': 'முழுமையான மறைகுறியாக்கம் (E2EE)',
    'chat.translationFallbackNote': 'மூல செய்தி பாதுகாக்கப்பட்டது (மொழிபெயர்ப்பு கிடைக்கவில்லை)',
    'chat.recordVoice': 'குரல் பதிவு',
    'calls.audioTitle': 'குரல் அழைப்பு & இருவழி நேரடி மொழிபெயர்ப்பு',
    'calls.videoTitle': 'வீடியோ அழைப்பு & இருவழி நேரடி மொழிபெயர்ப்பு',
    'calls.subtitle': 'வாக்கிய அடிப்படையிலான குரல் அறிதல், பெயர்/எண் பாதுகாப்பு மற்றும் நேரடி மொழிபெயர்ப்பு பேச்சு.',
    'calls.audioCall': 'குரல் அழைப்பு',
    'calls.videoCall': 'வீடியோ அழைப்பு',
    'calls.startCall': 'அழைப்பைத் தொடங்கு',
    'calls.endCall': 'முடி',
    'calls.speakerA': 'பேச்சாளர் A மொழி',
    'calls.speakerB': 'பேச்சாளர் B மொழி',
    'status.title': 'நிலைகள் & புதுப்பிப்புகள்',
    'status.subtitle': '24 மணி நேர உரை, புகைப்படம் மற்றும் வீடியோ நிலைகளைத் தனியுரிமை கட்டுப்பாட்டுடன் பகிரவும்.',
    'status.myStatus': 'எனது நிலை',
    'status.recentUpdates': 'புதிய நிலைகள்',
    'status.viewedUpdates': 'பார்த்த நிலைகள்',
    'settings.languageTitle': 'உலகளாவிய மொழி & செயலியின் மொழிபெயர்ப்பு அமைப்புகள்',
    'settings.languageSub': 'நாட்டைச் சாராமல் உங்கள் செயலி மொழியையும் அரட்டை மொழியையும் சுதந்திரமாகத் தேர்ந்தெடுக்கவும்.',
    'settings.appLanguageLabel': 'செயலியின் காட்சி மொழி (அனைத்து திரைகள்)',
    'settings.preferredLangLabel': 'அரட்டை & குரல் விருப்ப மொழி',
    'settings.autoDetect': 'தானியங்கி மொழி கண்டறிதல்',
    'settings.preserveOriginal': 'மூல செய்திகளைப் பாதுகாக்கவும்',
    'settings.liveCallTranslation': 'நேரடி அழைப்பு குரல் மொழிபெயர்ப்பு',
    'settings.voiceSecurityAlerts': 'குரல் பாதுகாப்பு எச்சரிக்கைகள் (TTS)',
    'settings.searchLanguages': '130+ உலக, பிராந்திய, சிறுபான்மை மற்றும் பூர்வீக மொழிகளைத் தேடுக...',
    'settings.refreshCatalog': 'மொழி தரவுத்தளத்தைப் புதுப்பி',
    'settings.rtlActive': 'வலமிருந்து இடம் (RTL) எழுத்து முறை செயலில் உள்ளது',
    'sos.dashboardTitle': 'ஸ்மார்ட் இருப்பிட அவசர உதவி & SOS கட்டுப்பாட்டு மையம்',
    'sos.dashboardSub': 'அனுமதியுடன் இருப்பிட கண்டறிதல், அருகிலுள்ள மருத்துவமனை/காவல் நிலையம்/முகாம்கள் மற்றும் அதிகாரப்பூர்வ பேரிடர் எச்சரிக்கைகள்.',
    'sos.disclaimerTitle': 'முக்கிய அவசர அறிவிப்பு',
    'sos.disclaimerBody': 'PK CHAT அருகிலுள்ள அதிகாரப்பூர்வ சேவைகளைக் கண்டறியவும் உங்கள் நம்பகமான தொடர்புகளுக்கு அறிவிக்கவும் உதவுகிறது. SOS தானியங்கி வகைப்பாடு காவல்துறை/ஆம்புலன்ஸை தானாக அனுப்பாது. உயிருக்கு ஆபத்தான நிலையில் எப்போதும் உங்கள் நாட்டின் அவசர எண்ணை நேரடியாக அழைக்கவும்.',
    'sos.locationConsentTitle': 'அனுமதியுடன் இருப்பிட கண்டறிதல்',
    'sos.enableGps': 'GPS இருப்பிடத்தை அனுமதி',
    'sos.stopSharing': 'இருப்பிடப் பகிர்வை நிறுத்து',
    'sos.manualSearchPlaceholder': 'நகரம், மாவட்டம் அல்லது பகுதியைத் தேடுக...',
    'sos.reportTitle': 'அவசர நிலை பதிவு & அருகிலுள்ள உதவி',
    'sos.triggerSosBtn': 'SOS அனுப்பு & நம்பகமான தொடர்புகளுக்குப் பகிர்',
    'sos.nearbyServicesTitle': 'அருகிலுள்ள சரிபார்க்கப்பட்ட அவசர சேவைகள் & முகாம்கள்',
    'sos.viewOfficialAlerts': 'அதிகாரப்பூர்வ பேரிடர் எச்சரிக்கைகள்',
    'sos.callDirectly': 'அழைக்கவும்',
    'sos.directions': 'வழிகாட்டுதல்',
    'alerts.title': 'அதிகாரப்பூர்வ பேரிடர் எச்சரிக்கைகள் & பாதுகாப்பு வழிகாட்டல்',
    'alerts.subtitle': 'USGS, NOAA NWS மற்றும் NASA EONET ஆகிய அதிகாரப்பூர்வ அமைப்புகளின் நேரடித் தகவல்கள்.',
    'alerts.refreshFeeds': 'எச்சரிக்கைகளைப் புதுப்பி',
    'alerts.nearbyMatch': 'உங்கள் பகுதிக்கு அருகில்',
  },
  si: {
    'nav.home': 'මුල් පිටුව',
    'nav.chats': 'චැට්',
    'nav.updates': 'යාවත්කාලීන',
    'nav.contacts': 'සම්බන්ධතා',
    'nav.calls': 'ඇමතුම්',
    'nav.sos': 'හදිසි SOS',
    'nav.alerts': 'අනතුරු ඇඟවීම්',
    'nav.language': 'භාෂාව',
    'nav.allScreens': 'සියලු තිර',
    'nav.installApp': 'යෙදුම ස්ථාපනය',
    'nav.translation': 'පරිවර්තනය',
    'nav.settingsCloud': 'සැකසුම් සහ ක්ලවුඩ්',
    'nav.profile': 'පැතිකඩ',
    'home.welcomeBack': 'සාදරයෙන් පිළිගනිමු',
    'home.notifications': 'දැනුම්දීම්',
    'home.globalDirectory': 'ගෝලීය නාමාවලිය',
    'chat.title': 'චැට්',
    'chat.typeMessage': 'ඔබේ භාෂාවෙන් පණිවිඩයක් ලියන්න...',
    'chat.send': 'යවන්න',
    'settings.languageTitle': 'විශ්වීය භාෂා සහ පරිවර්තන සැකසුම්',
    'settings.appLanguageLabel': 'යෙදුමේ භාෂාව (සියලු තිර)',
    'sos.dashboardTitle': 'ස්ථාන-පාදක හදිසි සහාය සහ SOS පුවරුව',
    'sos.enableGps': 'GPS ස්ථානයට අවසර දෙන්න',
    'sos.stopSharing': 'ස්ථානය බෙදාගැනීම නවතන්න',
    'alerts.title': 'නිල ආපදා අනතුරු ඇඟවීම්',
  },
  hi: {
    'nav.home': 'होम',
    'nav.chats': 'चैट',
    'nav.updates': 'अपडेट्स',
    'nav.contacts': 'संपर्क',
    'nav.calls': 'कॉल',
    'nav.sos': 'आपातकालीन SOS',
    'nav.alerts': 'अलर्ट',
    'nav.language': 'भाषा',
    'nav.allScreens': 'सभी स्क्रीन',
    'nav.installApp': 'ऐप इंस्टॉल करें',
    'nav.translation': 'अनुवाद',
    'nav.profile': 'प्रोफ़ाइल',
    'home.welcomeBack': 'वापसी पर स्वागत है',
    'home.notifications': 'सूचनाएं',
    'home.globalDirectory': 'ग्लोबल डायरेक्टरी',
    'chat.title': 'चैट',
    'chat.typeMessage': 'अपनी भाषा में संदेश लिखें...',
    'chat.send': 'भेजें',
    'settings.languageTitle': 'यूनिवर्सल भाषा और अनुवाद सेटिंग्स',
    'settings.appLanguageLabel': 'ऐप भाषा (सभी स्क्रीन)',
    'sos.dashboardTitle': 'स्मार्ट स्थान-आधारित आपातकालीन सहायता और SOS डैशबोर्ड',
    'sos.enableGps': 'GPS लोकेशन की अनुमति दें',
    'sos.stopSharing': 'लोकेशन साझा करना बंद करें',
    'alerts.title': 'आधिकारिक आपदा अलर्ट',
  },
  ml: {
    'nav.home': 'ഹോം',
    'nav.chats': 'ചാറ്റുകൾ',
    'nav.updates': 'അപ്ഡേറ്റുകൾ',
    'nav.contacts': 'കോൺടാക്റ്റുകൾ',
    'nav.calls': 'കോളുകൾ',
    'nav.sos': 'അടിയന്തര SOS',
    'nav.alerts': 'മുന്നറിയിപ്പുകൾ',
    'nav.language': 'ഭാഷ',
    'nav.installApp': 'ആപ്പ് ഇൻസ്റ്റാൾ ചെയ്യുക',
    'home.welcomeBack': 'സ്വാഗതം',
    'settings.languageTitle': 'ഭാഷയും വിവർത്തന ക്രമീകരണങ്ങളും',
    'settings.appLanguageLabel': 'ആപ്പ് ഭാഷ (എല്ലാ സ്ക്രീനുകളും)',
    'sos.dashboardTitle': 'അടിയന്തര സഹായവും SOS ഡാഷ്‌ബോർഡും',
    'alerts.title': 'ഔദ്യോഗിക ദുരന്ത മുന്നറിയിപ്പുകൾ',
  },
  ar: {
    'nav.home': 'الرئيسية',
    'nav.chats': 'المحادثات',
    'nav.updates': 'الحالة',
    'nav.contacts': 'جهات الاتصال',
    'nav.calls': 'المكالمات',
    'nav.sos': 'طوارئ SOS',
    'nav.alerts': 'التنبيهات',
    'nav.language': 'اللغة',
    'nav.allScreens': 'كل الشاشات',
    'nav.installApp': 'تثبيت التطبيق',
    'nav.coreWorkspace': 'مساحة العمل الأساسية',
    'nav.settingsCloud': 'الإعدادات والسحابة',
    'nav.translation': 'الترجمة',
    'nav.appearance': 'المظهر',
    'nav.subscription': 'الاشتراك',
    'nav.security': 'الأمان',
    'nav.appLock': 'قفل التطبيق',
    'nav.profile': 'الملف الشخصي',
    'nav.adminConsole': 'لوحة الإدارة',
    'nav.helpStores': 'المساعدة والمتاجر',
    'nav.lockNow': 'قفل التطبيق الآن',
    'home.welcomeBack': 'مرحباً بعودتك',
    'home.notifications': 'الإشعارات',
    'home.globalDirectory': 'الدليل العالمي',
    'home.directChats': 'محادثات مباشرة',
    'home.groupChats': 'مجموعات',
    'chat.title': 'المحادثات',
    'chat.typeMessage': 'اكتب رسالة بلغتك...',
    'chat.send': 'إرسال',
    'chat.viewOriginal': 'الأصل',
    'chat.viewTranslated': 'مترجم',
    'settings.languageTitle': 'إعدادات اللغة والترجمة العالمية',
    'settings.appLanguageLabel': 'لغة عرض التطبيق (جميع الشاشات)',
    'settings.preferredLangLabel': 'لغة الرسائل والمكالمات المفضلة',
    'settings.rtlActive': 'اتجاه النص من اليمين إلى اليسار (RTL) نشط',
    'sos.dashboardTitle': 'لوحة الطوارئ الذكية والمساعدة حسب الموقع',
    'sos.enableGps': 'السماح بموقع GPS',
    'sos.stopSharing': 'إيقاف مشاركة الموقع',
    'sos.triggerSosBtn': 'إرسال نداء استغاثة SOS لجهات الاتصال الموثوقة',
    'alerts.title': 'تنبيهات الكوارث الرسمية وإرشادات الإيواء',
  },
  es: {
    'nav.home': 'Inicio',
    'nav.chats': 'Chats',
    'nav.updates': 'Estados',
    'nav.contacts': 'Contactos',
    'nav.calls': 'Llamadas',
    'nav.sos': 'SOS',
    'nav.alerts': 'Alertas',
    'nav.language': 'Idioma',
    'nav.allScreens': 'Pantallas',
    'nav.installApp': 'Instalar App',
    'home.welcomeBack': 'Bienvenido de nuevo',
    'home.notifications': 'Notificaciones',
    'home.globalDirectory': 'Directorio Global',
    'chat.title': 'Chats',
    'chat.typeMessage': 'Escribe un mensaje en tu idioma...',
    'chat.send': 'Enviar',
    'settings.languageTitle': 'Configuración Universal de Idioma y Traducción',
    'settings.appLanguageLabel': 'Idioma de la Aplicación (Todas las Pantallas)',
    'sos.dashboardTitle': 'Panel Inteligente de Emergencias y Ayuda por Ubicación',
    'alerts.title': 'Alertas Oficiales de Desastres',
  },
  fr: {
    'nav.home': 'Accueil',
    'nav.chats': 'Discussions',
    'nav.updates': 'Statuts',
    'nav.contacts': 'Contacts',
    'nav.calls': 'Appels',
    'nav.sos': 'SOS',
    'nav.alerts': 'Alertes',
    'nav.language': 'Langue',
    'nav.allScreens': 'Écrans',
    'nav.installApp': 'Installer',
    'home.welcomeBack': 'Bon retour',
    'home.notifications': 'Notifications',
    'home.globalDirectory': 'Annuaire Mondial',
    'chat.title': 'Discussions',
    'chat.typeMessage': 'Écrivez un message dans votre langue...',
    'chat.send': 'Envoyer',
    'settings.languageTitle': 'Paramètres Universels de Langue et Traduction',
    'settings.appLanguageLabel': "Langue de l'Application (Tous les Écrans)",
    'sos.dashboardTitle': "Tableau d'Urgence Intelligent et Secours Géolocalisés",
    'alerts.title': 'Alertes Officielles de Catastrophes',
  },
  de: {
    'nav.home': 'Start',
    'nav.chats': 'Chats',
    'nav.updates': 'Status',
    'nav.contacts': 'Kontakte',
    'nav.calls': 'Anrufe',
    'nav.sos': 'SOS',
    'nav.alerts': 'Warnungen',
    'nav.language': 'Sprache',
    'nav.allScreens': 'Ansichten',
    'nav.installApp': 'App installieren',
    'home.welcomeBack': 'Willkommen zurück',
    'settings.languageTitle': 'Globale Sprach- & Übersetzungseinstellungen',
    'settings.appLanguageLabel': 'App-Anzeigesprache (Alle Bildschirme)',
    'sos.dashboardTitle': 'Intelligentes Standort-Notfall- & SOS-Dashboard',
    'alerts.title': 'Offizielle Katastrophenwarnungen',
  },
  zh: {
    'nav.home': '首页',
    'nav.chats': '聊天',
    'nav.updates': '动态',
    'nav.contacts': '联系人',
    'nav.calls': '通话',
    'nav.sos': '紧急 SOS',
    'nav.alerts': '灾害警报',
    'nav.language': '语言',
    'nav.allScreens': '所有页面',
    'nav.installApp': '安装应用',
    'home.welcomeBack': '欢迎回来',
    'settings.languageTitle': '全球语言与翻译设置',
    'settings.appLanguageLabel': '应用界面语言（全页面）',
    'sos.dashboardTitle': '智能定位紧急救援与 SOS 控制台',
    'alerts.title': '官方灾害警报与避难指南',
  },
  ja: {
    'nav.home': 'ホーム',
    'nav.chats': 'チャット',
    'nav.updates': 'ステータス',
    'nav.contacts': '連絡先',
    'nav.calls': '通話',
    'nav.sos': '緊急 SOS',
    'nav.alerts': '災害警報',
    'nav.language': '言語',
    'nav.allScreens': '全画面',
    'nav.installApp': 'アプリ導入',
    'home.welcomeBack': 'おかえりなさい',
    'settings.languageTitle': '世界言語・翻訳設定',
    'settings.appLanguageLabel': 'アプリ表示言語（全画面）',
    'sos.dashboardTitle': 'スマート位置情報ベース緊急支援・SOSダッシュボード',
    'alerts.title': '公式災害警報・避難情報',
  },
  ko: {
    'nav.home': '홈',
    'nav.chats': '채팅',
    'nav.updates': '상태',
    'nav.contacts': '연락처',
    'nav.calls': '통화',
    'nav.sos': '긴급 SOS',
    'nav.alerts': '재난 알림',
    'nav.language': '언어',
    'nav.allScreens': '전체 화면',
    'nav.installApp': '앱 설치',
    'home.welcomeBack': '환영합니다',
    'settings.languageTitle': '글로벌 언어 및 번역 설정',
    'settings.appLanguageLabel': '앱 표시 언어 (모든 화면)',
    'sos.dashboardTitle': '스마트 위치 기반 긴급 지원 및 SOS 대시보드',
    'alerts.title': '공식 재난 경보 및 대피 안내',
  },
  pt: {
    'nav.home': 'Início',
    'nav.chats': 'Conversas',
    'nav.updates': 'Atualizações',
    'nav.contacts': 'Contatos',
    'nav.calls': 'Chamadas',
    'nav.sos': 'SOS',
    'nav.alerts': 'Alertas',
    'nav.language': 'Idioma',
    'settings.languageTitle': 'Configurações Universais de Idioma e Tradução',
    'settings.appLanguageLabel': 'Idioma do Aplicativo (Todas as Telas)',
    'sos.dashboardTitle': 'Painel Inteligente de Emergência e SOS por Localização',
    'alerts.title': 'Alertas Oficiais de Desastres',
  },
  ru: {
    'nav.home': 'Главная',
    'nav.chats': 'Чаты',
    'nav.updates': 'Статусы',
    'nav.contacts': 'Контакты',
    'nav.calls': 'Звонки',
    'nav.sos': 'SOS',
    'nav.alerts': 'Оповещения',
    'nav.language': 'Язык',
    'settings.languageTitle': 'Настройки мировых языков и перевода',
    'settings.appLanguageLabel': 'Язык интерфейса приложения (все экраны)',
    'sos.dashboardTitle': 'Умная панель экстренной помощи и SOS по геолокации',
    'alerts.title': 'Официальные предупреждения о ЧС',
  },
  he: {
    'nav.home': 'דף הבית',
    'nav.chats': "צ'אטים",
    'nav.updates': 'עדכונים',
    'nav.contacts': 'אנשי קשר',
    'nav.calls': 'שיחות',
    'nav.sos': 'חירום SOS',
    'nav.alerts': 'התראות',
    'nav.language': 'שפה',
    'home.welcomeBack': 'ברוך שובך',
    'settings.languageTitle': 'הגדרות שפה ותרגום אוניברסליות',
    'settings.appLanguageLabel': 'שפת תצוגת האפליקציה (כל המסכים)',
    'sos.dashboardTitle': 'לוח בקרת חירום וסיוע מבוסס מיקום',
    'alerts.title': 'התראות אסון רשמיות',
  },
};

interface AppI18nContextValue {
  appLanguage: string;
  appLanguageObj: LanguageOption;
  isRtl: boolean;
  loadingPack: boolean;
  t: (key: UiTranslationKey, fallback?: string) => string;
}

const AppI18nContext = createContext<AppI18nContextValue>({
  appLanguage: 'en',
  appLanguageObj: WORLD_LANGUAGES_CATALOG[0],
  isRtl: false,
  loadingPack: false,
  t: (key, fallback) => fallback || BASE_UI_STRINGS[key] || key,
});

const FOUNDER_CANONICAL_NAME = 'Prashanth keransiya';

export function enforceCanonicalFounderName(text: string): string {
  if (!text) return text;
  return text
    .replace(/பிரசாந்த்\s+கிரன்சியா|பிரசாத்\s+கிரன்சியா|பிரசாந்த்\s+கெரன்சியா|பிரஷாந்த்\s+கெரன்சியா/g, FOUNDER_CANONICAL_NAME)
    .replace(/\b(?:Prashan?th|Prasanth)\s+Keransiya\b/gi, FOUNDER_CANONICAL_NAME);
}

export function AppI18nProvider({
  appLanguageCode,
  dynamicLanguages,
  children,
}: {
  appLanguageCode?: string | null;
  dynamicLanguages?: LanguageOption[];
  children: React.ReactNode;
}) {
  const code = (appLanguageCode || 'en').trim() || 'en';
  const langObj = useMemo(
    () => findWorldLanguage(code, dynamicLanguages) || WORLD_LANGUAGES_CATALOG[0],
    [code, dynamicLanguages]
  );
  const rtl = useMemo(() => isRtlLanguage(langObj.code, dynamicLanguages), [dynamicLanguages, langObj.code]);

  const [remotePack, setRemotePack] = useState<Record<string, string>>({});
  const [loadingPack, setLoadingPack] = useState(false);

  // Sync <html dir="rtl|ltr" lang="..."> immediately
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
      document.documentElement.lang = langObj.code;
    }
  }, [langObj.code, rtl]);

  // Hydrate full UI dictionary for any selected world language via localStorage + /api/languages/ui-pack
  useEffect(() => {
    const normalized = langObj.code.toLowerCase();
    const baseCode = normalized.split(/[-_]/)[0];
    if (normalized === 'en' || baseCode === 'en') {
      setRemotePack({});
      setLoadingPack(false);
      return;
    }

    const cacheKey = `pk_ui_pack_v1_${normalized}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as Record<string, string>;
        if (parsed && typeof parsed === 'object') {
          setRemotePack(parsed);
          // If already covers most keys cleanly, skip network roundtrip
          if (Object.keys(parsed).length >= Object.keys(BASE_UI_STRINGS).length - 5) {
            setLoadingPack(false);
            return;
          }
        }
      }
    } catch {
      // Ignore storage failures
    }

    let cancelled = false;
    setLoadingPack(true);

    const staticDict = BUILTIN_DICTIONARIES[normalized] || BUILTIN_DICTIONARIES[baseCode] || {};
    const missingEntries: Record<string, string> = {};
    (Object.keys(BASE_UI_STRINGS) as UiTranslationKey[]).forEach((k) => {
      if (!staticDict[k]) {
        missingEntries[k] = BASE_UI_STRINGS[k];
      }
    });

    if (Object.keys(missingEntries).length === 0) {
      setLoadingPack(false);
      return;
    }

    fetch('/api/languages/ui-pack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetLanguage: langObj.code,
        targetLanguageName: langObj.name,
        strings: missingEntries,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { translations?: Record<string, string> } | null) => {
        if (cancelled || !data?.translations) return;
        const sanitizedRemote: Record<string, string> = {};
        for (const [k, v] of Object.entries(data.translations)) {
          sanitizedRemote[k] = enforceCanonicalFounderName(String(v));
        }
        const merged = { ...staticDict, ...sanitizedRemote };
        setRemotePack(merged);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(merged));
        } catch {
          // Ignore quota errors
        }
      })
      .catch(() => {
        // Gracefully keep static dictionary + English fallback
      })
      .finally(() => {
        if (!cancelled) setLoadingPack(false);
      });

    return () => {
      cancelled = true;
    };
  }, [langObj.code, langObj.name]);

  const value = useMemo<AppI18nContextValue>(() => {
    const normalized = langObj.code.toLowerCase();
    const baseCode = normalized.split(/[-_]/)[0];
    const staticDict = BUILTIN_DICTIONARIES[normalized] || BUILTIN_DICTIONARIES[baseCode] || {};

    return {
      appLanguage: langObj.code,
      appLanguageObj: langObj,
      isRtl: rtl,
      loadingPack,
      t: (key: UiTranslationKey, fallback?: string) => {
        const raw =
          normalized === 'en' || baseCode === 'en'
            ? fallback || BASE_UI_STRINGS[key] || key
            : remotePack[key] || staticDict[key] || fallback || BASE_UI_STRINGS[key] || key;
        return enforceCanonicalFounderName(raw);
      },
    };
  }, [langObj, loadingPack, remotePack, rtl]);

  return <AppI18nContext.Provider value={value}>{children}</AppI18nContext.Provider>;
}

export function useAppI18n() {
  return useContext(AppI18nContext);
}
