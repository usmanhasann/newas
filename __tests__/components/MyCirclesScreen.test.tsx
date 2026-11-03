/**
 * Circles tab main page: "[Name]’s Circle" headline (the user's first name, like Home's greeting),
 * "Your Circles" section label, and joining now lives behind the single "Discover circles" row
 * (the standalone "Join with a code" row is gone). Everything else is unchanged.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent } from '@testing-library/react-native';
import { MyCirclesScreen } from '@features/circles/screens/MyCirclesScreen';

jest.mock('@features/profile', () => ({
  useProfile: () => ({ data: { display_name: 'Konah Quittman' } }),
}));
jest.mock('@features/circles/hooks', () => ({
  useMyCircles: () => ({
    data: [{ id: 'c1', name: 'Runners', type: 'public', role: 'owner' }],
    isLoading: false,
  }),
}));

it('shows "[Name]’s Circle", "Your Circles", and one Discover circles row for joining', async () => {
  const navigation = { navigate: jest.fn() };
  const utils = await render(
    <MyCirclesScreen navigation={navigation as never} route={{} as never} />,
  );

  expect(utils.getByText('Konah’s Circle')).toBeTruthy();
  expect(utils.queryByText('Trusted Circle')).toBeNull();
  expect(utils.getByText('Share how you feel with people who care.')).toBeTruthy(); // unchanged

  expect(utils.getByText('Your Circles')).toBeTruthy();
  expect(utils.queryByText('Your Connections')).toBeNull();
  expect(utils.getByText('Runners')).toBeTruthy(); // the list below is unchanged

  expect(utils.getByText('Create a circle')).toBeTruthy();
  expect(utils.queryByText('Join with a code')).toBeNull();
  expect(
    utils.getByText('Have an invite code, or browse to find a circle to join.'),
  ).toBeTruthy();

  fireEvent.press(utils.getByText('Discover circles'));
  expect(navigation.navigate).toHaveBeenCalledWith('JoinCircle');
});
