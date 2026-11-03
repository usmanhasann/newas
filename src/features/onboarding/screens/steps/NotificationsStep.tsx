/**
 * Notification setup (overhaul spec §9). A PRE-PERMISSION screen placed AFTER the plan
 * reveal + first check-in, so we ask once the user has felt the value (higher-converting
 * than a cold prompt at launch). We ask BEFORE the OS permission prompt (§9 — never ask
 * cold). The OS prompt is the ONLY permission request in the app; push-token registration
 * elsewhere is passive. The reminder-time options come first on the screen — five, in
 * order: Morning, Early afternoon, Early dinner time, Before bed (9:00 PM), and Custom time
 * (last). Choosing "Custom time" reveals the NATIVE time picker, which follows each
 * platform's own design (they are NOT identical): an inline scrollable spinner on iOS, and
 * on Android a button that opens the OS's native clock dialog
 * (@react-native-community/datetimepicker). The OS prompt fires only when the user opts in;
 * declining never blocks onboarding and we don't re-trigger the prompt (§19). "Maybe later"
 * is the low-pressure skip (client 10/14 p.4).
 *
 * "Before bed (9:00 PM)" is preselected when the page opens, so "Turn on reminders" works right
 * away; any other option can still be picked (client 10/14 p.4). A gray helper line under "Custom
 * time" says where to change it later.
 *
 * Styled entirely with the app's design system (OptionRow / Button / tokens).
 */
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Button, Text } from '@components';
import { colors } from '@theme';
import { cn } from '@utils/cn';
import { toast } from '@store/toast';
import { deviceTimeZone } from '@utils/date';
import { useCompleteOnboarding, useUpdateProfile } from '@features/profile';
import {
  canDeliver,
  getNotificationPermission,
  requestNotificationPermission,
  useRegisterPushToken,
  useUpdateNotificationPrefs,
  type NotificationPermissionState,
} from '@features/notifications';
import { formatHhmm12, parseHhmm } from '../../constants';
import { StepScaffold } from '../../components/StepScaffold';
import { trackOnboarding } from '../../analytics';
import type { StepProps } from '../types';

type ReminderChoice = 'morning' | 'afternoon' | 'dinner' | 'bedtime' | 'custom';
type TimeValue = { hour: number; minute: number };

const BEDTIME = '21:00'; // "Before bed" — kept at 9:00 PM per the client

// Preset reminder times, shown top-to-bottom in this order; "Custom time" is appended last.
const PRESETS: { key: Exclude<ReminderChoice, 'custom'>; label: string; time: string }[] = [
  { key: 'morning', label: 'Morning', time: '09:00' },
  { key: 'afternoon', label: 'Early afternoon', time: '13:00' },
  { key: 'dinner', label: 'Early evening', time: '17:00' },
  { key: 'bedtime', label: 'Before bed', time: BEDTIME },
];

function hhmm(v: TimeValue): string {
  return `${String(v.hour).padStart(2, '0')}:${String(v.minute).padStart(2, '0')}`;
}

/** A Date carrying the picked hour/minute (today's date) — the shape the native picker wants. */
function timeToDate({ hour, minute }: TimeValue): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function OptionRow({
  label,
  sublabel,
  selected,
  onPress,
}: {
  label: string;
  sublabel?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      className={cn(
        'flex-row items-center justify-between rounded-2xl border px-4 py-2.5',
        selected ? 'border-2 border-brand-500 bg-brand-50' : 'border border-line bg-surface',
      )}
    >
      {/* Single line (label left, time right) so the list stays compact and the custom
          picker fits on one screen without pushing under the footer. */}
      <Text variant="bodyStrong" className="flex-1 pr-3">
        {label}
      </Text>
      {sublabel ? (
        <Text variant="caption" className="pr-2">
          {sublabel}
        </Text>
      ) : null}
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={selected ? colors.brand[500] : colors['ink-faint']}
      />
    </Pressable>
  );
}

export function NotificationsStep({ nav }: StepProps) {
  // Preselected so the CTA is active as soon as the page opens (client 10/14 p.4).
  const [choice, setChoice] = useState<ReminderChoice>('bedtime');
  const [custom, setCustom] = useState<TimeValue>(() => parseHhmm('19:30') ?? { hour: 19, minute: 30 });
  const [perm, setPerm] = useState<NotificationPermissionState>('undetermined');
  const [busy, setBusy] = useState(false);
  const complete = useCompleteOnboarding();
  const updateProfile = useUpdateProfile();
  const updatePrefs = useUpdateNotificationPrefs();
  const registerPush = useRegisterPushToken();

  useEffect(() => {
    trackOnboarding('screen_viewed', { screen: 'notifications' });
    getNotificationPermission().then(setPerm);
  }, []);

  // The concrete HH:MM implied by the current choice.
  const selectedTime = useMemo<string>(() => {
    if (choice === 'custom') return hhmm(custom);
    return PRESETS.find((p) => p.key === choice)?.time ?? BEDTIME;
  }, [choice, custom]);

  // Native time picker → store the picked hour/minute. Ignore a dismissed Android dialog.
  const onPickTime = (event: DateTimePickerEvent, picked?: Date) => {
    if (event.type === 'set' && picked) {
      setCustom({ hour: picked.getHours(), minute: picked.getMinutes() });
    }
  };

  // iOS shows an inline spinner; Android's picker is a dialog opened imperatively.
  const openAndroidTimePicker = () => {
    DateTimePickerAndroid.open({
      value: timeToDate(custom),
      mode: 'time',
      is24Hour: false,
      onChange: onPickTime,
    });
  };

  const persistReminder = async (enabled: boolean, permission: NotificationPermissionState | null) => {
    const tz = deviceTimeZone();
    // Saved even on "Maybe later" (the preselected 9:00 PM unless they picked another), so a
    // reminder time still exists should they turn notifications on later in Profile.
    const time = selectedTime;
    await updateProfile.mutateAsync({ timezone: tz });
    await updatePrefs.mutateAsync({ reminder_time: `${time}:00`, journaling_reminder: enabled });
    // This is the FINAL onboarding step. Persist the reminder answers, copy the chosen reflection
    // tone(s) onto the real profile columns ([0] primary, [1] optional secondary the AI blends;
    // absent → keeps 'gentle'), then mark onboarding complete — the gate then routes to the app.
    await nav.persist({
      reminder_time: time,
      reminder_timezone: tz,
      reminder_enabled: enabled,
      ...(permission ? { notif_permission: permission } : {}),
      status: 'completed',
      completed_at: new Date().toISOString(),
    });
    const styles = nav.data.personal_reflection_style;
    if (styles && styles.length > 0) {
      await updateProfile.mutateAsync({
        personal_reflection_style: styles[0],
        personal_reflection_style_secondary: styles[1] ?? null,
      });
    }
    await complete.mutateAsync();
    trackOnboarding('onboarding_completed');
  };

  const onEnable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const granted = await requestNotificationPermission();
      setPerm(granted);
      const deliver = canDeliver(granted);
      if (deliver) {
        // The daily check-ins themselves are scheduled by useDailyPromptReminder (app root) as soon
        // as the reminder is saved below. Permission just granted → register the remote push token now so circle
        // reactions/reflection nudges can reach them without waiting for a relaunch.
        registerPush();
      }
      trackOnboarding(deliver ? 'reminder_enabled' : 'reminder_denied');
      if (!deliver && granted === 'denied') {
        toast.info('Saved. You can turn on reminders anytime in Settings.');
      }
      await persistReminder(deliver, granted);
    } catch {
      toast.error('Something went wrong setting your reminder. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onLater = async () => {
    if (busy) return;
    setBusy(true);
    try {
      trackOnboarding('reminder_skipped');
      await persistReminder(false, null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepScaffold
      canBack={nav.canBack}
      onBack={nav.goBack}
      progress={nav.progress}
      // Scrollable: choosing "Custom time" reveals the tall native time wheel, which otherwise
      // overflows behind the pinned footer on shorter screens — the content must scroll to reach it.
      scroll
      title="Reach your goals with notifications"
      subtitle="Your plan works best with a gentle daily nudge. Turn on reminders to stay consistent with your check-ins."
      footer={
        <View className="gap-2">
          <Button title="Turn on reminders" loading={busy} onPress={onEnable} />
          <Button title="Maybe later" variant="ghost" onPress={onLater} />
        </View>
      }
    >
      <Text variant="section" className="mb-3">
        When should we remind you?
      </Text>
      <View className="gap-2">
        {PRESETS.map((p) => (
          <OptionRow
            key={p.key}
            label={p.label}
            sublabel={formatHhmm12(p.time) ?? undefined}
            selected={choice === p.key}
            onPress={() => setChoice(p.key)}
          />
        ))}
        <OptionRow
          label="Custom time"
          sublabel={choice === 'custom' ? (formatHhmm12(hhmm(custom)) ?? undefined) : 'Pick an exact time'}
          selected={choice === 'custom'}
          onPress={() => setChoice('custom')}
        />
        {/* Right under "Custom time", in every state (client 10/14 p.4). */}
        <Text variant="caption" className="text-center">
          You can change this anytime in Profile → Notifications.
        </Text>
      </View>

      {choice === 'custom' ? (
        <View className="mt-3">
          {Platform.OS === 'ios' ? (
            <View className="items-center">
              <DateTimePicker
                value={timeToDate(custom)}
                mode="time"
                display="spinner"
                // Light-only app → force light so the wheel text isn't invisible in OS dark mode.
                themeVariant="light"
                onChange={onPickTime}
              />
            </View>
          ) : (
            <Button
              variant="outline"
              title={`Reminder time · ${formatHhmm12(hhmm(custom))}`}
              onPress={openAndroidTimePicker}
            />
          )}
          <Text variant="caption" className="mt-2 text-center">
            Reminder set for {formatHhmm12(hhmm(custom))}
          </Text>
        </View>
      ) : null}

      {perm === 'denied' ? (
        <Text variant="caption" className="mt-4">
          Notifications are off in system settings. We’ll save your time so you can turn them on later.
        </Text>
      ) : null}
    </StepScaffold>
  );
}
