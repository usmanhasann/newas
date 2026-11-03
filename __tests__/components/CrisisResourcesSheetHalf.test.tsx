/**
 * Crisis resources pop-up as a half-screen sheet (client 10/14 p.30-31): it slides up from the
 * bottom and covers only the bottom half; the top half stays visible, slightly dimmed, and a tap
 * there closes it; the content is unchanged and scrolls; an X in the top right closes it.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { StyleSheet } from 'react-native';
import { render, fireEvent, within } from '@testing-library/react-native';
import { CrisisResourcesSheet } from '@features/crisis';
import { colors } from '@theme';

it('is a sliding half-screen sheet over a lightly dimmed top half, closed by the X or the top half', async () => {
  const onClose = jest.fn();
  const { getByTestId, getByLabelText } = await render(
    <CrisisResourcesSheet visible onClose={onClose} />,
  );
  const hidden = { includeHiddenElements: true };

  // Fades the dim in place; the sheet itself slides (a translateY transform), so the dim never
  // slides up with it.
  expect(getByTestId('crisis-resources-sheet', hidden).props.animationType).toBe('fade');

  // The sheet is exactly the bottom half of the screen and moves vertically into place.
  const panel = StyleSheet.flatten(getByTestId('crisis-resources-panel').props.style);
  expect(panel.height).toBe('50%');
  expect(panel.transform).toEqual([{ translateY: expect.anything() }]);

  // The top half is the area ABOVE the sheet (it fills what the sheet leaves), slightly dimmed
  // with the lighter scrim, not the heavier full-modal one.
  const scrim = getByTestId('crisis-resources-scrim', hidden);
  expect(StyleSheet.flatten(scrim.props.style).backgroundColor).toBe(colors['overlay-soft']);
  expect(colors['overlay-soft']).not.toBe(colors.overlay);
  const backdrop = getByTestId('crisis-resources-backdrop', hidden);
  expect(backdrop.props.className).toContain('flex-1'); // fills whatever the sheet leaves
  // Inside the dim: the tappable top area first, then the sheet below it.
  const order = within(scrim)
    .getAllByTestId(/^crisis-resources-(backdrop|panel)$/, hidden)
    .map((n) => n.props.testID);
  expect(order).toEqual(['crisis-resources-backdrop', 'crisis-resources-panel']);

  // Same content as before, inside the sheet's scroll view so everything below the fold is reachable.
  const scroll = within(getByTestId('crisis-resources-scroll'));
  expect(scroll.getByText('988 Suicide & Crisis Lifeline')).toBeTruthy();
  expect(scroll.getByText('Crisis Text Line')).toBeTruthy();
  expect(scroll.getByText('Outside the US')).toBeTruthy();
  expect(scroll.getByText('findahelpline.com')).toBeTruthy();
  expect(scroll.getByText(/any level of struggle/)).toBeTruthy();

  // The X sits in the sheet's header row, after (to the right of) the title, and closes it.
  const close = getByLabelText('Close');
  expect(close.props.testID).toBe('crisis-resources-close');
  // In render order inside the sheet: the title, then the X (to its right in the header row).
  const seen: string[] = [];
  const walk = (n: unknown) => {
    if (typeof n === 'string') {
      if (n === 'You’re not alone in this') seen.push('title');
      return;
    }
    const el = n as { props?: { testID?: string }; children?: unknown[] };
    if (el.props?.testID === 'crisis-resources-close') seen.push('close');
    el.children?.forEach(walk);
  };
  walk(getByTestId('crisis-resources-panel'));
  expect(seen).toEqual(['title', 'close']);
  // The title is NOT inside the scroll view, so the X stays in the corner while the content scrolls.
  expect(within(getByTestId('crisis-resources-scroll')).queryByText('You’re not alone in this')).toBeNull();
  await fireEvent.press(close);
  expect(onClose).toHaveBeenCalledTimes(1);

  // A tap on the dimmed top half closes it too.
  await fireEvent.press(backdrop);
  expect(onClose).toHaveBeenCalledTimes(2);
});
