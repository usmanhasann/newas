/**
 * Discovery — the flat Public-Circle list (sorted by member count) and the Join / Not now popup.
 * Hooks are mocked; asserts ordering, the popup, and that Join fires the mutation.
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { DiscoveryScreen } from '@features/circles';

jest.mock('@features/circles/hooks', () => {
  const state: { circles: unknown[]; my: unknown[] } = { circles: [], my: [] };
  const join = jest.fn();
  return {
    __state: state,
    __join: join,
    usePublicCircles: () => ({ data: state.circles, isLoading: false }),
    useMyCircles: () => ({ data: state.my }),
    useJoinCircle: () => ({ mutate: join, isPending: false }),
  };
});
jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
// No verified owners here (CircleOwnerByline / DiscoverVerifiedOwner tests cover the "Created by" line).
jest.mock('@features/circles/ownersHooks', () => ({ useVerifiedCircleOwners: () => new Map() }));

const hooks = jest.requireMock('@features/circles/hooks') as {
  __state: { circles: unknown[]; my: unknown[] };
  __join: jest.Mock;
};

function makeNav() {
  return { navigate: jest.fn(), goBack: jest.fn() };
}

beforeEach(() => {
  hooks.__state.circles = [];
  hooks.__state.my = [];
  hooks.__join.mockReset();
});

describe('<DiscoveryScreen />', () => {
  it('lists public circles sorted by member count (highest first)', async () => {
    hooks.__state.circles = [
      { id: 'a', name: 'Small', description: null, member_count: 2, type: 'public', archived_at: null },
      { id: 'b', name: 'Big', description: 'Lots of people', member_count: 99, type: 'public', archived_at: null },
    ];
    const utils = await render(<DiscoveryScreen navigation={makeNav() as never} route={{} as never} />);
    const names = utils.getAllByText(/^(Small|Big)$/).map((n) => n.props.children);
    expect(names[0]).toBe('Big'); // highest member count first
    expect(utils.getByText('99 members')).toBeTruthy();
  });

  it('opens the Join / Not now popup and joins on confirm', async () => {
    hooks.__state.circles = [
      { id: 'b', name: 'Big', description: 'desc', member_count: 99, type: 'public', archived_at: null },
    ];
    const utils = await render(<DiscoveryScreen navigation={makeNav() as never} route={{} as never} />);

    fireEvent.press(utils.getByText('Big'));
    await waitFor(() => expect(utils.getByText('Join')).toBeTruthy());
    expect(utils.getByText('Not now')).toBeTruthy();

    fireEvent.press(utils.getByText('Join'));
    expect(hooks.__join).toHaveBeenCalledWith('b', expect.any(Object));
  });
});
