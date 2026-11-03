/**
 * Streak popup (client revisions 10/14 p.24 to 25, screenshot p24-streak-popup.png): no check mark,
 * the flame emoji and the streak number side by side (large bold serif, heading color), "DAY STREAK"
 * under it, the message line in softer text, then "See AI summary" and "Back to home". One render
 * per file.
 */
import { render, fireEvent } from '@testing-library/react-native';
import { EntryCompletionModal } from '@features/journal/components/EntryCompletionModal';

/** The text a child element shows ('' for anything else). */
function textOf(child: unknown): unknown {
  if (typeof child === 'string') return child;
  return (child as { props?: { children?: unknown } }).props?.children ?? '';
}

const mockIcon = jest.fn();
jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: { name: string }) => {
    mockIcon(props.name);
    return null;
  },
}));

it('shows the streak popup and both choices; never auto-navigates', async () => {
  const onSeeSummary = jest.fn();
  const onGoHome = jest.fn();
  const screen = await render(
    <EntryCompletionModal
      visible
      completion={{ kind: 'streak', streak: 1, message: 'Great start. Come back tomorrow to make it 2.' }}
      onSeeSummary={onSeeSummary}
      onGoHome={onGoHome}
    />,
  );

  // The header reads as one item, "1 day streak": the flame emoji (a text character, not a drawn
  // icon) immediately left of the number, then "DAY STREAK" under them.
  const header = screen.getByLabelText('1 day streak');
  expect(header.props.accessible).toBe(true);
  expect(header.props.accessibilityRole).toBe('header');
  const [row, label] = header.children;
  expect(textOf(label)).toBe('DAY STREAK');
  const rowChildren = typeof row === 'string' ? [] : row!.children;
  expect(rowChildren.map(textOf)).toEqual(['\u{1F525}', '1']);

  // Large bold serif number in the heading color (not purple). Styling is token classes (NativeWind
  // resolves them on device), so the classes are what is checked here.
  const classes = (text: string) => String(screen.getByText(text).props.className).split(/\s+/);
  expect(classes('1')).toEqual(
    expect.arrayContaining(['font-serif-bold', 'text-hero', 'text-ink']),
  );
  expect(classes('1')).not.toContain('text-brand-500');
  // The emoji is about the numeral's height.
  expect(classes('\u{1F525}')).toContain('text-6xl');

  // "DAY STREAK": smaller, semibold, tracked caps in dark gray. The message: regular weight, softer
  // gray, centered.
  expect(classes('DAY STREAK')).toEqual(
    expect.arrayContaining(['font-sans-semibold', 'uppercase', 'tracking-label', 'text-sm', 'text-ink-muted']),
  );
  expect(classes('DAY STREAK')).not.toContain('text-ink-soft');
  expect(classes('Great start. Come back tomorrow to make it 2.')).toEqual(
    expect.arrayContaining(['font-sans', 'text-ink-soft', 'text-center']),
  );

  // No check mark and no old headline or button label.
  const icons = mockIcon.mock.calls.map(([name]) => name as string);
  expect(icons).not.toContain('checkmark');
  expect(screen.queryByText(/journaling, and counting/)).toBeNull();
  expect(screen.queryByText('Entry complete')).toBeNull();
  expect(screen.queryByText('Go back to home')).toBeNull();

  // "See AI summary" keeps its sparkle; "Back to home" (no trailing period).
  expect(icons).toContain('sparkles');
  await fireEvent.press(screen.getByText('See AI summary'));
  expect(onSeeSummary).toHaveBeenCalledTimes(1);
  expect(onGoHome).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByText('Back to home'));
  expect(onGoHome).toHaveBeenCalledTimes(1);
});
