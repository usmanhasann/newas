/**
 * The server side of a purchase (Edge Function validate-purchase): every purchase is checked with
 * Apple / Google there before it grants anything, and the person's subscription is re-checked with
 * the store each time the app opens (client 10/14 p.38). The app never writes its own entitlement.
 */
import { z } from 'zod';
import { env, supabase } from '@lib';
import type { PurchasePlatform } from '@app-types/database';

const replySchema = z.object({
  status: z.enum([
    'ok',
    'owned_by_other_account',
    'invalid',
    'not_configured',
    'none',
    'skipped',
  ]),
});
export type VerifyStatus = z.infer<typeof replySchema>['status'];

async function call(body: Record<string, unknown>): Promise<VerifyStatus> {
  const { data, error } = await supabase.functions.invoke('validate-purchase', {
    body: { ...body, environment: env.billingEnvironment },
  });
  if (error) throw error;
  const parsed = replySchema.safeParse(data);
  if (!parsed.success) throw new Error('validate-purchase: unexpected reply');
  return parsed.data.status;
}

/** Check one store purchase (its signed transaction / purchase token) and apply it to this account. */
export function verifyStorePurchase(input: {
  platform: PurchasePlatform;
  productId: string;
  token: string;
}): Promise<VerifyStatus> {
  return call({
    action: 'verify',
    platform: input.platform,
    product_id: input.productId,
    token: input.token,
  });
}

/** Re-check this account's store subscription with Apple / Google ("none": it has none). */
export function refreshStoreSubscription(): Promise<VerifyStatus> {
  return call({ action: 'refresh' });
}
