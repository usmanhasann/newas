/**
 * The real in-app purchase service (App Store / Google Play through expo-iap), client revisions 10/14
 * p.32-38.
 *
 *  - Prices come from the stores, never from the app (getCatalog).
 *  - The 5-day free trial is the stores' own free-trial offer on the Annual plan, so Apple / Google
 *    decide who can still have it (p.36): iOS asks StoreKit about the subscription group, Google
 *    only lists the trial offer to accounts that can take it.
 *  - Every purchase is checked by the validate-purchase Edge Function with Apple / Google before it
 *    counts, and the transaction is finished only after that (an unchecked one is retried: iOS
 *    replays it at launch, Android keeps it unacknowledged). The purchase is tied to the LYSM
 *    account: appAccountToken (iOS) / obfuscatedAccountId (Android) = the account's id.
 *  - Purchases arrive as events (purchaseUpdatedListener / purchaseErrorListener); a purchase call
 *    waits for its own product's event.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as ExpoIap from 'expo-iap';
import type { Purchase } from 'expo-iap';
import { logger } from '@lib';
import type { PurchasePlatform } from '@app-types/database';
import {
  allProductIds,
  isIapConfigured,
  planForProductId,
  productIdFor,
} from './products';
import {
  androidOfferToken,
  catalogFromProducts,
  type StoreCatalog,
  type StoreProductLike,
} from './storeCatalog';
import { IapError, type IapService, type PurchaseOutcome } from './types';
import { verifyStorePurchase } from './verifyApi';

/** The store catalog is fetched again after this long (prices rarely change). */
const CATALOG_TTL_MS = 10 * 60 * 1000;

function currentPlatform(): PurchasePlatform | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}

/** The app's Android package (Google's subscription settings page needs it). */
function androidPackage(): string | undefined {
  return Constants.expoConfig?.android?.package ?? undefined;
}

interface Waiter {
  productId: string;
  resolve: (outcome: PurchaseOutcome) => void;
  reject: (error: unknown) => void;
}

/** True for the store's "the person closed the sheet" error. */
function isCancel(error: unknown): boolean {
  return ExpoIap.isUserCancelledError(error);
}

function isPendingError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'deferred-payment' || code === 'pending';
}

export function createNativeIapService(): IapService {
  const platform = currentPlatform();
  let connection: Promise<void> | null = null;
  let catalogCache: { at: number; value: StoreCatalog } | null = null;
  let waiter: Waiter | null = null;
  let subs: { remove: () => void }[] | null = null;
  let accountId: string | null = null;
  let entitlementChanged: (() => void) | null = null;

  const connect = async () => {
    if (!connection) {
      connection = ExpoIap.initConnection()
        .then(() => undefined)
        .catch((e: unknown) => {
          connection = null;
          throw e;
        });
    }
    await connection;
  };

  const settle = (productId: string, outcome: PurchaseOutcome | { error: unknown }) => {
    const w = waiter;
    if (!w || w.productId !== productId) return;
    waiter = null;
    if ('error' in outcome) w.reject(outcome.error);
    else w.resolve(outcome);
  };

  /** Checks a purchase on the server, then finishes it with the store. */
  const handlePurchase = async (purchase: Purchase) => {
    if (!platform) return;
    const productId = purchase.productId;
    if (!planForProductId(platform, productId)) return; // not one of ours
    if (purchase.purchaseState === 'pending') {
      settle(productId, { status: 'pending', productId });
      return;
    }
    const token = purchase.purchaseToken;
    if (!token || !accountId) {
      settle(productId, {
        error: new IapError('unknown', 'The store sent a purchase without a token.'),
      });
      return;
    }
    try {
      const status = await verifyStorePurchase({ platform, productId, token });
      if (status === 'ok') {
        await ExpoIap.finishTransaction({ purchase, isConsumable: false }).catch(
          (e: unknown) =>
            logger.warn('iap: finishTransaction failed', { error: String(e) }),
        );
        entitlementChanged?.();
        settle(productId, { status: 'purchased', productId });
      } else if (status === 'owned_by_other_account') {
        // The store keeps the subscription with its Apple ID / Google account; it just isn't this
        // LYSM account's. Finished, so it doesn't replay forever.
        await ExpoIap.finishTransaction({ purchase, isConsumable: false }).catch(
          () => undefined,
        );
        settle(productId, { error: new IapError('owned_elsewhere') });
      } else {
        settle(productId, {
          error: new IapError('unknown', `Purchase check: ${status}`),
        });
      }
    } catch (e) {
      // Not finished: it comes back (iOS at the next launch, Android until acknowledged) and is
      // checked again then.
      logger.warn('iap: purchase check failed', { error: String(e) });
      settle(productId, {
        error: new IapError('network', 'We couldn’t confirm the purchase.'),
      });
    }
  };

  const listen = () => {
    if (subs) return;
    subs = [
      ExpoIap.purchaseUpdatedListener((p) => void handlePurchase(p)),
      ExpoIap.purchaseErrorListener((e) => {
        const err = e as { productId?: string | null; message?: string };
        const productId = err.productId ?? waiter?.productId ?? '';
        if (isCancel(e)) settle(productId, { status: 'canceled', productId });
        else if (isPendingError(e)) settle(productId, { status: 'pending', productId });
        else settle(productId, { error: new IapError('unknown', err.message) });
      }),
    ];
  };

  const loadCatalog = async (): Promise<StoreCatalog | null> => {
    if (!platform || !isIapConfigured(platform)) return null;
    if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS)
      return catalogCache.value;
    await connect();
    const products = await ExpoIap.fetchProducts({
      skus: allProductIds(platform),
      type: 'subs',
    });
    const value = catalogFromProducts(
      platform,
      (products ?? []) as unknown as StoreProductLike[],
    );
    catalogCache = { at: Date.now(), value };
    return value;
  };

  return {
    isSupported() {
      return !!platform && isIapConfigured(platform);
    },

    async getCatalog() {
      try {
        return await loadCatalog();
      } catch (e) {
        logger.warn('iap: catalog failed', { error: String(e) });
        return null;
      }
    },

    async isTrialEligible(catalog) {
      if (catalog.platform === 'android') return !!catalog.androidOffers.yearly?.trial;
      if (!catalog.iosTrialOffered || !catalog.iosGroupId) return false;
      try {
        await connect();
        return await ExpoIap.isEligibleForIntroOfferIOS(catalog.iosGroupId);
      } catch {
        return false;
      }
    },

    async purchase(plan, { userId, withTrial }) {
      if (!platform || !isIapConfigured(platform)) throw new IapError('unavailable');
      const productId = productIdFor(platform, plan)!;
      const catalog = await loadCatalog();
      if (!catalog?.prices[plan]) throw new IapError('not_configured');
      if (waiter) throw new IapError('unknown', 'A purchase is already in progress.');
      await connect();
      listen();
      accountId = userId;
      const offerToken =
        platform === 'android' ? androidOfferToken(catalog, plan, withTrial) : null;
      if (platform === 'android' && !offerToken) throw new IapError('not_configured');
      return new Promise<PurchaseOutcome>((resolve, reject) => {
        waiter = { productId, resolve, reject };
        const request =
          platform === 'ios'
            ? { apple: { sku: productId, appAccountToken: userId } }
            : {
                google: {
                  skus: [productId],
                  subscriptionOffers: [{ sku: productId, offerToken: offerToken! }],
                  obfuscatedAccountId: userId,
                },
              };
        ExpoIap.requestPurchase({ type: 'subs', request }).catch((e: unknown) => {
          if (isCancel(e)) settle(productId, { status: 'canceled', productId });
          else settle(productId, { error: e });
        });
      });
    },

    async restorePurchases(userId) {
      if (!platform || !isIapConfigured(platform)) throw new IapError('unavailable');
      await connect();
      listen();
      accountId = userId;
      const purchases = (await ExpoIap.getAvailablePurchases()) ?? [];
      const ours = purchases
        .filter((p) => planForProductId(platform, p.productId) && p.purchaseToken)
        .sort((a, b) => b.transactionDate - a.transactionDate);
      for (const p of ours) {
        const status = await verifyStorePurchase({
          platform,
          productId: p.productId,
          token: p.purchaseToken!,
        });
        if (status === 'owned_by_other_account') throw new IapError('owned_elsewhere');
        if (status === 'ok') {
          await ExpoIap.finishTransaction({ purchase: p, isConsumable: false }).catch(
            () => undefined,
          );
          entitlementChanged?.();
          return { status: 'restored', productId: p.productId };
        }
      }
      return { status: 'nothing_to_restore' };
    },

    start(userId, onEntitlementChanged) {
      if (!platform || !isIapConfigured(platform)) return () => undefined;
      accountId = userId;
      entitlementChanged = onEntitlementChanged;
      let stopped = false;
      void (async () => {
        try {
          await connect();
          if (stopped) return;
          listen();
          if (platform === 'android') {
            // Purchases made while the app was closed (or whose check failed) and not yet
            // acknowledged: check and finish them now, before Google refunds them.
            const purchases = (await ExpoIap.getAvailablePurchases()) ?? [];
            for (const p of purchases) {
              if (stopped) return;
              const android = p as Purchase & { isAcknowledgedAndroid?: boolean | null };
              if (android.isAcknowledgedAndroid === false) await handlePurchase(p);
            }
          }
        } catch (e) {
          logger.warn('iap: start failed', { error: String(e) });
        }
      })();
      return () => {
        stopped = true;
        if (entitlementChanged === onEntitlementChanged) entitlementChanged = null;
      };
    },

    async manage(plan) {
      if (!platform) return;
      const sku = plan ? productIdFor(platform, plan) : null;
      await ExpoIap.deepLinkToSubscriptions(
        platform === 'android'
          ? { skuAndroid: sku ?? undefined, packageNameAndroid: androidPackage() }
          : undefined,
      );
    },
  };
}
