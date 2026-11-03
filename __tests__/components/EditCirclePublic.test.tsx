/**
 * Circle settings for the owner of a PUBLIC circle with 7 members (client spec 2026-09-29): name
 * AND description (Public only), and exactly one end button: Archive (5 or more members, so no
 * Delete). Saving sends both fields; Archive asks first.
 * One render per file (React 19 leaks across sibling renders).
 */
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { EditCircleScreen } from '@features/circles/screens/EditCircleScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'owner-1' }) }));
jest.mock('@store/toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockSave = jest.fn(() => Promise.resolve());
const mockArchive = jest.fn();
jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({
    data: {
      id: 'c1',
      name: 'Runners',
      type: 'public',
      owner_id: 'owner-1',
      description: 'People who run and journal.',
      member_count: 7,
      archived_at: null,
    },
    isLoading: false,
    refetch: jest.fn(),
  }),
  useUpdateCircle: () => ({ mutateAsync: mockSave, isPending: false }),
  useArchiveCircle: () => ({ mutate: mockArchive, isPending: false }),
  useUnarchiveCircle: () => ({ mutate: jest.fn(), isPending: false }),
  useDeleteCircle: () => ({ mutate: jest.fn(), isPending: false }),
}));

type AlertButton = { text?: string; style?: string; onPress?: () => void };

it('public with 7 members: edits name + description, and offers Archive only', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  const navigation = { goBack: jest.fn(), popToTop: jest.fn() };
  const utils = await render(
    <EditCircleScreen navigation={navigation as never} route={{ params: { circleId: 'c1' } } as never} />,
  );

  expect(utils.getByText('Description')).toBeTruthy();
  expect(utils.getByDisplayValue('People who run and journal.')).toBeTruthy();
  expect(utils.queryByText(/Reflection tone/i)).toBeNull();
  expect(utils.getByText('Archive circle')).toBeTruthy();
  expect(utils.queryByText('Delete circle')).toBeNull(); // 5 or more members

  await act(async () => {
    fireEvent.changeText(utils.getByDisplayValue('Runners'), 'Runners Club');
    fireEvent.changeText(utils.getByDisplayValue('People who run and journal.'), 'Morning miles.');
  });
  await act(async () => {
    fireEvent.press(utils.getByText('Save'));
  });
  expect(mockSave).toHaveBeenCalledWith({ name: 'Runners Club', description: 'Morning miles.' });
  expect(navigation.goBack).toHaveBeenCalledTimes(1);

  fireEvent.press(utils.getByText('Archive circle'));
  const [title, , buttons] = alert.mock.calls.at(-1)! as [string, string, AlertButton[]];
  expect(title).toBe('Archive circle?');
  expect(mockArchive).not.toHaveBeenCalled();
  buttons.find((b) => b.text === 'Archive')!.onPress!();
  expect(mockArchive).toHaveBeenCalledWith('c1', expect.anything());
});
