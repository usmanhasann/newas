/**
 * Shared layout for an onboarding step: a top bar (optional back chevron + a numberless
 * progress line, spec §4), a title/subtitle, a content area, and a pinned footer for the
 * primary action (kept visible on small screens). Token-driven + accessible.
 *
 * `composer` (a step with a note box, wired by useKeyboardComposer): the title, content AND footer
 * scroll as one, so the keyboard can never squeeze the note box (client 10/14 p.6-7). With the
 * keyboard closed it looks the same: the footer sits at the bottom. A tap outside the text box
 * (empty space, a mood, a button, the top bar) closes the keyboard; scrolling doesn't.
 */
import { useRef, type ReactNode, type RefObject } from 'react';
import { Keyboard, Pressable, ScrollView, View, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Text, ProgressBar } from '@components';
import { colors, spacing } from '@theme';
import type { ComposerRefs, ComposerScroll } from '../useKeyboardComposer';

export interface StepScaffoldProps {
  canBack?: boolean;
  onBack?: () => void;
  progress?: { index: number; total: number } | null;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  /** Lift the pinned footer + content above the on-screen keyboard (form steps). */
  keyboardAvoiding?: boolean;
  /** Centre the content vertically (with `scroll`, it still scrolls when taller than the screen). */
  centerContent?: boolean;
  /** Note-box step: everything scrolls together and keeps the note box above the keyboard. */
  composer?: ComposerScroll;
  /** The composer's scroll view refs (separate from `composer`, as refs must be). */
  composerScrollRef?: ComposerRefs['scrollRef'];
  composerContentRef?: ComposerRefs['contentRef'];
}

function TopBar({
  canBack,
  onBack,
  progress,
}: Pick<StepScaffoldProps, 'canBack' | 'onBack' | 'progress'>) {
  return (
    <View className="mb-4">
      <View className="h-9 flex-row items-center">
        {canBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
            className="-ml-1 p-1"
          >
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>
        ) : null}
      </View>
      {progress ? (
        <ProgressBar step={progress.index} total={progress.total} showLabel={false} className="mt-1" />
      ) : null}
    </View>
  );
}

/**
 * The composer's top bar: a TAP on it (not on the back button) closes the keyboard; a swipe that
 * starts there doesn't. Not focusable and silent, so screen readers and Android touch sounds see
 * only the bar's own controls.
 */
function DismissOnTap({ children }: { children: ReactNode }) {
  const start = useRef({ x: 0, y: 0 });
  const onPressIn = (e: GestureResponderEvent) => {
    start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
  };
  const onPress = (e: GestureResponderEvent) => {
    const moved = Math.hypot(e.nativeEvent.pageX - start.current.x, e.nativeEvent.pageY - start.current.y);
    if (moved <= spacing[2]) Keyboard.dismiss();
  };
  return (
    <Pressable
      testID="composer-top-bar"
      accessible={false}
      focusable={false}
      android_disableSound
      onPressIn={onPressIn}
      onPress={onPress}
      className="px-5"
    >
      {children}
    </Pressable>
  );
}

function Heading({ title, subtitle }: Pick<StepScaffoldProps, 'title' | 'subtitle'>) {
  return (
    <>
      {title ? (
        <Text variant="h1" accessibilityRole="header" className="mb-2">
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text variant="bodyMuted" className="mb-6">
          {subtitle}
        </Text>
      ) : null}
    </>
  );
}

export function StepScaffold({
  canBack = false,
  onBack,
  progress = null,
  title,
  subtitle,
  children,
  footer,
  scroll = false,
  keyboardAvoiding = false,
  centerContent = false,
  composer,
  composerScrollRef,
  composerContentRef,
}: StepScaffoldProps) {
  if (composer) {
    return (
      <Screen padded={false}>
        <View className="flex-1 py-4">
          <DismissOnTap>
            <TopBar canBack={canBack} onBack={onBack} progress={progress} />
          </DismissOnTap>
          {/* Full width, so a swipe that starts in the side margins scrolls too (the margins are
              padding inside the content). */}
          <ScrollView
            ref={composerScrollRef}
            testID="composer-scroll"
            // Cast: RN's .d.ts types this as RefObject<View>, while a ref that starts empty is
            // RefObject<View | null> (the runtime prop takes any ref setter).
            innerViewRef={composerContentRef as RefObject<View> | undefined}
            className="flex-1"
            showsVerticalScrollIndicator={false}
            // A tap on empty space closes the keyboard; buttons and moods still get their tap.
            keyboardShouldPersistTaps="handled"
            // Scrolling never closes the keyboard (client: scroll while typing).
            keyboardDismissMode="none"
            scrollEventThrottle={16}
            onLayout={composer.onLayout}
            onScroll={composer.onScroll}
            onScrollBeginDrag={composer.onScrollBeginDrag}
            onScrollEndDrag={composer.onScrollEndDrag}
            onMomentumScrollBegin={composer.onMomentumScrollBegin}
            onMomentumScrollEnd={composer.onMomentumScrollEnd}
            onContentSizeChange={composer.onContentSizeChange}
            contentContainerStyle={{ flexGrow: 1 }}
          >
            {/* At least the screen's height, so the footer rests at the bottom as on every step. */}
            <View className="px-5" style={{ flexGrow: 1, minHeight: composer.frameHeight || undefined }}>
              <Heading title={title} subtitle={subtitle} />
              {children}
              <View className="flex-1" style={{ minHeight: spacing[4] }} />
              {footer ? <View className="pt-4">{footer}</View> : null}
            </View>
            {/* Room for the keyboard, so the note box can scroll up above it. */}
            <View
              testID="keyboard-space"
              style={{ height: composer.keyboardSpace }}
              onLayout={composer.onKeyboardSpaceLayout}
            />
          </ScrollView>
        </View>
      </Screen>
    );
  }

  return (
    <Screen contentClassName="py-4" keyboardAvoiding={keyboardAvoiding}>
      <TopBar canBack={canBack} onBack={onBack} progress={progress} />
      <Heading title={title} subtitle={subtitle} />

      {scroll ? (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            centerContent
              ? { flexGrow: 1, justifyContent: 'center', paddingBottom: spacing[4] }
              : { paddingBottom: spacing[4] }
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View className={centerContent ? 'flex-1 justify-center' : 'flex-1'}>{children}</View>
      )}

      {footer ? <View className="pt-4">{footer}</View> : null}
    </Screen>
  );
}
