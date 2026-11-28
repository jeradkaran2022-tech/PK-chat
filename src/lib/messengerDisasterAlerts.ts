import { DisasterAlert } from '../types/pkchat';

export const TAMIL_AREAS: readonly string[] = [
  'jaffna',
  'யாழ்ப்பாணம்',
  'vavuniya',
  'வவுனியா',
  'kilinochchi',
  'கிளிநொச்சி',
  'mannar',
  'மன்னார்',
  'mullaitivu',
  'முல்லைத்தீவு',
  'trincomalee',
  'திருகோணமலை',
  'batticaloa',
  'மட்டக்களப்பு',
  'ampara',
  'அம்பாறை',
  'nuwara eliya',
  'நுவரெலியா',
  'badulla',
  'பதுளை',
  'tamil nadu',
  'தமிழ்நாடு',
  'chennai',
  'madurai',
  'coimbatore',
  'trichy',
];

export type DisasterAlertLanguageCode = 'en' | 'ta' | 'si' | 'hi' | 'ar';

export const DISASTER_ALERT_LANGUAGES: ReadonlyArray<{
  code: DisasterAlertLanguageCode;
  label: string;
}> = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'si', label: 'සිංහල' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ar', label: 'العربية' },
];

export interface PKFamilyCareLocation {
  city?: string;
  region?: string;
  country?: string;
  language?: DisasterAlertLanguageCode;
}

export interface PKFamilyCareMessage {
  language: DisasterAlertLanguageCode;
  headline: string;
  subtext: string;
  signOff: string;
}

const LOCALIZED_SAFETY_CARE_PACKS: Record<
  DisasterAlertLanguageCode,
  Omit<PKFamilyCareMessage, 'language'>
> = {
  en: {
    headline: 'Please take care and stay safe with your family.',
    subtext: 'Follow official local guidance and tap SOS immediately if you need emergency help.',
    signOff: 'With care for your well-being — Prashanth Keransiya',
  },
  ta: {
    headline: 'தயவுசெய்து உங்கள் குடும்பத்துடன் கவனமாகவும் பாதுகாப்பாகவும் இருங்கள்.',
    subtext: 'அதிகாரப்பூர்வ உள்ளூர் வழிகாட்டுதலைப் பின்பற்றுங்கள்; அவசர உதவிக்கு SOS பொத்தானைப் பயன்படுத்துங்கள்.',
    signOff: 'உங்கள் நலனில் அக்கறையுடன் — Prashanth Keransiya',
  },
  si: {
    headline: 'කරුණාකර ඔබේ පවුලේ අය සමඟ ප්‍රවේශමෙන් හා ආරක්ෂිතව සිටින්න.',
    subtext: 'නිල දේශීය උපදෙස් පිළිපදින්න; හදිසි උපකාර සඳහා වහාම SOS භාවිතා කරන්න.',
    signOff: 'ඔබේ යහපැවැත්ම පතමින් — Prashanth Keransiya',
  },
  hi: {
    headline: 'कृपया अपने परिवार के साथ सावधानी बरतें और सुरक्षित रहें।',
    subtext: 'आधिकारिक स्थानीय निर्देशों का पालन करें और आपातकालीन मदद के लिए तुरंत SOS दबाएं।',
    signOff: 'आपकी सुरक्षा की कामना के साथ — Prashanth Keransiya',
  },
  ar: {
    headline: 'يرجى توخي الحذر والبقاء بأمان مع عائلتك.',
    subtext: 'اتبع الإرشادات الرسمية المحلية واضغط على SOS فوراً إذا احتجت إلى مساعدة طارئة.',
    signOff: 'مع أطيب التمنيات بسلامتكم — Prashanth Keransiya',
  },
};

export function getPKFamilyCareMessage({
  language = 'en',
}: PKFamilyCareLocation = {}): PKFamilyCareMessage {
  const safeLang: DisasterAlertLanguageCode =
    language && language in LOCALIZED_SAFETY_CARE_PACKS ? language : 'en';
  const pack = LOCALIZED_SAFETY_CARE_PACKS[safeLang];
  return {
    language: safeLang,
    headline: pack.headline,
    subtext: pack.subtext,
    signOff: pack.signOff,
  };
}

export interface MessengerDisasterAlertItem {
  id: string;
  title: string;
  description: string;
  country: string;
  region: string;
  source: string;
  issuedAt?: unknown;
  isMajor?: boolean;
  severity?: string;
  wideScale?: boolean;
}

export function toAlertTimestampMs(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof val === 'object') {
    const rec = val as { toDate?: () => Date; toMillis?: () => number; seconds?: number };
    if (typeof rec.toMillis === 'function') return rec.toMillis();
    if (typeof rec.toDate === 'function') return rec.toDate().getTime();
    if (typeof rec.seconds === 'number') return rec.seconds * 1000;
  }
  return 0;
}

export function formatMessengerAlertTimeLabel(issuedAt: unknown): string {
  const ms = toAlertTimestampMs(issuedAt);
  if (!ms) return 'Live';
  try {
    return new Date(ms).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Live';
  }
}

export function mapDisasterAlertToMessengerItem(
  alert: DisasterAlert
): MessengerDisasterAlertItem {
  const description =
    alert.evacuationInstructions ||
    alert.shelterAdvice ||
    `${alert.hazardType.replace(/_/g, ' ')} official advisory for ${alert.location || alert.country || 'affected zone'}.`;

  return {
    id: alert.alertId,
    title: alert.title,
    description,
    country: alert.country || '',
    region: alert.location || alert.country || 'Alert Zone',
    source: alert.officialSource || 'Official Authority',
    issuedAt: alert.issuedAt,
    isMajor: alert.severity === 'extreme' || alert.severity === 'warning',
    severity: alert.severity,
    wideScale: alert.severity === 'extreme',
  };
}

export function filterRelevantMessengerAlerts(
  allAlerts: MessengerDisasterAlertItem[],
  userCountry: string
): MessengerDisasterAlertItem[] {
  const normalizedUserCountry = userCountry.trim().toLowerCase();

  return [...allAlerts]
    .filter((alert) => {
      const alertCountry = (alert.country || '').trim().toLowerCase();
      const isSameCountry =
        Boolean(normalizedUserCountry) &&
        Boolean(alertCountry) &&
        (alertCountry === normalizedUserCountry ||
          alertCountry.includes(normalizedUserCountry) ||
          normalizedUserCountry.includes(alertCountry));

      const isMajorWideAlert =
        alert.isMajor === true ||
        alert.severity === 'major' ||
        alert.severity === 'extreme' ||
        alert.severity === 'warning' ||
        alert.wideScale === true;

      return isSameCountry || isMajorWideAlert;
    })
    .sort((a, b) => toAlertTimestampMs(b.issuedAt) - toAlertTimestampMs(a.issuedAt));
}
