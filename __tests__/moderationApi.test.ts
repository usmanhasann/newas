/**
 * System 1 — Circles moderation client service (the plumbing the posting/report/appeal UIs call).
 * Verifies the pre-post gate's prescreen gating + fail-open, that report/appeal write the right rows,
 * and that there is no per-person block/mute any more (client spec 2026-09-29). supabase + the
 * severe prescreen are mocked; the enforcement itself is server-side (Edge Function + engine,
 * tested separately).
 */
import {
  moderateCircleText,
  scanCirclePost,
  reportContent,
  submitAppeal,
  fetchMyCircleStanding,
} from '@features/moderation';
import * as moderation from '@features/moderation';

jest.mock('@lib', () => {
  const state = { result: { data: [] as unknown, error: null as unknown }, calls: [] as { table: string; op: string; args: unknown[] }[] };
  const rpc = jest.fn((..._a: unknown[]) => Promise.resolve({ data: 'ok', error: null }));
  const invoke = jest.fn((..._a: unknown[]) => Promise.resolve({ data: null, error: null }));
  const makeChain = (table: string) => {
    const rec = (op: string, ...args: unknown[]) => {
      state.calls.push({ table, op, args });
      return chain;
    };
    const chain: Record<string, unknown> = {
      insert: (...a: unknown[]) => rec('insert', ...a),
      upsert: (...a: unknown[]) => rec('upsert', ...a),
      delete: (...a: unknown[]) => rec('delete', ...a),
      select: (...a: unknown[]) => rec('select', ...a),
      update: (...a: unknown[]) => rec('update', ...a),
      eq: (...a: unknown[]) => rec('eq', ...a),
      then: (resolve: (r: unknown) => void) => resolve(state.result),
    };
    return chain;
  };
  return {
    supabase: {
      from: (t: string) => makeChain(t),
      rpc,
      functions: { invoke },
    },
    __state: state,
    __rpc: rpc,
    __invoke: invoke,
  };
});

jest.mock('@features/safety', () => {
  const severe = jest.fn(() => false);
  return { matchesSeverePrescreen: severe, __severe: severe };
});

const lib = jest.requireMock('@lib') as {
  __state: { result: { data: unknown; error: unknown }; calls: { table: string; op: string; args: unknown[] }[] };
  __rpc: jest.Mock;
  __invoke: jest.Mock;
};
const safety = jest.requireMock('@features/safety') as { __severe: jest.Mock };

beforeEach(() => {
  lib.__state.calls.length = 0;
  lib.__state.result = { data: [], error: null };
  lib.__invoke.mockReset().mockResolvedValue({ data: null, error: null });
  lib.__rpc.mockReset().mockResolvedValue({ data: 'ok', error: null });
  safety.__severe.mockReset().mockReturnValue(false);
});

describe('moderateCircleText — pre-post gate', () => {
  it('allows immediately without calling the AI when the severe prescreen misses', async () => {
    safety.__severe.mockReturnValue(false);
    const verdict = await moderateCircleText({ targetType: 'circle_post', text: 'a kind hello' });
    expect(verdict).toBe('allow');
    expect(lib.__invoke).not.toHaveBeenCalled();
  });

  it('blocks when the prescreen hits and the AI confirms severe', async () => {
    safety.__severe.mockReturnValue(true);
    lib.__invoke.mockResolvedValue({ data: { verdict: 'block' }, error: null });
    const verdict = await moderateCircleText({ targetType: 'circle_post', targetId: 'p1', text: "I'm going to kill you" });
    expect(verdict).toBe('block');
    expect(lib.__invoke).toHaveBeenCalledWith('moderate-circle-content', {
      body: { mode: 'pre_post', target_type: 'circle_post', target_id: 'p1', text: "I'm going to kill you" },
    });
  });

  it('fails OPEN (allow) when the prescreen hits but the confirm errors', async () => {
    safety.__severe.mockReturnValue(true);
    lib.__invoke.mockRejectedValue(new Error('down'));
    const verdict = await moderateCircleText({ targetType: 'circle_post', text: "I'm going to kill you" });
    expect(verdict).toBe('allow');
  });
});

describe('scanCirclePost — async post-scan', () => {
  it('invokes the post_scan mode and never throws on failure', async () => {
    lib.__invoke.mockRejectedValue(new Error('down'));
    await expect(scanCirclePost({ targetType: 'circle_post', targetId: 'p1', text: 'hi' })).resolves.toBeUndefined();
  });
});

describe('report / appeal write the right rows (no block)', () => {
  it('reportContent inserts into circle_reports', async () => {
    await reportContent({ reporterId: 'u1', reportedUserId: 'u2', targetType: 'circle_post', targetId: 'p1', reason: 'abuse' });
    const call = lib.__state.calls.find((c) => c.table === 'circle_reports' && c.op === 'insert');
    expect(call?.args[0]).toEqual({
      reporter_id: 'u1',
      reported_user_id: 'u2',
      target_type: 'circle_post',
      target_id: 'p1',
      reason: 'abuse',
    });
  });

  it('offers no block or mute of a person', () => {
    for (const gone of ['setBlock', 'removeBlock', 'fetchMyBlocks']) {
      expect(moderation).not.toHaveProperty(gone);
    }
  });

  it('submitAppeal inserts into moderation_appeals', async () => {
    await submitAppeal({ userId: 'u1', strikeId: 's1', message: 'please review' });
    const call = lib.__state.calls.find((c) => c.table === 'moderation_appeals' && c.op === 'insert');
    expect(call?.args[0]).toEqual({
      user_id: 'u1',
      strike_id: 's1',
      suspension_id: null,
      message: 'please review',
    });
  });
});

describe('fetchMyCircleStanding', () => {
  it('returns the standing from the rpc', async () => {
    lib.__rpc.mockResolvedValue({ data: 'suspended', error: null });
    expect(await fetchMyCircleStanding()).toBe('suspended');
    expect(lib.__rpc).toHaveBeenCalledWith('my_circle_standing');
  });

  it('defaults to "ok" when the rpc returns null', async () => {
    lib.__rpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchMyCircleStanding()).toBe('ok');
  });
});
