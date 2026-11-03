// Concerning words (client revisions 10/14 p.36, N18): an entry whose text has a crisis keyword is
// never sent to any AI. The database decides (journal_entries.crisis_flagged, kept by a trigger on
// every save and every keyword list change, and crisis_flagged_entries / crisis_words_match for a
// re-check against the list right before anything is sent). These helpers apply that answer to what
// an edge function is about to send. No Deno APIs, so Jest tests the SAME source the functions use.

/** Calls a database function (the service-role client's `rpc`). */
export type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: unknown }>;

export interface EntryText {
  id: string;
  note: string | null;
  crisis_flagged?: boolean | null;
}

/** Whether this entry must never reach an AI: flagged on its row, or by the re-check just now. */
export function isCrisisFlagged(
  entry: { id: string; crisis_flagged?: boolean | null },
  flagged: ReadonlySet<string>,
): boolean {
  return entry.crisis_flagged === true || flagged.has(entry.id);
}

/** Earlier entries a reflection may look back on: a flagged one is left out entirely. */
export function withoutFlaggedEntries<T extends EntryText>(
  rows: readonly T[],
  flagged: ReadonlySet<string>,
): T[] {
  return rows.filter((r) => !isCrisisFlagged(r, flagged));
}

/**
 * A period's entries for its weekly, monthly or yearly reflection: a flagged entry still counts, with
 * its moods, but its words are left out (as if no note was written), so they never reach the AI.
 */
export function withFlaggedNotesLeftOut<T extends EntryText>(
  rows: readonly T[],
  flagged: ReadonlySet<string>,
): T[] {
  return rows.map((r) => (isCrisisFlagged(r, flagged) ? { ...r, note: null } : r));
}

/**
 * Which of these entries must not reach an AI, asked of the database right now. Throws when it
 * can't answer, so the caller sends nothing (fails closed).
 */
export async function flaggedEntryIds(rpc: Rpc, ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await rpc('crisis_flagged_entries', { p_ids: ids });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('crisis check: unexpected answer');
  return new Set(
    data.map((x: unknown) =>
      typeof x === 'string'
        ? x
        : String(Object.values((x ?? {}) as Record<string, unknown>)[0] ?? ''),
    ),
  );
}

/** Whether this text has a crisis keyword (the database's list). Throws when it can't answer. */
export async function hasCrisisWords(rpc: Rpc, text: string): Promise<boolean> {
  if (!text.trim()) return false;
  const { data, error } = await rpc('crisis_words_match', { p_text: text });
  if (error) throw error;
  if (typeof data !== 'boolean') throw new Error('crisis check: unexpected answer');
  return data;
}
