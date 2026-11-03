/**
 * Client 10/14 p.30: the Timezone field, its "Use device" button and its helper text are gone from
 * Edit Profile (the app follows the phone's zone by itself), and saving the profile never writes a
 * time zone, so it can't put back an old one after the user travels.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { EditProfileScreen } from '@features/profile/screens/EditProfileScreen';

const mockMutateAsync = jest.fn((_patch: Record<string, unknown>) => Promise.resolve({}));
jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/profile/hooks', () => ({
  useProfile: () => ({
    data: {
      display_name: 'Konah Quittman',
      bio: null,
      timezone: 'America/Los_Angeles',
      avatar_url: null,
      personal_reflection_style: 'gentle',
      personal_reflection_style_secondary: null,
    },
  }),
  useUpdateProfile: () => ({ mutateAsync: mockMutateAsync }),
}));
jest.mock('@features/profile/avatar', () => ({ uploadAvatar: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-image', () => ({ Image: () => null }));

it('shows no time zone setting and saves without a time zone', async () => {
  const nav = { goBack: jest.fn() };
  const utils = await render(<EditProfileScreen navigation={nav as never} route={{} as never} />);

  expect(utils.queryByText('Timezone')).toBeNull();
  expect(utils.queryByText('Use device')).toBeNull();
  expect(utils.queryByText(/bucket your streaks/)).toBeNull();
  expect(utils.queryByText('America/Los_Angeles')).toBeNull();
  // Name and bio are still there.
  expect(utils.getByLabelText('Name')).toBeTruthy();
  expect(utils.getByText('Bio')).toBeTruthy();

  await act(async () => fireEvent.press(utils.getByText('Save')));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  const patch = mockMutateAsync.mock.calls[0][0];
  expect(patch).not.toHaveProperty('timezone');
  expect(patch).toMatchObject({ display_name: 'Konah Quittman' });
});
