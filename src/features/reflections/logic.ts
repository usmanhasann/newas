/**
 * Pure, framework-free reflection display logic (build task §7/§8) — kept separate
 * from React so it's unit-testable without a renderer. Period/unlock math lives in
 * the backend (the SQL period service); this only maps server state → UI state.
 */
import type { ReflectionType } from '@app-types/database';

export const REFLECTION_TYPES: ReflectionType[] = ['weekly', 'monthly', 'yearly'];

export const REFLECTION_TITLE: Record<ReflectionType, string> = {
  weekly: 'Weekly Reflection',
  monthly: 'Monthly Reflection',
  yearly: 'Yearly Reflection',
};

/**
 * Not-ready copy (client 10/14 p.1-2): the user has entries but no period of this length has
 * finished yet. "Ready on [date]." follows it (readyOnSentence).
 */
export const REFLECTION_PLACEHOLDER: Record<ReflectionType, string> = {
  weekly: 'Your weekly reflection will show here after a full week of journaling. Keep going!',
  monthly: 'Your monthly reflection will show here after a full month of journaling. Keep going!',
  yearly: 'Your yearly reflection will show here after a full year of journaling. Keep going!',
};

/** A finished period with no entries (client 10/14 p.14: replaces the reflection text only). */
export const REFLECTION_EMPTY = 'No entries in this period yet. Journal to see your reflection here.';

export type ReflectionCardState = 'ready' | 'generating' | 'failed' | 'empty' | 'locked';

/**
 * The card shows the NEWEST FINISHED period, on the same once-per-period schedule as everything
 * else (client 10/14 p.13-14): its reflection when ready; being prepared (or failed, with retry);
 * an empty state when the period had no entries; locked until a first period finishes.
 */
export function reflectionCardState(
  o: {
    content: string | null;
    generating: boolean;
    failed: boolean;
    periodStart?: string | null;
    periodHasEntries?: boolean | null;
  },
  /** Insights' request to make due reflections has finished (or failed) and nothing came of it. */
  requestSettled = false,
): ReflectionCardState {
  if (o.content) return 'ready';
  if (o.periodStart && o.periodHasEntries === false) return 'empty';
  if (o.generating) return 'generating';
  if (o.failed) return 'failed';
  // A finished period with entries whose reflection isn't made yet: being prepared while Insights
  // asks for it; if that request ended and still nothing was made, offer Try again (never an endless
  // spinner).
  if (o.periodStart && o.periodHasEntries) return requestSettled ? 'failed' : 'generating';
  return 'locked';
}

/** "Your next reflection will be ready on <date>." (date is pre-formatted). */
export function nextUnlockSentence(formattedDate: string): string {
  return `Your next reflection will be ready on ${formattedDate}.`;
}

/**
 * "Ready on <date>." under the not-ready text on both Insights cards (client 10/14 p.1-2), the day
 * the first period of that length is ready (date is pre-formatted, e.g. "September 7, 2027").
 */
export function readyOnSentence(formattedDate: string): string {
  return `Ready on ${formattedDate}.`;
}
