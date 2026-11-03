// The per-entry AI Insight prompt (ai-summary). Pure — no I/O / no Deno APIs — so Jest tests the
// SAME source the edge function uses.
//
// Client feedback 2026-09-29: short entries got a real reflection, long detailed ones got their
// events repeated back in order (the old prompt literally asked for "a slightly clearer version…
// close to the original in length"). Now it always asks for the layer underneath (feeling, tone,
// meaning) whatever the length, and it can see the writer's recent entries so it notices when
// today continues something from before.

import type { Tone } from './tone.ts';

/** The writer's personal tone(s), as voice instructions for a first-person reflection. */
export const ENTRY_TONE_CLAUSE: Record<Tone, string> = {
  gentle:
    'Gentle: soft, warm, and unhurried. Keep anything hard exactly as hard, adding no comfort or silver lining the entry did not already contain.',
  direct:
    'Direct: plain and concise, no hedging or flourish. Stay human, and let a heavy moment keep its weight rather than clipping past it.',
  encouraging:
    'Encouraging: where the words genuinely earn it, let what went well sound like it mattered. Never manufacture a win, and if the entry was hard overall, let it stay hard.',
  reflective:
    'Reflective: thoughtful and open, leaving an unresolved thought unresolved rather than tidying it into a conclusion.',
};

export interface EarlierEntry {
  /** YYYY-MM-DD (the writer's local date). */
  date: string;
  moods: string[];
  note: string;
}

/** How far back the AI can look, and how much of each earlier entry it sees. */
export const MEMORY_DAYS = 14;
export const MEMORY_ENTRIES = 5;
export const MEMORY_NOTE_CHARS = 400;

export const ENTRY_REFLECTION_SYSTEM =
  "You write a short reflection on a person's journal entry, in their own first-person voice " +
  '("I"), as if they paused after writing it and noticed what it meant to them. You are the ' +
  'writer reflecting, never an assistant replying to them. You sound like a real person: warm, ' +
  'personal, and natural, never robotic.';

export function buildEntryReflectionPrompt(input: {
  note: string;
  moods: string[];
  toneVoice: string;
  earlier: EarlierEntry[];
}): string {
  const earlier = input.earlier.length
    ? input.earlier
        .map(
          (e) =>
            `(${e.date}${e.moods.length ? `, feeling ${e.moods.join(', ')}` : ''}) ` +
            e.note.trim().slice(0, MEMORY_NOTE_CHARS),
        )
        .join('\n')
    : '(none)';

  return [
    'Write a short reflection on today\'s journal entry below, in the first person ("I"), as the writer looking back on what they just wrote.',
    '',
    'What makes it a reflection, not a summary:',
    'Do not retell the entry or list what happened in order. The writer already knows what happened.',
    'Add what sits underneath it: the feeling, the tone, what the moment seemed to mean to them, or what it shows about what they care about. Do this every time, whether the entry is one line or a long, detailed account. A long entry needs that same layer; never fill the space by paraphrasing its details.',
    'Mention a specific detail only when it helps say something new about how it felt or why it mattered.',
    'Stay grounded: every feeling or meaning you name must be supported by the entry or the moods they chose. Never invent events, people, or reasons.',
    'Earlier entries (listed at the end, if any) are background only. If today clearly continues something from one of them (the same event, person, worry, or plan), you may briefly connect the two, for example "after how nervous I was about the interview". Keep that link short and general, and never repeat private details from an earlier entry that today\'s entry does not mention. If nothing clearly connects, ignore them completely.',
    'Write 2 to 4 natural sentences, warm and personal, never clinical, generic, or like an AI.',
    'Someone they trust may read this in their circle, so keep it comfortable to share. No advice, no diagnosis, no questions, no emojis.',
    'Never use dashes of any kind between words or phrases. Use a comma, a period, or "and" instead.',
    'Reply with only the reflection: no preamble, labels, or quotation marks.',
    '',
    `Voice: ${input.toneVoice}`,
    '',
    `Moods they chose today: ${input.moods.length ? input.moods.join(', ') : 'none'}`,
    `Today's entry: ${input.note.trim()}`,
    '',
    'Earlier entries from the last two weeks, newest first:',
    earlier,
  ].join('\n');
}

/** YYYY-MM-DD `days` before a YYYY-MM-DD date (calendar math, no time zones involved). */
export function localDateMinusDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const t = Date.UTC(y!, (m ?? 1) - 1, d ?? 1) - days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
