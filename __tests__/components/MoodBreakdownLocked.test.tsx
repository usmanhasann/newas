/**
 * Mood Breakdown is a LOCKED snapshot of the last finished period (client report: it used a rolling
 * "last 7 days" window, so on Sep 14 it showed Sep 8 to 14 instead of the finished Sep 7 to 13 week,
 * the "miscount"). It queries exactly that period, per tab, never a window ending today, and it does
 * NOT wait for the AI reflection: here the weekly reflection failed, yet the finished week's moods
 * still show (audit 2026-09-30). "Last Entry" is the newest entry that still exists.
 * One render per file.
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InsightsScreen } from '@features/insights/screens/InsightsScreen';

jest.mock('@store/session', () => ({ useCurrentUser: () => ({ id: 'u1' }) }));
jest.mock('@features/profile', () => ({ useProfile: () => ({ data: { timezone: 'UTC' } }) }));

const mockBreakdown = jest.fn((_start: string, _end: string) =>
  Promise.resolve([
    { mood_slug: 'calm', count: 4 },
    { mood_slug: 'happy', count: 4 },
  ]),
);
const mockPeriods = jest.fn((_today: string) =>
  // Only the weekly card has a finished period so far.
  Promise.resolve([{ type: 'weekly', start: '2026-09-07', end: '2026-09-13' }]),
);
jest.mock('@features/insights/api', () => ({
  fetchJournalStats: () =>
    Promise.resolve({
      current_streak: 3,
      longest_streak: 5,
      last_entry_date: '2026-09-15', // journaled on the 15th, but that entry was deleted
      last_entry_on: '2026-09-12',
    }),
  fetchMoodBreakdown: (start: string, end: string) => mockBreakdown(start, end),
  fetchBreakdownPeriods: (today: string) => mockPeriods(today),
}));

jest.mock('@features/reflections', () => ({
  ...jest.requireActual('@features/reflections/logic'),
  ReflectionsSection: () => null,
  useReflectionsOverview: () => ({
    data: [
      // Weekly: the AI reflection for Sep 7 to 13 FAILED (no ready content at all).
      { type: 'weekly', content: null, failed: true, periodStart: null, periodEnd: null, nextUnlockDate: '2026-09-21' },
      { type: 'monthly', content: null, periodStart: null, periodEnd: null, nextUnlockDate: '2026-10-07' },
      { type: 'yearly', content: null, periodStart: null, periodEnd: null, nextUnlockDate: '2027-09-07' },
    ],
  }),
}));

it('shows the finished period on each tab, without waiting for the AI, never a rolling window', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = await render(
    <QueryClientProvider client={qc}>
      <InsightsScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(mockBreakdown).toHaveBeenCalledWith('2026-09-07', '2026-09-13'));
  expect(mockBreakdown).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(utils.getByText('Calm')).toBeTruthy());
  expect(utils.queryByText(/will show here after a full week of journaling/)).toBeNull();

  // "Last Entry" is the newest entry that still exists, not the deleted one.
  await waitFor(() => expect(utils.getByText('Sep 12')).toBeTruthy());
  expect(utils.queryByText('Sep 15')).toBeNull();

  // Monthly tab: no finished month yet → the not-ready text with its ready date, and no query.
  await fireEvent.press(utils.getByText('Month'));
  await waitFor(() =>
    expect(utils.getByText('Your mood breakdown will show here after a full month of journaling.')).toBeTruthy(),
  );
  expect(utils.getByText('Ready on October 7, 2026.')).toBeTruthy();
  expect(mockBreakdown).toHaveBeenCalledTimes(1);
});
