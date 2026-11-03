/**
 * "Already have a LYSM account?" → yes (N4, client revisions 10/14 p.16, Apple "Hide My Email"):
 * the person signs in to their account the usual way (email + password, or Google), then Apple is
 * added to it. Apple itself isn't offered (that Apple ID has no account).
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { LinkAccountScreen } from '@features/auth/screens/LinkAccountScreen';
import { useAccountLinkStore, type PendingLink } from '@features/auth/linking';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: () => true,
  }),
}));
jest.mock('@features/auth/social', () => ({
  isAppleAuthAvailable: jest.fn(() => Promise.resolve(true)),
  isUserCanceledSignIn: () => false,
}));
jest.mock('@features/auth/linkFlow', () => ({
  LinkFlowError: class extends Error {},
  linkWithPassword: jest.fn(() => Promise.resolve('linked')),
  linkWithProvider: jest.fn(() => Promise.resolve('linked')),
  confirmForNewPassword: jest.fn(),
  finishNewPassword: jest.fn(),
}));
const flow = jest.requireMock('@features/auth/linkFlow') as Record<string, jest.Mock>;

const link: PendingLink = {
  kind: 'fallback',
  origin: 'onboarding',
  relay: true,
  attempt: { provider: 'apple', idToken: 'a-token', email: null },
};

it('offers email + password and Google, then adds Apple to that account', async () => {
  useAccountLinkStore.getState().set(link);
  const utils = await render(<LinkAccountScreen />);

  expect(
    utils.getByText(
      'Sign in to your LYSM account the way you usually do, and we’ll add Apple to it.',
    ),
  ).toBeTruthy();
  await utils.findByRole('button', { name: 'Continue with Google' });
  expect(utils.queryByRole('button', { name: 'Continue with Apple' })).toBeNull();

  await fireEvent.press(utils.getByRole('button', { name: 'Continue with Email' }));
  await fireEvent.changeText(
    utils.getByPlaceholderText('you@example.com'),
    'not an email',
  );
  await fireEvent.changeText(utils.getByPlaceholderText('Your password'), 'Mine 1234');
  await fireEvent.press(utils.getByText('Continue'));
  expect(utils.getByText('Enter a valid email address')).toBeTruthy();
  expect(flow.linkWithPassword).not.toHaveBeenCalled();

  await fireEvent.changeText(
    utils.getByPlaceholderText('you@example.com'),
    ' me@example.com ',
  );
  await fireEvent.press(utils.getByText('Continue'));
  await waitFor(() =>
    expect(flow.linkWithPassword).toHaveBeenCalledWith(
      link,
      'me@example.com',
      'Mine 1234',
    ),
  );

  await fireEvent.press(utils.getByText('Use a different sign-in option'));
  await fireEvent.press(
    await utils.findByRole('button', { name: 'Continue with Google' }),
  );
  await waitFor(() => expect(flow.linkWithProvider).toHaveBeenCalledWith(link, 'google'));
});
