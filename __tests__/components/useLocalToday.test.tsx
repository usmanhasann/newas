/**
 * useLocalToday (audit 2026-09-30): the Insights tab stays mounted, so its "today" must move on when
 * the app comes back to the foreground on a new day. Otherwise the Mood Breakdown kept showing last
 * week's snapshot (and never asked for the new reflection) until the app was restarted.
 * One render per file (React 19 leaks across sibling renders).
 */
import { AppState } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';
import { useLocalToday } from '@hooks/useLocalToday';

it('reads the new day when the app returns to the foreground', async () => {
  let onChange: (state: string) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    handler: (state: string) => void,
  ) => {
    onChange = handler;
    return { remove: jest.fn() };
  }) as unknown as typeof AppState.addEventListener);
  jest.useFakeTimers({
    doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'queueMicrotask'],
    now: new Date('2026-09-20T15:00:00Z'),
  });
  try {
    const { result } = await renderHook(() => useLocalToday('UTC'));
    expect(result.current).toBe('2026-09-20');

    // Overnight in the background; nothing re-rendered the screen.
    jest.setSystemTime(new Date('2026-09-21T08:00:00Z'));
    expect(result.current).toBe('2026-09-20');

    await act(async () => {
      onChange('active');
    });
    expect(result.current).toBe('2026-09-21');
  } finally {
    jest.useRealTimers();
  }
});
