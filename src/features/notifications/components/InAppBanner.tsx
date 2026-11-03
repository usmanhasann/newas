/**
 * One in-app notification banner (client revisions 10/14 p.7): it slides down from the top of the
 * screen, similar to Instagram, goes away on its own after about 4 seconds, and can be swiped up to
 * dismiss it. Tapping it opens whatever it is about.
 *
 * Remounted for each notification (keyed by the host); a post combined into it (same circle, at
 * once) updates its lines and restarts its time.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Text, VerifiedBadge } from '@components';
import { colors, shadow, spacing } from '@theme';
import {
  BANNER_VISIBLE_MS,
  dragOffset,
  releaseDismisses,
  visibleFor,
  type BannerItem,
} from '../inAppModel';

const SLIDE_IN_MS = 260;
const SLIDE_OUT_MS = 200;
/** Where the banner starts and leaves to, before its real height is known. */
const START_OFFSET = -(spacing[24] + spacing[24]);
/** A drag shorter than this (px) is still a tap. */
const DRAG_SLOP = 6;

export interface InAppBannerProps {
  item: BannerItem;
  onPress: () => void;
  /** Called once it has gone (time up, swiped away, or tapped). */
  onGone: () => void;
}

/** The top line split around a verified name it starts with, or null when it has no badge. */
function splitVerifiedTitle(item: BannerItem): { name: string; rest: string } | null {
  const name = item.verifiedName;
  if (!name || !item.title.startsWith(name)) return null;
  return { name, rest: item.title.slice(name.length) };
}

/** One finger's drag: where it started, where it is, and how fast it's moving (px/ms). */
interface Drag {
  x0: number;
  y0: number;
  y: number;
  t: number;
  vy: number;
}

export function InAppBanner({ item, onPress, onGone }: InAppBannerProps) {
  const insets = useSafeAreaInsets();
  const [y] = useState(() => new Animated.Value(START_OFFSET));
  const hiddenAt = useRef(START_OFFSET);
  const leaving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<Drag | null>(null);

  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(y, {
      toValue: hiddenAt.current,
      duration: SLIDE_OUT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onGone());
  }, [y, onGone]);

  const startTimer = useCallback(
    (ms: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(leave, ms);
    },
    [leave],
  );

  // Slide down into place once.
  useEffect(() => {
    const anim = Animated.timing(y, {
      toValue: 0,
      duration: SLIDE_IN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [y]);

  // About 4 seconds on screen; a post combined into it restarts that (within the cap).
  useEffect(() => {
    startTimer(visibleFor(item, Date.now()));
  }, [item, startTimer]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const settle = () => {
    drag.current = null;
    Animated.spring(y, { toValue: 0, useNativeDriver: true }).start();
    startTimer(BANNER_VISIBLE_MS);
  };

  const tap = () => {
    if (leaving.current) return;
    onPress();
    leave();
  };

  // A verified person's name gets the badge right after it (client 10/14 p.5, N7.15).
  const badged = splitVerifiedTitle(item);
  const spokenTitle = badged ? `${badged.name}, verified,${badged.rest}` : item.title;

  return (
    <Animated.View
      testID="in-app-banner"
      // Swipe up to dismiss: the banner follows the finger, and goes if let go far or fast enough
      // upward; otherwise it springs back. A short touch stays a tap on the card.
      onTouchStart={(e: GestureResponderEvent) => {
        const { pageX, pageY, timestamp } = e.nativeEvent;
        drag.current = { x0: pageX, y0: pageY, y: pageY, t: timestamp, vy: 0 };
      }}
      onMoveShouldSetResponder={(e: GestureResponderEvent) => {
        const d = drag.current;
        if (!d) return false;
        const dy = Math.abs(e.nativeEvent.pageY - d.y0);
        return dy > DRAG_SLOP && dy > Math.abs(e.nativeEvent.pageX - d.x0);
      }}
      onResponderGrant={() => {
        // Held by the finger: it stays until let go.
        if (timer.current) clearTimeout(timer.current);
      }}
      onResponderTerminationRequest={() => false}
      onResponderMove={(e: GestureResponderEvent) => {
        const d = drag.current;
        if (!d) return;
        const { pageY, timestamp } = e.nativeEvent;
        const dt = timestamp - d.t;
        if (dt > 0) d.vy = (pageY - d.y) / dt;
        d.y = pageY;
        d.t = timestamp;
        y.setValue(dragOffset(pageY - d.y0));
      }}
      onResponderRelease={() => {
        const d = drag.current;
        if (d && releaseDismisses(d.y - d.y0, d.vy)) {
          drag.current = null;
          leave();
          return;
        }
        settle();
      }}
      onResponderTerminate={settle}
      onLayout={(e) => {
        hiddenAt.current = -(e.nativeEvent.layout.height + insets.top + spacing[4]);
      }}
      style={{
        position: 'absolute',
        top: insets.top + spacing[2],
        left: spacing[3],
        right: spacing[3],
        transform: [{ translateY: y }],
      }}
    >
      <Pressable
        testID="in-app-banner-press"
        onPress={tap}
        accessibilityRole="button"
        accessibilityLabel={item.body ? `${spokenTitle}. ${item.body}` : spokenTitle}
        accessibilityHint="Opens it. Swipe up to dismiss."
        accessibilityLiveRegion="polite"
        accessibilityActions={[{ name: 'escape', label: 'Dismiss' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'escape') leave();
        }}
        className="flex-row items-center gap-3 rounded-lg bg-surface px-4 py-3"
        style={shadow.modal}
      >
        {item.avatarUrl ? (
          <Avatar uri={item.avatarUrl} size={spacing[10]} />
        ) : (
          <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-50">
            <Ionicons name={item.icon} size={spacing[5]} color={colors.brand[500]} />
          </View>
        )}
        <View className="flex-1">
          <Text variant="bodyStrong" numberOfLines={2}>
            {badged ? (
              <>
                {badged.name} <VerifiedBadge size="base" />
                {badged.rest}
              </>
            ) : (
              item.title
            )}
          </Text>
          {item.body ? (
            <Text variant="caption" numberOfLines={item.bodyLines} className="mt-0.5">
              {item.body}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}
