/**
 * Client 10/14 p.14 (O7.16-O7.20): a finished period with no entries shows the empty state in place
 * of the reflection text only; "Reflecting on [date range]" for that empty period and "Your next
 * reflection will be ready on [date]" still show, exactly as for a real reflection.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render } from '@testing-library/react-native';
import { ReflectionCard } from '@features/reflections';

it('MONTHLY: the same empty state with the empty month and the next date (O7.22)', async () => {
  const utils = await render(
    <ReflectionCard
      overview={{
        type: 'monthly',
        hasAnyEntry: true,
        nextUnlockDate: '2026-10-14',
        content: null,
        periodStart: '2026-08-14',
        periodEnd: '2026-09-13',
        generatedAt: null,
        generating: false,
        failed: false,
        periodHasEntries: false,
      }}
      retrying={false}
      onRetry={() => {}}
    />,
  );
  expect(utils.getByText('Monthly Reflection')).toBeTruthy();
  expect(utils.getByText('No entries in this period yet. Journal to see your reflection here.')).toBeTruthy();
  expect(utils.getByText('Reflecting on Aug 14 to Sep 13')).toBeTruthy();
  expect(utils.getByText('Your next reflection will be ready on October 14, 2026.')).toBeTruthy();
  expect(utils.queryByText(/Keep going!/)).toBeNull(); // never the not-ready text
  expect(utils.queryByText(/^Ready on/)).toBeNull();
});
