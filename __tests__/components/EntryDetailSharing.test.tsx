/**
 * An entry's own page says where it's shared and what the circle sees (client spec 2026-09-29):
 * the circles by name, and whether they see the words as written or only the AI reflection. A
 * circle the writer has since LEFT is still named (members there still see it; audit 2026-09-30:
 * it used to read "Private" while it wasn't).
 * One render per file (React 19 leaks across sibling renders).
 */
import { render } from '@testing-library/react-native';
import { EntryDetailScreen } from '@features/journal/screens/EntryDetailScreen';

jest.mock('@features/journal/hooks', () => ({
  useEntry: () => ({
    isLoading: false,
    data: {
      id: 'e1',
      note: 'A long raw day.',
      mood_slug: 'tired',
      mood_slugs: ['tired'],
      ai_status: 'ready',
      ai_summary: 'I felt drained, and that is okay.',
      shared: true,
      created_at: '2026-09-29T10:00:00Z',
    },
  }),
  useDeleteEntry: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@features/ai-summary', () => ({ useGenerateSummary: () => ({ mutate: jest.fn(), isPending: false }) }));
jest.mock('@features/circles', () => ({
  useEntryShares: () => ({
    data: {
      circleIds: ['c1', 'c2'],
      version: 'reflection',
      postIds: ['p1', 'p2'],
      circles: [
        { postId: 'p1', circleId: 'c1', circleName: 'Family', replyTotal: 0 },
        // The writer left "Roommates" after sharing: its members still see the entry.
        { postId: 'p2', circleId: 'c2', circleName: 'Roommates', replyTotal: 2 },
      ],
    },
  }),
}));

it('names the circles and says only the AI reflection is shared', async () => {
  const utils = await render(
    <EntryDetailScreen
      navigation={{ goBack: jest.fn(), navigate: jest.fn() } as never}
      route={{ params: { entryId: 'e1' } } as never}
    />,
  );
  expect(utils.getByText('Shared with Family, Roommates')).toBeTruthy();
  expect(utils.getByText('They see its AI reflection, with your mood. Your words stay private.')).toBeTruthy();
  expect(utils.queryByText('Reactions')).toBeNull(); // emoji reactions are retired (hearts now)
});
