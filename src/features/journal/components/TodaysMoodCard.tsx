/**
 * Home "Today's Mood" card — a quick mood shortcut (Bubble parity §3). Shows the same
 * non-emoji mood icons as the New Entry selector; tapping one opens New Entry with that
 * feeling pre-selected, where the user can add up to 3 moods for the entry (spec §1.2).
 *
 * The whole card is a tap target too (client 10/14 p.6): a tap anywhere that isn't a mood (the
 * background, the header, the streak badge, empty space) opens New Entry with no mood chosen. The
 * mood circles are their own, innermost touchables, so a mood tap reaches only the mood (never both),
 * and a horizontal drag on the row still scrolls it (the scroll cancels the card's press).
 *
 * Today's highlight (§3): once the user saves an entry today, the moods they logged float to the
 * LEFT of the row and show as selected (ring + checkmark badge), accumulating across every entry
 * that day in first-selected order and resetting on a new day. Tapping ANY mood — highlighted or
 * not — still just opens New Entry; the ring/checkmark are purely visual confirmation.
 *
 * The card header also carries the streak indicator (top-right, beside the label): a flame + the
 * current streak for anyone with a live streak, gaining an hourglass once it's 8pm and today's entry
 * is still missing (the same "about to lose it" condition the 8pm reminder fires on). Hidden entirely
 * for users with no active streak.
 */
import { Pressable, View } from 'react-native';
import { Card, MoodSelector, Text } from '@components';
import { colors } from '@theme';
import { todaysMoodOrder } from '@features/moods';
import type { MoodKey } from '@theme';
import { useTodayMoods, useStreakIndicator } from '../hooks';

/** The phone's own color emoji (client 10/14 p.15), never a drawn icon. ⏳ is U+23F3, not U+231B. */
const STREAK_FLAME = '\u{1F525}'; // 🔥 U+1F525
const STREAK_HOURGLASS = '⏳'; // U+23F3 (hourglass with flowing sand)

export interface TodaysMoodCardProps {
  /** Tapped mood → open New Entry with it pre-selected. */
  onPickMood: (mood: MoodKey) => void;
  /** Tapped anywhere else on the card → open New Entry with no mood chosen. */
  onPressCard: () => void;
}

/**
 * Flame + streak count (top-right of the card header). Normal state: 🔥 + a dark count. Urgent
 * state (8pm, today not journaled): ⏳ leads and the count escalates to red, matching the client
 * mockup. The emoji keep the old icons' footprint: a 13px emoji draws about as tall as the old
 * 18px flame icon (an icon glyph fills ~7/8 of its box, an emoji ~1.2x its font size), 12px about
 * as tall as the old 16px hourglass. The app font (Inter) has no glyph for either character, so
 * both fall back to the system color emoji font (Apple on iPhone, the phone's own on Android).
 */
function StreakBadge() {
  const { state, streak } = useStreakIndicator();
  if (state === 'hidden') return null;
  const urgent = state === 'urgent';
  const countColor = urgent ? colors['danger-strong'] : colors.ink;
  return (
    <View
      // One element for screen readers: the label below, not "hourglass, fire, 7".
      accessible
      className="flex-row items-center gap-1"
      accessibilityRole="text"
      accessibilityLabel={
        urgent
          ? `${streak} day streak. Journal before midnight to keep it`
          : `${streak} day streak`
      }
    >
      {urgent ? <Text className="text-xs">{STREAK_HOURGLASS}</Text> : null}
      <Text className="text-sm">{STREAK_FLAME}</Text>
      <Text className="font-sans-bold text-md" style={{ color: countColor }}>
        {streak}
      </Text>
    </View>
  );
}

export function TodaysMoodCard({ onPickMood, onPressCard }: TodaysMoodCardProps) {
  const selectedToday = useTodayMoods();
  const order = todaysMoodOrder(selectedToday);

  return (
    // Not an accessibility element itself, so each mood stays its own button for screen readers
    // (the + New Entry button is their way to open a blank entry).
    <Pressable
      onPress={() => onPressCard()}
      accessible={false}
      testID="todays-moods-card"
      className="mt-4"
    >
      <Card>
        <View className="flex-row items-center justify-between">
          <Text variant="section">Today’s Moods</Text>
          <StreakBadge />
        </View>
        <View className="mt-3">
          <MoodSelector
            selected={selectedToday}
            order={order}
            showSelectedBadge
            onToggle={onPickMood}
          />
        </View>
      </Card>
    </Pressable>
  );
}
