import { useState } from 'react';
import { Keyboard } from 'react-native';
import { Text } from '@components';
import { ENTRY_NOT_SHAREABLE, SEE_CRISIS_RESOURCES } from '../copy';
import { CrisisResourcesSheet } from './CrisisResourcesSheet';

/**
 * Where sharing is offered, for an entry with concerning words (client 10/14 p.36): it can't be
 * shared to any circle, with a link that opens the crisis resources pop-up in place (the keyboard
 * closes first so it can't cover the help).
 */
export function EntryNotShareable() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Text variant="body" testID="entry-not-shareable">
        {ENTRY_NOT_SHAREABLE}{' '}
        <Text
          variant="link"
          accessibilityRole="link"
          onPress={() => {
            Keyboard.dismiss();
            setOpen(true);
          }}
        >
          {SEE_CRISIS_RESOURCES}
        </Text>
      </Text>
      <CrisisResourcesSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
