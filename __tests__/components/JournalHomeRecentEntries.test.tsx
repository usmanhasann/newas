/**
 * Home "Recent Entries" previews the 5 newest entries (was 4); the arrow still opens the full list.
 * Heavy children are stubbed so only the preview logic is under test. One render per file.
 */
import { render, fireEvent } from '@testing-library/react-native';
import { JournalHomeScreen } from '@features/journal/screens/JournalHomeScreen';

jest.mock('@features/profile', () => ({ useProfile: () => ({ data: { display_name: 'Konah Q' } }) }));
jest.mock('@features/notifications', () => ({
  NotificationNudgeCard: () => null,
  NotificationBell: () => null,
}));
jest.mock('@features/acquisition', () => ({ AcquisitionSheet: () => null }));
jest.mock('@features/welcome-reflection', () => ({ WelcomeReflectionCard: () => null }));
jest.mock('@features/journal/components/TodaysMoodCard', () => ({ TodaysMoodCard: () => null }));
// The swipe-to-delete row (native gesture) is stubbed; this test is about the preview count.
jest.mock('@features/journal/components/DeleteEntry', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    confirmDeleteEntry: jest.fn(),
    SwipeToDeleteEntry: ({ entry }: { entry: { id: string } }) => <Text>{`entry ${entry.id}`}</Text>,
  };
});
jest.mock('@features/journal/hooks', () => ({
  useDailyPrompt: () => 'How are you today?',
  useDeleteEntry: () => ({ mutate: jest.fn(), isPending: false }),
  useEntries: () => ({
    isLoading: false,
    isError: false,
    data: { pages: [{ items: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'].map((id) => ({ id })) }] },
  }),
}));

it('previews the 5 newest entries, and the arrow opens the full list', async () => {
  const navigation = { navigate: jest.fn() };
  const utils = await render(
    <JournalHomeScreen navigation={navigation as never} route={{} as never} />,
  );

  const shown = utils.getAllByText(/^entry e\d$/).map((n) => n.props.children);
  expect(shown).toEqual(['entry e1', 'entry e2', 'entry e3', 'entry e4', 'entry e5']);

  fireEvent.press(utils.getByLabelText('View all journal entries'));
  expect(navigation.navigate).toHaveBeenCalledWith('AllEntries');
});
