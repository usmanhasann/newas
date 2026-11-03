/**
 * Client revisions 10/14, p.17: nothing changes for owners. They still see the Circle Settings gear
 * (no ••• menu, no Leave circle). p.29: a Public circle with no description leaves that line out
 * completely, and the invite code box is gone from the top of the page (the Feed and Members tabs
 * move up); the code lives behind the add-person icon.
 * One render per file (React 19 leaks across sibling renders).
 */
import { render, fireEvent } from '@testing-library/react-native';
import { CircleDetailScreen } from '@features/circles/screens/CircleDetailScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/circles/components/CircleFeed', () => ({ CircleFeed: () => null }));
jest.mock('@features/notifications', () => ({ notifyEvent: jest.fn() }));
jest.mock('@features/circles/hooks', () => ({
  useCircle: () => ({
    data: {
      id: 'c5',
      name: 'Morning Pages',
      type: 'public',
      owner_id: 'u1',
      invite_code: 'MRN555',
      description: '   ',
      archived_at: null,
    },
    isLoading: false,
  }),
  useMembers: () => ({
    data: [
      {
        membership: { id: 'm1', user_id: 'u1', status: 'approved', role: 'owner' },
        profile: { user_id: 'u1', display_name: 'Konah', avatar_url: null, bio: null },
      },
    ],
  }),
  useSetMemberStatus: () => ({ mutate: jest.fn(), isPending: false }),
  useRemoveMember: () => ({ mutate: jest.fn(), isPending: false }),
  useLeaveCircle: () => ({ mutate: jest.fn(), isPending: false }),
  useBanUser: () => ({ mutate: jest.fn(), isPending: false }),
}));

it('owner: gear (no •••), no empty description line, no invite code box', async () => {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const utils = await render(
    <CircleDetailScreen
      navigation={navigation as never}
      route={{ params: { circleId: 'c5' } } as never}
    />,
  );

  // Owners unchanged: the gear opens Circle Settings; there's no ••• menu.
  expect(utils.queryByLabelText('Circle options')).toBeNull();
  await fireEvent.press(utils.getByLabelText('Circle settings'));
  expect(navigation.navigate).toHaveBeenCalledWith('EditCircle', { circleId: 'c5' });

  // A blank description: the line is left out entirely (no empty gap).
  expect(utils.queryByTestId('circle-description')).toBeNull();

  // The invite code box is gone; the add-person icon still leads to the code.
  expect(utils.queryByText('Invite code')).toBeNull();
  expect(utils.queryByText('MRN555')).toBeNull();
  expect(utils.queryByText('Share')).toBeNull();
  await fireEvent.press(utils.getByLabelText('Invite people'));
  expect(navigation.navigate).toHaveBeenCalledWith('Invite', { circleId: 'c5' });

  // Owners don't get Leave circle in Members either.
  await fireEvent.press(utils.getByText('Members (1)'));
  expect(utils.queryByText('Leave circle')).toBeNull();
});
