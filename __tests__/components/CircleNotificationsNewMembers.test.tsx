/**
 * The bell on a PUBLIC circle, for its owner (client revisions 10/14 p.9): join notifications have
 * their own toggle, "New members", on by default, and turning it off saves just that switch for
 * this circle. One render per file (React 19 leaks across sibling renders).
 */
import { render, act, fireEvent } from '@testing-library/react-native';
import { CircleNotificationsScreen } from '@features/circles/screens/CircleNotificationsScreen';
import { resolveCircleSwitches } from '@features/circles/notificationSwitches';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'owner-1' }) }));

const mockMutate = jest.fn();
jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({
    data: { id: 'c1', name: 'Book club', type: 'public', owner_id: 'owner-1' },
    isLoading: false,
  }),
  useCircleNotificationPrefs: () => ({
    // No saved row yet: every switch on, New members included.
    data: jest.requireActual('@features/circles/notificationSwitches').resolveCircleSwitches(null),
    isLoading: false,
  }),
  useUpdateCircleNotificationPrefs: () => ({ mutate: mockMutate }),
}));

it('Public owner: a "New members" switch, on by default, saved on its own', async () => {
  expect(resolveCircleSwitches(null).new_members).toBe(true);
  const utils = await render(
    <CircleNotificationsScreen
      navigation={{ goBack: jest.fn() } as never}
      route={{ params: { circleId: 'c1' } } as never}
    />,
  );

  const switches = utils.getAllByRole('switch');
  expect(switches.map((s) => s.props.accessibilityLabel)).toEqual([
    'Replies',
    'Reactions',
    'New members',
  ]);
  expect(switches.map((s) => s.props.value)).toEqual([true, true, true]);
  expect(utils.getByText('When someone joins this circle')).toBeTruthy();

  await act(async () => {
    fireEvent(switches[2]!, 'valueChange', false);
  });
  expect(mockMutate).toHaveBeenCalledTimes(1);
  expect(mockMutate).toHaveBeenCalledWith({ new_members: false });
});
