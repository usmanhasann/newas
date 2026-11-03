/**
 * Client revisions 10/14 p.5 (N7.02 / N7.19): the badge is only for people an admin verified. Not
 * verified (or verified turned off again): no badge on Profile, and the name reads as just the name.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render } from '@testing-library/react-native';
import { ProfileScreen } from '@features/profile/screens/ProfileScreen';

jest.mock('@store/session', () => ({
  useCurrentUser: () => ({ id: 'u1', email: 'ada@example.com' }),
}));
jest.mock('@features/profile/hooks', () => ({
  useProfile: () => ({
    data: { display_name: 'Ada', bio: null, avatar_url: null, verified: false },
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

it('shows no badge for someone who isn’t verified', async () => {
  const utils = await render(
    <ProfileScreen navigation={{ navigate: jest.fn() } as never} route={{} as never} />,
  );
  expect(utils.queryByLabelText('Verified')).toBeNull();
  const name = utils.getByText('Ada');
  expect(name.children).toEqual(['Ada']);
  expect(name.props.accessibilityLabel).toBeUndefined();
});
