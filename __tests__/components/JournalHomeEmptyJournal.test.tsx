/**
 * Client 10/14 p.3: the "Your journal is empty" card names the + New Entry button, exactly:
 * "Tap + New Entry to log your first mood and write what’s on your mind." One render per file.
 */
import { render } from '@testing-library/react-native';
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
jest.mock('@features/journal/components/TodaysMoodCard', () => ({
  TodaysMoodCard: () => null,
}));
jest.mock('@features/journal/hooks', () => ({
  useDailyPrompt: () => 'How are you today?',
  useDeleteEntry: () => ({ mutate: jest.fn(), isPending: false }),
  useEntries: () => ({
    isLoading: false,
    isError: false,
    data: { pages: [{ items: [] }] },
  }),
}));

it('shows the exact empty-journal text pointing at + New Entry', async () => {
  const screen = await render(
    <JournalHomeScreen
      navigation={{ navigate: jest.fn() } as never}
      route={{} as never}
    />,
  );

  expect(screen.getByText('Your journal is empty')).toBeTruthy();
  // Exact string, curly apostrophe in "what’s", final period.
  expect(
    screen.getByText(
      'Tap + New Entry to log your first mood and write what’s on your mind.',
    ),
  ).toBeTruthy();
  expect(screen.queryByText(/Tap the \+ button/)).toBeNull();
  // The button it names is on screen with that label.
  expect(screen.getByLabelText('New Entry')).toBeTruthy();
});
