import { supabase } from '@lib';
import type { ReflectionType } from '@app-types/database';

export interface JournalStats {
  entries_count: number;
  current_streak: number;
  longest_streak: number;
  /** The last day journaled, kept even if that day's entries were deleted (drives the streak). */
  last_entry_date: string | null;
  /** The date of the newest entry that still exists (Insights "Last Entry"); null when none. */
  last_entry_on: string | null;
  /**
   * Separate LOCAL calendar days with an entry (not the entry count). Reads 0 on a
   * deployment where the 20260812090000 migration hasn't run yet — a fail-closed
   * default, so anything gated on it simply stays off rather than misfiring.
   */
  distinct_days: number;
}

/** The local date of the user's newest remaining entry (undefined when it can't be read). */
async function fetchLastEntryOn(userId: string): Promise<string | null | undefined> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('local_date')
    .eq('user_id', userId)
    .order('local_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return error ? undefined : (data?.local_date ?? null);
}

export async function fetchJournalStats(todayLocal: string, userId?: string): Promise<JournalStats> {
  const [{ data, error }, lastOn] = await Promise.all([
    supabase.rpc('get_journal_stats', { today_local: todayLocal }),
    userId ? fetchLastEntryOn(userId) : Promise.resolve(undefined),
  ]);
  if (error) throw error;
  const row = data?.[0];
  const lastDay = row?.last_entry_date ?? null;
  return {
    entries_count: Number(row?.entries_count ?? 0),
    current_streak: row?.current_streak ?? 0,
    longest_streak: row?.longest_streak ?? 0,
    last_entry_date: lastDay,
    // If the entries can't be read, the last journaled day is the closest true answer.
    last_entry_on: lastOn === undefined ? lastDay : lastOn,
    distinct_days: Number(row?.distinct_days ?? 0),
  };
}

/** The finished period a Mood Breakdown tab shows, by card type (absent: that tab is still locked). */
export interface BreakdownPeriod {
  type: ReflectionType;
  start: string;
  end: string;
  /** False for a period with no entries: the card shows its empty state (client 10/14 p.13). */
  hasEntries: boolean;
}

/**
 * Per card type, the newest period that has ENDED, entries or not (client 10/14 p.13-14: an empty
 * period gets an empty state instead of the card staying on an older period), from the same period
 * math as the Weekly/Monthly/Yearly reflections. It never depends on whether the AI reflection for
 * that period is ready, so a slow or failed reflection can't hold the breakdown on an older period.
 */
export async function fetchBreakdownPeriods(todayLocal: string): Promise<BreakdownPeriod[]> {
  const { data, error } = await supabase.rpc('get_breakdown_periods', { p_today: todayLocal });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    type: r.type,
    start: r.period_start,
    end: r.period_end,
    // A server from before this change only returned periods with entries.
    hasEntries: r.has_entries ?? true,
  }));
}

export interface MoodCount {
  mood_slug: string;
  count: number;
}

export async function fetchMoodBreakdown(
  start: string,
  end: string,
): Promise<MoodCount[]> {
  const { data, error } = await supabase.rpc('get_mood_breakdown', {
    start_date: start,
    end_date: end,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({ mood_slug: r.mood_slug, count: Number(r.count) }));
}
