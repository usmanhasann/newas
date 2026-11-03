/**
 * The Welcome back paywall's purple card (client revisions 10/14 p.37): "YOUR LAST ENTRY · SEP 30",
 * the first line of their most recent entry fully readable and the rest blurred, and the white pill
 * "Subscribe to open your journal." It uses the most recent entry that wasn't flagged by the
 * concerning-words check, and it is hidden when they have no entries.
 *
 * "First line" is the first line as the phone lays the entry out in the card (decision N16.33: the
 * PDF's rule). Until that's measured the whole entry stays blurred, so nothing locked shows early.
 */
import { useState } from 'react';
import { useEntries } from '@features/journal';
import { useCrisisKeywords, detectCrisis } from '@features/crisis';
import type { JournalEntry } from '@app-types/database';
import { PILL_SUBSCRIBE, lastEntryLabel, splitFirstLine } from '../paywallCopy';
import { pickLastEntry, type LastEntryCandidate } from '../lastEntry';
import { PreviewCard } from './PreviewCard';

function sameLines(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i]);
}

export function LastEntryCard() {
  const entriesQ = useEntries();
  const keywordsQ = useCrisisKeywords();
  const [measured, setMeasured] = useState<{ note: string; lines: string[] } | null>(
    null,
  );

  const firstPage = (entriesQ.data?.pages[0]?.items ?? []) as (JournalEntry &
    LastEntryCandidate)[];
  // The server's flag decides; on a server without it, the phone's keyword check does, and until
  // that list loads (or if it can't) the card stays hidden rather than risk a flagged entry.
  const entry = entriesQ.data
    ? pickLastEntry(firstPage, keywordsQ.data ?? null, detectCrisis)
    : undefined;
  if (!entry) return null;

  const note = (entry.note ?? '').trim();
  const lines = measured?.note === note ? measured.lines : null;
  const { first, rest } = splitFirstLine(note, lines);

  return (
    <PreviewCard
      testID="last-entry-card"
      label={lastEntryLabel(entry.local_date)}
      state="ready"
      readable={first}
      blurred={rest}
      blurLines={4}
      pill={PILL_SUBSCRIBE}
      measure={{
        text: note,
        onLines: (l) => {
          // Layout can report again with the same lines: only a change re-renders.
          if (measured?.note === note && sameLines(measured.lines, l)) return;
          setMeasured({ note, lines: l });
        },
      }}
    />
  );
}
