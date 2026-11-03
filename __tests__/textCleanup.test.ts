/**
 * AI text clean-up (client rules 2026-09-29): no dash punctuation anywhere (hyphenated words stay),
 * and reflections never end on a question. The server copy (edge functions) and the app copy
 * (text stored before the rules) must behave identically.
 */
import * as server from '../supabase/functions/_shared/text';
import * as app from '@utils/text';

const DASHES: [string, string][] = [
  ['Write freely — this is your space.', 'Write freely, this is your space.'],
  ['You had a full morning—school, the gym, then matcha.', 'You had a full morning, school, the gym, then matcha.'],
  ['every 15–60 minutes', 'every 15 to 60 minutes'],
  ['Jun 16 – Jun 22', 'Jun 16 to Jun 22'],
  ['Your week of Sep 7 ‒ Sep 13 was steady.', 'Your week of Sep 7 to Sep 13 was steady.'],
  ['I paused -- then I smiled.', 'I paused, then I smiled.'],
  ['every 15--60 minutes', 'every 15 to 60 minutes'],
  ['A quiet week ― a good one.', 'A quiet week, a good one.'],
  ['It was a lot - but you kept going.', 'It was a lot, but you kept going.'],
  ['Your daily check-in is a sign-in to yourself.', 'Your daily check-in is a sign-in to yourself.'],
  ['It ended quietly —.', 'It ended quietly.'],
  ['— A new start.', 'A new start.'],
];

const QUESTIONS: [string, string][] = [
  [
    'You held a lot this week. Calm and worry sat side by side. What was it like to experience such contrasting emotions this week?',
    'You held a lot this week. Calm and worry sat side by side.',
  ],
  ['Steady week. Was it? How did it feel?', 'Steady week.'],
  ['You kept showing up.', 'You kept showing up.'],
  ['Only a question?', 'Only a question?'], // nothing else would remain → keep it
  ['You wondered "why me?" and still went on. It was enough.', 'You wondered "why me?" and still went on. It was enough.'],
  // A sentence ending in a closing quote is its own sentence (it used to go with the question).
  [
    'You held it all. You kept telling yourself “one more day.” What was it like to carry that?',
    'You held it all. You kept telling yourself “one more day.”',
  ],
  // Paragraph breaks survive.
  ['A long week.\n\nYou rested when you could. Did it help?', 'A long week.\n\nYou rested when you could.'],
];

describe.each([
  ['server', server],
  ['app', app],
])('%s copy', (_name, impl) => {
  it.each(DASHES)('withoutDashes(%j)', (input, expected) => {
    expect(impl.withoutDashes(input)).toBe(expected);
  });

  it.each(QUESTIONS)('withoutClosingQuestion(%j)', (input, expected) => {
    expect(impl.withoutClosingQuestion(input)).toBe(expected);
  });
});
