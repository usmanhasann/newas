import { render, fireEvent } from '@testing-library/react-native';
import { ReflectionCard } from '@features/reflections';
import type { ReflectionOverview } from '@features/reflections';

const base: ReflectionOverview = {
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
};

const noop = () => {};

describe('<ReflectionCard /> (§7/§8 lifecycle states)', () => {
  it('READY: shows the generated content + the period range (and content wins)', async () => {
    const { getByText } = await render(
      <ReflectionCard
        overview={{
          ...base,
          content: 'You showed up for yourself this week.',
          periodStart: '2025-12-22',
          periodEnd: '2025-12-28',
          generatedAt: '2025-12-29T00:00:00Z',
        }}
        onRetry={noop}
        retrying={false}
      />,
    );
    expect(getByText('You showed up for yourself this week.')).toBeTruthy();
    expect(getByText(/Reflecting on/)).toBeTruthy();
  });

  it('GENERATING: shows the in-progress state', async () => {
    const { getByText } = await render(
      <ReflectionCard overview={{ ...base, generating: true }} onRetry={noop} retrying={false} />,
    );
    expect(getByText('Your reflection is being prepared…')).toBeTruthy();
  });

  it('FAILED: shows a retry that fires onRetry', async () => {
    const onRetry = jest.fn();
    const { getByText } = await render(
      <ReflectionCard overview={{ ...base, failed: true }} onRetry={onRetry} retrying={false} />,
    );
    await fireEvent.press(getByText('Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
