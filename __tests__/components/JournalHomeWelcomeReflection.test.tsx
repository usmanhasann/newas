/**
 * Client 10/14 p.35 (N15.53): the "Welcome reflection" card sits at the top of the Journal tab's list,
 * under the "Recent Entries" heading and above the entries. It is not an entry: with no entries the
 * exact empty-journal text still shows below it (O15), and the Today's Moods card still opens New
 * Entry from a tap anywhere on it (O16). Tapping the welcome card opens the full reflection and never
 * New Entry. Uses the real cards, with only their data hooks stubbed. One render per file.
 */
import { render, userEvent } from '@testing-library/react-native';
import { JournalHomeScreen } from '@features/journal/screens/JournalHomeScreen';

const WELCOME_TEXT = 'You came here to slow down. That matters.';

jest.mock('@features/profile', () => ({
  useProfile: () => ({ data: { display_name: 'Konah Q' } }),
}));
jest.mock('@features/notifications', () => ({
  NotificationNudgeCard: () => null,
  NotificationBell: () => null,
}));
jest.mock('@features/acquisition', () => ({ AcquisitionSheet: () => null }));
jest.mock('@features/welcome-reflection/hooks', () => ({
  useWelcomeReflection: () => ({
    data: {
      status: 'ready',
      body: 'You came here to slow down. That matters.',
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
    },
  }),
  useRequestWelcomeReflection: () => ({ isPending: false, mutate: jest.fn() }),
  useDeleteWelcomeReflection: () => ({ isPending: false, mutate: jest.fn() }),
  useStartWelcomeReflection: () => jest.fn(),
}));
jest.mock('@features/journal/hooks', () => ({
  useDailyPrompt: () => 'How are you today?',
  useDeleteEntry: () => ({ mutate: jest.fn(), isPending: false }),
  useEntries: () => ({
    isLoading: false,
    isError: false,
    data: { pages: [{ items: [] }] },
  }),
  useTodayMoods: () => [],
  useStreakIndicator: () => ({ state: 'hidden', streak: 0 }),
}));

it('shows the welcome card first in the list, keeping the empty text and the Today’s Moods tap', async () => {
  const user = userEvent.setup();
  const navigate = jest.fn();
  const screen = await render(
    <JournalHomeScreen navigation={{ navigate } as never} route={{} as never} />,
  );

  expect(screen.getByText('Welcome reflection')).toBeTruthy();
  expect(screen.getByText(WELCOME_TEXT)).toBeTruthy();
  // O15: the exact empty-journal text is still there.
  expect(screen.getByText('Your journal is empty')).toBeTruthy();
  expect(
    screen.getByText('Tap + New Entry to log your first mood and write what’s on your mind.'),
  ).toBeTruthy();

  // Order on screen: Today's Moods, the "Recent Entries" heading, the welcome card, then the list.
  const tree = JSON.stringify(screen.toJSON());
  const at = (s: string) => tree.indexOf(s);
  expect(at('Today’s Moods')).toBeGreaterThan(-1);
  expect(at('Today’s Moods')).toBeLessThan(at('Recent Entries'));
  expect(at('Recent Entries')).toBeLessThan(at('Welcome reflection'));
  expect(at('Welcome reflection')).toBeLessThan(at('Your journal is empty'));

  // O16: a tap anywhere on Today's Moods still opens New Entry with nothing chosen.
  await user.press(screen.getByText('Today’s Moods'));
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenLastCalledWith('NewEntry');

  // The welcome card opens the full reflection, and nothing else.
  await user.press(screen.getByTestId('welcome-reflection-card'));
  expect(await screen.findByText('BASED ON YOUR ANSWERS')).toBeTruthy();
  expect(navigate).toHaveBeenCalledTimes(1);
});
