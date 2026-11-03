import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Screen, Text } from '@components';
import { colors } from '@theme';
import { useCurrentUser } from '@store/session';
import {
  hasCheckMark,
  isCheckMarkRefusal,
  NAME_CHECK_MARK_MESSAGE,
  NAME_REQUIRED_MESSAGE,
} from '@utils/nameSymbols';
import type { ProfileStackParamList } from '@/navigation/types';
import { useProfile, useUpdateProfile } from '../hooks';
import { uploadAvatar } from '../avatar';
import { BIO_MAX_LENGTH, bioCounter } from '../bio';

type Props = NativeStackScreenProps<ProfileStackParamList, 'EditProfile'>;

// Edit Profile is name, photo and bio only (client 10/14 p.21 and p.30): the reflection tone has
// its own Profile row and screen (ReflectionToneScreen), and the app follows the phone's time zone.
export function EditProfileScreen({ navigation }: Props) {
  const user = useCurrentUser();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ b64: string; ext: 'jpg' | 'png' } | null>(null);
  const [saving, setSaving] = useState(false);
  // A name is required (client 10/14 p.3: "There should always be a name saved"): saving an empty
  // one is blocked with the same message the sign-up form uses (decided 2026-10-16).
  const [nameError, setNameError] = useState(false);
  // Names can't carry check marks (client 10/14 p.5, N7: only we give out the verified badge). Shown
  // as soon as one is typed, and Save is blocked; `nameRefused` = the server refused the name.
  const [nameRefused, setNameRefused] = useState(false);
  const nameHasMark = hasCheckMark(name) || nameRefused;
  const prefilled = useRef(false);

  useEffect(() => {
    if (profile && !prefilled.current) {
      setName(profile.display_name ?? '');
      setBio(profile.bio ?? '');
      setAvatarUri(profile.avatar_url ?? null);
      prefilled.current = true;
    }
  }, [profile]);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to choose an avatar.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (res.canceled) return;
    const a = res.assets[0];
    if (!a) return;
    setAvatarUri(a.uri);
    const ext = (a.uri.split('.').pop() ?? 'jpg').toLowerCase() === 'png' ? 'png' : 'jpg';
    if (a.base64) setPicked({ b64: a.base64, ext });
  };

  const onSave = async () => {
    if (!user) return;
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    if (nameHasMark) return; // the message is already showing under the name
    setSaving(true);
    try {
      let avatar_url = profile?.avatar_url ?? null;
      if (picked) avatar_url = await uploadAvatar(user.id, picked.b64, picked.ext);
      await update.mutateAsync({
        display_name: name.trim(),
        bio: bio.trim() || null,
        avatar_url,
      });
      navigation.goBack();
    } catch (e) {
      if (isCheckMarkRefusal(e)) setNameRefused(true);
      else Alert.alert('Could not save', 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen keyboardAvoiding padded={false}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text variant="h3">Edit Profile</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
      >
        <View className="mb-6 items-center">
          <Pressable onPress={pickAvatar} accessibilityLabel="Change avatar">
            <View className="h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-brand-100">
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={{ width: 96, height: 96 }} contentFit="cover" />
              ) : (
                <Ionicons name="person" size={42} color={colors.brand[500]} />
              )}
            </View>
            <View
              className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full bg-brand-500"
              style={{ borderWidth: 2, borderColor: colors.background }}
            >
              <Ionicons name="camera" size={16} color={colors.white} />
            </View>
          </Pressable>
        </View>

        <View className="gap-4">
          <View>
            <Text variant="label" className="mb-2">
              Name
            </Text>
            <TextInput
              value={name}
              onChangeText={(v) => {
                setName(v);
                setNameRefused(false);
                if (v.trim()) setNameError(false);
              }}
              placeholder="Your name"
              placeholderTextColor={colors['ink-faint']}
              accessibilityLabel="Name"
              className="rounded-sm border border-line bg-surface-muted px-4 py-3 font-sans text-base text-ink"
            />
            {nameError || nameHasMark ? (
              <Text variant="caption" className="mt-1.5 text-danger-strong">
                {nameError ? NAME_REQUIRED_MESSAGE : NAME_CHECK_MARK_MESSAGE}
              </Text>
            ) : null}
          </View>

          <View>
            <Text variant="label" className="mb-2">
              Bio
            </Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              maxLength={BIO_MAX_LENGTH}
              placeholder="A little about you"
              placeholderTextColor={colors['ink-faint']}
              multiline
              textAlignVertical="top"
              className="rounded-sm border border-line bg-surface-muted px-4 py-3 font-sans text-base text-ink"
              style={{ minHeight: 90 }}
            />
            <Text
              variant="caption"
              className="mt-1.5 text-right"
              accessibilityLabel={`${bio.length} of ${BIO_MAX_LENGTH} characters used`}
            >
              {bioCounter(bio)}
            </Text>
          </View>
        </View>

        <Button title="Save" className="mt-8" loading={saving} onPress={onSave} />
      </ScrollView>
    </Screen>
  );
}
