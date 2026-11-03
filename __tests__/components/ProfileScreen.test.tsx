/**
 * ProfileScreen header + stats.
 * - "In Circle" stat was hardcoded to "0"; it must show useMyCircles().data.length (own + joined).
 * - The bio saves in Edit Profile but was never displayed; it must render under the name when set,
 *   and be absent when the user has no bio. (No email line since client 10/14: see
 *   ProfileHeaderNoEmail.test.tsx.)
 * All feature hooks are mocked; assertions are on what the header/stat cards render.
 */
import { Alert } from 'react-native';
import { render, fireEvent, within } from '@testing-library/react-native';
import { ProfileScreen } from '@features/profile/screens/ProfileScreen';

const mockSignOut = jest.fn();

type MyCircle = { id: string; name: string; role: 'owner' | 'member' };
const circlesState: { data: MyCircle[] | undefined } = { data: [] };
const statsState: { data: { entries_count: number; current_streak: number } | undefined } = {
  data: { entries_count: 7, current_streak: 3 },
};
const profileState: { data: { display_name: string | null; bio: string | null } | undefined } = {
  data: { display_name: 'Ada', bio: null },
};

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1', email: 'a@b.co' }) }));
jest.mock('@features/profile/hooks', () => ({ useProfile: () => profileState }));
jest.mock('@features/insights', () => ({ useJournalStats: () => statsState }));
jest.mock('@features/circles', () => ({ useMyCircles: () => circlesState }));
jest.mock('@features/auth', () => ({ useSignOut: () => ({ mutate: mockSignOut, isPending: false }) }));
jest.mock('@features/iap', () => ({ useManageSubscription: () => ({ mutate: jest.fn() }) }));

type Rendered = Awaited<ReturnType<typeof render>>;

function makeNav() {
  return { navigate: jest.fn(), goBack: jest.fn() };
}

function renderProfile(): Promise<Rendered> {
  return render(<ProfileScreen navigation={makeNav() as never} route={{} as never} />);
}

/** Each Stat renders <View>{value}{label}</View>; the value sits in the same container as its label. */
function expectStat(utils: Rendered, label: string, value: string) {
  const container = utils.getByText(label).parent!;
  expect(within(container).getByText(value)).toBeTruthy();
}

beforeEach(() => {
  circlesState.data = [];
  statsState.data = { entries_count: 7, current_streak: 3 };
  profileState.data = { display_name: 'Ada', bio: null };
  mockSignOut.mockClear();
});

describe('<ProfileScreen /> — "In Circle" stat', () => {
  it('counts every circle the user is in (own + joined), not zero', async () => {
    circlesState.data = [
      { id: 'c1', name: 'Mine', role: 'owner' },
      { id: 'c2', name: "Sam's", role: 'member' },
    ];
    expectStat(await renderProfile(), 'In Circle', '2');
  });

  it('shows a single circle the user created (owner is an approved member)', async () => {
    circlesState.data = [{ id: 'c1', name: 'Mine', role: 'owner' }];
    expectStat(await renderProfile(), 'In Circle', '1');
  });

  it('falls back to 0 while the circles query is still loading (undefined)', async () => {
    circlesState.data = undefined;
    expectStat(await renderProfile(), 'In Circle', '0');
  });

  it('leaves Entries and Day Streak reading from stats', async () => {
    const utils = await renderProfile();
    expectStat(utils, 'Entries', '7');
    expectStat(utils, 'Day Streak', '3');
  });
});

describe('<ProfileScreen /> — log out confirmation', () => {
  type AlertButton = { text?: string; style?: string; onPress?: () => void };

  it('does not log out immediately — it asks for confirmation first', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const utils = await renderProfile();
    fireEvent.press(utils.getByText('Log Out'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Log out?',
      'Are you sure you want to log out?',
      expect.any(Array),
    );
    expect(mockSignOut).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('logs out only when the confirm button is pressed; the cancel button does not', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const utils = await renderProfile();
    fireEvent.press(utils.getByText('Log Out'));

    const buttons = alertSpy.mock.calls[0][2] as AlertButton[] | undefined;
    const cancel = buttons?.find((b) => b.style === 'cancel');
    const confirm = buttons?.find((b) => b.text === 'Log Out');
    expect(cancel).toBeTruthy();
    expect(confirm).toBeTruthy();

    // Tapping "Cancel" (back) does nothing.
    cancel?.onPress?.();
    expect(mockSignOut).not.toHaveBeenCalled();

    // Tapping "Log Out" signs the user out.
    confirm?.onPress?.();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });
});

describe('<ProfileScreen /> — bio', () => {
  it('displays the saved bio under the name', async () => {
    profileState.data = { display_name: 'Ada', bio: 'Loves long walks and lo-fi.' };
    const utils = await renderProfile();
    expect(utils.getByText('Loves long walks and lo-fi.')).toBeTruthy();
  });

  it('shows no bio text when the user has none', async () => {
    profileState.data = { display_name: 'Ada', bio: null };
    const utils = await renderProfile();
    // Only the photo + name render in the header; there is no stray bio line.
    expect(utils.queryByText('Loves long walks and lo-fi.')).toBeNull();
  });
});
