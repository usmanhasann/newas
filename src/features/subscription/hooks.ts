import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  refreshStoreSubscription,
  useStoreReady,
  useStoreTrialEligible,
} from '@features/iap';
import { env } from '@lib';
import { useCurrentUser } from '@store/session';
import { useDevFlags, IS_DEV } from '@store/devFlags';
import * as api from './api';
import { pricesFromStore, type PlanPrices } from './pricing';
import { trialOffered } from './paywallCopy';

export const subscriptionKeys = {
  me: (userId?: string, environment?: string) =>
    ['subscription', userId, environment] as const,
};

export function useSubscription() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: subscriptionKeys.me(user?.id, env.billingEnvironment),
    queryFn: () => api.fetchMySubscription(user!.id, env.billingEnvironment),
    enabled: !!user?.id,
    staleTime: 60_000,
  });
}

/** Normalized, frontend-facing subscription info (status, access, trial fields). */
export function useSubscriptionView() {
  const query = useSubscription();
  return { ...query, view: api.toSubscriptionView(query.data) };
}

/** Combines the server entitlement with the dev-only bypass. */
export function useEntitlement() {
  const query = useSubscription();
  const bypass = useDevFlags((s) => s.bypassGate);
  const entitled = api.isEntitled(query.data) || (IS_DEV && bypass);
  return { ...query, entitled };
}

/**
 * Start the app's own 5-day free trial (only while the stores can't sell, see usePaywallMode);
 * refreshes entitlement on success.
 */
export function useStartTrial() {
  const user = useCurrentUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.startTrial(env.billingEnvironment),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: subscriptionKeys.me(user?.id, env.billingEnvironment),
      }),
  });
}

// Paid purchase + manage/restore now live in @features/iap (App Store / Google Play).

/** The prices to show: the stores' own once they answer (client 10/14 p.36), else the defaults. */
export function usePlanPrices(): PlanPrices {
  const { catalog } = useStoreReady();
  return useMemo(() => pricesFromStore(catalog?.prices), [catalog]);
}

/**
 * How the paywalls sell (client 10/14 p.32-38):
 *  - `viaStore`: the App Store / Google Play can sell both plans, so the button buys through them and
 *    the 5-day free trial is the stores' own free-trial offer on the Annual plan.
 *  - Otherwise (the products aren't set up in the stores yet, offline, web) the app's own 5-day trial
 *    stands in, so nobody is ever stuck on a paywall that can't take them anywhere.
 * `trialEligible` (p.36): with the stores, only if Apple / Google still offer this account the trial
 * AND this LYSM account never had one; without them, the server's own rule.
 */
export function usePaywallMode(): {
  viaStore: boolean;
  trialEligible: boolean;
  prices: PlanPrices;
} {
  const { ready, catalog } = useStoreReady();
  const storeEligible = useStoreTrialEligible(ready ? catalog : null);
  const { view } = useSubscriptionView();
  const prices = useMemo(() => pricesFromStore(catalog?.prices), [catalog]);
  return {
    viaStore: ready,
    trialEligible: trialOffered({
      viaStore: ready,
      storeEligible,
      accountEligible: view.trialEligible,
    }),
    prices,
  };
}

/** Re-checked at most this often (several app opens in a row are one check). */
const STORE_SYNC_MIN_MS = 60_000;

/**
 * Checks the store subscription with Apple / Google every time the app opens or comes back to the
 * foreground (client 10/14 p.38: "Check the subscription status every time the app opens"), so a
 * renewal, a cancellation that has run out, or a refund shows here. Only for accounts that bought
 * through a store. Mounted once at the app root.
 */
export function useStoreSubscriptionSync(): void {
  const user = useCurrentUser();
  const { data: sub } = useSubscription();
  const qc = useQueryClient();
  const uid = user && !user.is_anonymous ? user.id : null;
  const hasStorePurchase = !!sub?.platform && !!sub.store_transaction_id;
  const lastRun = useRef(0);

  useEffect(() => {
    if (!uid || !hasStorePurchase) return;
    const run = () => {
      if (Date.now() - lastRun.current < STORE_SYNC_MIN_MS) return;
      lastRun.current = Date.now();
      refreshStoreSubscription()
        .then((status) => {
          if (status === 'ok') {
            void qc.invalidateQueries({
              queryKey: subscriptionKeys.me(uid, env.billingEnvironment),
            });
          }
        })
        .catch(() => {
          lastRun.current = 0; // tried again on the next open
        });
    };
    run();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => appState.remove();
  }, [uid, hasStorePurchase, qc]);
}
