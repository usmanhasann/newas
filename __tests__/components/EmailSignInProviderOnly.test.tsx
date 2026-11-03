/**
 * Email sign-in on a Google / Apple only account (N4, client revisions 10/14 p.16): when the
 * password doesn't match, the app checks whether the email belongs to a Google / Apple only account
 * and, if so, opens linking (confirm with that provider, then set a new password). Other failures
 * only show their message. The email can arrive filled in (from "Save your progress").
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { EmailSignInScreen } from '@features/auth/screens/EmailSignInScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: mockNavigate }),
}));
const mockMutate = jest.fn();
jest.mock('@features/auth/hooks', () => ({
  useSignIn: () => ({
    mutate: mockMutate,
    isPending: false,
    isError: false,
    error: null,
  }),
}));
jest.mock('@features/auth/linkFlow', () => ({ startEmailAccountLink: jest.fn() }));
const flow = jest.requireMock('@features/auth/linkFlow') as Record<string, jest.Mock>;

type Opts = { onError?: (e: unknown) => void };

it('a password that doesn’t match checks for a Google / Apple only account', async () => {
  const route = {
    key: 'EmailSignIn-1',
    name: 'EmailSignIn' as const,
    params: { email: 'gina@example.com' },
  };
  const utils = await render(<EmailSignInScreen route={route} />);
  expect(utils.getByPlaceholderText('you@example.com').props.value).toBe(
    'gina@example.com',
  );

  mockMutate.mockImplementationOnce((_v: unknown, opts: Opts) =>
    opts.onError?.(new Error('Invalid login credentials')),
  );
  flow.startEmailAccountLink.mockImplementationOnce(
    async (_e: string, _o: string, open: () => void) => {
      open();
      return 'opened';
    },
  );
  await fireEvent.changeText(utils.getByPlaceholderText('Your password'), 'whatever1');
  await fireEvent.press(utils.getByText('Sign In'));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('LinkAccount'));
  expect(flow.startEmailAccountLink).toHaveBeenCalledWith(
    'gina@example.com',
    'signin',
    expect.any(Function),
  );

  mockMutate.mockImplementationOnce((_v: unknown, opts: Opts) =>
    opts.onError?.(new Error('Network request failed')),
  );
  await fireEvent.press(utils.getByText('Sign In'));
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2));
  expect(flow.startEmailAccountLink).toHaveBeenCalledTimes(1);
});
