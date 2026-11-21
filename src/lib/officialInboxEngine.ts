import { DisasterAlert } from '../types/pkchat';
import {
  getVerifiedLocationAlerts,
  resolveFestivalGreetings,
  type FestivalGreeting,
  type VerifiedDisasterAlert,
} from './pkMirrorEngine';

export {
  getVerifiedLocationAlerts,
  resolveFestivalGreetings,
  type FestivalGreeting,
  type VerifiedDisasterAlert,
};

export const OFFICIAL_READ_CHANGED_EVENT = 'pkchat-official-read-changed';

export interface OfficialSystemNotification {
  id: string;
  category: string;
  title: string;
  body: string;
  read: boolean;
  createdAt?: unknown;
}

export interface OfficialGreetingMessage {
  id: string;
  occasion:
    | 'birthday'
    | 'national_festival'
    | 'christmas'
    | 'new_year'
    | 'ramzan'
    | 'founder_peace'
    | 'special_day';
  badge: string;
  emoji: string;
  title: string;
  body: string;
  activeToday: boolean;
  founderName?: string;
}

export interface LocalizedRedAlert {
  alertId: string;
  isRedAlert: boolean;
  redAlertBadge: string;
  hazardLabel: string;
  localizedTitle: string;
  localizedAdvice: string;
  areaLabel: string;
  agencyLabel: string;
  issuedAt: string;
  sourceUrl?: string;
  distanceKm?: number;
}

function normalizeLang(langCode?: string): string {
  const clean = (langCode || 'en').trim().toLowerCase();
  const base = clean.split(/[-_]/)[0];
  return base || 'en';
}

const RED_ALERT_LABELS: Record<
  string,
  {
    redBadge: string;
    advisoryBadge: string;
    govSeal: string;
    evacPrefix: string;
    hazards: Record<DisasterAlert['hazardType'], string>;
    advice: Record<DisasterAlert['hazardType'], string>;
  }
> = {
  ta: {
    redBadge: '🔴 சிவப்பு எச்சரிக்கை · RED ALERT',
    advisoryBadge: '🟠 அரசு அவசர எச்சரிக்கை · OFFICIAL ALERT',
    govSeal: '100% அரசு அதிகாரப்பூர்வ அறிவிப்பு',
    evacPrefix: 'பாதுகாப்பு அறிவுறுத்தல்',
    hazards: {
      earthquake: 'நிலநடுக்கம்',
      tsunami: 'சுனாமி எச்சரிக்கை',
      flood: 'வெள்ள அபாயம்',
      severe_weather: 'கடுமையான வானிலை',
      cyclone: 'புயல் / சூறாவளி',
      landslide: 'மண்சரிவு',
      wildfire: 'காட்டுத்தீ',
    },
    advice: {
      earthquake: 'கட்டிடங்களை விட்டு பாதுகாப்பான திறந்தவெளிக்கு செல்லுங்கள். மின் இணைப்பு மற்றும் எரிவாயு குழாய்களை அணைக்கவும்.',
      tsunami: 'உடனடியாக கடற்கரையிலிருந்து விலகி 30 மீட்டர் உயரமான பாதுகாப்பான பகுதிக்கு செல்லுங்கள்.',
      flood: 'தாழ்வான பகுதிகளை விட்டு மேடான பாதுகாப்பான இடத்திற்கு செல்லுங்கள்; வெள்ள நீரில் நடக்க வேண்டாம்.',
      severe_weather: 'பாதுகாப்பான கட்டிடத்திற்குள் இருங்கள்; தேவையற்ற பயணங்களைத் தவிர்க்கவும்.',
      cyclone: 'கதவு மற்றும் ஜன்னல்களை பாதுகாப்பாக மூடி உள்ளேயே இருங்கள்; அரசு அறிவிப்புகளைப் பின்பற்றவும்.',
      landslide: 'மலைச்சரிவு பகுதிகளை விட்டு உடனடியாக வெளியேறி பாதுகாப்பான முகாமிற்கு செல்லுங்கள்.',
      wildfire: 'தீ பரவும் திசைக்கு எதிராக உடனடியாக பாதுகாப்பான இடத்திற்கு வெளியேறுங்கள்.',
    },
  },
  si: {
    redBadge: '🔴 රතු අනතුරු ඇඟවීම · RED ALERT',
    advisoryBadge: '🟠 නිල රජයේ අනතුරු ඇඟවීම · OFFICIAL ALERT',
    govSeal: '100% රජයේ නිල තහවුරු කළ නිවේදනය',
    evacPrefix: 'ආරක්ෂක උපදෙස්',
    hazards: {
      earthquake: 'භූමිකම්පාව',
      tsunami: 'සුනාමි අනතුරු ඇඟවීම',
      flood: 'ගංවතුර අවදානම',
      severe_weather: 'දැඩි කාලගුණය',
      cyclone: 'සුළි කුණාටුව',
      landslide: 'නායයෑම් අවදානම',
      wildfire: 'ලැව්ගිනි',
    },
    advice: {
      earthquake: 'වහාම ආරක්ෂිත විවෘත ස්ථානයකට යන්න. විදුලිය සහ ගෑස් වසා දමන්න.',
      tsunami: 'වහාම වෙරළ තීරයෙන් ඉවත් වී උස් ආරක්ෂිත ස්ථානයකට යන්න.',
      flood: 'පහත් බිම්වලින් ඉවත් වී ආරක්ෂිත උස් ස්ථානවලට යන්න.',
      severe_weather: 'ආරක්ෂිතව ගෘහස්ථව රැඳී සිටින්න; අත්‍යවශ්‍ය නොවන ගමන් වළකින්න.',
      cyclone: 'දොර ජනෙල් තදින් වසා ආරක්ෂිතව සිටින්න; රජයේ උපදෙස් අනුගමනය කරන්න.',
      landslide: 'කඳු බෑවුම් ප්‍රදේශවලින් වහාම ඉවත් වී ආරක්ෂිත ස්ථානයකට යන්න.',
      wildfire: 'ගින්නෙන් ඉවතට වහාම ආරක්ෂිත ප්‍රදේශයකට යන්න.',
    },
  },
  hi: {
    redBadge: '🔴 रेड अलर्ट · RED ALERT',
    advisoryBadge: '🟠 आधिकारिक सरकारी चेतावनी · OFFICIAL ALERT',
    govSeal: '100% सरकारी प्रमाणित आपातकालीन सूचना',
    evacPrefix: 'सुरक्षा निर्देश',
    hazards: {
      earthquake: 'भूकंप चेतावनी',
      tsunami: 'सुनामी चेतावनी',
      flood: 'बाढ़ चेतावनी',
      severe_weather: 'खराब मौसम चेतावनी',
      cyclone: 'चक्रवात / तूफान',
      landslide: 'भूस्खलन चेतावनी',
      wildfire: 'जंगल की आग',
    },
    advice: {
      earthquake: 'तुरंत सुरक्षित खुले स्थान पर जाएं। बिजली और गैस बंद करें।',
      tsunami: 'तटीय क्षेत्र तुरंत छोड़ें और ऊंचे सुरक्षित स्थान पर जाएं।',
      flood: 'निचले इलाकों से निकलकर ऊंचे सुरक्षित स्थान पर जाएं।',
      severe_weather: 'सुरक्षित भवन के अंदर रहें और अनावश्यक यात्रा से बचें।',
      cyclone: 'दरवाजे व खिड़कियां बंद रखें और सरकारी निर्देशों का पालन करें।',
      landslide: 'पहाड़ी ढलानों से तुरंत सुरक्षित स्थान पर जाएं।',
      wildfire: 'आग की दिशा से दूर सुरक्षित स्थान पर तुरंत निकलें।',
    },
  },
  ar: {
    redBadge: '🔴 إنذار أحمر · RED ALERT',
    advisoryBadge: '🟠 تنبيه حكومي رسمي · OFFICIAL ALERT',
    govSeal: 'تنبيه حكومي رسمي معتمد 100%',
    evacPrefix: 'إرشادات السلامة',
    hazards: {
      earthquake: 'زلزال',
      tsunami: 'تحذير تسونامي',
      flood: 'خطر فيضانات',
      severe_weather: 'طقس شديد الخطورة',
      cyclone: 'إعصار مداري',
      landslide: 'انهيار أرضي',
      wildfire: 'حريق غابات',
    },
    advice: {
      earthquake: 'انتقل فوراً إلى منطقة مفتوحة آمنة وأغلق مصادر الكهرباء والغاز.',
      tsunami: 'ابتعد فوراً عن الساحل وتوجه إلى مرتفع آمن يزيد عن 30 متراً.',
      flood: 'غادر المناطق المنخفضة إلى أماكن مرتفعة وآمنة فوراً.',
      severe_weather: 'ابقَ داخل مبنى آمن وتجنب التنقل غير الضروري.',
      cyclone: 'أغلق النوافذ والأبواب بإحكام واتبع تعليمات الجهات الحكومية.',
      landslide: 'أخلِ المناطق الجبلية المنحدرة فوراً إلى مكان آمن.',
      wildfire: 'ابتعد فوراً عن مسار الحريق إلى منطقة إخلاء آمنة.',
    },
  },
  en: {
    redBadge: '🔴 RED ALERT · IMMEDIATE ACTION',
    advisoryBadge: '🟠 OFFICIAL GOV ALERT',
    govSeal: '100% Government-Verified Authority',
    evacPrefix: 'Safety Action',
    hazards: {
      earthquake: 'Earthquake',
      tsunami: 'Tsunami Warning',
      flood: 'Flood Hazard',
      severe_weather: 'Severe Weather',
      cyclone: 'Cyclone / Storm',
      landslide: 'Landslide Warning',
      wildfire: 'Wildfire Warning',
    },
    advice: {
      earthquake: 'Drop, Cover, and Hold On; move to an open safe zone away from structures.',
      tsunami: 'Move immediately inland and to high ground above 30m away from beaches.',
      flood: 'Move to higher ground immediately; never cross fast-moving floodwaters.',
      severe_weather: 'Remain indoors in a reinforced room and monitor local government broadcasts.',
      cyclone: 'Secure windows and doors, stay indoors, and follow local civil defense orders.',
      landslide: 'Evacuate steep slopes immediately to designated emergency shelters.',
      wildfire: 'Evacuate away from fire front immediately via official safe routes.',
    },
  },
};

export function localizeRedAlert(
  alert: DisasterAlert,
  langCode?: string,
  countryName?: string
): LocalizedRedAlert {
  const baseLang = normalizeLang(langCode);
  const pack = RED_ALERT_LABELS[baseLang] || RED_ALERT_LABELS.en;
  const isRed = alert.severity === 'extreme' || alert.severity === 'warning';
  const hazardLabel = pack.hazards[alert.hazardType] || RED_ALERT_LABELS.en.hazards[alert.hazardType];
  const baseAdvice =
    alert.evacuationInstructions ||
    alert.shelterAdvice ||
    pack.advice[alert.hazardType] ||
    RED_ALERT_LABELS.en.advice[alert.hazardType];
  const translatedPrefix =
    baseLang === 'en' ? '' : `[${hazardLabel}] `;

  return {
    alertId: alert.alertId,
    isRedAlert: isRed,
    redAlertBadge: isRed ? pack.redBadge : pack.advisoryBadge,
    hazardLabel,
    localizedTitle: `${translatedPrefix}${alert.title}`,
    localizedAdvice: `${pack.evacPrefix}: ${baseAdvice}`,
    areaLabel: alert.location || countryName || 'Local Region',
    agencyLabel: `${alert.officialSource} · ${pack.govSeal}`,
    issuedAt: alert.issuedAt,
    sourceUrl: alert.sourceUrl,
    distanceKm: alert.distanceKm,
  };
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function getReadOfficialIds(uid?: string): string[] {
  const key = `pk_official_read_${uid || 'default'}`;
  const raw = getStorage()?.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function markOfficialIdsRead(uid: string | undefined, ids: string[]): string[] {
  const cleanIds = ids.filter((id) => typeof id === 'string' && id.trim().length > 0);
  const existing = getReadOfficialIds(uid);
  const merged = Array.from(new Set([...existing, ...cleanIds])).slice(-400);
  try {
    getStorage()?.setItem(`pk_official_read_${uid || 'default'}`, JSON.stringify(merged));
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(OFFICIAL_READ_CHANGED_EVENT, { detail: merged }));
    }
  } catch {
    // ignore quota errors
  }
  return merged;
}

export function buildOfficialInboxGreetings(params: {
  fullName?: string;
  dob?: string;
  now?: Date;
}): OfficialGreetingMessage[] {
  const now = params.now || new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const isBirthday = Boolean(params.dob && params.dob.length >= 10 && params.dob.slice(5, 10) === mmdd);
  const isChristmas = month === 12 && day >= 24 && day <= 26;
  const isNewYear = (month === 12 && day === 31) || (month === 1 && day <= 2);
  const nameSuffix = params.fullName ? `, ${params.fullName}` : '';

  const yearStamp = `${now.getFullYear()}`;
  const items: OfficialGreetingMessage[] = [];

  if (isBirthday) {
    items.push({
      id: `greeting_birthday_${yearStamp}_${mmdd}`,
      occasion: 'birthday',
      badge: '🎂 Happy Birthday',
      emoji: '🥳🎂',
      title: `Happy Birthday${nameSuffix}! · இனிய பிறந்தநாள் வாழ்த்துகள்!`,
      founderName: 'Prashanth keransiya',
      body: `எங்கள் சொந்த உறவினர் போல அன்புடன், உங்கள் குடும்பத்தில் ஒற்றுமை, அமைதி மற்றும் மகிழ்ச்சி எப்போதும் நிலைத்திருக்க பிரார்த்தனைகளுடன் இனிய பிறந்தநாள் நல்வாழ்த்துகள்! Wishing you unity, peace, health, and warm happiness all year — lovingly from Prashanth keransiya on PK Chat Official.`,
      activeToday: true,
    });
  }

  items.push({
    id: `greeting_founder_peace_${yearStamp}`,
    occasion: 'founder_peace',
    badge: '🕊️ PK Chat Official · Official Broadcast',
    emoji: '🕊️💙',
    title: 'PK Chat Official Family & Global Peace Broadcast',
    founderName: 'Prashanth keransiya',
    body: 'உலக மக்கள் மற்றும் எங்கள் சொந்த உறவினர் போன்ற உங்கள் அன்புக் குடும்பத்தினர் அனைவருக்கும் ஒற்றுமை, அமைதி மற்றும் மகிழ்ச்சி பொங்க நெஞ்சார்ந்த நல்வாழ்த்துகள்! Heartfelt prayers for unity, peace, and happiness from Prashanth keransiya on PK Chat Official.',
    activeToday: true,
  });

  items.push({
    id: `greeting_national_festival_${yearStamp}`,
    occasion: 'national_festival',
    badge: '🕊️ National Unity & Peace',
    emoji: '🕊️🎉',
    title: `Warm National Festival Wishes${nameSuffix}! · இனிய தேசிய தின நல்வாழ்த்துகள்!`,
    founderName: 'Prashanth keransiya',
    body: 'எங்கள் சொந்த உறவினரைப் போல அன்புடன் பிரார்த்திக்கிறோம் — உங்கள் குடும்பத்திலும் நாட்டிலும் ஒற்றுமை, அமைதி மற்றும் மகிழ்ச்சி தழைத்தோங்க இனிய தேசிய திருநாள் நல்வாழ்த்துகள்! Heartfelt wishes of unity, peace, and happiness from Prashanth keransiya on PK Chat Official.',
    activeToday: false,
  });

  items.push({
    id: `greeting_christmas_${yearStamp}`,
    occasion: 'christmas',
    badge: isChristmas ? '🎄 Active Celebration' : '🎄 Christmas Wishes',
    emoji: '🎄✨',
    title: `Merry Christmas${nameSuffix}! · இனிய கிறிஸ்துமஸ் நல்வாழ்த்துகள்!`,
    founderName: 'Prashanth keransiya',
    body: 'உங்கள் இல்லத்தில் ஒற்றுமை, அமைதி மற்றும் மகிழ்ச்சி நிறைய எங்கள் சொந்த உறவினர் போல அன்புடன் பிரார்த்திக்கிறோம்! May your home overflow with unity, peace, and happiness this Christmas — warmly from Prashanth keransiya on PK Chat Official.',
    activeToday: isChristmas,
  });

  items.push({
    id: `greeting_newyear_${yearStamp}`,
    occasion: 'new_year',
    badge: isNewYear ? '🎆 Active Celebration' : '🎆 New Year Wishes',
    emoji: '🎆🥂',
    title: `Happy New Year${nameSuffix}! · இனிய புத்தாண்டு நல்வாழ்த்துகள்!`,
    founderName: 'Prashanth keransiya',
    body: 'புதிய ஆண்டில் உங்கள் குடும்பத்தில் ஒற்றுமை, அமைதி, ஆரோக்கியம் மற்றும் மகிழ்ச்சி பெருக எங்கள் சொந்த உறவினரைப் போல மனமார்ந்த பிரார்த்தனைகள்! Wishing you a safe, united, peaceful, and happy year ahead — warmly from Prashanth keransiya on PK Chat Official.',
    activeToday: isNewYear,
  });

  items.push({
    id: `greeting_ramzan_${yearStamp}`,
    occasion: 'ramzan',
    badge: '🌙 Ramzan & Eid Wishes',
    emoji: '🌙✨',
    title: `Ramzan Mubarak & Eid Wishes${nameSuffix}! · இனிய ரமலான் நல்வாழ்த்துகள்!`,
    founderName: 'Prashanth keransiya',
    body: 'அன்பான சொந்த உறவினர் போல பிரார்த்திக்கிறோம் — உங்கள் குடும்பத்தில் ஒற்றுமை, அமைதி மற்றும் மகிழ்ச்சி என்றென்றும் நிலைக்க இனிய ரமலான் நல்வாழ்த்துகள்! Warm wishes of unity, peace, and happiness from Prashanth keransiya on PK Chat Official.',
    activeToday: false,
  });

  // Synchronize special calendar greetings (Lover's Day, Women's Day, Mother's Day)
  const resolvedSpecials = resolveFestivalGreetings(now).filter(
    (g) => g.id !== 'new-year' && g.id !== 'christmas'
  );
  for (const fest of resolvedSpecials) {
    items.push({
      id: `greeting_${fest.id}_${yearStamp}`,
      occasion: 'special_day',
      badge: `🎉 ${fest.occasion}`,
      emoji: fest.id === 'mothers-day' ? '👩‍👧‍👦💖' : fest.id === 'womens-day' ? '🌸✨' : '❤️✨',
      title: `${fest.occasion}${nameSuffix}!`,
      founderName: 'Prashanth keransiya',
      body: `${fest.message} Heartfelt prayers for unity, peace, and happiness from Prashanth keransiya on PK Chat Official.`,
      activeToday: true,
    });
  }

  return items;
}

export function computeUnreadOfficialInboxCount(params: {
  uid?: string;
  notifications: OfficialSystemNotification[];
  disasterAlerts: DisasterAlert[];
  greetings: OfficialGreetingMessage[];
}): number {
  const readSet = new Set(getReadOfficialIds(params.uid));
  const unreadNotifs = params.notifications.filter((n) => !n.read && !readSet.has(n.id)).length;
  const unreadDisasters = params.disasterAlerts.filter((a) => !readSet.has(`disaster_${a.alertId}`)).length;
  const unreadActiveGreetings = params.greetings.filter((g) => g.activeToday && !readSet.has(g.id)).length;
  return unreadNotifs + unreadDisasters + unreadActiveGreetings;
}
