import { supabase } from '@lib';
import type { JournalEntry } from '@app-types/database';

export const ENTRIES_PAGE = 20;

/** Keyset cursor (created_at, id) — no OFFSET on this high-volume table (§5.1). */
export interface EntryCursor {
  created_at: string;
  id: string;
}

export interface CreateEntryInput {
  /** 1..3 distinct moods for this entry (spec §1.2). The server mirrors [0] to mood_slug. */
  mood_slugs: string[];
  note?: string | null;
  shared?: boolean;
  local_date: string;
}

export async function createEntry(
  userId: string,
  input: CreateEntryInput,
): Promise<JournalEntry> {
  const { data, error } = await supabase
    .from('journal_entries')
    .insert({
      user_id: userId,
      mood_slugs: input.mood_slugs,
      note: input.note ?? null,
      shared: input.shared ?? false,
      local_date: input.local_date,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function listEntries(
  userId: string,
  cursor?: EntryCursor,
): Promise<{ items: JournalEntry[]; nextCursor: EntryCursor | null }> {
  let q = supabase
    .from('journal_entries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(ENTRIES_PAGE);

  // Keyset predicate: created_at < c OR (created_at = c AND id < c.id)
  if (cursor) {
    q = q.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await q;
  if (error) throw error;
  const items = data ?? [];
  const last = items[items.length - 1];
  const nextCursor =
    items.length === ENTRIES_PAGE && last
      ? { created_at: last.created_at, id: last.id }
      : null;
  return { items, nextCursor };
}

export async function getEntry(id: string): Promise<JournalEntry | null> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Id of the FIRST entry the user wrote on a local calendar day (null if none), decides whether a
 * just-saved entry is that day's first. Read from journal_days, which remembers it permanently.
 */
export async function getFirstEntryIdOfDay(
  userId: string,
  localDate: string,
): Promise<string | null> {
  // journal_days keeps the day's FIRST entry even after it's deleted, so a later entry that day is
  // never mistaken for the first one.
  const { data, error } = await supabase
    .from('journal_days')
    .select('first_entry_id')
    .eq('user_id', userId)
    .eq('local_date', localDate)
    .maybeSingle();
  if (!error && data) return data.first_entry_id;
  // No day record to read (unreachable, or a server without journal_days yet): the day's earliest
  // entry is the best answer, so the first entry still gets its streak heading.
  const { data: earliest, error: entriesError } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('user_id', userId)
    .eq('local_date', localDate)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (entriesError) throw entriesError;
  return earliest?.id ?? null;
}

/**
 * The signed-in user's longest streak BEFORE the run that includes `endDate` (0 when there was
 * none): what the streak popup compares against for "Your longest streak yet" and starting over.
 */
export async function getPreviousLongestStreak(endDate: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_previous_longest_streak', { end_date: endDate });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function getTodayEntry(
  userId: string,
  localDate: string,
): Promise<JournalEntry | null> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('local_date', localDate)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Today's entries' mood lists, OLDEST FIRST — for the Home "Today's Mood" highlight (§3). Each
 * list is that entry's moods in tap order (mood_slugs, falling back to the legacy single
 * mood_slug). Lightweight select; ordered by created_at so the caller can dedupe into
 * first-selected order.
 */
export async function getTodayMoodLists(userId: string, localDate: string): Promise<string[][]> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('mood_slugs, mood_slug, created_at')
    .eq('user_id', userId)
    .eq('local_date', localDate)
    // (created_at, id) — a stable tiebreaker so two entries with the same timestamp keep a
    // deterministic oldest-first order (matches the keyset order used by listEntries).
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) =>
    r.mood_slugs && r.mood_slugs.length ? r.mood_slugs : r.mood_slug ? [r.mood_slug] : [],
  );
}

export type EntryPatch = Partial<
  Pick<JournalEntry, 'mood_slugs' | 'note' | 'shared' | 'ai_status' | 'ai_summary'>
>;

export async function updateEntry(id: string, patch: EntryPatch): Promise<JournalEntry> {
  const { data, error } = await supabase
    .from('journal_entries')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('journal_entries').delete().eq('id', id);
  if (error) throw error;
}
