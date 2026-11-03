/**
 * Client 10/14 p.17, the member's ••• menu: it closes on a tap outside it and on a second ••• tap;
 * "Leave circle" stays reachable by screen readers (the tap-outside layer is not its parent); and a
 * leave that fails says so instead of doing nothing.
 * One render per file (React 19 leaks across sibling renders).
 */
import { Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { CircleDetailScreen } from '@features/circles/screens/CircleDetailScreen';

const mockLeave = jest.fn();
jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u2' }) }));
jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() } }));
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
type Node = { props: Record<string, unknown>; parent: Node | null };

it('closes on an outside tap or a second ••• tap, is reachable by screen readers, and reports a failed leave', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const toast = (jest.requireMock('@store/toast') as { toast: { error: jest.Mock } }).toast;
  const utils = await render(
    <CircleDetailScreen
      navigation={{ navigate: jest.fn(), goBack: jest.fn() } as never}
      route={{ params: { circleId: 'c1' } } as never}
    />,
  );

  // A tap outside closes it.
  await fireEvent.press(utils.getByLabelText('Circle options'));
  expect(utils.getByRole('menuitem')).toBeTruthy();
  await fireEvent.press(utils.getByTestId('circle-menu-backdrop', { includeHiddenElements: true }));
  expect(utils.queryByRole('menuitem')).toBeNull();

  // A second ••• tap closes it too.
  await fireEvent.press(utils.getByLabelText('Circle options'));
  // (While the menu is open, screen readers stay inside it; a sighted tap on ••• still closes it.)
  await fireEvent.press(utils.getByLabelText('Circle options', { includeHiddenElements: true }));
  expect(utils.queryByRole('menuitem')).toBeNull();

  // Screen readers reach the item: no ancestor is a single accessible element.
  await fireEvent.press(utils.getByLabelText('Circle options'));
  const item = utils.getByRole('menuitem') as unknown as Node;
  for (let n = item.parent; n; n = n.parent) {
    expect(n.props.accessible === true && n.props.accessibilityRole !== 'menu').toBe(false);
  }
  expect(utils.getByTestId('circle-menu-backdrop', { includeHiddenElements: true }).props.accessible).toBe(false);

  // A leave that fails says so.
  await fireEvent.press(utils.getByRole('menuitem'));
  const buttons = alert.mock.calls[0]?.[2] as AlertButton[];
  buttons.find((b) => b.text === 'Leave')?.onPress?.();
  const opts = mockLeave.mock.calls[0]?.[1] as { onError?: () => void };
  opts.onError?.();
  expect(toast.error).toHaveBeenCalledWith('Couldn’t leave the circle. Try again.');
});
