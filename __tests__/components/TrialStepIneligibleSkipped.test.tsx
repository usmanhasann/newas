/**
 * Main paywall when the free trial was already used (client revisions 10/14 p.36, N15.77 to
 * N15.81) and the check in was skipped (p.33, N15.18): "BASED ON YOUR ANSWERS", "Start annual
 * plan", "Cancel anytime.", no "5-day free trial" on the Annual card, no timeline; the button
 * starts the paid plan, never the trial. One render per file.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TrialStep } from '@features/onboarding/screens/steps/TrialStep';
import { progressFor } from '@features/onboarding/flow';
import type { OnboardingNav } from '@features/onboarding/hooks';

const mockStartTrial = jest.fn(() => Promise.resolve(null));
const mockPurchase = jest.fn((_args: unknown) => Promise.resolve({ status: 'canceled' }));
const mockRequestWelcome = jest.fn();

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
  useSubscriptionView: () => ({ view: { trialEligible: false, hasAccess: false } }),
  // The stores can sell (their prices are the defaults here): buttons buy through them.
  usePaywallMode: () => ({
    viaStore: true,
    trialEligible: false,
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
    data: {
      status: 'ready',
      body: 'You came here wanting calmer days, and that already says a lot. Most days feel heavy for you.',
    },
  }),
  useRequestWelcomeReflection: () => ({
    mutate: mockRequestWelcome,
    isPending: false,
    isError: false,
  }),
}));

it('trial used + skipped: answers-based card, "Start annual plan", no trial line, no timeline', async () => {
  const nav = {
    data: { first_entry_id: null, reflection_status: 'skipped' },
    view: { trialEligible: false, hasAccess: false },
    progress: progressFor('trial'),
    canBack: false,
    goBack: jest.fn(),
    goNext: jest.fn(() => Promise.resolve()),
    persist: jest.fn(() => Promise.resolve()),
    patchLocal: jest.fn(),
  } as unknown as OnboardingNav;
  await render(<TrialStep nav={nav} />);

  expect(screen.getByText('BASED ON YOUR ANSWERS')).toBeTruthy();
  expect(screen.queryByText('WRITTEN FOR YOU')).toBeNull();
  expect(
    screen.getByText('You came here wanting calmer days, and that already says a lot.'),
  ).toBeTruthy();
  expect(screen.queryByText('Most days feel heavy for you.')).toBeNull(); // blurred
  expect(mockRequestWelcome).not.toHaveBeenCalled(); // already written

  expect(screen.queryByText('5-day free trial')).toBeNull();
  expect(screen.getByText('No free trial')).toBeTruthy();
  expect(screen.queryByTestId('trial-timeline')).toBeNull();
  expect(screen.getByText('Start annual plan')).toBeTruthy();
  expect(screen.getByText('Cancel anytime.')).toBeTruthy();
  expect(screen.queryByText('Start my 5-day free trial')).toBeNull();
  expect(screen.queryByText('No charge today. Cancel anytime.')).toBeNull();

  await fireEvent.press(screen.getByText('Start annual plan'));
  expect(mockPurchase).toHaveBeenCalledWith({ plan: 'yearly', withTrial: false });
  expect(mockStartTrial).not.toHaveBeenCalled();
});
