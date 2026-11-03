/**
 * Client revisions 10/14 p.5 (N7.10): a verified person sees the purple badge right after their
 * name at the top of Profile. It sits inside the name's own line, so the header is still photo,
 * name, bio (O23), and a screen reader hears "Ada, verified".
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render } from '@testing-library/react-native';
import { ProfileScreen } from '@features/profile/screens/ProfileScreen';

jest.mock('@store/session', () => ({
  useCurrentUser: () => ({ id: 'u1', email: 'ada@example.com' }),
}));
jest.mock('@features/profile/hooks', () => ({
  useProfile: () => ({
    data: { display_name: 'Ada', bio: 'Loves long walks.', avatar_url: null, verified: true },
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

it('shows the badge right after a verified person’s name, header unchanged', async () => {
  const utils = await render(
    <ProfileScreen navigation={{ navigate: jest.fn() } as never} route={{} as never} />,
  );

  const badge = utils.getByLabelText('Verified');
  const name = utils.getByLabelText('Ada, verified');
  // Inside the name's line, after the name.
  const kids = name.children;
  expect(kids[0]).toBe('Ada');
  expect(kids[kids.length - 1]).toBe(badge);
  // Sized to the h2 name (24px).
  expect(badge.props.size).toBe(24);

  // Still photo, name, bio.
  const header = name.parent!;
  expect(header.children).toHaveLength(3);
  expect(header.children[1]).toBe(name);
  expect(header.children[2]).toBe(utils.getByText('Loves long walks.'));
});
