/**
 * Wiring for the rotating home-screen prompt: it reads/writes AsyncStorage and advances at most
 * once per DEVICE-local day. The rotation rules themselves are covered by dailyPrompt.test.ts;
 * here we verify the storage wiring — a first run persists, a second read continues from the saved
 * state without advancing, and a THROWN read never clobbers good progress (a regression the
 * adversarial verification found).
 *
 * Note: useDailyPrompt returns DAILY_PROMPTS[0] as a placeholder until the async read resolves, so
 * every assertion waits on the PERSISTED state (or a non-placeholder result), never on "is it a
 * prompt" — otherwise the wait would pass instantly on the placeholder and leak the pending write.
 */
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDailyPrompt } from '@features/journal/hooks';
import { DAILY_PROMPTS } from '@features/journal/promptRotation';

// Signed out → the reminder setting can't load, so the prompt uses the open-day rotation (reminder
// off). The reminder-on behaviour is covered by dailyPromptReminder.test.tsx.
jest.mock('@store/session', () => ({ useCurrentUser: () => null }));

const KEY = 'journal.daily_prompt.v1';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

/** Today's device-local date the way the hook computes it (en-CA → YYYY-MM-DD). */
function deviceToday(): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
}

/** The saved state for the open-day (stored as a one-item list; older versions stored the object). */
async function readSaved(): Promise<{ order: number[]; position: number; date: string } | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

beforeEach(async () => {
  jest.restoreAllMocks();
  // The async-storage jest mock is a shared module singleton; clear its accumulated call history
  // so one test's setItem calls can't be seen by another test's spy.
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('useDailyPrompt — storage wiring', () => {
  it('persists a fresh valid rotation on first run (position 0, a full permutation)', async () => {
    await renderHook(() => useDailyPrompt(), { wrapper: makeWrapper() });

    await waitFor(async () => expect(await readSaved()).not.toBeNull());
    const saved = await readSaved();
    expect(saved!.order).toHaveLength(DAILY_PROMPTS.length);
    expect(new Set(saved!.order).size).toBe(DAILY_PROMPTS.length);
    expect(saved!.position).toBe(0);
    expect(saved!.date).toBe(deviceToday());
  });

  it('continues from saved state on the same day without advancing', async () => {
    // order[3] = 6 → prompt #6, distinct from the placeholder (#0), so the wait is real.
    const order = [3, 1, 5, 6, 2, 0, 4];
    await AsyncStorage.setItem(KEY, JSON.stringify({ order, position: 3, date: deviceToday() }));

    const { result } = await renderHook(() => useDailyPrompt(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current).toBe(DAILY_PROMPTS[6]));

    // Same day → no advance, and the saved position is untouched.
    expect((await readSaved())!.position).toBe(3);
  });

  it('does NOT overwrite saved progress when the storage read throws', async () => {
    const good = { order: [0, 1, 2, 3, 4, 5, 6], position: 2, date: '2000-01-01' };
    await AsyncStorage.setItem(KEY, JSON.stringify(good));
    const getSpy = jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('storage unavailable'));
    const setSpy = jest.spyOn(AsyncStorage, 'setItem');
    setSpy.mockClear(); // ignore the setup write above — only count writes the hook makes

    await renderHook(() => useDailyPrompt(), { wrapper: makeWrapper() });

    // Wait until the (failing) read was attempted and the queryFn settled.
    await waitFor(() => expect(getSpy).toHaveBeenCalled());
    // The read failed, so nothing was written and the good progress is preserved intact.
    expect(setSpy).not.toHaveBeenCalled();
    expect(await readSaved()).toEqual(good);
  });
});
