/**
 * Tracks the OS "reduce motion" accessibility setting so animations can be skipped.
 * Defaults to false; updates live if the user toggles the setting.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (mounted) setReduced(v);
      })
      .catch(() => {
        /* default false */
      });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduced(v));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
