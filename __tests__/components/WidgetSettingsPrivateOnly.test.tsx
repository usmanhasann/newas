/**
 * Home Widget picker: Private circles only. Public circles are never offered, and a Public circle
 * picked before this rule reads as "Don't show a widget". One render per file.
 */
import { render, fireEvent } from '@testing-library/react-native';
import { WidgetSettingsScreen } from '@features/widget/screens/WidgetSettingsScreen';

jest.mock('@features/circles', () => ({
  useMyCircles: () => ({
    isLoading: false,
    data: [
      { id: 'pub', name: 'Konah Public Circle', type: 'public' },
      { id: 'priv', name: 'Konah’s Friends', type: 'private' },
    ],
  }),
}));
const mockSetCircle = jest.fn();
jest.mock('@features/widget/hooks', () => ({
  useWidgetCircle: () => ({ data: 'pub' }), // stale Public choice from before
  useSetWidgetCircle: () => ({ mutate: mockSetCircle }),
}));

it('offers only Private circles; a stale Public choice reads as no widget', async () => {
  const utils = await render(
    <WidgetSettingsScreen navigation={{ goBack: jest.fn() } as never} route={{} as never} />,
  );

  expect(utils.getByText('Konah’s Friends')).toBeTruthy();
  expect(utils.queryByText('Konah Public Circle')).toBeNull();
  expect(utils.queryByText('Public Circle')).toBeNull();

  const none = utils.getByRole('radio', { name: /Don’t show a widget/ });
  expect(none.props.accessibilityState).toMatchObject({ selected: true });

  fireEvent.press(utils.getByText('Konah’s Friends'));
  expect(mockSetCircle).toHaveBeenCalledWith('priv');
});
