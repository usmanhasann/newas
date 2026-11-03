/**
 * Circles tab when the circles list can't be loaded: "No circles yet" must only show when the user
 * really isn't in any circles (client revisions 2026-10-14, p10), so a failed load says so and
 * offers Try again instead of claiming the user has no circles.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent } from '@testing-library/react-native';
import { MyCirclesScreen } from '@features/circles/screens/MyCirclesScreen';

jest.mock('@features/profile', () => ({
  useProfile: () => ({ data: { display_name: 'Konah Quittman' } }),
}));
const mockRefetch = jest.fn();
jest.mock('@features/circles/hooks', () => ({
  useMyCircles: () => ({
    data: undefined,
    isLoading: false,
    isError: true,
    isFetching: false,
    refetch: mockRefetch,
  }),
}));

it('a failed load shows a retry card, never "No circles yet"', async () => {
  const utils = await render(
    <MyCirclesScreen navigation={{ navigate: jest.fn() } as never} route={{} as never} />,
  );

  expect(utils.queryByText('No circles yet')).toBeNull();
  expect(utils.getByText('We couldn’t load your circles')).toBeTruthy();
  expect(utils.getByText('Check your connection and try again.')).toBeTruthy();

  await fireEvent.press(utils.getByText('Try again'));
  expect(mockRefetch).toHaveBeenCalled();
});
