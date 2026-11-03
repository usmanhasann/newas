/**
 * Profile → "Sign-in & Security" (N5, client revisions 10/14 p.17): a row near Subscription with
 * the short description "Email and password", opening the Sign-in & Security screen.
 */
import { render, fireEvent, within } from '@testing-library/react-native';
import { ProfileScreen } from '@features/profile/screens/ProfileScreen';

jest.mock('@store/session', () => ({
  useCurrentUser: () => ({ id: 'u1', email: 'a@b.co' }),
}));
jest.mock('@features/profile/hooks', () => ({
  useProfile: () => ({ data: { display_name: 'Ada', bio: null } }),
}));
jest.mock('@features/insights', () => ({
  useJournalStats: () => ({ data: { entries_count: 1, current_streak: 1 } }),
}));
jest.mock('@features/circles', () => ({ useMyCircles: () => ({ data: [] }) }));
jest.mock('@features/auth', () => ({
  useSignOut: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@features/iap', () => ({
  useManageSubscription: () => ({ mutate: jest.fn() }),
}));

describe('<ProfileScreen /> — Sign-in & Security row', () => {
  it('sits right below Subscription, says "Email and password", and opens its screen', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    const { getByText, getAllByRole } = await render(
      <ProfileScreen navigation={navigation as never} route={{} as never} />,
    );

    const row = getByText('Sign-in & Security');
    expect(within(row.parent!).getByText('Email and password')).toBeTruthy();

    // Order of the Account rows: Subscription, then Sign-in & Security.
    const labels = getAllByRole('button')
      .map((b) =>
        within(b)
          .queryAllByText(/./)
          .map((t) => t.props.children),
      )
      .flat()
      .filter((t): t is string => typeof t === 'string');
    const sub = labels.indexOf('Subscription');
    expect(sub).toBeGreaterThanOrEqual(0);
    expect(labels.indexOf('Sign-in & Security')).toBe(sub + 2); // its description sits between

    await fireEvent.press(row);
    expect(navigation.navigate).toHaveBeenCalledWith('SignInSecurity');
  });
});
