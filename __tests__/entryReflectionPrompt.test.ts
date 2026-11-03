/**
 * AI Insight prompt (ai-summary). Client feedback 2026-09-29: long, detailed entries got their
 * events repeated back ("paraphrase of the itinerary"), and the AI had no memory of earlier entries.
 * The prompt must always ask for the layer underneath (feeling, tone, meaning) whatever the length,
 * never for a rewrite; it must carry recent entries as background, linked only when they clearly
 * connect and without leaking their private details; and it must contain no dashes.
 */
import {
  ENTRY_REFLECTION_SYSTEM,
  ENTRY_TONE_CLAUSE,
  MEMORY_NOTE_CHARS,
  buildEntryReflectionPrompt,
  localDateMinusDays,
} from '../supabase/functions/_shared/entryReflection';

const DASH = /[–—]|\s-\s/;

const LONG_ENTRY =
  'This morning I had school, then went to the gym right after school, then got matcha, and then I headed home for lunch with mom and worked on the app.';

describe('buildEntryReflectionPrompt', () => {
  const prompt = buildEntryReflectionPrompt({
    note: LONG_ENTRY,
    moods: ['Content', 'Tired'],
    toneVoice: ENTRY_TONE_CLAUSE.gentle,
    earlier: [
      { date: '2026-09-28', moods: ['Anxious'], note: 'Nervous about my interview tomorrow.' },
      { date: '2026-09-25', moods: [], note: 'x'.repeat(MEMORY_NOTE_CHARS + 50) },
    ],
  });

  it('asks for a reflection with the layer underneath, never a retelling, at any length', () => {
    expect(prompt).toMatch(/Do not retell the entry or list what happened in order/);
    expect(prompt).toMatch(/feeling, the tone, what the moment seemed to mean/);
    expect(prompt).toMatch(/whether the entry is one line or a long, detailed account/);
    expect(prompt).toMatch(/never fill the space by paraphrasing its details/);
    expect(prompt).not.toMatch(/rewrite|slightly clearer|close to the original in length/i);
    expect(ENTRY_REFLECTION_SYSTEM).toMatch(/first-person voice/);
  });

  it('includes today’s entry and every mood on it', () => {
    expect(prompt).toContain(`Today's entry: ${LONG_ENTRY}`);
    expect(prompt).toContain('Moods they chose today: Content, Tired');
  });

  it('carries recent entries as background, trimmed, linked only when they clearly connect', () => {
    expect(prompt).toContain('(2026-09-28, feeling Anxious) Nervous about my interview tomorrow.');
    expect(prompt).toContain(`(2026-09-25) ${'x'.repeat(MEMORY_NOTE_CHARS)}\n`.trimEnd());
    expect(prompt).not.toContain('x'.repeat(MEMORY_NOTE_CHARS + 1));
    expect(prompt).toMatch(/If nothing clearly connects, ignore them completely/);
    expect(prompt).toMatch(/never repeat private details from an earlier entry/);
  });

  it('says "(none)" when there is no recent history', () => {
    const p = buildEntryReflectionPrompt({ note: 'Matcha with Augie.', moods: [], toneVoice: 'x', earlier: [] });
    expect(p).toMatch(/newest first:\n\(none\)$/);
    expect(p).toContain('Moods they chose today: none');
  });

  it('contains no dashes anywhere in its own wording (the model copies that style)', () => {
    const scaffold = buildEntryReflectionPrompt({ note: 'N', moods: ['Calm'], toneVoice: '', earlier: [] });
    expect(scaffold).not.toMatch(DASH);
    expect(ENTRY_REFLECTION_SYSTEM).not.toMatch(DASH);
    for (const clause of Object.values(ENTRY_TONE_CLAUSE)) expect(clause).not.toMatch(DASH);
    expect(scaffold).toMatch(/Never use dashes of any kind/);
  });
});

describe('localDateMinusDays', () => {
  it('handles month and year boundaries', () => {
    expect(localDateMinusDays('2026-09-29', 14)).toBe('2026-09-15');
    expect(localDateMinusDays('2026-03-05', 14)).toBe('2026-02-19');
    expect(localDateMinusDays('2026-01-03', 14)).toBe('2025-12-20');
  });
});
