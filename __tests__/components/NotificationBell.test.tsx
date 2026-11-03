/**
 * The bell at the top right of the Journal tab: a dot while anything is unread, checked again each
 * time the tab shows, and a tap opens the list.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { fireEvent, render } from '@testing-library/react-native';
import { NotificationBell } from '@features/notifications/components/NotificationBell';

const mockRefetch = jest.fn();
let mockUnread = true;
jest.mock('@react-navigation/native', () => ({
  // Runs the focus callback straight away, as when the Journal tab shows.
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(cb, [cb]);
  },
}));
jest.mock('@features/notifications/hooks', () => ({
  useHasUnreadNotifications: () => ({ data: mockUnread, refetch: mockRefetch }),
}));

it('shows the dot while something is unread, re-checks on focus, and opens the list', async () => {
  const onPress = jest.fn();
  const utils = await render(<NotificationBell onPress={onPress} />);
  expect(utils.getByTestId('notification-bell-dot')).toBeTruthy();
  expect(utils.getByLabelText('Notifications, new')).toBeTruthy();
  expect(mockRefetch).toHaveBeenCalled();

  fireEvent.press(utils.getByLabelText('Notifications, new'));
  expect(onPress).toHaveBeenCalledTimes(1);

  mockUnread = false;
  await utils.rerender(<NotificationBell onPress={onPress} />);
  expect(utils.queryByTestId('notification-bell-dot')).toBeNull();
  expect(utils.getByLabelText('Notifications')).toBeTruthy();
});
