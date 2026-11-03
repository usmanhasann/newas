/**
 * Phase 4 — redeeming an invite code now returns the resulting membership status so the client can
 * tell an immediate 'approved' (public) join from a 'requested' (private, pending-approval) one.
 * joinByCode maps the RPC's json payload to a typed result, and returns null for a non-match.
 */
import { joinByCode } from '@features/circles/api';

const mockRpc = jest.fn();
jest.mock('@lib', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

beforeEach(() => mockRpc.mockReset());

describe('joinByCode', () => {
  it('maps an approved (public) redemption to { circleId, status, name }', async () => {
    mockRpc.mockResolvedValue({ data: { circle_id: 'c1', status: 'approved', name: 'Runners' }, error: null });
    const result = await joinByCode('ABC123');
    expect(mockRpc).toHaveBeenCalledWith('redeem_invite_code', { code: 'ABC123' });
    expect(result).toEqual({ circleId: 'c1', status: 'approved', name: 'Runners' });
  });

  it('surfaces a requested (private) redemption as status "requested"', async () => {
    mockRpc.mockResolvedValue({ data: { circle_id: 'c2', status: 'requested', name: 'Inner' }, error: null });
    expect(await joinByCode('XYZ')).toEqual({ circleId: 'c2', status: 'requested', name: 'Inner' });
  });

  it('returns null when the code matches no circle (or the caller is banned)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await joinByCode('nope')).toBeNull();
  });

  it('throws when the RPC errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(joinByCode('x')).rejects.toBeTruthy();
  });
});
