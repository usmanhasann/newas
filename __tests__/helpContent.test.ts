/**
 * Client revisions 10/14:
 * - p.21 to 23 (O25): every Help & FAQ card is replaced by the client's 11 cards, in this exact order
 *   and wording. The two removed cards and every old card are gone.
 * - p.12 (O24): Send Feedback categories are Idea, Bug, What’s working, Other ("Praise" renamed).
 *   The renamed pill saves under its new name (feedback.category is free text, no server check;
 *   older app versions keep saving 'Praise').
 * Apostrophes are curly, as everywhere else in the app.
 */
import { FAQ, FEEDBACK_CATEGORIES, FEEDBACK_CATEGORY_ROWS } from '@features/help/data';

const CLIENT_FAQ: [string, string][] = [
  [
    'I’m in crisis. What should I do?',
    'If you’re in danger or thinking about harming yourself, please call 911 or call/text 988 (Suicide & Crisis Lifeline). LYSM also surfaces support resources when it detects concerning words as you write.',
  ],
  [
    'How do I log my mood?',
    'Tap the + New Entry button on the Journal tab, choose how you feel, write anything on your mind, then tap Save Entry.',
  ],
  [
    'Can I edit or delete an entry?',
    'Open an entry and tap the pencil to edit or the trash can to delete.',
  ],
  [
    'What are AI reflections?',
    'After you save an entry, LYSM writes a short reflection on it in the tone you picked (gentle, direct, encouraging, or reflective). Open the entry to read it. Change your tone in Profile → Reflection Tone.',
  ],
  [
    'How do I leave a circle?',
    'Open the circle and tap the three dots in the top right, then Leave circle. If you are the owner of the circle, you can archive or delete it in Circle Settings.',
  ],
  [
    'Who can see my journal?',
    'Your entries are private by default. Only entries you explicitly share to a circle are visible. When you share, your mood is always included, and you choose whether to share your AI reflection or your written entry.',
  ],
  [
    'How do Circles work?',
    'Private Circles are invite-only groups for people you trust, where anyone can post and share entries. Public Circles are open to anyone: someone posts a prompt and others respond. Create or join a circle from the Circles tab.',
  ],
  [
    'How do streaks work?',
    'Your streak counts consecutive days with at least one entry. See the Insights tab.',
  ],
  [
    'How do I change or cancel my subscription?',
    'Profile → Subscription opens your App Store or Google Play settings, where you can update or cancel anytime. Canceling during your free trial means you won’t be charged.',
  ],
  [
    'How do I contact support?',
    'Email support@lysm.app. If there’s something you’d like us to know, you can also go to the Send Feedback page and share your thoughts there. We read everything.',
  ],
  [
    'How do I delete my account?',
    'Go to Profile, scroll to the bottom, and tap Delete Account. This permanently deletes your account and all your entries.',
  ],
];

describe('Help & FAQ cards (client 10/14, O25)', () => {
  it('are exactly the client’s 11 cards, in order, character for character', () => {
    expect(FAQ.map((f) => [f.q, f.a])).toEqual(CLIENT_FAQ);
  });

  it('drop the removed cards and the old wording', () => {
    const questions = FAQ.map((f) => f.q);
    for (const gone of [
      'How do I get my trusted connections?',
      'Can I control what each person sees?',
      'What are AI insights?',
      'How do I start or join a circle?',
    ]) {
      expect(questions).not.toContain(gone);
    }
  });

  it('use curly apostrophes and no dash punctuation', () => {
    for (const f of FAQ) {
      for (const text of [f.q, f.a]) {
        expect(text).not.toContain("'");
        expect(text).not.toMatch(/[–—]| - /);
      }
    }
  });
});

describe('Send Feedback categories (client 10/14, O24)', () => {
  it('show Idea, Bug, What’s working, Other in that order', () => {
    expect(FEEDBACK_CATEGORIES.map((c) => c.label)).toEqual([
      'Idea',
      'Bug',
      'What’s working',
      'Other',
    ]);
    expect(FEEDBACK_CATEGORIES.map((c) => c.label)).not.toContain('Praise');
  });

  it('save under their own names (What’s working, no longer Praise)', () => {
    expect(FEEDBACK_CATEGORIES.map((c) => c.value)).toEqual([
      'Idea',
      'Bug',
      'What’s working',
      'Other',
    ]);
  });

  it('sit in two rows: Idea and Bug, then What’s working and Other', () => {
    expect(FEEDBACK_CATEGORY_ROWS.map((row) => row.map((c) => c.label))).toEqual([
      ['Idea', 'Bug'],
      ['What’s working', 'Other'],
    ]);
  });
});
