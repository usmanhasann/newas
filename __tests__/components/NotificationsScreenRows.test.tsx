/**
 * Notifications page rows (client spec 2026-09-29): Journaling Reminder (unchanged), Streak
 * Reminder (now its own switch), and Weekly / Monthly / Yearly Recap. Daily Inspiration, Weekly
 * Progress Summary and Circle Activity are gone (circle notifications live inside each circle).
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NotificationsScreen } from '@features/notifications/screens/NotificationsScreen';

jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
}));

const mockMutate = jest.fn();
jest.mock('@features/notifications/hooks', () => ({
  useNotificationPrefs: () => ({
    data: {
      journaling_reminder: true,
      reminder_time: '21:00:00',
      streak_reminder: true,
      weekly_recap: true,
      monthly_recap: false,
      yearly_recap: true,
    },
  }),
  useUpdateNotificationPrefs: () => ({ mutate: mockMutate }),
  useRegisterPushToken: () => () => mockRegisterPush(),
}));
const mockRegisterPush = jest.fn();
const mockRequestPermission = jest.fn(() => Promise.resolve('granted'));
jest.mock('@features/notifications/reminders', () => ({
  requestNotificationPermission: () => mockRequestPermission(),
  canDeliver: () => true,
}));

it('shows the new rows, drops the retired ones, and saves each switch under its own key', async () => {
  const utils = await render(
    <NotificationsScreen
      navigation={{ goBack: jest.fn() } as never}
      route={{} as never}
    />,
  );

  const titles = [
    'Journaling Reminder',
    'Streak Reminder',
    'Weekly Recap',
    'Monthly Recap',
    'Yearly Recap',
  ];
  for (const t of titles) expect(utils.getByText(t)).toBeTruthy();
  // Streak Reminder description (client 10/14 p.1): exact text, no time in it, no trailing period.
  expect(utils.getByText('A heads-up if your streak is about to end')).toBeTruthy();
  expect(utils.queryByText(/8 PM/)).toBeNull();
  expect(
    utils.getByText('Your mood breakdown and written reflection for each week'),
  ).toBeTruthy();
  expect(
    utils.getByText('Your mood breakdown and written reflection for each month'),
  ).toBeTruthy();
  expect(
    utils.getByText('Your mood breakdown and written reflection for each year'),
  ).toBeTruthy();
  for (const gone of [
    'Daily Inspiration',
    'Weekly Progress Summary',
    'Circle Activity',
  ]) {
    expect(utils.queryByText(gone)).toBeNull();
  }
  expect(utils.getByText(/Open a circle and tap the bell/)).toBeTruthy();

  // Switches render in row order and show each saved value (Monthly is off).
  const switches = utils.getAllByRole('switch');
  expect(switches.map((s) => s.props.value)).toEqual([true, true, true, false, true]);

  // Each row saves under its own key; none of them asks for OS permission (server pushes).
  // fireEvent is async in RNTL 14: await each one (wrapping them in act() overlapped act scopes).
  await fireEvent(switches[1]!, 'valueChange', false);
  await fireEvent(switches[3]!, 'valueChange', true);
  await fireEvent(switches[4]!, 'valueChange', false);
  expect(mockMutate).toHaveBeenCalledWith({ streak_reminder: false });
  expect(mockMutate).toHaveBeenCalledWith({ monthly_recap: true });
  expect(mockMutate).toHaveBeenCalledWith({ yearly_recap: false });
  expect(mockRequestPermission).not.toHaveBeenCalled();

  // Journaling Reminder keeps its old behavior: turning it on checks OS permission first.
  await fireEvent(switches[0]!, 'valueChange', true);
  expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(mockMutate).toHaveBeenCalledWith({ journaling_reminder: true }),
  );
  // Just allowed: this phone's push token is registered now, not after a relaunch (audit 2026-09-30).
  await waitFor(() => expect(mockRegisterPush).toHaveBeenCalledTimes(1));
});
