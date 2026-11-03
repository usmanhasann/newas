import { useContext, useEffect, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';

/**
 * Whether the screen this component sits in is the one on display. The tabs stay mounted, so work
 * meant for "when the person looks at this screen" checks this instead of running in the
 * background. Always true outside a navigator.
 */
export function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);

  useEffect(() => {
    if (!navigation) return;
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);

  return focused;
}
