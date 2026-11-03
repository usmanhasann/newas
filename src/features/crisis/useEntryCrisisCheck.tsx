import { useCallback, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { useCrisisKeywords } from './hooks';
import { detectCrisis } from './matcher';
import { CrisisResourcesSheet } from './components/CrisisResourcesSheet';

/**
 * Concerning words on a journal entry (client revisions 10/14 p.36, N18): KEYWORDS ONLY. The entry's
 * text is checked on the phone against the crisis keyword list and never sent to any AI for it (the
 * database flags the saved entry the same way, and is the authority: `entry.crisis_flagged`).
 *
 * Usage: `hasCrisisWords(text)` decides, as the person writes, whether sharing is offered; once the
 * entry is SAVED with the words, `showSupport(then?)` closes the keyboard and opens the crisis
 * resources pop-up (`sheet`, rendered by the screen), and runs `then` once the person closes it.
 *
 * Nothing is recorded or reported about the person (System 2): this only offers support.
 */
export function useEntryCrisisCheck() {
  const { data: keywords = [] } = useCrisisKeywords();
  const [visible, setVisible] = useState(false);
  const afterClose = useRef<(() => void) | null>(null);

  const hasCrisisWords = useCallback(
    (text: string | null | undefined) => !!detectCrisis(text, keywords),
    [keywords],
  );

  const showSupport = useCallback((then?: () => void) => {
    afterClose.current = then ?? null;
    // The keyboard would otherwise stay up over the sheet and hide the help.
    Keyboard.dismiss();
    setVisible(true);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    const then = afterClose.current;
    afterClose.current = null;
    then?.();
  }, []);

  const sheet = <CrisisResourcesSheet visible={visible} onClose={close} />;
  return { hasCrisisWords, showSupport, sheet, supportOpen: visible };
}
