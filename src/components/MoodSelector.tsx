/**
 * Horizontal, color-coded mood picker (design spec §5.3). Each mood is a pastel
 * circle with a non-emoji vector icon (build task §6); selected moods scale up with a
 * spring + colored ring. Colors come from the mood tokens. Includes `frustrated`.
 *
 * MULTI-SELECT (overhaul spec §1.2): an entry can hold up to 3 moods, so this takes a
 * `selected` array + `onToggle`. `disabledKeys` marks moods that can't be added
 * because the entry is already at its 3-mood cap; they're dimmed + non-selectable.
 * Selected moods are never disabled, so the user can always remove/swap one (§1.3).
 *
 * When moods are selected (e.g. editing an entry), the list auto-scrolls to bring the
 * most recently selected mood into view and centers it.
 */
import { useEffect, useRef } from 'react';
import { Dimensions, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { MOOD_LIST, getMood, type MoodDef, type MoodKey, colors } from '@theme';
import { Text } from './Typography';

const ITEM_W = 78; // matches the Pressable width below
const GAP = 4; // matches the ScrollView contentContainer gap
const STEP = ITEM_W + GAP;

function MoodItem({
  def,
  selected,
  disabled,
  showBadge,
  onPress,
}: {
  def: MoodDef;
  selected: boolean;
  disabled: boolean;
  /** Show the small checkmark confirmation badge (used on the Home "Today's Mood" row). */
  showBadge: boolean;
  onPress: () => void;
}) {
  const p = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    p.value = withSpring(selected ? 1 : 0, { damping: 14, stiffness: 170 });
  }, [selected, p]);

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.94 + p.value * 0.12 }],
    borderWidth: p.value * 2,
    borderColor: def.dot,
  }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={def.label}
      accessibilityHint={
        disabled ? 'Unavailable. You have reached your 3-mood limit' : undefined
      }
      className="items-center"
      style={{ width: ITEM_W, opacity: disabled ? 0.35 : 1 }}
    >
      {/* Fixed-size anchor so the badge sits at the circle's corner without scaling with it. */}
      <View style={{ width: 60, height: 60 }}>
        <Animated.View
          style={[
            {
              width: 60,
              height: 60,
              borderRadius: 30,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: def.bg,
            },
            circleStyle,
          ]}
        >
          <Ionicons name={def.icon} size={26} color={def.dot} />
        </Animated.View>
        {showBadge ? (
          <View
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: def.dot,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: colors.surface,
            }}
          >
            <Ionicons name="checkmark" size={11} color={colors.white} />
          </View>
        ) : null}
      </View>
      <Text
        variant="caption"
        className={selected ? 'mt-2 font-sans-semibold' : 'mt-2'}
        style={{ color: selected ? colors.ink : colors['ink-soft'] }}
      >
        {def.label}
      </Text>
    </Pressable>
  );
}

export interface MoodSelectorProps {
  /** Currently-selected moods for the entry (up to 3). */
  selected?: readonly MoodKey[];
  /** Add/remove a mood from the selection. */
  onToggle: (mood: MoodKey) => void;
  /** Mood keys that can't be added (entry at its 3-mood cap). Selected moods are
   * never disabled, so the user can always remove/swap one. */
  disabledKeys?: readonly string[];
  /** Called when a disabled mood is tapped (e.g. to show a validation message). */
  onDisabledPress?: (mood: MoodKey) => void;
  /** Custom left-to-right order (mood keys). Defaults to the fixed MOOD_LIST order. Used by the
   * Home "Today's Mood" row to float today's logged moods to the left. */
  order?: readonly MoodKey[];
  /** Show a small checkmark confirmation badge on selected moods (Home "Today's Mood" row). */
  showSelectedBadge?: boolean;
  /**
   * While the keyboard is open, a tap on a mood reaches the mood ('handled') instead of only
   * closing the keyboard (the default). The first check-in uses it so one tap picks the mood and
   * closes the keyboard (client 10/14 p.7).
   */
  keyboardShouldPersistTaps?: 'never' | 'handled';
}

export function MoodSelector({
  selected = [],
  onToggle,
  disabledKeys = [],
  onDisabledPress,
  order,
  showSelectedBadge = false,
  keyboardShouldPersistTaps,
}: MoodSelectorProps) {
  const scrollRef = useRef<ScrollView>(null);
  const scrolledOnce = useRef(false);
  // Render in a custom order when given (Home card), else the fixed design order.
  const defs = order ? order.map(getMood) : MOOD_LIST;

  // Bring the (most recently) selected mood into view ONCE — when editing an entry
  // that already has moods, or on the first pick. We deliberately don't re-scroll on
  // every toggle: in multi-select that would make the list jump around as the user
  // adds/removes moods (and it keeps this effect from scheduling repeated frames).
  // Skipped entirely for a custom `order` (Home card): selected moods are already at the
  // left there, so scrolling would just cause an unwanted jump.
  const lastSelected = selected.length ? selected[selected.length - 1] : null;
  useEffect(() => {
    if (scrolledOnce.current || lastSelected == null || order) return;
    const index = defs.findIndex((m) => m.key === lastSelected);
    if (index < 0) return;
    scrolledOnce.current = true;
    const viewport = Dimensions.get('window').width - 40; // Screen has px-5 each side
    const center = index * STEP + ITEM_W / 2;
    const x = Math.max(0, center - viewport / 2);
    // rAF so layout is measured before scrolling.
    const id = requestAnimationFrame(() => scrollRef.current?.scrollTo({ x, animated: true }));
    return () => cancelAnimationFrame(id);
  }, [lastSelected, order, defs]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      contentContainerStyle={{ gap: GAP, paddingVertical: 4 }}
    >
      {defs.map((m) => {
        const isSelected = selected.includes(m.key);
        // Never disable a selected mood, so it can always be removed/swapped.
        const disabled = !isSelected && disabledKeys.includes(m.key);
        return (
          <MoodItem
            key={m.key}
            def={m}
            selected={isSelected}
            disabled={disabled}
            showBadge={showSelectedBadge && isSelected}
            onPress={() => (disabled ? onDisabledPress?.(m.key) : onToggle(m.key))}
          />
        );
      })}
    </ScrollView>
  );
}
