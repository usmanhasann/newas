/**
 * Client 10/14 p.6, on the Home screen: a tap anywhere on the Today's Moods card opens New Entry with
 * NO mood chosen (same as + New Entry), and a mood tap still opens it with that mood. Uses the real
 * card, with only its data hooks stubbed. One render per file.
 */
import { render, userEvent } from '@testing-library/react-native';
import { JournalHomeScreen } from '@features/journal/screens/JournalHomeScreen';

jest.mock('@features/profile', () => ({
  useProfile: () => ({ data: { display_name: 'Konah Q' } }),
}));
jest.mock('@features/notifications', () => ({
  NotificationNudgeCard: () => null,
  NotificationBell: () => null,
}));
jest.mock('@features/acquisition', () => ({ AcquisitionSheet: () => null }));
jest.mock('@features/welcome-reflection', () => ({ WelcomeReflectionCard: () => null }));
const mockStreak = { state: 'urgent', streak: 3 };
jest.mock('@features/journal/hooks', () => ({
  useDailyPrompt: () => 'How are you today?',
  useDeleteEntry: () => ({ mutate: jest.fn(), isPending: false }),
  useEntries: () => ({
    isLoading: false,
    isError: false,
    data: { pages: [{ items: [] }] },
  }),
  useTodayMoods: () => [],
  useStreakIndicator: () => mockStreak,
}));

it('card tap → New Entry with no mood; mood tap → New Entry with that mood', async () => {
  const user = userEvent.setup();
  const navigate = jest.fn();
  const screen = await render(
    <JournalHomeScreen navigation={{ navigate } as never} route={{} as never} />,
  );

  await user.press(screen.getByText('Today’s Moods'));
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenLastCalledWith('NewEntry'); // no params: nothing preselected

  await user.press(screen.getByLabelText(/3 day streak/)); // the streak badge, urgent state
  expect(navigate).toHaveBeenCalledTimes(2);
  expect(navigate).toHaveBeenLastCalledWith('NewEntry');

  await user.press(screen.getByLabelText('Sad'));
  expect(navigate).toHaveBeenCalledTimes(3); // the mood only, not the card as well
  expect(navigate).toHaveBeenLastCalledWith('NewEntry', { presetMood: 'sad' });

  // Same destination as the + New Entry button.
  await user.press(screen.getByLabelText('New Entry'));
  expect(navigate).toHaveBeenLastCalledWith('NewEntry');
});
