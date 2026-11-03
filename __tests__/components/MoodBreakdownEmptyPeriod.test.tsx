/**
 * Client 10/14 p.13-14 + p.30 (O7 + O20), Mood Breakdown card:
 *  - a finished week with NO entries shows the empty state (not the older week's moods), with
 *    "Your moods from Sep 21 to Sep 27" and "Your breakdown will be ready on October 5, 2026.";
 *    nothing is counted for it;
 *  - a breakdown that IS showing carries the same two date lines, per tab;
 *  - the not-ready text still replaces them where no period has finished.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InsightsScreen } from '@features/insights/screens/InsightsScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/profile', () => ({ useProfile: () => ({ data: { timezone: 'UTC' } }) }));

const mockBreakdown = jest.fn((_start: string, _end: string) =>
  Promise.resolve([{ mood_slug: 'calm', count: 3 }]),
);
jest.mock('@features/insights/api', () => ({
  fetchJournalStats: () =>
    Promise.resolve({ current_streak: 0, longest_streak: 5, last_entry_date: '2026-09-16', last_entry_on: '2026-09-16' }),
  fetchMoodBreakdown: (start: string, end: string) => mockBreakdown(start, end),
  fetchBreakdownPeriods: () =>
    Promise.resolve([
      // The week of Sep 21 to 27 had no entries; the month of Aug 14 to Sep 13 had some.
      { type: 'weekly', start: '2026-09-21', end: '2026-09-27', hasEntries: false },
      { type: 'monthly', start: '2026-08-14', end: '2026-09-13', hasEntries: true },
    ]),
}));
jest.mock('@features/reflections', () => ({
  ...jest.requireActual('@features/reflections/logic'),
  ReflectionsSection: () => null,
  useReflectionsOverview: () => ({
    data: [
      { type: 'weekly', nextUnlockDate: '2026-10-05' },
      { type: 'monthly', nextUnlockDate: '2026-10-14' },
      { type: 'yearly', nextUnlockDate: '2027-08-14' },
    ],
  }),
}));

it('moves on to an empty week with its dates, and dates every breakdown', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = await render(
    <QueryClientProvider client={qc}>
      <InsightsScreen />
    </QueryClientProvider>,
  );

  // Week: the empty Sep 21 to 27, with its dates; nothing counted for it.
  await waitFor(() =>
    expect(utils.getByText('No entries in this period yet. Log a mood to see your patterns here.')).toBeTruthy(),
  );
  expect(utils.getByText('Your moods from Sep 21 to Sep 27')).toBeTruthy();
  expect(utils.getByText('Your breakdown will be ready on October 5, 2026.')).toBeTruthy();
  expect(mockBreakdown).not.toHaveBeenCalled();

  // Month: a real breakdown, with the same two lines for that month.
  await fireEvent.press(utils.getByText('Month'));
  await waitFor(() => expect(utils.getByText('Calm')).toBeTruthy());
  expect(mockBreakdown).toHaveBeenCalledWith('2026-08-14', '2026-09-13');
  expect(utils.getByText('Your moods from Aug 14 to Sep 13')).toBeTruthy();
  expect(utils.getByText('Your breakdown will be ready on October 14, 2026.')).toBeTruthy();

  // Year: nothing finished yet → the not-ready text, without the date lines.
  await fireEvent.press(utils.getByText('Year'));
  await waitFor(() =>
    expect(utils.getByText('Your mood breakdown will show here after a full year of journaling.')).toBeTruthy(),
  );
  expect(utils.getByText('Ready on August 14, 2027.')).toBeTruthy();
  expect(utils.queryByText(/Your moods from/)).toBeNull();
  expect(utils.queryByText(/Your breakdown will be ready on/)).toBeNull();
});
