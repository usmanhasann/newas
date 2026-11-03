/**
 * The welcome reflection's data layer (client revisions 10/14 p.33 to p.35, N15): rows are checked
 * with Zod, a server without the function yet reads as "none" (the app can ship first), the Edge
 * Function's answer is validated, and Delete calls the server's delete.
 */
import {
  deleteWelcomeReflection,
  fetchWelcomeReflection,
  requestWelcomeReflection,
} from '@features/welcome-reflection/api';

const mockRpc = jest.fn();
const mockInvoke = jest.fn();

jest.mock('@lib', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
  },
}));

beforeEach(() => {
  mockRpc.mockReset();
  mockInvoke.mockReset();
});

it('reads the caller’s row', async () => {
  mockRpc.mockResolvedValue({
    data: [{ status: 'ready', body: 'Hi.', created_at: '2026-10-22T10:00:00Z', updated_at: '2026-10-22T10:01:00Z' }],
    error: null,
  });
  await expect(fetchWelcomeReflection()).resolves.toEqual({
    status: 'ready',
    body: 'Hi.',
    createdAt: '2026-10-22T10:00:00Z',
    updatedAt: '2026-10-22T10:01:00Z',
  });
  expect(mockRpc).toHaveBeenCalledWith('get_welcome_reflection');
});

it('none: no row, or a server without the function yet', async () => {
  mockRpc.mockResolvedValue({ data: [], error: null });
  await expect(fetchWelcomeReflection()).resolves.toBeNull();
  mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
  await expect(fetchWelcomeReflection()).resolves.toBeNull();
});

it('rejects a malformed row and other errors', async () => {
  mockRpc.mockResolvedValue({ data: [{ status: 'weird', body: 1 }], error: null });
  await expect(fetchWelcomeReflection()).rejects.toThrow();
  mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } });
  await expect(fetchWelcomeReflection()).rejects.toMatchObject({ code: '42501' });
});

it('asks the Edge Function and validates its answer', async () => {
  mockInvoke.mockResolvedValue({ data: { status: 'pending', body: null }, error: null });
  await expect(requestWelcomeReflection()).resolves.toEqual({ status: 'pending', body: null });
  expect(mockInvoke).toHaveBeenCalledWith('welcome-reflection', { body: {} });

  mockInvoke.mockResolvedValue({ data: { status: 'ready' }, error: null });
  await expect(requestWelcomeReflection()).resolves.toEqual({ status: 'ready', body: null });

  mockInvoke.mockResolvedValue({ data: { status: 'done' }, error: null });
  await expect(requestWelcomeReflection()).rejects.toThrow();

  mockInvoke.mockResolvedValue({ data: null, error: new Error('rate_limited') });
  await expect(requestWelcomeReflection()).rejects.toThrow('rate_limited');
});

it('deletes through the server', async () => {
  mockRpc.mockResolvedValue({ data: null, error: null });
  await deleteWelcomeReflection();
  expect(mockRpc).toHaveBeenCalledWith('delete_welcome_reflection');
  mockRpc.mockResolvedValue({ data: null, error: { code: '28000', message: 'no' } });
  await expect(deleteWelcomeReflection()).rejects.toMatchObject({ code: '28000' });
});
