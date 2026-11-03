/**
 * The reminder time is now editable outside onboarding. The risky part is iOS: its inline
 * spinner streams onChange as the wheel moves (often without type:'set'), so saving on every
 * tick would fire a write per notch. These tests pin the staged-then-committed behaviour.
 */
import { render, fireEvent, act } from '@testing-library/react-native';
import { NotificationsScreen } from '@features/notifications/screens/NotificationsScreen';

// Capture the picker's onChange so a test can simulate scrolling the wheel. The factory only
// references a `mock`-prefixed variable and renders null (no RN imports → no NativeWind interop).
const mockPickerOnChange: { current: ((e: unknown, d?: Date) => void) | null } = {
  current: null,
};
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: (props: { onChange?: (e: unknown, d?: Date) => void }) => {
    mockPickerOnChange.current = props.onChange ?? null;
    return null;
  },
  DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
}));

// `mock`-prefixed so jest's hoisted factories may reference them.
const mockMutate = jest.fn();
const mockPrefsRef: { current: Record<string, unknown> | undefined } = {
  current: undefined,
};
jest.mock('@features/notifications/hooks', () => ({
  useNotificationPrefs: () => ({ data: mockPrefsRef.current }),
  useUpdateNotificationPrefs: () => ({ mutate: mockMutate }),
  useRegisterPushToken: () => jest.fn(),
}));
jest.mock('@features/notifications/reminders', () => ({
  requestNotificationPermission: jest.fn(() => Promise.resolve('granted')),
  canDeliver: () => true,
}));

const nav = { goBack: jest.fn() } as never;

function renderScreen() {
  return render(<NotificationsScreen navigation={nav} route={{} as never} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPickerOnChange.current = null;
  mockPrefsRef.current = { journaling_reminder: true, reminder_time: '21:00:00' };
});

describe('NotificationsScreen — editing the reminder time outside onboarding', () => {
  it('shows the saved time in 12-hour form on the reminder card', async () => {
    const { getByText } = await renderScreen();
    expect(getByText('Reminder time')).toBeTruthy();
    expect(getByText('9:00 PM')).toBeTruthy();
  });

  it('hides the time row while the reminder is switched off', async () => {
    mockPrefsRef.current = { journaling_reminder: false, reminder_time: '21:00:00' };
    const { queryByText } = await renderScreen();
    expect(queryByText('Reminder time')).toBeNull();
  });

  it('stages wheel movement WITHOUT saving, then writes once on Done', async () => {
    const { getByText, getByLabelText } = await renderScreen();

    // Wrap the press so the spinner actually mounts (and registers its onChange) before we
    // simulate the wheel — otherwise the events fire into a picker that isn't there yet.
    await act(async () => {
      fireEvent.press(getByLabelText('Reminder time, 9:00 PM'));
    });
    expect(mockPickerOnChange.current).not.toBeNull();

    // Scroll the wheel twice — the iOS spinner reports without type:'set'.
    await act(async () => {
      mockPickerOnChange.current?.({ type: undefined }, new Date(2026, 0, 1, 7, 15));
    });
    await act(async () => {
      mockPickerOnChange.current?.({ type: undefined }, new Date(2026, 0, 1, 7, 45));
    });

    // Nothing persisted yet — otherwise every notch of the wheel would hit the server.
    expect(mockMutate).not.toHaveBeenCalled();
    // ...but the row previews the staged time.
    expect(getByText('7:45 AM')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByText('Done'));
    });
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith({ reminder_time: '07:45:00' });
  });

  it('ignores a dismissed picker and leaves the saved time untouched', async () => {
    const { getByText, getByLabelText } = await renderScreen();
    await act(async () => {
      fireEvent.press(getByLabelText('Reminder time, 9:00 PM'));
    });

    await act(async () => {
      mockPickerOnChange.current?.({ type: 'dismissed' }, undefined);
    });

    expect(mockMutate).not.toHaveBeenCalled();
    expect(getByText('9:00 PM')).toBeTruthy();
  });

  it('falls back to a sensible time when the profile has none stored', async () => {
    mockPrefsRef.current = { journaling_reminder: true, reminder_time: null };
    const { getByText } = await renderScreen();
    expect(getByText('9:00 PM')).toBeTruthy();
  });
});
