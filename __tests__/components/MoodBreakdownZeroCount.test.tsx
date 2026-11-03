/**
 * Client 10/14 p.13 (O7): a finished period that has entries but nothing left to count (its moods
 * were deleted, or an older server) shows the same empty state and dates as an empty period, never
 * an older period and never a bare "No moods" line.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InsightsScreen } from '@features/insights/screens/InsightsScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/profile', () => ({ useProfile: () => ({ data: { timezone: 'UTC' } }) }));
jest.mock('@features/insights/api', () => ({
  fetchJournalStats: () =>
    Promise.resolve({ current_streak: 0, longest_streak: 2, last_entry_date: null, last_entry_on: null }),
  fetchMoodBreakdown: () => Promise.resolve([]),
  fetchBreakdownPeriods: () =>
    Promise.resolve([{ type: 'weekly', start: '2026-09-21', end: '2026-09-27', hasEntries: true }]),
}));
jest.mock('@features/reflections', () => ({
  ReflectionsSection: () => null,
  useReflectionsOverview: () => ({ data: [{ type: 'weekly', nextUnlockDate: '2026-10-05' }] }),
}));

it('nothing to count → the empty state with the period and the next date', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = await render(
    <QueryClientProvider client={qc}>
      <InsightsScreen />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(utils.getByText('No entries in this period yet. Log a mood to see your patterns here.')).toBeTruthy(),
  );
  expect(utils.getByText('Your moods from Sep 21 to Sep 27')).toBeTruthy();
  expect(utils.getByText('Your breakdown will be ready on October 5, 2026.')).toBeTruthy();
  expect(utils.queryByText('No moods to show for this period.')).toBeNull();
});
