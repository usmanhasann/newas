/**
 * Notification preferences. The "Journaling Reminder" switch is the one row backed by a LOCAL
 * scheduled notification, so turning it on has to clear the OS permission gate — otherwise the
 * switch reads ON while nothing can ever be delivered. We save the preference either way (the
 * user's reminder time is never lost) and offer a jump to system Settings when the OS won't let
 * us ask again. Actual scheduling/cancelling is owned by useDailyPromptReminder at the app root
 * (journal feature): one check-in per day, each carrying that day's rotating prompt.
 *
 * The reminder TIME is editable here too (onboarding is no longer the only place it can be set).
 * It's nested inside the Journaling Reminder card — it belongs to that reminder and nothing else —
 * and only appears while the reminder is on, so the screen stays a plain list of switches
 * otherwise. Picking a time just writes `reminder_time`; the sync hook notices and reschedules.
 */
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, Switch, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Text, Card, Button } from '@components';
import { colors } from '@theme';
import { formatHhmm12, parseHhmm, toHhmmss } from '@utils/date';
import type { ProfileStackParamList } from '@/navigation/types';
import {
  useNotificationPrefs,
  useRegisterPushToken,
  useUpdateNotificationPrefs,
} from '../hooks';
import { canDeliver, requestNotificationPermission } from '../reminders';
import type { PrefsPatch } from '../api';

type Props = NativeStackScreenProps<ProfileStackParamList, 'Notifications'>;

/** Fallback when a profile somehow has no stored time (onboarding always writes one). */
const FALLBACK_TIME = { hour: 21, minute: 0 };

/** A Date carrying the given hour/minute — the shape the native picker wants. */
function toDate({ hour, minute }: { hour: number; minute: number }): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

type SwitchKey = Exclude<keyof PrefsPatch, 'reminder_time'>;

// Circle notifications aren't here: every circle has its own switches, set inside that circle.
// The recaps announce the Insights cards the moment each one unlocks (sent that morning at 9 AM).
const ROWS: { key: SwitchKey; title: string; desc: string }[] = [
  {
    key: 'journaling_reminder',
    title: 'Journaling Reminder',
    desc: 'A gentle nudge to check in each day',
  },
  {
    key: 'streak_reminder',
    title: 'Streak Reminder',
    // Client 10/14 p.1: the time is dropped from the text only; the push still goes out at 8 PM.
    desc: 'A heads-up if your streak is about to end',
  },
  {
    key: 'weekly_recap',
    title: 'Weekly Recap',
    desc: 'Your mood breakdown and written reflection for each week',
  },
  {
    key: 'monthly_recap',
    title: 'Monthly Recap',
    desc: 'Your mood breakdown and written reflection for each month',
  },
  {
    key: 'yearly_recap',
    title: 'Yearly Recap',
    desc: 'Your mood breakdown and written reflection for each year',
  },
];

export function NotificationsScreen({ navigation }: Props) {
  const { data: prefs } = useNotificationPrefs();
  const update = useUpdateNotificationPrefs();
  const registerPush = useRegisterPushToken();
  const [permBlocked, setPermBlocked] = useState(false);
  // iOS shows an inline spinner that must be opened/closed; `draft` holds the in-progress time
  // so scrolling the wheel doesn't fire a save on every tick. Android's dialog returns once.
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<{ hour: number; minute: number } | null>(null);

  const saved = parseHhmm(prefs?.reminder_time) ?? FALLBACK_TIME;
  const shown = draft ?? saved;

  const commit = (t: { hour: number; minute: number }) => {
    update.mutate({ reminder_time: toHhmmss(toDate(t)) });
  };

  // Android's dialog reports a final choice ('set') or a dismissal; iOS's inline spinner streams
  // changes as the wheel moves — and often without type:'set' — so we only stage those in `draft`.
  const onPickTime = (event: DateTimePickerEvent, picked?: Date) => {
    if (event?.type === 'dismissed' || !picked) return;
    const next = { hour: picked.getHours(), minute: picked.getMinutes() };
    if (Platform.OS === 'ios') setDraft(next);
    else commit(next);
  };

  const openTimePicker = () => {
    if (Platform.OS === 'ios') {
      setDraft(saved);
      setPicking(true);
      return;
    }
    DateTimePickerAndroid.open({
      value: toDate(saved),
      mode: 'time',
      is24Hour: false,
      onChange: onPickTime,
    });
  };

  const donePicking = () => {
    if (draft) commit(draft);
    setDraft(null);
    setPicking(false);
  };

  /**
   * Turning the journaling reminder ON needs a permission that can actually deliver. Ask when
   * the OS still allows it; if it's hard-denied, save the preference anyway (so the reminder
   * time survives) and offer a trip to system Settings. Every other row is a pure server
   * preference — those are sent as-is.
   */
  const onToggle = async (key: SwitchKey, value: boolean) => {
    if (key !== 'journaling_reminder' || !value) {
      update.mutate({ [key]: value });
      if (key === 'journaling_reminder') setPermBlocked(false);
      return;
    }

    const perm = await requestNotificationPermission();
    update.mutate({ journaling_reminder: true }); // saved either way — never lose the setting
    const blocked = !canDeliver(perm);
    setPermBlocked(blocked);
    if (!blocked) {
      registerPush(); // just allowed: circle notifications can reach this phone now
      return;
    }

    Alert.alert(
      'Notifications are off',
      `Your reminder is saved, but ${Platform.OS === 'ios' ? 'iOS' : 'Android'} is blocking notifications for LYSM. Turn them on in Settings and we’ll use the time you picked.`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ],
    );
  };

  return (
    <Screen scroll padded={false}>
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

      <View className="px-5">
        <Text variant="bodyMuted" className="mb-5">
          Choose what you want to be notified about.
        </Text>

        {ROWS.map((row) => (
          <Card key={row.key} className="mb-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text variant="bodyStrong">{row.title}</Text>
                <Text variant="caption" className="mt-0.5">
                  {row.desc}
                </Text>
              </View>
              <Switch
                value={!!prefs?.[row.key]}
                onValueChange={(v) => void onToggle(row.key, v)}
                trackColor={{ true: colors.brand[400], false: colors.line }}
                thumbColor={colors.white}
                ios_backgroundColor={colors.line}
              />
            </View>
            {row.key === 'journaling_reminder' &&
            permBlocked &&
            !!prefs?.journaling_reminder ? (
              <Text variant="caption" className="mt-2 text-danger-strong">
                Saved, but notifications are off in system settings. Turn them on and
                we’ll use the time you picked.
              </Text>
            ) : null}

            {/* The reminder's own time — only while that reminder is on. */}
            {row.key === 'journaling_reminder' && !!prefs?.journaling_reminder ? (
              <View className="mt-3 border-t border-line pt-3">
                <Pressable
                  onPress={openTimePicker}
                  accessibilityRole="button"
                  accessibilityLabel={`Reminder time, ${formatHhmm12(toHhmmss(toDate(shown)))}`}
                  className="flex-row items-center justify-between"
                >
                  <Text variant="body">Reminder time</Text>
                  <View className="flex-row items-center gap-1">
                    <Text variant="bodyStrong" className="text-brand-600">
                      {formatHhmm12(toHhmmss(toDate(shown)))}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={colors['ink-faint']}
                    />
                  </View>
                </Pressable>

                {picking ? (
                  <View className="mt-2">
                    <View className="items-center">
                      <DateTimePicker
                        value={toDate(shown)}
                        mode="time"
                        display="spinner"
                        // Light-only app → force light so the wheel text isn't invisible in OS dark mode.
                        themeVariant="light"
                        onChange={onPickTime}
                      />
                    </View>
                    <Button title="Done" size="sm" onPress={donePicking} />
                  </View>
                ) : null}
              </View>
            ) : null}
          </Card>
        ))}

        <Text variant="caption" className="mb-6 mt-2">
          Each circle has its own notification settings. Open a circle and tap the bell at
          the top.
        </Text>
      </View>
    </Screen>
  );
}
