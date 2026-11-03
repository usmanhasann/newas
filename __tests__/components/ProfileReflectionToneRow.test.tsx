/**
 * Profile → Reflection Tone (client revisions 10/14 p.21, N13): a new Account row directly below
 * Edit Profile, styled like the others (icon, title, subtitle, arrow), opening the Reflection Tone
 * screen. Edit Profile's subtitle stays the same. One render per file.
 */
import { render, fireEvent, act } from '@testing-library/react-native';
import type { ReactTestRendererJSON } from 'react-test-renderer';
import { ProfileScreen } from '@features/profile/screens/ProfileScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1', email: 'a@b.co' }) }));
jest.mock('@features/profile/hooks', () => ({
  useProfile: () => ({ data: { display_name: 'Ada', bio: null } }),
}));
jest.mock('@features/insights', () => ({
  useJournalStats: () => ({ data: { entries_count: 1, current_streak: 1 } }),
}));
jest.mock('@features/circles', () => ({ useMyCircles: () => ({ data: [] }) }));
jest.mock('@features/auth', () => ({ useSignOut: () => ({ mutate: jest.fn(), isPending: false }) }));
jest.mock('@features/iap', () => ({ useManageSubscription: () => ({ mutate: jest.fn() }) }));

function texts(node: ReactTestRendererJSON | string | null): string[] {
  if (node === null) return [];
  if (typeof node === 'string') return [node];
  return (node.children ?? []).flatMap((c) => texts(c));
}

function find(node: ReactTestRendererJSON | string, type: string): ReactTestRendererJSON[] {
  if (typeof node === 'string') return [];
  const own = node.type === type ? [node] : [];
  return own.concat(...(node.children ?? []).map((c) => find(c, type)));
}

it('adds Reflection Tone right below Edit Profile, like the other rows, and opens its screen', async () => {
  const nav = { navigate: jest.fn(), goBack: jest.fn() };
  const utils = await render(<ProfileScreen navigation={nav as never} route={{} as never} />);

  // Exact copy (no trailing period, like the other rows).
  expect(utils.getByText('Reflection Tone')).toBeTruthy();
  expect(utils.getByText('Choose how your AI reflections are written')).toBeTruthy();
  expect(utils.getByText('Update your name, photo, and bio')).toBeTruthy();

  // Directly below Edit Profile, in the Account section (the very next row).
  const all = texts(utils.toJSON() as ReactTestRendererJSON);
  const edit = all.indexOf('Edit Profile');
  expect(edit).toBeGreaterThan(all.indexOf('Account'));
  expect(all.slice(edit, edit + 4)).toEqual([
    'Edit Profile',
    'Update your name, photo, and bio',
    'Reflection Tone',
    'Choose how your AI reflections are written',
  ]);
  expect(all.indexOf('Reflection Tone')).toBeLessThan(all.indexOf('Support'));

  // Same row parts as Edit Profile: a leading icon and the trailing arrow.
  const row = (label: string) => {
    let n = utils.getByText(label);
    while (n.parent && n.props.accessibilityRole !== 'button') n = n.parent;
    return n;
  };
  const icons = (label: string) =>
    find(row(label) as unknown as ReactTestRendererJSON, 'Icon').map((i) => i.props.name);
  expect(icons('Reflection Tone')).toEqual(['sparkles-outline', 'chevron-forward']);
  expect(icons('Edit Profile')).toEqual(['create-outline', 'chevron-forward']);

  await act(async () => fireEvent.press(utils.getByText('Reflection Tone')));
  expect(nav.navigate).toHaveBeenCalledWith('ReflectionTone');
});
