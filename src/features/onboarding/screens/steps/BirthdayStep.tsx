/**
 * Birthday — the first onboarding step (after Get Started). A native date wheel, used to
 * personalize the experience. Mirrors NotificationsStep's picker handling: an inline spinner on iOS,
 * and on Android a button that opens the OS date dialog imperatively
 * (@react-native-community/datetimepicker). The date of birth is stored as a LOCAL
 * 'YYYY-MM-DD' string (never toISOString(), which would UTC-shift the day).
 *
 * AGE GATE: the user must be 18+. If the picked date is under 18 we show an inline message and
 * DISABLE Continue; changing it to 18+ clears the message and re-enables Continue. The default
 * (~25 years ago) is eligible, so a user who doesn't touch the wheel can proceed.
 */
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Button, Text } from '@components';
import { StepScaffold } from '../../components/StepScaffold';
import { trackOnboarding } from '../../analytics';
import type { StepProps } from '../types';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** A Date → local 'YYYY-MM-DD'. Uses local calendar fields so the day never UTC-shifts. */
function toYmd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Parse a local 'YYYY-MM-DD' back into a Date (local midnight); null if malformed. */
function fromYmd(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function dobLabel(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Whole years old on `on` for someone born on `dob` (accounts for month/day). */
function ageOn(dob: Date, on: Date): number {
  let age = on.getFullYear() - dob.getFullYear();
  const beforeBirthdayThisYear =
    on.getMonth() < dob.getMonth() ||
    (on.getMonth() === dob.getMonth() && on.getDate() < dob.getDate());
  if (beforeBirthdayThisYear) age -= 1;
  return age;
}

const MIN_AGE = 18;
const DEFAULT_AGE_YEARS = 25;

export function BirthdayStep({ nav }: StepProps) {
  const today = new Date();
  const maximumDate = today;
  const minimumDate = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate());
  const defaultDob = new Date(today.getFullYear() - DEFAULT_AGE_YEARS, today.getMonth(), today.getDate());

  const [date, setDate] = useState<Date>(fromYmd(nav.data.date_of_birth) ?? defaultDob);
  const eligible = ageOn(date, today) >= MIN_AGE;

  useEffect(() => {
    trackOnboarding('screen_viewed', { screen: 'birthday' });
  }, []);

  // Native picker → keep the picked date in working state. Android fires 'dismissed' on cancel
  // (no date to apply); the iOS inline spinner often fires onChange WITHOUT type==='set', so we
  // must apply the date whenever one is provided and the event wasn't a dismissal — otherwise a
  // picked under-18 date would never reach state and the age gate would silently miss it.
  const onPick = (event: DateTimePickerEvent, picked?: Date) => {
    if (event?.type === 'dismissed' || !picked) return;
    setDate(picked);
    nav.patchLocal({ date_of_birth: toYmd(picked) });
  };

  const openAndroidPicker = () => {
    DateTimePickerAndroid.open({
      value: date,
      mode: 'date',
      maximumDate,
      minimumDate,
      onChange: onPick,
    });
  };

  const onContinue = async () => {
    if (!eligible) return; // gated below, but guard defensively
    trackOnboarding('birthday_set'); // event only — the date itself is sensitive, never sent
    await nav.goNext({ date_of_birth: toYmd(date) });
  };

  return (
    <StepScaffold
      canBack={nav.canBack}
      onBack={nav.goBack}
      progress={nav.progress}
      title="When is your birthday?"
      subtitle="This helps us personalize your experience."
      footer={
        <Button title="Continue" disabled={!eligible} loading={nav.saving} onPress={onContinue} />
      }
    >
      <View className="flex-1 justify-center">
        {Platform.OS === 'ios' ? (
          <View className="items-center">
            <DateTimePicker
              value={date}
              mode="date"
              display="spinner"
              // App is a light-only design; force the native picker to light so its text is
              // dark-on-cream (not the OS dark-mode white, which is invisible on our background).
              themeVariant="light"
              maximumDate={maximumDate}
              minimumDate={minimumDate}
              onChange={onPick}
            />
          </View>
        ) : (
          <Button
            variant="outline"
            title={`Birthday · ${dobLabel(date)}`}
            onPress={openAndroidPicker}
          />
        )}
        {!eligible ? (
          <Text
            variant="caption"
            accessibilityRole="alert"
            className="mt-3 text-center text-danger-strong"
          >
            You must be 18 years or older to use LYSM.
          </Text>
        ) : null}

        <Text variant="caption" className="mt-3 text-center">
          This information won’t be shown publicly.
        </Text>
      </View>
    </StepScaffold>
  );
}
