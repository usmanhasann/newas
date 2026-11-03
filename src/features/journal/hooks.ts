import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useCurrentUser } from '@store/session';
import { toast } from '@store/toast';
import { useProfile } from '@features/profile';
import {
  canDeliver,
  cancelDailyCheckIns,
  getNotificationPermission,
  scheduleDailyCheckIns,
  useNotificationPrefs,
} from '@features/notifications';
import { logger } from '@lib';
import { journalStatsQuery, useJournalStats } from '@features/insights';
import { postKeys } from '@features/circles';
import { deviceTimeZone, localDateInTZ, hourInTZ, parseHhmm } from '@utils/date';
import { useLocalToday } from '@hooks/useLocalToday';
import * as api from './api';
import type { CreateEntryInput, EntryCursor, EntryPatch } from './api';
import { selectedMoodsToday } from '@features/moods';
import type { MoodKey } from '@theme';
import { planDailyPrompts, todaysPrompt, trimDailyPlan } from './dailyPrompt';
import { streakIndicatorState, type StreakIndicatorState } from './streakStatus';
import { resolveCompletion } from './logic';
import { checkInMilestoneBodies, type StreakSnapshot } from './streakMessages';

export const journalKeys = {
  all: ['journal'] as const,
  list: (uid?: string) => ['journal', 'list', uid] as const,
  entry: (id: string) => ['journal', 'entry', id] as const,
  today: (uid?: string) => ['journal', 'today', uid] as const,
};

export function useEntries() {
  const user = useCurrentUser();
  return useInfiniteQuery({
    queryKey: journalKeys.list(user?.id),
    queryFn: ({ pageParam }) => api.listEntries(user!.id, pageParam ?? undefined),
    initialPageParam: null as EntryCursor | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!user?.id,
    staleTime: 15_000,
  });
}

export function useEntry(id: string) {
  return useQuery({
    queryKey: journalKeys.entry(id),
    queryFn: () => api.getEntry(id),
    enabled: !!id,
  });
}

/**
 * Returns an async resolver for the completion popup of a just-saved entry: the streak popup
 * (streak + message line) on the day's first entry, plain "Entry complete" otherwise. The streak
 * comes from the SAME query Insights reads (fetched fresh: the create mutation invalidates it), so
 * there is only one streak number in the app. Never throws; falls back to "Entry complete".
 */
export function useCompletionHeadingResolver() {
  const user = useCurrentUser();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  return (entry: { id: string; local_date: string }) =>
    resolveCompletion(entry, {
      firstEntryIdOfDay: () => api.getFirstEntryIdOfDay(user!.id, entry.local_date),
      freshStats: async () => {
        const query = journalStatsQuery(user?.id, localDateInTZ(new Date(), profile?.timezone));
        // An initial fetch started BEFORE the insert would otherwise be joined (and return
        // pre-save stats); cancel it so this request is guaranteed to run after the save.
        await qc.cancelQueries({ queryKey: query.queryKey });
        return qc.fetchQuery({ ...query, staleTime: 0 });
      },
      // Called after the save, so the run that includes this entry's day is the one left out.
      previousLongest: () => api.getPreviousLongestStreak(entry.local_date),
      userId: user?.id ?? '',
    });
}

/**
 * The rotating home-screen prompt, the SAME daily pick the daily check-in notification carries (see
 * dailyPrompt.ts / promptRotation.ts). While the check-in reminder is on, the rotation moves every
 * calendar day; while it's off, only on days the app is opened.
 *
 * The day key uses the DEVICE timezone, synchronous and stable from the first render, so the query
 * is not re-keyed mid-session by an async-loading profile timezone (which would double-advance); it
 * is read again on returning to the app or the tab, so a phone left open overnight shows the new
 * day's prompt. The rotation is also monotonic as a second guard.
 */
export function useDailyPrompt(): string {
  const today = useLocalToday();
  const prefsQ = useNotificationPrefs();
  // Wait for the reminder setting (it decides how the rotation moves); if it can't load, treat the
  // reminder as off.
  const settled = prefsQ.data !== undefined || prefsQ.isError || prefsQ.fetchStatus === 'idle';
  const daily = !!prefsQ.data?.journaling_reminder;
  // Couldn't load the setting: show today's pick without rewriting the rotation.
  const unknown = prefsQ.data === undefined && prefsQ.isError;
  const query = useQuery({
    queryKey: ['journal', 'dailyPrompt', today, daily, unknown],
    queryFn: () => todaysPrompt(today, daily, undefined, { readOnly: unknown }),
    enabled: settled,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  // Nothing (not a stand-in prompt) until today's pick is known, so the line never changes under you.
  return query.data ?? '';
}

/** A local Date on `date` (YYYY-MM-DD) at hour:minute, device time. */
function atLocalTime(date: string, hour: number, minute: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, hour, minute, 0, 0);
}

/**
 * Keeps the daily check-in notifications in step with the saved preference, the OS permission and
 * the shared daily prompt. While the reminder is on (and permitted), each of the next PLAN_DAYS days
 * gets its own check-in at the chosen time: "Your daily check-in" with THAT day's prompt as the body.
 * Off, or not permitted: all cancelled (users who turned it off never get it; the home screen prompt
 * keeps rotating either way). Re-runs when the preference changes and whenever the app returns to the
 * foreground (a new day extends the plan; permission may have been turned on in system Settings).
 * Mounted once at the app root.
 *
 * Streak milestones (client revisions 10/14, p.28): on a day whose check-in would make the streak a
 * milestone, and while that day has no entry yet, that day's notification says "Today could be day
 * [X+1]. Take a minute to check in." instead of the prompt (see checkInMilestoneBodies). The streak
 * is the app's one journal-stats query, so saving an entry re-plans the check-ins (today goes back to
 * its prompt). The rotation and the home screen prompt never change.
 */
export function useDailyPromptReminder(): void {
  const { data: prefs } = useNotificationPrefs();
  const { data: stats } = useJournalStats();
  const lastSig = useRef<string | null>(null);

  // `undefined` means "not loaded yet", distinct from a loaded row. Never treat the pre-load state as
  // "reminder off", or every cold start would cancel working reminders.
  const loaded = prefs !== undefined;
  const enabled = !!prefs?.journaling_reminder;
  const time = prefs?.reminder_time ?? null;
  const currentStreak = stats?.current_streak ?? null;
  const lastEntryDate = stats?.last_entry_date ?? null;
  // Unknown streak (still loading or failed): every day keeps its prompt.
  const streak: StreakSnapshot | null =
    currentStreak === null ? null : { currentStreak, lastEntryDate };
  // The latest wanted state, read by each run when it actually starts. Runs go one at a time, so a
  // quick on → off (or off → on) always ends matching the last setting, never an older one. Kept
  // current by the first effect below, which React runs before the sync effect after it.
  const wanted = useRef({ loaded, enabled, time, streak });
  const chain = useRef<Promise<void>>(Promise.resolve());

  const runOnce = useCallback(async () => {
    const { loaded: isLoaded, enabled: isOn, time: at0, streak: streakNow } = wanted.current;
    if (!isLoaded) return;
    try {
      // Permission is read every pass: a denied → granted flip in system Settings is exactly what
      // the foreground re-run exists to catch.
      const perm = await getNotificationPermission();
      const at = parseHhmm(at0);
      const today = localDateInTZ(new Date());
      const on = isOn && canDeliver(perm) && !!at;
      // Milestone eves replace that day's prompt in the notification only.
      const milestones = checkInMilestoneBodies(today, streakNow);
      // The time zone is part of it: after travelling, the check-ins move to the new local time. The
      // milestone lines are too, so a streak change re-plans only when it changes a notification.
      const sig = on
        ? `on|${at!.hour}:${at!.minute}|${today}|${deviceTimeZone()}|${JSON.stringify(milestones)}`
        : `off|${isOn}`;
      if (lastSig.current === sig) return;

      if (on) {
        const plan = await planDailyPrompts(today);
        await scheduleDailyCheckIns(
          plan.map((day) => ({
            key: day.date,
            at: atLocalTime(day.date, at!.hour, at!.minute),
            body: milestones[day.date] ?? day.prompt,
          })),
        );
      } else {
        await cancelDailyCheckIns();
        // Reminder switched off: the rotation goes back to moving only on open days, from today.
        if (!isOn) await trimDailyPlan(today);
      }
      lastSig.current = sig;
    } catch (e) {
      logger.warn('daily check-in sync failed', { error: String(e) });
    }
  }, []);

  const sync = useCallback(() => {
    chain.current = chain.current.then(runOnce, runOnce);
    return chain.current;
  }, [runOnce]);

  useEffect(() => {
    wanted.current = {
      loaded,
      enabled,
      time,
      streak: currentStreak === null ? null : { currentStreak, lastEntryDate },
    };
  }, [loaded, enabled, time, currentStreak, lastEntryDate]);

  useEffect(() => {
    void sync();
  }, [sync, loaded, enabled, time, currentStreak, lastEntryDate]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => subscription.remove();
  }, [sync]);
}

export function useTodayEntry() {
  const user = useCurrentUser();
  const { data: profile } = useProfile();
  const localDate = useLocalToday(profile?.timezone);
  return useQuery({
    queryKey: [...journalKeys.today(user?.id), localDate],
    queryFn: () => api.getTodayEntry(user!.id, localDate),
    enabled: !!user?.id,
  });
}

/**
 * Moods logged today, in first-selected order — drives the Home "Today's Mood" highlight (§3).
 * Accumulates across every entry saved today and resets on a new local day (also when the app was
 * left open overnight: the day is read again on returning to the app or the tab). Keyed under
 * journalKeys.today so creating/editing/deleting an entry (which invalidate that prefix) refreshes
 * the highlight.
 */
export function useTodayMoods(): MoodKey[] {
  const user = useCurrentUser();
  const { data: profile } = useProfile();
  const localDate = useLocalToday(profile?.timezone);
  const q = useQuery({
    queryKey: [...journalKeys.today(user?.id), 'moods', localDate],
    queryFn: () => api.getTodayMoodLists(user!.id, localDate),
    enabled: !!user?.id,
  });
  return selectedMoodsToday(q.data ?? []);
}

/**
 * The Home streak indicator's state + count. Sources the streak and last-entry day from
 * get_journal_stats (via useJournalStats), derives "already journaled today" against the user's local
 * day, and reads the current local hour in the user's timezone — then defers the show/normal/urgent
 * decision to the shared streakIndicatorState so it lines up with the 8pm reminder.
 */
export function useStreakIndicator(): { state: StreakIndicatorState; streak: number } {
  const { data: profile } = useProfile();
  const { data: stats } = useJournalStats();
  const currentStreak = stats?.current_streak ?? 0;
  const today = useLocalToday(profile?.timezone);
  // `>=`, not `===`: after flying west across the date line the last journaled day can be
  // "tomorrow" here (YYYY-MM-DD strings compare in date order); that still counts as journaled.
  const hasEntryToday = !!stats?.last_entry_date && stats.last_entry_date >= today;
  const localHour = hourInTZ(new Date(), profile?.timezone);
  return {
    streak: currentStreak,
    state: streakIndicatorState({ currentStreak, hasEntryToday, localHour }),
  };
}

type CreateArgs = Omit<CreateEntryInput, 'local_date'> & { local_date?: string };

export function useCreateEntry() {
  const user = useCurrentUser();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: CreateArgs) =>
      api.createEntry(user!.id, {
        ...args,
        local_date: args.local_date ?? localDateInTZ(new Date(), profile?.timezone),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: journalKeys.list(user?.id) });
      qc.invalidateQueries({ queryKey: journalKeys.today(user?.id) });
      qc.invalidateQueries({ queryKey: ['insights'] });
      // The first entry sets profiles.first_entry_date (drives yearly unlock, §1.4)
      // and reflections gating — refresh profile + reflections.
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['reflections'] });
    },
  });
}

export function useUpdateEntry(id: string) {
  const user = useCurrentUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: EntryPatch) => api.updateEntry(id, patch),
    onSuccess: (updated) => {
      qc.setQueryData(journalKeys.entry(id), updated);
      qc.invalidateQueries({ queryKey: journalKeys.list(user?.id) });
      // Editing an entry can change today's moods → refresh the Home "Today's Mood" highlight.
      qc.invalidateQueries({ queryKey: journalKeys.today(user?.id) });
      qc.invalidateQueries({ queryKey: ['insights'] });
    },
  });
}

/** Drop a cached query now if no screen shows it, else as soon as the last screen showing it closes. */
function forgetWhenUnwatched(qc: QueryClient, queryKey: readonly unknown[]): void {
  const cache = qc.getQueryCache();
  const query = cache.find({ queryKey, exact: true });
  if (!query) return;
  if (query.getObserversCount() === 0) {
    cache.remove(query);
    return;
  }
  const stop = cache.subscribe((event) => {
    if (event.type === 'observerRemoved' && event.query === query && query.getObserversCount() === 0) {
      stop();
      cache.remove(query);
    }
  });
}

export function useDeleteEntry() {
  const user = useCurrentUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteEntry(id),
    onSuccess: (_data, id) => {
      // The deleted entry's own data goes once nothing shows it. Dropping or refetching it while
      // Entry Detail is still on screen flashed "This entry couldn't be found" (and "Private")
      // during the screen's exit.
      forgetWhenUnwatched(qc, journalKeys.entry(id));
      forgetWhenUnwatched(qc, postKeys.entryShares(id));
      qc.invalidateQueries({ queryKey: journalKeys.list(user?.id) });
      // Today's mood highlight is recalculated from the entries that are left.
      qc.invalidateQueries({ queryKey: journalKeys.today(user?.id) });
      // The locked Mood Breakdown stops counting it (the streak itself never drops).
      qc.invalidateQueries({ queryKey: ['insights'] });
      // A shared entry is gone from every circle it was in.
      qc.invalidateQueries({
        queryKey: postKeys.all,
        predicate: (q) => !(q.queryKey[1] === 'entryShares' && q.queryKey[2] === id),
      });
    },
    onError: () => toast.error('We couldn’t delete that entry. Please try again.'),
  });
}
