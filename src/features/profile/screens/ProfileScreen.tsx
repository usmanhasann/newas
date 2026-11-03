import type { ComponentProps } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Text, Button, Card, VerifiedBadge } from '@components';
import { colors } from '@theme';
import type { ProfileStackParamList } from '@/navigation/types';
import { useProfile } from '../hooks';
import { useSignOut } from '@features/auth';
import { useJournalStats } from '@features/insights';
import { useMyCircles } from '@features/circles';
import { useManageSubscription } from '@features/iap';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ProfileHome'>;
type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface MenuItem {
  icon: IoniconName;
  label: string;
  desc: string;
  onPress: () => void;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="items-center">
      <Text variant="h2">{value}</Text>
      <Text variant="caption" className="mt-1">
        {label}
      </Text>
    </View>
  );
}

function MenuRow({ icon, label, desc, onPress }: MenuItem) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card padded={false} className="mb-3 px-4 py-3">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-50">
            <Ionicons name={icon} size={20} color={colors.brand[500]} />
          </View>
          <View className="flex-1">
            <Text variant="bodyStrong">{label}</Text>
            <Text variant="caption" className="mt-0.5">
              {desc}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors['ink-faint']} />
        </View>
      </Card>
    </Pressable>
  );
}

export function ProfileScreen({ navigation }: Props) {
  const { data: profile } = useProfile();
  const shownName = profile?.display_name ?? 'Your name';
  const verified = profile?.verified === true;
  const { data: stats } = useJournalStats();
  // Circles the user belongs to — includes ones they created (a DB trigger adds the owner as an
  // approved member) AND ones created by others they've joined. fetchMyCircles counts every
  // approved membership regardless of role, so this is the true "in circle" count.
  const { data: circles } = useMyCircles();
  const signOut = useSignOut();
  const manage = useManageSubscription();

  const account: MenuItem[] = [
    {
      icon: 'create-outline',
      label: 'Edit Profile',
      desc: 'Update your name, photo, and bio',
      onPress: () => navigation.navigate('EditProfile'),
    },
    {
      // Its own row right below Edit Profile (client 10/14 p.21); sparkles = the app's AI mark.
      icon: 'sparkles-outline',
      label: 'Reflection Tone',
      desc: 'Choose how your AI reflections are written',
      onPress: () => navigation.navigate('ReflectionTone'),
    },
    {
      icon: 'notifications-outline',
      label: 'Notifications',
      desc: 'Choose what you want to be notified about',
      onPress: () => navigation.navigate('Notifications'),
    },
    {
      icon: 'phone-portrait-outline',
      label: 'Home Widget',
      desc: 'Choose which circle shows on your home screen',
      onPress: () => navigation.navigate('WidgetSettings'),
    },
    {
      icon: 'card-outline',
      label: 'Subscription',
      desc: 'Manage or cancel your plan',
      onPress: () => manage.mutate(),
    },
    {
      // Right below Subscription (client 10/14 p.17): changing the email or password lives here.
      icon: 'shield-checkmark-outline',
      label: 'Sign-in & Security',
      desc: 'Email and password',
      onPress: () => navigation.navigate('SignInSecurity'),
    },
  ];
  const support: MenuItem[] = [
    {
      icon: 'help-circle-outline',
      label: 'Help & FAQ',
      desc: 'Answers to common questions',
      onPress: () => navigation.navigate('Help'),
    },
    {
      icon: 'chatbubble-ellipses-outline',
      label: 'Send Feedback',
      desc: 'Tell us how we can improve',
      onPress: () => navigation.navigate('Feedback'),
    },
  ];

  return (
    <Screen scroll contentClassName="py-6">
      <View className="mb-6 items-center">
        <View className="h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-brand-100">
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={{ width: 80, height: 80 }} contentFit="cover" />
          ) : (
            <Ionicons name="person" size={36} color={colors.brand[500]} />
          )}
        </View>
        {/* A verified person (N7) sees their badge right after their name, inside the same line
            (the header stays photo, name, bio). */}
        <Text
          variant="h2"
          className="mt-3"
          accessibilityLabel={verified ? `${shownName}, verified` : undefined}
        >
          {shownName}
          {verified ? (
            <>
              {' '}
              <VerifiedBadge size="2xl" />
            </>
          ) : null}
        </Text>
        {/* Header is photo, name, bio only: no email line (client 10/14, p.1). The bio sits right
            under the name with a small gap so it doesn't look cramped. */}
        {profile?.bio ? (
          <Text variant="body" className="mt-2 px-6 text-center text-ink-soft">
            {profile.bio}
          </Text>
        ) : null}
      </View>

      <Card className="mb-6">
        <View className="flex-row justify-around">
          <Stat value={String(stats?.entries_count ?? 0)} label="Entries" />
          <Stat value={String(circles?.length ?? 0)} label="In Circle" />
          <Stat value={String(stats?.current_streak ?? 0)} label="Day Streak" />
        </View>
      </Card>

      <Text variant="section" className="mb-3">
        Account
      </Text>
      {account.map((m) => (
        <MenuRow key={m.label} {...m} />
      ))}

      <Text variant="section" className="mb-3 mt-4">
        Support
      </Text>
      {support.map((m) => (
        <MenuRow key={m.label} {...m} />
      ))}

      <Button
        title="Log Out"
        variant="outline"
        className="mt-6"
        loading={signOut.isPending}
        onPress={() =>
          Alert.alert('Log out?', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log Out', style: 'destructive', onPress: () => signOut.mutate() },
          ])
        }
      />

      {/* Destructive account action, kept separate from settings so it's not tapped by accident. */}
      <Button
        title="Delete Account"
        variant="destructive"
        className="mt-3"
        onPress={() => navigation.navigate('DeleteAccount')}
      />
    </Screen>
  );
}
