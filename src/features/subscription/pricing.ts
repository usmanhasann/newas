/**
 * Subscription prices, as the app shows them (client revisions 10/14 p.36: "don't hardcode any
 * prices. Pull them from the App Store and Google Play, so users in other countries see the right
 * price in their own currency"). Pure (no I/O) so every rule is unit-tested.
 *
 * The stores' prices (@features/iap, useStoreCatalog) always win: pricesFromStore() lays them over
 * PLAN_PRICING, which is only what shows while the stores haven't answered (offline, web, or before
 * the products exist in App Store Connect / Google Play). Amounts the app works out itself (the
 * crossed-out "monthly × 12" and the "annual ÷ 12" per month) are written exactly like the store's
 * own price for that plan (same currency sign, separators and decimals): formatLikePrice().
 */
export type PlanId = 'monthly' | 'yearly';

export interface PlanPricing {
  id: PlanId;
  /** Short human label, e.g. "Annual". */
  label: string;
  /** Formatted price, e.g. "$29.99" (the store's own text once it's known). */
  priceLabel: string;
  /** Numeric amount (major units) for derived amounts. */
  amount: number;
  currency: string;
  /** Billing interval word, e.g. "year" / "month". */
  period: string;
  /** Optional marketing tag shown on the plan card. */
  tagline?: string;
}

/** Both plans' prices. */
export type PlanPrices = Record<PlanId, PlanPricing>;

/** What shows until the stores answer (US prices, as set in the stores). */
export const PLAN_PRICING: PlanPrices = {
  yearly: {
    id: 'yearly',
    label: 'Annual',
    priceLabel: '$29.99',
    amount: 29.99,
    currency: 'USD',
    period: 'year',
    // 12 × $4.99 = $59.88 vs $29.99 → 49.9% saved, so "~50%" stays truthful.
    tagline: 'Best value · Save ~50%',
  },
  monthly: {
    id: 'monthly',
    label: 'Monthly',
    priceLabel: '$4.99',
    amount: 4.99,
    currency: 'USD',
    period: 'month',
  },
};

/** One plan's store price (see @features/iap StorePrice). */
export interface StorePlanPrice {
  priceLabel: string;
  amount: number;
  currency: string;
}

/**
 * The prices to show: each plan's store price where the store gave one. Both plans come from the
 * same store, so they share a currency; a store that priced only one plan (a setup gap) falls back
 * to the defaults for both, so the crossed-out and per-month amounts never mix currencies.
 */
export function pricesFromStore(
  store: Partial<Record<PlanId, StorePlanPrice>> | null | undefined,
): PlanPrices {
  const y = store?.yearly;
  const m = store?.monthly;
  if (!y || !m || y.currency !== m.currency) return PLAN_PRICING;
  return {
    yearly: {
      ...PLAN_PRICING.yearly,
      priceLabel: y.priceLabel,
      amount: y.amount,
      currency: y.currency,
    },
    monthly: {
      ...PLAN_PRICING.monthly,
      priceLabel: m.priceLabel,
      amount: m.amount,
      currency: m.currency,
    },
  };
}

/** Annual is selected by default (spec Screen 13). */
export const DEFAULT_PLAN: PlanId = 'yearly';

export const TRIAL_DAYS = 5;

/**
 * `amount` written the way `template` (a store price such as "$4.99", "4,99 €", "¥600" or
 * "R$ 1.234,56") writes its own: same text around the number, same decimal mark and number of
 * decimals, same thousands mark. Rounded to those decimals.
 */
export function formatLikePrice(template: string, amount: number): string {
  const match = /\d(?:[\d.,\s  ']*\d)?/.exec(template);
  if (!match || !Number.isFinite(amount)) return template;
  const num = match[0];
  // The decimal mark: a "." or "," with 1 or 2 digits after it at the end (3 digits there is a
  // thousands group, as in "₩5,900").
  const dec = /([.,])(\d{1,2})$/.exec(num);
  const decimals = dec ? dec[2]!.length : 0;
  const decimalMark = dec ? dec[1]! : '.';
  const intPart = dec ? num.slice(0, num.length - dec[0].length) : num;
  const groupMatch = /\d([.,\s  '])\d{3}/.exec(intPart);
  const groupMark = groupMatch ? groupMatch[1]! : decimalMark === ',' ? '.' : ',';
  const fixed = Math.abs(amount).toFixed(decimals);
  const [whole, frac] = fixed.split('.');
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, groupMark);
  const text = frac ? `${grouped}${decimalMark}${frac}` : grouped;
  return template.slice(0, match.index) + text + template.slice(match.index + num.length);
}

/** "$29.99/year": price + interval for a plan. */
export function priceWithPeriod(plan: PlanId, prices: PlanPrices = PLAN_PRICING): string {
  const p = prices[plan];
  return `${p.priceLabel}/${p.period}`;
}

/**
 * The annual plan's effective per-month price, e.g. "$2.50" (the annual price ÷ 12, client p.36),
 * written like the annual price.
 */
export function annualPerMonthLabel(prices: PlanPrices = PLAN_PRICING): string {
  return formatLikePrice(prices.yearly.priceLabel, prices.yearly.amount / 12);
}
