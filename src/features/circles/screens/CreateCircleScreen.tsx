import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Screen, Text, Card, TextField } from '@components';
import { colors } from '@theme';
import { cn } from '@utils/cn';
import type { CircleType } from '@app-types/database';
import type { CirclesStackParamList } from '@/navigation/types';
import { useCreateCircle } from '../hooks';
import { CircleDescriptionField } from '../components/CircleDescriptionField';

type Props = NativeStackScreenProps<CirclesStackParamList, 'CreateCircle'>;

const TYPES: { key: CircleType; title: string; desc: string; icon: 'lock-closed' | 'earth' }[] = [
  { key: 'private', title: 'Private', desc: 'People join by your invite or by requesting approval.', icon: 'lock-closed' },
  { key: 'public', title: 'Public', desc: 'Anyone with the invite link or code can join.', icon: 'earth' },
];

export function CreateCircleScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<CircleType>('private');
  const create = useCreateCircle();

  const onCreate = async () => {
    if (!name.trim()) return;
    const c = await create.mutateAsync({
      name,
      type,
      description: type === 'public' ? description : null,
    });
    navigation.replace('CircleDetail', { circleId: c.id });
  };

  return (
    <Screen keyboardAvoiding padded={false}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text variant="h3">Create Circle</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <TextField
          label="Circle name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Close Friends"
          autoCapitalize="words"
        />

        <Text variant="section" className="mb-3 mt-6">
          Who can join?
        </Text>
        {TYPES.map((t) => {
          const selected = type === t.key;
          return (
            <Pressable key={t.key} onPress={() => setType(t.key)} accessibilityRole="radio" accessibilityState={{ selected }}>
              <Card className={cn('mb-3', selected && 'border-2 border-brand-500')}>
                <View className="flex-row items-center gap-3">
                  <Ionicons name={t.icon} size={20} color={colors.brand[500]} />
                  <View className="flex-1">
                    <Text variant="bodyStrong">{t.title}</Text>
                    <Text variant="caption" className="mt-0.5">
                      {t.desc}
                    </Text>
                  </View>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.brand[500]} />
                  ) : null}
                </View>
              </Card>
            </Pressable>
          );
        })}

        {type === 'public' ? (
          <View className="mt-3">
            <CircleDescriptionField value={description} onChangeText={setDescription} />
          </View>
        ) : null}

        <Button
          title="Create Circle"
          className="mt-6"
          disabled={!name.trim() || create.isPending}
          loading={create.isPending}
          onPress={onCreate}
        />
      </ScrollView>
    </Screen>
  );
}
