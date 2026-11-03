/**
 * One circle's own notification switches, opened from the bell on the circle's page. Every circle a
 * person is in has an independent set (settings are per circle, not per circle type). Which switches
 * appear depends on the circle's type and whether you own it; all of them start ON.
 */
import { Pressable, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Card, LoadingScreen, Screen, Text } from '@components';
import { colors } from '@theme';
import { useCurrentUser } from '@store/session';
import type { CirclesStackParamList } from '@/navigation/types';
import {
  useCircle,
  useCircleNotificationPrefs,
  useUpdateCircleNotificationPrefs,
} from '../hooks';
import { circleNotificationSwitches } from '../notificationSwitches';

type Props = NativeStackScreenProps<CirclesStackParamList, 'CircleNotifications'>;

export function CircleNotificationsScreen({ navigation, route }: Props) {
  const { circleId } = route.params;
  const user = useCurrentUser();
  const circleQ = useCircle(circleId);
  const prefsQ = useCircleNotificationPrefs(circleId);
  const update = useUpdateCircleNotificationPrefs(circleId);

  const circle = circleQ.data;
  const header = (
    <View className="flex-row items-center gap-3 px-5 py-3">
      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={8}
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>
      <Text variant="h3">Notifications</Text>
    </View>
  );

  if (circleQ.isLoading || prefsQ.isLoading) return <LoadingScreen />;

  if (!circle) {
    return (
      <Screen padded={false}>
        {header}
        <Text variant="bodyMuted" className="mt-10 text-center">
          This circle isn’t available.
        </Text>
      </Screen>
    );
  }

  const switches = circleNotificationSwitches({
    isPublic: circle.type === 'public',
    isOwner: circle.owner_id === user?.id,
  });
  const prefs = prefsQ.data;

  return (
    <Screen scroll padded={false}>
      {header}
      <View className="px-5">
        <Text variant="bodyMuted" className="mb-5">
          Choose what {circle.name} notifies you about. These settings are just for this
          circle.
        </Text>

        {prefs ? (
          switches.map((s) => (
            <Card key={s.key} className="mb-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text variant="bodyStrong">{s.title}</Text>
                  <Text variant="caption" className="mt-0.5">
                    {s.desc}
                  </Text>
                </View>
                <Switch
                  accessibilityLabel={s.title}
                  value={prefs[s.key]}
                  onValueChange={(on) => update.mutate({ [s.key]: on })}
                  trackColor={{ true: colors.brand[400], false: colors.line }}
                  thumbColor={colors.white}
                  ios_backgroundColor={colors.line}
                />
              </View>
            </Card>
          ))
        ) : (
          <Card>
            <Text variant="bodyStrong">We couldn’t load your settings</Text>
            <Text variant="bodyMuted" className="mt-1">
              Check your connection and try again.
            </Text>
            <Button
              title="Try again"
              variant="secondary"
              size="sm"
              fullWidth={false}
              className="mt-3 self-start"
              loading={prefsQ.isFetching}
              onPress={() => prefsQ.refetch()}
            />
          </Card>
        )}
      </View>
    </Screen>
  );
}
