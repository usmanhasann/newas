/**
 * Client revisions 10/14, p.21 to 23 (O25): the Help & FAQ page shows the client's 11 cards in this
 * exact order (crisis first, delete account last). The card design is unchanged: question in
 * bold, answer below in the softer body style. The removed cards never show.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render } from '@testing-library/react-native';
import { HelpScreen } from '@features/help/screens/HelpScreen';
import { FAQ } from '@features/help/data';

const ORDER = [
  'I’m in crisis. What should I do?',
  'How do I log my mood?',
  'Can I edit or delete an entry?',
  'What are AI reflections?',
  'How do I leave a circle?',
  'Who can see my journal?',
  'How do Circles work?',
  'How do streaks work?',
  'How do I change or cancel my subscription?',
  'How do I contact support?',
  'How do I delete my account?',
];

type Node = { children?: (Node | string)[] | null };
function texts(node: Node | string | null): string[] {
  if (node === null) return [];
  if (typeof node === 'string') return [node];
  return (node.children ?? []).flatMap((c) => texts(c));
}

it('shows the 11 new cards in the client’s order with the same card design', async () => {
  const utils = await render(
    <HelpScreen navigation={{ goBack: jest.fn() } as never} route={{} as never} />,
  );

  const shown = texts(utils.toJSON() as Node | null).filter((t) => ORDER.includes(t));
  expect(shown).toEqual(ORDER);

  for (const f of FAQ) {
    const question = utils.getByText(f.q);
    expect(question.props.className).toContain('font-sans-semibold');
    const answer = utils.getByText(f.a);
    expect(answer.props.className).toContain('text-ink-soft');
    expect(answer.props.className).toContain('mt-1.5');
  }

  expect(utils.queryByText('How do I get my trusted connections?')).toBeNull();
  expect(utils.queryByText('Can I control what each person sees?')).toBeNull();
  expect(utils.queryByText('What are AI insights?')).toBeNull();
  expect(utils.getByText('Help & FAQ')).toBeTruthy();
});
