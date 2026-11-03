/**
 * Client revisions 10/14 p.5 (N7.18): in Discover, a Public circle owned by a verified person shows
 * the owner's name with the purple badge right after it ("Created by [Name]"), on its card and in
 * its Join popup. Circles whose owner isn't verified look as before (no owner line).
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent, act, within } from '@testing-library/react-native';
import { DiscoveryScreen } from '@features/circles/screens/DiscoveryScreen';

jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('@features/circles/hooks', () => ({
  usePublicCircles: () => ({
    data: [
      { id: 'a', name: 'Book Club', description: null, member_count: 4, type: 'public', archived_at: null },
      { id: 'b', name: 'Tour Talk', description: 'All things tour.', member_count: 90, type: 'public', archived_at: null },
    ],
    isLoading: false,
  }),
  useMyCircles: () => ({ data: [] }),
  useJoinCircle: () => ({ mutate: jest.fn(), isPending: false }),
}));
const mockOwnerLookups: string[][] = [];
jest.mock('@features/circles/ownersHooks', () => ({
  useVerifiedCircleOwners: (ids: readonly string[]) => {
    mockOwnerLookups.push([...ids]);
    return new Map(ids.includes('b') ? [['b', { ownerId: 'o1', name: 'Taylor' }]] : []);
  },
}));

it('names the verified owner (badge after the name) on the card and in the Join popup', async () => {
  const utils = await render(
    <DiscoveryScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() } as never} route={{} as never} />,
  );

  // The cards ask for every listed circle's verified owner at once.
  expect(mockOwnerLookups[0]).toEqual(['b', 'a']);

  // Only Tour Talk's owner is verified: one line, on its card, between the name and description.
  const lines = utils.getAllByTestId('circle-owner-byline');
  expect(lines).toHaveLength(1);
  expect(lines[0]!.children[0]).toBe('Created by Taylor ');
  expect(within(lines[0]!).getByLabelText('Verified')).toBeTruthy();
  const tree = JSON.stringify(utils.toJSON());
  expect(tree.indexOf('Tour Talk')).toBeLessThan(tree.indexOf('Created by Taylor'));
  expect(tree.indexOf('Created by Taylor')).toBeLessThan(tree.indexOf('All things tour.'));
  expect(tree.indexOf('Book Club')).toBeGreaterThan(tree.indexOf('All things tour.'));

  // The Join popup names the owner too.
  await act(async () => {
    fireEvent.press(utils.getByText('Tour Talk'));
  });
  expect(utils.getByText('Not now')).toBeTruthy();
  expect(utils.getAllByTestId('circle-owner-byline')).toHaveLength(2);
  expect(mockOwnerLookups.some((ids) => ids.length === 1 && ids[0] === 'b')).toBe(true);
});
