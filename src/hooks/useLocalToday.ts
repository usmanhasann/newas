import { useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { localDateInTZ } from '@utils/date';

/**
 * Today's local date (YYYY-MM-DD) in `timeZone` (the phone's zone when not given), kept current on
 * screens that stay mounted for a long time (the tabs): it is read again whenever the app comes back
 * to the foreground or the screen regains focus, so a tab left open overnight moves to the new day as
 * soon as it's looked at again.
 */
export function useLocalToday(timeZone?: string | null): string {
  const [, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  // Optional: the hook also works outside a navigator (no focus events there).
  const navigation = useContext(NavigationContext);

  useEffect(() => navigation?.addListener('focus', refresh), [navigation, refresh]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return localDateInTZ(new Date(), timeZone ?? undefined);
}
