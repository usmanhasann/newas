/**
 * Circles tab, YOUR CIRCLES (client revisions 10/14):
 *  - p.2: the list comes in activity order (most recent first) and stays live while the tab is open
 *    (the screen asks for the live list); archived circles always sit below every active one;
 *  - p.23-24: an archived circle's gray line ends with "Archived" ("Private · Owner · Archived",
 *    "Public · Member · Archived"), for owners and members alike, and its card is faded.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render } from '@testing-library/react-native';
import { MyCirclesScreen } from '@features/circles/screens/MyCirclesScreen';

jest.mock('@features/profile', () => ({
  useProfile: () => ({ data: { display_name: 'Konah Quittman' } }),
}));

const mockUseMyCircles = jest.fn();
const ARCHIVED = '2026-10-20T09:00:00Z';
const mockList = [
  // The server's order: most recent activity first, archived last.
  { id: 'c1', name: 'Book Club', type: 'public', role: 'member', archived_at: null },
  { id: 'c2', name: 'Family', type: 'private', role: 'owner', archived_at: null },
  { id: 'c3', name: 'Old Runners', type: 'public', role: 'member', archived_at: ARCHIVED },
  { id: 'c4', name: 'Roommates', type: 'private', role: 'owner', archived_at: ARCHIVED },
];
jest.mock('@features/circles/hooks', () => ({
  useMyCircles: (...a: unknown[]) => {
    mockUseMyCircles(...a);
    return { data: mockList, isLoading: false, isError: false };
  },
}));

type Node = { type: string; props: Record<string, unknown>; children?: (Node | string)[] | null };
function findAll(node: unknown, pred: (n: Node) => boolean, out: Node[] = []): Node[] {
  if (!node || typeof node === 'string') return out;
  if (Array.isArray(node)) {
    node.forEach((n) => findAll(n, pred, out));
    return out;
  }
  const n = node as Node;
  if (pred(n)) out.push(n);
  (n.children ?? []).forEach((c) => findAll(c, pred, out));
  return out;
}
const textOf = (node: Node | string): string =>
  typeof node === 'string' ? node : (node.children ?? []).map(textOf).join('');
const classesOf = (n: Node) => String(n.props.className ?? '').split(/\s+/);

it('live activity order, archived last with "· Archived" on the gray line, faded', async () => {
  const utils = await render(
    <MyCirclesScreen navigation={{ navigate: jest.fn() } as never} route={{} as never} />,
  );
  const tree = utils.toJSON();

  // The Circles tab asks for the live list (the order follows posts, replies and archiving).
  expect(mockUseMyCircles).toHaveBeenCalledWith({ live: true });

  // The client's examples, word for word, for members and owners.
  expect(utils.getByText('Public · Member · Archived')).toBeTruthy();
  expect(utils.getByText('Private · Owner · Archived')).toBeTruthy();
  // Active circles keep their line.
  expect(utils.getByText('Public · Member')).toBeTruthy();
  expect(utils.getByText('Private · Owner')).toBeTruthy();

  // Shown in the order given (activity), archived below every active circle.
  const names = mockList.map((c) => c.name);
  const order = findAll(tree, (n) => n.type === 'Text' && names.includes(textOf(n))).map(textOf);
  expect(order).toEqual(['Book Club', 'Family', 'Old Runners', 'Roommates']);

  // Archived cards are faded; active ones aren't.
  const cardOf = (name: string) => {
    const cards = findAll(
      tree,
      (n) => n.type === 'View' && classesOf(n).includes('py-4') && textOf(n).includes(name),
    );
    return cards[cards.length - 1]!;
  };
  expect(classesOf(cardOf('Old Runners'))).toContain('opacity-60');
  expect(classesOf(cardOf('Roommates'))).toContain('opacity-60');
  expect(classesOf(cardOf('Book Club'))).not.toContain('opacity-60');
});
