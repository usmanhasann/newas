/**
 * Verified owners of Public circles, for Discover (client revisions 10/14 p.5, N7: "In Discover,
 * Public Circles owned by a verified user should show the badge next to the owner's name").
 * Someone browsing Discover isn't in those circles, so profiles' RLS hides the owner from them; the
 * server function verified_circle_owners (migration 20261022060000_verified_badges) returns ONLY
 * the verified owners of PUBLIC circles, at most 200 circles per call.
 */
import { z } from 'zod';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@lib';
import { chunk } from '@utils/chunk';

/** The server reads at most this many circles per call. */
export const VERIFIED_OWNERS_BATCH = 200;

export interface VerifiedOwner {
  ownerId: string;
  name: string;
}

const ownerRow = z.object({
  circle_id: z.string().min(1),
  owner_id: z.string().min(1),
  display_name: z.string().nullable(),
});

/** The function isn't in the shared generated types (src/types/database.ts) yet; rows are checked with Zod. */
type UntypedRpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: PostgrestError | null }>;

/**
 * Circle id → its verified owner, for the circles given. Circles whose owner isn't verified (or
 * that aren't Public) are simply left out. A server without the function yet (the app was updated
 * first) shows no badges rather than failing Discover.
 */
export async function fetchVerifiedCircleOwners(
  circleIds: readonly string[],
): Promise<Map<string, VerifiedOwner>> {
  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
  const batches = await Promise.all(
    chunk([...new Set(circleIds)], VERIFIED_OWNERS_BATCH).map(async (ids) => {
      const { data, error } = await rpc('verified_circle_owners', { p_circles: ids });
      if (error) {
        if (error.code === 'PGRST202') return [];
        throw error;
      }
      return z.array(ownerRow).parse(data ?? []);
    }),
  );
  const out = new Map<string, VerifiedOwner>();
  for (const row of batches.flat()) {
    const name = row.display_name?.trim();
    if (name) out.set(row.circle_id, { ownerId: row.owner_id, name });
  }
  return out;
}
