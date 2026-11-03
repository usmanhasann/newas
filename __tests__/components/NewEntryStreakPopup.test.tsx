/**
 * Saving the day's first entry opens the streak popup with what the resolver worked out (the
 * streak and that day's message line, client revisions 10/14 p.24 to 27); "See AI summary" opens
 * the entry. Collaborators are mocked; the popup itself is real. One render per file.
 */
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { NewEntryScreen } from '@features/journal/screens/NewEntryScreen';

const mockCreate = jest.fn((_input: Record<string, unknown>) =>
  Promise.resolve({ id: 'e1', local_date: '2026-10-20' }),
);
const mockResolve = jest.fn((_entry: { id: string; local_date: string }) =>
  Promise.resolve({ kind: 'streak', streak: 29, message: 'Tomorrow is day 30. Don’t miss it.' }),
);

jest.mock('@features/moods', () => ({ MoodPicker: () => null }));
jest.mock('@features/crisis', () => ({
  useEntryCrisisCheck: () => ({ hasCrisisWords: () => false, showSupport: jest.fn(), sheet: null }),
  EntryNotShareable: () => null,
}));
jest.mock('@features/safety', () => ({ reportPrivateThreat: jest.fn() }));
jest.mock('@features/circles', () => {
  class PostBlockedError extends Error {}
  const logic = jest.requireActual('@features/circles/postingLogic');
  return {
    PostBlockedError,
    entryShareTargets: logic.entryShareTargets,
    unshareQuestion: logic.unshareQuestion,
    isShareTextBlocked: () => Promise.resolve(false),
    useMyCircles: () => ({ data: [] }),
    useEntryShares: () => ({ data: undefined }),
    useShareEntry: () => ({ mutateAsync: jest.fn() }),
  };
});
jest.mock('@features/ai-summary', () => ({ invokeAiSummary: jest.fn(() => Promise.resolve()) }));
jest.mock('@features/notifications', () => ({ notifyEvent: jest.fn() }));
jest.mock('@features/journal/hooks', () => ({
  useCreateEntry: () => ({ mutateAsync: mockCreate, isPending: false }),
  useUpdateEntry: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useEntry: () => ({ data: undefined }),
  useCompletionHeadingResolver: () => mockResolve,
}));
jest.mock('@store/toast', () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));
jest.mock('@features/email-verification', () => ({
  useVerifyGate: () => ({
    check: async () => true,
    openVerify: jest.fn(),
    requireVerified: async (a: () => void | Promise<void>) => {
      await a();
    },
    gate: null,
  }),
}));

it('first entry of the day: the streak popup shows the resolved streak and message', async () => {
  const nav = { goBack: jest.fn(), replace: jest.fn(), popToTop: jest.fn(), navigate: jest.fn() };
  const screen = await render(
    <NewEntryScreen navigation={nav as never} route={{ params: { presetMood: 'calm' } } as never} />,
  );
  await act(async () => {
    fireEvent.changeText(screen.getByPlaceholderText(/Write freely/), 'A good day');
  });
  await act(async () => {
    fireEvent.press(screen.getByText('Save Entry'));
  });

  await waitFor(() => expect(screen.getByText('DAY STREAK')).toBeTruthy());
  expect(mockResolve).toHaveBeenCalledWith({ id: 'e1', local_date: '2026-10-20' });
  expect(screen.getByLabelText('29 day streak')).toBeTruthy();
  expect(screen.getByText('Tomorrow is day 30. Don’t miss it.')).toBeTruthy();
  expect(screen.queryByText('Entry complete')).toBeNull();

  await act(async () => {
    fireEvent.press(screen.getByText('See AI summary'));
  });
  expect(nav.replace).toHaveBeenCalledWith('EntryDetail', { entryId: 'e1' });
});
