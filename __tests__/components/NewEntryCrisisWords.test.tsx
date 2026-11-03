/**
 * A new entry with concerning words (client 10/14 p.36, N18): keywords only, checked on the phone.
 *  - Sharing: trying to share shows "This entry can’t be shared, but support is always available."
 *    with a link to the crisis resources, and no circle can be picked (N18.08 to N18.11).
 *  - Save: the entry is saved privately like any other (N18.02), nothing is shared, no AI
 *    reflection is asked for and no text goes to any AI check (N18.04, N18.12, N18.13), and the
 *    crisis resources pop-up opens as soon as it's saved (N18.03). No streak popup on top of it:
 *    once the pop-up is closed the saved entry opens, where the same help is offered.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { NewEntryScreen } from '@features/journal/screens/NewEntryScreen';

const mockCreate = jest.fn((_input: Record<string, unknown>) =>
  Promise.resolve({ id: 'e1', local_date: '2026-10-21' }),
);
const mockShare = jest.fn((_input: Record<string, unknown>) => Promise.resolve([]));
const mockInvoke = jest.fn((_id: string) => Promise.resolve({ status: 'ready' }));
const mockBlocked = jest.fn((_text: string) => Promise.resolve(false));
const mockThreat = jest.fn();
const mockShowSupport = jest.fn();
const mockResolveHeading = jest.fn(() => Promise.resolve('Entry complete'));

jest.mock('@features/moods', () => ({ MoodPicker: () => null }));
jest.mock('@features/crisis', () => ({
  ...jest.requireActual('@features/crisis/components/EntryNotShareable'),
  useEntryCrisisCheck: () => ({
    hasCrisisWords: (t: string | null | undefined) => /hopeless/i.test(t ?? ''),
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
    isShareTextBlocked: (t: string) => mockBlocked(t),
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

it('saves privately, never shares or reflects, and opens support as soon as it is saved', async () => {
  const nav = { goBack: jest.fn(), replace: jest.fn(), popToTop: jest.fn(), navigate: jest.fn() };
  const utils = await render(
    <NewEntryScreen navigation={nav as never} route={{ params: { presetMood: 'calm' } } as never} />,
  );
  await act(async () => {
    fireEvent.changeText(
      utils.getByPlaceholderText('Write freely. This is your space.'),
      'I feel hopeless tonight',
    );
  });
  // Writing alone opens nothing.
  expect(mockShowSupport).not.toHaveBeenCalled();

  // Trying to share: it stays off, says why, and offers the crisis resources; no circle to pick.
  await act(async () => {
    fireEvent(utils.getByRole('switch'), 'valueChange', true);
  });
  expect(utils.getByRole('switch').props.value).toBe(false);
  expect(
    utils.getByText(
      /^This entry can’t be shared, but support is always available\. See crisis resources$/,
    ),
  ).toBeTruthy();
  expect(utils.queryByRole('checkbox')).toBeNull();
  expect(utils.queryByText('Family')).toBeNull();

  await act(async () => {
    fireEvent.press(utils.getByText('Save Entry'));
  });
  await waitFor(() => expect(mockShowSupport).toHaveBeenCalledTimes(1));
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockCreate.mock.calls[0]![0]).toEqual({
    mood_slugs: ['calm'],
    note: 'I feel hopeless tonight',
  });
  expect(mockShare).not.toHaveBeenCalled();
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(mockBlocked).not.toHaveBeenCalled();
  expect(mockThreat).not.toHaveBeenCalled();
  expect(mockResolveHeading).not.toHaveBeenCalled(); // no streak popup on top of the help

  // Once the pop-up is closed, the saved entry opens (its reflection place offers the same help).
  expect(nav.replace).not.toHaveBeenCalled();
  await act(async () => {
    (mockShowSupport.mock.calls[0]![0] as () => void)();
  });
  expect(nav.replace).toHaveBeenCalledWith('EntryDetail', { entryId: 'e1' });

  // Saved once: Save stays off.
  await act(async () => {
    fireEvent.press(utils.getByText('Save Entry'));
  });
  expect(mockCreate).toHaveBeenCalledTimes(1);
});
