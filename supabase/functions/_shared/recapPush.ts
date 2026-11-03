// Pure copy for the "your reflection is ready" push (sent at 9 AM local on the day a Weekly / Monthly
// / Yearly card unlocks). No I/O / no Deno APIs, so the edge function and the Jest test share the
// SAME source. Who gets it, and when, is decided in SQL (claim_recap_pushes).
//
// Several reflections ready the same morning go out as ONE notification (client revisions 10/14
// p.9): "Your weekly and monthly reflections are ready." A single one keeps its own copy.

export type RecapType = 'weekly' | 'monthly' | 'yearly';

/** The order recaps are named in (shortest period first). */
export const RECAP_ORDER: readonly RecapType[] = ['weekly', 'monthly', 'yearly'];

const LABEL: Record<RecapType, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};
const PERIOD: Record<RecapType, string> = {
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
};

/** Push title + body announcing one newly unlocked recap. */
export function recapPushCopy(type: RecapType): { title: string; body: string } {
  return {
    title: `Your ${LABEL[type]} Recap is ready`,
    body: `See your mood breakdown and written reflection for the past ${PERIOD[type]}.`,
  };
}

/** "a and b", "a, b, and c". */
function series(words: string[]): string {
  if (words.length <= 2) return words.join(' and ');
  return `${words.slice(0, -1).join(', ')}, and ${words[words.length - 1]}`;
}

/** The recaps named once each, in RECAP_ORDER. */
function inOrder(types: readonly RecapType[]): RecapType[] {
  return RECAP_ORDER.filter((t) => types.includes(t));
}

/**
 * The one push for everything that unlocked together. One recap: its own copy (unchanged). Several:
 * "Your weekly and monthly reflections are ready." (the client's words), "Your weekly and yearly
 * reflections are ready.", "Your monthly and yearly reflections are ready.", "Your weekly, monthly,
 * and yearly reflections are ready."
 */
export function recapPushCopyFor(types: readonly RecapType[]): { title: string; body: string } {
  const list = inOrder(types);
  if (list.length <= 1) return recapPushCopy(list[0] ?? 'weekly');
  return {
    title: `Your ${series(list)} reflections are ready.`,
    body: `See your mood breakdowns and written reflections for the past ${series(
      list.map((t) => PERIOD[t]),
    )}.`,
  };
}

/** One row claim_recap_pushes returns: a recap due for a push. */
export interface RecapClaim {
  user_id: string;
  type: RecapType;
  /** YYYY-MM-DD: the first day of the period the reflection covers. */
  period_start: string;
  period_end?: string | null;
}

/**
 * The claims grouped per person (one push each), each person's recaps in RECAP_ORDER, one per type.
 * A type the app doesn't know is skipped.
 */
export function groupRecapClaims(rows: readonly RecapClaim[]): Map<string, RecapClaim[]> {
  const byUser = new Map<string, RecapClaim[]>();
  for (const row of rows) {
    if (!RECAP_ORDER.includes(row.type)) continue;
    const mine = byUser.get(row.user_id) ?? [];
    if (!mine.some((c) => c.type === row.type)) mine.push(row);
    byUser.set(row.user_id, mine);
  }
  for (const [userId, mine] of byUser) {
    byUser.set(
      userId,
      mine.slice().sort((a, b) => RECAP_ORDER.indexOf(a.type) - RECAP_ORDER.indexOf(b.type)),
    );
  }
  return byUser;
}

/**
 * Where tapping it goes: the Insights tab, on the first recap named (`recap_type`), with the exact
 * period it announced (`period_start`), so a late tap never lands on a newer, possibly empty period.
 * `recap_types` lists every recap the push announced.
 */
export function recapPushData(claims: readonly RecapClaim[]): Record<string, string> {
  const list = inOrder(claims.map((c) => c.type));
  const first = claims.find((c) => c.type === list[0]) ?? claims[0];
  return {
    type: 'recap',
    recap_type: first.type,
    recap_types: list.join(','),
    period_start: first.period_start,
  };
}
