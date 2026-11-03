/**
 * Client 10/14 p.15: the streak badge's urgent state (8pm, today not journaled) shows the phone's own
 * color emoji, ⏳ (U+23F3 hourglass with flowing sand, not U+231B) then 🔥, as plain text characters,
 * with no drawn icon left. The count still escalates to red, and screen readers hear one label.
 * One render per file.
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
const mockStreak = { state: 'urgent', streak: 7 };
jest.mock('@features/journal/hooks', () => ({
  useTodayMoods: () => [],
  useStreakIndicator: () => mockStreak,
}));

it('urgent: ⏳ then 🔥 then the red count, all real emoji characters, no streak icons', async () => {
  const screen = await render(
    <TodaysMoodCard onPickMood={jest.fn()} onPressCard={jest.fn()} />,
  );

  const badge = screen.getByLabelText('7 day streak. Journal before midnight to keep it');
  expect(badge.props.accessible).toBe(true); // one element: the emoji are not read out one by one

  const hourglass = screen.getByText('⏳');
  const flame = screen.getByText('\u{1F525}');
  const count = screen.getByText('7');
  // Exactly the bare characters (no variation selector or stray text around them).
  expect(hourglass.props.children).toBe('⏳');
  expect(flame.props.children).toBe('🔥');
  // By code point: U+23F3 hourglass with flowing sand (not U+231B), U+1F525 fire, nothing else.
  expect([...hourglass.props.children].map((ch: string) => ch.codePointAt(0))).toEqual([
    0x23f3,
  ]);
  expect([...flame.props.children].map((ch: string) => ch.codePointAt(0))).toEqual([
    0x1f525,
  ]);
  expect(screen.queryByText('⌛')).toBeNull(); // not the plain hourglass
  // Order inside the badge: hourglass, flame, count.
  const order = badge.children.map((c) => (typeof c === 'string' ? c : c.props.children));
  expect(order).toEqual(['⏳', '🔥', 7]);
  expect(count.props.style).toEqual(
    expect.objectContaining({ color: colors['danger-strong'] }),
  );

  // The old drawn flame / hourglass icons are gone (the mood circles still use their own icons).
  const iconNames = mockIcon.mock.calls.map(([name]) => name);
  expect(iconNames.length).toBeGreaterThan(0); // the icon mock is live (mood circles)
  expect(iconNames).not.toContain('flame');
  expect(iconNames).not.toContain('hourglass');
});
