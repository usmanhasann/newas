import { queryOptions, useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@store/session';
import { useProfile } from '@features/profile';
import { localDateInTZ } from '@utils/date';
import * as api from './api';

export type Period = 'week' | 'month' | 'year';

/** A locked, completed period (inclusive local dates). */
export interface PeriodRange {
  start: string;
  end: string;
}

export const insightsKeys = {
  stats: (uid?: string, day?: string) => ['insights', 'stats', uid, day] as const,
  periods: (uid?: string, today?: string) => ['insights', 'periods', uid, today] as const,
  breakdown: (uid?: string, period?: Period, start?: string, end?: string) =>
    ['insights', 'breakdown', uid, period, start, end] as const,
};

/**
 * THE journal-stats query — the one streak number in the app. Insights ("Current"/"Longest"),
 * the Home streak badge and the entry-completion heading all read this same query (and cache
 * entry) rather than computing their own. `today` is the user's local date (midnight boundary).
 */
export function journalStatsQuery(uid: string | undefined, today: string) {
  return queryOptions({
    queryKey: insightsKeys.stats(uid, today),
    queryFn: () => api.fetchJournalStats(today, uid),
  });
}

export function useJournalStats() {
  const user = useCurrentUser();
  const { data: profile } = useProfile();
  const today = localDateInTZ(new Date(), profile?.timezone);
  return useQuery({
    ...journalStatsQuery(user?.id, today),
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}

/**
 * The finished periods the Mood Breakdown shows on each tab (see api.fetchBreakdownPeriods). Keyed by
 * the local date, so the day a period ends the tab moves on to it: Sep 7 to 13 shows from Sep 14
 * until Sep 20, and Sep 14 to 20 takes over on Sep 21.
 */
export function useBreakdownPeriods(today: string) {
  const user = useCurrentUser();
  return useQuery({
    queryKey: insightsKeys.periods(user?.id, today),
    queryFn: () => api.fetchBreakdownPeriods(today),
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });
}

/**
 * Mood Breakdown for a LOCKED, finished period. It's a fixed snapshot: new entries belong to the
 * next period, so they never change it (only deleting an entry from inside that period does).
 * `range` is null while the tab is still locked, and then nothing is fetched.
 */
export function useMoodBreakdown(period: Period, range: PeriodRange | null) {
  const user = useCurrentUser();
  return useQuery({
    queryKey: insightsKeys.breakdown(user?.id, period, range?.start, range?.end),
    queryFn: () => api.fetchMoodBreakdown(range!.start, range!.end),
    enabled: !!user?.id && !!range,
    staleTime: 30_000,
  });
}
