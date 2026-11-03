/**
 * Editing an entry that's shared "As written" (audit 2026-09-30): the circle sees the new text the
 * moment the entry saves, so changed text is checked like a new post BEFORE saving. When it's
 * blocked, the entry is taken out of its circles FIRST, then saved privately, and the writer is
 * told. The blocked words never reach the circle, not even briefly.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { NewEntryScreen } from '@features/journal/screens/NewEntryScreen';

const mockOrder: string[] = [];
const mockUpdate = jest.fn((_patch: Record<string, unknown>) => {
  mockOrder.push('update');
  return Promise.resolve({ id: 'e1' });
});
const mockShare = jest.fn((input: { circleIds: string[] }) => {
  mockOrder.push(`share:${input.circleIds.join(',') || 'none'}`);
  return Promise.resolve([]);
});
const mockBlocked = jest.fn((_text: string) => Promise.resolve(true));
const mockToastError = jest.fn();

jest.mock('@features/moods', () => ({ MoodPicker: () => null }));
jest.mock('@features/crisis', () => ({
  useEntryCrisisCheck: () => ({ hasCrisisWords: () => false, showSupport: jest.fn(), sheet: null }),
  EntryNotShareable: () => null,
}));
jest.mock('@features/safety', () => ({ reportPrivateThreat: jest.fn() }));
jest.mock('@features/ai-summary', () => ({ invokeAiSummary: jest.fn(() => Promise.resolve({})) }));
jest.mock('@features/notifications', () => ({ notifyEvent: jest.fn() }));
jest.mock('@features/circles', () => {
  class PostBlockedError extends Error {
    constructor() {
      super('This can’t be shared. It may violate our community guidelines.');
    }
  }
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
        circles: [{ postId: 'p1', circleId: 'c1', circleName: 'Family', replyTotal: 0 }],
      },
    }),
    useShareEntry: () => ({ mutateAsync: (i: { circleIds: string[] }) => mockShare(i) }),
  };
});
jest.mock('@features/journal/hooks', () => ({
  useCreateEntry: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateEntry: () => ({ mutateAsync: (p: Record<string, unknown>) => mockUpdate(p), isPending: false }),
  useEntry: () => ({
    data: { id: 'e1', note: 'A good day.', mood_slug: 'calm', mood_slugs: ['calm'], ai_status: 'ready', ai_summary: 'Calm.' },
  }),
  useCompletionHeadingResolver: () => jest.fn(),
}));
jest.mock('@features/journal/components/EntryCompletionModal', () => ({ EntryCompletionModal: () => null }));
jest.mock('@store/toast', () => ({
  toast: { error: (m: string) => mockToastError(m), success: jest.fn(), info: jest.fn() },
}));
jest.mock('@features/email-verification', () => ({
  useVerifyGate: () => ({ check: async () => true, openVerify: jest.fn(), gate: null }),
}));

it('checks changed "As written" text first; blocked → out of the circle, then saved privately', async () => {
  const nav = { goBack: jest.fn(), replace: jest.fn(), popToTop: jest.fn(), navigate: jest.fn() };
  const utils = await render(
    <NewEntryScreen navigation={nav as never} route={{ params: { entryId: 'e1' } } as never} />,
  );
  const input = utils.getByPlaceholderText('Write freely. This is your space.');
  await waitFor(() => expect(input.props.value).toBe('A good day.'));

  await act(async () => {
    fireEvent.changeText(input, 'Something that breaks the rules');
  });
  await act(async () => {
    fireEvent.press(utils.getByText('Save Changes'));
  });

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  expect(mockBlocked).toHaveBeenCalledWith('Something that breaks the rules');
  // Out of the circle BEFORE the new text is saved; never shared again afterwards.
  expect(mockOrder).toEqual(['share:none', 'update']);
  expect(mockToastError).toHaveBeenCalledWith(
    'Saved, but not shared. This can’t be shared. It may violate our community guidelines.',
  );
  expect(nav.goBack).toHaveBeenCalled();
});
