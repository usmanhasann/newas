/**
 * Circles tab with no circles (client revisions 2026-10-14, p9/p10): the "No circles yet" card keeps
 * its title and shows the client's new text, word for word. No circle cards are shown.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render } from '@testing-library/react-native';
import { MyCirclesScreen } from '@features/circles/screens/MyCirclesScreen';

jest.mock('@features/profile', () => ({
  useProfile: () => ({ data: { display_name: 'Konah Quittman' } }),
}));
jest.mock('@features/circles/hooks', () => ({
  useMyCircles: () => ({ data: [], isLoading: false, isError: false }),
}));

it('"No circles yet" shows the client’s new text exactly', async () => {
  const utils = await render(
    <MyCirclesScreen navigation={{ navigate: jest.fn() } as never} route={{} as never} />,
  );

  expect(utils.getByText('No circles yet')).toBeTruthy();
  expect(
    utils.getByText(
      'Create a circle and invite people, or join one with a code. Once you’re in one, you can share your mood along with your AI reflection or written entry, and post with others in the circle.',
    ),
  ).toBeTruthy();
  expect(utils.queryByText(/AI summaries here/)).toBeNull();
  expect(utils.queryByText(/ · (Owner|Member)$/)).toBeNull();
});
