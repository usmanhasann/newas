/**
 * In-app purchase product configuration (App Store / Google Play), client revisions 10/14 p.32-38.
 *
 * These are the EXACT ids the subscriptions must be created with (see DEPLOY.md, "In-app purchases"):
 *  - App Store Connect: one subscription group "LYSM Premium" holding two auto-renewable
 *    subscriptions, `lysm.premium.annual` (1 year, with a 5-day free trial introductory offer for new
 *    subscribers) and `lysm.premium.monthly` (1 month, no free trial).
 *  - Google Play Console: two subscriptions with the same ids. `lysm.premium.annual` has one
 *    auto-renewing base plan `annual` (1 year) and a free-trial offer `free-trial` on it (5 days,
 *    eligibility "new customers"); `lysm.premium.monthly` has one base plan `monthly` (1 month).
 * Prices are set in the stores (the app never hardcodes them, p.36). The ids are not secrets.
 */
import type { PurchasePlatform } from '@app-types/database';

export type PlanId = 'monthly' | 'yearly';

export const IAP_PRODUCT_IDS: Record<PurchasePlatform, Record<PlanId, string>> = {
  ios: {
    monthly: 'lysm.premium.monthly',
    yearly: 'lysm.premium.annual',
  },
  android: {
    monthly: 'lysm.premium.monthly',
    yearly: 'lysm.premium.annual',
  },
};

/** Google Play base plan of each subscription. */
export const ANDROID_BASE_PLANS: Record<PlanId, string> = {
  monthly: 'monthly',
  yearly: 'annual',
};

/** The Annual plan's 5-day free-trial offer on Google Play (App Store: the introductory offer). */
export const ANDROID_TRIAL_OFFER_ID = 'free-trial';

/** Every subscription product id, for one platform. */
export function allProductIds(platform: PurchasePlatform): string[] {
  return Object.values(IAP_PRODUCT_IDS[platform]).filter((id) => id.length > 0);
}

export function productIdFor(platform: PurchasePlatform, plan: PlanId): string | null {
  const id = IAP_PRODUCT_IDS[platform]?.[plan];
  return id && id.length > 0 ? id : null;
}

/** Which plan a store product id is, or null for anything else. */
export function planForProductId(
  platform: PurchasePlatform,
  productId: string,
): PlanId | null {
  const ids = IAP_PRODUCT_IDS[platform];
  if (!ids) return null;
  if (ids.yearly === productId) return 'yearly';
  if (ids.monthly === productId) return 'monthly';
  return null;
}

export function isIapConfigured(platform: PurchasePlatform): boolean {
  return !!productIdFor(platform, 'monthly') && !!productIdFor(platform, 'yearly');
}
