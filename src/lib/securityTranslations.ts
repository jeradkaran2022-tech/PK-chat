export type SecurityPostureStatus = 'NORMAL' | 'LOCKDOWN' | 'RECOVERING';

export interface LocalizedSecurityCopy {
  languageCode: string;
  languageName: string;
  speechLocale: string;
  normalTitle: string;
  normalSummary: string;
  lockdownTitle: string;
  lockdownSummary: string;
  lockdownVoiceScript: string;
  recoveringTitle: string;
  recoveringSummary: string;
  recoveringVoiceScript: string;
  restoredVoiceScript: string;
  dataSafeGuarantee: string;
  restrictedActionsLabel: string;
  recheckCountdownTemplate: string; // Use {seconds}
  speakButtonLabel: string;
  speakingLabel: string;
  restrictions: {
    login: string;
    messages: string;
    account: string;
    calls: string;
  };
}

const SECURITY_TRANSLATIONS: Record<string, LocalizedSecurityCopy> = {
  en: {
    languageCode: 'en',
    languageName: 'English',
    speechLocale: 'en-US',
    normalTitle: 'PK CHAT Security Active',
    normalSummary: 'All systems are protected and operating normally.',
    lockdownTitle: 'Emergency Security Lockdown Active',
    lockdownSummary:
      'PK CHAT detected suspicious activity and temporarily paused logins, new messages, account edits, and calls to protect everyone.',
    lockdownVoiceScript:
      'Security alert from PK CHAT. Suspicious activity was detected. Emergency lockdown is active. Sending messages, calls, logins, and account changes are temporarily paused. Your messages and account remain safe and will not be deleted. We will recheck security in 10 seconds.',
    recoveringTitle: 'Security Verification & Recovery',
    recoveringSummary:
      'The threat is being verified as resolved. Normal service will resume after final safety confirmation.',
    recoveringVoiceScript:
      'PK CHAT security update. Threat checks are underway and service is in recovery mode. Rechecking system safety every 10 seconds.',
    restoredVoiceScript:
      'PK CHAT security notice. Threat resolved and verified. Normal service has been restored.',
    dataSafeGuarantee: 'Your messages and account data are completely safe and never deleted.',
    restrictedActionsLabel: 'Temporarily Restricted Actions',
    recheckCountdownTemplate: 'Rechecking security status in {seconds}s',
    speakButtonLabel: 'Play Voice Alert',
    speakingLabel: 'Speaking...',
    restrictions: {
      login: 'Logins paused',
      messages: 'Message sending paused',
      account: 'Account changes locked',
      calls: 'New calls paused',
    },
  },
  ta: {
    languageCode: 'ta',
    languageName: 'Tamil',
    speechLocale: 'ta-IN',
    normalTitle: 'PK CHAT பாதுகாப்பு செயல்பாட்டில் உள்ளது',
    normalSummary: 'அனைத்து சேவைகளும் பாதுகாப்பாகவும் சாதாரணமாகவும் இயங்குகின்றன.',
    lockdownTitle: 'அவசர பாதுகாப்பு முடக்கம் (LOCKDOWN) செயலில் உள்ளது',
    lockdownSummary:
      'சந்தேகத்திற்குரிய செயல்பாடு கண்டறியப்பட்டதால், உங்கள் பாதுகாப்பிற்காக உள்நுழைவு, புதிய செய்திகள், கணக்கு மாற்றங்கள் மற்றும் அழைப்புகள் தற்காலிகமாக நிறுத்தப்பட்டுள்ளன.',
    lockdownVoiceScript:
      'பிகே சாட் அவசர பாதுகாப்பு அறிவிப்பு. சந்தேகத்திற்குரிய செயல்பாடு கண்டறியப்பட்டுள்ளது. உங்கள் கணக்கைப் பாதுகாக்க புதிய செய்திகள், அழைப்புகள், உள்நுழைவு மற்றும் கணக்கு மாற்றங்கள் தற்காலிகமாக நிறுத்தப்பட்டுள்ளன. உங்கள் பழைய செய்திகளும் கணக்கும் பாதுகாப்பாக உள்ளன, எதுவும் அழிக்கப்படாது. பத்து வினாடிகளில் பாதுகாப்பு மீண்டும் சரிபார்க்கப்படும்.',
    recoveringTitle: 'பாதுகாப்பு மீட்பு நிலை (RECOVERING)',
    recoveringSummary:
      'அச்சுறுத்தல் தீர்ந்ததா என சர்வர் சரிபார்க்கிறது. உறுதி செய்யப்பட்டதும் சாதாரண சேவை மீண்டும் தொடங்கும்.',
    recoveringVoiceScript:
      'பிகே சாட் பாதுகாப்பு தகவல். அமைப்பு மீட்பு நிலையில் உள்ளது. பத்து வினாடிகளில் பாதுகாப்பு முழுமையாகச் சரிபார்க்கப்படும்.',
    restoredVoiceScript:
      'பிகே சாட் பாதுகாப்பு அறிவிப்பு. ஆபத்து முழுமையாக நீங்கிவிட்டது. சாதாரண சேவை இப்போது மீண்டும் தொடங்கியுள்ளது.',
    dataSafeGuarantee: 'உங்கள் செய்திகளும் கணக்கு தகவல்களும் பாதுகாப்பாக உள்ளன; எதுவும் அழிக்கப்படாது.',
    restrictedActionsLabel: 'தற்காலிகமாக நிறுத்தப்பட்டவை',
    recheckCountdownTemplate: '{seconds} வினாடிகளில் பாதுகாப்பு மீண்டும் சரிபார்க்கப்படும்',
    speakButtonLabel: 'குரல் அறிவிப்பைக் கேள்',
    speakingLabel: 'ஒலிக்கிறது...',
    restrictions: {
      login: 'உள்நுழைவு நிறுத்தம்',
      messages: 'செய்தி அனுப்புதல் நிறுத்தம்',
      account: 'கணக்கு மாற்றம் பூட்டு',
      calls: 'புதிய அழைப்புகள் நிறுத்தம்',
    },
  },
  si: {
    languageCode: 'si',
    languageName: 'Sinhala',
    speechLocale: 'si-LK',
    normalTitle: 'PK CHAT ආරක්ෂාව සක්‍රීයයි',
    normalSummary: 'සියලුම පද්ධති ආරක්ෂිතව සහ සාමාන්‍ය පරිදි ක්‍රියාත්මක වේ.',
    lockdownTitle: 'හදිසි ආරක්ෂක අගුලු දැමීම (LOCKDOWN) සක්‍රීයයි',
    lockdownSummary:
      'සැකසහිත ක්‍රියාකාරකමක් හඳුනාගත් බැවින් ඔබගේ ආරක්ෂාව සඳහා පිවිසීම්, පණිවිඩ යැවීම, ගිණුම් වෙනස්කම් සහ ඇමතුම් තාවකාලිකව සීමා කර ඇත.',
    lockdownVoiceScript:
      'පීකේ චැට් හදිසි ආරක්ෂක දැනුම්දීමයි. සැකසහිත ක්‍රියාකාරකමක් හඳුනාගෙන ඇත. පණිවිඩ යැවීම, ඇමතුම්, පිවිසීම් සහ ගිණුම් වෙනස්කම් තාවකාලිකව නතර කර ඇත. ඔබගේ පණිවිඩ සහ ගිණුම සම්පූර්ණයෙන්ම ආරක්ෂිතයි, කිසිවක් මකා නොදැමේ. තත්පර දහයකින් ආරක්ෂාව නැවත පරීක්ෂා කෙරේ.',
    recoveringTitle: 'ආරක්ෂාව යථා තත්ත්වයට පත්වෙමින් පවතී (RECOVERING)',
    recoveringSummary:
      'තර්ජනය විසඳී ඇත්දැයි පද්ධතිය පරීක්ෂා කරයි. තහවුරු වූ පසු සාමාන්‍ය සේවාව යළි ආරම්භ වේ.',
    recoveringVoiceScript:
      'පීකේ චැට් ආරක්ෂක යාවත්කාලීනය. පද්ධතිය යථා තත්ත්වයට පත්වෙමින් පවතී. තත්පර දහයකින් නැවත පරීක්ෂා කෙරේ.',
    restoredVoiceScript:
      'පීකේ චැට් ආරක්ෂක දැනුම්දීමයි. තර්ජනය සම්පූර්ණයෙන්ම විසඳී ඇත. සාමාන්‍ය සේවාව නැවත ආරම්භ කර ඇත.',
    dataSafeGuarantee: 'ඔබගේ පණිවිඩ සහ ගිණුම් දත්ත ආරක්ෂිතයි; කිසිවක් මකා නොදැමේ.',
    restrictedActionsLabel: 'තාවකාලිකව සීමා කළ ක්‍රියා',
    recheckCountdownTemplate: 'තත්පර {seconds} කින් ආරක්ෂාව නැවත පරීක්ෂා කෙරේ',
    speakButtonLabel: 'හඬ දැනුම්දීම අසන්න',
    speakingLabel: 'කියවමින්...',
    restrictions: {
      login: 'පිවිසීම් සීමා කර ඇත',
      messages: 'පණිවිඩ යැවීම සීමා කර ඇත',
      account: 'ගිණුම් වෙනස්කම් අගුලු දමා ඇත',
      calls: 'නව ඇමතුම් සීමා කර ඇත',
    },
  },
  hi: {
    languageCode: 'hi',
    languageName: 'Hindi',
    speechLocale: 'hi-IN',
    normalTitle: 'PK CHAT सुरक्षा सक्रिय है',
    normalSummary: 'सभी सेवाएँ सुरक्षित रूप से सामान्य कार्य कर रही हैं।',
    lockdownTitle: 'आपातकालीन सुरक्षा लॉकडाउन (LOCKDOWN) सक्रिय',
    lockdownSummary:
      'संदिग्ध गतिविधि मिलने पर सुरक्षा के लिए लॉगिन, नए संदेश, खाता बदलाव और कॉल अस्थायी रूप से रोके गए हैं।',
    lockdownVoiceScript:
      'पीके चैट से सुरक्षा चेतावनी। संदिग्ध गतिविधि का पता चला है। संदेश, कॉल, लॉगिन और खाता बदलाव अस्थायी रूप से रोके गए हैं। आपके संदेश और खाता सुरक्षित हैं और कुछ भी नहीं हटाया जाएगा। 10 सेकंड में सुरक्षा की दोबारा जांच होगी।',
    recoveringTitle: 'सुरक्षा पुनः बहाली जांच (RECOVERING)',
    recoveringSummary: 'सिस्टम जांच कर रहा है कि खतरा समाप्त हो गया है या नहीं। पुष्टि के बाद सेवा सामान्य होगी।',
    recoveringVoiceScript: 'पीके चैट सुरक्षा अपडेट। सेवा रिकवरी मोड में है। 10 सेकंड में पुनः जांच होगी।',
    restoredVoiceScript: 'पीके चैट सुरक्षा सूचना। खतरा समाप्त हो गया है और सामान्य सेवा बहाल कर दी गई है।',
    dataSafeGuarantee: 'आपके सभी संदेश और खाता डेटा पूरी तरह सुरक्षित हैं।',
    restrictedActionsLabel: 'अस्थायी रूप से प्रतिबंधित कार्य',
    recheckCountdownTemplate: '{seconds} सेकंड में सुरक्षा की पुनः जांच होगी',
    speakButtonLabel: 'वॉयस अलर्ट सुनें',
    speakingLabel: 'बोल रहा है...',
    restrictions: {
      login: 'लॉगिन अस्थायी रूप से बंद',
      messages: 'संदेश भेजना बंद',
      account: 'खाता बदलाव लॉक',
      calls: 'नई कॉल बंद',
    },
  },
  ar: {
    languageCode: 'ar',
    languageName: 'Arabic',
    speechLocale: 'ar-SA',
    normalTitle: 'حماية PK CHAT نشطة',
    normalSummary: 'جميع الأنظمة محمية وتعمل بشكل طبيعي.',
    lockdownTitle: 'تفعيل الإغلاق الأمني الطارئ (LOCKDOWN)',
    lockdownSummary:
      'تم رصد نشاط مريب، وتم إيقاف تسجيل الدخول والرسائل الجديدة وتعديلات الحساب والمكالمات مؤقتًا لحماية الجميع.',
    lockdownVoiceScript:
      'تنبيه أمني من PK CHAT. تم اكتشاف نشاط مريب وتفعيل الإغلاق الطارئ. الرسائل والمكالمات وتسجيل الدخول وتعديلات الحساب متوقفة مؤقتًا. رسائلك وحسابك آمنان ولن يتم حذف أي بيانات. ستتم إعادة الفحص خلال 10 ثوانٍ.',
    recoveringTitle: 'جاري التحقق واستعادة الأمان (RECOVERING)',
    recoveringSummary: 'يتحقق الخادم من زوال التهديد قبل استئناف الخدمة العادية.',
    recoveringVoiceScript: 'تحديث أمني من PK CHAT. النظام في وضع الاستعادة وسيُعاد الفحص خلال 10 ثوانٍ.',
    restoredVoiceScript: 'إشعار أمني من PK CHAT. تمت إزالة التهديد واستعادة الخدمة العادية.',
    dataSafeGuarantee: 'رسائلك وحسابك في أمان تام ولن يتم حذف أي بيانات.',
    restrictedActionsLabel: 'الإجراءات المقيدة مؤقتًا',
    recheckCountdownTemplate: 'إعادة فحص الأمان خلال {seconds} ثوانٍ',
    speakButtonLabel: 'تشغيل التنبيه الصوتي',
    speakingLabel: 'جاري التحدث...',
    restrictions: {
      login: 'إيقاف تسجيل الدخول',
      messages: 'إيقاف إرسال الرسائل',
      account: 'قفل تعديلات الحساب',
      calls: 'إيقاف المكالمات الجديدة',
    },
  },
};

/**
 * Extensibility hook allowing administrators/modules to register additional language packs dynamically.
 */
export function registerSecurityLanguage(copy: LocalizedSecurityCopy) {
  SECURITY_TRANSLATIONS[copy.languageCode.toLowerCase()] = copy;
}

/**
 * Strictly reads ONLY the user's explicit PK CHAT preferred language code.
 * NEVER infers or guesses language from user's country code.
 */
export function getSecurityCopyForLanguage(preferredLanguageCode?: string | null): LocalizedSecurityCopy {
  const normalized = (preferredLanguageCode || 'en').toLowerCase().trim().split(/[-_]/)[0];
  return SECURITY_TRANSLATIONS[normalized] || SECURITY_TRANSLATIONS.en;
}

export function getRegisteredSecurityLanguages(): string[] {
  return Object.keys(SECURITY_TRANSLATIONS);
}
