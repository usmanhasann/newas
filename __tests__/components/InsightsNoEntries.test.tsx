/**
 * Client 10/14 p.4 (O19): a user with NO journal entries sees one section, "MOODS & REFLECTIONS"
 * (the section style uppercases "Moods & Reflections"), instead of "MOOD BREAKDOWN" and
 * "REFLECTIONS", with "Start journaling to see your mood breakdown and [weekly/monthly/yearly]
 * reflection here." following the tab. No "Ready on" line (no first entry, no date yet).
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
    Promise.resolve({ current_streak: 0, longest_streak: 0, last_entry_date: null, last_entry_on: null }),
  fetchMoodBreakdown: () => mockBreakdown(),
  fetchBreakdownPeriods: () => Promise.resolve([]),
}));
const mockGenerate = jest.fn(() => Promise.resolve({ generated: 0 }));
jest.mock('@features/reflections/api', () => {
  // What the server returns before a first entry: no entries, no dates.
  const row = (type: string) => ({
    type,
    hasAnyEntry: false,
    nextUnlockDate: null,
    content: null,
    periodStart: null,
    periodEnd: null,
    generatedAt: null,
    generating: false,
    failed: false,
    periodHasEntries: null,
  });
  return {
    fetchReflectionsOverview: () => Promise.resolve([row('weekly'), row('monthly'), row('yearly')]),
    triggerReflectionGeneration: () => mockGenerate(),
  };
});

const classes = (node: { props: { className?: unknown } }) => String(node.props.className ?? '').split(/\s+/);

it('shows one "Moods & Reflections" card whose text follows the tab', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = await render(
    <QueryClientProvider client={qc}>
      <InsightsScreen />
    </QueryClientProvider>,
  );

  const weekly = 'Start journaling to see your mood breakdown and weekly reflection here.';
  await waitFor(() => expect(utils.getByText(weekly)).toBeTruthy());
  expect(classes(utils.getByText(weekly))).toContain('text-center');

  // The label, rendered in the section style, which uppercases it to "MOODS & REFLECTIONS".
  const label = utils.getByText('Moods & Reflections');
  expect(classes(label)).toEqual(expect.arrayContaining(['uppercase', 'text-xs', 'tracking-label']));
  // Instead of both normal sections, and none of the has-entries texts.
  expect(utils.queryByText('Mood Breakdown')).toBeNull();
  expect(utils.queryByText('Reflections')).toBeNull();
  expect(utils.queryByText('Weekly Reflection')).toBeNull();
  expect(utils.queryByText(/will show here after a full/)).toBeNull();
  expect(utils.queryByText(/Ready on/)).toBeNull();
  expect(utils.queryByText(/mood patterns will appear here/)).toBeNull();

  await fireEvent.press(utils.getByText('Month'));
  await waitFor(() =>
    expect(utils.getByText('Start journaling to see your mood breakdown and monthly reflection here.')).toBeTruthy(),
  );
  expect(utils.getByText('Moods & Reflections')).toBeTruthy();

  await fireEvent.press(utils.getByText('Year'));
  await waitFor(() =>
    expect(utils.getByText('Start journaling to see your mood breakdown and yearly reflection here.')).toBeTruthy(),
  );
  expect(utils.getByText('Moods & Reflections')).toBeTruthy();
  expect(utils.queryByText('Mood Breakdown')).toBeNull();

  // Nothing to count or reflect on.
  expect(mockBreakdown).not.toHaveBeenCalled();
  expect(mockGenerate).not.toHaveBeenCalled();
});
