/**
 * Reflection Tone screen (client revisions 10/14 p.21, N13): like onboarding, a tone must be picked.
 * Unchoosing the only tone disables Save (nothing is written); picking another enables it again,
 * and a single tone saves with no second tone. One render per file.
 */
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { ReflectionToneScreen } from '@features/profile/screens/ReflectionToneScreen';

const mockMutateAsync = jest.fn((_patch: Record<string, unknown>) => Promise.resolve({}));
jest.mock('@features/profile/hooks', () => ({
  useProfile: () => ({
    data: { personal_reflection_style: 'gentle', personal_reflection_style_secondary: null },
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useUpdateProfile: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

it('needs at least one tone before Save works', async () => {
  const nav = { goBack: jest.fn(), navigate: jest.fn() };
  const utils = await render(<ReflectionToneScreen navigation={nav as never} route={{} as never} />);
  const save = () => utils.getByRole('button', { name: 'Save' });

  expect(save().props.accessibilityState).toMatchObject({ disabled: false });
  await act(async () => fireEvent.press(utils.getByLabelText('Gentle')));
  expect(utils.getByLabelText('Gentle').props.accessibilityState).toMatchObject({ checked: false });
  expect(save().props.accessibilityState).toMatchObject({ disabled: true });
  await act(async () => fireEvent.press(save()));
  expect(mockMutateAsync).not.toHaveBeenCalled();
  expect(nav.goBack).not.toHaveBeenCalled();

  await act(async () => fireEvent.press(utils.getByLabelText('Reflective')));
  expect(save().props.accessibilityState).toMatchObject({ disabled: false });
  await act(async () => fireEvent.press(save()));
  await waitFor(() => expect(nav.goBack).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0]).toEqual({
    personal_reflection_style: 'reflective',
    personal_reflection_style_secondary: null,
  });
});
