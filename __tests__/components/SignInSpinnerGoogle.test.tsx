/**
 * Client 10/14 p.32 on the Sign In screen: tapping "Continue with Google" puts the spinner on
 * Google only, and Google itself stays at full strength (the bug screenshot had all three buttons
 * dimmed); Email is grayed out with its text and icon, and nothing else can start.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { SignInScreen } from '@features/auth/screens/SignInScreen';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
}));
jest.mock('@features/auth/social', () => ({
  isAppleAuthAvailable: jest.fn(() => Promise.resolve(false)),
  isUserCanceledSignIn: () => false,
  signInExistingWithApple: jest.fn(() => new Promise<void>(() => {})),
  // Google's browser stays open (never resolves) so the in-progress state can be inspected.
  signInExistingWithGoogle: jest.fn(() => new Promise<void>(() => {})),
}));
const social = jest.requireMock('@features/auth/social') as {
  signInExistingWithGoogle: jest.Mock;
};

it('tapping Google: spinner on Google only, Google not dimmed, Email grayed out', async () => {
  const utils = await render(<SignInScreen />);
  await fireEvent.press(utils.getByRole('button', { name: 'Continue with Google' }));
  await waitFor(() => expect(social.signInExistingWithGoogle).toHaveBeenCalledTimes(1));

  const google = await waitFor(() => {
    const b = utils.getByRole('button', { name: 'Continue with Google' });
    expect(b.props.accessibilityState).toMatchObject({ busy: true });
    return b;
  });
  const email = utils.getByRole('button', { name: 'Continue with Email' });
  // The spinner takes the G's place; the title stays.
  expect(within(google).getByText('Continue with Google')).toBeTruthy();
  expect(String(google.props.className)).not.toContain('opacity-50');
  expect(email.props.accessibilityState).toMatchObject({ disabled: true, busy: false });
  expect(String(email.props.className)).toContain('opacity-50');
  expect(utils.getByText('Continue with Email')).toBeTruthy();
  expect(
    JSON.stringify(utils.toJSON()).match(/"type":"ActivityIndicator"/g) ?? [],
  ).toHaveLength(1);

  await fireEvent.press(google); // a second tap starts nothing
  expect(social.signInExistingWithGoogle).toHaveBeenCalledTimes(1);
});
