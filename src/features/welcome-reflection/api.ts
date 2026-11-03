/**
 * The "Welcome reflection" (client revisions 10/14 p.33 to p.35, N15): the first reflection written
 * from the person's onboarding answers when they skip the first check in (or it had concerning
 * words). Written by the welcome-reflection Edge Function; the paywall shows its first sentence and
 * the Journal tab keeps it as a card until the person deletes it.
 * Server: migration 20261022080000_welcome_reflection (get_welcome_reflection /
 * delete_welcome_reflection) + supabase/functions/welcome-reflection.
 */
import { z } from 'zod';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@lib';

export type WelcomeReflectionStatus = 'pending' | 'ready' | 'failed' | 'deleted';

export interface WelcomeReflection {
  status: WelcomeReflectionStatus;
  body: string | null;
  createdAt: string;
  updatedAt: string;
}

const statusSchema = z.enum(['pending', 'ready', 'failed', 'deleted']);

const rowSchema = z.object({
  status: statusSchema,
  body: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const resultSchema = z.object({
  status: statusSchema,
  body: z.string().nullable().optional(),
});

/** The functions aren't in the shared generated types (src/types/database.ts) yet; rows are checked with Zod. */
type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: PostgrestError | null }>;

const rpc = (): UntypedRpc => supabase.rpc.bind(supabase) as unknown as UntypedRpc;

/**
 * The caller's welcome reflection, or null when there is none. A server without the function yet
 * (the app was updated first) reads as none.
 */
export async function fetchWelcomeReflection(): Promise<WelcomeReflection | null> {
  const { data, error } = await rpc()('get_welcome_reflection');
  if (error) {
    if (error.code === 'PGRST202') return null;
    throw error;
  }
  const rows = z.array(rowSchema).parse(data ?? []);
  const row = rows[0];
  if (!row) return null;
  return { status: row.status, body: row.body, createdAt: row.created_at, updatedAt: row.updated_at };
}

/** Ask the server to write it (idempotent: a ready or deleted one is returned as is). */
export async function requestWelcomeReflection(): Promise<{
  status: WelcomeReflectionStatus;
  body: string | null;
}> {
  const { data, error } = await supabase.functions.invoke('welcome-reflection', { body: {} });
  if (error) throw error;
  const parsed = resultSchema.parse(data);
  return { status: parsed.status, body: parsed.body ?? null };
}

/** The card's ••• > Delete. Permanent: the text is removed and it is never written again. */
export async function deleteWelcomeReflection(): Promise<void> {
  const { error } = await rpc()('delete_welcome_reflection');
  if (error) throw error;
}
