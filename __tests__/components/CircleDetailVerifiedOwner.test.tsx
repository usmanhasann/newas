/**
 * Client revisions 10/14 p.5 (N7.14 / N7.17): a circle owned by a VERIFIED person names them under
 * the header, "Created by [Name]" with the purple badge right after the name, for everyone in it.
 * In the member list each verified person's badge comes right after their name (before "(you)").
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent, act, within } from '@testing-library/react-native';
import { CircleDetailScreen } from '@features/circles/screens/CircleDetailScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u2' }) }));
jest.mock('@features/circles/components/CircleFeed', () => ({ CircleFeed: () => null }));
jest.mock('@features/notifications', () => ({ notifyEvent: jest.fn() }));
jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({
    data: {
      id: 'c3',
      name: 'Taylor’s Fans',
      type: 'public',
      owner_id: 'u1',
      description: 'Talk about the tour.',
      archived_at: null,
    },
    isLoading: false,
  }),
  useMembers: () => ({
    data: [
      {
        membership: { id: 'm1', user_id: 'u1', status: 'approved', role: 'owner' },
        profile: { user_id: 'u1', display_name: 'Taylor', avatar_url: null, bio: null, verified: true },
      },
      {
        membership: { id: 'm2', user_id: 'u2', status: 'approved', role: 'member' },
        profile: { user_id: 'u2', display_name: 'Auguste', avatar_url: null, bio: null, verified: true },
      },
      {
        membership: { id: 'm3', user_id: 'u3', status: 'approved', role: 'member' },
        profile: { user_id: 'u3', display_name: 'Sam', avatar_url: null, bio: null },
      },
    ],
  }),
  useSetMemberStatus: () => ({ mutate: jest.fn(), isPending: false }),
  useRemoveMember: () => ({ mutate: jest.fn(), isPending: false }),
  useLeaveCircle: () => ({ mutate: jest.fn(), isPending: false }),
  useBanUser: () => ({ mutate: jest.fn(), isPending: false }),
}));

it('names the verified owner under the header and badges verified members after their names', async () => {
  const utils = await render(
    <CircleDetailScreen
      navigation={{ navigate: jest.fn(), goBack: jest.fn() } as never}
      route={{ params: { circleId: 'c3' } } as never}
    />,
  );

  // Header: "Created by Taylor" + badge, under the description and above the tabs.
  const ownerLine = within(utils.getByTestId('circle-owner')).getByTestId('circle-owner-byline');
  expect(ownerLine.children[0]).toBe('Created by Taylor ');
  expect(within(ownerLine).getByLabelText('Verified')).toBeTruthy();
  const tree = JSON.stringify(utils.toJSON());
  expect(tree.indexOf('Talk about the tour.')).toBeLessThan(tree.indexOf('Created by Taylor'));
  expect(tree.indexOf('Created by Taylor')).toBeLessThan(tree.indexOf('Members (3)'));

  await act(async () => {
    fireEvent.press(utils.getByText('Members (3)'));
  });

  // The owner's row: the badge right after the name.
  const owner = utils.getByText(/^Taylor\s*$/); // not the circle name, “Taylor’s Fans”
  expect(owner.children[0]).toBe('Taylor');
  expect(within(owner).getByLabelText('Verified')).toBeTruthy();

  // The viewer's own row: name, badge, then "(you)".
  const self = utils.getByText(/^Auguste/);
  const badge = within(self).getByLabelText('Verified');
  expect(self.children).toEqual(['Auguste', ' ', badge, ' (you)']);

  // Not verified: no badge.
  expect(within(utils.getByText('Sam')).queryByLabelText('Verified')).toBeNull();
  expect(utils.getAllByLabelText('Verified')).toHaveLength(3); // header + Taylor + Auguste
});
