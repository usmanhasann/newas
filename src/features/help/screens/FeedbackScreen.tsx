import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Screen, Text } from '@components';
import { colors, shadow } from '@theme';
import { cn } from '@utils/cn';
import { toast } from '@store/toast';
import type { ProfileStackParamList } from '@/navigation/types';
import { useSubmitFeedback } from '../hooks';
import { FEEDBACK_CATEGORIES, FEEDBACK_CATEGORY_ROWS } from '../data';

type Props = NativeStackScreenProps<ProfileStackParamList, 'Feedback'>;

export function FeedbackScreen({ navigation }: Props) {
  const [category, setCategory] = useState(FEEDBACK_CATEGORIES[0].value);
  const [message, setMessage] = useState('');
  const submit = useSubmitFeedback();

  const onSubmit = async () => {
    try {
      await submit.mutateAsync({ message, category });
      toast.success('Thanks for the feedback!');
      navigation.goBack();
    } catch {
      toast.error('Couldn’t send right now. Please try again.');
    }
  };

  return (
    <Screen keyboardAvoiding>
      <View className="flex-row items-center gap-3 py-3">
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text variant="h3">Send Feedback</Text>
      </View>

      <Text variant="bodyMuted" className="mb-5 mt-2">
        We read everything. Tell us what’s working or what could be better.
      </Text>

      <Text variant="section" className="mb-2">
        Category
      </Text>
      {/* Separate capsule pills sized to their text, two rows of two (client 10/14, p.12 to 13):
          selected is solid deep purple with white bold text; unselected is white with no border
          and a soft shadow underneath. */}
      <View className="mb-5 gap-2">
        {FEEDBACK_CATEGORY_ROWS.map((row) => (
          <View key={row[0].value} className="flex-row flex-wrap gap-2">
            {row.map((c) => {
              const active = category === c.value;
              return (
                <Pressable
                  key={c.value}
                  onPress={() => setCategory(c.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={active ? undefined : shadow.pill}
                  className={cn(
                    'h-9 items-center justify-center rounded-full px-4',
                    active ? 'bg-brand-600' : 'bg-surface',
                  )}
                >
                  <Text
                    variant="bodyStrong"
                    className={cn('font-sans-bold', active ? 'text-ink-inverse' : 'text-ink-soft')}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <Text variant="section" className="mb-2">
        Message
      </Text>
      <TextInput
        value={message}
        onChangeText={setMessage}
        placeholder="What’s on your mind?"
        placeholderTextColor={colors['ink-faint']}
        multiline
        textAlignVertical="top"
        className="rounded-lg border border-line bg-surface p-4 font-sans text-base text-ink"
        style={{ minHeight: 140 }}
      />

      <Button
        title="Send Feedback"
        className="mt-6"
        disabled={!message.trim() || submit.isPending}
        loading={submit.isPending}
        onPress={onSubmit}
      />
    </Screen>
  );
}
