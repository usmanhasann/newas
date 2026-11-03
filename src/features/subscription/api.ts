import { supabase } from '@lib';
import type { BillingEnvironment } from '@lib/env';
import type { Subscription } from '@app-types/database';

// Pure access logic lives in ./access (so it's unit-testable without the client).
export { isEntitled, toSubscriptionView } from './access';
export type { SubscriptionView } from './access';

/** Read the caller's subscription for a specific billing environment. */
export async function fetchMySubscription(
  userId: string,
  environment: BillingEnvironment,
): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('environment', environment)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Start the one-time, app-managed 5-day trial (server enforces eligibility + idempotency). */
export async function startTrial(
  environment: BillingEnvironment,
): Promise<Subscription | null> {
  const { data, error } = await supabase.rpc('start_trial', {
    p_environment: environment,
  });
  if (error) throw error;
  return (data as Subscription) ?? null;
}
