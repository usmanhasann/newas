/**
 * Discover's verified owners (client revisions 10/14 p.5, N7.18): fetchVerifiedCircleOwners asks
 * the server's verified_circle_owners function, 200 circles a call (the server's cap), each id once,
 * checks the rows (Zod), and maps circle → owner. A server without the function yet shows no
 * badges instead of breaking Discover; any other failure is a real error.
 */
import { fetchVerifiedCircleOwners, VERIFIED_OWNERS_BATCH } from '@features/circles/ownersApi';

const mockRpc = jest.fn();
jest.mock('@lib', () => ({
  supabase: { rpc: (...a: unknown[]) => mockRpc(...a) },
}));

beforeEach(() => mockRpc.mockReset());

it('maps each circle to its verified owner, leaving out rows with no name', async () => {
  mockRpc.mockResolvedValue({
    data: [
      { circle_id: 'c1', owner_id: 'u1', display_name: ' Taylor Star ' },
      { circle_id: 'c2', owner_id: 'u2', display_name: null },
    ],
    error: null,
  });
  const owners = await fetchVerifiedCircleOwners(['c1', 'c2', 'c3']);
  expect(mockRpc).toHaveBeenCalledWith('verified_circle_owners', { p_circles: ['c1', 'c2', 'c3'] });
  expect([...owners.entries()]).toEqual([['c1', { ownerId: 'u1', name: 'Taylor Star' }]]);
});

it('asks for at most 200 circles a call, each circle once', async () => {
  mockRpc.mockResolvedValue({ data: [], error: null });
  const ids = Array.from({ length: 450 }, (_, i) => `c${i}`);
  await fetchVerifiedCircleOwners([...ids, 'c0', 'c1']);
  expect(VERIFIED_OWNERS_BATCH).toBe(200);
  const sizes = mockRpc.mock.calls.map((c) => (c[1] as { p_circles: string[] }).p_circles.length);
  expect(sizes).toEqual([200, 200, 50]);
  const asked = mockRpc.mock.calls.flatMap((c) => (c[1] as { p_circles: string[] }).p_circles);
  expect(new Set(asked).size).toBe(450);
});

it('no circles: no request', async () => {
  const owners = await fetchVerifiedCircleOwners([]);
  expect(owners.size).toBe(0);
  expect(mockRpc).not.toHaveBeenCalled();
});

it('a server without the function yet: no badges, no error', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
  await expect(fetchVerifiedCircleOwners(['c1'])).resolves.toEqual(new Map());
});

it('any other failure, or rows of the wrong shape, is an error', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: { code: '500', message: 'boom' } });
  await expect(fetchVerifiedCircleOwners(['c1'])).rejects.toMatchObject({ message: 'boom' });
  mockRpc.mockResolvedValueOnce({ data: [{ circle_id: 'c1' }], error: null });
  await expect(fetchVerifiedCircleOwners(['c1'])).rejects.toBeTruthy();
});
