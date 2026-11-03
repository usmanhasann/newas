/**
 * Reflection Tone (client revisions 10/14 p.21, N13), opened from its own row on Profile. The same
 * 4 tones and rules as onboarding: pick at least 1 and up to 2 (two are blended). It opens on the
 * saved choice; Save writes it and goes back (the same save Edit Profile used to do).
 */
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, OptionList, Screen, Text } from '@components';
import { colors } from '@theme';
import type { PersonalReflectionStyle } from '@app-types/database';
import type { ProfileStackParamList } from '@/navigation/types';
import { useProfile, useUpdateProfile } from '../hooks';
import {
  MAX_TONES,
  REFLECTION_TONE_OPTIONS,
  canSaveTones,
  toggleTone,
  tonePatch,
  tonesFromProfile,
} from '../reflectionTone';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ReflectionTone'>;

export function ReflectionToneScreen({ navigation }: Props) {
  const { data: profile, isError, refetch, isRefetching } = useProfile();
  const update = useUpdateProfile();
  // null = untouched: show the saved choice (so it is already selected when the screen opens).
  const [picked, setPicked] = useState<PersonalReflectionStyle[] | null>(null);
  const tones = picked ?? (profile ? tonesFromProfile(profile) : null);

  const onSave = async () => {
    if (!tones || !canSaveTones(tones)) return;
    try {
      await update.mutateAsync(tonePatch(tones));
      navigation.goBack();
    } catch {
      Alert.alert('Could not save', 'Please try again.');
    }
  };

  return (
    <Screen scroll>
      <View className="flex-row items-center gap-3 py-3">
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text variant="h3">Reflection Tone</Text>
      </View>

      <Text variant="bodyMuted" className="mb-5 mt-2">
        Choose how your AI reflections are written. Pick up to two and we’ll blend them.
      </Text>

      {tones ? (
        <>
          <OptionList
            multi
            options={REFLECTION_TONE_OPTIONS}
            values={tones}
            onToggle={(t) => setPicked(toggleTone(tones, t))}
            maxSelections={MAX_TONES}
          />
          <Button
            title="Save"
            className="mb-6 mt-8"
            disabled={!canSaveTones(tones)}
            loading={update.isPending}
            onPress={onSave}
          />
        </>
      ) : isError ? (
        <View className="items-center py-10">
          <Text variant="bodyMuted" className="text-center">
            We couldn’t load your tone. Please try again.
          </Text>
          <Button
            title="Try again"
            variant="ghost"
            className="mt-3"
            loading={isRefetching}
            onPress={() => void refetch()}
          />
        </View>
      ) : (
        <View className="items-center py-10">
          <ActivityIndicator color={colors.brand[500]} />
        </View>
      )}
    </Screen>
  );
}
