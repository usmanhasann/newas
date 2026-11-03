import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Screen, Text, TextField, LoadingScreen } from '@components';
import { colors } from '@theme';
import { useCurrentUser } from '@store/session';
import { toast } from '@store/toast';
import type { CirclesStackParamList } from '@/navigation/types';
import {
  useArchiveCircle,
  useCircle,
  useDeleteCircle,
  useUnarchiveCircle,
  useUpdateCircle,
} from '../hooks';
import { CircleTooBigToDeleteError } from '../api';
import { circleEndActions } from '../postingLogic';
import { CircleDescriptionField } from '../components/CircleDescriptionField';

type Props = NativeStackScreenProps<CirclesStackParamList, 'EditCircle'>;

/** The Archive confirmation: what archiving does (client 10/14 p.23). */
const ARCHIVE_MESSAGE: Record<'public' | 'private', string> = {
  public:
    'Members can still read everything, but no one can post or reply, and no one new can join. It won’t show up in Discover. Everyone in it will be told.',
  private:
    'Members can still read everything, but no one can post or reply. Everyone in it will be told.',
};

/** The Unarchive confirmation: what coming back to normal means (client 10/14 p.23). */
const UNARCHIVE_MESSAGE: Record<'public' | 'private', string> = {
  public:
    'Members can post and reply again, new people can join, and it shows up in Discover again. Everyone in it will be told.',
  private: 'Members can post and reply again. Everyone in it will be told.',
};

/**
 * Circle settings, owner only (the gear on CircleDetail shows for the owner alone; RLS and
 * delete_circle are the real guards). The name; a description for Public circles, the only ones
 * people can discover; and Archive circle next to Delete circle for Public and Private circles
 * (client 10/14 p.23), which becomes Unarchive circle once the circle is archived. Delete: Private
 * at any size, Public only under 5 members.
 */
export function EditCircleScreen({ navigation, route }: Props) {
  const { circleId } = route.params;
  const user = useCurrentUser();
  const { data: circle, isLoading, refetch } = useCircle(circleId);
  const update = useUpdateCircle(circleId);
  const archive = useArchiveCircle();
  const unarchive = useUnarchiveCircle();
  const del = useDeleteCircle();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const prefilled = useRef(false);

  useEffect(() => {
    if (circle && !prefilled.current) {
      setName(circle.name);
      setDescription(circle.description ?? '');
      prefilled.current = true;
    }
  }, [circle]);

  if (isLoading) return <LoadingScreen />;

  const header = (
    <View className="flex-row items-center gap-3 px-5 py-3">
      <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Go back">
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>
      <Text variant="h3">Circle settings</Text>
    </View>
  );

  if (!circle || circle.owner_id !== user?.id) {
    return (
      <Screen padded={false}>
        {header}
        <Text variant="bodyMuted" className="mt-10 px-5 text-center">
          Only the circle’s owner can change its settings.
        </Text>
      </Screen>
    );
  }

  const isPublic = circle.type === 'public';
  const ends = circleEndActions({
    circleType: circle.type,
    memberCount: circle.member_count,
    archived: !!circle.archived_at,
  });

  const onSave = async () => {
    if (!name.trim()) return;
    try {
      await update.mutateAsync(isPublic ? { name, description } : { name });
      navigation.goBack();
    } catch {
      Alert.alert('Could not save', 'Please try again.');
    }
  };

  const onArchive = () =>
    Alert.alert(
      'Archive circle?',
      ARCHIVE_MESSAGE[circle.type],
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () =>
            archive.mutate(circleId, {
              onError: () => toast.error('Couldn’t archive the circle. Try again.'),
            }),
        },
      ],
    );

  const onUnarchive = () =>
    Alert.alert('Unarchive circle?', UNARCHIVE_MESSAGE[circle.type], [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unarchive',
        onPress: () =>
          unarchive.mutate(circleId, {
            onError: () => toast.error('Couldn’t unarchive the circle. Try again.'),
          }),
      },
    ]);

  const onDelete = () =>
    Alert.alert(
      'Delete this circle?',
      'The circle and everything in it will be removed for all members. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            del.mutate(circleId, {
              onSuccess: () => {
                toast.success('Circle deleted.');
                navigation.popToTop();
              },
              onError: (e) => {
                if (e instanceof CircleTooBigToDeleteError) {
                  // It grew to 5 while this screen was open: show the Archive button instead.
                  toast.error(e.message);
                  void refetch();
                } else {
                  toast.error('Couldn’t delete the circle. Try again.');
                }
              },
            }),
        },
      ],
    );

  return (
    <Screen keyboardAvoiding padded={false}>
      {header}

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <TextField label="Circle name" value={name} onChangeText={setName} autoCapitalize="words" />

        {isPublic ? (
          <View className="mt-4">
            <CircleDescriptionField value={description} onChangeText={setDescription} />
          </View>
        ) : null}

        <Button
          title="Save"
          className="mt-6"
          disabled={!name.trim() || update.isPending}
          loading={update.isPending}
          onPress={onSave}
        />

        {circle.archived_at ? (
          <Text variant="caption" className="mt-8 text-center">
            This circle is archived.
          </Text>
        ) : null}
        {ends.archive ? (
          <Button
            title="Archive circle"
            variant="outline"
            className="mt-8"
            loading={archive.isPending}
            onPress={onArchive}
          />
        ) : null}
        {ends.unarchive ? (
          <Button
            title="Unarchive circle"
            variant="outline"
            className="mt-8"
            loading={unarchive.isPending}
            onPress={onUnarchive}
          />
        ) : null}
        {ends.delete ? (
          <Button
            title="Delete circle"
            variant="destructive"
            className={ends.archive || ends.unarchive ? 'mt-3' : 'mt-8'}
            loading={del.isPending}
            onPress={onDelete}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
