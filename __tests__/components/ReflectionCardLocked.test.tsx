/**
 * Client 10/14 p.1-2 (O18): the Reflection card's NOT-READY state (entries, but no full period yet):
 * "Your weekly reflection will show here after a full week of journaling. Keep going!" then
 * "Ready on [date]." (it replaces "Your next reflection will be ready on [date].").
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render } from '@testing-library/react-native';
import { ReflectionCard } from '@features/reflections';

it('LOCKED: shows the exact not-ready copy + "Ready on [date]."', async () => {
  const { getByText, queryByText } = await render(
    <ReflectionCard
      overview={{
        type: 'weekly',
        hasAnyEntry: true,
        nextUnlockDate: '2026-01-05',
        content: null,
        periodStart: null,
        periodEnd: null,
        generatedAt: null,
        generating: false,
        failed: false,
        periodHasEntries: null,
      }}
      onRetry={() => {}}
      retrying={false}
    />,
  );
  expect(
    getByText('Your weekly reflection will show here after a full week of journaling. Keep going!'),
  ).toBeTruthy();
  expect(getByText('Ready on January 5, 2026.')).toBeTruthy();
  expect(queryByText(/Your next reflection will be ready on/)).toBeNull();
});
