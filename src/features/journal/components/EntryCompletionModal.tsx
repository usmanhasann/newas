/**
 * Journal-entry completion popup (build task §2; streak popup, client revisions 10/14 p.24 to 27).
 * Shown only AFTER an entry is saved successfully, with two explicit choices: see the AI summary
 * (Entry Detail) or go back home. Never navigates on its own.
 *
 * The day's FIRST entry shows the streak popup: the flame emoji and the streak number side by side,
 * "DAY STREAK" under it and that day's message line (see streakPopupMessage). Every later entry that
 * day keeps the "Entry complete" popup (check mark + heading), since the streak doesn't go up.
 *
 * Accessibility: the overlay is marked as a modal view (focus trap for screen readers) with a polite
 * live region so the completion is announced; the streak (read as "3 day streak") or "Entry
 * complete" is the header. Android hardware back maps to the explicit "go home" choice (a user
 * action), so the user is never stranded.
 */
import { Modal, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Text } from '@components';
import { colors } from '@theme';
import { ENTRY_COMPLETE, ENTRY_COMPLETION, type Completion } from '../logic';
import { formatCount } from '../streakMilestones';

export interface EntryCompletionModalProps {
  visible: boolean;
  /** Resolved popup (see resolveCompletion): the modal opens only once it's known. */
  completion: Completion | null;
  onSeeSummary: () => void;
  onGoHome: () => void;
}

/** The flame emoji (decorative: the header's label already says "streak"). */
const FLAME = '\u{1F525}';

function StreakHeader({ streak, message }: { streak: number; message: string }) {
  const count = formatCount(streak);
  return (
    <>
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${count} day streak`}
        className="items-center"
      >
        <View className="flex-row items-end justify-center gap-1">
          <Text className="text-6xl leading-tight">{FLAME}</Text>
          <Text className="font-serif-bold text-hero leading-tight text-ink">{count}</Text>
        </View>
        <Text variant="section" className="text-center text-sm text-ink-muted">
          DAY STREAK
        </Text>
      </View>
      <Text variant="bodyMuted" className="mt-3 text-center">
        {message}
      </Text>
    </>
  );
}

function EntryCompleteHeader() {
  return (
    <>
      <View className="mb-1 items-center">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-50">
          <Ionicons name="checkmark" size={26} color={colors.brand[500]} />
        </View>
      </View>
      <Text variant="h3" className="mt-2 text-center" accessibilityRole="header">
        {ENTRY_COMPLETE}
      </Text>
    </>
  );
}

export function EntryCompletionModal({
  visible,
  completion,
  onSeeSummary,
  onGoHome,
}: EntryCompletionModalProps) {
  const content = completion ?? ENTRY_COMPLETION;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onGoHome}>
      <View
        accessibilityViewIsModal
        accessibilityLiveRegion="polite"
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: colors.overlay }}
      >
        <Card className="w-full rounded-3xl">
          {content.kind === 'streak' ? (
            <StreakHeader streak={content.streak} message={content.message} />
          ) : (
            <EntryCompleteHeader />
          )}

          <Button
            title="See AI summary"
            className={content.kind === 'streak' ? 'mt-6' : 'mt-5'}
            onPress={onSeeSummary}
            leftIcon={<Ionicons name="sparkles" size={18} color={colors.white} />}
          />
          <Button title="Back to home" variant="ghost" className="mt-2" onPress={onGoHome} />
        </Card>
      </View>
    </Modal>
  );
}
