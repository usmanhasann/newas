/**
 * Public circles that can't load (offline) say so with "Try again" (audit 2026-09-30): the list used
 * to show "No public circles yet. Create one…", which reads as if none exist.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent } from '@testing-library/react-native';
import { DiscoveryScreen } from '@features/circles/screens/DiscoveryScreen';

const mockRefetch = jest.fn();
jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('@features/circles/ownersHooks', () => ({ useVerifiedCircleOwners: () => new Map() }));
jest.mock('@features/circles/hooks', () => ({
  usePublicCircles: () => ({
    data: undefined,
    isLoading: false,
    isError: true,
    isFetching: false,
    refetch: () => mockRefetch(),
  }),
  useMyCircles: () => ({ data: [] }),
  useJoinCircle: () => ({ mutate: jest.fn(), isPending: false }),
}));

it('says the list could not load, offers Try again, and never claims there are none', async () => {
  const utils = await render(
    <DiscoveryScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() } as never} route={{} as never} />,
  );
  expect(utils.getByText('We couldn’t load public circles')).toBeTruthy();
  expect(utils.queryByText('No public circles yet')).toBeNull();
  fireEvent.press(utils.getByText('Try again'));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});
