/**
 * Live circles (N1): a circle is followed live only while its screen is showing. Switching to another
 * tab (the screen stays mounted but is hidden) closes the channel a moment later; coming back
 * reopens it and loads anything new right away. Non-members never open one.
 * One render per file (React 19 leaks across sibling renders).
 */
import { NavigationContext } from '@react-navigation/native';
import { render, act } from '@testing-library/react-native';
import { queryClient } from '@lib';
import { LIVE_LINGER_MS, useCircleLive } from '@features/circles/circleLive';
import type { LivePostSignal, LiveStatus } from '@features/circles/liveApi';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u2' }) }));

type Handlers = { onSignal: (s: LivePostSignal) => void; onStatus: (s: LiveStatus) => void };
const mockChannels: { circleId: string; stop: jest.Mock }[] = [];
jest.mock('@features/circles/liveApi', () => ({
  openCirclePostsChannel: (circleId: string, _handlers: Handlers) => {
    const stop = jest.fn(() => Promise.resolve());
    mockChannels.push({ circleId, stop });
    return stop;
  },
}));

function Harness({ circleId, member }: { circleId: string; member: boolean }) {
  useCircleLive(circleId, member);
  return null;
}

it('follows a circle only while its screen shows; coming back reopens and catches up', async () => {
  jest.useFakeTimers();
  const listeners: Record<string, (() => void)[]> = { focus: [], blur: [] };
  const navigation = {
    isFocused: () => true,
    addListener: (event: 'focus' | 'blur', fn: () => void) => {
      listeners[event]!.push(fn);
      return () => {
        listeners[event] = listeners[event]!.filter((f) => f !== fn);
      };
    },
  };
  queryClient.setQueryData(['circlePosts', 'feed', 'c1', 'preview', 10, 'all'], {
    items: [],
    nextCursor: null,
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(5);
  });
  await render(
    <NavigationContext.Provider value={navigation as never}>
      <Harness circleId="c1" member />
      <Harness circleId="c2" member={false} />
    </NavigationContext.Provider>,
  );
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  // Only the circle they're a member of.
  expect(mockChannels.map((c) => c.circleId)).toEqual(['c1']);

  // Another tab: closed a moment later.
  await act(async () => {
    listeners.blur!.forEach((fn) => fn());
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(LIVE_LINGER_MS + 1);
  });
  expect(mockChannels[0]!.stop).toHaveBeenCalledTimes(1);

  // Back: reopened, and what was loaded before is loaded again.
  queryClient.setQueryData(['circlePosts', 'feed', 'c1', 'preview', 10, 'all'], {
    items: [],
    nextCursor: null,
  });
  expect(queryClient.getQueryState(['circlePosts', 'feed', 'c1', 'preview', 10, 'all'])!.isInvalidated).toBe(false);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(5);
  });
  await act(async () => {
    listeners.focus!.forEach((fn) => fn());
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  expect(mockChannels.map((c) => c.circleId)).toEqual(['c1', 'c1']);
  expect(queryClient.getQueryState(['circlePosts', 'feed', 'c1', 'preview', 10, 'all'])!.isInvalidated).toBe(true);
  jest.useRealTimers();
});
