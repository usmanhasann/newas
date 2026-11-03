/**
 * Client revisions 10/14, p.29: the Circle Settings description stops at 150 characters, with a live
 * counter right below the box that starts from the saved description's length.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent } from '@testing-library/react-native';
import { EditCircleScreen } from '@features/circles/screens/EditCircleScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'owner-1' }) }));
jest.mock('@store/toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({
    data: {
      id: 'c1',
      name: 'Runners',
      type: 'public',
      owner_id: 'owner-1',
      description: 'People who run and journal.',
      member_count: 3,
      archived_at: null,
    },
    isLoading: false,
    refetch: jest.fn(),
  }),
  useUpdateCircle: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useArchiveCircle: () => ({ mutate: jest.fn(), isPending: false }),
  useUnarchiveCircle: () => ({ mutate: jest.fn(), isPending: false }),
  useDeleteCircle: () => ({ mutate: jest.fn(), isPending: false }),
}));

it('Circle Settings description: capped at 150, counter counts the saved text and updates live', async () => {
  const navigation = { goBack: jest.fn(), popToTop: jest.fn() };
  const utils = await render(
    <EditCircleScreen navigation={navigation as never} route={{ params: { circleId: 'c1' } } as never} />,
  );

  const field = utils.getByDisplayValue('People who run and journal.');
  expect(field.props.maxLength).toBe(150);
  const counter = utils.getByText('27/150');
  expect(String(counter.props.className)).toContain('text-right');

  await fireEvent.changeText(field, 'Morning miles.');
  expect(utils.getByText('14/150')).toBeTruthy();
  expect(utils.queryByText('27/150')).toBeNull();
});
