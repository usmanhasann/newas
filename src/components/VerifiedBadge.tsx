/**
 * The verified badge (client revisions 10/14 p.5, N7): a small purple check mark right after a
 * verified person's name. Only an admin turns it on (profiles.verified); the app never stores a copy,
 * so turning it off removes it the next time a screen loads.
 *
 * Sized to the name it follows: pass the same type-scale token the name's text uses (bodyStrong and
 * body = 'base', caption = 'xs', h2 = '2xl'). It is a font glyph, so it sits inline inside a <Text>
 * (`{name} <VerifiedBadge />`) as well as on its own in a row.
 */
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize } from '@theme';

export type VerifiedBadgeSize = keyof typeof fontSize;

/** What a screen reader says for the badge (and what tests find it by). */
const VERIFIED_LABEL = 'Verified';

export function VerifiedBadge({ size = 'base' }: { size?: VerifiedBadgeSize }) {
  return (
    <Ionicons
      name="checkmark-circle"
      size={parseFloat(fontSize[size])}
      color={colors.brand[500]}
      accessibilityRole="image"
      accessibilityLabel={VERIFIED_LABEL}
      testID="verified-badge"
    />
  );
}
