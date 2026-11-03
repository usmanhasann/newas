/**
 * Client revisions 10/14 p.5 (N7.14): the verified badge shows after a verified person's name in
 * the owner's "Requests to join" list as well as in Members. Only the OWNER's verification puts a
 * "Created by" line under the header: here the owner isn't verified (a verified member doesn't count),
 * so there is none. One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent, act, within } from '@testing-library/react-native';
import { CircleDetailScreen } from '@features/circles/screens/CircleDetailScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/circles/components/CircleFeed', () => ({ CircleFeed: () => null }));
jest.mock('@features/notifications', () => ({ notifyEvent: jest.fn() }));
jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({
    data: {
      id: 'c4',
      name: 'Family',
      type: 'private',
      owner_id: 'u1',
      description: null,
      archived_at: null,
    },
    isLoading: false,
  }),
  useMembers: () => ({
    data: [
      {
        membership: { id: 'm1', user_id: 'u1', status: 'approved', role: 'owner' },
        profile: { user_id: 'u1', display_name: 'Konah', avatar_url: null, bio: null, verified: false },
      },
      {
        membership: { id: 'm2', user_id: 'u2', status: 'approved', role: 'member' },
        profile: { user_id: 'u2', display_name: 'Sam', avatar_url: null, bio: null, verified: true },
      },
      {
        membership: { id: 'm3', user_id: 'u3', status: 'requested', role: 'member' },
        profile: { user_id: 'u3', display_name: 'Riley', avatar_url: null, bio: null, verified: true },
      },
      {
        membership: { id: 'm4', user_id: 'u4', status: 'requested', role: 'member' },
        profile: { user_id: 'u4', display_name: 'Jo', avatar_url: null, bio: null },
      },
    ],
  }),
  useSetMemberStatus: () => ({ mutate: jest.fn(), isPending: false }),
  useRemoveMember: () => ({ mutate: jest.fn(), isPending: false }),
  useLeaveCircle: () => ({ mutate: jest.fn(), isPending: false }),
  useBanUser: () => ({ mutate: jest.fn(), isPending: false }),
}));

it('badges verified requesters and members; no owner line when the owner is not verified', async () => {
  const utils = await render(
    <CircleDetailScreen
      navigation={{ navigate: jest.fn(), goBack: jest.fn() } as never}
      route={{ params: { circleId: 'c4' } } as never}
    />,
  );

  expect(utils.queryByTestId('circle-owner')).toBeNull();
  expect(utils.queryByTestId('circle-owner-byline')).toBeNull();

  await act(async () => {
    fireEvent.press(utils.getByText('Members (2)'));
  });

  // Requests to join: Riley is verified, Jo isn't.
  expect(utils.getByText('Requests to join')).toBeTruthy();
  const riley = utils.getByText(/^Riley/);
  expect(riley.children[0]).toBe('Riley');
  expect(within(riley).getByLabelText('Verified')).toBeTruthy();
  expect(within(utils.getByText('Jo')).queryByLabelText('Verified')).toBeNull();

  // Members: Sam is verified; the owner (the viewer) isn't.
  expect(within(utils.getByText(/^Sam/)).getByLabelText('Verified')).toBeTruthy();
  expect(within(utils.getByText('Konah (you)')).queryByLabelText('Verified')).toBeNull();
  expect(utils.getAllByLabelText('Verified')).toHaveLength(2);
});
