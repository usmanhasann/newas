/**
 * Create Circle (client spec 2026-09-29): no reflection tone picker, and the description is for
 * Public circles only (Private ones can't be discovered, so there's nowhere to show it). A
 * description typed while Public isn't saved if the circle ends up Private.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent, act } from '@testing-library/react-native';
import { CreateCircleScreen } from '@features/circles/screens/CreateCircleScreen';

const mockCreate = jest.fn((_args: unknown) => Promise.resolve({ id: 'new-1' }));
jest.mock('@features/circles/hooks', () => ({
  useCreateCircle: () => ({ mutateAsync: mockCreate, isPending: false }),
}));

it('shows the description only for Public, and never sends one for Private', async () => {
  const navigation = { goBack: jest.fn(), replace: jest.fn() };
  const utils = await render(
    <CreateCircleScreen navigation={navigation as never} route={{} as never} />,
  );

  expect(utils.queryByText(/Reflection tone/i)).toBeNull();
  expect(utils.queryByText('Description')).toBeNull(); // Private is the default

  await act(async () => {
    fireEvent.press(utils.getByText('Public'));
  });
  expect(utils.getByText('Description')).toBeTruthy();

  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText('e.g. Close Friends'), 'Family');
    fireEvent.changeText(utils.getByPlaceholderText('What’s this circle about?'), 'Our people.');
  });

  // Switch back to Private: the field goes away and the typed description isn't saved.
  await act(async () => {
    fireEvent.press(utils.getByText('Private'));
  });
  expect(utils.queryByText('Description')).toBeNull();

  await act(async () => {
    fireEvent.press(utils.getByRole('button', { name: 'Create Circle' })); // not the page title
  });
  expect(mockCreate).toHaveBeenCalledWith({ name: 'Family', type: 'private', description: null });
  expect(navigation.replace).toHaveBeenCalledWith('CircleDetail', { circleId: 'new-1' });
});
