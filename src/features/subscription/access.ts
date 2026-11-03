/**
 * Pure, client-side subscription-access logic (no I/O) — the single mirror of the
 * server's `has_active_subscription`. `now` is injectable for deterministic tests.
 * The SERVER remains the authority; this only drives UI gating from server data.
 */
import type {
  Subscription,
  SubscriptionStatus,
  SubscriptionPlan,
} from '@app-types/database';

/** Access = valid paid subscription OR an app-managed trial not yet past its end. */
export function isEntitled(
  sub: Subscription | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!sub) return false;
  if (sub.status === 'active') {
    return !sub.current_period_end || new Date(sub.current_period_end).getTime() > now;
  }
  if (sub.status === 'trialing') {
    return !!sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() > now;
  }
  return false;
}

/** Normalized subscription info for the frontend (no sensitive store/billing data). */
export interface SubscriptionView {
  status: SubscriptionStatus | 'none';
  hasAccess: boolean;
  isTrialing: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialExpired: boolean;
  trialEligible: boolean;
  plan: SubscriptionPlan | null;
}

export function toSubscriptionView(
  sub: Subscription | null | undefined,
  now: number = Date.now(),
): SubscriptionView {
  if (!sub) {
    return {
      status: 'none',
      hasAccess: false,
      isTrialing: false,
      trialStartedAt: null,
      trialEndsAt: null,
      trialExpired: false,
      trialEligible: true,
      plan: null,
    };
  }
  const endsMs = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : null;
  const isTrialing = sub.status === 'trialing' && endsMs !== null && endsMs > now;
  const trialExpired =
    endsMs !== null &&
    endsMs <= now &&
    (sub.status === 'trialing' || sub.status === 'expired');
  // Mirrors server eligibility in start_trial(): never consumed, no active store
  // purchase, and still a pristine 'incomplete' row.
  const trialEligible =
    !sub.trial_consumed && !sub.store_transaction_id && sub.status === 'incomplete';
  return {
    status: sub.status,
    hasAccess: isEntitled(sub, now),
    isTrialing,
    trialStartedAt: sub.trial_started_at,
    trialEndsAt: sub.trial_ends_at,
    trialExpired,
    trialEligible,
    plan: sub.plan,
  };
}
