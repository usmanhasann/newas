/**
 * Client 10/14 p.1 and p.4 (O18 vs O19): while Insights doesn't yet know whether the person has any
 * entries, the Mood Breakdown says it's loading; it never flashes the has-entries "will show here
 * after a full week" text or the no-entries "Start journaling" text.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InsightsScreen } from '@features/insights/screens/InsightsScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/profile', () => ({ useProfile: () => ({ data: { timezone: 'UTC' } }) }));
jest.mock('@features/insights/api', () => ({
  fetchJournalStats: () =>
    Promise.resolve({ current_streak: 0, longest_streak: 0, last_entry_date: null, last_entry_on: null }),
  fetchMoodBreakdown: () => Promise.resolve([]),
  // No period has finished yet (or the user has no entries): which one isn't known until the overview loads.
  fetchBreakdownPeriods: () => Promise.resolve([]),
}));
jest.mock('@features/reflections/api', () => ({
  fetchReflectionsOverview: () => new Promise(() => {}), // still loading
  triggerReflectionGeneration: () => Promise.resolve({ generated: 0 }),
}));

it('shows "Loading your mood patterns…" until it knows, never the wrong text', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = await render(
    <QueryClientProvider client={qc}>
      <InsightsScreen />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(utils.getByText('Loading your mood patterns…')).toBeTruthy());
  expect(utils.queryByText(/will show here after a full/)).toBeNull();
  expect(utils.queryByText(/Start journaling/)).toBeNull();
});
