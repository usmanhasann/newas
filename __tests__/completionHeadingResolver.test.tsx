/**
 * The completion popup must use the ONE streak number Insights shows: the same journal-stats query
 * + cache entry (insightsKeys.stats(uid, localToday)), fetched after the save, plus the longest
 * streak before this run for its message line (client revisions 10/14 p.24 to 27).
 */
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCompletionHeadingResolver } from '@features/journal/hooks';
import { NEW_LONGEST_MESSAGE } from '@features/journal/streakMessages';
import { insightsKeys } from '@features/insights';
import { localDateInTZ, addDaysToLocalDate } from '@utils/date';

const mockFetchJournalStats = jest.fn();
const mockFirstEntryIdOfDay = jest.fn();
const mockPreviousLongest = jest.fn();

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/profile', () => ({
  useProfile: () => ({ data: { timezone: 'UTC' } }),
}));
jest.mock('@features/insights/api', () => ({
  fetchJournalStats: (today: string) => mockFetchJournalStats(today),
}));
jest.mock('@features/journal/api', () => ({
  getFirstEntryIdOfDay: (uid: string, day: string) => mockFirstEntryIdOfDay(uid, day),
  getPreviousLongestStreak: (day: string) => mockPreviousLongest(day),
}));

const today = localDateInTZ(new Date(), 'UTC');
const stats = (current_streak: number, last_entry_date: string) => ({
  entries_count: 9,
  current_streak,
  longest_streak: 7,
  last_entry_date,
  distinct_days: 9,
});

async function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(() => useCompletionHeadingResolver(), { wrapper });
  return { qc, resolve: result.current };
}

beforeEach(() => {
  mockFetchJournalStats.mockReset();
  mockFirstEntryIdOfDay.mockReset();
  mockPreviousLongest.mockReset().mockResolvedValue(0);
});

it('first entry of the day → the streak from the same stats query/cache entry Insights reads', async () => {
  const { qc, resolve } = await setup();
  mockFirstEntryIdOfDay.mockResolvedValue('e1');
  mockFetchJournalStats.mockResolvedValue(stats(3, today));

  await expect(resolve({ id: 'e1', local_date: today })).resolves.toEqual({
    kind: 'streak',
    streak: 3,
    message: '3 days in a row. You’re building something here. See you tomorrow.',
  });
  expect(mockFirstEntryIdOfDay).toHaveBeenCalledWith('u1', today);
  expect(mockFetchJournalStats).toHaveBeenCalledWith(today);
  expect(qc.getQueryData(insightsKeys.stats('u1', today))).toMatchObject({
    current_streak: 3,
  });
});

it('ignores cached pre-save stats and fetches fresh ones; asks for the longest run before this one', async () => {
  const { qc, resolve } = await setup();
  qc.setQueryData(
    insightsKeys.stats('u1', today),
    stats(7, addDaysToLocalDate(today, -1)),
  );
  mockFirstEntryIdOfDay.mockResolvedValue('e1');
  mockFetchJournalStats.mockResolvedValue({ ...stats(8, today), longest_streak: 8 });
  mockPreviousLongest.mockResolvedValue(7);

  await expect(resolve({ id: 'e1', local_date: today })).resolves.toEqual({
    kind: 'streak',
    streak: 8,
    message: NEW_LONGEST_MESSAGE,
  });
  expect(mockFetchJournalStats).toHaveBeenCalledTimes(1);
  expect(mockPreviousLongest).toHaveBeenCalledWith(today);
});

it('a later entry the same day → "Entry complete"', async () => {
  const { resolve } = await setup();
  mockFirstEntryIdOfDay.mockResolvedValue('e1');
  mockFetchJournalStats.mockResolvedValue(stats(3, today));

  await expect(resolve({ id: 'e2', local_date: today })).resolves.toEqual({ kind: 'entry' });
});
