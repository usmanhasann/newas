/**
 * Account linking (N4, client revisions 10/14 p.15-16 and p.19): every native Google / Apple token
 * goes through the account-link pre-check BEFORE the auth server sees it, because the auth server
 * would link a sign-in to an existing account with the same email by itself. These pin down that a
 * sign-in only reaches the auth server when the pre-check says "existing" or "new", and that an
 * email match stops (never merged automatically).
 */
import {
  continueAsNewAccount,
  signInExistingWithApple,
  signInExistingWithGoogle,
  signInWithApple,
  signInWithGoogle,
} from '@features/auth/social';
import { isAccountLinkRequired, useAccountLinkStore } from '@features/auth/linking';
import { socialSignInMessage } from '@features/auth/errors';

const mockInvoke = jest.fn();
jest.mock('@lib', () => ({
  supabase: {
    auth: {
      signInWithIdToken: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      linkIdentity: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      updateUser: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      getSession: jest.fn(() =>
        Promise.resolve({ data: { session: { user: { id: 'acct-1' } } } }),
      ),
      getUser: jest.fn(() =>
        Promise.resolve({ data: { user: { id: 'anon', is_anonymous: true } } }),
      ),
    },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
  env: { googleWebClientId: 'web-id', googleIosClientId: '' },
  isGoogleNativeConfigured: false,
}));
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: () => Promise.resolve(true),
  signInAsync: jest.fn(() =>
    Promise.resolve({
      identityToken: 'apple-token',
      user: 'apple-user-1',
      fullName: null,
    }),
  ),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
// The native Google dialog (its own module; the native package isn't loaded under Jest).
jest.mock('@features/auth/googleNative', () => ({
  googleNativeIdToken: jest.fn(() => Promise.resolve('google-token')),
}));

const lib = jest.requireMock('@lib') as {
  supabase: { auth: Record<string, jest.Mock> };
  isGoogleNativeConfigured: boolean;
};
const auth = lib.supabase.auth;
const answer = (data: unknown) => mockInvoke.mockResolvedValueOnce({ data, error: null });
const caught = async (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

beforeEach(async () => {
  jest.clearAllMocks();
  useAccountLinkStore.getState().clear();
  lib.isGoogleNativeConfigured = false;
  await jest.requireMock('@react-native-async-storage/async-storage').clear();
});

describe('Sign In with Apple', () => {
  it('asks the pre-check first, then signs in when the Apple ID is already on an account', async () => {
    answer({ status: 'existing' });
    await signInExistingWithApple();
    expect(mockInvoke).toHaveBeenCalledWith('account-link', {
      body: { action: 'check', provider: 'apple', id_token: 'apple-token' },
    });
    expect(mockInvoke.mock.invocationCallOrder[0]).toBeLessThan(
      auth.signInWithIdToken.mock.invocationCallOrder[0],
    );
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-token',
    });
  });

  it('an email already on another account stops: nothing reaches the auth server (never merged automatically)', async () => {
    answer({ status: 'link_required', method: 'password', email: 'Sam@Example.com' });
    const e = await caught(signInExistingWithApple());
    expect(isAccountLinkRequired(e)).toBe(true);
    expect(useAccountLinkStore.getState().pending).toEqual({
      kind: 'link',
      origin: 'signin',
      email: 'sam@example.com',
      method: 'password',
      attempt: {
        provider: 'apple',
        idToken: 'apple-token',
        email: 'sam@example.com',
        appleUserId: 'apple-user-1',
        appleName: null,
      },
    });
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(auth.linkIdentity).not.toHaveBeenCalled();
  });

  it('no matching account: asks "Already have a LYSM account?" before creating one', async () => {
    answer({ status: 'new', relay: false });
    const e = await caught(signInExistingWithApple());
    expect(isAccountLinkRequired(e) && e.link).toMatchObject({
      kind: 'fallback',
      origin: 'signin',
      relay: false,
    });
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('only verified emails link: an unverified match is refused with a message, not merged', async () => {
    answer({ status: 'email_unverified', side: 'account' });
    const e = await caught(signInExistingWithApple());
    expect(socialSignInMessage(e, 'Apple')).toBe(
      'There’s a LYSM account with this email that hasn’t been verified yet. Sign in to it with its email and password first, then you can add Apple.',
    );
    answer({ status: 'email_unverified', side: 'provider' });
    const e2 = await caught(signInExistingWithApple());
    expect(socialSignInMessage(e2, 'Apple')).toBe(
      'Apple hasn’t verified the email on this account, so we can’t match it to your LYSM account. Sign in the way you usually do.',
    );
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('a pre-check that fails (server or network) never falls through to the auth server', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { context: { status: 500 } } });
    const e = await caught(signInExistingWithApple());
    expect(socialSignInMessage(e, 'Apple')).toBe(
      'We couldn’t reach the server. Check your connection and try again.',
    );
    mockInvoke.mockResolvedValueOnce({
      data: { status: 'link_required', method: 'facebook' },
      error: null,
    });
    expect(await caught(signInExistingWithApple())).toBeTruthy();
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('before account-link is deployed (404) sign-in works as before', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { context: { status: 404 } } });
    await signInExistingWithApple();
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-token',
    });
  });
});

describe('"Save your progress" with Apple (anonymous onboarding session)', () => {
  it('a new Apple ID links to the onboarding session; one already on an account signs in to it', async () => {
    answer({ status: 'new', relay: false });
    await signInWithApple();
    expect(auth.linkIdentity).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-token',
    });
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();

    answer({ status: 'existing' });
    await signInWithApple();
    expect(auth.linkIdentity).toHaveBeenCalledTimes(1);
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-token',
    });
  });

  it('Hide My Email can match no account, so it asks first instead of creating a second account (p.16)', async () => {
    answer({ status: 'new', relay: true });
    const e = await caught(signInWithApple());
    expect(isAccountLinkRequired(e) && e.link).toMatchObject({
      kind: 'fallback',
      origin: 'onboarding',
      relay: true,
    });
    expect(auth.linkIdentity).not.toHaveBeenCalled();
  });

  it('its email on another account stops before anything is linked', async () => {
    answer({ status: 'link_required', method: 'google', email: 'gina@example.com' });
    const e = await caught(signInWithApple());
    expect(isAccountLinkRequired(e) && e.link).toMatchObject({
      kind: 'link',
      origin: 'onboarding',
      method: 'google',
    });
    expect(auth.linkIdentity).not.toHaveBeenCalled();
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });
});

describe('native Google (once its client ids are configured)', () => {
  beforeEach(() => {
    lib.isGoogleNativeConfigured = true;
  });

  it('Sign In: an email on another account stops; an existing Google account signs in', async () => {
    answer({ status: 'link_required', method: 'password', email: 'pat@example.com' });
    const e = await caught(signInExistingWithGoogle());
    expect(isAccountLinkRequired(e) && e.link).toMatchObject({
      kind: 'link',
      method: 'password',
    });
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();

    answer({ status: 'existing' });
    await signInExistingWithGoogle();
    expect(mockInvoke).toHaveBeenLastCalledWith('account-link', {
      body: { action: 'check', provider: 'google', id_token: 'google-token' },
    });
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'google-token',
    });
  });

  it('onboarding: a new Google account links to the session; an existing one signs in', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'anon', is_anonymous: true } } },
    });
    answer({ status: 'new', relay: false });
    await signInWithGoogle();
    expect(auth.linkIdentity).toHaveBeenCalledWith({
      provider: 'google',
      token: 'google-token',
    });

    answer({ status: 'existing' });
    await signInWithGoogle();
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'google-token',
    });
    expect(auth.linkIdentity).toHaveBeenCalledTimes(1);
  });
});

describe('"Already have a LYSM account?" then "No, create one"', () => {
  it('Sign In: the stopped sign-in creates the account, keeping Apple’s one-time name', async () => {
    const name = await continueAsNewAccount({
      kind: 'fallback',
      origin: 'signin',
      relay: true,
      attempt: {
        provider: 'apple',
        idToken: 'apple-token',
        email: null,
        appleUserId: 'apple-user-1',
        appleName: 'Konah Quittman',
      },
    });
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-token',
    });
    expect(auth.updateUser).toHaveBeenCalledWith({
      data: { display_name: 'Konah Quittman' },
    });
    expect(name).toBe('Konah Quittman');
  });

  it('onboarding: links to the anonymous session so the answers carry over', async () => {
    await continueAsNewAccount({
      kind: 'fallback',
      origin: 'onboarding',
      relay: false,
      attempt: { provider: 'google', idToken: 'google-token', email: null },
    });
    expect(auth.linkIdentity).toHaveBeenCalledWith({
      provider: 'google',
      token: 'google-token',
    });
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });
});
