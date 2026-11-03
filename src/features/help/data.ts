export interface FaqItem {
  q: string;
  a: string;
}

/**
 * Help & FAQ cards, in the client's exact wording and order (client revisions 10/14, p.21 to 23).
 * Apostrophes are curly to match the rest of the app.
 */
export const FAQ: FaqItem[] = [
  {
    q: 'I’m in crisis. What should I do?',
    a: 'If you’re in danger or thinking about harming yourself, please call 911 or call/text 988 (Suicide & Crisis Lifeline). LYSM also surfaces support resources when it detects concerning words as you write.',
  },
  {
    q: 'How do I log my mood?',
    a: 'Tap the + New Entry button on the Journal tab, choose how you feel, write anything on your mind, then tap Save Entry.',
  },
  {
    q: 'Can I edit or delete an entry?',
    a: 'Open an entry and tap the pencil to edit or the trash can to delete.',
  },
  {
    q: 'What are AI reflections?',
    a: 'After you save an entry, LYSM writes a short reflection on it in the tone you picked (gentle, direct, encouraging, or reflective). Open the entry to read it. Change your tone in Profile → Reflection Tone.',
  },
  {
    q: 'How do I leave a circle?',
    a: 'Open the circle and tap the three dots in the top right, then Leave circle. If you are the owner of the circle, you can archive or delete it in Circle Settings.',
  },
  {
    q: 'Who can see my journal?',
    a: 'Your entries are private by default. Only entries you explicitly share to a circle are visible. When you share, your mood is always included, and you choose whether to share your AI reflection or your written entry.',
  },
  {
    q: 'How do Circles work?',
    a: 'Private Circles are invite-only groups for people you trust, where anyone can post and share entries. Public Circles are open to anyone: someone posts a prompt and others respond. Create or join a circle from the Circles tab.',
  },
  {
    q: 'How do streaks work?',
    a: 'Your streak counts consecutive days with at least one entry. See the Insights tab.',
  },
  {
    q: 'How do I change or cancel my subscription?',
    a: 'Profile → Subscription opens your App Store or Google Play settings, where you can update or cancel anytime. Canceling during your free trial means you won’t be charged.',
  },
  {
    q: 'How do I contact support?',
    a: 'Email support@lysm.app. If there’s something you’d like us to know, you can also go to the Send Feedback page and share your thoughts there. We read everything.',
  },
  {
    q: 'How do I delete my account?',
    a: 'Go to Profile, scroll to the bottom, and tap Delete Account. This permanently deletes your account and all your entries.',
  },
];

export interface FeedbackCategory {
  /** What is saved in feedback.category. */
  value: string;
  /** What the pill shows. */
  label: string;
}

/**
 * Send Feedback categories, in the client's order (client revisions 10/14, p.12): Idea, Bug,
 * What’s working, Other. "What’s working" replaced the "Praise" pill and saves under its own name
 * (feedback.category is free text with no server check; rows from older app versions keep 'Praise').
 */
export const FEEDBACK_CATEGORIES: FeedbackCategory[] = [
  { value: 'Idea', label: 'Idea' },
  { value: 'Bug', label: 'Bug' },
  { value: 'What’s working', label: 'What’s working' },
  { value: 'Other', label: 'Other' },
];

/** The pills sit in two rows of two, as in the client's reference image. */
export const FEEDBACK_CATEGORY_ROWS: FeedbackCategory[][] = [
  FEEDBACK_CATEGORIES.slice(0, 2),
  FEEDBACK_CATEGORIES.slice(2),
];
