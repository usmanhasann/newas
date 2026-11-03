import { useLayoutEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Text } from '@components';
import { colors } from '@theme';
import { useHoldInAppBanners } from '@store/bannerHold';
import { CrisisLines, ResourceIcon } from './CrisisLines';

/** How long the sheet takes to slide up into place. */
const SLIDE_MS = 280;

/**
 * Proactive crisis-resources popup, opened from a "See crisis resources" link (the onboarding
 * disclaimer, a flagged entry's "can't be shared" line) and automatically: when an entry with
 * concerning words is saved (useEntryCrisisCheck: first check in, new entry, edit) and by
 * useCrisisScan on Circle posts.
 * This is DELIBERATELY DIFFERENT from CrisisWarningModal:
 *   - CrisisWarningModal = reactive safety intervention shown when crisis words are detected
 *     in an entry; shows the single matched hotline; NOT dismissible by tapping outside.
 *   - CrisisResourcesSheet (this) = informational, lists the standing hotlines, and IS
 *     dismissible: the X, a tap on the dimmed area above it, or Android back closes it and returns
 *     the user exactly where they were (no navigation, no back button, no lost place).
 *
 * Half-screen sheet (client 10/14 p.30-31): it slides up from the bottom and covers only the bottom
 * half; the top half of the screen stays visible, slightly dimmed, and a tap there closes it. The
 * content is unchanged and scrolls inside the sheet; an X in the top right corner closes it.
 */
export function CrisisResourcesSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  // No in-app notification banners while it's open (client 10/14 p.8).
  useHoldInAppBanners(visible);
  // The sheet is half the screen tall, so starting half a screen lower puts it just out of view.
  const [slide] = useState(() => new Animated.Value(height / 2));

  // Each open starts just below the screen and slides up. A layout effect, so the reset lands
  // before the first frame (iOS keeps the content on screen while the fade-out plays, so it can't
  // be reset on close instead).
  useLayoutEffect(() => {
    if (!visible) return;
    slide.setValue(height / 2);
    const anim = Animated.timing(slide, {
      toValue: 0,
      duration: SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [visible, height, slide]);

  const openUrl = (u: string) => Linking.openURL(u);

  return (
    <Modal
      testID="crisis-resources-sheet"
      visible={visible}
      transparent
      // The dim fades in place while the sheet itself slides up (below).
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        testID="crisis-resources-scrim"
        className="flex-1"
        style={{ backgroundColor: colors['overlay-soft'] }}
      >
        {/* The top half: the screen behind shows through, slightly dimmed. A tap closes the sheet
            and returns the user to where they were. */}
        <Pressable
          testID="crisis-resources-backdrop"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close crisis resources"
          className="flex-1"
        />

        <Animated.View
          testID="crisis-resources-panel"
          accessibilityViewIsModal
          style={{ height: '50%', transform: [{ translateY: slide }] }}
        >
          <View className="flex-1 rounded-t-3xl bg-surface">
            {/* Title + close button stay put; everything below scrolls. */}
            <View className="flex-row items-start gap-3 px-5 pt-6">
              <Text variant="h1" className="flex-1">
                You’re not alone in this
              </Text>
              <Pressable
                testID="crisis-resources-close"
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                className="h-9 w-9 items-center justify-center rounded-full bg-surface-muted"
              >
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>

            <ScrollView
              testID="crisis-resources-scroll"
              className="flex-1"
              contentContainerClassName="px-5 pb-8"
              showsVerticalScrollIndicator
            >
              <Text variant="bodyMuted" className="mt-2">
                LYSM is a space for reflection, not a substitute for professional support. If you’re
                struggling, real help is available right now.
              </Text>

              <View className="mt-6 gap-4">
                {/* 988 and Crisis Text Line (shared with the flagged-entry message) */}
                <CrisisLines />

                {/* Outside the US */}
                <Card>
                  <View className="flex-row items-center gap-3">
                    <ResourceIcon
                      name="globe-outline"
                      bg={colors['warning-bg']}
                      tint={colors.warning}
                    />
                    <Text variant="h3" className="flex-1">
                      Outside the US
                    </Text>
                  </View>
                  <Text variant="bodyMuted" className="mt-3">
                    Find a local crisis line wherever you are.
                  </Text>
                  <Pressable
                    onPress={() => openUrl('https://findahelpline.com')}
                    accessibilityRole="link"
                    className="mt-3 self-start"
                  >
                    <Text variant="link">findahelpline.com</Text>
                  </Pressable>
                </Card>
              </View>

              <Text variant="caption" className="mt-6 text-center">
                You don’t need to be in crisis to reach out. These lines are here for any level of
                struggle.
              </Text>
            </ScrollView>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
