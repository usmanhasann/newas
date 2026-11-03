/**
 * Tapping a "new members" notification opens the circle on its Members tab (client revisions 10/14
 * p.9): CircleDetail takes `tab: 'members'`. An active circle shows no archived label and keeps its
 * invite button. One render per file.
 */
import { render, fireEvent } from '@testing-library/react-native';
import { CircleDetailScreen } from '@features/circles/screens/CircleDetailScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
const mockFeed = jest.fn();
jest.mock('@features/circles/components/CircleFeed', () => ({
  CircleFeed: () => {
    mockFeed();
    return null;
  },
}));
jest.mock('@features/notifications', () => ({ notifyEvent: jest.fn() }));
jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({
    data: {
      id: 'c1',
      name: 'Book club',
      type: 'public',
      owner_id: 'u1',
      description: 'We read.',
      archived_at: null,
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
        profile: { user_id: 'u2', display_name: 'Ana', avatar_url: null, bio: null },
      },
    ],
  }),
  useSetMemberStatus: () => ({ mutate: jest.fn(), isPending: false }),
  useRemoveMember: () => ({ mutate: jest.fn(), isPending: false }),
  useLeaveCircle: () => ({ mutate: jest.fn(), isPending: false }),
  useBanUser: () => ({ mutate: jest.fn(), isPending: false }),
}));

it('opens on Members when asked, and an active circle has no archived label', async () => {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const utils = await render(
    <CircleDetailScreen
      navigation={navigation as never}
      route={{ params: { circleId: 'c1', tab: 'members' } } as never}
    />,
  );

  // The Members list shows straight away (the feed isn't rendered).
  expect(utils.getByText('Ana')).toBeTruthy();
  expect(mockFeed).not.toHaveBeenCalled();

  // Active: no label, the invite button is there.
  expect(utils.queryByText('This circle has been archived.')).toBeNull();
  expect(utils.queryByTestId('circle-archived-label')).toBeNull();
  await fireEvent.press(utils.getByLabelText('Invite people'));
  expect(navigation.navigate).toHaveBeenCalledWith('Invite', { circleId: 'c1' });

  // The tabs still switch as before.
  await fireEvent.press(utils.getByText('Feed'));
  expect(mockFeed).toHaveBeenCalled();
});
