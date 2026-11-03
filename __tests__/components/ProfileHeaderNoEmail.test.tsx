/**
 * Client revisions 10/14, p.1 (O23): the Profile header shows only the photo, name, and bio. The
 * email line under the name is gone (even though the signed-in user has an email), and the bio
 * moves up to sit right under the name with a small token gap (mt-2) so it isn't cramped.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render } from '@testing-library/react-native';
import { ProfileScreen } from '@features/profile/screens/ProfileScreen';

jest.mock('@store/session', () => ({
  useCurrentUser: () => ({ id: 'u1', email: 'ada@example.com' }),
}));
jest.mock('@features/profile/hooks', () => ({
  useProfile: () => ({
    data: { display_name: 'Ada', bio: 'Loves long walks.', avatar_url: null },
  }),
}));
jest.mock('@features/insights', () => ({
  useJournalStats: () => ({ data: { entries_count: 2, current_streak: 1 } }),
}));
jest.mock('@features/circles', () => ({ useMyCircles: () => ({ data: [] }) }));
jest.mock('@features/auth', () => ({
  useSignOut: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@features/iap', () => ({
  useManageSubscription: () => ({ mutate: jest.fn() }),
}));
jest.mock('expo-image', () => ({ Image: () => null }));

type Node = {
  type: string;
  props: Record<string, unknown>;
  children?: (Node | string)[] | null;
};

function textOf(node: Node | string): string {
  if (typeof node === 'string') return node;
  return (node.children ?? []).map(textOf).join('');
}

/** The header container: the first node whose direct children include the name text. */
function findHeader(node: Node | string | null): Node | null {
  if (node === null || typeof node === 'string') return null;
  const kids = node.children ?? [];
  if (kids.some((k) => typeof k !== 'string' && k.type === 'Text' && textOf(k) === 'Ada'))
    return node;
  for (const k of kids) {
    const hit = findHeader(k);
    if (hit) return hit;
  }
  return null;
}

it('shows photo, name, and bio only, with the bio right under the name', async () => {
  const utils = await render(
    <ProfileScreen navigation={{ navigate: jest.fn() } as never} route={{} as never} />,
  );

  expect(utils.queryByText('ada@example.com')).toBeNull();
  expect(utils.queryByText(/@/)).toBeNull();

  const header = findHeader(utils.toJSON() as Node | null);
  expect(header).not.toBeNull();
  const kids = (header!.children ?? []) as Node[];
  // Photo circle, name, bio: nothing else.
  expect(kids).toHaveLength(3);
  expect(kids[0]!.type).toBe('View');
  expect(textOf(kids[1]!)).toBe('Ada');
  expect(textOf(kids[2]!)).toBe('Loves long walks.');

  const bio = utils.getByText('Loves long walks.');
  const classes = String(bio.props.className).split(' ');
  expect(classes).toContain('mt-2');
  expect(classes).toEqual(expect.arrayContaining(['text-center', 'text-ink-soft']));
});
