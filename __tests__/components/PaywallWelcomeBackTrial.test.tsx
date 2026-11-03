/**
 * Welcome back, but the user can still have the free trial (client revisions 10/14 p.37, N16.24):
 * the trial version of the button, the card lines and the timeline, and the button starts the trial.
 * One render per file.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PaywallScreen } from '@features/subscription/screens/PaywallScreen';

const mockStartTrial = jest.fn();
const mockPurchase = jest.fn();

jest.mock('@features/profile', () => ({
  useProfile: () => ({ data: { display_name: 'Konah' } }),
}));
jest.mock('@features/insights', () => ({
  useJournalStats: () => ({ data: { entries_count: 3 }, isError: false }),
}));
jest.mock('@features/journal', () => ({
  useEntries: () => ({
    data: {
      pages: [
        {
          items: [
            { id: 'e1', note: 'Hello.', local_date: '2026-10-01', crisis_flagged: false },
          ],
        },
      ],
    },
  }),
}));
jest.mock('@features/crisis', () => ({
  useCrisisKeywords: () => ({ data: [], isError: false }),
  detectCrisis: () => null,
}));
jest.mock('@features/auth', () => ({ useSignOut: () => ({ mutate: jest.fn() }) }));
jest.mock('@features/iap', () => ({
  usePurchase: () => ({ mutateAsync: mockPurchase, isPending: false }),
  useRestorePurchases: () => ({ mutateAsync: jest.fn(), isPending: false }),
  IapError: class IapError extends Error {},
}));
jest.mock('@features/subscription/hooks', () => ({
  useStartTrial: () => ({ mutate: mockStartTrial, isPending: false }),
  useSubscriptionView: () => ({ view: { trialEligible: true, hasAccess: false } }),
  // The stores can't sell in tests: the app's own trial, the same eligibility as the view.
  usePaywallMode: () => ({
    viaStore: false,
    trialEligible: true,
    prices: jest.requireActual('@features/subscription/pricing').PLAN_PRICING,
  }),
}));

it('shows the trial version and starts the trial', async () => {
  await render(<PaywallScreen />);

  expect(screen.getByText('Konah, welcome back')).toBeTruthy();
  expect(
    screen.getByText('All 3 of your entries, right where you left them'),
  ).toBeTruthy();
  expect(screen.getByText('5-day free trial')).toBeTruthy();
  expect(screen.getByText('No free trial')).toBeTruthy();
  expect(screen.queryByText('Billed yearly')).toBeNull();
  expect(screen.getByTestId('trial-timeline')).toBeTruthy();
  expect(screen.getByText('Start my 5-day free trial')).toBeTruthy();
  expect(screen.getByText('No charge today. Cancel anytime.')).toBeTruthy();

  await fireEvent.press(screen.getByText('Start my 5-day free trial'));
  expect(mockStartTrial).toHaveBeenCalledTimes(1);
  expect(mockPurchase).not.toHaveBeenCalled();
});
