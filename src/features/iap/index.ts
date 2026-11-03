/**
 * Public surface of the in-app-purchase feature (App Store / Google Play subscriptions, client
 * revisions 10/14 p.32-38). The app-managed trial in @features/subscription is only the fallback
 * for when the stores can't sell yet (no products set up, offline, web).
 */
export { getIapService } from './service';
export {
  iapKeys,
  useStoreCatalog,
  useStoreReady,
  useStoreTrialEligible,
  usePurchase,
  useRestorePurchases,
  useStorePurchaseListener,
  useManageSubscription,
} from './hooks';
export {
  IAP_PRODUCT_IDS,
  ANDROID_BASE_PLANS,
  ANDROID_TRIAL_OFFER_ID,
  productIdFor,
  planForProductId,
  isIapConfigured,
} from './products';
export type { PlanId } from './products';
export { isCatalogReady, catalogFromProducts, androidOfferToken } from './storeCatalog';
export type { StoreCatalog, StorePrice } from './storeCatalog';
export { refreshStoreSubscription } from './verifyApi';
export { IapError, purchaseProblemMessage } from './types';
export type { IapService, PurchaseOutcome, PurchaseStatus, IapErrorCode } from './types';
