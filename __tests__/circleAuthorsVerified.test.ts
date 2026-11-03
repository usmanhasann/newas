/**
 * Verified badges need the flag with every name (client revisions 10/14 p.5, N7.11 to N7.14, N7.19):
 * a post's author and "@" person, and each member of a circle, carry `verified` read live from
 * profiles on every load (never stored on the post or membership, so turning it off shows at once).
 * supabase is a chainable mock with per-table canned results.
 */
import { fetchReplies } from '@features/circles/postsApi';
import { fetchMembers } from '@features/circles/api';

jest.mock('@features/moderation', () => ({
  moderateCircleText: jest.fn(),
  scanCirclePost: jest.fn(),
}));

jest.mock('@lib', () => {
  const results: Record<string, { data: unknown; error: unknown }> = {};
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const builder = (table: string) => {
    const rec = (op: string, ...a: unknown[]) => {
      calls.push({ table, op, args: a });
      return chain;
    };
    const chain: Record<string, unknown> = {
      select: (...a: unknown[]) => rec('select', ...a),
      eq: (...a: unknown[]) => rec('eq', ...a),
      in: (...a: unknown[]) => rec('in', ...a),
      order: (...a: unknown[]) => rec('order', ...a),
      or: (...a: unknown[]) => rec('or', ...a),
      limit: (...a: unknown[]) => rec('limit', ...a),
      then: (resolve: (r: unknown) => void) => resolve(results[table] ?? { data: null, error: null }),
    };
    return chain;
  };
  return {
    supabase: { from: (t: string) => builder(t), rpc: jest.fn() },
    __results: results,
    __calls: calls,
  };
});

const lib = jest.requireMock('@lib') as {
  __results: Record<string, { data: unknown; error: unknown }>;
  __calls: { table: string; op: string; args: unknown[] }[];
};

const profileSelect = () =>
  lib.__calls.find((c) => c.table === 'profiles' && c.op === 'select')?.args[0] as string;

beforeEach(() => {
  lib.__calls.length = 0;
  for (const k of Object.keys(lib.__results)) delete lib.__results[k];
});

it('a post’s author and "@" person come with their verified flag', async () => {
  lib.__results.circle_posts = {
    data: [
      { id: 'r1', author_id: 'u1', mention_user_id: 'u2', created_at: '2026-10-20T10:00:00Z' },
    ],
    error: null,
  };
  lib.__results.profiles = {
    data: [
      { user_id: 'u1', display_name: 'Taylor Star', avatar_url: null, verified: true },
      { user_id: 'u2', display_name: 'Ben', avatar_url: null, verified: false },
    ],
    error: null,
  };
  lib.__results.post_reactions = { data: [], error: null };

  const { items } = await fetchReplies('p1', 'viewer');
  expect(profileSelect().split(',').map((s) => s.trim())).toContain('verified');
  expect(items[0]?.author).toMatchObject({ display_name: 'Taylor Star', verified: true });
  expect(items[0]?.mention).toMatchObject({ display_name: 'Ben', verified: false });
});

it('each member of a circle comes with their verified flag (member lists)', async () => {
  lib.__results.circle_members = {
    data: [
      { id: 'm1', circle_id: 'c1', user_id: 'u1', role: 'owner', status: 'approved' },
      { id: 'm2', circle_id: 'c1', user_id: 'u2', role: 'member', status: 'approved' },
    ],
    error: null,
  };
  lib.__results.profiles = {
    data: [
      { user_id: 'u1', display_name: 'Taylor Star', avatar_url: null, bio: null, verified: true },
      { user_id: 'u2', display_name: 'Ben', avatar_url: null, bio: null, verified: false },
    ],
    error: null,
  };

  const members = await fetchMembers('c1');
  expect(profileSelect().split(',').map((s) => s.trim())).toContain('verified');
  expect(members.map((m) => [m.membership.user_id, m.profile?.verified])).toEqual([
    ['u1', true],
    ['u2', false],
  ]);
});
