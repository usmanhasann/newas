/**
 * What the stores say about our two subscriptions (client revisions 10/14 p.36: "don't hardcode any
 * prices. Pull them from the App Store and Google Play"): each plan's real price in the person's own
 * currency, and whether the Annual plan's 5-day free trial is still on offer to them ("Apple and
 * Google only give each account one free trial"). Pure: built from the products expo-iap fetched,
 * so it is unit-tested without a phone.
 */
import type { PurchasePlatform } from '@app-types/database';
import {
  ANDROID_BASE_PLANS,
  ANDROID_TRIAL_OFFER_ID,
  IAP_PRODUCT_IDS,
  type PlanId,
} from './products';

/** One plan's price, as the store sells it. */
export interface StorePrice {
  /** The store's own formatted price, e.g. "$29.99" or "29,99 €". */
  priceLabel: string;
  /** The amount in major units, e.g. 29.99. */
  amount: number;
  /** ISO 4217, e.g. "USD". */
  currency: string;
}

export interface StoreCatalog {
  platform: PurchasePlatform;
  prices: Partial<Record<PlanId, StorePrice>>;
  /** Google Play offer tokens per plan: the plain base plan and its free-trial offer (if offered). */
  androidOffers: Partial<
    Record<PlanId, { regular: string | null; trial: string | null }>
  >;
  /** iOS: the Annual product carries a free-trial introductory offer. */
  iosTrialOffered: boolean;
  /** iOS: the subscription group (eligibility for the introductory offer is per group). */
  iosGroupId: string | null;
}

/** Both plans came back from the store, priced: the store can sell them. */
export function isCatalogReady(catalog: StoreCatalog | null | undefined): boolean {
  return !!catalog?.prices.yearly && !!catalog.prices.monthly;
}

// The shapes we read, kept loose: the stores' products as expo-iap hands them over.
interface PricingPhase {
  formattedPrice?: string | null;
  priceAmountMicros?: string | number | null;
  priceCurrencyCode?: string | null;
}
interface OfferLike {
  id?: string | null;
  basePlanIdAndroid?: string | null;
  offerTokenAndroid?: string | null;
  pricingPhasesAndroid?: { pricingPhaseList?: PricingPhase[] | null } | null;
}
export interface StoreProductLike {
  id: string;
  platform?: string;
  displayPrice?: string | null;
  price?: number | null;
  currency?: string | null;
  subscriptionOffers?: OfferLike[] | null;
  introductoryPricePaymentModeIOS?: string | null;
  subscriptionGroupIdIOS?: string | null;
}

const phasesOf = (o: OfferLike): PricingPhase[] =>
  o.pricingPhasesAndroid?.pricingPhaseList ?? [];
const isFreePhase = (p: PricingPhase) => Number(p.priceAmountMicros ?? NaN) === 0;
const hasFreePhase = (o: OfferLike) => phasesOf(o).some(isFreePhase);

function priceFromPhase(p: PricingPhase | undefined): StorePrice | null {
  const micros = Number(p?.priceAmountMicros ?? NaN);
  if (
    !p?.formattedPrice ||
    !p.priceCurrencyCode ||
    !Number.isFinite(micros) ||
    micros <= 0
  )
    return null;
  return {
    priceLabel: p.formattedPrice,
    amount: micros / 1_000_000,
    currency: p.priceCurrencyCode,
  };
}

function priceFromProduct(p: StoreProductLike): StorePrice | null {
  const amount = typeof p.price === 'number' ? p.price : NaN;
  if (!p.displayPrice || !p.currency || !Number.isFinite(amount) || amount <= 0)
    return null;
  return { priceLabel: p.displayPrice, amount, currency: p.currency };
}

/** Builds the catalog from the store's products (ours only; anything else is ignored). */
export function catalogFromProducts(
  platform: PurchasePlatform,
  products: readonly StoreProductLike[],
): StoreCatalog {
  const catalog: StoreCatalog = {
    platform,
    prices: {},
    androidOffers: {},
    iosTrialOffered: false,
    iosGroupId: null,
  };
  for (const plan of ['yearly', 'monthly'] as const) {
    const product = products.find((p) => p.id === IAP_PRODUCT_IDS[platform][plan]);
    if (!product) continue;
    if (platform === 'ios') {
      const price = priceFromProduct(product);
      if (price) catalog.prices[plan] = price;
      if (plan === 'yearly') {
        catalog.iosTrialOffered =
          product.introductoryPricePaymentModeIOS === 'free-trial';
        catalog.iosGroupId = product.subscriptionGroupIdIOS ?? null;
      }
      continue;
    }
    // Google Play: the plan's base plan, and its offers (Google lists only offers this account can
    // still take, so a free-trial offer here means the trial is still on offer to them).
    const base = ANDROID_BASE_PLANS[plan];
    const offers = (product.subscriptionOffers ?? []).filter(
      (o) => !o.basePlanIdAndroid || o.basePlanIdAndroid === base,
    );
    const regular = offers.find((o) => !hasFreePhase(o)) ?? null;
    const trial =
      plan === 'yearly'
        ? (offers.find((o) => hasFreePhase(o) && o.id === ANDROID_TRIAL_OFFER_ID) ??
          offers.find(hasFreePhase) ??
          null)
        : null;
    catalog.androidOffers[plan] = {
      regular: regular?.offerTokenAndroid ?? null,
      trial: trial?.offerTokenAndroid ?? null,
    };
    // The recurring price: the last phase of the plain base plan (or of the trial offer, after its
    // free days), else the product's own price.
    const recurring =
      priceFromPhase(regular ? phasesOf(regular).at(-1) : undefined) ??
      priceFromPhase(
        trial
          ? phasesOf(trial)
              .filter((p) => !isFreePhase(p))
              .at(-1)
          : undefined,
      ) ??
      priceFromProduct(product);
    if (recurring) catalog.prices[plan] = recurring;
  }
  return catalog;
}

/** Google Play: the offer token to buy `plan` with (the free-trial offer when asked and offered). */
export function androidOfferToken(
  catalog: StoreCatalog,
  plan: PlanId,
  withTrial: boolean,
): string | null {
  const offers = catalog.androidOffers[plan];
  if (!offers) return null;
  return withTrial ? (offers.trial ?? offers.regular) : offers.regular;
}
