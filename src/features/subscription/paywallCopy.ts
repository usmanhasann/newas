/**
 * The words and numbers on the two paywalls (client revisions 10/14 p.32 to p.37): the main paywall
 * at the end of onboarding ("[First name], your reflection is waiting") and the "Welcome back"
 * paywall for returning users. Pure (no I/O, no React) so every exact text is unit-tested.
 *
 * PRICES: every amount is passed in (the stores' prices, see ./pricing pricesFromStore; the defaults
 * only until the stores answer), never written here. The crossed-out yearly value is the monthly
 * price times 12 and the per-month value the annual price divided by 12 (client p.36), written like
 * the store's own prices; the savings percent is computed from the two prices.
 */
import { withoutDashes } from '@utils/text';
import { formatLocalDateShort } from '@utils/date';
import {
  PLAN_PRICING,
  TRIAL_DAYS,
  annualPerMonthLabel,
  formatLikePrice,
  type PlanId,
  type PlanPrices,
} from './pricing';

// ---------------------------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------------------------

/** "Konah, your reflection is waiting" (main paywall). No name: "Your reflection is waiting". */
export function mainPaywallHeader(firstName: string | null | undefined): string {
  const name = firstName?.trim();
  return name ? `${name}, your reflection is waiting` : 'Your reflection is waiting';
}

/** "Konah, welcome back" (returning users). No name: "Welcome back". */
export function welcomeBackHeader(firstName: string | null | undefined): string {
  const name = firstName?.trim();
  return name ? `${name}, welcome back` : 'Welcome back';
}

/**
 * Splits a heading evenly over two lines (client p.33: "balanced line breaks, so the name never
 * ends up alone on a line, no matter how long it is"). Picks the word break that makes the two
 * lines closest in length (on a tie, the shorter first line), keeping at least `minFirstWords` words
 * on the first line: 2 for a header that starts with the name, so a long name never stands alone.
 * One word stays one line.
 */
export function balancedTwoLines(text: string, minFirstWords = 1): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words.join(' ');
  const from = Math.min(Math.max(1, minFirstWords), words.length - 1);
  let best = from;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let i = from; i < words.length; i += 1) {
    const first = words.slice(0, i).join(' ').length;
    const second = words.slice(i).join(' ').length;
    const diff = Math.abs(first - second);
    if (diff < bestDiff) {
      best = i;
      bestDiff = diff;
    }
  }
  return `${words.slice(0, best).join(' ')}\n${words.slice(best).join(' ')}`;
}

// ---------------------------------------------------------------------------------------------
// The purple card
// ---------------------------------------------------------------------------------------------

export const LABEL_WRITTEN_FOR_YOU = 'WRITTEN FOR YOU';
export const LABEL_BASED_ON_ANSWERS = 'BASED ON YOUR ANSWERS';
export const PILL_START_TRIAL = 'Start your trial to read the rest';
// The PDF's text, with its period (decision N16.07: the mock shows none).
export const PILL_SUBSCRIBE = 'Subscribe to open your journal.';
export const WRITING_REFLECTION = 'Writing your reflection...';
export const FAILED_TO_LOAD = 'Failed to load';
export const TRY_AGAIN = 'Try again';

/** "YOUR LAST ENTRY · SEP 30": the newest entry's own (local) day, no year. */
export function lastEntryLabel(localDate: string | null | undefined): string {
  const day = formatLocalDateShort(localDate ?? null).toUpperCase();
  return day ? `YOUR LAST ENTRY · ${day}` : 'YOUR LAST ENTRY';
}

/**
 * The first sentence of a reflection (fully readable on the paywall) and the rest (blurred). The
 * reflection is cleaned like everywhere else AI text is shown (no dashes). A sentence ends at
 * . ! ? or … (with any closing quote or bracket) followed by a space.
 */
export function splitFirstSentence(text: string | null | undefined): {
  first: string;
  rest: string;
} {
  const clean = withoutDashes(text ?? '').trim();
  const end = /[.!?…]["'”’)\]]*(?=\s)/.exec(clean);
  if (!end) return { first: clean, rest: '' };
  const cut = end.index + end[0].length;
  return { first: clean.slice(0, cut).trim(), rest: clean.slice(cut).trim() };
}

/**
 * The Welcome back card shows the entry's first line fully readable and blurs the rest (decision
 * N16.33: the PDF's rule). `lineTexts` are the lines the phone laid the entry out in (onTextLayout);
 * before they're known everything stays blurred, so nothing is shown that shouldn't be.
 */
export function splitFirstLine(
  text: string,
  lineTexts: string[] | null,
): { first: string; rest: string } {
  const body = text.trim();
  if (!lineTexts || lineTexts.length === 0) return { first: '', rest: body };
  const firstLine = lineTexts[0] ?? '';
  // Lines can carry the break's own whitespace; the rest starts right after the first line.
  const first = firstLine.replace(/\s+$/, '');
  if (!body.startsWith(first)) return { first: '', rest: body };
  return { first, rest: body.slice(firstLine.length).trim() };
}

// ---------------------------------------------------------------------------------------------
// Benefits
// ---------------------------------------------------------------------------------------------

export const MAIN_BENEFITS = [
  'Understand your moods week by week',
  'Reflections written in the tone you chose',
  'Share with the people you trust',
] as const;

/**
 * The Welcome back lines. The first counts their entries: "All 14 of your entries, right where you
 * left them" (client p.37). One entry reads "Your 1 entry, right where you left it" and none (or a
 * count that can't be read) "Your journal, right where you left it" (decision: "All 1 of your
 * entries" and "All 0" don't read right).
 */
export function welcomeBackBenefits(entryCount: number | null | undefined): string[] {
  const n = entryCount ?? 0;
  const first =
    n >= 2
      ? `All ${n} of your entries, right where you left them`
      : n === 1
        ? 'Your 1 entry, right where you left it'
        : 'Your journal, right where you left it';
  return [
    first,
    'New reflections in the tone you chose',
    'Your circles and the people in them',
  ];
}

export const CHOOSE_YOUR_PLAN = 'CHOOSE YOUR PLAN';

// ---------------------------------------------------------------------------------------------
// Plan cards (prices read from ./pricing)
// ---------------------------------------------------------------------------------------------

const SHORT_PERIOD: Record<string, string> = { year: 'yr', month: 'mo' };

/** "$29.99/yr" or "$4.99/mo": the price each plan really charges (the biggest on its card). */
export function planPriceLabel(plan: PlanId, prices: PlanPrices = PLAN_PRICING): string {
  const p = prices[plan];
  return `${p.priceLabel}/${SHORT_PERIOD[p.period] ?? p.period}`;
}

/** The crossed-out yearly value: the monthly price times 12 ("$59.88"), written like it. */
export function annualCrossedOutLabel(prices: PlanPrices = PLAN_PRICING): string {
  return formatLikePrice(prices.monthly.priceLabel, prices.monthly.amount * 12);
}

/** The annual plan per month, in smaller text under its price ("$2.50/mo"). */
export function annualPerMonthShortLabel(prices: PlanPrices = PLAN_PRICING): string {
  return `${annualPerMonthLabel(prices)}/mo`;
}

/** How much the annual plan saves against 12 months of monthly, rounded ("50"). */
export function annualSavingsPercent(prices: PlanPrices = PLAN_PRICING): number {
  const twelveMonths = prices.monthly.amount * 12;
  if (twelveMonths <= 0) return 0;
  return Math.round((1 - prices.yearly.amount / twelveMonths) * 100);
}

/** The tag on the Annual card: "Best value · Save 50%". */
export function bestValueTag(prices: PlanPrices = PLAN_PRICING): string {
  return `Best value · Save ${annualSavingsPercent(prices)}%`;
}

export const PLAN_NAME: Record<PlanId, string> = { yearly: 'Annual', monthly: 'Monthly' };

/**
 * The gray line under each plan's name.
 * - Main paywall ('trial'): Annual "5-day free trial" (hidden once the user had their trial, p.36),
 *   Monthly "No free trial".
 * - Welcome back ('billing'): "Billed yearly" / "Billed monthly", unless the user can still have the
 *   free trial: then the trial lines (p.37).
 */
export function planSubline(
  plan: PlanId,
  style: 'trial' | 'billing',
  trialEligible: boolean,
): string | null {
  if (style === 'billing' && !trialEligible) {
    return plan === 'yearly' ? 'Billed yearly' : 'Billed monthly';
  }
  if (plan === 'monthly') return 'No free trial';
  return trialEligible ? `${TRIAL_DAYS}-day free trial` : null;
}

// ---------------------------------------------------------------------------------------------
// Trial timeline + the button
// ---------------------------------------------------------------------------------------------

/** Today (Full access), Day 3 (We remind you), Day 5 (Trial ends). */
export const TRIAL_TIMELINE: { title: string; caption: string }[] = [
  { title: 'Today', caption: 'Full access' },
  { title: `Day ${TRIAL_DAYS - 2}`, caption: 'We remind you' },
  { title: `Day ${TRIAL_DAYS}`, caption: 'Trial ends' },
];

/** Whether the selected plan starts the free trial (Annual, and only while still eligible). */
export function startsTrial(plan: PlanId, trialEligible: boolean): boolean {
  return plan === 'yearly' && trialEligible;
}

/** "Start my 5-day free trial", "Start annual plan" or "Start monthly plan". */
export function paywallButtonLabel(plan: PlanId, trialEligible: boolean): string {
  if (startsTrial(plan, trialEligible)) return `Start my ${TRIAL_DAYS}-day free trial`;
  return plan === 'yearly' ? 'Start annual plan' : 'Start monthly plan';
}

/** The line under the button: "No charge today. Cancel anytime." for the trial, else "Cancel anytime." */
export function paywallButtonNote(plan: PlanId, trialEligible: boolean): string {
  return startsTrial(plan, trialEligible)
    ? 'No charge today. Cancel anytime.'
    : 'Cancel anytime.';
}

/**
 * Whether the free trial is offered (client p.36: "Apple and Google only give each account one free
 * trial"). Selling through the stores: only when Apple / Google still offer it to this store account
 * (unknown counts as no) AND this LYSM account never had a trial. Otherwise the server's own rule.
 */
export function trialOffered(input: {
  viaStore: boolean;
  storeEligible: boolean | null;
  accountEligible: boolean;
}): boolean {
  return input.viaStore
    ? input.storeEligible === true && input.accountEligible
    : input.accountEligible;
}
