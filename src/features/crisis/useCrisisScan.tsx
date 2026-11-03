import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { useCrisisKeywords } from './hooks';
import { detectCrisis } from './matcher';
import { confirmCrisis } from './api';
import { shouldOfferCrisisSupport } from './logic';
import { CrisisResourcesSheet } from './components/CrisisResourcesSheet';

/**
 * System 2 — crisis support on Circle posts and replies. (Journal entries, including the first check
 * in, are keywords only and never sent to an AI: they use useEntryCrisisCheck, client 10/14 p.36.)
 * Hybrid + privacy-preserving:
 *  - an on-device keyword prescreen runs first (no network);
 *  - only a prescreen hit is sent to the `detect-crisis` AI to confirm — text that doesn't trip the
 *    prescreen never leaves the phone;
 *  - on a confirmed (or AI-unavailable) hit, the standing crisis-resources popup opens automatically
 *    and immediately.
 *
 * This path NEVER flags, warns, restricts, or records anything — it only offers support, exactly the
 * same in a private journal as anywhere else.
 *
 * Usage: `const { scan, sheet } = useCrisisScan();` — call `scan(text)` as the user writes or saves,
 * and render `{sheet}`.
 */
export function useCrisisScan() {
  const { data: keywords = [] } = useCrisisKeywords();
  const [visible, setVisible] = useState(false);
  const handled = useRef<string | null>(null);
  // The AI check can finish after the person left the screen: then do nothing (no stray
  // keyboard close on the next screen's input).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true; // also after React re-runs effects (Strict Mode)
    return () => {
      mounted.current = false;
    };
  }, []);

  const scan = useCallback(
    async (text: string) => {
      const match = detectCrisis(text, keywords); // on-device prescreen
      if (!match) return;
      // Confirm each distinct prescreen trigger at most once (no repeat AI calls / re-opens).
      if (handled.current === match.id) return;
      handled.current = match.id;
      let confirmed: boolean | null;
      try {
        confirmed = await confirmCrisis(text);
      } catch {
        confirmed = null; // AI unavailable → fail open to support
      }
      if (!mounted.current) return;
      if (shouldOfferCrisisSupport(true, confirmed)) {
        // Close the keyboard first: it would otherwise stay up over the sheet and hide the help
        // (the person is typing when this opens). What they wrote is kept.
        Keyboard.dismiss();
        setVisible(true);
      }
    },
    [keywords],
  );

  const sheet = <CrisisResourcesSheet visible={visible} onClose={() => setVisible(false)} />;
  return { scan, sheet };
}
