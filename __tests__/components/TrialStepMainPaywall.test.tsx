/**
 * The new main paywall at the end of onboarding (client revisions 10/14 p.32 to p.34, N15): one
 * screen for both plans, top to bottom like the mock. They journaled, the reflection is ready, the
 * trial is still available. Then Monthly is tapped: "Start monthly plan", "Cancel anytime.", no
 * timeline. One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TrialStep } from '@features/onboarding/screens/steps/TrialStep';
import { progressFor } from '@features/onboarding/flow';
import type { OnboardingNav } from '@features/onboarding/hooks';

const mockStartTrial = jest.fn(() => Promise.resolve(null));
const mockPurchase = jest.fn((_args: unknown) => Promise.resolve({ status: 'canceled' }));
const mockGenerate = jest.fn();
const mockRequestWelcome = jest.fn();

jest.mock('@features/onboarding/analytics', () => ({ trackOnboarding: jest.fn() }));
jest.mock('@features/profile', () => ({
  useProfile: () => ({ data: { display_name: 'Konah Quittman' } }),
}));
jest.mock('@features/subscription/hooks', () => ({
  useStartTrial: () => ({
    mutateAsync: mockStartTrial,
    mutate: jest.fn(),
    isPending: false,
  }),
  useSubscriptionView: () => ({ view: { trialEligible: true, hasAccess: false } }),
  // The stores can sell (their prices are the defaults here): buttons buy through them.
  usePaywallMode: () => ({
    viaStore: true,
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
  useEntry: () => ({
    data: {
      note: 'Calm walk this morning.',
      ai_status: 'ready',
      ai_summary:
        'You checked in today feeling calm and content, and that is worth noticing. There is something steady in how you described your morning.',
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
    mutate: mockRequestWelcome,
    isPending: false,
    isError: false,
  }),
}));

type Node = { type: string; props: Record<string, unknown>; children?: unknown[] | null };
function findAll(node: unknown, pred: (n: Node) => boolean, out: Node[] = []): Node[] {
  if (!node || typeof node === 'string') return out;
  if (Array.isArray(node)) {
    node.forEach((n) => findAll(n, pred, out));
    return out;
  }
  const n = node as Node;
  if (pred(n)) out.push(n);
  (n.children ?? []).forEach((c) => findAll(c, pred, out));
  return out;
}

it('shows the main paywall like the mock, and switching to Monthly changes the button and hides the timeline', async () => {
  const goNext = jest.fn(() => Promise.resolve());
  const nav = {
    data: { first_entry_id: 'e1' },
    view: { trialEligible: true, hasAccess: false },
    progress: progressFor('trial'),
    canBack: false,
    goBack: jest.fn(),
    goNext,
    persist: jest.fn(() => Promise.resolve()),
    patchLocal: jest.fn(),
  } as unknown as OnboardingNav;
  await render(<TrialStep nav={nav} />);

  // Progress bar at the top, full (N15.11, N15.82: no gray track left); no back control (N15.98).
  const bars = findAll(
    screen.toJSON(),
    (n) => n.props.accessibilityRole === 'progressbar',
  );
  expect(bars).toHaveLength(1);
  const value = bars[0]!.props.accessibilityValue as { now: number; max: number };
  expect(value.now).toBe(value.max);
  expect(screen.queryByLabelText('Go back')).toBeNull();

  // Header on two even lines (N15.12 to N15.14).
  expect(screen.getByText('Konah, your\nreflection is waiting')).toBeTruthy();
  expect(screen.getByLabelText('Konah, your reflection is waiting')).toBeTruthy();

  // The purple card: label, first sentence readable, the rest blurred, the pill (N15.15 to N15.22).
  expect(screen.getByText('WRITTEN FOR YOU')).toBeTruthy();
  expect(
    screen.getByTestId('sparkle-icon', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(
    screen.getByText(
      'You checked in today feeling calm and content, and that is worth noticing.',
    ),
  ).toBeTruthy();
  const rest = 'There is something steady in how you described your morning.';
  expect(screen.queryByText(rest)).toBeNull(); // not readable (hidden, blurred)
  expect(
    screen.getAllByText(rest, { includeHiddenElements: true }).length,
  ).toBeGreaterThan(1);
  expect(screen.getByText('Start your trial to read the rest')).toBeTruthy();
  expect(mockGenerate).not.toHaveBeenCalled(); // already written

  // Benefits (N15.23 to N15.26); no "CHOOSE YOUR PLAN" on the main paywall (N15.89).
  expect(screen.getByText('Understand your moods week by week')).toBeTruthy();
  expect(screen.getByText('Reflections written in the tone you chose')).toBeTruthy();
  expect(screen.getByText('Share with the people you trust')).toBeTruthy();
  expect(screen.queryByText('CHOOSE YOUR PLAN')).toBeNull();

  // Plan cards (N15.27 to N15.40); Annual selected by default.
  expect(screen.getByText('Annual')).toBeTruthy();
  expect(screen.getByText('Monthly')).toBeTruthy();
  expect(screen.getByText('Best value · Save 50%')).toBeTruthy();
  expect(screen.getByText('5-day free trial')).toBeTruthy();
  expect(screen.getByText('No free trial')).toBeTruthy();
  expect(screen.getByText('$29.99/yr')).toBeTruthy();
  expect(screen.getByText('$59.88')).toBeTruthy();
  expect(screen.getByText('$4.99/mo')).toBeTruthy();
  expect(screen.getByTestId('plan-yearly').props.accessibilityState).toMatchObject({
    checked: true,
  });
  expect(screen.getByTestId('plan-monthly').props.accessibilityState).toMatchObject({
    checked: false,
  });

  // Trial timeline (N15.42 to N15.45).
  expect(screen.getByTestId('trial-timeline')).toBeTruthy();
  for (const t of [
    'Today',
    'Full access',
    'Day 3',
    'We remind you',
    'Day 5',
    'Trial ends',
  ]) {
    expect(screen.getByText(t)).toBeTruthy();
  }

  // Button, the line under it, the links (N15.46 to N15.48).
  expect(screen.getByText('Start my 5-day free trial')).toBeTruthy();
  expect(screen.getByText('No charge today. Cancel anytime.')).toBeTruthy();
  expect(screen.getByText('Restore purchases')).toBeTruthy();
  expect(screen.getByText('Terms')).toBeTruthy();
  expect(screen.getByText('Privacy')).toBeTruthy();

  // Tapping a card selects it (N15.41); Monthly (N15.49 to N15.51).
  await fireEvent.press(screen.getByTestId('plan-monthly'));
  expect(screen.getByTestId('plan-monthly').props.accessibilityState).toMatchObject({
    checked: true,
  });
  expect(screen.getByText('Start monthly plan')).toBeTruthy();
  expect(screen.getByText('Cancel anytime.')).toBeTruthy();
  expect(screen.queryByText('No charge today. Cancel anytime.')).toBeNull();
  expect(screen.queryByTestId('trial-timeline')).toBeNull();

  await fireEvent.press(screen.getByText('Start monthly plan'));
  expect(mockPurchase).toHaveBeenCalledWith({ plan: 'monthly', withTrial: false });
  expect(mockStartTrial).not.toHaveBeenCalled();
  expect(goNext).not.toHaveBeenCalled(); // closed the store's sheet: stays here

  // Back to Annual: the stores' own free trial is bought (p.33), and onboarding moves on.
  mockPurchase.mockResolvedValueOnce({ status: 'purchased' });
  await fireEvent.press(screen.getByTestId('plan-yearly'));
  await fireEvent.press(screen.getByText('Start my 5-day free trial'));
  expect(mockPurchase).toHaveBeenLastCalledWith({ plan: 'yearly', withTrial: true });
  expect(mockStartTrial).not.toHaveBeenCalled();
  await waitFor(() => expect(goNext).toHaveBeenCalledWith({ selected_plan: 'yearly' }));
});
