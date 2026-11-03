/**
 * One circle's own notification switches (the bell on the circle's page). Rendered as the OWNER of
 * a PRIVATE circle — the case with the most switches — to prove: the right switches for this circle
 * (incl. owner-only Join Requests, no Public-only New Prompts), saved values shown, and a flip saves
 * just that switch for this circle. Which switches each role/type gets is covered by
 * circleNotificationSwitches.test. One render per file (React 19 leaks across sibling renders).
 */
import { render, act, fireEvent } from '@testing-library/react-native';
import { CircleNotificationsScreen } from '@features/circles/screens/CircleNotificationsScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'owner-1' }) }));

const mockMutate = jest.fn();
jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({
    data: { id: 'c1', name: 'Family', type: 'private', owner_id: 'owner-1' },
    isLoading: false,
  }),
  useCircleNotificationPrefs: () => ({
    data: {
      replies: true,
      reactions: false,
      new_prompts: true,
      new_posts: true,
      new_entries: true,
      join_requests: true,
    },
    isLoading: false,
  }),
  useUpdateCircleNotificationPrefs: () => ({ mutate: mockMutate }),
}));

it('shows this circle’s switches for its owner and saves a flip for this circle only', async () => {
  const goBack = jest.fn();
  const utils = await render(
    <CircleNotificationsScreen
      navigation={{ goBack } as never}
      route={{ params: { circleId: 'c1' } } as never}
    />,
  );

  expect(utils.getByText(/Choose what Family notifies you about/)).toBeTruthy();
  const titles = [
    'Replies',
    'Reactions',
    'Join Requests',
    'New Shared Entries',
    'New Posts',
  ];
  for (const t of titles) expect(utils.getByText(t)).toBeTruthy();
  expect(utils.queryByText('New Prompts')).toBeNull(); // Public-only

  const switches = utils.getAllByRole('switch');
  expect(switches.map((s) => s.props.accessibilityLabel)).toEqual(titles);
  expect(switches.map((s) => s.props.value)).toEqual([true, false, true, true, true]);

  await act(async () => {
    fireEvent(switches[1]!, 'valueChange', true); // Reactions back on
    fireEvent(switches[2]!, 'valueChange', false); // Join Requests off
  });
  expect(mockMutate).toHaveBeenNthCalledWith(1, { reactions: true });
  expect(mockMutate).toHaveBeenNthCalledWith(2, { join_requests: false });

  fireEvent.press(utils.getByLabelText('Go back'));
  expect(goBack).toHaveBeenCalledTimes(1);
});
