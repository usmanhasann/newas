/**
 * Insights "Reflections" section (§7/§8). Shows a SINGLE reflection card matching the
 * period filter selected on the Insights screen (weekly/monthly/yearly). Appears once
 * the user has any entry, and idempotently asks the server to generate any due
 * reflections when opened and again on each new day (the Insights tab stays mounted, so a
 * period that ends while the app is open still gets its reflection; the server skips
 * already-ready periods).
 */
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { Card, Text, Button } from '@components';
import type { ReflectionType } from '@app-types/database';
import { useScreenFocused } from '@hooks/useScreenFocused';
import { useReflectionsOverview, useGenerateReflections } from '../hooks';
import { ReflectionCard } from './ReflectionCard';

export function ReflectionsSection({ type, today }: { type: ReflectionType; today?: string }) {
  const overviewQ = useReflectionsOverview(today);
  const gen = useGenerateReflections();
  const focused = useScreenFocused();
  const triggeredFor = useRef<string | null>(null);

  const rows = overviewQ.data ?? [];
  const hasAnyEntry = rows.some((r) => r.hasAnyEntry);
  const overview = rows.find((r) => r.type === type);

  // Ask the server (idempotent) once per day while there's data to act on, and only while Insights
  // is actually on screen: the 9 AM recap push skips a period whose reflection already exists, so
  // writing it in the background (the tab stays mounted) would cancel that day's push for someone
  // who never looked at Insights.
  const day = today ?? 'mount';
  useEffect(() => {
    if (focused && triggeredFor.current !== day && hasAnyEntry && !gen.isPending) {
      triggeredFor.current = day;
      gen.mutate(undefined, {
        // Couldn't ask (offline, server error): ask again the next time Insights is shown.
        onError: () => {
          triggeredFor.current = null;
        },
      });
    }
  }, [focused, hasAnyEntry, gen, day]);
  // The request ended and the fresh overview is in: whatever wasn't made by now gets Try again.
  const requestSettled = (gen.isSuccess || gen.isError) && !overviewQ.isFetching;

  // No entries yet → reflection placeholders only appear after the first entry (§7).
  if (!overviewQ.isLoading && !overviewQ.isError && !hasAnyEntry) return null;

  let body;
  if (overviewQ.isLoading) {
    body = (
      <Card>
        <Text variant="bodyMuted" className="text-center">
          Loading your reflection…
        </Text>
      </Card>
    );
  } else if (overviewQ.isError) {
    body = (
      <Card>
        <Text variant="bodyStrong">We couldn’t load your reflection</Text>
        <Text variant="bodyMuted" className="mt-1">
          Check your connection and try again.
        </Text>
        <Button
          title="Try again"
          variant="secondary"
          size="sm"
          fullWidth={false}
          className="mt-3 self-start"
          loading={overviewQ.isFetching}
          onPress={() => overviewQ.refetch()}
        />
      </Card>
    );
  } else if (overview) {
    body = (
      <ReflectionCard
        overview={overview}
        retrying={gen.isPending}
        requestSettled={requestSettled}
        onRetry={() => gen.mutate()}
      />
    );
  } else {
    return null;
  }

  return (
    <View className="mb-6">
      <Text variant="section" className="mb-3">
        Reflections
      </Text>
      {body}
    </View>
  );
}
