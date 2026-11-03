/**
 * Pure, framework-free logic for the journal-completion flow (build task §2).
 * Kept separate from the React components so it's unit-testable without a renderer.
 */
import { addDaysToLocalDate } from '@utils/date';
import { streakPopupMessage } from './streakMessages';

export const ENTRY_COMPLETE = 'Entry complete';

/**
 * What the entry-completion popup shows (client revisions 10/14, p.24 to 27). The FIRST entry of a
 * local calendar day gets the streak popup: the current streak (Insights' number, the one streak in
 * the app) and that day's message line. Every later entry that day keeps the plain "Entry complete"
 * popup, since the streak doesn't go up.
 */
export type Completion =
  | { kind: 'entry' }
  | { kind: 'streak'; streak: number; message: string };

export const ENTRY_COMPLETION: Completion = { kind: 'entry' };

export interface CompletionDeps {
  /** Id of the user's earliest entry on the entry's local date (null if none). */
  firstEntryIdOfDay: () => Promise<string | null>;
  /** Freshly fetched journal stats: the same query Insights reads. */
  freshStats: () => Promise<{
    current_streak: number;
    longest_streak: number;
    last_entry_date: string | null;
  }>;
  /** The longest run before the one that includes the entry's day (get_previous_longest_streak). */
  previousLongest: () => Promise<number>;
  /** Seeds the regular-day line pick (one sequence per user and run). */
  userId: string;
  timeoutMs?: number;
}

/**
 * Resolve the popup for a just-saved entry. Never throws and never shows a wrong number: any
 * error, a timeout, or stats that don't yet include this entry's day all fall back to "Entry
 * complete". If only the previous-longest lookup fails, the streak popup still shows: when an
 * earlier run is longer than this one that run IS the previous longest; otherwise it counts as none
 * (so the "new longest" line is skipped rather than guessed).
 */
export async function resolveCompletion(
  entry: { id: string; local_date: string },
  deps: CompletionDeps,
): Promise<Completion> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Completion>((resolve) => {
    timer = setTimeout(() => resolve(ENTRY_COMPLETION), deps.timeoutMs ?? 3000);
  });
  const work = (async (): Promise<Completion> => {
    // In parallel: the stats refetch is already in flight from the create's invalidation.
    const [firstId, stats, previous] = await Promise.all([
      deps.firstEntryIdOfDay(),
      deps.freshStats(),
      deps.previousLongest().catch(() => null),
    ]);
    if (firstId !== entry.id) return ENTRY_COMPLETION;
    // Only trust a streak that already counts this entry's day ('YYYY-MM-DD' compares lexically).
    if (!stats.last_entry_date || stats.last_entry_date < entry.local_date) return ENTRY_COMPLETION;
    if (!(stats.current_streak >= 1)) return ENTRY_COMPLETION;
    const streak = Math.floor(stats.current_streak);
    const previousLongest =
      previous ?? (stats.longest_streak > streak ? stats.longest_streak : 0);
    const runStart = addDaysToLocalDate(entry.local_date, 1 - streak);
    const message = streakPopupMessage({
      streak,
      previousLongest,
      seed: `${deps.userId}|${runStart}`,
    });
    return { kind: 'streak', streak, message };
  })();
  try {
    return await Promise.race([work, timeout]);
  } catch {
    return ENTRY_COMPLETION;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The moods for an entry (spec §1.2): the multi-mood array when present, else the
 * legacy single mood_slug. Never returns undefined so display surfaces stay simple.
 */
export function entryMoods(
  entry: { mood_slugs?: string[] | null; mood_slug?: string | null } | null | undefined,
): string[] {
  if (entry?.mood_slugs && entry.mood_slugs.length) return entry.mood_slugs;
  return entry?.mood_slug ? [entry.mood_slug] : [];
}

/** Order-independent equality for two mood sets. */
function sameMoodSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((m) => sa.has(m));
}

/**
 * Whether an edited entry's AI insight should be regenerated. The insight is generated
 * from BOTH the moods and the note (the prompt includes the mood), so a change to
 * either invalidates the existing summary. Moods are compared as a set (spec §1.2 —
 * up to 3 per entry), falling back to the legacy single mood_slug.
 */
export function shouldRegenerateInsight(
  prev: { note: string | null; mood_slugs?: string[]; mood_slug?: string } | null | undefined,
  next: { note: string | null; moods: string[] },
): boolean {
  const noteChanged = (prev?.note ?? null) !== next.note;
  const prevMoods = prev?.mood_slugs?.length
    ? prev.mood_slugs
    : prev?.mood_slug
      ? [prev.mood_slug]
      : [];
  const moodChanged = !sameMoodSet(prevMoods, next.moods);
  return noteChanged || moodChanged;
}

/**
 * Time-of-day greeting for the home header, from the LOCAL device hour (0–23), in the client's
 * casing (10/14 p.3 "Good afternoon, Konah", p.28 "Good evening, [name]"):
 *   05:00–11:59 → "Good morning, {name}"
 *   12:00–16:59 → "Good afternoon, {name}"
 *   17:00–23:59 → "Good evening, {name}"
 *   00:00–04:59 → "Hello, {name}"  — none of the three fit the middle of the night.
 */
export function homeGreeting(name: string | null, hour: number): string {
  const prefix =
    hour >= 5 && hour < 12
      ? 'Good morning'
      : hour >= 12 && hour < 17
        ? 'Good afternoon'
        : hour >= 17
          ? 'Good evening'
          : 'Hello';
  // No name (only while the profile is still loading): the greeting alone, never a placeholder
  // like "there" (client 10/14 p.10 calls that a broken placeholder).
  return name ? `${prefix}, ${name}` : prefix;
}

export interface SubmitGuardState {
  hasMood: boolean;
  /** Whether the entry's note has non-empty text (mandatory to submit). */
  hasNote: boolean;
  /** Local "in flight" flag for the save handler. */
  saving: boolean;
  /** The create mutation is pending. */
  creating: boolean;
  /** The update mutation is pending. */
  updating: boolean;
}

/**
 * Whether a save may start. Blocks while a save is already in flight so rapid
 * duplicate taps cannot create duplicate entries, and requires BOTH at least one mood
 * and a non-empty note (both are mandatory to submit — see the app-wide entry rules).
 */
export function canSubmitEntry({
  hasMood,
  hasNote,
  saving,
  creating,
  updating,
}: SubmitGuardState): boolean {
  return hasMood && hasNote && !saving && !creating && !updating;
}
