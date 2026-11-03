/**
 * Re-authenticating with the provider the account was created with (N5, client revisions 10/14
 * p.20-21: "Set a password", replacing an Apple relay address). The proof goes to the server; the
 * app's own session never changes. Until native Google is set up, the in-app browser gives a fresh
 * Google sign-in's access token as the proof, and its redirect is never turned into this app's
 * session.
 */
import {
  isReauthRedirect,
  isUserCanceledSignIn,
  orphanGoogleRedirectError,
  reauthenticateWithProvider,
  SocialSignInError,
} from '@features/auth/social';
import { handleAuthUrl } from '@features/auth/deepLink';

const mockAuth = {
  signInWithOAuth: jest.fn(() =>
    Promise.resolve({ data: { url: 'https://auth/reauth' }, error: null }),
  ),
  setSession: jest.fn(() => Promise.resolve({ error: null })),
  exchangeCodeForSession: jest.fn(() => Promise.resolve({ error: null })),
};
jest.mock('@lib', () => ({
  supabase: {
    get auth() {
      return mockAuth;
    },
  },
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  env: { googleWebClientId: 'web-client', googleIosClientId: '' },
  // Native Google isn't set up yet (no client ids): the browser fallback. The native path loads
  // its module with a dynamic import, which Jest can't run here.
  isGoogleNativeConfigured: false,
}));
const mockOpen = jest.fn();
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpen(...args),
  maybeCompleteAuthSession: () => {},
}));
jest.mock('expo-linking', () => ({
  createURL: (path: string) => `innercircle://${path}`,
  parse: (url: string) => {
    const query = url.split('#')[0]?.split('?')[1] ?? '';
    return {
      path: url.replace('innercircle://', '').split(/[?#]/)[0],
      queryParams: Object.fromEntries(new URLSearchParams(query)),
    };
  },
}));
const mockAppleSignIn = jest.fn();
jest.mock('expo-apple-authentication', () => ({
  signInAsync: (...a: unknown[]) => mockAppleSignIn(...a),
  isAvailableAsync: () => Promise.resolve(true),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
beforeEach(() => jest.clearAllMocks());

describe('reauthenticateWithProvider', () => {
  it('Apple: a fresh identity token from the native sheet, asking for no name or email', async () => {
    mockAppleSignIn.mockResolvedValueOnce({ identityToken: 'apple-id-token' });
    expect(await reauthenticateWithProvider('apple')).toEqual({
      provider: 'apple',
      id_token: 'apple-id-token',
    });
    expect(mockAppleSignIn).toHaveBeenCalledWith({ requestedScopes: [] });
  });

  it('Google, browser fallback: the access token is the proof; the app session never changes', async () => {
    mockOpen.mockResolvedValueOnce({
      type: 'success',
      url: 'innercircle://reauth-callback#access_token=AT&refresh_token=RT&token_type=bearer',
    });
    expect(await reauthenticateWithProvider('google', 'g@gmail.com')).toEqual({
      provider: 'google',
      access_token: 'AT',
    });
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'innercircle://reauth-callback',
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account', login_hint: 'g@gmail.com' },
      },
    });
    expect(mockOpen).toHaveBeenCalledWith(
      'https://auth/reauth',
      'innercircle://reauth-callback',
    );
    expect(mockAuth.setSession).not.toHaveBeenCalled();
  });

  it('Google, browser fallback: Cancel is a cancel, a refusal is an error', async () => {
    mockOpen.mockResolvedValueOnce({ type: 'cancel' });
    const canceled = await reauthenticateWithProvider('google').catch((e: unknown) => e);
    expect(isUserCanceledSignIn(canceled)).toBe(true);

    mockOpen.mockResolvedValueOnce({
      type: 'success',
      url: 'innercircle://reauth-callback#error=server_error&error_code=user_banned&error_description=Banned',
    });
    const refused = await reauthenticateWithProvider('google').catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(SocialSignInError);
    expect((refused as SocialSignInError).code).toBe('user_banned');
  });
});

describe('a re-authentication redirect is never a sign-in', () => {
  const url = 'innercircle://reauth-callback#access_token=AT&refresh_token=RT';

  it('is recognised, and the deep link handlers leave it alone', async () => {
    expect(isReauthRedirect(url)).toBe(true);
    expect(isReauthRedirect('innercircle://auth-callback#access_token=AT')).toBe(false);
    expect(
      orphanGoogleRedirectError(
        'innercircle://reauth-callback#error=access_denied&error_code=x',
      ),
    ).toBeNull();
    expect(await handleAuthUrl(url)).toBe(false);
    expect(mockAuth.setSession).not.toHaveBeenCalled();
  });

  it('a real sign-in redirect still establishes the session', async () => {
    expect(
      await handleAuthUrl('innercircle://auth-callback#access_token=AT&refresh_token=RT'),
    ).toBe(true);
    expect(mockAuth.setSession).toHaveBeenCalledWith({
      access_token: 'AT',
      refresh_token: 'RT',
    });
  });
});
