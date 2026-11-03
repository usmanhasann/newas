/**
 * Delete Account for a Sign in with Apple account on iPhone (App Store rule: revoke Sign in with
 * Apple on deletion; approach decided 2026-10-16): the user confirms with Apple once and its
 * one-time code goes with the delete request. Apple never stops a deletion (App Store 5.1.1(v)):
 * if Apple's sheet fails, the deletion goes ahead without it; if the user dismisses it, that attempt
 * stops and "Delete without confirming with Apple" appears (e.g. no Apple ID signed in on the phone).
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { DeleteAccountScreen } from '@features/profile';

const mockMutate = jest.fn();
const mockConfirm = jest.fn();
const mockToastError = jest.fn();
jest.mock('@store/session', () => ({
  useCurrentUser: () => ({ id: 'u1', identities: [{ provider: 'apple', identity_data: { sub: 's1' } }] }),
}));
jest.mock('@features/auth', () => ({
  useDeleteAccount: () => ({ mutate: mockMutate, isPending: false }),
  isAppleAuthAvailable: () => Promise.resolve(true),
  confirmAppleForDeletion: () => mockConfirm(),
  isUserCanceledSignIn: (e: { code?: string }) => e?.code === 'ERR_REQUEST_CANCELED',
}));
jest.mock('@store/toast', () => ({ toast: { error: (m: string) => mockToastError(m), info: jest.fn(), success: jest.fn() } }));

const WITHOUT_APPLE = 'Delete without confirming with Apple';

it('confirms with Apple and sends its code; Apple can never block the deletion', async () => {
  const nav = { goBack: jest.fn(), navigate: jest.fn() };
  const utils = await render(<DeleteAccountScreen navigation={nav as never} route={{} as never} />);
  expect(
    await utils.findByText('Your account uses Sign in with Apple, so you’ll confirm with Apple next.'),
  ).toBeTruthy();
  expect(utils.queryByText(WITHOUT_APPLE)).toBeNull();
  await act(async () => fireEvent.changeText(utils.getByPlaceholderText('delete'), 'delete'));

  // 1. The user dismisses Apple's sheet: nothing is deleted, no error, and the way out appears.
  mockConfirm.mockRejectedValueOnce({ code: 'ERR_REQUEST_CANCELED' });
  await act(async () => fireEvent.press(utils.getByText('Delete my account')));
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(mockMutate).not.toHaveBeenCalled();
  expect(mockToastError).not.toHaveBeenCalled();
  expect(utils.getByText(WITHOUT_APPLE)).toBeTruthy();

  // 2. Apple's sheet fails (not a cancel): the deletion goes ahead without Apple's code.
  mockConfirm.mockRejectedValueOnce(new Error('AuthorizationError 1000'));
  await act(async () => fireEvent.press(utils.getByText('Delete my account')));
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
  expect(mockMutate.mock.calls[0][0]).toBeUndefined();

  // 3. Confirmed with Apple: its one-time code goes with the delete request.
  mockConfirm.mockResolvedValueOnce('apple-code-1');
  await act(async () => fireEvent.press(utils.getByText('Delete my account')));
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2));
  expect(mockMutate.mock.calls[1][0]).toBe('apple-code-1');

  // 4. "Delete without confirming with Apple": no Apple sheet, deleted without a code.
  const confirmCalls = mockConfirm.mock.calls.length;
  await act(async () => fireEvent.press(utils.getByText(WITHOUT_APPLE)));
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(3));
  expect(mockMutate.mock.calls[2][0]).toBeUndefined();
  expect(mockConfirm).toHaveBeenCalledTimes(confirmCalls);

  // A failed deletion is reported (the account is untouched).
  mockMutate.mock.calls[2][1].onError(new Error('boom'));
  expect(mockToastError).toHaveBeenLastCalledWith('We couldn’t delete your account. Please try again.');
});
