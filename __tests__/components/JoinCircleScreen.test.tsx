/**
 * Join a Circle — "Join with a code" + "Discover circles" combined on one page. Joining must work
 * exactly as it did on the two old screens:
 * - Invite Code card: a PUBLIC code joins 'approved' → open the circle; a PRIVATE code joins
 *   'requested' → "pending approval" message + go back (never into a circle that would render
 *   "unavailable"); a non-match shows an inline error; an unverified email account is sent to the
 *   verify gate with the code.
 * - Discover Circles: the 5 most popular public circles (most members first) listed directly, the
 *   arrow opens the full list, a joined circle opens, any other asks Join / Not now first.
 */
import { render, fireEvent, act, waitFor, cleanup } from '@testing-library/react-native';
import { JoinCircleScreen } from '@features/circles/screens/JoinCircleScreen';
import type { JoinByCodeResult } from '@features/circles/api';

let mockIdentities = [{ provider: 'apple' }];
jest.mock('@store/session', () => ({
  useCurrentUser: () => ({ id: 'u1', identities: mockIdentities }),
}));
let mockVerified = true;
jest.mock('@features/email-verification', () => ({
  useEmailVerified: () => ({ data: mockVerified }),
  checkVerified: () => Promise.resolve(mockVerified),
}));

const mockToastSuccess = jest.fn();
jest.mock('@store/toast', () => ({
  toast: { success: (m: string) => mockToastSuccess(m), error: jest.fn() },
}));

let mockJoinResult: JoinByCodeResult | null = null;
const mockJoinByCode = jest.fn(() => Promise.resolve(mockJoinResult));
let mockPublic: unknown[] = [];
let mockMine: unknown[] = [];
const mockJoinCircle = jest.fn();
jest.mock('@features/circles/hooks', () => ({
  useJoinByCode: () => ({ mutateAsync: mockJoinByCode, isPending: false }),
  usePublicCircles: () => ({ data: mockPublic, isLoading: false }),
  useMyCircles: () => ({ data: mockMine }),
  useJoinCircle: () => ({ mutate: mockJoinCircle, isPending: false }),
}));
// No verified owners here (DiscoverVerifiedOwner.test covers the "Created by" line).
jest.mock('@features/circles/ownersHooks', () => ({ useVerifiedCircleOwners: () => new Map() }));

const circle = (id: string, member_count: number) => ({
  id,
  name: `Circle ${id}`,
  description: null,
  member_count,
  type: 'public',
  archived_at: null,
});

async function setup() {
  const navigation = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };
  const utils = await render(
    <JoinCircleScreen navigation={navigation as never} route={{ params: {} } as never} />,
  );
  return { navigation, ...utils };
}

async function enterAndJoin(utils: Awaited<ReturnType<typeof setup>>) {
  // changeText in its own act so the `code` state flushes before the button's onPress reads it.
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText('e.g. A1B2C3D4'), 'ABC123');
  });
  await act(async () => {
    fireEvent.press(utils.getByText('Join Circle'));
  });
}

beforeEach(() => {
  mockIdentities = [{ provider: 'apple' }];
  mockVerified = true;
  mockJoinResult = null;
  mockPublic = [];
  mockMine = [];
  mockToastSuccess.mockReset();
  mockJoinByCode.mockClear();
  mockJoinCircle.mockReset();
});

afterEach(cleanup);

describe('<JoinCircleScreen /> — Invite Code card (join-by-code unchanged)', () => {
  it('approved (public) join opens the circle', async () => {
    mockJoinResult = { circleId: 'c1', status: 'approved', name: 'Runners' };
    const utils = await setup();
    expect(utils.getByText('Invite Code')).toBeTruthy();
    await enterAndJoin(utils);
    await waitFor(() =>
      expect(utils.navigation.replace).toHaveBeenCalledWith('CircleDetail', {
        circleId: 'c1',
      }),
    );
    expect(utils.navigation.goBack).not.toHaveBeenCalled();
  });

  it('requested (private) join shows a pending message and goes back — never opens the circle', async () => {
    mockJoinResult = { circleId: 'c2', status: 'requested', name: 'Inner' };
    const utils = await setup();
    await enterAndJoin(utils);
    await waitFor(() => expect(utils.navigation.goBack).toHaveBeenCalled());
    expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('Inner'));
    expect(utils.navigation.replace).not.toHaveBeenCalled();
  });

  it('a non-matching code shows an inline error and stays put', async () => {
    mockJoinResult = null;
    const utils = await setup();
    await enterAndJoin(utils);
    await waitFor(() => expect(utils.getByText(/didn’t match a circle/)).toBeTruthy());
    expect(utils.navigation.replace).not.toHaveBeenCalled();
    expect(utils.navigation.goBack).not.toHaveBeenCalled();
  });

  it('a server failure shows a clear error instead of failing silently', async () => {
    mockJoinByCode.mockImplementationOnce(() => Promise.reject(new Error('42804')));
    const utils = await setup();
    await enterAndJoin(utils);
    await waitFor(() => expect(utils.getByText(/couldn’t join that circle/)).toBeTruthy());
    expect(utils.navigation.replace).not.toHaveBeenCalled();
    expect(utils.navigation.goBack).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('an unverified email account goes to the verify gate with the code (no join yet)', async () => {
    mockIdentities = [{ provider: 'email' }];
    mockVerified = false;
    const utils = await setup();
    await enterAndJoin(utils);
    await waitFor(() =>
      expect(utils.navigation.navigate).toHaveBeenCalledWith('VerifyEmailToJoin', {
        code: 'ABC123',
      }),
    );
    expect(mockJoinByCode).not.toHaveBeenCalled();
  });
});

describe('<JoinCircleScreen /> — Discover Circles section', () => {
  it('lists the top 5 by members, arrow opens the full list, joined opens, others ask to join', async () => {
    mockPublic = [
      circle('A', 3),
      circle('B', 50),
      circle('C', 7),
      circle('D', 1),
      circle('E', 20),
      circle('F', 99),
      circle('G', 12),
    ];
    mockMine = [{ id: 'E' }];
    const utils = await setup();

    expect(utils.getByText('Discover Circles')).toBeTruthy();
    const names = utils.getAllByText(/^Circle [A-G]$/).map((n) => n.props.children);
    expect(names).toEqual(['Circle F', 'Circle B', 'Circle E', 'Circle G', 'Circle C']);

    fireEvent.press(utils.getByLabelText('View all public circles'));
    expect(utils.navigation.navigate).toHaveBeenCalledWith('Discover');

    // Already a member → straight into the circle.
    fireEvent.press(utils.getByText('Circle E'));
    expect(utils.navigation.navigate).toHaveBeenCalledWith('CircleDetail', {
      circleId: 'E',
    });

    // Not a member → Join / Not now popup; Join joins, then opens the circle.
    fireEvent.press(utils.getByText('Circle F'));
    await waitFor(() => expect(utils.getByText('Not now')).toBeTruthy());
    fireEvent.press(utils.getByText('Join'));
    expect(mockJoinCircle).toHaveBeenCalledWith('F', expect.any(Object));
    await act(async () => {
      (mockJoinCircle.mock.calls[0]![1] as { onSuccess: () => void }).onSuccess();
    });
    expect(utils.navigation.navigate).toHaveBeenCalledWith('CircleDetail', {
      circleId: 'F',
    });
  });
});
