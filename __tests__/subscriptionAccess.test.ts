import { isEntitled, toSubscriptionView } from '@features/subscription/access';
import type { Subscription } from '@app-types/database';

const T0 = Date.parse('2026-06-21T00:00:00.000Z'); // fixed "now" baseline (UTC)
const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
const ENDS = '2026-06-26T00:00:00.000Z'; // exactly T0 + 5 days
const ENDS_MS = Date.parse(ENDS);

function sub(p: Partial<Subscription>): Subscription {
  return {
    id: 's1',
    user_id: 'u1',
    plan: null,
    status: 'incomplete',
    current_period_end: null,
    cancel_at_period_end: false,
    environment: 'development',
    trial_started_at: null,
    trial_ends_at: null,
    trial_consumed: false,
    platform: null,
    product_id: null,
    store_transaction_id: null,
    store_environment: 'production',
    created_at: '2026-06-21T00:00:00.000Z',
    updated_at: '2026-06-21T00:00:00.000Z',
    ...p,
  };
}

describe('isEntitled', () => {
  it('denies when there is no subscription', () => {
    expect(isEntitled(null, T0)).toBe(false);
  });

  it('grants access during a valid trial and denies once it ends (UTC, strict boundary)', () => {
    const s = sub({ status: 'trialing', trial_started_at: '2026-06-21T00:00:00.000Z', trial_ends_at: ENDS });
    expect(isEntitled(s, T0 + 60 * 60 * 1000)).toBe(true); // 1h in
    expect(isEntitled(s, ENDS_MS - 1)).toBe(true); // 1ms before end
    expect(isEntitled(s, ENDS_MS)).toBe(false); // exactly at end -> no access
    expect(isEntitled(s, ENDS_MS + 1)).toBe(false); // after end -> no access
  });

  it('trial ends exactly 5 days after it starts', () => {
    const s = sub({ status: 'trialing', trial_started_at: '2026-06-21T00:00:00.000Z', trial_ends_at: ENDS });
    expect(Date.parse(s.trial_ends_at!) - Date.parse(s.trial_started_at!)).toBe(FIVE_DAYS);
  });

  it('grants access for an active paid subscription', () => {
    expect(isEntitled(sub({ status: 'active', current_period_end: null }), T0)).toBe(true);
    expect(isEntitled(sub({ status: 'active', current_period_end: '2026-07-21T00:00:00Z' }), T0)).toBe(true);
    expect(isEntitled(sub({ status: 'active', current_period_end: '2026-06-20T00:00:00Z' }), T0)).toBe(false);
  });

  it('an active paid subscription grants access even if a past trial end exists (upgrade)', () => {
    const s = sub({ status: 'active', trial_ends_at: '2026-06-01T00:00:00Z', trial_consumed: true });
    expect(isEntitled(s, T0)).toBe(true);
  });

  it('denies expired / canceled / incomplete statuses', () => {
    expect(isEntitled(sub({ status: 'expired', trial_ends_at: '2026-06-01T00:00:00Z' }), T0)).toBe(false);
    expect(isEntitled(sub({ status: 'canceled' }), T0)).toBe(false);
    expect(isEntitled(sub({ status: 'incomplete' }), T0)).toBe(false);
  });

  it('does not trust trialing status without a trial end timestamp', () => {
    expect(isEntitled(sub({ status: 'trialing', trial_ends_at: null }), T0)).toBe(false);
  });
});

describe('toSubscriptionView', () => {
  it('treats a missing subscription as trial-eligible with no access', () => {
    const v = toSubscriptionView(null, T0);
    expect(v).toMatchObject({ status: 'none', hasAccess: false, trialEligible: true });
  });

  it('marks a pristine incomplete row as eligible', () => {
    expect(toSubscriptionView(sub({ status: 'incomplete' }), T0).trialEligible).toBe(true);
  });

  it('is NOT eligible once a trial has been consumed', () => {
    const v = toSubscriptionView(sub({ status: 'incomplete', trial_consumed: true }), T0);
    expect(v.trialEligible).toBe(false);
  });

  it('is NOT eligible with an existing store purchase or non-incomplete status', () => {
    expect(toSubscriptionView(sub({ store_transaction_id: 'txn_1' }), T0).trialEligible).toBe(false);
    expect(toSubscriptionView(sub({ status: 'canceled' }), T0).trialEligible).toBe(false);
    expect(toSubscriptionView(sub({ status: 'active' }), T0).trialEligible).toBe(false);
  });

  it('reports an active trial, then an expired trial after the end time', () => {
    const s = sub({ status: 'trialing', trial_started_at: '2026-06-21T00:00:00Z', trial_ends_at: ENDS });
    const active = toSubscriptionView(s, T0 + 1000);
    expect(active).toMatchObject({ isTrialing: true, hasAccess: true, trialExpired: false, trialEligible: false });

    const after = toSubscriptionView(s, ENDS_MS + 1000);
    expect(after).toMatchObject({ isTrialing: false, hasAccess: false, trialExpired: true });
  });

  it('reports trialExpired for an expired-status row and keeps audit dates', () => {
    const s = sub({ status: 'expired', trial_started_at: '2026-06-16T00:00:00Z', trial_ends_at: ENDS });
    const v = toSubscriptionView(s, ENDS_MS + 1000);
    expect(v.trialExpired).toBe(true);
    expect(v.hasAccess).toBe(false);
    expect(v.trialStartedAt).toBe('2026-06-16T00:00:00Z');
    expect(v.trialEndsAt).toBe(ENDS);
  });
});
