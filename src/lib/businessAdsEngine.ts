import type { AdReportCategory, AdScaleTier, SponsoredPublicAd } from '../types/pkchat';
import { detectExplicitSexualContent } from './securityShield';
import { sanitizePublicText } from './pkCoreController';

export const SPONSORED_TARGET_COUNTRIES = [
  'All Country',
  'Global',
  'Sri Lanka',
  'United Kingdom',
  'United States',
  'India',
  'United Arab Emirates',
  'Singapore',
  'Australia',
  'Canada',
  'Malaysia',
  'Germany',
  'France',
] as const;

export function normalizeTargetCountries(
  targetCountry?: string,
  targetCountries?: string[]
): string[] {
  const fromArray = Array.isArray(targetCountries)
    ? targetCountries.map((c) => c.trim()).filter(Boolean)
    : [];
  const merged = fromArray.length > 0 ? fromArray : targetCountry?.trim() ? [targetCountry.trim()] : ['All Country'];
  const unique = Array.from(new Set(merged));
  if (
    unique.some((c) => {
      const low = c.toLowerCase();
      return low === 'all country' || low === 'all countries' || low === 'all_countries' || low === 'all' || low === 'global';
    })
  ) {
    return ['All Country'];
  }
  return unique;
}

export function formatTargetCountriesLabel(ad: Pick<SponsoredPublicAd, 'targetCountry' | 'targetCountries'>): string {
  const list = normalizeTargetCountries(ad.targetCountry, ad.targetCountries);
  if (list.length === 1 && list[0] === 'All Country') {
    return 'All Country';
  }
  if (list.length <= 2) {
    return list.join(', ');
  }
  return `${list.slice(0, 2).join(', ')} +${list.length - 2}`;
}

export function getAdsBySameSeller(
  ads: SponsoredPublicAd[],
  sellerUid: string,
  excludeSuspended = true
): SponsoredPublicAd[] {
  return ads
    .filter((ad) => ad.sellerUid === sellerUid && (!excludeSuspended || ad.status !== 'suspended'))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export const SPONSORED_TARGET_LANGUAGES = [
  'English',
  'Tamil',
  'Sinhala',
  'Hindi',
  'Arabic',
  'French',
  'German',
  'Malay',
  'Chinese',
  'All Languages',
] as const;

export const BUSINESS_CATEGORIES = [
  'Retail & Local Shop',
  'Food & Bakery',
  'Electronics & Mobile',
  'Education & Tutoring',
  'Fashion & Crafts',
  'Home & Repair Services',
  'Health & Wellness',
  'Wholesale & Distribution',
] as const;

export const AD_REPORT_REASON_LABELS: Record<AdReportCategory, string> = {
  spam_misleading: 'Spam or Misleading Offer',
  prohibited_scam: 'Prohibited Item, Fraud, or Scam',
  explicit_adult: 'Explicit, Adult, or Offensive Content',
  harassment_hate: 'Hate Speech or Harassment',
  counterfeit_ip: 'Counterfeit Goods or Copyright Violation',
  fake_business: 'Impersonation / Unverified Business',
};

const EXPLICIT_OR_PROHIBITED_REGEX =
  /\b(porn|xxx|nude|nudity|nsfw|escort|sex\s*shop|onlyfans|gambling\s*hack|carding|cvv\s*dump|counterfeit\s*cash|cocaine|heroin|methamphetamine|buy\s*weapons|illegal\s*firearm|kill\s*for\s*hire|phishing\s*kit|malware\s*exploit)\b/i;

/**
 * Deterministic policy guard before AI scoring: catches prohibited/NSFW/scam keywords immediately.
 */
export function preScreenAdContentSafety(params: {
  title: string;
  description: string;
  businessName: string;
  category: string;
}): { safe: boolean; reason?: string } {
  const combined = `${params.businessName} ${params.category} ${params.title} ${params.description}`;
  const explicitCheck = detectExplicitSexualContent(combined);
  if (!explicitCheck.safe) {
    return {
      safe: false,
      reason: sanitizePublicText(explicitCheck.blockedReason || 'Blocked by PK Chat Safety Shield.'),
    };
  }
  if (EXPLICIT_OR_PROHIBITED_REGEX.test(combined)) {
    return {
      safe: false,
      reason:
        'Pre-publish safety filter blocked prohibited, sexual/explicit, or fraudulent content before publication.',
    };
  }
  if (params.title.trim().length < 3 || params.description.trim().length < 6) {
    return {
      safe: false,
      reason: 'Please provide a clear business title and description before evaluating.',
    };
  }
  return { safe: true };
}

/**
 * Deterministic ad-scale tier fallback when offline or AI key unavailable.
 * Small Business / Short Ad => 'small' ($5), Large Business / Extended Campaign => 'large' ($10).
 */
export function classifyAdScaleDeterministic(params: {
  title: string;
  description: string;
  mediaType: 'image' | 'video';
  durationSeconds?: number;
  targetCountry?: string;
  targetCountries?: string[];
  enableLiveClass?: boolean;
}): AdScaleTier {
  const text = `${params.title} ${params.description}`.toLowerCase();
  const largeKeywords = /\b(wholesale|enterprise|global|chain|supermarket|franchise|multi-city|nationwide|mega\s*sale|factory|distributor|export|campaign)\b/;
  const isLongVideo = params.mediaType === 'video' && (params.durationSeconds || 0) > 25;
  const targets = normalizeTargetCountries(params.targetCountry, params.targetCountries);
  const isGlobalOrMultiReach =
    targets.some((t) => t.toLowerCase() === 'global' || t.toLowerCase() === 'all country') ||
    targets.length > 1;

  if (
    largeKeywords.test(text) ||
    isLongVideo ||
    isGlobalOrMultiReach ||
    params.description.trim().length > 180 ||
    Boolean(params.enableLiveClass)
  ) {
    return 'large';
  }
  return 'small';
}

/**
 * Client-side Canvas image compression for zero-lag Sponsored Public Status loading.
 * Resizes images cleanly to max 1080px and compresses JPEG/WebP under ~140 KB.
 */
export async function compressAdImageFile(file: File | Blob): Promise<{
  dataUrl: string;
  mimeType: string;
  originalBytes: number;
  compressedBytes: number;
}> {
  if (typeof document === 'undefined' || typeof FileReader === 'undefined') {
    throw new Error('Image compression requires a browser canvas environment.');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Unable to read image file.'));
    };
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Unsupported or corrupted image format.'));
    el.src = rawDataUrl;
  });

  const maxDim = 1080;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const width = Math.max(1, Math.round((img.naturalWidth || 800) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || 600) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for image compression.');
  }
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.78;
  let outputUrl = canvas.toDataURL('image/jpeg', quality);
  while (outputUrl.length > 180_000 && quality > 0.42) {
    quality -= 0.1;
    outputUrl = canvas.toDataURL('image/jpeg', quality);
  }

  return {
    dataUrl: outputUrl,
    mimeType: 'image/jpeg',
    originalBytes: file.size || rawDataUrl.length,
    compressedBytes: Math.round((outputUrl.length * 3) / 4),
  };
}

export function getBlockedBusinessUids(viewerUid?: string): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const key = `pk_blocked_business_uids_${viewerUid || 'default'}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function addBlockedBusinessUid(sellerUid: string, viewerUid?: string): string[] {
  const existing = getBlockedBusinessUids(viewerUid);
  const next = Array.from(new Set([...existing, sellerUid]));
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`pk_blocked_business_uids_${viewerUid || 'default'}`, JSON.stringify(next));
    }
  } catch {
    // Ignore storage limits
  }
  return next;
}

export function filterPublicAdsForViewer(params: {
  ads: SponsoredPublicAd[];
  viewerUid?: string;
  country?: string;
  language?: string;
  blockedSellerUids?: string[];
}): SponsoredPublicAd[] {
  const blocked = new Set(params.blockedSellerUids || []);
  const country = (params.country || '').trim().toLowerCase();
  const language = (params.language || '').trim().toLowerCase();

  return params.ads.filter((ad) => {
    if (ad.status === 'suspended') return false;
    if (blocked.has(ad.sellerUid)) return false;
    const adTargets = normalizeTargetCountries(ad.targetCountry, ad.targetCountries).map((c) =>
      c.toLowerCase()
    );
    const adLang = ad.targetLanguage.trim().toLowerCase();
    const countryMatch =
      !country ||
      country === 'global' ||
      country === 'all country' ||
      adTargets.includes('global') ||
      adTargets.includes('all country') ||
      adTargets.includes(country);
    const langMatch =
      !language ||
      language === 'all languages' ||
      adLang === 'all languages' ||
      adLang === language ||
      adLang === 'english';
    return countryMatch && langMatch;
  });
}
