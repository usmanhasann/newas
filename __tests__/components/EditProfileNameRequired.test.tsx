/**
 * Client 10/14 p.3: "There should always be a name saved." Edit Profile can no longer save an
 * empty name (decided 2026-10-16): Save is blocked with the sign-up form's own message, nothing is
 * written, and the message goes away once a name is typed; a real name saves as before.
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
      timezone: 'UTC',
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

it('blocks saving an empty name with a message, then saves once a name is typed', async () => {
  const nav = { goBack: jest.fn() };
  const utils = await render(<EditProfileScreen navigation={nav as never} route={{} as never} />);
  const nameInput = utils.getByLabelText('Name');

  await act(async () => fireEvent.changeText(nameInput, '   '));
  await act(async () => fireEvent.press(utils.getByText('Save')));
  expect(utils.getByText('Your name helps personalize LYSM')).toBeTruthy();
  expect(mockMutateAsync).not.toHaveBeenCalled();
  expect(nav.goBack).not.toHaveBeenCalled();

  await act(async () => fireEvent.changeText(nameInput, ' Konah '));
  expect(utils.queryByText('Your name helps personalize LYSM')).toBeNull();
  await act(async () => fireEvent.press(utils.getByText('Save')));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0]).toMatchObject({ display_name: 'Konah' });
  await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
});
