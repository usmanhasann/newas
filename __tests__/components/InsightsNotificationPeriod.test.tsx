/**
 * Client revisions 10/14 p.9 (N8.29, O28.04): a reflection notification opens Insights on its
 * Week / Month / Year view. The tab stays mounted, so:
 *  - it opens on the view the notification asks for;
 *  - a later notification switches the filter, even back to a view the user moved away from;
 *  - coming back to the tab by hand (same params) keeps the filter the user picked;
 *  - a period that isn't Week / Month / Year (e.g. from a deep link) changes nothing.
 * The cards follow the filter (here: no period has finished yet, so the not-ready text per view).
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InsightsScreen } from '@features/insights/screens/InsightsScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/profile', () => ({ useProfile: () => ({ data: { timezone: 'UTC' } }) }));
jest.mock('@features/insights/api', () => ({
  fetchJournalStats: () =>
    Promise.resolve({ current_streak: 2, longest_streak: 2, last_entry_date: '2026-10-20', last_entry_on: '2026-10-20' }),
  fetchMoodBreakdown: () => Promise.resolve([]),
  fetchBreakdownPeriods: () => Promise.resolve([]),
}));
jest.mock('@features/reflections/api', () => {
  const row = (type: string, nextUnlockDate: string) => ({
    type,
    hasAnyEntry: true,
    nextUnlockDate,
    content: null,
    periodStart: null,
    periodEnd: null,
    generatedAt: null,
    generating: false,
    failed: false,
    periodHasEntries: null,
  });
  return {
    fetchReflectionsOverview: () =>
      Promise.resolve([row('weekly', '2026-10-26'), row('monthly', '2026-11-14'), row('yearly', '2027-09-07')]),
    triggerReflectionGeneration: () => Promise.resolve({ generated: 0 }),
  };
});

type Params = { period?: 'week' | 'month' | 'year'; periodStart?: string } | undefined;
const routeWith = (params: Params) =>
  ({ key: 'InsightsTab-1', name: 'InsightsTab', params }) as never;

it('opens on the notification’s view and switches when another notification arrives', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (route: never) => (
    <QueryClientProvider client={qc}>
      <InsightsScreen route={route} />
    </QueryClientProvider>
  );
  const selected = (label: string) =>
    utils.getByRole('tab', { name: label }).props.accessibilityState?.selected === true;
  const breakdownFor = (noun: string) =>
    `Your mood breakdown will show here after a full ${noun} of journaling.`;

  // A monthly reflection notification opened the tab for the first time.
  const monthly = routeWith({ period: 'month', periodStart: '2026-09-01' });
  const utils = await render(ui(monthly));
  expect(selected('Month')).toBe(true);
  expect(selected('Week')).toBe(false);
  await waitFor(() => expect(utils.getByText(breakdownFor('month'))).toBeTruthy());

  // The user picks Week, leaves, and comes back by tapping the tab: same params, filter stays.
  await fireEvent.press(utils.getByRole('tab', { name: 'Week' }));
  expect(selected('Week')).toBe(true);
  await utils.rerender(ui(monthly));
  expect(selected('Week')).toBe(true);
  await waitFor(() => expect(utils.getByText(breakdownFor('week'))).toBeTruthy());

  // A yearly reflection notification is tapped while the tab is mounted: Year.
  await utils.rerender(ui(routeWith({ period: 'year', periodStart: '2025-09-07' })));
  expect(selected('Year')).toBe(true);
  await waitFor(() => expect(utils.getByText(breakdownFor('year'))).toBeTruthy());

  // The same monthly notification tapped again (new params, same content): back to Month.
  await fireEvent.press(utils.getByRole('tab', { name: 'Week' }));
  await utils.rerender(ui(routeWith({ period: 'month', periodStart: '2026-09-01' })));
  expect(selected('Month')).toBe(true);

  // A period that isn't one of the three, or none at all: the filter stays where it is.
  await utils.rerender(ui(routeWith({ period: 'decade' as never })));
  expect(selected('Month')).toBe(true);
  await utils.rerender(ui(routeWith(undefined)));
  expect(selected('Month')).toBe(true);
  await waitFor(() => expect(utils.getByText(breakdownFor('month'))).toBeTruthy());
});
