/**
 * Circle settings for the owner of an ARCHIVED Private circle (client revisions 10/14 p.23):
 * "Unarchive circle" in place of "Archive circle", Delete still there (Private: any size). The
 * confirmation fits a Private circle (no Discover, no joining). One render per file.
 */
import { Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { EditCircleScreen } from '@features/circles/screens/EditCircleScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'owner-1' }) }));
jest.mock('@store/toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUnarchive = jest.fn();
jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({
    data: {
      id: 'c2',
      name: 'Family',
      type: 'private',
      owner_id: 'owner-1',
      description: null,
      member_count: 6,
      archived_at: '2026-10-20T09:00:00Z',
    },
    isLoading: false,
    refetch: jest.fn(),
  }),
  useUpdateCircle: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useArchiveCircle: () => ({ mutate: jest.fn(), isPending: false }),
  useUnarchiveCircle: () => ({ mutate: mockUnarchive, isPending: false }),
  useDeleteCircle: () => ({ mutate: jest.fn(), isPending: false }),
}));

type AlertButton = { text?: string; style?: string; onPress?: () => void };

it('archived Private circle: Unarchive and Delete', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const utils = await render(
    <EditCircleScreen
      navigation={{ goBack: jest.fn(), popToTop: jest.fn() } as never}
      route={{ params: { circleId: 'c2' } } as never}
    />,
  );

  expect(utils.getByText('Unarchive circle')).toBeTruthy();
  expect(utils.getByText('Delete circle')).toBeTruthy();
  expect(utils.queryByText('Archive circle')).toBeNull();

  await fireEvent.press(utils.getByText('Unarchive circle'));
  const [, message, buttons] = alert.mock.calls.at(-1)! as [string, string, AlertButton[]];
  expect(message).toBe('Members can post and reply again. Everyone in it will be told.');
  buttons.find((b) => b.text === 'Unarchive')!.onPress!();
  expect(mockUnarchive).toHaveBeenCalledWith('c2', expect.anything());
});
