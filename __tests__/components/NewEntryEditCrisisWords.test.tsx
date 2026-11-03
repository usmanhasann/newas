/**
 * Editing an entry so it has concerning words (client 10/14 p.36, N18; decision: an edit re-checks).
 * It was shared "As written" into a circle. On save:
 *  - the edit always saves (the person never loses what they wrote), with no "remove from circle?"
 *    question to get past: it can't stay shared, and the server takes it out of every circle and
 *    removes its reflection;
 *  - its new text is never sent to the moderation AI (the "As written" pre-check is skipped), nor
 *    to the private-threat check, and no share is made;
 *  - the crisis resources pop-up opens as soon as it's saved, then the screen goes back.
 * One render per file (React 19 leaks across sibling renders).
 */
import { Alert } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { NewEntryScreen } from '@features/journal/screens/NewEntryScreen';

const mockUpdate = jest.fn((_patch: Record<string, unknown>) =>
  Promise.resolve({ id: 'e1', crisis_flagged: true }),
);
const mockShare = jest.fn((_input: Record<string, unknown>) => Promise.resolve([]));
const mockBlocked = jest.fn((_text: string) => Promise.resolve(false));
const mockThreat = jest.fn();
const mockShowSupport = jest.fn();
const mockRefetch = jest.fn();

jest.mock('@features/moods', () => ({ MoodPicker: () => null }));
jest.mock('@features/crisis', () => ({
  EntryNotShareable: () => null,
  useEntryCrisisCheck: () => ({
    hasCrisisWords: (t: string | null | undefined) => /want to die/i.test(t ?? ''),
    showSupport: (then?: () => void) => mockShowSupport(then),
    sheet: null,
  }),
}));
jest.mock('@features/safety', () => ({ reportPrivateThreat: (i: unknown) => mockThreat(i) }));
jest.mock('@features/ai-summary', () => ({ invokeAiSummary: jest.fn(() => Promise.resolve({})) }));
jest.mock('@features/notifications', () => ({ notifyEvent: jest.fn() }));
jest.mock('@features/circles', () => {
  class PostBlockedError extends Error {}
  const logic = jest.requireActual('@features/circles/postingLogic');
  return {
    PostBlockedError,
    entryShareTargets: logic.entryShareTargets,
    unshareQuestion: logic.unshareQuestion,
    isShareTextBlocked: (t: string) => mockBlocked(t),
    useMyCircles: () => ({ data: [{ id: 'c1', name: 'Family', type: 'private', archived_at: null }] }),
    useEntryShares: () => ({
      data: {
        circleIds: ['c1'],
        version: 'written',
        postIds: ['p1'],
        circles: [{ postId: 'p1', circleId: 'c1', circleName: 'Family', replyTotal: 2 }],
      },
      refetch: () => mockRefetch(),
    }),
    useShareEntry: () => ({ mutateAsync: (i: Record<string, unknown>) => mockShare(i) }),
  };
});
jest.mock('@features/journal/hooks', () => ({
  useCreateEntry: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateEntry: () => ({
    mutateAsync: (p: Record<string, unknown>) => mockUpdate(p),
    isPending: false,
  }),
  useEntry: () => ({
    data: {
      id: 'e1',
      note: 'A good day.',
      mood_slug: 'calm',
      mood_slugs: ['calm'],
      ai_status: 'ready',
      ai_summary: 'Calm.',
      crisis_flagged: false,
    },
  }),
  useCompletionHeadingResolver: () => jest.fn(),
}));
jest.mock('@features/journal/components/EntryCompletionModal', () => ({
  EntryCompletionModal: () => null,
}));
jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() } }));
jest.mock('@features/email-verification', () => ({
  useVerifyGate: () => ({ check: async () => true, openVerify: jest.fn(), gate: null }),
}));

const alert = jest.spyOn(Alert, 'alert');

it('saves the edit privately with no AI checks, and opens support before going back', async () => {
  const nav = { goBack: jest.fn(), replace: jest.fn(), popToTop: jest.fn(), navigate: jest.fn() };
  const utils = await render(
    <NewEntryScreen navigation={nav as never} route={{ params: { entryId: 'e1' } } as never} />,
  );
  const input = utils.getByPlaceholderText('Write freely. This is your space.');
  await waitFor(() => expect(input.props.value).toBe('A good day.'));
  // Shared before the edit.
  expect(utils.getByRole('switch').props.value).toBe(true);

  await act(async () => {
    fireEvent.changeText(input, 'I want to die');
  });
  // It can't stay shared: the circle list gives way to the reason.
  expect(utils.getByRole('switch').props.value).toBe(false);
  expect(utils.queryByRole('checkbox')).toBeNull();

  await act(async () => {
    fireEvent.press(utils.getByText('Save Changes'));
  });
  await waitFor(() => expect(mockShowSupport).toHaveBeenCalledTimes(1));
  expect(alert).not.toHaveBeenCalled();
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  expect(mockUpdate.mock.calls[0]![0]).toMatchObject({ note: 'I want to die' });
  expect(mockBlocked).not.toHaveBeenCalled();
  expect(mockThreat).not.toHaveBeenCalled();
  expect(mockShare).not.toHaveBeenCalled();
  expect(mockRefetch).toHaveBeenCalled(); // where it's shared is read again (now nowhere)

  expect(nav.goBack).not.toHaveBeenCalled();
  await act(async () => {
    (mockShowSupport.mock.calls[0]![0] as () => void)();
  });
  expect(nav.goBack).toHaveBeenCalledTimes(1);
});
