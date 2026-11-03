/**
 * Client 10/14 p.4 (O19.09): the "Moods & Reflections" no-entries card applies only while the user
 * has no entries. Once the first entry is saved (useCreateEntry refreshes the 'reflections' queries),
 * Insights switches to the normal layout: "Mood Breakdown" and "Reflections", each with its own
 * not-ready text for a first week that hasn't finished.
 * The real reflections feature renders (only its server calls are mocked).
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InsightsScreen } from '@features/insights/screens/InsightsScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/profile', () => ({ useProfile: () => ({ data: { timezone: 'UTC' } }) }));
jest.mock('@features/insights/api', () => ({
  fetchJournalStats: () =>
    Promise.resolve({ current_streak: 0, longest_streak: 0, last_entry_date: null, last_entry_on: null }),
  fetchMoodBreakdown: () => Promise.resolve([]),
  fetchBreakdownPeriods: () => Promise.resolve([]),
}));

let mockHasEntries = false;
jest.mock('@features/reflections/api', () => ({
  fetchReflectionsOverview: () =>
    Promise.resolve(
      (['weekly', 'monthly', 'yearly'] as const).map((type) => ({
        type,
        hasAnyEntry: mockHasEntries,
        // The server dates the first period from the first entry (none yet → no date).
        nextUnlockDate: mockHasEntries ? { weekly: '2026-10-27', monthly: '2026-11-20', yearly: '2027-10-20' }[type] : null,
        content: null,
        periodStart: null,
        periodEnd: null,
        generatedAt: null,
        generating: false,
        failed: false,
        periodHasEntries: null,
      })),
    ),
  triggerReflectionGeneration: () => Promise.resolve({ generated: 0 }),
}));

it('switches from "Moods & Reflections" to the normal layout with the first entry', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = await render(
    <QueryClientProvider client={qc}>
      <InsightsScreen />
    </QueryClientProvider>,
  );

  await waitFor(() =>
    expect(utils.getByText('Start journaling to see your mood breakdown and weekly reflection here.')).toBeTruthy(),
  );
  expect(utils.getByText('Moods & Reflections')).toBeTruthy();
  expect(utils.queryByText('Reflections')).toBeNull();

  // The first entry is saved: the same refresh useCreateEntry does.
  mockHasEntries = true;
  await act(async () => {
    await qc.invalidateQueries({ queryKey: ['reflections'] });
  });

  await waitFor(() => expect(utils.getByText('Mood Breakdown')).toBeTruthy());
  expect(utils.getByText('Reflections')).toBeTruthy();
  expect(utils.queryByText('Moods & Reflections')).toBeNull();
  expect(utils.queryByText(/Start journaling/)).toBeNull();
  expect(utils.getByText('Your mood breakdown will show here after a full week of journaling.')).toBeTruthy();
  await waitFor(() =>
    expect(
      utils.getByText('Your weekly reflection will show here after a full week of journaling. Keep going!'),
    ).toBeTruthy(),
  );
  expect(utils.getAllByText('Ready on October 27, 2026.')).toHaveLength(2);
});
