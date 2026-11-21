import type { MobileSubscriptionState } from '../types/models';

export const FREE_TRIAL_DAYS = 30;
export const ANNUAL_SUBSCRIPTION_PRICE_USD = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export const VIP_FOUNDER_NUMBERS = [
  '0760852503',
  '0712197111',
  '0717860693',
  '0753440226',
] as const;

export function normalizeDigits(phone?: string | null): string {
  return phone ? phone.replace(/\D/g, '') : '';
}

export function isVipFounderNumber(phone?: string | null): boolean {
  const digits = normalizeDigits(phone);
  if (!digits) return false;
  return VIP_FOUNDER_NUMBERS.some((vip) => {
    const core = vip.startsWith('0') ? vip.slice(1) : vip;
    return digits === vip || digits === `94${core}` || digits.endsWith(core);
  });
}

export function createRegistrationTrialState(nowMs = Date.now()): MobileSubscriptionState {
  return {
    plan: 'trial_30_day',
    status: 'trialing',
    trialStartAtMs: nowMs,
    trialEndAtMs: nowMs + FREE_TRIAL_DAYS * DAY_MS,
    annualPriceUsd: ANNUAL_SUBSCRIPTION_PRICE_USD,
    autoRenew: true,
  };
}

export interface SubscriptionSummary {
  hasAccess: boolean;
  isVipFounder: boolean;
  requiresAnnualRenewal: boolean;
  trialDaysRemaining: number;
  badgeText: string;
  descriptionText: string;
}

export function evaluateSubscription(
  phoneNumber: string | null | undefined,
  state: MobileSubscriptionState | null | undefined,
  nowMs = Date.now()
): SubscriptionSummary {
  if (isVipFounderNumber(phoneNumber)) {
    return {
      hasAccess: true,
      isVipFounder: true,
      requiresAnnualRenewal: false,
      trialDaysRemaining: Infinity,
      badgeText: 'VIP Founder · Lifetime Free',
      descriptionText: 'Founder subscription bypass active ($0.00/year).',
    };
  }

  const effective = state || createRegistrationTrialState(nowMs);
  const hasActiveAnnual =
    effective.plan === 'annual_10_usd' &&
    effective.status === 'active' &&
    (!effective.currentPeriodEndMs || effective.currentPeriodEndMs >= nowMs);

  if (hasActiveAnnual) {
    return {
      hasAccess: true,
      isVipFounder: false,
      requiresAnnualRenewal: false,
      trialDaysRemaining: 0,
      badgeText: 'Active · $10.00 USD / year',
      descriptionText: 'Annual PK Chat renewal active at $10.00 USD/year.',
    };
  }

  const daysCompleted = Math.max(0, Math.floor((nowMs - effective.trialStartAtMs) / DAY_MS));
  const daysRemaining = Math.max(0, FREE_TRIAL_DAYS - daysCompleted);
  const trialActive = effective.status !== 'expired' && daysCompleted <= FREE_TRIAL_DAYS;

  if (trialActive) {
    return {
      hasAccess: true,
      isVipFounder: false,
      requiresAnnualRenewal: false,
      trialDaysRemaining: daysRemaining,
      badgeText: `30-Day Free Trial · ${daysRemaining}d left`,
      descriptionText: `Free 30-day registration trial (${daysRemaining} days left), then mandatory $10.00 USD/year renewal.`,
    };
  }

  return {
    hasAccess: false,
    isVipFounder: false,
    requiresAnnualRenewal: true,
    trialDaysRemaining: 0,
    badgeText: 'Trial Ended · $10.00 USD / year Required',
    descriptionText: 'Your 30-day free trial has ended. Renew for $10.00 USD/year to continue.',
  };
}
