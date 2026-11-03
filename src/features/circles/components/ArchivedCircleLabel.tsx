import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@components';
import { colors, fontSize } from '@theme';
import { cn } from '@utils/cn';
import { ARCHIVED_CIRCLE_LABEL } from '../postingLogic';

/** The archive icon, a step above the caption text it sits next to. */
const ICON_SIZE = parseFloat(fontSize.sm);

/**
 * The small "This circle has been archived." label (client revisions 10/14 p.23, N3): at the top of
 * an archived circle's page, at the top of its full list of posts, and where a post's reply box was
 * (no one can post or reply in an archived circle). The caller places it (margins and alignment).
 */
export function ArchivedCircleLabel({
  className,
  testID = 'circle-archived-label',
}: {
  className?: string;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      className={cn(
        'flex-row items-center gap-2 rounded-full bg-surface-muted px-3 py-1.5',
        className,
      )}
    >
      <Ionicons name="archive-outline" size={ICON_SIZE} color={colors['ink-soft']} />
      <Text variant="caption">{ARCHIVED_CIRCLE_LABEL}</Text>
    </View>
  );
}
