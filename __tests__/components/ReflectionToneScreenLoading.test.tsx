/**
 * Reflection Tone screen (client revisions 10/14 p.21, N13): until the profile has loaded it shows
 * a spinner, never a guessed tone that could be saved over the real one. One render per file.
 */
import { render } from '@testing-library/react-native';
import { ReflectionToneScreen } from '@features/profile/screens/ReflectionToneScreen';

jest.mock('@features/profile/hooks', () => ({
  useProfile: () => ({ data: undefined, isError: false, isRefetching: false, refetch: jest.fn() }),
  useUpdateProfile: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

it('shows no tones and no Save before the saved choice is known', async () => {
  const nav = { goBack: jest.fn(), navigate: jest.fn() };
  const utils = await render(<ReflectionToneScreen navigation={nav as never} route={{} as never} />);

  expect(utils.getByText('Reflection Tone')).toBeTruthy();
  expect(utils.queryByLabelText('Gentle')).toBeNull();
  expect(utils.queryByText('Save')).toBeNull();
});
