/**
 * Circle settings for the owner of a small PUBLIC circle (3 members). Client revisions 10/14 p.23:
 * "add the same Archive option to Public Circles, in Circle Settings next to Delete circle". Before,
 * a Public circle under 5 members only offered Delete. Archive asks first and says what it does.
 * One render per file (React 19 leaks across sibling renders).
 */
import { Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { EditCircleScreen } from '@features/circles/screens/EditCircleScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'owner-1' }) }));
jest.mock('@store/toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

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
      member_count: 3,
      archived_at: null,
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

it('small Public circle: Archive circle next to Delete circle, and archiving asks first', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const utils = await render(
    <EditCircleScreen
      navigation={{ goBack: jest.fn(), popToTop: jest.fn() } as never}
      route={{ params: { circleId: 'c1' } } as never}
    />,
  );

  expect(utils.getByText('Archive circle')).toBeTruthy();
  expect(utils.getByText('Delete circle')).toBeTruthy(); // under 5 members
  expect(utils.queryByText('Unarchive circle')).toBeNull();
  // Archive sits right above Delete.
  const tree = JSON.stringify(utils.toJSON());
  expect(tree.indexOf('Archive circle')).toBeLessThan(tree.indexOf('Delete circle'));

  await fireEvent.press(utils.getByText('Archive circle'));
  const [title, message, buttons] = alert.mock.calls.at(-1)! as [string, string, AlertButton[]];
  expect(title).toBe('Archive circle?');
  expect(message).toBe(
    'Members can still read everything, but no one can post or reply, and no one new can join. It won’t show up in Discover. Everyone in it will be told.',
  );
  expect(message).not.toMatch(/[–—]| - /);
  expect(mockArchive).not.toHaveBeenCalled();
  buttons.find((b) => b.text === 'Archive')!.onPress!();
  expect(mockArchive).toHaveBeenCalledWith('c1', expect.anything());
  expect(mockUnarchive).not.toHaveBeenCalled();
});
