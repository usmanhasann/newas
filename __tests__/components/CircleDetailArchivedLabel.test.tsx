/**
 * An archived circle's page (client revisions 10/14 p.23): a small label at the top reads exactly
 * "This circle has been archived.", for everyone in it (here a member of a Public circle). No one
 * new can join an archived circle, so the invite button is gone. One render per file.
 */
import { render } from '@testing-library/react-native';
import { CircleDetailScreen } from '@features/circles/screens/CircleDetailScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u2' }) }));
jest.mock('@features/circles/components/CircleFeed', () => ({ CircleFeed: () => null }));
jest.mock('@features/notifications', () => ({ notifyEvent: jest.fn() }));
jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({
    data: {
      id: 'c9',
      name: 'Runners',
      type: 'public',
      owner_id: 'u1',
      description: null,
      archived_at: '2026-10-20T09:00:00Z',
    },
    isLoading: false,
  }),
  useMembers: () => ({
    data: [
      {
        membership: { id: 'm1', user_id: 'u1', status: 'approved', role: 'owner' },
        profile: { user_id: 'u1', display_name: 'Konah', avatar_url: null, bio: null },
      },
      {
        membership: { id: 'm2', user_id: 'u2', status: 'approved', role: 'member' },
        profile: { user_id: 'u2', display_name: 'Auguste', avatar_url: null, bio: null },
      },
    ],
  }),
  useSetMemberStatus: () => ({ mutate: jest.fn(), isPending: false }),
  useRemoveMember: () => ({ mutate: jest.fn(), isPending: false }),
  useLeaveCircle: () => ({ mutate: jest.fn(), isPending: false }),
  useBanUser: () => ({ mutate: jest.fn(), isPending: false }),
}));

it('archived: the label at the top, word for word, and no invite button', async () => {
  const utils = await render(
    <CircleDetailScreen
      navigation={{ navigate: jest.fn(), goBack: jest.fn() } as never}
      route={{ params: { circleId: 'c9' } } as never}
    />,
  );

  const label = utils.getByTestId('circle-archived-label');
  expect(utils.getByText('This circle has been archived.')).toBeTruthy();
  // It sits in the header, above the Feed / Members tabs.
  const tree = JSON.stringify(utils.toJSON());
  expect(tree.indexOf('This circle has been archived.')).toBeLessThan(tree.indexOf('Members (2)'));
  expect(label).toBeTruthy();

  expect(utils.queryByLabelText('Invite people')).toBeNull();
  // Members still have their bell and the ••• menu (leaving stays possible).
  expect(utils.getByLabelText('Notification settings')).toBeTruthy();
  expect(utils.getByLabelText('Circle options')).toBeTruthy();
});
