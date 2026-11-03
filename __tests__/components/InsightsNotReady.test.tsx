/**
 * Client 10/14 p.1-2 (O18): the user HAS entries but no period of the selected length has finished.
 *  - Mood Breakdown: "Your mood breakdown will show here after a full [week/month/year] of
 *    journaling." then "Ready on [date].", all text centered.
 *  - Reflection card: "Your [weekly/monthly/yearly] reflection will show here after a full
 *    [week/month/year] of journaling. Keep going!" then "Ready on [date].", left-aligned (label too).
 *  - The words and the date follow the Week/Month/Year tab; both cards give the same date.
 * The real reflections feature renders (only its server calls are mocked).
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InsightsScreen } from '@features/insights/screens/InsightsScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/profile', () => ({ useProfile: () => ({ data: { timezone: 'UTC' } }) }));

const mockBreakdown = jest.fn(() => Promise.resolve([]));
jest.mock('@features/insights/api', () => ({
  fetchJournalStats: () =>
    Promise.resolve({ current_streak: 2, longest_streak: 2, last_entry_date: '2026-10-20', last_entry_on: '2026-10-20' }),
  fetchMoodBreakdown: () => mockBreakdown(),
  fetchBreakdownPeriods: () => Promise.resolve([]), // no week, month or year has finished yet
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

const classes = (node: { props: { className?: unknown } }) => String(node.props.className ?? '').split(/\s+/);

it('shows the not-ready text on both cards, per tab, with the day each is ready', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = await render(
    <QueryClientProvider client={qc}>
      <InsightsScreen />
    </QueryClientProvider>,
  );

  const expectTab = async (noun: string, adjective: string, title: string, date: string) => {
    const breakdownText = `Your mood breakdown will show here after a full ${noun} of journaling.`;
    const reflectionText = `Your ${adjective} reflection will show here after a full ${noun} of journaling. Keep going!`;
    await waitFor(() => expect(utils.getByText(breakdownText)).toBeTruthy());
    await waitFor(() => expect(utils.getByText(reflectionText)).toBeTruthy());

    // Both cards end with the same "Ready on [date]." line: Mood Breakdown first, then the reflection.
    const ready = utils.getAllByText(`Ready on ${date}.`);
    expect(ready).toHaveLength(2);

    // Mood Breakdown: all text centered.
    expect(classes(utils.getByText(breakdownText))).toContain('text-center');
    expect(classes(ready[0]!)).toContain('text-center');
    // Reflection card: all text left-aligned, the label included.
    expect(classes(utils.getByText(reflectionText))).not.toContain('text-center');
    expect(classes(ready[1]!)).not.toContain('text-center');
    expect(classes(utils.getByText(title))).not.toContain('text-center');
  };

  await expectTab('week', 'weekly', 'Weekly Reflection', 'October 26, 2026');
  // The normal layout's labels; the old texts are gone.
  expect(utils.getByText('Mood Breakdown')).toBeTruthy();
  expect(utils.getByText('Reflections')).toBeTruthy();
  expect(utils.queryByText('Moods & Reflections')).toBeNull();
  expect(utils.queryByText(/mood patterns will appear here/)).toBeNull();
  expect(utils.queryByText(/Unlocks on/)).toBeNull();
  expect(utils.queryByText(/Keep Journaling/)).toBeNull();
  expect(utils.queryByText(/Your next reflection will be ready on/)).toBeNull();
  expect(utils.queryByText(/Your moods from/)).toBeNull();

  await fireEvent.press(utils.getByText('Month'));
  await expectTab('month', 'monthly', 'Monthly Reflection', 'November 14, 2026');

  await fireEvent.press(utils.getByText('Year'));
  await expectTab('year', 'yearly', 'Yearly Reflection', 'September 7, 2027');

  expect(mockBreakdown).not.toHaveBeenCalled(); // nothing finished, nothing to count
});
