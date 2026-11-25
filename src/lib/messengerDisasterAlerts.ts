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

export interface PKFamilyCareLocation {
  city?: string;
  region?: string;
  country?: string;
}

export interface PKFamilyCareMessage {
  language: 'ta' | 'en';
  headline: string;
  subtext: string;
}

export function getPKFamilyCareMessage({
  city = '',
  region = '',
  country = '',
}: PKFamilyCareLocation = {}): PKFamilyCareMessage {
  const combinedLocation = `${city} ${region} ${country}`.toLowerCase();

  const isTamilRegion = TAMIL_AREAS.some((area) =>
    combinedLocation.includes(area.toLowerCase())
  );

  if (isTamilRegion) {
    return {
      language: 'ta',
      headline:
        'PK Chat தரப்பு மற்றும் உங்கள் குடும்பத்தினர் சார்பாக: நீங்கள் கவனமாகவும் பாதுகாப்பாகவும் இருங்கள்.',
      subtext:
        'பாதுகாப்பான இடத்தில் இருங்கள்; அவசர உதவிக்கு SOS வசதியைப் பயன்படுத்துங்கள்.',
    };
  }

  return {
    language: 'en',
    headline:
      'From PK Chat and on behalf of your family: Please stay careful and stay safe.',
    subtext:
      'Please stay in a safe place and use SOS if you need emergency help.',
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
