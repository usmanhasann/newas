/**
 * Sign In (N4, client revisions 10/14 p.15-16): a Google / Apple sign-in that may belong to an
 * existing account is handed to account linking (which opens "Link your account" or asks "Already
 * have a LYSM account?"), never merged and never a silent failure; anything else is the usual
 * message. One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SignInScreen } from '@features/auth/screens/SignInScreen';
import { useToastStore } from '@store/toast';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: mockNavigate }),
}));
jest.mock('@features/auth/social', () => ({
  isAppleAuthAvailable: jest.fn(() => Promise.resolve(true)),
  isUserCanceledSignIn: () => false,
  signInExistingWithApple: jest.fn(),
  signInExistingWithGoogle: jest.fn(),
}));
jest.mock('@features/auth/linkFlow', () => ({ resolveAccountLink: jest.fn() }));
const social = jest.requireMock('@features/auth/social') as Record<string, jest.Mock>;
const flow = jest.requireMock('@features/auth/linkFlow') as Record<string, jest.Mock>;

it('a stopped sign-in opens linking; other errors keep their message', async () => {
  const utils = await render(<SignInScreen />);
  const stopped = new Error(
    'This sign-in needs to be linked to an existing account first',
  );

  social.signInExistingWithApple.mockRejectedValueOnce(stopped);
  flow.resolveAccountLink.mockImplementationOnce(
    async (_e: unknown, open: () => void) => {
      open();
      return { kind: 'opened' };
    },
  );
  await fireEvent.press(
    await utils.findByRole('button', { name: 'Continue with Apple' }),
  );
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('LinkAccount'));
  expect(flow.resolveAccountLink).toHaveBeenCalledWith(stopped, expect.any(Function));
  expect(useToastStore.getState().message).toBeFalsy(); // no failure message

  social.signInExistingWithGoogle.mockRejectedValueOnce({
    message: 'network request failed',
  });
  flow.resolveAccountLink.mockResolvedValueOnce(null);
  await fireEvent.press(utils.getByRole('button', { name: 'Continue with Google' }));
  await waitFor(() =>
    expect(useToastStore.getState().message).toBe(
      'We couldn’t reach the server. Check your connection and try again.',
    ),
  );

  // "No, create one" failing is said too (never silent).
  social.signInExistingWithGoogle.mockRejectedValueOnce(stopped);
  flow.resolveAccountLink.mockRejectedValueOnce({ code: 'link_too_many' });
  await fireEvent.press(utils.getByRole('button', { name: 'Continue with Google' }));
  await waitFor(() =>
    expect(useToastStore.getState().message).toBe(
      'A few too many attempts. Please wait a moment and try again.',
    ),
  );
  expect(mockNavigate).toHaveBeenCalledTimes(1);
});
