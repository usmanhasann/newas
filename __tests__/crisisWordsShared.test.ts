/**
 * Concerning words before any AI (client 10/14 p.36, N18.12/N18.13): the edge functions ask the
 * database which entries have crisis keywords right before sending, and a flagged entry's words
 * never reach the AI. ai-summary leaves a flagged earlier entry out of its memory; the weekly,
 * monthly and yearly reflections keep a flagged entry's moods but leave its words out; and if the
 * check can't answer, the functions send nothing (it throws). Same source the functions run.
 */
import {
  flaggedEntryIds,
  hasCrisisWords,
  isCrisisFlagged,
  withFlaggedNotesLeftOut,
  withoutFlaggedEntries,
} from '../supabase/functions/_shared/crisisWords';
import { buildEntryReflectionPrompt } from '../supabase/functions/_shared/entryReflection';

const SECRET = 'I want to end my life tonight';

const rows = [
  { id: 'a', note: 'Lunch with Priya was lovely.', mood_slugs: ['happy'], crisis_flagged: false },
  { id: 'b', note: SECRET, mood_slugs: ['sad'], crisis_flagged: true },
  // Flagged by the re-check only (the keyword list changed after it was written).
  { id: 'c', note: 'Blue whale song all day.', mood_slugs: ['tired'], crisis_flagged: false },
];

it('knows a flagged entry from its row or from the re-check', () => {
  expect(isCrisisFlagged(rows[0]!, new Set())).toBe(false);
  expect(isCrisisFlagged(rows[1]!, new Set())).toBe(true);
  expect(isCrisisFlagged(rows[2]!, new Set(['c']))).toBe(true);
});

it('leaves a flagged entry out of an entry reflection’s memory', () => {
  const memory = withoutFlaggedEntries(rows, new Set(['c']));
  expect(memory.map((r) => r.id)).toEqual(['a']);
  const prompt = buildEntryReflectionPrompt({
    note: 'Back at work.',
    moods: ['Calm'],
    toneVoice: 'Gentle.',
    earlier: memory.map((r) => ({ date: '2026-10-20', moods: [], note: r.note })),
  });
  expect(prompt).not.toContain(SECRET);
  expect(prompt).not.toContain('Blue whale');
});

it('keeps a flagged entry’s moods in a period reflection but never its words', () => {
  const period = withFlaggedNotesLeftOut(rows, new Set(['c']));
  expect(period).toHaveLength(3);
  expect(period.map((r) => r.mood_slugs)).toEqual([['happy'], ['sad'], ['tired']]);
  expect(period.map((r) => r.note)).toEqual(['Lunch with Priya was lovely.', null, null]);
});

it('asks the database right before sending, and sends nothing when it can’t answer', async () => {
  const rpc = jest.fn((_fn: string, _args: Record<string, unknown>) =>
    Promise.resolve({ data: ['b', 'c'] as unknown, error: null as unknown }),
  );
  await expect(flaggedEntryIds(rpc, ['a', 'b', 'c'])).resolves.toEqual(new Set(['b', 'c']));
  expect(rpc).toHaveBeenCalledWith('crisis_flagged_entries', { p_ids: ['a', 'b', 'c'] });
  // Rows shaped as objects are read too.
  rpc.mockResolvedValueOnce({ data: [{ crisis_flagged_entries: 'b' }], error: null });
  await expect(flaggedEntryIds(rpc, ['b'])).resolves.toEqual(new Set(['b']));
  // No ids: no call.
  rpc.mockClear();
  await expect(flaggedEntryIds(rpc, [])).resolves.toEqual(new Set());
  expect(rpc).not.toHaveBeenCalled();
  // An error or an odd answer throws, so the caller fails closed.
  rpc.mockResolvedValueOnce({ data: null, error: new Error('down') });
  await expect(flaggedEntryIds(rpc, ['a'])).rejects.toThrow('down');
  rpc.mockResolvedValueOnce({ data: 'nope', error: null });
  await expect(flaggedEntryIds(rpc, ['a'])).rejects.toThrow();
});

it('checks a text against the database’s list (detect-crisis, detect-private-threat, moderation)', async () => {
  const rpc = jest.fn((_fn: string, _args: Record<string, unknown>) =>
    Promise.resolve({ data: true as unknown, error: null as unknown }),
  );
  await expect(hasCrisisWords(rpc, SECRET)).resolves.toBe(true);
  expect(rpc).toHaveBeenCalledWith('crisis_words_match', { p_text: SECRET });
  rpc.mockResolvedValueOnce({ data: false, error: null });
  await expect(hasCrisisWords(rpc, 'A calm day')).resolves.toBe(false);
  rpc.mockClear();
  await expect(hasCrisisWords(rpc, '   ')).resolves.toBe(false);
  expect(rpc).not.toHaveBeenCalled();
  rpc.mockResolvedValueOnce({ data: null, error: new Error('down') });
  await expect(hasCrisisWords(rpc, SECRET)).rejects.toThrow('down');
});
