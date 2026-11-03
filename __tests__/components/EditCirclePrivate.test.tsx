/**
 * Circle settings for the owner of a PRIVATE circle (client spec 2026-09-29): name only (no
 * description, no reflection tone), and both Archive and Delete. Delete asks first, then deletes
 * and goes back to the circles list; if the server says no, the owner is told why.
 * One render per file (React 19 leaks across sibling renders).
 */
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { EditCircleScreen } from '@features/circles/screens/EditCircleScreen';
import { CircleTooBigToDeleteError } from '@features/circles/api';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'owner-1' }) }));
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('@store/toast', () => ({
  toast: {
    success: (m: string) => mockToastSuccess(m),
    error: (m: string) => mockToastError(m),
  },
}));

const mockSave = jest.fn(() => Promise.resolve());
const mockArchive = jest.fn();
const mockDelete = jest.fn();
const mockRefetch = jest.fn();
jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({
    data: {
      id: 'c1',
      name: 'Family',
      type: 'private',
      owner_id: 'owner-1',
      description: null,
      member_count: 6,
      archived_at: null,
    },
    isLoading: false,
    refetch: mockRefetch,
  }),
  useUpdateCircle: () => ({ mutateAsync: mockSave, isPending: false }),
  useArchiveCircle: () => ({ mutate: mockArchive, isPending: false }),
  useUnarchiveCircle: () => ({ mutate: jest.fn(), isPending: false }),
  useDeleteCircle: () => ({ mutate: mockDelete, isPending: false }),
}));

type AlertButton = { text?: string; style?: string; onPress?: () => void };

it('private: name only, Archive and Delete, and deleting asks first', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  const navigation = { goBack: jest.fn(), popToTop: jest.fn() };
  const utils = await render(
    <EditCircleScreen navigation={navigation as never} route={{ params: { circleId: 'c1' } } as never} />,
  );

  expect(utils.getByText('Circle name')).toBeTruthy();
  expect(utils.queryByText('Description')).toBeNull(); // Public circles only
  expect(utils.queryByText(/Reflection tone/i)).toBeNull(); // removed entirely
  expect(utils.getByText('Archive circle')).toBeTruthy();
  expect(utils.getByText('Delete circle')).toBeTruthy();

  // Save sends the name only (no description for a Private circle).
  await act(async () => {
    fireEvent.press(utils.getByText('Save'));
  });
  expect(mockSave).toHaveBeenCalledWith({ name: 'Family' });

  // Delete: nothing happens until they confirm.
  fireEvent.press(utils.getByText('Delete circle'));
  const [title, message, buttons] = alert.mock.calls.at(-1)! as [string, string, AlertButton[]];
  expect(title).toBe('Delete this circle?');
  expect(message).toBe(
    'The circle and everything in it will be removed for all members. This can’t be undone.',
  );
  expect(mockDelete).not.toHaveBeenCalled();
  const confirm = buttons.find((b) => b.text === 'Delete')!;
  expect(confirm.style).toBe('destructive');
  confirm.onPress!();
  expect(mockDelete).toHaveBeenCalledWith('c1', expect.anything());

  const callbacks = mockDelete.mock.calls[0]![1] as {
    onSuccess: () => void;
    onError: (e: unknown) => void;
  };
  callbacks.onSuccess();
  expect(mockToastSuccess).toHaveBeenCalledWith('Circle deleted.');
  expect(navigation.popToTop).toHaveBeenCalledTimes(1);

  // If the server refuses (a Public circle grew to 5), say why and reload the circle.
  callbacks.onError(new CircleTooBigToDeleteError());
  expect(mockToastError).toHaveBeenCalledWith(
    'This circle has 5 or more members, so it can only be archived.',
  );
  expect(mockRefetch).toHaveBeenCalledTimes(1);
  callbacks.onError(new Error('offline'));
  expect(mockToastError).toHaveBeenLastCalledWith('Couldn’t delete the circle. Try again.');
});
