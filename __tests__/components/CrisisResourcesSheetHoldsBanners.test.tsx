/**
 * No in-app notification banners while the crisis resources pop-up is open (client 10/14 p.8,
 * N8.17), now that it also opens on its own when an entry with concerning words is saved (p.36).
 * The sheet holds the banners while it's visible and lets them go when it closes.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render } from '@testing-library/react-native';
import { CrisisResourcesSheet } from '@features/crisis';
import { useBannerHoldStore } from '@store/bannerHold';

it('holds in-app banners only while it is open', async () => {
  const utils = await render(<CrisisResourcesSheet visible={false} onClose={jest.fn()} />);
  expect(useBannerHoldStore.getState().holds).toBe(0);
  await utils.rerender(<CrisisResourcesSheet visible onClose={jest.fn()} />);
  expect(useBannerHoldStore.getState().holds).toBe(1);
  await utils.rerender(<CrisisResourcesSheet visible={false} onClose={jest.fn()} />);
  expect(useBannerHoldStore.getState().holds).toBe(0);
});
