import type { PkChatUserMode, SubscriptionRecord } from '../types/pkchat';
import {
  PK_CONFIG,
  normalizePhoneNumber,
  resolveAccessProfile,
} from './pkCoreController';

export { resolveAccessProfile } from './pkCoreController';

/**
 * PK CHAT - VIP FREE ACCESS NUMBERS
 * Strictly 4 phone numbers (no names stored or displayed next to VIP numbers).
 */
export const VIP_FOUNDER_FREE_ACCESS_NUMBERS = [
  '+94760852503',
  '+94712197111',
  '+94717860693',
  '+94753440226',
] as const;

export const STANDARD_FREE_TRIAL_DAYS = PK_CONFIG.billing.trialDays; // 3 months (90 days)
export const STANDARD_ANNUAL_RENEWAL_DAYS = 365; // 12 months (1 year)
export const STANDARD_ANNUAL_PRICE_USD = PK_CONFIG.billing.annualSubscriptionUSD;
export const UNLIMITED_ADS_ANNUAL_PRICE_USD = PK_CONFIG.billing.ads.unlimitedAnnualUSD;
export const UNLIMITED_ADS_DURATION_DAYS = 365;

export const GOOGLE_PLAY_BILLING_CONFIG = {
  billingLibraryVersion: '8.0.0',
  supportedLibraryRange: '8.0.0+ / 9.x',
  annualSubscriptionSku: 'pk_pro_annual_10usd',
  smallAdPublishSku: 'pk_ad_small_5usd',
  largeAdPublishSku: 'pk_ad_large_10usd',
  unlimitedAdsAnnualSku: 'pk_ad_unlimited_100usd',
  defaultSmallAdPriceUsd: 5,
  defaultLargeAdPriceUsd: 10,
  defaultUnlimitedAdPriceUsd: UNLIMITED_ADS_ANNUAL_PRICE_USD,
  generalSubscription: {
    sku: 'pk_pro_annual_10usd',
    priceUsd: STANDARD_ANNUAL_PRICE_USD,
    trialDays: STANDARD_FREE_TRIAL_DAYS,
    renewalDays: STANDARD_ANNUAL_RENEWAL_DAYS,
  },
  adTiers: {
    small: {
      sku: 'pk_ad_small_5usd',
      priceUsd: 5,
    },
    large: {
      sku: 'pk_ad_large_10usd',
      priceUsd: 10,
    },
  },
  unlimitedPackage: {
    sku: 'pk_ad_unlimited_100usd',
    priceUsd: UNLIMITED_ADS_ANNUAL_PRICE_USD,
    durationDays: UNLIMITED_ADS_DURATION_DAYS,
  },
} as const;

export const USER_MODE_STORAGE_KEY = 'pk_chat_user_mode_v1';
export const USER_MODE_CHANGED_EVENT = 'pkchat-user-mode-changed';

export function getActiveUserMode(uid?: string): PkChatUserMode {
  try {
    if (typeof localStorage === 'undefined') return 'general';
    const key = uid ? `${USER_MODE_STORAGE_KEY}_${uid}` : USER_MODE_STORAGE_KEY;
    const raw = localStorage.getItem(key) || localStorage.getItem(USER_MODE_STORAGE_KEY);
    return raw === 'business' ? 'business' : 'general';
  } catch {
    return 'general';
  }
}

export function setActiveUserMode(mode: PkChatUserMode, uid?: string): PkChatUserMode {
  const clean: PkChatUserMode = mode === 'business' ? 'business' : 'general';
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(USER_MODE_STORAGE_KEY, clean);
      if (uid) {
        localStorage.setItem(`${USER_MODE_STORAGE_KEY}_${uid}`, clean);
      }
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(USER_MODE_CHANGED_EVENT, { detail: clean }));
    }
  } catch {
    // Safe fallback under restricted iframe storage
  }
  return clean;
}

export function normalizePhoneDigits(phone?: string | null): string {
  return normalizePhoneNumber(phone || '');
}

/**
 * Checks whether a phone number matches one of the VIP numbers
 * across canonical E.164 (+947XXXXXXXX), 947XXXXXXXX, 00947XXXXXXXX,
 * local (07XXXXXXXX), or 9-digit local core formats.
 */
export function isVipFounderFreeNumber(phone?: string | null): boolean {
  return resolveAccessProfile(phone || '').isVip;
}

export function isAdminPrivilegedNumber(phone?: string | null): boolean {
  return resolveAccessProfile(phone || '').isAdmin;
}

export function hasFreeVipStatusAndAdAccess(phone?: string | null): boolean {
  return resolveAccessProfile(phone || '').hasLifetimeFreeAccess;
}

/**
 * Subscription Check Logic:
 * - 4 VIP numbers: Lifetime 100% free ($0.00) access across subscription, business ads, and video status.
 * - Regular users: 90-day (3-month) free trial, then $10/year (once every 12 months) via Google Play Billing ONLY.
 */
export function verifyUserSubscriptionBilling(
  userPhoneNumber: string | null | undefined,
  trialDaysCompleted: number
): boolean {
  if (isVipFounderFreeNumber(userPhoneNumber)) {
    return true; // Subscription fee bypassed completely
  }

  const safeDays = Number.isFinite(trialDaysCompleted) ? Math.max(0, trialDaysCompleted) : 0;
  return safeDays <= STANDARD_FREE_TRIAL_DAYS;
}

function toTimestampMs(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object') {
    const maybeTs = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTs.toDate === 'function') {
      const d = maybeTs.toDate();
      return d instanceof Date ? d.getTime() : null;
    }
    if (typeof maybeTs.seconds === 'number') {
      return maybeTs.seconds * 1000;
    }
  }
  return null;
}

export function computeTrialDaysCompleted(
  trialStartAt?: unknown,
  nowMs = Date.now()
): number {
  const startMs = toTimestampMs(trialStartAt);
  if (startMs === null || nowMs <= startMs) return 0;
  return Math.floor((nowMs - startMs) / (24 * 60 * 60 * 1000));
}

export interface SubscriptionEntitlement {
  isVipFounder: boolean;
  hasAccess: boolean;
  requiresPaidSubscription: boolean;
  trialDaysCompleted: number;
  trialDaysRemaining: number;
  annualPriceUsd: number;
  badgeLabel: string;
  summaryText: string;
}

export function getSubscriptionEntitlement(params: {
  phoneNumber?: string | null;
  subscription?: SubscriptionRecord | null;
  nowMs?: number;
}): SubscriptionEntitlement {
  const { phoneNumber, subscription, nowMs = Date.now() } = params;
  const isVipFounder = isVipFounderFreeNumber(phoneNumber);

  if (isVipFounder) {
    return {
      isVipFounder: true,
      hasAccess: true,
      requiresPaidSubscription: false,
      trialDaysCompleted: 0,
      trialDaysRemaining: Infinity,
      annualPriceUsd: 0,
      badgeLabel: 'VIP Access · Lifetime 100% Free ($0)',
      summaryText: '100% free ($0.00) VIP access across Subscription, Business Ads, and Video Status.',
    };
  }

  const trialDaysCompleted = computeTrialDaysCompleted(subscription?.trialStartAt, nowMs);
  const trialDaysRemaining = Math.max(0, STANDARD_FREE_TRIAL_DAYS - trialDaysCompleted);

  const periodEndMs = toTimestampMs(subscription?.currentPeriodEnd);
  const hasPaidPeriod =
    subscription?.plan === 'pro_monthly' &&
    subscription?.status === 'active' &&
    (periodEndMs === null || periodEndMs >= nowMs);

  const trialValid =
    subscription?.status !== 'expired' &&
    verifyUserSubscriptionBilling(phoneNumber, trialDaysCompleted);

  const hasAccess = hasPaidPeriod || trialValid;

  if (hasPaidPeriod) {
    return {
      isVipFounder: false,
      hasAccess: true,
      requiresPaidSubscription: false,
      trialDaysCompleted,
      trialDaysRemaining: 0,
      annualPriceUsd: STANDARD_ANNUAL_PRICE_USD,
      badgeLabel: 'Active · $10/year (12 Months)',
      summaryText: 'PK CHAT Annual Subscription active ($10.00 once every 12 months via Google Play Store Billing).',
    };
  }

  if (trialValid) {
    return {
      isVipFounder: false,
      hasAccess: true,
      requiresPaidSubscription: false,
      trialDaysCompleted,
      trialDaysRemaining,
      annualPriceUsd: STANDARD_ANNUAL_PRICE_USD,
      badgeLabel: `90-Day (3-Month) Free Trial · ${trialDaysRemaining}d left`,
      summaryText: `Free 3-month (90-day) trial active (${trialDaysRemaining} days remaining), then $10.00/year (once every 12 months) via Google Play Store Billing.`,
    };
  }

  return {
    isVipFounder: false,
    hasAccess: false,
    requiresPaidSubscription: true,
    trialDaysCompleted,
    trialDaysRemaining: 0,
    annualPriceUsd: STANDARD_ANNUAL_PRICE_USD,
    badgeLabel: '3-Month Trial Ended · $10/year Required',
    summaryText: '90-day (3-month) free trial completed. Activate $10.00/year Google Play Store Billing subscription (once every 12 months) to continue.',
  };
}
