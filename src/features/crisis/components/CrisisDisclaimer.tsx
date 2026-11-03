import { useState } from 'react';
import { Text } from '@components';
import { colors } from '@theme';
import { CrisisResourcesSheet } from './CrisisResourcesSheet';

/**
 * Small, muted mental-health disclaimer with an inline, underlined "See crisis resources"
 * link. Tapping the link opens CrisisResourcesSheet as a dismissible popup — it does NOT
 * navigate away, so the user never loses their place. Used on sensitive onboarding screens
 * (e.g. the "How often do you feel overwhelmed?" question) below the answers, above Continue.
 */
export function CrisisDisclaimer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Text variant="caption" className="text-center">
        LYSM is a space for reflection, not a substitute for professional support.{' '}
        <Text
          variant="caption"
          onPress={() => setOpen(true)}
          accessibilityRole="link"
          style={{ textDecorationLine: 'underline', color: colors['ink-soft'] }}
        >
          See crisis resources
        </Text>
      </Text>
      <CrisisResourcesSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
