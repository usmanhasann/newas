/**
 * Client revisions 10/14 p.5 (N7.20 to N7.22): a name can't include check marks or verification
 * symbols when creating an account. On the Sign Up screen a name with one shows the client's exact
 * message and nothing is sent; taking it out lets the sign-up go ahead.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { SignUpScreen } from '@features/auth/screens/SignUpScreen';

const mockMutate = jest.fn();
jest.mock('@features/auth/hooks', () => ({
  useSignUp: () => ({
    mutate: mockMutate,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

const MESSAGE = 'Names can’t include check marks or verification symbols.';

it('refuses a name with a check mark, with the client’s message, until it is taken out', async () => {
  const nav = { navigate: jest.fn() };
  const utils = await render(
    <SignUpScreen navigation={nav as never} route={{ params: undefined } as never} />,
  );

  // "Create Account" is the page title and the button under the form (the last one).
  const pressCreate = () => fireEvent.press(utils.getAllByText('Create Account').at(-1)!);
  // Each change is awaited inside act: React 19 renders it asynchronously, and an un-awaited
  // change can be lost before the next one.
  const nameInput = () => utils.getByPlaceholderText('What should we call you?');
  await act(async () => fireEvent.changeText(nameInput(), 'Taylor ☑️'));
  await act(async () =>
    fireEvent.changeText(
      utils.getByPlaceholderText('you@example.com'),
      'taylor@example.com',
    ),
  );
  await act(async () =>
    fireEvent.changeText(utils.getByPlaceholderText('Create a password'), 'password123'),
  );

  await act(async () => pressCreate());
  expect(await utils.findByText(MESSAGE)).toBeTruthy();
  expect(mockMutate).not.toHaveBeenCalled();

  await act(async () => fireEvent.changeText(nameInput(), 'Taylor'));
  await waitFor(() => expect(utils.queryByText(MESSAGE)).toBeNull());
  await act(async () => pressCreate());
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
  expect(mockMutate.mock.calls[0][0]).toMatchObject({
    displayName: 'Taylor',
    email: 'taylor@example.com',
  });
});
