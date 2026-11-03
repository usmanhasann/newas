/**
 * Client 10/14 p.14 (O7.16-O7.20): a finished period with no entries shows the empty state in place
 * of the reflection text only; "Reflecting on [date range]" for that empty period and "Your next
 * reflection will be ready on [date]" still show, exactly as for a real reflection.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render } from '@testing-library/react-native';
import { ReflectionCard } from '@features/reflections';

it('shows the empty state with the empty period and the next date', async () => {
  const utils = await render(
    <ReflectionCard
      overview={{
        type: 'weekly',
        hasAnyEntry: true,
        nextUnlockDate: '2026-10-05',
        content: null,
        periodStart: '2026-09-21',
        periodEnd: '2026-09-27',
        generatedAt: null,
        generating: false,
        failed: false,
        periodHasEntries: false,
      }}
      retrying={false}
      onRetry={() => {}}
    />,
  );
  expect(utils.getByText('Weekly Reflection')).toBeTruthy();
  expect(utils.getByText('No entries in this period yet. Journal to see your reflection here.')).toBeTruthy();
  expect(utils.getByText('Reflecting on Sep 21 to Sep 27')).toBeTruthy();
  expect(utils.getByText('Your next reflection will be ready on October 5, 2026.')).toBeTruthy();
  expect(utils.queryByText(/Keep going!/)).toBeNull(); // never the not-ready text
  expect(utils.queryByText(/^Ready on/)).toBeNull();
});
