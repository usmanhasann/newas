/**
 * Deleting an entry from its own page (client spec 2026-09-29): a trash button asks "Delete this
 * entry? This can't be undone." and only deletes on "Delete"; afterwards the page closes. (The
 * database removes it from every circle and drops its AI Insight; the streak never changes.)
 * One render per file.
 */
import { Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { EntryDetailScreen } from '@features/journal/screens/EntryDetailScreen';

const mockMutate = jest.fn();
jest.mock('@features/journal/hooks', () => ({
  useEntry: () => ({
    isLoading: false,
    data: {
      id: 'e1',
      note: 'Matcha with Augie.',
      mood_slug: 'happy',
      mood_slugs: ['happy'],
      ai_status: 'ready',
      ai_summary: 'I loved slowing down for matcha with Augie.',
      shared: false,
      created_at: '2026-09-29T10:00:00Z',
    },
  }),
  useDeleteEntry: () => ({ mutate: mockMutate, isPending: false }),
}));
jest.mock('@features/ai-summary', () => ({ useGenerateSummary: () => ({ mutate: jest.fn(), isPending: false }) }));
jest.mock('@features/circles', () => ({
  useEntryShares: () => ({ data: { circleIds: [], version: null, postIds: [], circles: [] } }),
  useMyCircles: () => ({ data: [] }),
}));

it('asks first, deletes only on "Delete", then closes the page', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const utils = await render(
    <EntryDetailScreen navigation={navigation as never} route={{ params: { entryId: 'e1' } } as never} />,
  );

  fireEvent.press(utils.getByLabelText('Delete entry'));
  expect(alert).toHaveBeenCalledTimes(1);
  const [title, message, buttons] = alert.mock.calls[0]!;
  expect(title).toBe('Delete this entry?');
  expect(message).toBe('This can’t be undone.');
  expect(mockMutate).not.toHaveBeenCalled(); // nothing happens until they confirm

  const del = buttons!.find((b) => b.text === 'Delete')!;
  expect(del.style).toBe('destructive');
  del.onPress!();
  expect(mockMutate).toHaveBeenCalledWith('e1', expect.objectContaining({ onSuccess: expect.any(Function) }));

  // After a successful delete the page closes (it would otherwise show a deleted entry).
  (mockMutate.mock.calls[0]![1] as { onSuccess: () => void }).onSuccess();
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});
