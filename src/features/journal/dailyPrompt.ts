/**
 * The ONE daily prompt pick, shared by the home screen (the line under the greeting) and the daily
 * check-in notification (client spec 2026-09-29). The rotation rules live in promptRotation.ts; this
 * module owns the stored rotation. Every read + write goes through a single queue, so the home screen
 * and the reminder can never pick (or reshuffle) twice for the same day.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PLAN_DAYS,
  planDays,
  promptFor,
  stateForDay,
  type Rand,
  type RotationState,
} from './promptRotation';

export const DAILY_PROMPT_KEY = 'journal.daily_prompt.v1';

/**
 * The stored rotation. `read: false` means storage couldn't be read, so nothing may be written back
 * (never clobber good progress after a transient read error).
 */
async function load(): Promise<{ read: boolean; states: RotationState[] }> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(DAILY_PROMPT_KEY);
  } catch {
    return { read: false, states: [] };
  }
  if (!raw) return { read: true, states: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    // Older app versions stored a single state; now it's a list of days (or one open-day).
    return { read: true, states: (Array.isArray(parsed) ? parsed : [parsed]) as RotationState[] };
  } catch {
    return { read: true, states: [] }; // corrupt → safe to start fresh
  }
}

async function save(states: RotationState[]): Promise<void> {
  try {
    await AsyncStorage.setItem(DAILY_PROMPT_KEY, JSON.stringify(states));
  } catch {
    // best-effort: recomputed on the next open
  }
}

let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Today's prompt. `daily` = the daily check-in reminder is on, so the rotation moves every calendar
 * day (and today may already be planned); off, it only moves on days the app is opened.
 */
export function todaysPrompt(
  today: string,
  daily: boolean,
  rand: Rand = Math.random,
  opts: { readOnly?: boolean } = {},
): Promise<string> {
  return serialized(async () => {
    const { read, states } = await load();
    const state = stateForDay(states, today, daily, rand);
    // readOnly: the reminder setting is unknown right now (it failed to load), so show today's pick
    // but never rewrite the rotation (that could drop days the reminder already scheduled).
    if (read && !opts.readOnly) {
      // Reminder on: keep today and the days already planned after it. Off: just today.
      const next = daily ? [state, ...states.filter((s) => s.date > today)] : [state];
      if (JSON.stringify(next) !== JSON.stringify(states)) await save(next);
    }
    return promptFor(state);
  });
}

/**
 * Reminder turned off: drop the days planned ahead, keeping today's pick. From here the rotation
 * moves only on days the app is opened, starting from today (not from wherever the plan got to).
 */
export function trimDailyPlan(today: string): Promise<void> {
  return serialized(async () => {
    const { read, states } = await load();
    if (!read) return;
    const past = states.filter((s) => s.date <= today);
    const next = past.length ? [past[past.length - 1]!] : [];
    if (JSON.stringify(next) !== JSON.stringify(states)) await save(next);
  });
}

/**
 * Reminder on: the prompts for today and the next PLAN_DAYS − 1 days, one per calendar day, saved
 * so the home screen shows the same one on each of those days.
 */
export function planDailyPrompts(
  today: string,
  rand: Rand = Math.random,
): Promise<{ date: string; prompt: string }[]> {
  return serialized(async () => {
    const { read, states } = await load();
    const plan = planDays(states, today, PLAN_DAYS, rand);
    if (read) await save(plan);
    return plan.map((s) => ({ date: s.date, prompt: promptFor(s) }));
  });
}
