/**
 * In-app purchase types + the platform-independent service boundary (client revisions 10/14
 * p.32-38). The real implementation (nativeService.ts, expo-iap) sits behind IapService; web and
 * tests get a safe stand-in that never grants anything.
 */
import type { PlanId } from './products';
import type { StoreCatalog } from './storeCatalog';

export type { PlanId };

export type IapErrorCode =
  | 'not_configured' // the store has no products for us yet (store setup pending)
  | 'unavailable' // IAP not supported on this device/platform
  | 'canceled' // user dismissed the purchase sheet
  | 'network'
  | 'already_owned'
  | 'owned_elsewhere' // this store subscription already belongs to another LYSM account
  | 'pending' // deferred (e.g. Ask to Buy) — entitlement resolves later
  | 'unknown';

export class IapError extends Error {
  code: IapErrorCode;
  constructor(code: IapErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'IapError';
    this.code = code;
  }
}

export type PurchaseStatus =
  | 'purchased'
  | 'restored'
  | 'canceled'
  | 'pending'
  | 'unavailable'
  | 'nothing_to_restore';

export interface PurchaseOutcome {
  status: PurchaseStatus;
  productId?: string;
}

/**
 * Platform-independent IAP boundary. Subscription STATUS / expiration / cancellation are read from
 * the server `subscriptions` row (the entitlement, written only by the validate-purchase Edge
 * Function after it checked the purchase with Apple / Google), never from here.
 */
export interface IapService {
  /** Whether this platform can sell at all (iOS / Android with product ids set). */
  isSupported(): boolean;
  /** The store's prices and free-trial offer for this person (null: the store couldn't be asked). */
  getCatalog(): Promise<StoreCatalog | null>;
  /** iOS: whether this Apple ID can still take the free-trial introductory offer. */
  isTrialEligible(catalog: StoreCatalog): Promise<boolean>;
  /** Buy `plan` (with the free trial when `withTrial`), checked on the server before it counts. */
  purchase(
    plan: PlanId,
    opts: { userId: string; withTrial: boolean },
  ): Promise<PurchaseOutcome>;
  /** Restore prior purchases (e.g. after reinstall / new device). */
  restorePurchases(userId: string): Promise<PurchaseOutcome>;
  /**
   * Listen for purchases finishing outside a purchase call (iOS replays unfinished transactions at
   * launch; Android ones must be acknowledged within 3 days). Returns stop().
   */
  start(userId: string, onEntitlementChanged: () => void): () => void;
  /** The store's own subscription settings (manage or cancel). */
  manage(plan: PlanId | null): Promise<void>;
}

/** What to tell the person when a purchase or restore didn't go through ('': say nothing). */
export function purchaseProblemMessage(
  error: unknown,
  platform: 'ios' | 'android' | string,
): string {
  const store = platform === 'android' ? 'Google Play' : 'App Store';
  if (error instanceof IapError) {
    switch (error.code) {
      case 'canceled':
        return '';
      case 'owned_elsewhere':
        return `This ${store} subscription already belongs to another LYSM account. Sign in to that account to use it.`;
      case 'pending':
        return 'Your purchase is waiting for approval. You’ll get full access as soon as it’s approved.';
      case 'network':
        return 'We couldn’t confirm your purchase. Check your connection and try again.';
      case 'not_configured':
      case 'unavailable':
        return 'Purchases aren’t available right now. Please try again later.';
      default:
        break;
    }
  }
  return 'We couldn’t complete the purchase. Please try again.';
}
