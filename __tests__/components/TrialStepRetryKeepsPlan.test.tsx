/**
 * Main paywall, the reflection failed (client revisions 10/14 p.35, N15.66 to N15.69): "Failed to
 * load" with "Try again" in the card; tapping it retries inside the card without restarting the
 * paywall or losing the plan the user selected. One render per file.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TrialStep } from '@features/onboarding/screens/steps/TrialStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

const mockGenerate = jest.fn();

jest.mock('@features/onboarding/analytics', () => ({ trackOnboarding: jest.fn() }));
jest.mock('@features/profile', () => ({
  useProfile: () => ({ data: { display_name: 'Konah' } }),
}));
jest.mock('@features/subscription/hooks', () => ({
  useStartTrial: () => ({ mutateAsync: jest.fn(), mutate: jest.fn(), isPending: false }),
  useSubscriptionView: () => ({ view: { trialEligible: true, hasAccess: false } }),
  // The stores can't sell in tests: the app's own trial, the same eligibility as the view.
  usePaywallMode: () => ({
    viaStore: false,
    trialEligible: true,
    prices: jest.requireActual('@features/subscription/pricing').PLAN_PRICING,
  }),
  useSubscription: jest.fn(),
  useEntitlement: jest.fn(),
  subscriptionKeys: { me: () => ['subscription'] },
}));
jest.mock('@features/iap', () => ({
  usePurchase: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRestorePurchases: () => ({ mutateAsync: jest.fn(), isPending: false }),
  IapError: class IapError extends Error {},
}));
jest.mock('@features/journal', () => ({
  useEntry: () => ({
    data: {
      note: 'A long day.',
      ai_status: 'failed',
      ai_summary: null,
      crisis_flagged: false,
    },
    isError: false,
    refetch: jest.fn(),
  }),
  useEntries: () => ({ data: undefined }),
}));
jest.mock('@features/ai-summary', () => ({
  useGenerateSummary: () => ({ mutate: mockGenerate, isPending: false, isError: false }),
}));
jest.mock('@features/crisis', () => ({
  useCrisisKeywords: () => ({ data: [], isError: false }),
  detectCrisis: () => null,
}));
jest.mock('@features/welcome-reflection', () => ({
  useWelcomeReflection: () => ({ data: undefined }),
  useRequestWelcomeReflection: () => ({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
  }),
}));

it('"Try again" retries inside the card and keeps the selected plan', async () => {
  const nav = {
    data: { first_entry_id: 'e1' },
    view: { trialEligible: true, hasAccess: false },
    progress: { index: 15, total: 15 },
    canBack: false,
    goBack: jest.fn(),
    goNext: jest.fn(() => Promise.resolve()),
    persist: jest.fn(() => Promise.resolve()),
    patchLocal: jest.fn(),
  } as unknown as OnboardingNav;
  await render(<TrialStep nav={nav} />);

  expect(screen.getByText('WRITTEN FOR YOU')).toBeTruthy();
  expect(screen.getByText('Failed to load')).toBeTruthy();
  expect(screen.queryByText('Start your trial to read the rest')).toBeNull();

  await fireEvent.press(screen.getByTestId('plan-monthly'));
  expect(screen.getByText('Start monthly plan')).toBeTruthy();

  await fireEvent.press(screen.getByText('Try again'));
  expect(mockGenerate).toHaveBeenCalledTimes(1);
  // Same screen, same selection.
  expect(screen.getByText('Start monthly plan')).toBeTruthy();
  expect(screen.getByTestId('plan-monthly').props.accessibilityState).toMatchObject({
    checked: true,
  });
});
