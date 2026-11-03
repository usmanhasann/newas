/**
 * "If they cancel, they keep full access until the end of the period they already paid for, and the
 * paywall should only show once that period actually ends" (client revisions 10/14 p.38, N16.26 +
 * N16.27). A canceled store plan stays 'active' with cancel_at_period_end until its period ends (the
 * store wiring, N17, keeps it that way); access, and so the route gate, follow current_period_end.
 */
import { isEntitled } from '@features/subscription/access';
import type { Subscription } from '@app-types/database';

const NOW = Date.parse('2026-10-22T12:00:00Z');

const canceled = (periodEnd: string): Subscription =>
  ({
    id: 's1',
    user_id: 'u1',
    plan: 'monthly',
    status: 'active',
    cancel_at_period_end: true,
    current_period_end: periodEnd,
    environment: 'production',
    trial_started_at: null,
    trial_ends_at: null,
    trial_consumed: true,
    platform: 'ios',
    product_id: 'lysm.monthly',
    store_transaction_id: 't1',
    store_environment: 'production',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
  }) as Subscription;

it('keeps access until the paid period ends, then the paywall shows', () => {
  expect(isEntitled(canceled('2026-10-30T00:00:00Z'), NOW)).toBe(true);
  expect(isEntitled(canceled('2026-10-22T11:59:59Z'), NOW)).toBe(false);
});
