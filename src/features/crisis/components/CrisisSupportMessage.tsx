import { View } from 'react-native';
import { Card, Text } from '@components';
import { CRISIS_SUPPORT_MESSAGE } from '../copy';
import { CrisisLines } from './CrisisLines';

/**
 * In place of the AI reflection, for an entry with concerning words (client 10/14 p.36): a short
 * message followed by the 988 and Crisis Text Line options (the same cards and actions as the crisis
 * resources pop-up). Used on the entry's page and the onboarding first check in.
 */
export function CrisisSupportMessage() {
  return (
    <View testID="crisis-support-message" className="gap-4">
      <Card elevated={false} className="bg-brand-50">
        <Text variant="entry">{CRISIS_SUPPORT_MESSAGE}</Text>
      </Card>
      <CrisisLines />
    </View>
  );
}
