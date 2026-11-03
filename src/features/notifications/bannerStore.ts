/**
 * The in-app banners for this session: the one on screen and the ones waiting (in memory only).
 * The rules live in inAppModel (pure); this just holds the state for the banner host.
 */
import { create } from 'zustand';
import {
  EMPTY_BANNERS,
  clearBanners,
  nextBanner,
  receiveBanner,
  type BannerItem,
  type BannerState,
} from './inAppModel';

interface BannerStore extends BannerState {
  receive: (item: BannerItem) => void;
  /** The banner on screen is gone; the next one still wanted (`keep`) shows. */
  next: (keep?: (item: BannerItem) => boolean) => void;
  clear: () => void;
}

export const useBannerStore = create<BannerStore>((set) => ({
  ...EMPTY_BANNERS,
  receive: (item) => set((s) => receiveBanner(s, item, Date.now())),
  next: (keep) => set((s) => nextBanner(s, Date.now(), keep)),
  clear: () => set((s) => clearBanners(s)),
}));
