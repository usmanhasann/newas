/**
 * Client 10/14 p.15 "Current bug: right now this just silently blocks the user with no explanation
 * at all." Google's in-app browser sign-in only read a `?code=` from the redirect, but this app's
 * auth client gets its answer in the URL FRAGMENT (implicit flow): a refusal looked like success
 * (onboarding went on as a still-anonymous user) and on iPhone a successful Sign In never took
 * effect, with no message either way. Locks: tokens → session, code → exchange, any error → a
 * thrown error the screens turn into a message, Cancel on Google's page → a cancel (no message),
 * nothing → an error (never a silent pass), and the onboarding link only counts once Google is
 * really on the account. A Google account that is already a LYSM account signs in to it (as Apple
 * does); an email that already has an account is never merged automatically.
 */
import {
  SocialSignInError,
  isUserCanceledSignIn,
  orphanGoogleRedirectError,
  signInExistingWithGoogle,
  signInWithGoogle,
} from '@features/auth/social';
import { existingAccountKind, socialSignInMessage } from '@features/auth/errors';

type TestUser = { id: string; is_anonymous: boolean; identities: { provider: string }[] };
const anon: TestUser = { id: 'u1', is_anonymous: true, identities: [] };
const linked: TestUser = { id: 'u1', is_anonymous: false, identities: [{ provider: 'google' }] };

const mockAuth = {
  linkIdentity: jest.fn(() => Promise.resolve({ data: { url: 'https://auth/link' }, error: null })),
  signInWithOAuth: jest.fn(() => Promise.resolve({ data: { url: 'https://auth/signin' }, error: null })),
  setSession: jest.fn((_s: { access_token: string; refresh_token: string }) => Promise.resolve({ error: null })),
  exchangeCodeForSession: jest.fn((_c: string) => Promise.resolve({ error: null })),
  refreshSession: jest.fn(() => Promise.resolve({ error: null })),
  getSession: jest.fn(() => Promise.resolve({ data: { session: { user: anon as TestUser } } })),
  getUser: jest.fn(() => Promise.resolve({ data: { user: linked as TestUser } })),
};
jest.mock('@lib', () => ({
  // Lazy: the mock factory runs before `mockAuth` is initialised.
  supabase: {
    get auth() {
      return mockAuth;
    },
  },
  env: { googleWebClientId: '', googleIosClientId: '' },
  isGoogleNativeConfigured: false,
}));
const mockOpen = jest.fn();
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpen(...args),
  maybeCompleteAuthSession: () => {},
}));
jest.mock('expo-linking', () => ({ createURL: () => 'innercircle://auth-callback' }));

const back = (url: string) => mockOpen.mockResolvedValueOnce({ type: 'success', url });
const ALREADY_LINKED_ELSEWHERE =
  'innercircle://auth-callback#error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user';

beforeEach(() => jest.clearAllMocks());

describe('Sign In screen: Google in the in-app browser', () => {
  it('a success in the URL fragment signs the user in', async () => {
    back('innercircle://auth-callback#access_token=AT&refresh_token=RT&expires_in=3600&token_type=bearer');
    await signInExistingWithGoogle();
    expect(mockAuth.setSession).toHaveBeenCalledWith({ access_token: 'AT', refresh_token: 'RT' });
  });

  it('a ?code= answer is exchanged for a session', async () => {
    back('innercircle://auth-callback?code=abc123');
    await signInExistingWithGoogle();
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('abc123');
    expect(mockAuth.setSession).not.toHaveBeenCalled();
  });

  it('a refusal (in the fragment or the query) is an error with the server’s code, never a success', async () => {
    back(ALREADY_LINKED_ELSEWHERE);
    const e1 = await signInExistingWithGoogle().catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(SocialSignInError);
    expect((e1 as SocialSignInError).code).toBe('identity_already_exists');
    expect((e1 as SocialSignInError).message).toBe('Identity is already linked to another user');

    back('innercircle://auth-callback?error=access_denied&error_code=user_banned&error_description=User+is+banned');
    const e2 = await signInExistingWithGoogle().catch((e: unknown) => e);
    expect((e2 as SocialSignInError).code).toBe('user_banned');
    expect(isUserCanceledSignIn(e2)).toBe(false);
    expect(mockAuth.setSession).not.toHaveBeenCalled();
  });

  it('Cancel on Google’s own page (access_denied, no error code) is a cancel, not an error message', async () => {
    back('innercircle://auth-callback?error=access_denied&error_description=access_denied#error=access_denied&error_description=access_denied');
    const e = await signInExistingWithGoogle().catch((err: unknown) => err);
    expect(isUserCanceledSignIn(e)).toBe(true);
    expect(mockAuth.setSession).not.toHaveBeenCalled();
  });

  it('a redirect with no answer at all is an error, not a silent pass', async () => {
    back('innercircle://auth-callback');
    await expect(signInExistingWithGoogle()).rejects.toMatchObject({ code: 'no_session' });
  });

  it('closing the browser is a cancel (no error message)', async () => {
    mockOpen.mockResolvedValueOnce({ type: 'cancel' });
    const e = await signInExistingWithGoogle().catch((err: unknown) => err);
    expect(isUserCanceledSignIn(e)).toBe(true);
  });
});

describe('onboarding: linking Google to the new account', () => {
  it('goes on only once Google is really linked to the account', async () => {
    back('innercircle://auth-callback#access_token=AT&refresh_token=RT');
    await signInWithGoogle();
    expect(mockAuth.linkIdentity).toHaveBeenCalled();
    expect(mockAuth.setSession).toHaveBeenCalledWith({ access_token: 'AT', refresh_token: 'RT' });
    expect(mockAuth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('if the account is still anonymous afterwards, that is an error too', async () => {
    back('innercircle://auth-callback#access_token=AT&refresh_token=RT');
    mockAuth.getUser.mockResolvedValueOnce({ data: { user: anon } });
    await expect(signInWithGoogle()).rejects.toMatchObject({ code: 'link_incomplete' });
  });

  it('a Google account that already has a LYSM account signs in to it (like Apple)', async () => {
    back(ALREADY_LINKED_ELSEWHERE);
    mockAuth.getUser.mockResolvedValueOnce({ data: { user: anon } }); // not linked to THIS account
    back('innercircle://auth-callback#access_token=AT2&refresh_token=RT2');
    await signInWithGoogle();
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(mockAuth.setSession).toHaveBeenCalledWith({ access_token: 'AT2', refresh_token: 'RT2' });
  });

  it('a retry after an earlier link that the app missed goes on with this account', async () => {
    back('innercircle://auth-callback#error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked');
    mockAuth.getUser.mockResolvedValueOnce({ data: { user: linked } }); // this account has Google now
    await signInWithGoogle();
    expect(mockAuth.refreshSession).toHaveBeenCalledTimes(1);
    expect(mockAuth.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it('nothing to do when this session’s account already has Google', async () => {
    mockAuth.getSession.mockResolvedValueOnce({ data: { session: { user: linked } } });
    await signInWithGoogle();
    expect(mockAuth.linkIdentity).not.toHaveBeenCalled();
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('an email that already has an account is an error, never signed in automatically', async () => {
    back('innercircle://auth-callback#error=server_error&error_code=email_exists&error_description=A+user+with+this+email+address+has+already+been+registered');
    const e = await signInWithGoogle().catch((err: unknown) => err);
    expect(e).toMatchObject({ code: 'email_exists' });
    expect(existingAccountKind(e)).toBe('email');
    expect(mockAuth.signInWithOAuth).not.toHaveBeenCalled();
    expect(mockAuth.getUser).not.toHaveBeenCalled();
  });
});

describe('a Google refusal that reopened the app (Android, app closed meanwhile)', () => {
  it('is reported when no in-app sign-in is running; other links are left alone', () => {
    expect(orphanGoogleRedirectError(ALREADY_LINKED_ELSEWHERE)).toMatchObject({ code: 'identity_already_exists' });
    expect(isUserCanceledSignIn(orphanGoogleRedirectError('innercircle://auth-callback#error=access_denied'))).toBe(true);
    expect(orphanGoogleRedirectError('innercircle://auth-callback#access_token=AT&refresh_token=RT')).toBeNull();
    expect(orphanGoogleRedirectError('innercircle://reset-password#error=access_denied&error_code=otp_expired')).toBeNull();
  });

  it('is left to the in-app sign-in while it is running (no second message)', async () => {
    let finish: (v: unknown) => void = () => {};
    mockOpen.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const running = signInExistingWithGoogle().catch((err: unknown) => err);
    await new Promise((r) => setTimeout(r, 0)); // let it open the browser
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(orphanGoogleRedirectError(ALREADY_LINKED_ELSEWHERE)).toBeNull();
    finish({ type: 'success', url: ALREADY_LINKED_ELSEWHERE });
    expect(await running).toMatchObject({ code: 'identity_already_exists' });
    expect(orphanGoogleRedirectError(ALREADY_LINKED_ELSEWHERE)).not.toBeNull();
  });
});

describe('socialSignInMessage', () => {
  it('explains the "already has an account" cases instead of failing silently', () => {
    expect(socialSignInMessage(new SocialSignInError('identity_already_exists', 'x'), 'Google')).toBe(
      'This Google account already has a LYSM account. Sign in to use it.',
    );
    expect(socialSignInMessage({ code: 'email_exists', message: 'x' }, 'Apple')).toBe(
      'An account with this email already exists. Sign in with the method you used to create it.',
    );
    expect(socialSignInMessage({ message: 'A user with this email address has already been registered' }, 'Google')).toBe(
      'An account with this email already exists. Sign in with the method you used to create it.',
    );
  });
  it('a connection problem and anything else get a clear message too', () => {
    expect(socialSignInMessage(new TypeError('Network request failed'), 'Google')).toBe(
      'We couldn’t reach the server. Check your connection and try again.',
    );
    expect(socialSignInMessage(new SocialSignInError('no_session', 'x'), 'Google')).toBe(
      'Google sign-in didn’t complete. Please try again.',
    );
    expect(socialSignInMessage(null, 'Apple')).toBe('Apple sign-in didn’t complete. Please try again.');
    expect(existingAccountKind(new SocialSignInError('no_session', 'x'))).toBeNull();
  });
});
