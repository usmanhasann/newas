/**
 * The circle page's bell opens THAT circle's notification switches, for anyone in the circle. The
 * old single "New post notifications" switch in the Members tab is gone (it's one of the switches
 * behind the bell now). One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent, act } from '@testing-library/react-native';
import { CircleDetailScreen } from '@features/circles/screens/CircleDetailScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u2' }) }));
// The feed tab has its own tests (CircleFeed.test); this file is about the page around it.
jest.mock('@features/circles/components/CircleFeed', () => ({ CircleFeed: () => null }));
jest.mock('@features/notifications', () => ({ notifyEvent: jest.fn() }));
jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({
    data: {
      id: 'c1',
      name: 'Family',
      type: 'private',
      owner_id: 'u1',
      invite_code: 'ABC123',
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
  useArchiveCircle: () => ({ mutate: jest.fn(), isPending: false }),
}));

it('a member’s bell opens this circle’s notification switches; the old mute card is gone', async () => {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const utils = await render(
    <CircleDetailScreen
      navigation={navigation as never}
      route={{ params: { circleId: 'c1' } } as never}
    />,
  );

  fireEvent.press(utils.getByLabelText('Notification settings'));
  expect(navigation.navigate).toHaveBeenCalledWith('CircleNotifications', {
    circleId: 'c1',
  });

  await act(async () => {
    fireEvent.press(utils.getByText('Members (2)'));
  });
  expect(utils.queryByText('New post notifications')).toBeNull();
});
