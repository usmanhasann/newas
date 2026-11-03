/**
 * IAP hooks (client revisions 10/14 p.32-38). Buying and restoring go through the IapService; the
 * entitlement itself is the server's subscriptions row, refreshed afterwards (the 'subscription'
 * queries). Prices and the free-trial offer come from the stores (useStoreCatalog).
 */
import { useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@store/session';
import { getIapService } from './service';
import { isCatalogReady, type StoreCatalog } from './storeCatalog';
import { IapError, type PlanId, type PurchaseOutcome } from './types';

export const iapKeys = {
  catalog: ['iap', 'catalog'] as const,
  trialEligible: (groupOrPlatform: string | null) =>
    ['iap', 'trialEligible', groupOrPlatform] as const,
};

/** The store's prices and offers for our plans (null: not on this platform, or unreachable). */
export function useStoreCatalog() {
  const supported = getIapService().isSupported();
  return useQuery({
    queryKey: iapKeys.catalog,
    queryFn: () => getIapService().getCatalog(),
    enabled: supported,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Whether the stores can sell our plans right now: both products came back priced. Until then (no
 * products set up in the store yet, offline, or web) the app keeps its own free trial, so a person
 * is never stuck on a paywall that can't take them anywhere.
 */
export function useStoreReady(): {
  ready: boolean;
  catalog: StoreCatalog | null;
  loading: boolean;
} {
  const q = useStoreCatalog();
  const catalog = q.data ?? null;
  return { ready: isCatalogReady(catalog), catalog, loading: q.isLoading };
}

/**
 * Whether this person's Apple ID / Google account can still have the Annual plan's free trial
 * (client p.36: "Apple and Google only give each account one free trial"). null while unknown.
 */
export function useStoreTrialEligible(catalog: StoreCatalog | null): boolean | null {
  const key = catalog ? (catalog.iosGroupId ?? catalog.platform) : null;
  const q = useQuery({
    queryKey: iapKeys.trialEligible(key),
    queryFn: () => getIapService().isTrialEligible(catalog!),
    enabled: !!catalog && isCatalogReady(catalog),
    staleTime: 5 * 60 * 1000,
  });
  return q.data ?? null;
}

function useAfterStoreChange() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['subscription'] });
    void qc.invalidateQueries({ queryKey: ['iap', 'trialEligible'] });
  };
}

/** Buy a plan (the Annual one with its free trial when `withTrial`). */
export function usePurchase() {
  const user = useCurrentUser();
  const after = useAfterStoreChange();
  return useMutation<PurchaseOutcome, unknown, { plan: PlanId; withTrial: boolean }>({
    mutationFn: ({ plan, withTrial }) => {
      if (!user?.id) throw new IapError('unavailable', 'Sign in first.');
      return getIapService().purchase(plan, { userId: user.id, withTrial });
    },
    onSettled: after,
  });
}

export function useRestorePurchases() {
  const user = useCurrentUser();
  const after = useAfterStoreChange();
  return useMutation<PurchaseOutcome, unknown, void>({
    mutationFn: () => {
      if (!user?.id) throw new IapError('unavailable', 'Sign in first.');
      return getIapService().restorePurchases(user.id);
    },
    onSettled: after,
  });
}

/**
 * Finishes purchases that complete outside a purchase call (iOS replays unfinished ones at launch;
 * Android ones must be acknowledged within 3 days). Mounted once at the app root.
 */
export function useStorePurchaseListener(): void {
  const user = useCurrentUser();
  const after = useAfterStoreChange();
  const uid = user && !user.is_anonymous ? user.id : null;
  useEffect(() => {
    if (!uid) return;
    return getIapService().start(uid, after);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per signed-in account
  }, [uid]);
}

/**
 * Open the store's own subscription settings (App Store / Google Play), where the plan can be
 * changed or canceled (client FAQ: "Profile → Subscription opens your App Store or Google Play
 * settings").
 */
export function useManageSubscription() {
  return useMutation<void, unknown, PlanId | null | void>({
    mutationFn: async (plan) => {
      try {
        if (getIapService().isSupported()) {
          await getIapService().manage(plan ?? null);
          return;
        }
      } catch {
        // fall through to the store's web page
      }
      const url =
        Platform.OS === 'ios'
          ? 'itms-apps://apps.apple.com/account/subscriptions'
          : 'https://play.google.com/store/account/subscriptions';
      await Linking.openURL(url);
    },
  });
}
