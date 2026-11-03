/**
 * Welcome back with no entries (client revisions 10/14 p.37, N16.09): the purple card is hidden,
 * and the first line never reads "All 0 of your entries". One render per file.
 */
import { render, screen } from '@testing-library/react-native';
import { PaywallScreen } from '@features/subscription/screens/PaywallScreen';

jest.mock('@features/profile', () => ({
  useProfile: () => ({ data: { display_name: 'Konah' } }),
}));
jest.mock('@features/insights', () => ({
  useJournalStats: () => ({ data: { entries_count: 0 }, isError: false }),
}));
jest.mock('@features/journal', () => ({
  useEntries: () => ({ data: { pages: [{ items: [] }] } }),
}));
jest.mock('@features/crisis', () => ({
  useCrisisKeywords: () => ({ data: [], isError: false }),
  detectCrisis: () => null,
}));
jest.mock('@features/auth', () => ({ useSignOut: () => ({ mutate: jest.fn() }) }));
jest.mock('@features/iap', () => ({
  usePurchase: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRestorePurchases: () => ({ mutateAsync: jest.fn(), isPending: false }),
  IapError: class IapError extends Error {},
}));
jest.mock('@features/subscription/hooks', () => ({
  useStartTrial: () => ({ mutate: jest.fn(), isPending: false }),
  useSubscriptionView: () => ({ view: { trialEligible: false, hasAccess: false } }),
  // The stores can't sell in tests: the app's own trial, the same eligibility as the view.
  usePaywallMode: () => ({
    viaStore: false,
    trialEligible: false,
    prices: jest.requireActual('@features/subscription/pricing').PLAN_PRICING,
  }),
}));

it('hides the card when there are no entries', async () => {
  await render(<PaywallScreen />);

  expect(screen.getByText('Konah, welcome back')).toBeTruthy();
  expect(screen.queryByTestId('last-entry-card')).toBeNull();
  expect(screen.queryByText('Subscribe to open your journal.')).toBeNull();
  expect(screen.getByText('Your journal, right where you left it')).toBeTruthy();
  expect(screen.queryByText(/All 0/)).toBeNull();
  expect(screen.getByText('CHOOSE YOUR PLAN')).toBeTruthy();
  expect(screen.getByText('Start annual plan')).toBeTruthy();
});
