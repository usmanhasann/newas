/**
 * Client revisions 10/14 p.5 (N7.20, N7.21, N7.23): a name in Edit Profile can't include check
 * marks or verification symbols. Typing one shows the client's exact message under the name and
 * Save does nothing; taking it out clears the message and the name saves as before.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { EditProfileScreen } from '@features/profile/screens/EditProfileScreen';

const mockMutateAsync = jest.fn((_patch: Record<string, unknown>) => Promise.resolve({}));
jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/profile/hooks', () => ({
  useProfile: () => ({
    data: {
      display_name: 'Taylor Star',
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

it('refuses a name with a check mark, with the client’s message, until it is taken out', async () => {
  const nav = { goBack: jest.fn() };
  const utils = await render(<EditProfileScreen navigation={nav as never} route={{} as never} />);
  const nameInput = utils.getByLabelText('Name');
  expect(utils.queryByText(MESSAGE)).toBeNull();

  // Each of the client's symbols shows the message as soon as it's typed, and Save is blocked.
  for (const mark of ['✓', '✔', '☑', '✅', '☑️']) {
    await act(async () => fireEvent.changeText(nameInput, `Taylor Star ${mark}`));
    expect(utils.getByText(MESSAGE)).toBeTruthy();
    await act(async () => fireEvent.press(utils.getByText('Save')));
  }
  expect(mockMutateAsync).not.toHaveBeenCalled();
  expect(nav.goBack).not.toHaveBeenCalled();

  // Taken out: the message goes and the name saves.
  await act(async () => fireEvent.changeText(nameInput, 'Taylor Star'));
  expect(utils.queryByText(MESSAGE)).toBeNull();
  await act(async () => fireEvent.press(utils.getByText('Save')));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0]).toMatchObject({ display_name: 'Taylor Star' });
  await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
});
