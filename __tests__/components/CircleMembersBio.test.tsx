/**
 * Circle members list shows each member's bio (it was never fetched or rendered before).
 * fetchMembers now selects `bio` and CircleDetailScreen's member card renders it under the name.
 * Here the hooks are mocked; we switch to the Members tab and assert the bio appears when set and
 * is absent when null.
 */
import { render, fireEvent, act } from '@testing-library/react-native';
import { CircleDetailScreen } from '@features/circles/screens/CircleDetailScreen';

type Member = {
  membership: {
    id: string;
    user_id: string;
    status: 'approved' | 'requested';
    role: 'owner' | 'member';
  };
  profile: {
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
  } | null;
};

const membersState: { data: Member[] } = { data: [] };

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
// The feed tab has its own tests (CircleFeed.test); this file is about the page around it.
jest.mock('@features/circles/components/CircleFeed', () => ({ CircleFeed: () => null }));
jest.mock('@features/notifications', () => ({ notifyEvent: jest.fn() }));
jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({
    data: { id: 'c1', name: 'Family', owner_id: 'u1', invite_code: 'ABC123' },
    isLoading: false,
  }),
  useMembers: () => membersState,
  useSetMemberStatus: () => ({ mutate: jest.fn(), isPending: false }),
  useRemoveMember: () => ({ mutate: jest.fn(), isPending: false }),
  useLeaveCircle: () => ({ mutate: jest.fn(), isPending: false }),
  useBanUser: () => ({ mutate: jest.fn(), isPending: false }),
  useArchiveCircle: () => ({ mutate: jest.fn(), isPending: false }),
}));

function makeNav() {
  return { navigate: jest.fn(), goBack: jest.fn() };
}

async function renderMembersTab() {
  const utils = await render(
    <CircleDetailScreen
      navigation={makeNav() as never}
      route={{ params: { circleId: 'c1' } } as never}
    />,
  );
  // The screen opens on the Board tab; switch to Members.
  await act(async () => {
    fireEvent.press(utils.getByText(`Members (${membersState.data.length})`));
  });
  return utils;
}

const member = (bio: string | null): Member => ({
  membership: { id: 'm1', user_id: 'u1', status: 'approved', role: 'owner' },
  profile: { user_id: 'u1', display_name: 'Ada', avatar_url: null, bio },
});

describe('<CircleDetailScreen /> — member bio', () => {
  it("shows a member's bio under their name", async () => {
    membersState.data = [member('Runner, reader, tea drinker.')];
    const utils = await renderMembersTab();
    expect(utils.getByText('Runner, reader, tea drinker.')).toBeTruthy();
  });

  it('renders the member with no bio line when bio is null', async () => {
    membersState.data = [member(null)];
    const utils = await renderMembersTab();
    expect(utils.getByText('Ada (you)')).toBeTruthy();
    expect(utils.queryByText('Runner, reader, tea drinker.')).toBeNull();
  });
  // The invite code box is gone from the circle page (client 10/14, p.29): the code lives behind
  // the add-person icon now (InviteScreen.test covers its press-and-hold Copy), and
  // CircleDetailOwnerHeader.test and CircleDetailArchivedLeave.test check the box is gone.
});
