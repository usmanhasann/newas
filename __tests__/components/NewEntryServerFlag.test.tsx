/**
 * The server decides too (client 10/14 p.36, N18): when the database flags the saved entry but the
 * phone's check didn't (its keyword list not loaded yet, or an older list), the entry is still
 * treated as flagged: the share the person picked is NOT made, nothing goes to any AI, and the
 * crisis resources pop-up opens as soon as it's saved.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { NewEntryScreen } from '@features/journal/screens/NewEntryScreen';

const mockCreate = jest.fn((_input: Record<string, unknown>) =>
  Promise.resolve({ id: 'e9', local_date: '2026-10-21', crisis_flagged: true }),
);
const mockShare = jest.fn((_input: Record<string, unknown>) => Promise.resolve([]));
const mockInvoke = jest.fn((_id: string) => Promise.resolve({ status: 'ready' }));
const mockThreat = jest.fn();
const mockShowSupport = jest.fn();
const mockResolveHeading = jest.fn(() => Promise.resolve('Entry complete'));

jest.mock('@features/moods', () => ({ MoodPicker: () => null }));
jest.mock('@features/crisis', () => ({
  EntryNotShareable: () => null,
  useEntryCrisisCheck: () => ({
    hasCrisisWords: () => false,
    showSupport: (then?: () => void) => mockShowSupport(then),
    sheet: null,
  }),
}));
jest.mock('@features/safety', () => ({ reportPrivateThreat: (i: unknown) => mockThreat(i) }));
jest.mock('@features/circles', () => {
  class PostBlockedError extends Error {}
  const logic = jest.requireActual('@features/circles/postingLogic');
  return {
    PostBlockedError,
    entryShareTargets: logic.entryShareTargets,
    unshareQuestion: logic.unshareQuestion,
    isShareTextBlocked: () => Promise.resolve(false),
    useMyCircles: () => ({
      data: [{ id: 'c1', name: 'Family', type: 'private', archived_at: null }],
    }),
    useEntryShares: () => ({ data: undefined }),
    useShareEntry: () => ({ mutateAsync: (i: Record<string, unknown>) => mockShare(i) }),
  };
});
jest.mock('@features/ai-summary', () => ({ invokeAiSummary: (id: string) => mockInvoke(id) }));
jest.mock('@features/notifications', () => ({ notifyEvent: jest.fn() }));
jest.mock('@features/journal/hooks', () => ({
  useCreateEntry: () => ({
    mutateAsync: (i: Record<string, unknown>) => mockCreate(i),
    isPending: false,
  }),
  useUpdateEntry: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useEntry: () => ({ data: undefined }),
  useCompletionHeadingResolver: () => () => mockResolveHeading(),
}));
jest.mock('@features/journal/components/EntryCompletionModal', () => ({
  EntryCompletionModal: () => null,
}));
jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() } }));
jest.mock('@features/email-verification', () => ({
  useVerifyGate: () => ({ check: async () => true, openVerify: jest.fn(), gate: null }),
}));

it('follows the server’s flag: no share, no AI, support opens', async () => {
  const nav = { goBack: jest.fn(), replace: jest.fn(), popToTop: jest.fn(), navigate: jest.fn() };
  const utils = await render(
    <NewEntryScreen navigation={nav as never} route={{ params: { presetMood: 'sad' } } as never} />,
  );
  await act(async () => {
    fireEvent.changeText(
      utils.getByPlaceholderText('Write freely. This is your space.'),
      'Words the phone did not catch',
    );
  });
  // The person picked a circle (the phone saw nothing wrong).
  await act(async () => {
    fireEvent(utils.getByRole('switch'), 'valueChange', true);
  });
  await act(async () => {
    fireEvent.press(utils.getByRole('checkbox'));
  });

  await act(async () => {
    fireEvent.press(utils.getByText('Save Entry'));
  });
  await waitFor(() => expect(mockShowSupport).toHaveBeenCalledTimes(1));
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockShare).not.toHaveBeenCalled();
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(mockThreat).not.toHaveBeenCalled();
  expect(mockResolveHeading).not.toHaveBeenCalled();
  await act(async () => {
    (mockShowSupport.mock.calls[0]![0] as () => void)();
  });
  expect(nav.replace).toHaveBeenCalledWith('EntryDetail', { entryId: 'e9' });
});
