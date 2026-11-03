import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@components';
import { colors } from '@theme';
import { useProfile } from '@features/profile';
import { ACQUISITIONS, type AcquisitionValue } from '@features/onboarding';
import { useResolveAcquisition } from '../hooks';

/** ~2.5s after Home loads so the user sees the actual app first (never instant). */
const SHOW_DELAY_MS = 2500;

/**
 * One-time "How'd you find us?" bottom sheet, shown on Home AFTER onboarding. Same pattern as the
 * crisis-resources sheet: a partial-height sheet over a dimmed Home; tapping outside or "Skip"
 * dismisses. Tapping an option records that source (dedicated table, tied to user + timestamp) and
 * closes immediately — no confirmation. It appears exactly ONCE: answering OR dismissing marks the
 * prompt seen server-side, so it never reappears on future opens. Self-gating — mount it and forget.
 */
export function AcquisitionSheet() {
  const { data: profile } = useProfile();
  const { record, dismiss } = useResolveAcquisition();

  const settings = (profile?.settings ?? null) as { acquisition_prompt_seen?: boolean } | null;
  const eligible = profile?.onboarding_completed === true && settings?.acquisition_prompt_seen !== true;

  const [ready, setReady] = useState(false); // the show-delay has elapsed
  const [closed, setClosed] = useState(false); // resolved (answered / skipped) this session

  useEffect(() => {
    if (!eligible) return;
    const t = setTimeout(() => setReady(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [eligible]);

  const visible = eligible && ready && !closed;

  const onPick = (source: AcquisitionValue) => {
    setClosed(true); // close immediately (optimistic); the write persists in the background
    record.mutate(source);
  };
  const onSkip = () => {
    setClosed(true);
    dismiss.mutate();
  };

  return (
    <Modal
      testID="acquisition-sheet"
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onSkip}
    >
      <Pressable
        testID="acquisition-backdrop"
        onPress={onSkip}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        className="flex-1 justify-end"
        style={{ backgroundColor: colors.overlay }}
      >
        <Pressable
          onPress={() => {}}
          accessibilityViewIsModal
          className="rounded-t-3xl bg-surface px-5 pb-8 pt-3"
          style={{ maxHeight: '85%' }}
        >
          <View className="mb-4 items-center">
            <View className="h-1 w-10 rounded-full bg-line-strong" />
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text variant="h1">How&apos;d you find us?</Text>
            <Text variant="bodyMuted" className="mt-2">
              Totally optional, helps us out a lot.
            </Text>

            <View className="mt-5 gap-3">
              {ACQUISITIONS.map((o) => (
                <Pressable
                  key={o.value}
                  onPress={() => onPick(o.value)}
                  accessibilityRole="button"
                  className="flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-4 active:opacity-90"
                >
                  {o.icon ? <Ionicons name={o.icon} size={22} color={colors.ink} /> : null}
                  <Text variant="body" className="font-sans-semibold text-ink">
                    {o.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable onPress={onSkip} accessibilityRole="button" className="mt-6 items-center py-2">
              <Text variant="bodyMuted">Skip</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
