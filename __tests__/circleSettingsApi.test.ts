/**
 * Circle settings data layer (client spec 2026-09-29): creating a circle no longer sends a
 * reflection tone, the description is saved trimmed (blank → none), and deleting goes through the
 * delete_circle RPC, with its "too big to delete" refusal surfaced as its own error.
 */
import {
  createCircle,
  updateCircle,
  deleteCircle,
  CircleTooBigToDeleteError,
} from '@features/circles/api';

jest.mock('@lib', () => {
  const state = {
    calls: [] as { table: string; op: string; args: unknown[] }[],
    rpcResult: { data: null as unknown, error: null as unknown },
  };
  const builder = (table: string) => {
    const rec = (op: string, ...a: unknown[]) => {
      state.calls.push({ table, op, args: a });
      return chain;
    };
    const chain: Record<string, unknown> = {
      insert: (...a: unknown[]) => rec('insert', ...a),
      update: (...a: unknown[]) => rec('update', ...a),
      select: (...a: unknown[]) => rec('select', ...a),
      eq: (...a: unknown[]) => rec('eq', ...a),
      single: () => Promise.resolve({ data: { id: 'c1' }, error: null }),
    };
    return chain;
  };
  const rpc = jest.fn((..._a: unknown[]) => Promise.resolve(state.rpcResult));
  return { supabase: { from: (t: string) => builder(t), rpc }, __state: state };
});

const lib = jest.requireMock('@lib') as {
  supabase: { rpc: jest.Mock };
  __state: {
    calls: { table: string; op: string; args: unknown[] }[];
    rpcResult: { data: unknown; error: unknown };
  };
};

beforeEach(() => {
  lib.__state.calls.length = 0;
  lib.__state.rpcResult = { data: null, error: null };
  lib.supabase.rpc.mockClear();
});

it('creates a circle without any reflection tone', async () => {
  await createCircle('u1', '  Runners ', 'public', ' We run. ');
  const insert = lib.__state.calls.find((c) => c.table === 'circles' && c.op === 'insert');
  expect(insert?.args[0]).toEqual({
    owner_id: 'u1',
    name: 'Runners',
    type: 'public',
    description: 'We run.',
  });
});

it('saves the name and description trimmed, and a blank description as none', async () => {
  await updateCircle('c1', { name: ' Runners Club ', description: '  Morning miles.  ' });
  await updateCircle('c1', { description: '   ' });
  const updates = lib.__state.calls.filter((c) => c.table === 'circles' && c.op === 'update');
  expect(updates.map((u) => u.args[0])).toEqual([
    { name: 'Runners Club', description: 'Morning miles.' },
    { description: null },
  ]);
});

it('deletes through delete_circle', async () => {
  await deleteCircle('c1');
  expect(lib.supabase.rpc).toHaveBeenCalledWith('delete_circle', { p_circle: 'c1' });
});

it('turns the server’s "too big to delete" refusal into its own error', async () => {
  lib.__state.rpcResult = {
    data: null,
    error: { code: 'P0001', message: 'circle_too_big_to_delete' },
  };
  await expect(deleteCircle('c1')).rejects.toBeInstanceOf(CircleTooBigToDeleteError);
  await expect(deleteCircle('c1')).rejects.toThrow(
    'This circle has 5 or more members, so it can only be archived.',
  );
});

it('passes any other failure through unchanged', async () => {
  const failure = { code: '42501', message: 'only the owner can delete this circle' };
  lib.__state.rpcResult = { data: null, error: failure };
  await expect(deleteCircle('c1')).rejects.toBe(failure);
});
