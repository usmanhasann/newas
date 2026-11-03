/**
 * Circles tab, YOUR CIRCLES cards (client revisions 2026-10-14, p3 mockup):
 *  - every card gets a colored icon circle on the left (about 46px, 12px gap to the text): Public =
 *    light green circle with a dark green outline globe, Private = light purple circle with a dark
 *    purple outline lock, for circles the user owns AND circles they are a member of;
 *  - the small globe/lock before the role line is gone; the line itself reads exactly
 *    "Public · Owner" / "Private · Member" / ... (owners and members alike);
 *  - the icon's left edge lines up with the Create/Discover card icons (same card padding);
 *  - no description text on the card; chevron kept;
 *  - archived circles fade (icon included) and sit below every active circle.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent } from '@testing-library/react-native';
import { MyCirclesScreen } from '@features/circles/screens/MyCirclesScreen';
import { colors } from '@theme';

jest.mock('@features/profile', () => ({
  useProfile: () => ({ data: { display_name: 'Konah Quittman' } }),
}));

const mockBase = { description: 'Morning runs by the river', member_count: 3 };
jest.mock('@features/circles/hooks', () => ({
  useMyCircles: () => ({
    // The archived circle comes FIRST from the server; it must still render last.
    data: [
      {
        ...mockBase,
        id: 'c0',
        name: 'Old Friends',
        type: 'private',
        role: 'owner',
        archived_at: '2026-10-01T00:00:00Z',
      },
      {
        ...mockBase,
        id: 'c1',
        name: 'Konah Public Circle',
        type: 'public',
        role: 'owner',
        archived_at: null,
      },
      {
        ...mockBase,
        id: 'c2',
        name: 'Book Club',
        type: 'private',
        role: 'member',
        archived_at: null,
      },
      {
        ...mockBase,
        id: 'c3',
        name: 'Runners',
        type: 'public',
        role: 'member',
        archived_at: null,
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));

type Node = {
  type: string;
  props: Record<string, unknown>;
  children?: (Node | string)[] | null;
};
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
const iconsNamed = (tree: unknown, name: string) =>
  findAll(tree, (n) => n.type === 'Icon' && n.props.name === name);
/** The View directly wrapping an icon (the colored circle). */
const wrapperOf = (tree: unknown, icon: Node) =>
  findAll(tree, (n) => n.type === 'View' && (n.children ?? []).includes(icon))[0];
/** The card (the View carrying the card padding) that holds a circle's name. */
const cardOf = (tree: unknown, name: string) => {
  const cards = findAll(
    tree,
    (n) => n.type === 'View' && classesOf(n).includes('py-4') && textOf(n).includes(name),
  );
  return cards[cards.length - 1];
};

it('Your Circles cards: colored type icon, exact role line, archived faded and last', async () => {
  const navigation = { navigate: jest.fn() };
  const utils = await render(
    <MyCirclesScreen navigation={navigation as never} route={{} as never} />,
  );
  const tree = utils.toJSON();

  // Exact role lines for owners and members (no CSS capitalize: the words themselves are cased).
  expect(utils.getByText('Public · Owner')).toBeTruthy();
  expect(utils.getByText('Private · Member')).toBeTruthy();
  expect(utils.getByText('Public · Member')).toBeTruthy();
  // The archived one ends with "· Archived" (client revisions 10/14 p.23).
  expect(utils.getByText('Private · Owner · Archived')).toBeTruthy();
  expect(classesOf(utils.getByText('Public · Owner') as unknown as Node)).not.toContain(
    'capitalize',
  );

  // The old small glyphs before the role line are gone.
  expect(iconsNamed(tree, 'earth')).toHaveLength(0);
  expect(iconsNamed(tree, 'lock-closed')).toHaveLength(0);

  // Public: light green circle + dark green outline globe (one per Public circle, owner or member).
  const globes = iconsNamed(tree, 'globe-outline');
  expect(globes).toHaveLength(2);
  for (const g of globes) {
    expect(g.props.color).toBe(colors.circle['public-ink']);
    expect(classesOf(wrapperOf(tree, g))).toEqual(
      expect.arrayContaining([
        'h-11.5',
        'w-11.5',
        'rounded-full',
        'items-center',
        'justify-center',
        'bg-circle-public-bg',
      ]),
    );
  }
  // Private: light purple circle + dark purple outline lock.
  const locks = iconsNamed(tree, 'lock-closed-outline');
  expect(locks).toHaveLength(2);
  for (const l of locks) {
    expect(l.props.color).toBe(colors.circle['private-ink']);
    expect(classesOf(wrapperOf(tree, l))).toEqual(
      expect.arrayContaining([
        'h-11.5',
        'w-11.5',
        'rounded-full',
        'bg-circle-private-bg',
      ]),
    );
  }

  // Same padding as the Create/Discover cards (icon left edges line up); icon, 12px gap, text
  // block, chevron in one vertically centered row; no description text.
  const publicCard = cardOf(tree, 'Konah Public Circle');
  expect(classesOf(publicCard)).toEqual(expect.arrayContaining(['px-4', 'py-4', 'mb-3']));
  expect(classesOf(cardOf(tree, 'Create a circle'))).toEqual(
    expect.arrayContaining(['px-4', 'py-4', 'mb-3']),
  );
  const row = findAll(publicCard, (n) => classesOf(n).includes('flex-row'))[0];
  expect(classesOf(row)).toEqual(
    expect.arrayContaining(['flex-row', 'items-center', 'gap-3']),
  );
  expect(iconsNamed(publicCard, 'chevron-forward')).toHaveLength(1);
  expect(utils.queryByText('Morning runs by the river')).toBeNull();

  // Archived: the whole card fades (colored icon included); active cards do not.
  expect(classesOf(cardOf(tree, 'Old Friends'))).toContain('opacity-60');
  for (const name of ['Konah Public Circle', 'Book Club', 'Runners']) {
    expect(classesOf(cardOf(tree, name))).not.toContain('opacity-60');
  }

  // Archived circles stay below every active circle; active order is kept as given.
  const names = ['Konah Public Circle', 'Book Club', 'Runners', 'Old Friends'];
  const order = findAll(tree, (n) => n.type === 'Text' && names.includes(textOf(n))).map(
    textOf,
  );
  expect(order).toEqual(names);

  // Tapping a card still opens that circle.
  await fireEvent.press(utils.getByText('Book Club'));
  expect(navigation.navigate).toHaveBeenCalledWith('CircleDetail', { circleId: 'c2' });
});
