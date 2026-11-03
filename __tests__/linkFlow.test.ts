/**
 * Account linking flows (N4, client revisions 10/14 p.15-16): the person proves it's them the way
 * the existing account was created, and only then is the new sign-in ADDED to it, by that account
 * itself; nothing is removed. The existing account is signed in on a separate auth client, and
 * becomes this app's session only at the end.
 */
import { Alert } from 'react-native';
import {
  LinkFlowError,
  confirmForNewPassword,
  finishNewPassword,
  linkWithPassword,
  linkWithProvider,
  resolveAccountLink,
  startEmailAccountLink,
} from '@features/auth/linkFlow';
import {
  AccountLinkRequired,
  useAccountLinkStore,
  type PendingLink,
} from '@features/auth/linking';

const mockClient = {
  auth: {
    signInWithPassword: jest.fn(),
    signInWithIdToken: jest.fn(),
    setSession: jest.fn(),
    linkIdentity: jest.fn(),
    unlinkIdentity: jest.fn(),
    getSession: jest.fn(),
    getUser: jest.fn(),
    signOut: jest.fn(() => Promise.resolve({ error: null })),
    updateUser: jest.fn(),
  },
};
jest.mock('@features/auth/linkApi', () => ({
  createLinkClient: jest.fn(() => mockClient),
  adoptSession: jest.fn(() => Promise.resolve()),
  checkProviderToken: jest.fn(),
  confirmLink: jest.fn(),
  setLinkPassword: jest.fn(),
  emailSignInMethod: jest.fn(),
}));
jest.mock('@features/auth/social', () => ({
  reauthenticateWithProvider: jest.fn(),
  googleBrowserSession: jest.fn(),
  continueAsNewAccount: jest.fn(() => Promise.resolve('Konah Quittman')),
}));
jest.mock('@features/auth/api', () => ({
  signInWithPassword: jest.fn(() => Promise.resolve({})),
}));
jest.mock('@store/appleName', () => ({
  forgetAppleName: jest.fn(() => Promise.resolve()),
}));
jest.mock('@lib', () => ({ isGoogleNativeConfigured: true }));

const linkApi = jest.requireMock('@features/auth/linkApi') as Record<string, jest.Mock>;
const social = jest.requireMock('@features/auth/social') as Record<string, jest.Mock>;
const api = jest.requireMock('@features/auth/api') as Record<string, jest.Mock>;
const appleName = jest.requireMock('@store/appleName') as Record<string, jest.Mock>;
const lib = jest.requireMock('@lib') as { isGoogleNativeConfigured: boolean };
const c = mockClient.auth;

const linkedSession = { access_token: 'at-linked', refresh_token: 'rt-linked' };
const appleAttempt = {
  provider: 'apple' as const,
  idToken: 'apple-token',
  email: 'sam@example.com',
  appleUserId: 'apple-user-1',
  appleName: 'Sam Lee',
};
const passwordLink: PendingLink = {
  kind: 'link',
  origin: 'onboarding',
  attempt: appleAttempt,
  email: 'sam@example.com',
  method: 'password',
};
const caught = async (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

beforeEach(() => {
  jest.clearAllMocks();
  lib.isGoogleNativeConfigured = true;
  useAccountLinkStore.getState().clear();
  c.signInWithPassword.mockResolvedValue({ data: {}, error: null });
  c.signInWithIdToken.mockResolvedValue({ data: {}, error: null });
  c.setSession.mockResolvedValue({ data: {}, error: null });
  c.linkIdentity.mockResolvedValue({ data: { session: linkedSession }, error: null });
  c.getSession.mockResolvedValue({
    data: { session: { access_token: 'at-old', refresh_token: 'rt-old' } },
  });
});

describe('email + password account: its password, then the new sign-in is added (p.15-16)', () => {
  it('signs in to THAT account on the link client, adds Apple to it, then opens it', async () => {
    useAccountLinkStore.getState().set(passwordLink);
    expect(await linkWithPassword(passwordLink, 'sam@example.com', 'Original 123')).toBe(
      'linked',
    );
    expect(c.signInWithPassword).toHaveBeenCalledWith({
      email: 'sam@example.com',
      password: 'Original 123',
    });
    expect(c.linkIdentity).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-token',
    });
    expect(linkApi.adoptSession).toHaveBeenCalledWith(linkedSession);
    // The app's own session changes only once, at the very end.
    expect(c.linkIdentity.mock.invocationCallOrder[0]).toBeLessThan(
      linkApi.adoptSession.mock.invocationCallOrder[0],
    );
    // Adds a way in, never removes one; the password is never touched.
    expect(c.unlinkIdentity).not.toHaveBeenCalled();
    expect(c.updateUser).not.toHaveBeenCalled();
    expect(useAccountLinkStore.getState().pending).toBeNull();
    // Apple's one-time name isn't needed: that account already has its own.
    expect(appleName.forgetAppleName).toHaveBeenCalledWith('apple-user-1');
  });

  it('a wrong password links nothing and opens nothing', async () => {
    c.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: { message: 'Invalid login credentials' },
    });
    const e = await caught(linkWithPassword(passwordLink, 'sam@example.com', 'nope'));
    expect(e).toBeInstanceOf(LinkFlowError);
    expect((e as LinkFlowError).reason).toBe('wrong_password');
    expect(c.linkIdentity).not.toHaveBeenCalled();
    expect(linkApi.adoptSession).not.toHaveBeenCalled();
  });

  it('when adding fails after the proof, the account still opens (the person proved it’s them)', async () => {
    c.linkIdentity.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'token expired' },
    });
    expect(await linkWithPassword(passwordLink, 'sam@example.com', 'Original 123')).toBe(
      'signed_in',
    );
    expect(linkApi.adoptSession).toHaveBeenCalledWith({
      access_token: 'at-old',
      refresh_token: 'rt-old',
    });
    expect(appleName.forgetAppleName).not.toHaveBeenCalled();
  });
});

describe('Google / Apple only account: re-authenticate through the ORIGINAL provider, then add (p.16)', () => {
  const googleLink: PendingLink = {
    kind: 'link',
    origin: 'signin',
    attempt: appleAttempt,
    email: 'gina@example.com',
    method: 'google',
  };

  it('the server confirms that sign-in IS this account before the app signs in with it', async () => {
    social.reauthenticateWithProvider.mockResolvedValueOnce({
      provider: 'google',
      id_token: 'g-proof',
    });
    linkApi.confirmLink.mockResolvedValueOnce({ ok: true });
    expect(await linkWithProvider(googleLink, 'google')).toBe('linked');
    expect(social.reauthenticateWithProvider).toHaveBeenCalledWith(
      'google',
      'gina@example.com',
    );
    expect(linkApi.confirmLink).toHaveBeenCalledWith('gina@example.com', {
      provider: 'google',
      id_token: 'g-proof',
    });
    expect(linkApi.confirmLink.mock.invocationCallOrder[0]).toBeLessThan(
      c.signInWithIdToken.mock.invocationCallOrder[0],
    );
    expect(c.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'g-proof',
    });
    expect(c.linkIdentity).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-token',
    });
  });

  it('another Google account or Apple ID is never signed in, created or linked', async () => {
    social.reauthenticateWithProvider.mockResolvedValueOnce({
      provider: 'google',
      id_token: 'other',
    });
    linkApi.confirmLink.mockResolvedValueOnce({ ok: false, reason: 'reauth_mismatch' });
    const e = await caught(linkWithProvider(googleLink, 'google'));
    expect((e as LinkFlowError).reason).toBe('reauth_mismatch');
    expect(c.signInWithIdToken).not.toHaveBeenCalled();
    expect(c.linkIdentity).not.toHaveBeenCalled();
    expect(linkApi.adoptSession).not.toHaveBeenCalled();
  });

  it('before native Google is configured: a browser Google sign-in on the link client, kept only if it is this account', async () => {
    lib.isGoogleNativeConfigured = false;
    social.googleBrowserSession.mockResolvedValueOnce({
      accessToken: 'at-g',
      refreshToken: 'rt-g',
    });
    linkApi.confirmLink.mockResolvedValueOnce({ ok: true });
    await linkWithProvider(googleLink, 'google');
    expect(social.googleBrowserSession).toHaveBeenCalledWith('gina@example.com');
    expect(c.setSession).toHaveBeenCalledWith({
      access_token: 'at-g',
      refresh_token: 'rt-g',
    });
    expect(linkApi.confirmLink).toHaveBeenCalledWith(
      'gina@example.com',
      { provider: 'google', access_token: 'at-g' },
      true,
    );
    expect(c.linkIdentity).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-token',
    });

    social.googleBrowserSession.mockResolvedValueOnce({
      accessToken: 'at-x',
      refreshToken: 'rt-x',
    });
    linkApi.confirmLink.mockResolvedValueOnce({ ok: false, reason: 'reauth_mismatch' });
    expect(
      ((await caught(linkWithProvider(googleLink, 'google'))) as LinkFlowError).reason,
    ).toBe('reauth_mismatch');
    expect(c.linkIdentity).toHaveBeenCalledTimes(1);
  });
});

describe('"Already have a LYSM account?" → yes (p.16)', () => {
  const fallback: PendingLink = {
    kind: 'fallback',
    origin: 'onboarding',
    relay: true,
    attempt: { provider: 'apple', idToken: 'apple-token', email: null },
  };

  it('Google: only an account that already has that Google sign-in is used', async () => {
    social.reauthenticateWithProvider.mockResolvedValue({
      provider: 'google',
      id_token: 'g-1',
    });
    linkApi.checkProviderToken.mockResolvedValueOnce({ status: 'new', relay: false });
    expect(
      ((await caught(linkWithProvider(fallback, 'google'))) as LinkFlowError).reason,
    ).toBe('no_account');
    expect(c.signInWithIdToken).not.toHaveBeenCalled();

    linkApi.checkProviderToken.mockResolvedValueOnce({ status: 'existing' });
    expect(await linkWithProvider(fallback, 'google')).toBe('linked');
    expect(c.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'g-1',
    });
    expect(c.linkIdentity).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-token',
    });
  });

  it('browser Google that only just created an account is not used (and signed out)', async () => {
    lib.isGoogleNativeConfigured = false;
    social.googleBrowserSession.mockResolvedValueOnce({
      accessToken: 'at',
      refreshToken: 'rt',
    });
    const t = '2026-10-21T10:00:00.000Z';
    c.getUser.mockResolvedValueOnce({
      data: {
        user: { created_at: t, last_sign_in_at: t, identities: [{ provider: 'google' }] },
      },
    });
    expect(
      ((await caught(linkWithProvider(fallback, 'google'))) as LinkFlowError).reason,
    ).toBe('no_account');
    expect(c.signOut).toHaveBeenCalled();
    expect(c.linkIdentity).not.toHaveBeenCalled();

    social.googleBrowserSession.mockResolvedValueOnce({
      accessToken: 'at',
      refreshToken: 'rt',
    });
    c.getUser.mockResolvedValueOnce({
      data: {
        user: {
          created_at: '2026-01-01T00:00:00.000Z',
          last_sign_in_at: t,
          identities: [{ provider: 'google' }],
        },
      },
    });
    expect(await linkWithProvider(fallback, 'google')).toBe('linked');
  });

  it('email + password: whatever account the person signs in to', async () => {
    expect(await linkWithPassword(fallback, ' me@example.com ', 'Mine 1234')).toBe(
      'linked',
    );
    expect(c.signInWithPassword).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'Mine 1234',
    });
  });
});

describe('Google / Apple account signing in with email + password: re-authenticate, THEN a new password (p.16)', () => {
  const setLink = {
    kind: 'set_password' as const,
    origin: 'signin' as const,
    email: 'gina@example.com',
    provider: 'google' as const,
  };

  it('step 1 only confirms (nothing is set); step 2 sets it with the ticket, then signs in with it', async () => {
    social.reauthenticateWithProvider.mockResolvedValueOnce({
      provider: 'google',
      id_token: 'g-proof',
    });
    linkApi.confirmLink.mockResolvedValueOnce({ ok: true, ticket: 'ticket-1' });
    expect(await confirmForNewPassword(setLink)).toBe('ticket-1');
    expect(linkApi.setLinkPassword).not.toHaveBeenCalled();

    linkApi.setLinkPassword.mockResolvedValueOnce({ ok: true });
    expect(await finishNewPassword('gina@example.com', 'ticket-1', 'Brand new 1')).toBe(
      'signed_in',
    );
    expect(linkApi.setLinkPassword).toHaveBeenCalledWith(
      'gina@example.com',
      'ticket-1',
      'Brand new 1',
    );
    expect(api.signInWithPassword).toHaveBeenCalledWith({
      email: 'gina@example.com',
      password: 'Brand new 1',
    });
  });

  it('a refused confirmation gives no ticket; a refused password signs nothing in', async () => {
    social.reauthenticateWithProvider.mockResolvedValueOnce({
      provider: 'google',
      id_token: 'x',
    });
    linkApi.confirmLink.mockResolvedValueOnce({ ok: false, reason: 'reauth_mismatch' });
    expect(((await caught(confirmForNewPassword(setLink))) as LinkFlowError).reason).toBe(
      'reauth_mismatch',
    );

    social.reauthenticateWithProvider.mockResolvedValueOnce({
      provider: 'google',
      id_token: 'x',
    });
    linkApi.confirmLink.mockResolvedValueOnce({ ok: true });
    expect(((await caught(confirmForNewPassword(setLink))) as LinkFlowError).reason).toBe(
      'has_password',
    );

    linkApi.setLinkPassword.mockResolvedValueOnce({
      ok: false,
      reason: 'invalid_ticket',
    });
    expect(
      (
        (await caught(
          finishNewPassword('gina@example.com', 't', 'Brand new 1'),
        )) as LinkFlowError
      ).reason,
    ).toBe('invalid_ticket');
    expect(api.signInWithPassword).not.toHaveBeenCalled();
  });

  it('a set password that can’t sign in is reported, not hidden', async () => {
    linkApi.setLinkPassword.mockResolvedValueOnce({ ok: true });
    api.signInWithPassword.mockRejectedValueOnce(new Error('network'));
    expect(await finishNewPassword('gina@example.com', 't', 'Brand new 1')).toBe(
      'set_only',
    );
  });

  it('startEmailAccountLink opens it only for a Google / Apple only account', async () => {
    const open = jest.fn();
    linkApi.emailSignInMethod.mockResolvedValueOnce({
      status: 'provider_only',
      provider: 'apple',
    });
    expect(await startEmailAccountLink(' Abe@Example.com ', 'onboarding', open)).toBe(
      'opened',
    );
    expect(open).toHaveBeenCalledTimes(1);
    expect(useAccountLinkStore.getState().pending).toEqual({
      kind: 'set_password',
      origin: 'onboarding',
      email: 'abe@example.com',
      provider: 'apple',
    });

    useAccountLinkStore.getState().clear();
    linkApi.emailSignInMethod.mockResolvedValueOnce({ status: 'none' });
    expect(await startEmailAccountLink('pat@example.com', 'signin', open)).toBe('none');
    expect(open).toHaveBeenCalledTimes(1);
    expect(useAccountLinkStore.getState().pending).toBeNull();
  });
});

describe('resolveAccountLink: what the sign-in screens do with a stopped sign-in', () => {
  const fallback = {
    kind: 'fallback' as const,
    origin: 'signin' as const,
    relay: false,
    attempt: { provider: 'google' as const, idToken: 'g', email: null },
  };
  const pressing = (label: string) =>
    jest.spyOn(Alert, 'alert').mockImplementationOnce((_t, _m, buttons) => {
      buttons?.find((b) => b.text === label)?.onPress?.();
    });

  it('an email match opens "Link your account" straight away', async () => {
    const open = jest.fn();
    expect(await resolveAccountLink(new AccountLinkRequired(passwordLink), open)).toEqual(
      { kind: 'opened' },
    );
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('no match asks "Already have a LYSM account?" first', async () => {
    const open = jest.fn();
    const alert = pressing('Yes, sign in');
    useAccountLinkStore.getState().set(fallback);
    expect(await resolveAccountLink(new AccountLinkRequired(fallback), open)).toEqual({
      kind: 'opened',
    });
    expect(alert).toHaveBeenCalledWith(
      'Already have a LYSM account?',
      'We didn’t find a LYSM account for this Google account. If you already have one, sign in to it and we’ll add Google to it.',
      expect.any(Array),
      expect.objectContaining({ cancelable: true }),
    );
    expect(open).toHaveBeenCalledTimes(1);
    expect(useAccountLinkStore.getState().pending).toEqual(fallback);

    pressing('No, create one');
    expect(await resolveAccountLink(new AccountLinkRequired(fallback), open)).toEqual({
      kind: 'created',
      appleName: 'Konah Quittman',
    });
    expect(social.continueAsNewAccount).toHaveBeenCalledWith(fallback);
    expect(useAccountLinkStore.getState().pending).toBeNull();

    pressing('Cancel');
    expect(await resolveAccountLink(new AccountLinkRequired(fallback), open)).toEqual({
      kind: 'cancelled',
    });
    expect(social.continueAsNewAccount).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('any other error is not a link', async () => {
    expect(await resolveAccountLink(new Error('network'), jest.fn())).toBeNull();
  });
});
