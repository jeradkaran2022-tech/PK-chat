/**
 * PK Chat - Unified Core Engine & Business Track Controller
 * Single Source of Truth for Mobile & Play Store Readiness
 */

export const PK_CONFIG = Object.freeze({
  brandName: 'PK Chat',
  theme: {
    primaryBlue: '#0B5ED7',
    lightBlueSurface: '#EAF2FF',
    surfaceWhite: '#FFFFFF',
    ecgWaveColor: '#FFFFFF',
    ecgContainerBlue: '#084298',
  },
  billing: {
    trialDays: 90,
    annualSubscriptionUSD: 10,
    ads: {
      smallUSD: 5,
      largeUSD: 10,
      unlimitedAnnualUSD: 100,
    },
  },
  // Normalized digits-only phone registry (prevents 0 vs +94 duplicate mismatches)
  vipNumbersNormalized: new Set<string>([
    '0760852503',
    '94760852503',
    '0712197111',
    '94712197111',
    '0717860693',
    '94717860693',
    '0753440226',
    '94753440226',
  ]),
  adminNumbersNormalized: new Set<string>([
    '0717860693',
    '94717860693',
  ]),
  navigationTabs: ['Home', 'Chats', 'Updates', 'Calls'] as const,
  supportedLanguages: ['Tamil', 'Tanglish', 'English', '130+ Global Languages'] as const,
  bannedTermsInUI: ['ai', 'gemini', 'robot', 'bot', 'assistant', 'auto-generated', 'openai', 'claude'] as const,
});

export interface PKAccessProfile {
  phoneDigits: string;
  isVip: boolean;
  isAdmin: boolean;
  hasLifetimeFreeAccess: boolean;
  isExemptFromAdFees: boolean;
  isExemptFromStatusLimits: boolean;
  trialDays: number;
  annualFeeUSD: number;
}

export type PKBusinessAdPackage = 'small' | 'large' | 'unlimited_annual';

export interface PKUnifiedBusinessAd {
  id: string;
  mode: 'General' | 'Business';
  advertiser: {
    name: string;
    phoneDigits: string;
    verified: boolean;
  };
  targeting: {
    targetScope: 'ALL_COUNTRIES' | 'SELECTED_COUNTRIES';
    allCountries: boolean;
    countries: string[];
  };
  pricing: {
    packageType: PKBusinessAdPackage;
    chargedUSD: number;
    waivedByPrivileges: boolean;
  };
  content: {
    headline: string;
    description: string;
    directCallEnabled: boolean;
  };
  statusVisible: boolean;
  createdAt: string;
}

export interface PKReadinessReport {
  readyForPlayStorePreparation: boolean;
  checkedAt: string;
  configSummary: {
    brand: string;
    theme: string;
    trialDays: number;
    annualFeeUSD: number;
    adPackagesUSD: {
      smallUSD: number;
      largeUSD: number;
      unlimitedAnnualUSD: number;
    };
  };
  issues: string[];
}

/**
 * Normalizes any phone number to digits-only format so local (07...)
 * and international (+947...) representations map cleanly without duplicates.
 */
export function normalizePhoneNumber(rawPhone = ''): string {
  return String(rawPhone ?? '').replace(/\D/g, '');
}

function matchesNormalizedRegistry(digits: string, registry: ReadonlySet<string>): boolean {
  if (!digits) return false;
  if (registry.has(digits)) return true;
  for (const entry of registry) {
    const core9 = entry.startsWith('94')
      ? entry.slice(2)
      : entry.startsWith('0')
        ? entry.slice(1)
        : entry;
    if (
      core9.length >= 9 &&
      (digits === core9 ||
        digits === `0${core9}` ||
        digits === `94${core9}` ||
        digits === `0094${core9}` ||
        digits.endsWith(core9))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Resolves user access privileges (VIP / Admin / Standard Trial & Subscription).
 */
export function resolveAccessProfile(rawPhone = ''): PKAccessProfile {
  const digits = normalizePhoneNumber(rawPhone);
  const isVip = matchesNormalizedRegistry(digits, PK_CONFIG.vipNumbersNormalized);
  const isAdmin = matchesNormalizedRegistry(digits, PK_CONFIG.adminNumbersNormalized);

  return {
    phoneDigits: digits,
    isVip,
    isAdmin,
    hasLifetimeFreeAccess: isVip || isAdmin,
    isExemptFromAdFees: isVip || isAdmin,
    isExemptFromStatusLimits: isVip || isAdmin,
    trialDays: isVip || isAdmin ? 0 : PK_CONFIG.billing.trialDays,
    annualFeeUSD: isVip || isAdmin ? 0 : PK_CONFIG.billing.annualSubscriptionUSD,
  };
}

/**
 * Business Track Ad Builder
 * Supports effortless "All Countries" selection or specific country codes.
 */
export function createBusinessAd({
  advertiserPhone,
  advertiserName,
  mode = 'Business',
  adPackage = 'small',
  selectAllCountries = true,
  selectedCountries = [],
  headline = '',
  description = '',
  directCallEnabled = true,
}: {
  advertiserPhone?: string;
  advertiserName: string;
  mode?: 'General' | 'Business';
  adPackage?: PKBusinessAdPackage;
  selectAllCountries?: boolean;
  selectedCountries?: string[];
  headline?: string;
  description?: string;
  directCallEnabled?: boolean;
}): PKUnifiedBusinessAd {
  const access = resolveAccessProfile(advertiserPhone || '');

  const packagePrices: Record<PKBusinessAdPackage, number> = {
    small: PK_CONFIG.billing.ads.smallUSD,
    large: PK_CONFIG.billing.ads.largeUSD,
    unlimited_annual: PK_CONFIG.billing.ads.unlimitedAnnualUSD,
  };

  const basePrice = packagePrices[adPackage] ?? PK_CONFIG.billing.ads.smallUSD;
  const finalChargeUSD = access.isExemptFromAdFees ? 0 : basePrice;

  const targetScope = selectAllCountries ? 'ALL_COUNTRIES' : 'SELECTED_COUNTRIES';
  const normalizedCountries = selectAllCountries
    ? ['ALL']
    : [
        ...new Set(
          (selectedCountries || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean)
        ),
      ];

  return {
    id: `pk_ad_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    mode,
    advertiser: {
      name: sanitizePublicText(advertiserName, 'PK Business'),
      phoneDigits: access.phoneDigits,
      verified: true,
    },
    targeting: {
      targetScope,
      allCountries: selectAllCountries,
      countries: normalizedCountries,
    },
    pricing: {
      packageType: adPackage,
      chargedUSD: finalChargeUSD,
      waivedByPrivileges: access.isExemptFromAdFees,
    },
    content: {
      headline: sanitizePublicText(headline, 'PK Chat Business'),
      description: sanitizePublicText(description, 'Verified Business Listing'),
      directCallEnabled,
    },
    statusVisible: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Filters ads cleanly for a user's country while ensuring "ALL_COUNTRIES"
 * ads always appear everywhere without friction.
 */
export function getAdsForUserCountry<
  T extends {
    statusVisible?: boolean;
    targeting?: {
      allCountries?: boolean;
      targetScope?: string;
      countries?: string[];
    };
  },
>(adsList: T[] = [], userCountryCode = ''): T[] {
  const userCode = String(userCountryCode).trim().toUpperCase();
  return adsList.filter((ad) => {
    if (!ad || ad.statusVisible === false) return false;
    if (ad.targeting?.allCountries || ad.targeting?.targetScope === 'ALL_COUNTRIES') {
      return true;
    }
    const list = (ad.targeting?.countries || []).map((c) => String(c).trim().toUpperCase());
    if (list.includes('ALL') || list.includes('ALL_COUNTRIES') || list.includes('ALL COUNTRY') || list.includes('GLOBAL')) {
      return true;
    }
    return userCode ? list.includes(userCode) : true;
  });
}

/**
 * Ensures zero external AI wording or branding leaks into user-facing text.
 */
export function sanitizePublicText(text = '', fallback = 'PK Chat'): string {
  let clean = String(text ?? '');
  for (const term of PK_CONFIG.bannedTermsInUI) {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    clean = clean.replace(regex, 'PK');
  }
  clean = clean.replace(/\bPK\s+PK\b/gi, 'PK');
  clean = clean.replace(/\s{2,}/g, ' ').trim();
  return clean || fallback;
}

/**
 * Full System Self-Check for Play Store & Mobile Readiness Verification.
 */
export function runPKChatReadinessCheck(sampleAds: PKUnifiedBusinessAd[] = []): PKReadinessReport {
  const issues: string[] = [];

  // 1. Verify VIP & Admin normalization has no duplicate ambiguity
  const testCheck = resolveAccessProfile('+94717860693');
  const localCheck = resolveAccessProfile('0717860693');
  if (testCheck.phoneDigits !== '94717860693' || !testCheck.isAdmin || !localCheck.isVip) {
    issues.push('VIP/Admin phone normalization check failed.');
  }

  // 2. Verify All Countries behavior
  const globalAd = createBusinessAd({
    advertiserPhone: '+94717860693',
    advertiserName: 'PK Chat Launch Partner',
    adPackage: 'unlimited_annual',
    selectAllCountries: true,
    headline: 'PK Chat Global Launch',
    description: 'Available across all countries.',
  });
  const matchedElsewhere = getAdsForUserCountry([globalAd, ...sampleAds], 'GB');
  if (!matchedElsewhere.some((a) => a.id === globalAd.id) || globalAd.pricing.chargedUSD !== 0) {
    issues.push('All Countries ad visibility or VIP exemption check failed.');
  }

  // 3. Verify billing numbers
  if (
    PK_CONFIG.billing.trialDays !== 90 ||
    PK_CONFIG.billing.annualSubscriptionUSD !== 10 ||
    PK_CONFIG.billing.ads.smallUSD !== 5 ||
    PK_CONFIG.billing.ads.largeUSD !== 10 ||
    PK_CONFIG.billing.ads.unlimitedAnnualUSD !== 100
  ) {
    issues.push('Subscription trial/annual or ad pricing mismatch.');
  }

  return {
    readyForPlayStorePreparation: issues.length === 0,
    checkedAt: new Date().toISOString(),
    configSummary: {
      brand: PK_CONFIG.brandName,
      theme: PK_CONFIG.theme.primaryBlue,
      trialDays: PK_CONFIG.billing.trialDays,
      annualFeeUSD: PK_CONFIG.billing.annualSubscriptionUSD,
      adPackagesUSD: PK_CONFIG.billing.ads,
    },
    issues,
  };
}
