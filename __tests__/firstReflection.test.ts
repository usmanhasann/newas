/**
 * Which first reflection the main paywall shows and in what state (client revisions 10/14 p.33 to
 * p.35, N15), and which entry the Welcome back card shows (p.37, N16): flagged entries (N18) never
 * go to the AI and are never shown; the answers-based reflection covers Skip for now and flagged
 * check ins; "Writing your reflection..." / "Failed to load".
 */
import {
  entryFlagged,
  reflectionCard,
  reflectionSource,
  shouldStartWriting,
  sourceLabel,
  type FirstEntry,
} from '@features/subscription/firstReflection';
import { pickLastEntry } from '@features/subscription/lastEntry';
import { detectCrisis } from '@features/crisis/matcher';
import type { CrisisKeyword } from '@app-types/database';

const KEYWORDS: CrisisKeyword[] = [
  {
    id: 'k1',
    phrase: 'end it all',
    match_type: 'contains',
    severity: 'critical',
    is_active: true,
  } as CrisisKeyword,
];

const entry = (over: Partial<FirstEntry> = {}): FirstEntry => ({
  note: 'Calm morning walk.',
  ai_status: 'ready',
  ai_summary: 'I felt calm on my walk. The quiet stayed with me.',
  ...over,
});

describe('entryFlagged', () => {
  it('the server flag decides when the server has it (N18)', () => {
    expect(entryFlagged(entry({ crisis_flagged: true, note: 'fine' }), null, detectCrisis)).toBe(true);
    expect(entryFlagged(entry({ crisis_flagged: false, note: 'I want to end it all' }), null, detectCrisis)).toBe(
      false,
    );
  });

  it('otherwise the phone’s keyword check; undecided until the list loads', () => {
    expect(entryFlagged(entry({ note: 'I want to end it all' }), KEYWORDS, detectCrisis)).toBe(true);
    expect(entryFlagged(entry({ note: 'A good day' }), KEYWORDS, detectCrisis)).toBe(false);
    expect(entryFlagged(entry({ note: 'A good day' }), null, detectCrisis)).toBeNull();
  });
});

describe('reflectionSource', () => {
  const base = { flagged: false, keywordsFailed: false, entryFailed: false };

  it('Skip for now (no entry): the answers (N15.07)', () => {
    expect(reflectionSource({ ...base, entryId: null, entry: null })).toBe('answers');
  });

  it('they journaled: the entry (N15.05)', () => {
    expect(reflectionSource({ ...base, entryId: 'e1', entry: entry() })).toBe('entry');
  });

  it('a flagged entry: the answers, never the entry (N15.72)', () => {
    expect(reflectionSource({ ...base, entryId: 'e1', entry: entry(), flagged: true })).toBe('answers');
  });

  it('waits while the entry or the keyword check is loading', () => {
    expect(reflectionSource({ ...base, entryId: 'e1', entry: undefined })).toBeNull();
    expect(reflectionSource({ ...base, entryId: 'e1', entry: entry(), flagged: null })).toBeNull();
  });

  it('an entry that can’t be checked or read falls back to the answers (never sent unchecked)', () => {
    expect(
      reflectionSource({ ...base, entryId: 'e1', entry: entry(), flagged: null, keywordsFailed: true }),
    ).toBe('answers');
    expect(reflectionSource({ ...base, entryId: 'e1', entry: null })).toBe('answers');
    expect(reflectionSource({ ...base, entryId: 'e1', entry: undefined, entryFailed: true })).toBe('answers');
  });

  it('labels: WRITTEN FOR YOU / BASED ON YOUR ANSWERS (N15.17, N15.18); none while unknown', () => {
    expect(sourceLabel('entry')).toBe('WRITTEN FOR YOU');
    expect(sourceLabel('answers')).toBe('BASED ON YOUR ANSWERS');
    expect(sourceLabel(null)).toBeNull();
  });
});

describe('reflectionCard', () => {
  const none = { requestFailed: false, stalled: false, welcome: undefined };

  it('entry: ready shows the reflection; idle/pending is "writing"; failed or stuck is "failed"', () => {
    expect(reflectionCard({ ...none, source: 'entry', entry: entry() })).toEqual({
      state: 'ready',
      text: 'I felt calm on my walk. The quiet stayed with me.',
    });
    for (const s of ['idle', 'pending'] as const) {
      expect(
        reflectionCard({ ...none, source: 'entry', entry: entry({ ai_status: s, ai_summary: null }) }).state,
      ).toBe('writing');
    }
    expect(
      reflectionCard({ ...none, source: 'entry', entry: entry({ ai_status: 'failed', ai_summary: null }) }).state,
    ).toBe('failed');
    expect(
      reflectionCard({
        ...none,
        source: 'entry',
        entry: entry({ ai_status: 'pending', ai_summary: null }),
        stalled: true,
      }).state,
    ).toBe('failed');
    expect(
      reflectionCard({
        ...none,
        source: 'entry',
        entry: entry({ ai_status: 'pending', ai_summary: null }),
        requestFailed: true,
      }).state,
    ).toBe('failed');
  });

  it('answers: none yet or pending is "writing"; ready shows it; failed is "failed"', () => {
    expect(reflectionCard({ ...none, source: 'answers', entry: null, welcome: null }).state).toBe('writing');
    expect(
      reflectionCard({ ...none, source: 'answers', entry: null, welcome: { status: 'pending', body: null } }).state,
    ).toBe('writing');
    expect(
      reflectionCard({
        ...none,
        source: 'answers',
        entry: null,
        welcome: { status: 'ready', body: 'You came here for calmer days. More.' },
      }),
    ).toEqual({ state: 'ready', text: 'You came here for calmer days. More.' });
    expect(
      reflectionCard({ ...none, source: 'answers', entry: null, welcome: { status: 'failed', body: null } }).state,
    ).toBe('failed');
  });

  it('unknown source: "writing"', () => {
    expect(reflectionCard({ ...none, source: null, entry: undefined }).state).toBe('writing');
  });
});

describe('shouldStartWriting', () => {
  it('starts the entry’s reflection only when nobody asked for it (idle)', () => {
    expect(shouldStartWriting({ source: 'entry', entry: entry({ ai_status: 'idle' }), welcome: undefined })).toBe(
      true,
    );
    expect(
      shouldStartWriting({ source: 'entry', entry: entry({ ai_status: 'pending' }), welcome: undefined }),
    ).toBe(false);
  });

  it('starts the welcome reflection only when there is none yet (not while loading)', () => {
    expect(shouldStartWriting({ source: 'answers', entry: null, welcome: null })).toBe(true);
    expect(shouldStartWriting({ source: 'answers', entry: null, welcome: undefined })).toBe(false);
    expect(
      shouldStartWriting({ source: 'answers', entry: null, welcome: { status: 'pending', body: null } }),
    ).toBe(false);
  });

  it('never while the source is unknown (a flagged entry is never sent)', () => {
    expect(shouldStartWriting({ source: null, entry: entry({ ai_status: 'idle' }), welcome: null })).toBe(false);
  });
});

describe('pickLastEntry (Welcome back card)', () => {
  const e = (note: string | null, local_date: string, crisis_flagged?: boolean) => ({
    note,
    local_date,
    ...(crisis_flagged === undefined ? {} : { crisis_flagged }),
  });

  it('the most recent entry that wasn’t flagged (N16.08)', () => {
    const list = [e('flagged one', '2026-10-02', true), e('Today felt lighter.', '2026-09-30', false)];
    expect(pickLastEntry(list, null, detectCrisis)?.local_date).toBe('2026-09-30');
  });

  it('on a server without the flag, the keyword check decides', () => {
    const list = [e('I want to end it all', '2026-10-02'), e('Today felt lighter.', '2026-09-30')];
    expect(pickLastEntry(list, KEYWORDS, detectCrisis)?.local_date).toBe('2026-09-30');
    expect(pickLastEntry(list, null, detectCrisis)).toBeUndefined(); // keywords not loaded: wait
  });

  it('skips entries with no words, and is null when there is nothing to show (N16.09)', () => {
    expect(pickLastEntry([e(null, '2026-10-02', false), e('  ', '2026-10-01', false)], null, detectCrisis)).toBeNull();
    expect(pickLastEntry([], KEYWORDS, detectCrisis)).toBeNull();
  });
});
