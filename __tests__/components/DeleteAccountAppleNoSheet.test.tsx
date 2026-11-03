/**
 * Delete Account for a Sign in with Apple account where Apple's sheet isn't available (Android):
 * deletion still works (the server logs that it couldn't revoke), with no Apple step or message.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { DeleteAccountScreen } from '@features/profile';

const mockMutate = jest.fn();
const mockConfirm = jest.fn();
jest.mock('@store/session', () => ({
  useCurrentUser: () => ({ id: 'u1', identities: [{ provider: 'apple', identity_data: { sub: 's1' } }] }),
}));
jest.mock('@features/auth', () => ({
  useDeleteAccount: () => ({ mutate: mockMutate, isPending: false }),
  isAppleAuthAvailable: () => Promise.resolve(false),
  confirmAppleForDeletion: () => mockConfirm(),
  isUserCanceledSignIn: () => false,
}));
jest.mock('@store/toast', () => ({ toast: { error: jest.fn(), info: jest.fn(), success: jest.fn() } }));

it('deletes without an Apple step when Apple’s sheet isn’t available', async () => {
  const nav = { goBack: jest.fn(), navigate: jest.fn() };
  const utils = await render(<DeleteAccountScreen navigation={nav as never} route={{} as never} />);
  await act(async () => fireEvent.changeText(utils.getByPlaceholderText('delete'), 'delete'));
  await act(async () => fireEvent.press(utils.getByText('Delete my account')));
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
  expect(mockMutate.mock.calls[0][0]).toBeUndefined();
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(utils.queryByText(/confirm with Apple next/)).toBeNull();
});
