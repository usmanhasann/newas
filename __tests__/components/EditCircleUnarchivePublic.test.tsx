/**
 * Circle settings for the owner of an ARCHIVED Public circle with 7 members. Client revisions 10/14
 * p.23: owners can unarchive from Circle Settings, and "Archive circle" becomes "Unarchive circle".
 * Unarchiving asks first, says what comes back, and tells the owner if it failed.
 * One render per file (React 19 leaks across sibling renders).
 */
import { Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { EditCircleScreen } from '@features/circles/screens/EditCircleScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'owner-1' }) }));
const mockToastError = jest.fn();
jest.mock('@store/toast', () => ({
  toast: { success: jest.fn(), error: (m: string) => mockToastError(m) },
}));

const mockArchive = jest.fn();
const mockUnarchive = jest.fn();
jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({
    data: {
      id: 'c1',
      name: 'Runners',
      type: 'public',
      owner_id: 'owner-1',
      description: 'People who run.',
      member_count: 7,
      archived_at: '2026-10-20T09:00:00Z',
    },
    isLoading: false,
    refetch: jest.fn(),
  }),
  useUpdateCircle: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useArchiveCircle: () => ({ mutate: mockArchive, isPending: false }),
  useUnarchiveCircle: () => ({ mutate: mockUnarchive, isPending: false }),
  useDeleteCircle: () => ({ mutate: jest.fn(), isPending: false }),
}));

type AlertButton = { text?: string; style?: string; onPress?: () => void };

it('archived Public circle: "Unarchive circle" in place of Archive, and it asks first', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const utils = await render(
    <EditCircleScreen
      navigation={{ goBack: jest.fn(), popToTop: jest.fn() } as never}
      route={{ params: { circleId: 'c1' } } as never}
    />,
  );

  expect(utils.getByText('Unarchive circle')).toBeTruthy();
  expect(utils.queryByText('Archive circle')).toBeNull();
  expect(utils.queryByText('Delete circle')).toBeNull(); // 5 or more members

  await fireEvent.press(utils.getByText('Unarchive circle'));
  const [title, message, buttons] = alert.mock.calls.at(-1)! as [string, string, AlertButton[]];
  expect(title).toBe('Unarchive circle?');
  expect(message).toBe(
    'Members can post and reply again, new people can join, and it shows up in Discover again. Everyone in it will be told.',
  );
  expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Unarchive']);
  expect(mockUnarchive).not.toHaveBeenCalled();
  buttons[1]!.onPress!();
  expect(mockUnarchive).toHaveBeenCalledWith('c1', expect.anything());
  expect(mockArchive).not.toHaveBeenCalled();

  // If it fails, the owner is told.
  const callbacks = mockUnarchive.mock.calls[0]![1] as { onError: () => void };
  callbacks.onError();
  expect(mockToastError).toHaveBeenCalledWith('Couldn’t unarchive the circle. Try again.');
});
