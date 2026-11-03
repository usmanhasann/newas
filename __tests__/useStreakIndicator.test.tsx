/**
 * useStreakIndicator wiring — the composition the card test mocks out. Confirms it derives
 * hasEntryToday (last_entry_date on or after today's local date), defaults a missing streak to 0/hidden, and
 * feeds the local hour into the shared state machine. localDateInTZ/hourInTZ are stubbed so the cases
 * are deterministic (their own behaviour is covered by streakStatus.test).
 */
import { renderHook } from '@testing-library/react-native';
import { useStreakIndicator } from '@features/journal';

const mockStats: { value: { current_streak: number; last_entry_date: string | null } | undefined } = {
  value: undefined,
};
const mockHour = { value: 12 };

jest.mock('@features/insights', () => ({ useJournalStats: () => ({ data: mockStats.value }) }));
jest.mock('@features/profile', () => ({ useProfile: () => ({ data: { timezone: 'UTC' } }) }));
jest.mock('@utils/date', () => ({
  localDateInTZ: () => '2026-09-15',
  hourInTZ: () => mockHour.value,
}));

async function state() {
  const { result } = await renderHook(() => useStreakIndicator());
  return result.current;
}

beforeEach(() => {
  mockStats.value = undefined;
  mockHour.value = 12;
});

describe('useStreakIndicator', () => {
  it('hidden when there are no stats yet (streak defaults to 0)', async () => {
    expect(await state()).toEqual({ state: 'hidden', streak: 0 });
  });

  it('hidden when the streak is 0', async () => {
    mockStats.value = { current_streak: 0, last_entry_date: '2026-09-14' };
    expect((await state()).state).toBe('hidden');
  });

  it('normal when journaled today (last_entry_date is today), even after 8pm', async () => {
    mockStats.value = { current_streak: 5, last_entry_date: '2026-09-15' };
    mockHour.value = 22;
    expect(await state()).toEqual({ state: 'normal', streak: 5 });
  });

  it('normal when the streak is live but it is before 8pm', async () => {
    mockStats.value = { current_streak: 5, last_entry_date: '2026-09-14' };
    mockHour.value = 19;
    expect((await state()).state).toBe('normal');
  });

  it('urgent when live, not journaled today, and it is 8pm or later', async () => {
    mockStats.value = { current_streak: 5, last_entry_date: '2026-09-14' };
    mockHour.value = 20;
    expect(await state()).toEqual({ state: 'urgent', streak: 5 });
  });

  it('treats a null last_entry_date as "not journaled today"', async () => {
    mockStats.value = { current_streak: 3, last_entry_date: null };
    mockHour.value = 21;
    expect((await state()).state).toBe('urgent');
  });
});
