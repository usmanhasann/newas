import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Text, Card } from '@components';
import { colors } from '@theme';
import type { ProfileStackParamList } from '@/navigation/types';
import { FAQ } from '../data';

type Props = NativeStackScreenProps<ProfileStackParamList, 'Help'>;

export function HelpScreen({ navigation }: Props) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const items = query
    ? FAQ.filter(
        (f) => f.q.toLowerCase().includes(query) || f.a.toLowerCase().includes(query),
      )
    : FAQ;

  return (
    <Screen scroll padded={false}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text variant="h3">Help &amp; FAQ</Text>
      </View>

      <View className="px-5">
        <View className="mb-5 flex-row items-center gap-2 rounded-sm border border-line bg-surface-muted px-4 py-3">
          <Ionicons name="search" size={18} color={colors['ink-soft']} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search help"
            placeholderTextColor={colors['ink-faint']}
            className="flex-1 font-sans text-base text-ink"
          />
        </View>

        {items.length === 0 ? (
          <Text variant="bodyMuted" className="mt-4 text-center">
            No results. Try different words, or send us feedback.
          </Text>
        ) : (
          items.map((f) => (
            <Card key={f.q} className="mb-3">
              <Text variant="bodyStrong">{f.q}</Text>
              <Text variant="body" className="mt-1.5 text-ink-soft">
                {f.a}
              </Text>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
