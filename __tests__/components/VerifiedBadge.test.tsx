/**
 * The verified badge (client revisions 10/14 p.5, N7.09): a small purple check mark, from the
 * brand token, sized from the type-scale token of the name it follows, read out as "Verified".
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render } from '@testing-library/react-native';
import { VerifiedBadge } from '@components';
import { colors, fontSize } from '@theme';

it('is a purple check mark sized to the name text, labelled "Verified"', async () => {
  const utils = await render(<VerifiedBadge size="2xl" />);
  const badge = utils.getByLabelText('Verified');
  expect(badge.props.name).toBe('checkmark-circle');
  expect(badge.props.color).toBe(colors.brand[500]);
  expect(badge.props.size).toBe(parseFloat(fontSize['2xl']));
  expect(badge.props.size).toBe(24);
  expect(badge.props.accessibilityRole).toBe('image');
});
