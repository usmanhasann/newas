/**
 * Sign-in & Security data access (N5): what each call sends to the Edge Functions and how their
 * answers map to typed results. The server checks everything again; the app never sends a password
 * where it isn't needed.
 */
import * as api from '@features/security/api';

const mockInvoke = jest.fn();
const mockRpc = jest.fn();
const mockSignIn = jest.fn();
const mockRefresh = jest.fn();
jest.mock('@lib', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    rpc: (...a: unknown[]) => mockRpc(...a),
    auth: {
      signInWithPassword: (...a: unknown[]) => mockSignIn(...a),
      refreshSession: (...a: unknown[]) => mockRefresh(...a),
    },
  },
}));

const reply = (data: unknown) => mockInvoke.mockResolvedValueOnce({ data, error: null });

beforeEach(() => jest.clearAllMocks());

describe('fetchSignInMethods', () => {
  it('reads the caller’s own methods from the RPC', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        email: 'sam@example.com',
        has_password: true,
        providers: ['email', 'google'],
      },
      error: null,
    });
    expect(await api.fetchSignInMethods()).toEqual({
      email: 'sam@example.com',
      hasPassword: true,
      providers: ['email', 'google'],
    });
    expect(mockRpc).toHaveBeenCalledWith('my_sign_in_methods');
  });

  it('throws on an error so the screen can offer a retry', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    await expect(api.fetchSignInMethods()).rejects.toThrow('offline');
  });
});

describe('change email', () => {
  it('request sends the current password and the new address, nothing else', async () => {
    reply({ status: 'sent', email: 'new@example.com' });
    expect(
      await api.requestEmailChange({
        newEmail: 'new@example.com',
        currentPassword: 'pw',
      }),
    ).toEqual({ ok: true, email: 'new@example.com' });
    expect(mockInvoke).toHaveBeenCalledWith('change-email', {
      body: { action: 'request', new_email: 'new@example.com', current_password: 'pw' },
    });
  });

  it('a relay address sends the Apple proof instead of a password', async () => {
    reply({ status: 'sent', email: 'me@gmail.com' });
    await api.requestEmailChange({
      newEmail: 'me@gmail.com',
      reauth: { provider: 'apple', id_token: 'tok' },
    });
    expect(mockInvoke).toHaveBeenCalledWith('change-email', {
      body: {
        action: 'request',
        new_email: 'me@gmail.com',
        reauth: { provider: 'apple', id_token: 'tok' },
      },
    });
  });

  it('maps refusals', async () => {
    reply({ error: 'wrong_password', attempts_left: 2 });
    expect(
      await api.requestEmailChange({ newEmail: 'n@e.co', currentPassword: 'x' }),
    ).toEqual({
      ok: false,
      reason: 'wrong_password',
      attemptsLeft: 2,
    });
    reply({ error: 'email_taken' });
    expect(
      await api.requestEmailChange({ newEmail: 'n@e.co', currentPassword: 'x' }),
    ).toEqual({
      ok: false,
      reason: 'email_taken',
    });
    reply({ error: 'read_only', provider: 'google' });
    expect(await api.requestEmailChange({ newEmail: 'n@e.co' })).toEqual({
      ok: false,
      reason: 'read_only',
      provider: 'google',
    });
    reply({ error: 'email_not_configured' });
    expect(
      await api.requestEmailChange({ newEmail: 'n@e.co', currentPassword: 'x' }),
    ).toEqual({
      ok: false,
      reason: 'not_configured',
    });
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('network') });
    expect(
      await api.requestEmailChange({ newEmail: 'n@e.co', currentPassword: 'x' }),
    ).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('confirm sends the code for that address; the change is done when the server says so', async () => {
    reply({ status: 'changed', email: 'new@example.com' });
    expect(await api.confirmEmailChange('new@example.com', '123456')).toEqual({
      ok: true,
      email: 'new@example.com',
    });
    expect(mockInvoke).toHaveBeenCalledWith('change-email', {
      body: { action: 'confirm', new_email: 'new@example.com', code: '123456' },
    });
    reply({ error: 'invalid', attempts_left: 4 });
    expect(await api.confirmEmailChange('new@example.com', '000000')).toEqual({
      ok: false,
      reason: 'invalid',
      attemptsLeft: 4,
    });
  });
});

describe('passwords', () => {
  it('change sends the current and the new password', async () => {
    reply({ status: 'changed', email: 'sam@example.com' });
    expect(await api.changePassword('old pass', 'new password')).toEqual({
      ok: true,
      email: 'sam@example.com',
    });
    expect(mockInvoke).toHaveBeenCalledWith('update-password', {
      body: {
        action: 'change',
        current_password: 'old pass',
        new_password: 'new password',
      },
    });
    reply({ error: 'same_password' });
    expect(await api.changePassword('a', 'a')).toEqual({
      ok: false,
      reason: 'same_password',
    });
  });

  it('set sends the provider proof', async () => {
    reply({ status: 'set', email: 'g@gmail.com' });
    const proof = { provider: 'google' as const, id_token: 'gtok' };
    expect(await api.setPassword('first password', proof)).toEqual({
      ok: true,
      email: 'g@gmail.com',
    });
    expect(mockInvoke).toHaveBeenCalledWith('update-password', {
      body: { action: 'set', new_password: 'first password', reauth: proof },
    });
    reply({ error: 'reauth_expired' });
    expect(await api.setPassword('first password', proof)).toEqual({
      ok: false,
      reason: 'reauth_expired',
    });
  });

  it('signs this device in again with the new password', async () => {
    mockSignIn.mockResolvedValueOnce({ data: {}, error: null });
    expect(await api.signInAgain('sam@example.com', 'new password')).toBe(true);
    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'sam@example.com',
      password: 'new password',
    });
    mockSignIn.mockResolvedValueOnce({ data: {}, error: new Error('bad') });
    expect(await api.signInAgain('sam@example.com', 'new password')).toBe(false);
  });
});
