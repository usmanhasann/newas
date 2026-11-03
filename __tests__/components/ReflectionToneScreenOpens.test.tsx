/**
 * Reflection Tone screen (client revisions 10/14 p.21, N13): it shows the same 4 tones as
 * onboarding, opens with the saved choice already selected, and at 2 chosen the others can't be
 * picked (up to 2). One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, act } from '@testing-library/react-native';
import type { ReactTestRendererJSON } from 'react-test-renderer';
import { ReflectionToneScreen } from '@features/profile/screens/ReflectionToneScreen';

const mockMutateAsync = jest.fn(() => Promise.resolve({}));
jest.mock('@features/profile/hooks', () => ({
  useProfile: () => ({
    data: {
      display_name: 'Konah',
      personal_reflection_style: 'encouraging',
      personal_reflection_style_secondary: 'reflective',
    },
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useUpdateProfile: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

function texts(node: ReactTestRendererJSON | string | null): string[] {
  if (node === null) return [];
  if (typeof node === 'string') return [node];
  return (node.children ?? []).flatMap((c) => texts(c));
}

it('opens on the saved two tones, shows all 4 in onboarding order, and caps at 2', async () => {
  const nav = { goBack: jest.fn(), navigate: jest.fn() };
  const utils = await render(<ReflectionToneScreen navigation={nav as never} route={{} as never} />);

  expect(utils.getByText('Reflection Tone')).toBeTruthy();
  const all = texts(utils.toJSON() as ReactTestRendererJSON);
  const order = ['Gentle', 'Direct', 'Encouraging', 'Reflective'].map((t) => all.indexOf(t));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);

  const state = (label: string) => utils.getByLabelText(label).props.accessibilityState;
  expect(state('Encouraging')).toMatchObject({ checked: true });
  expect(state('Reflective')).toMatchObject({ checked: true });
  expect(state('Gentle')).toMatchObject({ checked: false, disabled: true });
  expect(state('Direct')).toMatchObject({ checked: false, disabled: true });

  // A third tone can't be added.
  await act(async () => fireEvent.press(utils.getByLabelText('Gentle')));
  expect(state('Gentle')).toMatchObject({ checked: false });
  expect(state('Encouraging')).toMatchObject({ checked: true });
  expect(state('Reflective')).toMatchObject({ checked: true });
  expect(mockMutateAsync).not.toHaveBeenCalled();
});
