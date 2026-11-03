/**
 * Main paywall while the App Store / Google Play can't sell yet (products not set up, offline): the
 * app's own 5-day trial stands in, so nobody is stuck; a paid plan says purchases aren't available
 * right now instead of failing silently. Store prices show as soon as the stores answer (the
 * defaults here). One render per file.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TrialStep } from '@features/onboarding/screens/steps/TrialStep';
import { progressFor } from '@features/onboarding/flow';
import type { OnboardingNav } from '@features/onboarding/hooks';

const mockStartTrial = jest.fn(() => Promise.resolve(null));
const mockPurchase = jest.fn((_args: unknown) =>
  Promise.resolve({ status: 'purchased' }),
);
const mockToastInfo = jest.fn();

jest.mock('@store/toast', () => ({
  toast: { info: (m: string) => mockToastInfo(m), error: jest.fn() },
}));
jest.mock('@features/onboarding/analytics', () => ({ trackOnboarding: jest.fn() }));
jest.mock('@features/profile', () => ({
  useProfile: () => ({ data: { display_name: 'Konah' } }),
}));
jest.mock('@features/subscription/hooks', () => ({
  useStartTrial: () => ({
    mutateAsync: mockStartTrial,
    mutate: jest.fn(),
    isPending: false,
  }),
  useSubscriptionView: () => ({ view: { trialEligible: true, hasAccess: false } }),
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
  usePurchase: () => ({ mutateAsync: mockPurchase, isPending: false }),
  useRestorePurchases: () => ({ mutateAsync: jest.fn(), isPending: false }),
  IapError: class IapError extends Error {},
  purchaseProblemMessage: () => '',
}));
jest.mock('@features/journal', () => ({
  useEntry: () => ({ data: undefined, isError: false, refetch: jest.fn() }),
  useEntries: () => ({ data: undefined }),
}));
jest.mock('@features/ai-summary', () => ({
  useGenerateSummary: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
}));
jest.mock('@features/crisis', () => ({
  useCrisisKeywords: () => ({ data: [], isError: false }),
  detectCrisis: () => null,
}));
jest.mock('@features/welcome-reflection', () => ({
  useWelcomeReflection: () => ({
    data: { status: 'ready', body: 'You came here wanting calmer days.' },
  }),
  useRequestWelcomeReflection: () => ({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
  }),
}));

it('the stores can’t sell yet: a paid plan explains, and the trial is the app’s own', async () => {
  const nav = {
    data: { first_entry_id: null, reflection_status: 'skipped' },
    view: { trialEligible: true, hasAccess: false },
    progress: progressFor('trial'),
    canBack: false,
    goBack: jest.fn(),
    goNext: jest.fn(() => Promise.resolve()),
    persist: jest.fn(() => Promise.resolve()),
    patchLocal: jest.fn(),
  } as unknown as OnboardingNav;
  await render(<TrialStep nav={nav} />);

  await fireEvent.press(screen.getByTestId('plan-monthly'));
  await fireEvent.press(screen.getByText('Start monthly plan'));
  expect(mockPurchase).not.toHaveBeenCalled();
  expect(mockToastInfo).toHaveBeenCalledWith(
    'Purchases aren’t available right now. Please try again later.',
  );

  await fireEvent.press(screen.getByTestId('plan-yearly'));
  await fireEvent.press(screen.getByText('Start my 5-day free trial'));
  expect(mockPurchase).not.toHaveBeenCalled();
  expect(mockStartTrial).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(nav.goNext).toHaveBeenCalledWith({ selected_plan: 'yearly' }),
  );
});
