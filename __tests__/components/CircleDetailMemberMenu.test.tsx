/**
 * Client revisions 10/14, p.17: a member who isn't the owner gets a ••• button where the owner sees
 * the Circle Settings gear. It opens a small menu with "Leave circle" (red), which asks
 * "Leave [circle name]?" with Leave and Cancel; a Private circle adds "You’ll need a new invite to
 * rejoin." Also p.29: a Private circle never shows its description at the top.
 * One render per file (React 19 leaks across sibling renders).
 */
import { Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { CircleDetailScreen } from '@features/circles/screens/CircleDetailScreen';

const mockLeave = jest.fn();
jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u2' }) }));
// The feed tab has its own tests; this file is about the page around it.
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
      description: 'Old text from before descriptions were Public only.',
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
        profile: { user_id: 'u2', display_name: 'Auguste', avatar_url: null, bio: null },
      },
    ],
  }),
  useSetMemberStatus: () => ({ mutate: jest.fn(), isPending: false }),
  useRemoveMember: () => ({ mutate: jest.fn(), isPending: false }),
  useLeaveCircle: () => ({ mutate: mockLeave, isPending: false }),
  useBanUser: () => ({ mutate: jest.fn(), isPending: false }),
}));

type AlertButton = { text?: string; style?: string; onPress?: () => void };

it('a member’s ••• opens "Leave circle", which confirms with the circle’s name before leaving', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const utils = await render(
    <CircleDetailScreen
      navigation={navigation as never}
      route={{ params: { circleId: 'c1' } } as never}
    />,
  );

  // The ••• sits where the owner's gear would be; no gear for a member.
  expect(utils.queryByLabelText('Circle settings')).toBeNull();
  // Private: no description line at the top.
  expect(utils.queryByTestId('circle-description')).toBeNull();
  expect(utils.queryByText('Old text from before descriptions were Public only.')).toBeNull();

  // Closed until tapped.
  expect(utils.queryByRole('menuitem')).toBeNull();
  await fireEvent.press(utils.getByLabelText('Circle options'));
  const item = utils.getByRole('menuitem');
  const label = utils.getByText('Leave circle');
  expect(label.props.className).toContain('text-danger-strong'); // red

  await fireEvent.press(item);
  // The menu closes and the confirmation asks first.
  expect(utils.queryByRole('menuitem')).toBeNull();
  expect(alert).toHaveBeenCalledTimes(1);
  const [title, message, buttons] = alert.mock.calls[0] as [string, string, AlertButton[]];
  expect(title).toBe('Leave Family?');
  expect(message).toBe('You’ll need a new invite to rejoin.');
  expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Leave']);
  expect(buttons[0].style).toBe('cancel');
  expect(mockLeave).not.toHaveBeenCalled();

  buttons[1].onPress!();
  expect(mockLeave).toHaveBeenCalledWith('c1', expect.anything());
  // Gone from the circle: back to the list.
  const opts = mockLeave.mock.calls[0][1] as { onSuccess: () => void };
  opts.onSuccess();
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});
