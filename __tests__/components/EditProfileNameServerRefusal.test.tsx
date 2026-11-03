/**
 * Client revisions 10/14 p.5 (N7.20 / N7.23): the database re-checks names. When it refuses one for
 * a check mark (error name_has_check_mark), Edit Profile shows the client's message under the name,
 * not the generic "Could not save" alert, and stays open.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { Alert } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { EditProfileScreen } from '@features/profile/screens/EditProfileScreen';

const mockMutateAsync = jest.fn((_patch: Record<string, unknown>) =>
  Promise.reject({ code: '22023', message: 'name_has_check_mark' }),
);
jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/profile/hooks', () => ({
  useProfile: () => ({
    data: {
      display_name: 'Taylor',
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

const MESSAGE = 'Names can’t include check marks or verification symbols.';

it('shows the check mark message when the server refuses the name', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const nav = { goBack: jest.fn() };
  const utils = await render(<EditProfileScreen navigation={nav as never} route={{} as never} />);

  await act(async () => fireEvent.press(utils.getByText('Save')));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(utils.getByText(MESSAGE)).toBeTruthy());
  expect(alert).not.toHaveBeenCalled();
  expect(nav.goBack).not.toHaveBeenCalled();

  // Editing the name clears it.
  await act(async () => fireEvent.changeText(utils.getByLabelText('Name'), 'Taylor S'));
  expect(utils.queryByText(MESSAGE)).toBeNull();
});
