/**
 * Client revisions 10/14 p.23 (N3): no one new can join an archived circle. A circle archived after
 * Discover loaded refuses the join; the person is told why in the server's own words (not "try
 * again", which can't help), the popup closes and the list reloads so the circle drops out of
 * Discover. One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent, act } from '@testing-library/react-native';
import { DiscoveryScreen } from '@features/circles/screens/DiscoveryScreen';

const mockToastError = jest.fn();
jest.mock('@store/toast', () => ({
  toast: { error: (m: string) => mockToastError(m), success: jest.fn() },
}));
const mockRefetch = jest.fn(() => Promise.resolve());
const mockJoinCalls = jest.fn();
jest.mock('@features/circles/hooks', () => ({
  usePublicCircles: () => ({
    data: [{ id: 'b', name: 'Tour Talk', description: null, member_count: 9, type: 'public', archived_at: null }],
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: () => mockRefetch(),
  }),
  useMyCircles: () => ({ data: [] }),
  useJoinCircle: () => ({
    isPending: false,
    mutate: (_id: string, opts: { onSuccess: () => void; onError: (e: unknown) => void }) => {
      const { CircleArchivedError } = jest.requireActual('@features/circles/api') as {
        CircleArchivedError: new () => Error;
      };
      mockJoinCalls();
      opts.onError(new CircleArchivedError());
    },
  }),
}));
jest.mock('@features/circles/ownersHooks', () => ({ useVerifiedCircleOwners: () => new Map() }));

it('an archived circle: says no one new can join, closes the popup and reloads the list', async () => {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const utils = await render(<DiscoveryScreen navigation={navigation as never} route={{} as never} />);

  await act(async () => {
    fireEvent.press(utils.getByText('Tour Talk'));
  });
  expect(utils.getByText('Not now')).toBeTruthy();
  await act(async () => {
    fireEvent.press(utils.getByText('Join'));
  });

  expect(mockJoinCalls).toHaveBeenCalledTimes(1);
  expect(mockToastError).toHaveBeenCalledWith(
    'This circle has been archived, so no one new can join.',
  );
  expect(mockToastError).not.toHaveBeenCalledWith('Couldn’t join. Please try again.');
  expect(utils.queryByText('Not now')).toBeNull(); // the popup closed
  expect(mockRefetch).toHaveBeenCalledTimes(1); // so the archived circle leaves the list
  expect(navigation.navigate).not.toHaveBeenCalled(); // never opened
});
