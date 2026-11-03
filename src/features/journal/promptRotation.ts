/**
 * Daily rotating home-screen prompt (the line under the greeting).
 *
 * Rules:
 *  - 7 fixed prompts, shown ONE per calendar day. Opening the app many times in a day shows the
 *    same prompt all day; the prompt only advances on a new day the user actually opens the app.
 *  - Progress advances by exactly one step per distinct open-day and never moves backward, so
 *    skipped days just slow progress (seeing all 7 can take far longer than 7 calendar days).
 *  - Each cycle is a random shuffle of all 7 — including the very first cycle, which is never the
 *    listed 1–7 order. After all 7 have been shown, the next open-day starts a reshuffled cycle.
 *  - On a reshuffle, the FIRST prompt of the new cycle must differ from the prompt that was
 *    showing right before the reshuffle (no back-to-back repeat across the cycle boundary). The
 *    rest of the new cycle is shuffled freely.
 *
 * Everything here is PURE — the date and randomness are injected — so the rotation is fully
 * deterministic under test. The React/AsyncStorage wiring lives in hooks.ts (useDailyPrompt).
 */

export const DAILY_PROMPTS = [
  'How are you feeling today?',
  "What's on your mind right now?",
  'What made today different?',
  'What are you grateful for today?',
  'How does today compare to yesterday?',
  'What do you want to remember about today?',
  "What's weighing on you today?",
] as const;

const COUNT = DAILY_PROMPTS.length;

export interface RotationState {
  /** The current cycle: a permutation of prompt indices 0..COUNT-1. */
  order: number[];
  /** Index into `order` of the prompt shown on `date`. */
  position: number;
  /** The local calendar date (YYYY-MM-DD) that `position` was chosen for. */
  date: string;
}

/** Random number in [0, 1). Injected so the rotation is deterministic under test. */
export type Rand = () => number;

const IDENTITY = Array.from({ length: COUNT }, (_, i) => i);

function shuffle(items: readonly number[], rand: Rand): number[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isIdentity(order: number[]): boolean {
  return order.every((n, i) => n === i);
}

/**
 * Build a fresh shuffled cycle. `avoid` is the prompt index that was showing right before a
 * reshuffle — it is kept out of the FIRST slot of the new cycle. Pass `null` for the very first
 * cycle (which has no predecessor and only must not be the exact listed 1–7 order).
 */
export function buildCycle(rand: Rand, avoid: number | null): number[] {
  let order = shuffle(IDENTITY, rand);

  if (avoid == null) {
    // First cycle ever: guarantee it isn't the exact listed order (1..7).
    let guard = 0;
    while (isIdentity(order) && guard < 16) {
      order = shuffle(IDENTITY, rand);
      guard += 1;
    }
    if (isIdentity(order)) [order[0], order[1]] = [order[1], order[0]];
    return order;
  }

  // Reshuffle: the new cycle's first prompt must differ from the one showing before the reshuffle.
  // Swapping slot 0 with a random later slot fixes only the first pick and leaves the rest shuffled.
  if (order[0] === avoid) {
    const k = 1 + Math.floor(rand() * (COUNT - 1)); // 1..COUNT-1
    [order[0], order[k]] = [order[k], order[0]];
  }
  return order;
}

/** Whether a persisted state is well-formed (a full permutation of 0..COUNT-1 + in-range position). */
export function isValidRotation(s: RotationState | null | undefined): s is RotationState {
  return (
    !!s &&
    Array.isArray(s.order) &&
    s.order.length === COUNT &&
    s.order.every((n) => Number.isInteger(n) && n >= 0 && n < COUNT) &&
    new Set(s.order).size === COUNT &&
    Number.isInteger(s.position) &&
    s.position >= 0 &&
    s.position < COUNT &&
    typeof s.date === 'string' &&
    s.date.length > 0
  );
}

/**
 * Given the previous rotation state and today's local date, return the state for today. Returns
 * the SAME object reference when nothing changes (same calendar day) so callers can skip a
 * redundant persist. A missing or corrupted `prev` starts a fresh cycle.
 */
export function advanceRotation(
  prev: RotationState | null | undefined,
  today: string,
  rand: Rand,
): RotationState {
  // First run (or corrupted state): start a fresh, shuffled, non-listed-order cycle.
  if (!isValidRotation(prev)) {
    return { order: buildCycle(rand, null), position: 0, date: today };
  }
  // Only advance when today is a genuinely LATER calendar day than the one last shown. YYYY-MM-DD
  // compares lexicographically = chronologically, so this returns prev unchanged for the SAME day
  // AND for any EARLIER date (device clock set back, a westward timezone change, or date-line
  // travel). The prompt therefore can never advance twice in one calendar day or move backward.
  if (today <= prev.date) return prev;
  // A new open-day still inside the current cycle → advance exactly one step.
  if (prev.position < COUNT - 1) {
    return { order: prev.order, position: prev.position + 1, date: today };
  }
  // A new open-day AFTER all 7 were shown → reshuffle, avoiding an immediate repeat of the prompt
  // that was showing right before the reshuffle (the last one of the finished cycle).
  return { order: buildCycle(rand, prev.order[COUNT - 1]), position: 0, date: today };
}

/** The prompt text to display for a given state. */
export function promptFor(state: RotationState): string {
  return DAILY_PROMPTS[state.order[state.position]];
}

// ---------------------------------------------------------------------------------------------
// The daily check-in notification shares the SAME daily pick (client spec 2026-09-29):
//  - Reminder ON: it goes out every day whether or not the app is opened, so the rotation advances
//    EVERY calendar day, and each upcoming day's prompt is planned (and scheduled) ahead. The home
//    screen just shows whatever was planned for today.
//  - Reminder OFF: exactly the rules above — it only advances on days the app is opened.
// What's stored is a list of consecutive states (one per planned day), or a single state for the
// last open-day. Days already planned are never re-picked, so a scheduled notification and the
// home screen always agree.
// ---------------------------------------------------------------------------------------------

/** How many days of daily check-ins are scheduled ahead (iOS holds at most 64 per app). */
export const PLAN_DAYS = 60;

/** YYYY-MM-DD one calendar day after `date`. */
export function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + 1)).toISOString().slice(0, 10);
}

/**
 * Today's state from what's stored. A day that was already planned (or opened) keeps its prompt.
 * Otherwise it moves on from the latest earlier state — one step per calendar day when `daily`
 * (reminder on), a single step when not (only open-days count). Never moves backward.
 */
export function stateForDay(
  stored: RotationState[],
  today: string,
  daily: boolean,
  rand: Rand,
): RotationState {
  const valid = stored.filter(isValidRotation);
  const same = valid.find((s) => s.date === today);
  if (same) return same;

  const earlier = valid.filter((s) => s.date < today);
  if (earlier.length === 0) {
    // Nothing usable before today: a fresh cycle, or (clock moved back) the earliest known state.
    return valid.length > 0 ? valid[0]! : advanceRotation(null, today, rand);
  }
  let state = earlier[earlier.length - 1]!;
  if (!daily) return advanceRotation(state, today, rand);
  while (state.date < today) state = advanceRotation(state, nextDay(state.date), rand);
  return state;
}

/**
 * Reminder ON: the states for today and the next `days - 1` days, one per calendar day. Days that
 * were already planned are kept exactly (their notifications are already scheduled).
 */
export function planDays(
  stored: RotationState[],
  today: string,
  days: number,
  rand: Rand,
): RotationState[] {
  const known = new Map(stored.filter(isValidRotation).map((s) => [s.date, s]));
  const plan = [stateForDay(stored, today, true, rand)];
  while (plan.length < days) {
    const prev = plan[plan.length - 1]!;
    const date = nextDay(prev.date);
    plan.push(known.get(date) ?? advanceRotation(prev, date, rand));
  }
  return plan;
}
