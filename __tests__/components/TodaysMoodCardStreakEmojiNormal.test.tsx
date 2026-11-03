/**
 * Client 10/14 p.15: the streak badge's normal state shows the phone's own color emoji 🔥 (a plain
 * text character, no drawn icon) beside the count, and no hourglass. One render per file.
 */
import { render } from '@testing-library/react-native';
import { TodaysMoodCard } from '@features/journal/components/TodaysMoodCard';
import { colors } from '@theme';

const mockIcon = jest.fn();
jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: { name: string }) => {
    mockIcon(props.name);
    return null;
  },
}));
const mockStreak = { state: 'normal', streak: 5 };
jest.mock('@features/journal/hooks', () => ({
  useTodayMoods: () => [],
  useStreakIndicator: () => mockStreak,
}));

it('normal: 🔥 then the dark count, a real emoji character, no hourglass and no flame icon', async () => {
  const screen = await render(
    <TodaysMoodCard onPickMood={jest.fn()} onPressCard={jest.fn()} />,
  );

  const badge = screen.getByLabelText('5 day streak');
  expect(badge.props.accessible).toBe(true);
  const order = badge.children.map((c) => (typeof c === 'string' ? c : c.props.children));
  expect(order).toEqual(['\u{1F525}', 5]);
  expect(screen.queryByText('⏳')).toBeNull();
  expect(screen.getByText('5').props.style).toEqual(
    expect.objectContaining({ color: colors.ink }),
  );

  const iconNames = mockIcon.mock.calls.map(([name]) => name);
  expect(iconNames.length).toBeGreaterThan(0); // the icon mock is live (mood circles)
  expect(iconNames).not.toContain('flame');
  expect(iconNames).not.toContain('hourglass');
});
