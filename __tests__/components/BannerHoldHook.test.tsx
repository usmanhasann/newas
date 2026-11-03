/**
 * Client revisions 10/14 p.8: no in-app banners while the crisis resources pop-up is open. The pop-up
 * holds them with useHoldInAppBanners(visible): held while open, released when it closes or goes away,
 * and several holds at once all have to end.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { act, render } from '@testing-library/react-native';
import { bannersHeld, useBannerHoldStore, useHoldInAppBanners } from '@store/bannerHold';

function Sheet({ visible }: { visible: boolean }) {
  useHoldInAppBanners(visible);
  return null;
}

it('holds banners only while the pop-up is open', async () => {
  const utils = await render(<Sheet visible={false} />);
  expect(bannersHeld()).toBe(false);

  await utils.rerender(<Sheet visible />);
  expect(bannersHeld()).toBe(true);

  // Another hold at the same time: both must end.
  let other: () => void = () => {};
  await act(async () => {
    other = useBannerHoldStore.getState().hold();
  });
  await utils.rerender(<Sheet visible={false} />);
  expect(bannersHeld()).toBe(true);
  await act(async () => {
    other();
    other(); // releasing twice is harmless
  });
  expect(bannersHeld()).toBe(false);
  expect(useBannerHoldStore.getState().holds).toBe(0);

  await utils.rerender(<Sheet visible />);
  expect(bannersHeld()).toBe(true);
  await utils.unmount();
  expect(bannersHeld()).toBe(false);
});
