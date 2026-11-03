/**
 * Client 10/14 p.21 (N13): the reflection tone is no longer on Edit Profile (it has its own Profile
 * row and screen), so Edit Profile is name, photo and bio only, and saving it never writes a tone
 * (it can't undo a tone just picked on the Reflection Tone screen).
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
      bio: 'Hello',
      avatar_url: null,
      personal_reflection_style: 'direct',
      personal_reflection_style_secondary: 'reflective',
    },
  }),
  useUpdateProfile: () => ({ mutateAsync: mockMutateAsync }),
}));
jest.mock('@features/profile/avatar', () => ({ uploadAvatar: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-image', () => ({ Image: () => null }));

it('has no reflection tone setting and saves only name, photo and bio', async () => {
  const nav = { goBack: jest.fn() };
  const utils = await render(<EditProfileScreen navigation={nav as never} route={{} as never} />);

  expect(utils.queryByText(/Reflection tone/i)).toBeNull();
  for (const tone of ['Gentle', 'Direct', 'Encouraging', 'Reflective']) {
    expect(utils.queryByLabelText(tone)).toBeNull();
  }
  expect(utils.queryByText(/blend them/)).toBeNull();
  // Name, photo and bio stay.
  expect(utils.getByLabelText('Name')).toBeTruthy();
  expect(utils.getByLabelText('Change avatar')).toBeTruthy();
  expect(utils.getByText('Bio')).toBeTruthy();

  await act(async () => fireEvent.press(utils.getByText('Save')));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(Object.keys(mockMutateAsync.mock.calls[0][0]).sort()).toEqual([
    'avatar_url',
    'bio',
    'display_name',
  ]);
});
