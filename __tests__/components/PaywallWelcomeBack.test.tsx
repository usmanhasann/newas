/**
 * The "Welcome back" paywall for returning users (client revisions 10/14 p.37, N16): no progress
 * bar, "[First name], welcome back", the most recent entry that wasn't flagged (YOUR LAST ENTRY ·
 * SEP 30, its first line readable once laid out, the rest blurred, "Subscribe to open your
 * journal."), the three lines with the entry count, CHOOSE YOUR PLAN, "Billed yearly" / "Billed
 * monthly", no timeline, "Start annual plan" + "Cancel anytime.", and Monthly selectable.
 * One render per file.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PaywallScreen } from '@features/subscription/screens/PaywallScreen';

const mockPurchase = jest.fn((_args: unknown) => Promise.resolve({ status: 'canceled' }));
const mockStartTrial = jest.fn();
const mockSignOut = jest.fn();

jest.mock('@features/profile', () => ({
  useProfile: () => ({ data: { display_name: 'Konah Quittman' } }),
}));
jest.mock('@features/insights', () => ({
  useJournalStats: () => ({ data: { entries_count: 14 }, isError: false }),
}));
jest.mock('@features/journal', () => ({
  useEntries: () => ({
    data: {
      pages: [
        {
          items: [
            {
              id: 'e3',
              note: 'A flagged entry.',
              local_date: '2026-10-02',
              crisis_flagged: true,
            },
            {
              id: 'e2',
              note: 'Today felt lighter than last week. I finally said what I had been holding in.',
              local_date: '2026-09-30',
              crisis_flagged: false,
            },
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
jest.mock('@features/auth', () => ({ useSignOut: () => ({ mutate: mockSignOut }) }));
jest.mock('@features/iap', () => ({
  usePurchase: () => ({ mutateAsync: mockPurchase, isPending: false }),
  useRestorePurchases: () => ({ mutateAsync: jest.fn(), isPending: false }),
  IapError: class IapError extends Error {},
  purchaseProblemMessage: () => '',
}));
jest.mock('@features/subscription/hooks', () => ({
  useStartTrial: () => ({ mutate: mockStartTrial, isPending: false }),
  useSubscriptionView: () => ({ view: { trialEligible: false, hasAccess: false } }),
  // The stores can sell (their prices are the defaults here): buttons buy through them.
  usePaywallMode: () => ({
    viaStore: true,
    trialEligible: false,
    prices: jest.requireActual('@features/subscription/pricing').PLAN_PRICING,
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

it('shows the Welcome back paywall like the mock', async () => {
  await render(<PaywallScreen />);

  // Header, no progress bar (N16.02, N16.03, N16.31).
  expect(screen.getByText('Konah, welcome back')).toBeTruthy();
  expect(
    findAll(screen.toJSON(), (n) => n.props.accessibilityRole === 'progressbar'),
  ).toHaveLength(0);

  // The card: the newest unflagged entry, its own date (N16.04, N16.08, N16.32).
  expect(screen.getByText('YOUR LAST ENTRY · SEP 30')).toBeTruthy();
  expect(screen.queryByText('YOUR LAST ENTRY · OCT 2')).toBeNull();
  expect(screen.getByText('Subscribe to open your journal.')).toBeTruthy();
  // Before it's laid out, nothing is readable.
  expect(screen.queryByText(/Today felt lighter/)).toBeNull();
  // The phone lays it out: the first line becomes readable, the rest stays blurred (N16.06, N16.33).
  await fireEvent(
    screen.getByTestId('preview-measure', { includeHiddenElements: true }),
    'textLayout',
    {
      nativeEvent: {
        lines: [
          { text: 'Today felt lighter than last week. I ' },
          { text: 'finally said what I had been holding in.' },
        ],
      },
    },
  );
  expect(screen.getByText('Today felt lighter than last week. I')).toBeTruthy();
  expect(screen.queryByText('finally said what I had been holding in.')).toBeNull();
  expect(
    screen.getAllByText('finally said what I had been holding in.', {
      includeHiddenElements: true,
    }).length,
  ).toBeGreaterThan(1);

  // Checkmark lines (N16.10 to N16.13, N16.35) and CHOOSE YOUR PLAN (N16.14).
  expect(
    screen.getByText('All 14 of your entries, right where you left them'),
  ).toBeTruthy();
  expect(screen.getByText('New reflections in the tone you chose')).toBeTruthy();
  expect(screen.getByText('Your circles and the people in them')).toBeTruthy();
  expect(screen.getByText('CHOOSE YOUR PLAN')).toBeTruthy();

  // Plan cards with the billing lines, same prices and tag (N16.16 to N16.18, N16.37).
  expect(screen.getByText('Billed yearly')).toBeTruthy();
  expect(screen.getByText('Billed monthly')).toBeTruthy();
  expect(screen.queryByText('5-day free trial')).toBeNull();
  expect(screen.queryByText('No free trial')).toBeNull();
  expect(screen.getByText('Best value · Save 50%')).toBeTruthy();
  expect(screen.getByText('$59.88')).toBeTruthy();

  // No timeline; the button and links (N16.19 to N16.23).
  expect(screen.queryByTestId('trial-timeline')).toBeNull();
  expect(screen.getByText('Start annual plan')).toBeTruthy();
  expect(screen.getByText('Cancel anytime.')).toBeTruthy();
  expect(screen.getByText('Restore purchases')).toBeTruthy();
  expect(screen.getByText('Terms')).toBeTruthy();
  expect(screen.getByText('Privacy')).toBeTruthy();
  // Kept: a way to log out (decision N15.98).
  expect(screen.getByText('Log out')).toBeTruthy();

  await fireEvent.press(screen.getByTestId('plan-monthly'));
  expect(screen.getByText('Start monthly plan')).toBeTruthy();
  await fireEvent.press(screen.getByText('Start monthly plan'));
  expect(mockPurchase).toHaveBeenCalledWith({ plan: 'monthly', withTrial: false });
  expect(mockStartTrial).not.toHaveBeenCalled();
});
