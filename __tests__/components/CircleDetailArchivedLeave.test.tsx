/**
 * Client revisions 10/14: a member can still leave a circle after it's been archived, from both the
 * ••• menu and the Leave circle button kept at the bottom of the Members tab (p.17). A PUBLIC
 * circle's confirmation is just "Leave [circle name]?" (no second line), and its description shows
 * under the name at the top in small gray helper text (p.29). The invite code box is gone (p.29).
 * One render per file (React 19 leaks across sibling renders).
 */
import { Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { CircleDetailScreen } from '@features/circles/screens/CircleDetailScreen';

const mockLeave = jest.fn();
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
      invite_code: 'RUN999',
      description: 'People who run and journal.',
      archived_at: '2026-10-01T10:00:00Z',
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

it('archived Public circle: description under the name, and leaving works from ••• and Members', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const utils = await render(
    <CircleDetailScreen
      navigation={navigation as never}
      route={{ params: { circleId: 'c9' } } as never}
    />,
  );

  // p.29: the description sits under the name, as small gray helper text.
  const description = utils.getByText('People who run and journal.');
  expect(String(description.props.className)).toContain('text-xs');
  expect(String(description.props.className)).toContain('text-ink-soft');
  expect(utils.getByTestId('circle-description')).toBeTruthy();
  // p.29: no invite code box on the circle page.
  expect(utils.queryByText('Invite code')).toBeNull();
  expect(utils.queryByText('RUN999')).toBeNull();

  // Way 1: the ••• menu, in an ARCHIVED circle.
  await fireEvent.press(utils.getByLabelText('Circle options'));
  await fireEvent.press(utils.getByRole('menuitem'));
  const [title, message, buttons] = alert.mock.calls[0] as [string, string | undefined, AlertButton[]];
  expect(title).toBe('Leave Runners?');
  expect(message).toBeUndefined(); // Public: no second line
  expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Leave']);
  buttons[1].onPress!();
  expect(mockLeave).toHaveBeenCalledTimes(1);
  expect(mockLeave).toHaveBeenLastCalledWith('c9', expect.anything());

  // Way 2: the button kept at the bottom of the Members tab, same confirmation.
  await fireEvent.press(utils.getByText('Members (2)'));
  await fireEvent.press(utils.getByRole('button', { name: 'Leave circle' }));
  expect(alert).toHaveBeenCalledTimes(2);
  const [title2, message2, buttons2] = alert.mock.calls[1] as [
    string,
    string | undefined,
    AlertButton[],
  ];
  expect(title2).toBe('Leave Runners?');
  expect(message2).toBeUndefined();
  buttons2.find((b) => b.text === 'Leave')!.onPress!();
  expect(mockLeave).toHaveBeenCalledTimes(2);
  expect(mockLeave).toHaveBeenLastCalledWith('c9', expect.anything());
});
