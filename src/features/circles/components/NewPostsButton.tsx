import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@components';
import { colors, shadow, spacing } from '@theme';
import { heldFeedView, isAwayFromTop } from '../liveFeed';
import { wasRemovedLive } from '../circleLive';

/** How often (ms) a scrolling list reports its position: enough to notice leaving the top. */
const SCROLL_EVENT_THROTTLE = 32;

type Scrollable = {
  scrollToOffset?: (params: { offset: number; animated?: boolean }) => void;
  scrollTo?: (params: { y: number; animated?: boolean }) => void;
};

/**
 * For a scrolling list of posts (client 10/14 p.7): `away` is true while the person has scrolled
 * down reading older posts, when new posts must not push what they're reading down the screen.
 * Spread `scrollProps` on the ScrollView/FlatList; `toTop` scrolls back up and lets the new posts in.
 */
export function useNewPostsScroll<T extends Scrollable>() {
  const ref = useRef<T>(null);
  const [away, setAway] = useState(false);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = isAwayFromTop(e.nativeEvent.contentOffset.y);
    setAway((prev) => (prev === next ? prev : next));
  }, []);
  const toTop = useCallback(() => {
    setAway(false);
    const list = ref.current;
    if (list?.scrollToOffset) list.scrollToOffset({ offset: 0, animated: true });
    else list?.scrollTo?.({ y: 0, animated: true });
  }, []);
  return {
    away,
    toTop,
    scrollProps: { ref, onScroll, scrollEventThrottle: SCROLL_EVENT_THROTTLE },
  };
}

/**
 * The posts to show: `fresh` as loaded while `hold` is off; while it's on, what was showing when it
 * came on (kept up to date, minus anything removed) and `held` = how many new posts are waiting.
 */
export function useHeldFeed<T extends { id: string; created_at: string }>(
  fresh: readonly T[],
  hold: boolean,
) {
  const [snapshot, setSnapshot] = useState<readonly T[] | null>(null);
  const [holding, setHolding] = useState(hold);
  if (holding !== hold) {
    // The moment holding starts, remember what's showing; when it stops, let everything in.
    setHolding(hold);
    setSnapshot(hold ? fresh : null);
  }
  return useMemo(
    () => heldFeedView(fresh, hold ? (snapshot ?? fresh) : null, wasRemovedLive),
    [fresh, hold, snapshot],
  );
}

/** Tell a parent how many new posts are waiting (it shows the button). */
export function useReportHeld(held: number, onHeldChange?: (held: number) => void) {
  useEffect(() => {
    onHeldChange?.(held);
  }, [held, onHeldChange]);
}

/**
 * The small "New posts" button at the top of a list (client 10/14 p.7), shown when new posts came
 * in while the person was scrolled down. Tapping it takes them up to the new posts. Render it after
 * the list, inside a container the list fills.
 */
export function NewPostsButton({
  visible,
  onPress,
}: {
  visible: boolean;
  onPress: () => void;
}) {
  if (!visible) return null;
  return (
    <View pointerEvents="box-none" className="absolute left-0 right-0 top-3 items-center">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="New posts"
        hitSlop={8}
        className="flex-row items-center gap-1.5 rounded-full bg-brand-500 px-4 py-2"
        style={shadow.brand}
      >
        <Ionicons name="arrow-up" size={spacing[4]} color={colors['ink-inverse']} />
        <Text variant="label" className="text-ink-inverse">
          New posts
        </Text>
      </Pressable>
    </View>
  );
}
