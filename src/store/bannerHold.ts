/**
 * In-app banner hold (client revisions 10/14 p.8): no in-app notification banners while the crisis
 * resources pop-up is open. Any screen or sheet that must stay free of banners holds them while it is
 * showing; banners come back once every hold is released. Session state only (in memory).
 *
 * It lives in the shared store (not inside a feature) so the crisis sheet can hold banners without
 * importing the notifications feature.
 */
import { useEffect } from 'react';
import { create } from 'zustand';

interface BannerHoldState {
  /** How many holds are active (several sheets can hold at once). 0 = banners may show. */
  holds: number;
  /** Start a hold. Returns the release (safe to call more than once). */
  hold: () => () => void;
}

export const useBannerHoldStore = create<BannerHoldState>((set) => ({
  holds: 0,
  hold: () => {
    set((s) => ({ holds: s.holds + 1 }));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      set((s) => ({ holds: Math.max(0, s.holds - 1) }));
    };
  },
}));

/** True while something on screen holds the banners back. */
export function bannersHeld(): boolean {
  return useBannerHoldStore.getState().holds > 0;
}

/** Holds in-app banners while `active` is true (e.g. the crisis resources pop-up is open). */
export function useHoldInAppBanners(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return useBannerHoldStore.getState().hold();
  }, [active]);
}
