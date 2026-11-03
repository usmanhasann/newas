/**
 * The entry the Welcome back paywall's purple card shows (client revisions 10/14 p.37): "Use the
 * most recent entry that wasn't flagged by the concerning-words check. If they have no entries,
 * hide the card." Pure, so it's unit-tested.
 */
import type { CrisisKeyword } from '@app-types/database';
import { entryFlagged } from './firstReflection';

export interface LastEntryCandidate {
  note: string | null;
  local_date: string;
  crisis_flagged?: boolean | null;
}

/**
 * The newest entry (the list is newest first) that has words and wasn't flagged. null: there is
 * none, so the card is hidden. undefined: can't tell yet (the keyword list is still loading on a
 * server without the flag).
 */
export function pickLastEntry<T extends LastEntryCandidate>(
  entries: readonly T[],
  keywords: CrisisKeyword[] | null,
  detect: (text: string | null | undefined, keywords: CrisisKeyword[]) => unknown,
): T | null | undefined {
  for (const e of entries) {
    if (!e.note?.trim()) continue;
    const flagged = entryFlagged(e, keywords, detect);
    if (flagged === null) return undefined;
    if (!flagged) return e;
  }
  return null;
}
