/**
 * Reflection Tone screen (client revisions 10/14 p.21, N13): adding a second tone and tapping Save
 * writes both tones (primary + secondary) and nothing else, then goes back to Profile.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { ReflectionToneScreen } from '@features/profile/screens/ReflectionToneScreen';

const mockMutateAsync = jest.fn((_patch: Record<string, unknown>) => Promise.resolve({}));
jest.mock('@features/profile/hooks', () => ({
  useProfile: () => ({
    data: {
      display_name: 'Konah',
      bio: 'Hi',
      avatar_url: null,
      personal_reflection_style: 'gentle',
      personal_reflection_style_secondary: null,
    },
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useUpdateProfile: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

it('saves the primary and second tone, only those, then goes back', async () => {
  const nav = { goBack: jest.fn(), navigate: jest.fn() };
  const utils = await render(<ReflectionToneScreen navigation={nav as never} route={{} as never} />);

  expect(utils.getByLabelText('Gentle').props.accessibilityState).toMatchObject({ checked: true });
  await act(async () => fireEvent.press(utils.getByLabelText('Direct')));
  expect(utils.getByLabelText('Direct').props.accessibilityState).toMatchObject({ checked: true });

  await act(async () => fireEvent.press(utils.getByText('Save')));
  await waitFor(() => expect(nav.goBack).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  expect(mockMutateAsync.mock.calls[0][0]).toEqual({
    personal_reflection_style: 'gentle',
    personal_reflection_style_secondary: 'direct',
  });
});
