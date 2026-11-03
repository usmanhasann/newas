/**
 * Locks the critical distinction for the new-vs-existing flow:
 *  • EXISTING-user Sign In (signInExistingWith*) must SIGN IN to the real account via
 *    signInWithIdToken — NOT linkIdentity (which errors when the identity already exists).
 *  • The NEW-user sign-up path (signInWithApple/Google) must still LINK to the anon session.
 */
import {
  isUserCanceledSignIn,
  signInExistingWithApple,
  signInWithApple,
} from '@features/auth/social';
import { usePendingNameStore } from '@store/pendingName';
import { recallAppleName } from '@store/appleName';

jest.mock('@lib', () => ({
  supabase: {
    auth: {
      signInWithIdToken: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      linkIdentity: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      updateUser: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      getSession: jest.fn(() => Promise.resolve({ data: { session: { user: { id: 'acct-1' } } } })),
    },
    // The account linking pre-check (N4) is not deployed here (404): sign-in works as it did before
    // linking existed, which is what these tests pin down. The pre-check itself: authLinkPrecheck.test.ts.
    functions: {
      invoke: jest.fn(() => Promise.resolve({ data: null, error: { context: { status: 404 } } })),
    },
  },
  env: { googleWebClientId: '', googleIosClientId: '' },
  isGoogleNativeConfigured: false,
}));
// Per-test control of what Apple's sheet returns (the name comes only on a first authorization).
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: () => Promise.resolve(false),
  signInAsync: jest.fn(() => Promise.resolve({ identityToken: 'test-token', fullName: null })),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

const auth = jest.requireMock('@lib').supabase.auth as {
  signInWithIdToken: jest.Mock;
  linkIdentity: jest.Mock;
  updateUser: jest.Mock;
};
const apple = jest.requireMock('expo-apple-authentication') as { signInAsync: jest.Mock };
const firstAuthorization = () =>
  apple.signInAsync.mockResolvedValueOnce({
    identityToken: 'test-token',
    fullName: { givenName: 'Konah', familyName: 'Quittman' },
  });

describe('social auth — sign-in vs sign-up-link', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    usePendingNameStore.getState().clear();
    await jest.requireMock('@react-native-async-storage/async-storage').clear();
  });

  it('existing-user Apple Sign In authenticates the real account (signInWithIdToken)', async () => {
    await signInExistingWithApple();
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'test-token' });
    expect(auth.linkIdentity).not.toHaveBeenCalled();
  });

  it('new-user Apple sign-up still LINKS to the anonymous session (unchanged)', async () => {
    await signInWithApple();
    expect(auth.linkIdentity).toHaveBeenCalledWith({ provider: 'apple', token: 'test-token' });
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  // Regression lock: a returning Apple user who reaches the SIGN-UP path (tapped "Get Started"
  // instead of "Sign In") must NOT dead-end — linkIdentity errors "already linked", so we fall
  // back to signing INTO the existing account with the same token.
  it('Apple sign-up FALLS BACK to Sign In when the Apple ID already has an account', async () => {
    auth.linkIdentity.mockResolvedValueOnce({
      data: {},
      error: { code: 'identity_already_exists', message: 'Identity is already linked to another user' },
    });
    await signInWithApple();
    expect(auth.linkIdentity).toHaveBeenCalledWith({ provider: 'apple', token: 'test-token' });
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'test-token' });
  });

  it('a genuine (non-already-linked) link error still throws and does NOT sign in', async () => {
    auth.linkIdentity.mockResolvedValueOnce({
      data: {},
      error: { code: 'over_request_rate_limit', message: 'Too many requests' },
    });
    await expect(signInWithApple()).rejects.toBeTruthy();
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  // Client 10/14 p.10: Apple shares the name only on the first authorization, so it must be
  // asked for (FULL_NAME scope) and saved at that moment, on every Apple path.
  it('every Apple path asks Apple for the name (FULL_NAME scope)', async () => {
    await signInWithApple();
    await signInExistingWithApple();
    for (const call of apple.signInAsync.mock.calls) {
      expect(call[0].requestedScopes).toEqual(expect.arrayContaining([0, 1])); // FULL_NAME, EMAIL
    }
    expect(apple.signInAsync).toHaveBeenCalledTimes(2);
  });

  it('sign-up: Apple’s name is saved on the account at once and returned for the profile', async () => {
    firstAuthorization();
    await expect(signInWithApple()).resolves.toBe('Konah Quittman');
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { display_name: 'Konah Quittman' } });
    // Saved AFTER the link, so it lands on the upgraded account.
    expect(auth.linkIdentity.mock.invocationCallOrder[0]).toBeLessThan(
      auth.updateUser.mock.invocationCallOrder[0],
    );
  });

  it('sign-up fallback to an existing account: the name is saved on THAT account, after sign-in', async () => {
    firstAuthorization();
    auth.linkIdentity.mockResolvedValueOnce({
      data: {},
      error: { code: 'identity_already_exists', message: 'Identity is already linked to another user' },
    });
    await expect(signInWithApple()).resolves.toBe('Konah Quittman');
    expect(auth.signInWithIdToken.mock.invocationCallOrder[0]).toBeLessThan(
      auth.updateUser.mock.invocationCallOrder[0],
    );
  });

  it('Sign In screen: a first authorization (new user starting there) also saves Apple’s name', async () => {
    firstAuthorization();
    await expect(signInExistingWithApple()).resolves.toBe('Konah Quittman');
    expect(auth.signInWithIdToken.mock.invocationCallOrder[0]).toBeLessThan(
      auth.updateUser.mock.invocationCallOrder[0],
    );
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { display_name: 'Konah Quittman' } });
  });

  it('a later sign-in (Apple sends no name) saves nothing and returns null', async () => {
    await expect(signInExistingWithApple()).resolves.toBeNull();
    await expect(signInWithApple()).resolves.toBeNull();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('a given name alone is enough; blank name parts are ignored', async () => {
    apple.signInAsync.mockResolvedValueOnce({
      identityToken: 'test-token',
      fullName: { givenName: 'Konah', familyName: null },
    });
    await expect(signInExistingWithApple()).resolves.toBe('Konah');
    apple.signInAsync.mockResolvedValueOnce({
      identityToken: 'test-token',
      fullName: { givenName: '  ', familyName: '' },
    });
    await expect(signInExistingWithApple()).resolves.toBeNull();
  });

  it('a failed name save is retried once and never fails the sign-in', async () => {
    firstAuthorization();
    auth.updateUser
      .mockResolvedValueOnce({ data: {}, error: { message: 'network' } })
      .mockResolvedValueOnce({ data: {}, error: { message: 'network' } });
    await expect(signInExistingWithApple()).resolves.toBe('Konah Quittman');
    expect(auth.updateUser).toHaveBeenCalledTimes(2);
  });

  // Review finding: Apple used up its one-time name on the sheet, then the sign-in call failed
  // (weak connection). The retry gets no name from Apple, so the name kept on the phone for that
  // Apple ID is reused, and deleted only once it is saved on the account.
  it('a failed attempt after the Apple sheet keeps the name on the phone for the retry', async () => {
    apple.signInAsync.mockResolvedValueOnce({
      identityToken: 'test-token',
      user: 'apple-001',
      fullName: { givenName: 'Konah', familyName: 'Quittman' },
    });
    auth.signInWithIdToken.mockResolvedValueOnce({ data: {}, error: { message: 'Network request failed' } });
    await expect(signInExistingWithApple()).rejects.toBeTruthy();
    expect(await recallAppleName('apple-001')).toBe('Konah Quittman');

    // Retry: Apple sends no name this time.
    apple.signInAsync.mockResolvedValueOnce({ identityToken: 'test-token', user: 'apple-001', fullName: null });
    await expect(signInExistingWithApple()).resolves.toBe('Konah Quittman');
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { display_name: 'Konah Quittman' } });
    expect(await recallAppleName('apple-001')).toBeNull(); // saved, so forgotten
  });

  it('the phone copy stays when saving on the account fails, and is used only for that Apple ID', async () => {
    apple.signInAsync.mockResolvedValueOnce({
      identityToken: 'test-token',
      user: 'apple-002',
      fullName: { givenName: 'Lee', familyName: 'Park' },
    });
    auth.updateUser
      .mockResolvedValueOnce({ data: {}, error: { message: 'network' } })
      .mockResolvedValueOnce({ data: {}, error: { message: 'network' } });
    await signInExistingWithApple();
    expect(await recallAppleName('apple-002')).toBe('Lee Park');
    // Another Apple ID with no name gets nothing from it.
    apple.signInAsync.mockResolvedValueOnce({ identityToken: 'test-token', user: 'apple-003', fullName: null });
    await expect(signInExistingWithApple()).resolves.toBeNull();
  });

  it('after a successful sign-in the held name belongs to the signed-in account only', async () => {
    firstAuthorization();
    await signInExistingWithApple();
    expect(usePendingNameStore.getState()).toMatchObject({ name: 'Konah Quittman', userId: 'acct-1' });
  });

  it('a failed sign-in never saves a name, and drops the held name', async () => {
    firstAuthorization();
    auth.signInWithIdToken.mockResolvedValueOnce({ data: {}, error: { message: 'invalid token' } });
    await expect(signInExistingWithApple()).rejects.toBeTruthy();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(usePendingNameStore.getState().name).toBeNull();
  });

  // The profile is filled the moment the session switches (app root), which can be before the
  // name is saved on the account: so the name is held in memory BEFORE the sign-in call.
  it('Apple’s name is held for the profile before the session switches', async () => {
    firstAuthorization();
    let heldDuringSignIn: string | null = null;
    auth.signInWithIdToken.mockImplementationOnce(() => {
      heldDuringSignIn = usePendingNameStore.getState().name;
      return Promise.resolve({ data: {}, error: null });
    });
    await signInExistingWithApple();
    expect(heldDuringSignIn).toBe('Konah Quittman');

    firstAuthorization();
    auth.linkIdentity.mockImplementationOnce(() => {
      heldDuringSignIn = usePendingNameStore.getState().name;
      return Promise.resolve({ data: {}, error: null });
    });
    usePendingNameStore.getState().set(null);
    await signInWithApple();
    expect(heldDuringSignIn).toBe('Konah Quittman');
  });

  it('isUserCanceledSignIn recognises a user cancel but not a real failure', () => {
    expect(isUserCanceledSignIn({ code: 'ERR_REQUEST_CANCELED' })).toBe(true);
    expect(isUserCanceledSignIn(new Error('Google sign-in was canceled'))).toBe(true);
    expect(isUserCanceledSignIn(new Error('Network request failed'))).toBe(false);
    expect(isUserCanceledSignIn(null)).toBe(false);
  });
});
