/**
 * Opening what a notification in the list is about: the same places a banner or a push opens (see
 * inAppModel's planNavigation), from the list on the Journal tab.
 */
import { useCallback, useContext } from 'react';
import {
  NavigationContainerRefContext,
  type NavigationContainerRef,
} from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation/types';
import { fetchPostParent } from './api';
import { planNavigation, resolveTarget, type NavTarget } from './inAppModel';

type RootNav = NavigationContainerRef<RootStackParamList>;

/** Returns open(target). A null target does nothing. */
export function useOpenNotificationTarget(): (target: NavTarget | null) => Promise<void> {
  const nav = useContext(NavigationContainerRefContext) as RootNav | undefined;
  return useCallback(
    async (target: NavTarget | null) => {
      if (!nav || !target) return;
      // The streak reminder opens the Journal tab itself: from the list that means back to its top.
      if (target.to === 'journal') {
        nav.navigate('Main', { screen: 'JournalTab', params: { screen: 'JournalHome' } });
        return;
      }
      const resolved = await resolveTarget(target, fetchPostParent);
      nav.navigate('Main', planNavigation(resolved));
    },
    [nav],
  );
}
