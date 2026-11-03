import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { Screen, Text, Card, Button } from '@components';
import { getMood } from '@theme';
import { cn } from '@utils/cn';
import { formatLocalDateShort, formatLocalRange, formatLongLocalDate } from '@utils/date';
import { useLocalToday } from '@hooks/useLocalToday';
import { useProfile } from '@features/profile';
import { ReflectionsSection, useReflectionsOverview, readyOnSentence } from '@features/reflections';
import type { ReflectionType } from '@app-types/database';
import type { MainTabParamList } from '@/navigation/types';
import { useBreakdownPeriods, useJournalStats, useMoodBreakdown, type Period } from '../hooks';
import type { MoodCount } from '../api';

// The Week/Month/Year filter also selects which reflection (weekly/monthly/yearly) shows.
const REFLECTION_BY_PERIOD: Record<Period, ReflectionType> = {
  week: 'weekly',
  month: 'monthly',
  year: 'yearly',
};

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <View className="flex-row rounded-full bg-surface-muted p-1">
      {PERIODS.map((p) => {
        const active = value === p.key;
        return (
          <Pressable
            key={p.key}
            onPress={() => onChange(p.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={cn('flex-1 items-center rounded-full py-2', active && 'bg-brand-500')}
          >
            <Text variant="bodyStrong" className={active ? 'text-ink-inverse' : 'text-ink-soft'}>
              {p.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View className="flex-1 items-center">
      {/* Keep the value on ONE line — a longer value like "Jul 9" must not wrap to "Jul". */}
      <Text variant="h2" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" className="mt-1">
        {label}
      </Text>
    </View>
  );
}

/** Empty finished period (client 10/14 p.13): same pattern as the reflection card's empty state. */
export const BREAKDOWN_EMPTY = 'No entries in this period yet. Log a mood to see your patterns here.';

/**
 * Under a breakdown (or its empty state), styled like the dates under the Weekly Reflection
 * (client 10/14 p.30): the period it covers, then when the next one is ready.
 */
function BreakdownDates({ start, end, nextReady }: { start: string; end: string; nextReady?: string }) {
  const range = formatLocalRange(start, end);
  const next = nextReady ? formatLongLocalDate(nextReady) : '';
  return (
    <>
      {range ? (
        <Text variant="meta" className="mt-2">
          Your moods from {range}
        </Text>
      ) : null}
      {next ? (
        <Text variant="caption" className="mt-3">
          Your breakdown will be ready on {next}.
        </Text>
      ) : null}
    </>
  );
}

function Breakdown({ data, dates }: { data: MoodCount[]; dates: ReactNode }) {
  const total = data.reduce((s, m) => s + m.count, 0);
  if (total === 0) {
    // No moods counted for the period (e.g. its entries were deleted): the empty state.
    return (
      <Card>
        <Text variant="bodyMuted">{BREAKDOWN_EMPTY}</Text>
        {dates}
      </Card>
    );
  }
  return (
    <Card>
      {data.map((m) => {
        const def = getMood(m.mood_slug);
        const pct = Math.round((m.count / total) * 100);
        return (
          <View key={m.mood_slug} className="mb-3">
            <View className="mb-1 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <View
                  style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: def.dot }}
                />
                <Text variant="body">{def.label}</Text>
              </View>
              <Text variant="caption">
                {m.count} · {pct}%
              </Text>
            </View>
            <View className="h-2 overflow-hidden rounded-full bg-surface-muted">
              <View
                className="h-2 rounded-full"
                style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: def.dot }}
              />
            </View>
          </View>
        );
      })}
      {dates}
    </Card>
  );
}

/** Not ready yet (client 10/14 p.1): the user has entries, but no period of this length has finished. */
function breakdownNotReadyText(period: Period): string {
  return `Your mood breakdown will show here after a full ${period} of journaling.`;
}

/** No entries at all (client 10/14 p.4): one card, under "Moods & Reflections", per tab. */
function noEntriesText(type: ReflectionType): string {
  return `Start journaling to see your mood breakdown and ${type} reflection here.`;
}

/**
 * Mood Breakdown until the SELECTED period's first one is ready, all text centered. "Ready on" is
 * the same date the reflection card on that tab shows, so the two cards always agree.
 */
function MoodBreakdownNotReady({ period, readyOn }: { period: Period; readyOn?: string | null }) {
  const date = formatLongLocalDate(readyOn ?? null);
  return (
    <Card>
      <Text variant="bodyMuted" className="text-center">
        {breakdownNotReadyText(period)}
      </Text>
      {date ? (
        <Text variant="caption" className="mt-2 text-center">
          {readyOnSentence(date)}
        </Text>
      ) : null}
    </Card>
  );
}

function BreakdownMessage({ text }: { text: string }) {
  return (
    <Card>
      <Text variant="bodyMuted" className="text-center">
        {text}
      </Text>
    </Card>
  );
}

function BreakdownError({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  return (
    <Card>
      <Text variant="bodyStrong">We couldn’t load your mood patterns</Text>
      <Text variant="bodyMuted" className="mt-1">
        Check your connection and try again.
      </Text>
      <Button
        title="Try again"
        variant="secondary"
        size="sm"
        fullWidth={false}
        className="mt-3 self-start"
        loading={retrying}
        onPress={onRetry}
      />
    </Card>
  );
}

/** Only the three views: the params can also come from a deep link. */
function isPeriod(value: unknown): value is Period {
  return PERIODS.some((p) => p.key === value);
}

type InsightsRoute = RouteProp<MainTabParamList, 'InsightsTab'>;

/** `route` is the Insights tab's (absent when the screen is rendered on its own). */
export function InsightsScreen({ route }: { route?: InsightsRoute }) {
  // A reflection notification opens Insights on its Week / Month / Year view (client 10/14 p.9,
  // N8.29). The cards still show the newest finished period, the one that notification announces.
  const asked = route?.params;
  const askedPeriod = asked?.period;
  const openOn = isPeriod(askedPeriod) ? askedPeriod : undefined;
  const [period, setPeriod] = useState<Period>(openOn ?? 'week');
  // The tab stays mounted, so a later notification switches the filter to the view it asks for.
  // Every tap brings new params; coming back to the tab by hand keeps the same ones, so a filter
  // picked since then stays.
  const [shownAsk, setShownAsk] = useState(asked);
  if (asked !== shownAsk) {
    setShownAsk(asked);
    if (openOn) setPeriod(openOn);
  }
  const stats = useJournalStats();
  const { data: profile } = useProfile();
  // The tab stays mounted: re-read the day on focus/foreground so a new period shows the day it starts.
  const today = useLocalToday(profile?.timezone);

  // The Mood Breakdown locks to the last FINISHED period of the selected length (Sep 7 to 13 shows
  // from Sep 14 through Sep 20), a fixed snapshot that new entries never change. The period comes
  // from the same period math as the reflections, but never waits on the AI reflection being ready.
  const overviewQ = useReflectionsOverview(today);
  const reflectionType = REFLECTION_BY_PERIOD[period];
  const currentOverview = (overviewQ.data ?? []).find((r) => r.type === reflectionType);
  // No journal entries at all (the server says so; unknown counts as having entries): one
  // "Moods & Reflections" card instead of both sections. The Reflections section hides on the same
  // server flag, and a new entry refreshes it, so the normal layout returns with the first entry.
  const noEntries =
    !!overviewQ.data?.length && overviewQ.data.every((r) => r.hasAnyEntry === false);
  const periodsQ = useBreakdownPeriods(today);
  const locked = periodsQ.data?.find((p) => p.type === reflectionType);
  const range = locked ? { start: locked.start, end: locked.end } : null;
  // An empty finished period has nothing to count: skip the request, show the empty state.
  const empty = locked?.hasEntries === false;
  const breakdown = useMoodBreakdown(period, empty || noEntries ? null : range);
  const dates = locked ? (
    <BreakdownDates start={locked.start} end={locked.end} nextReady={currentOverview?.nextUnlockDate} />
  ) : null;

  let moods;
  if (noEntries) {
    moods = <BreakdownMessage text={noEntriesText(reflectionType)} />;
  } else if (periodsQ.isError && !periodsQ.data) {
    moods = <BreakdownError retrying={periodsQ.isFetching} onRetry={() => periodsQ.refetch()} />;
  } else if (!periodsQ.data) {
    moods = <BreakdownMessage text="Loading your mood patterns…" />;
  } else if (!range) {
    // Until the overview says whether there are any entries, don't guess which text applies.
    moods =
      !overviewQ.data && !overviewQ.isError ? (
        <BreakdownMessage text="Loading your mood patterns…" />
      ) : (
        <MoodBreakdownNotReady period={period} readyOn={currentOverview?.nextUnlockDate} />
      );
  } else if (empty) {
    moods = (
      <Card>
        <Text variant="bodyMuted">{BREAKDOWN_EMPTY}</Text>
        {dates}
      </Card>
    );
  } else if (breakdown.isError && !breakdown.data) {
    moods = <BreakdownError retrying={breakdown.isFetching} onRetry={() => breakdown.refetch()} />;
  } else if (!breakdown.data) {
    moods = <BreakdownMessage text="Loading your mood patterns…" />;
  } else {
    moods = <Breakdown data={breakdown.data} dates={dates} />;
  }

  return (
    <Screen scroll contentClassName="py-6">
      <Text variant="h1">Your Insights</Text>
      <Text variant="bodyMuted" className="mt-1">
        Patterns in your emotional journey.
      </Text>

      <View className="mb-5 mt-6">
        <PeriodToggle value={period} onChange={setPeriod} />
      </View>

      <Text variant="section" className="mb-3">
        Journaling Streak
      </Text>
      <Card className="mb-6">
        <View className="flex-row justify-around">
          <Stat value={stats.data?.current_streak ?? 0} label="Current" />
          <Stat value={stats.data?.longest_streak ?? 0} label="Longest" />
          <Stat
            value={formatLocalDateShort(stats.data?.last_entry_on ?? null) || 'None'}
            label="Last Entry"
          />
        </View>
      </Card>

      {/* The section variant uppercases: "MOOD BREAKDOWN" / "MOODS & REFLECTIONS". */}
      <Text variant="section" className="mb-3">
        {noEntries ? 'Moods & Reflections' : 'Mood Breakdown'}
      </Text>
      <View className="mb-6">{moods}</View>

      {/* One reflection, matching the selected period filter, in the brand card style. */}
      <ReflectionsSection type={reflectionType} today={today} />
    </Screen>
  );
}
