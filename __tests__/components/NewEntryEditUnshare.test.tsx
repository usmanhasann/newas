/**
 * Editing a shared entry (audit 2026-09-30):
 *  - the share list keeps every circle it's in, even one the writer left or that was archived since
 *    (so it can be taken out), and never offers an archived circle it isn't in;
 *  - taking it out of circles where it has replies asks first, with the real count, because the
 *    replies are deleted with it. "Cancel" changes nothing at all; "Remove" saves and takes it out.
 * One render per file (React 19 leaks across sibling renders).
 */
import { Alert } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { NewEntryScreen } from '@features/journal/screens/NewEntryScreen';

const mockUpdate = jest.fn((_patch: Record<string, unknown>) => Promise.resolve({ id: 'e1' }));
const mockShare = jest.fn((_input: Record<string, unknown>) => Promise.resolve([]));

jest.mock('@features/moods', () => ({ MoodPicker: () => null }));
jest.mock('@features/crisis', () => ({
  useEntryCrisisCheck: () => ({ hasCrisisWords: () => false, showSupport: jest.fn(), sheet: null }),
  EntryNotShareable: () => null,
}));
jest.mock('@features/safety', () => ({ reportPrivateThreat: jest.fn() }));
jest.mock('@features/ai-summary', () => ({ invokeAiSummary: jest.fn(() => Promise.resolve({})) }));
jest.mock('@features/notifications', () => ({ notifyEvent: jest.fn() }));
jest.mock('@features/circles', () => {
  class PostBlockedError extends Error {}
  const logic = jest.requireActual('@features/circles/postingLogic');
  return {
    PostBlockedError,
    entryShareTargets: logic.entryShareTargets,
    unshareQuestion: logic.unshareQuestion,
    isShareTextBlocked: () => Promise.resolve(false),
    useMyCircles: () => ({
      data: [
        { id: 'c1', name: 'Family', type: 'private', archived_at: null },
        { id: 'c4', name: 'Book Club', type: 'private', archived_at: '2026-09-01T00:00:00Z' },
        { id: 'c5', name: 'Old Roommates', type: 'private', archived_at: '2026-09-01T00:00:00Z' },
      ],
    }),
    useEntryShares: () => ({
      data: {
        circleIds: ['c1', 'c3', 'c5'],
        version: 'reflection',
        postIds: ['p1', 'p3', 'p5'],
        circles: [
          { postId: 'p1', circleId: 'c1', circleName: 'Family', replyTotal: 2 },
          { postId: 'p3', circleId: 'c3', circleName: 'Running Crew', replyTotal: 1 }, // left since
          { postId: 'p5', circleId: 'c5', circleName: 'Old Roommates', replyTotal: 0 }, // archived since
        ],
      },
    }),
    useShareEntry: () => ({ mutateAsync: (i: Record<string, unknown>) => mockShare(i) }),
  };
});
jest.mock('@features/journal/hooks', () => ({
  useCreateEntry: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateEntry: () => ({ mutateAsync: (p: Record<string, unknown>) => mockUpdate(p), isPending: false }),
  useEntry: () => ({
    data: {
      id: 'e1',
      note: 'A good day.',
      mood_slug: 'calm',
      mood_slugs: ['calm'],
      ai_status: 'ready',
      ai_summary: 'Calm.',
    },
  }),
  useCompletionHeadingResolver: () => jest.fn(),
}));
jest.mock('@features/journal/components/EntryCompletionModal', () => ({ EntryCompletionModal: () => null }));
jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() } }));
jest.mock('@features/email-verification', () => ({
  useVerifyGate: () => ({ check: async () => true, openVerify: jest.fn(), gate: null }),
}));

it('lists left/archived circles it is in, and asks before deleting replies with it', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  const nav = { goBack: jest.fn(), replace: jest.fn(), popToTop: jest.fn(), navigate: jest.fn() };
  const utils = await render(
    <NewEntryScreen navigation={nav as never} route={{ params: { entryId: 'e1' } } as never} />,
  );

  // The list: active circles, plus every circle it's still in (left / archived since).
  await waitFor(() => expect(utils.getByText('Running Crew')).toBeTruthy());
  expect(utils.getByText('Family')).toBeTruthy();
  expect(utils.getByText('Old Roommates')).toBeTruthy();
  expect(utils.getByText('You left this circle. You can take it out, not add it again.')).toBeTruthy();
  expect(utils.getByText('Archived. You can take it out, not add it again.')).toBeTruthy();
  expect(utils.queryByText('Book Club')).toBeNull(); // archived and not shared there: never offered

  // Switch sharing off: it would leave all three circles, 3 replies in all.
  await act(async () => {
    fireEvent(utils.getByRole('switch'), 'valueChange', false);
  });
  await act(async () => {
    fireEvent.press(utils.getByText('Save Changes'));
  });
  await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
  const [title, message, buttons] = alert.mock.calls[0]!;
  expect(title).toBe('Stop sharing this entry?');
  expect(message).toBe(
    'It will be removed from Family, Running Crew and Old Roommates, along with 3 replies.',
  );

  // Cancel: nothing is saved or changed.
  await act(async () => {
    buttons!.find((b) => b.text === 'Cancel')!.onPress!();
  });
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockShare).not.toHaveBeenCalled();
  expect(nav.goBack).not.toHaveBeenCalled();

  // Save again and confirm: saved, then taken out of every circle.
  await act(async () => {
    fireEvent.press(utils.getByText('Save Changes'));
  });
  await waitFor(() => expect(alert).toHaveBeenCalledTimes(2));
  await act(async () => {
    alert.mock.calls[1]![2]!.find((b) => b.text === 'Remove')!.onPress!();
  });
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ entryId: 'e1', circleIds: [] })),
  );
  expect(nav.goBack).toHaveBeenCalled();
});
