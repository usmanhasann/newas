/**
 * An Apple only account met on a phone without Sign in with Apple (Android) (N4): the screen says
 * where to confirm instead of offering a button that can't work. Nothing is linked.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render } from '@testing-library/react-native';
import { LinkAccountScreen } from '@features/auth/screens/LinkAccountScreen';
import { useAccountLinkStore } from '@features/auth/linking';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: () => true,
  }),
}));
jest.mock('@features/auth/social', () => ({
  isAppleAuthAvailable: jest.fn(() => Promise.resolve(false)),
  isUserCanceledSignIn: () => false,
}));
jest.mock('@features/auth/linkFlow', () => ({
  LinkFlowError: class extends Error {},
  linkWithPassword: jest.fn(),
  linkWithProvider: jest.fn(),
  confirmForNewPassword: jest.fn(),
  finishNewPassword: jest.fn(),
}));

it('explains that Apple works on iPhone or iPad', async () => {
  useAccountLinkStore.getState().set({
    kind: 'link',
    origin: 'signin',
    attempt: { provider: 'google', idToken: 'g', email: 'abe@example.com' },
    email: 'abe@example.com',
    method: 'apple',
  });
  const utils = await render(<LinkAccountScreen />);
  expect(
    await utils.findByText(
      'This account signs in with Apple, which isn’t available on this device. Open LYSM on your iPhone or iPad and sign in with Apple there.',
    ),
  ).toBeTruthy();
  expect(utils.queryByRole('button', { name: 'Continue with Apple' })).toBeNull();
});
