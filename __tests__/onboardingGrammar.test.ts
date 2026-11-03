/**
 * Client 10/14 p.11-12 (O6): onboarding summary sentences insert earlier answers, and must read
 * correctly for EVERY answer a person can give, not only the two examples in the report:
 *  - "The shift you're working toward": "Right now: Stressed most days" (a state, not "Stress");
 *  - the 100% checklist: "Steadying the days that overwhelm you most" (overwhelm as the verb).
 * Every frequency, goal, support, motivation and reflection style is run through every sentence.
 */
import {
  FREQUENCIES,
  GOALS,
  MOTIVATIONS,
  REFLECTION_STYLES,
  SUPPORTS,
} from '@features/onboarding/constants';
import {
  goalAspiration,
  goalOutcomeLabel,
  motivationFocus,
  overwhelmPlanLabel,
  reflectBack,
  reflectionStylePhrase,
  stressStateLabel,
  supportPlanLabel,
} from '@features/onboarding/copy';

describe('"The shift you’re working toward"', () => {
  it('Right now: how they feel, for every answer (client example: "Stressed most days")', () => {
    expect(FREQUENCIES.map((f) => stressStateLabel(f.value))).toEqual([
      'Occasionally stressed',
      'Stressed now and then',
      'Stressed most days',
      'Stressed almost all the time',
    ]);
    expect(stressStateLabel(null)).toBe('Feeling stressed');
  });
  it('With LYSM: where they are heading, in the same form ("Feeling calmer", not "Feel calmer")', () => {
    expect(GOALS.map((g) => goalOutcomeLabel(g.value))).toEqual([
      'Feeling calmer',
      'Noticing your patterns',
      'Building a steady daily habit',
      'Feeling less alone',
      'Having more good days than hard ones',
    ]);
    expect(goalOutcomeLabel(null)).toBe('Feeling more like yourself');
  });
});

describe('the 100% plan checklist', () => {
  it('overwhelm is the verb, for every answer (client example: "...the days that overwhelm you most")', () => {
    expect(FREQUENCIES.map((f) => overwhelmPlanLabel(f.value))).toEqual([
      'Steadying the rare days that overwhelm you',
      'Steadying the days that overwhelm you now and then',
      'Steadying the days that overwhelm you most',
      'Steadying the days that so often overwhelm you',
    ]);
  });
  it('the people they lean on, for every answer', () => {
    expect(SUPPORTS.map((s) => supportPlanLabel(s.value))).toEqual([
      'Keeping the friend you lean on close',
      'Keeping the family you lean on close',
      'Keeping the partner you lean on close',
      'A private space that’s just for you',
      'A private space, with room to reach out when you’re ready',
    ]);
  });
  it('the reflection style as words in the sentence, for every pick and pair', () => {
    for (const a of REFLECTION_STYLES) {
      expect(`to sound ${reflectionStylePhrase([a.value])}`).toBe(`to sound ${a.label.toLowerCase()}`);
      for (const b of REFLECTION_STYLES) {
        if (a.value === b.value) continue;
        expect(reflectionStylePhrase([a.value, b.value])).toBe(
          `${a.label.toLowerCase()} and ${b.label.toLowerCase()}`,
        );
      }
    }
  });
});

/** The sentence reads as a sentence: no option labels' capitals or "&" inside it, clean spacing. */
function expectSentenceForm(text: string) {
  expect(text).not.toMatch(/&/);
  expect(text).not.toMatch(/ {2}|\s[.,]/);
  const words = text.split(/\s+/).slice(1);
  // Only the app name and "I" are capitalized after the first word (or after a full stop).
  text.split(/(?<=[.:]) /).forEach((part) => {
    part
      .split(/\s+/)
      .slice(1)
      .forEach((w) => expect(/^[A-Z]/.test(w) && !/^(LYSM|I)\b/.test(w) ? w : 'ok').toBe('ok'));
  });
  expect(words.length).toBeGreaterThan(0);
}

it('every checklist sentence and the reflect-back read correctly for every combination of answers', () => {
  const frequencies = [...FREQUENCIES.map((f) => f.value), null];
  const goals = [...GOALS.map((g) => g.value), null];
  for (const m of [...MOTIVATIONS.map((x) => x.value), null]) expectSentenceForm(`Focusing on ${motivationFocus(m)}`);
  for (const g of goals) expectSentenceForm(`Shaping a plan to ${goalAspiration(g)}`);
  for (const a of REFLECTION_STYLES) {
    for (const b of [...REFLECTION_STYLES, null]) {
      const picks = b && b.value !== a.value ? [a.value, b.value] : [a.value];
      expectSentenceForm(`Tuning your reflections to sound ${reflectionStylePhrase(picks)}`);
    }
  }
  for (const f of frequencies) {
    expectSentenceForm(overwhelmPlanLabel(f));
    for (const g of goals) {
      for (const s of SUPPORTS) expectSentenceForm(reflectBack(f, g, s.value));
    }
  }
});
