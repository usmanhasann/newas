import { View } from 'react-native';
import { Text, TextField } from '@components';
import { CIRCLE_DESCRIPTION_MAX_LENGTH, circleDescriptionCounter } from '../postingLogic';

/**
 * A Public circle's description field, on Create Circle and Circle Settings (client 10/14, p.29):
 * typing stops at 150 characters, and right below the box sit the hint and a live "45/150" counter
 * styled like the profile bio's (small gray caption, right-aligned).
 */
export function CircleDescriptionField({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <View>
      <TextField
        label="Description"
        value={value}
        onChangeText={onChangeText}
        maxLength={CIRCLE_DESCRIPTION_MAX_LENGTH}
        placeholder="What’s this circle about?"
        multiline
      />
      <View className="mt-1.5 flex-row items-start gap-3">
        <Text variant="caption" className="flex-1">
          Shown when people discover public circles
        </Text>
        <Text
          variant="caption"
          className="text-right"
          accessibilityLabel={`${value.length} of ${CIRCLE_DESCRIPTION_MAX_LENGTH} characters used`}
        >
          {circleDescriptionCounter(value)}
        </Text>
      </View>
    </View>
  );
}
