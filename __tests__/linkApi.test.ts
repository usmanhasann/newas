/**
 * Account linking data access (N4): the account-link replies are validated (Zod) and mapped; the
 * pre-check fails closed except when the function isn't deployed yet; the link client never keeps
 * or refreshes a session by itself; the app's session changes only through adoptSession.
 */
import {
  LinkServiceError,
  adoptSession,
  checkProviderToken,
  confirmLink,
  createLinkClient,
  emailSignInMethod,
  setLinkPassword,
} from '@features/auth/linkApi';

const mockInvoke = jest.fn();
const mockSetSession = jest.fn(() => Promise.resolve({ data: {}, error: null }));
jest.mock('@lib', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    auth: { setSession: (...a: unknown[]) => mockSetSession(...(a as [])) },
  },
  env: { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon-key' },
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: {} })),
}));
const { createClient } = jest.requireMock('@supabase/supabase-js') as {
  createClient: jest.Mock;
};

const reply = (data: unknown) => mockInvoke.mockResolvedValueOnce({ data, error: null });
const failure = (status: number) =>
  mockInvoke.mockResolvedValueOnce({ data: null, error: { context: { status } } });

beforeEach(() => jest.clearAllMocks());

describe('checkProviderToken', () => {
  it('maps each answer, lower-casing the matched email', async () => {
    reply({ status: 'existing' });
    expect(await checkProviderToken('google', 't')).toEqual({ status: 'existing' });
    reply({ status: 'new', relay: true });
    expect(await checkProviderToken('apple', 't')).toEqual({
      status: 'new',
      relay: true,
    });
    reply({ status: 'link_required', method: 'apple', email: 'Abe@Example.com' });
    expect(await checkProviderToken('google', 't')).toEqual({
      status: 'link_required',
      method: 'apple',
      email: 'abe@example.com',
    });
    reply({ status: 'email_unverified', side: 'account' });
    expect(await checkProviderToken('google', 't')).toEqual({
      status: 'email_unverified',
      side: 'account',
    });
    expect(mockInvoke).toHaveBeenCalledWith('account-link', {
      body: { action: 'check', provider: 'google', id_token: 't' },
    });
  });

  it('not deployed (404) = sign in as before; anything else fails closed', async () => {
    failure(404);
    expect(await checkProviderToken('apple', 't')).toEqual({ status: 'unavailable' });
    failure(500);
    await expect(checkProviderToken('apple', 't')).rejects.toBeInstanceOf(
      LinkServiceError,
    );
    reply({ status: 'link_required', method: 'facebook', email: 'x@example.com' });
    await expect(checkProviderToken('apple', 't')).rejects.toMatchObject({
      code: 'link_unavailable',
    });
    reply({ error: 'too_many', retry_after: 900 });
    await expect(checkProviderToken('apple', 't')).rejects.toMatchObject({
      code: 'link_too_many',
    });
    reply({ error: 'not_configured' });
    await expect(checkProviderToken('google', 't')).rejects.toMatchObject({
      code: 'link_not_configured',
    });
  });
});

it('emailSignInMethod names the provider only for a Google / Apple only account; unknown on any problem', async () => {
  reply({ status: 'provider_only', provider: 'google' });
  expect(await emailSignInMethod(' gina@example.com ')).toEqual({
    status: 'provider_only',
    provider: 'google',
  });
  expect(mockInvoke).toHaveBeenLastCalledWith('account-link', {
    body: { action: 'email', email: 'gina@example.com' },
  });
  reply({ status: 'none' });
  expect(await emailSignInMethod('a@example.com')).toEqual({ status: 'none' });
  reply({ error: 'too_many' });
  expect(await emailSignInMethod('a@example.com')).toEqual({ status: 'unknown' });
  failure(404);
  expect(await emailSignInMethod('a@example.com')).toEqual({ status: 'unknown' });
  mockInvoke.mockRejectedValueOnce(new Error('offline'));
  expect(await emailSignInMethod('a@example.com')).toEqual({ status: 'unknown' });
});

it('confirmLink sends the proof (and keep_session only when asked) and maps refusals', async () => {
  reply({ status: 'confirmed', ticket: 'tk' });
  expect(
    await confirmLink('g@example.com', { provider: 'google', id_token: 'x' }),
  ).toEqual({ ok: true, ticket: 'tk' });
  expect(mockInvoke).toHaveBeenLastCalledWith('account-link', {
    body: {
      action: 'confirm',
      email: 'g@example.com',
      proof: { provider: 'google', id_token: 'x' },
    },
  });
  reply({ status: 'confirmed' });
  await confirmLink('g@example.com', { provider: 'google', access_token: 'a' }, true);
  expect(mockInvoke).toHaveBeenLastCalledWith('account-link', {
    body: {
      action: 'confirm',
      email: 'g@example.com',
      proof: { provider: 'google', access_token: 'a' },
      keep_session: true,
    },
  });
  reply({ error: 'reauth_mismatch' });
  expect(
    await confirmLink('g@example.com', { provider: 'apple', id_token: 'x' }),
  ).toEqual({
    ok: false,
    reason: 'reauth_mismatch',
  });
  reply({ error: 'something_new' });
  expect(
    await confirmLink('g@example.com', { provider: 'apple', id_token: 'x' }),
  ).toEqual({ ok: false, reason: 'unknown' });
});

it('setLinkPassword sends the ticket and maps refusals', async () => {
  reply({ status: 'set', email: 'g@example.com' });
  expect(await setLinkPassword('g@example.com', 'tk', 'Brand new 1')).toEqual({
    ok: true,
  });
  expect(mockInvoke).toHaveBeenLastCalledWith('account-link', {
    body: {
      action: 'set_password',
      email: 'g@example.com',
      ticket: 'tk',
      new_password: 'Brand new 1',
    },
  });
  reply({ error: 'has_password' });
  expect(await setLinkPassword('g@example.com', 'tk', 'Brand new 1')).toEqual({
    ok: false,
    reason: 'has_password',
  });
});

it('the link client keeps nothing and never refreshes by itself; adoptSession makes it the app session', async () => {
  createLinkClient();
  expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'anon-key', {
    auth: expect.objectContaining({
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    }),
  });
  await adoptSession({ access_token: 'a', refresh_token: 'r' } as never);
  expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
});
