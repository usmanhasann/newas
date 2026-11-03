/**
 * Circle type icon colors on the Circles tab (client revisions 2026-10-14, p3) live in the design
 * tokens with the client's exact hex values, and the icon circle is the client's ~46px.
 */
import { colors, spacing } from '@theme';

it('has the client’s Public/Private circle icon colors and the 46px icon size', () => {
  expect(colors.circle).toEqual({
    'public-bg': '#B9E8CB',
    'public-ink': '#1F5C3C',
    'private-bg': '#EADBF8',
    'private-ink': '#5A1F9A',
  });
  expect(spacing[11.5]).toBe(46);
});
