import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@store/session';
import { useOnboardingStore } from '@store/onboarding';
import { useProfile, profileKeys } from '@features/profile';
import {
  useSubscriptionView,
  priceWithPeriod,
  usePlanPrices,
  type PlanId,
  type SubscriptionView,
} from '@features/subscription';
import {
  scheduleOneOff,
  cancelScheduled,
  getNotificationPermission,
  canDeliver,
  TRIAL_REMINDER_ID,
} from '@features/notifications';
import { logger } from '@lib';
import { saveOnboarding, readOnboarding } from './api';
import {
  buildSteps,
  nextStep,
  prevStep,
  progressFor,
  canGoBack,
  restoreStep,
  type StepId,
} from './flow';
import { trialReminderMessage, trialReminderFireAt } from './copy';
import type { OnboardingData } from './types';

/** Everything a step screen needs to read answers, persist them, and navigate. */
export interface OnboardingNav {
  hydrated: boolean;
  data: OnboardingData;
  step: StepId;
  steps: StepId[];
  progress: { index: number; total: number } | null;
  canBack: boolean;
  saving: boolean;
  view: SubscriptionView;
  /** Update local working state immediately (no network). */
  patchLocal: (patch: OnboardingData) => void;
  /** Persist a patch to the backend (atomic merge) + local state. */
  persist: (patch: OnboardingData) => Promise<void>;
  /** Persist `extra` + advance to the next step. */
  goNext: (extra?: OnboardingData) => Promise<void>;
  /** Go to the previous step (best-effort persists the step for resume). */
  goBack: () => void;
}

export function useOnboarding(): OnboardingNav {
  const qc = useQueryClient();
  const user = useCurrentUser();
  const profileQ = useProfile();
  const { view } = useSubscriptionView();
  const store = useOnboardingStore();
  // One linear flow for every auth method — the email code is shown inside the auth step (it
  // blocks there until verified), so the step list is constant.
  const steps = useMemo(() => buildSteps(), []);

  // Hydrate once from the backend (resume where the user left off). restoreStep clamps the
  // saved step to a safe one — notably the post-payment steps (confirm + the closing
  // notification ask) fall back to the paywall until access is server-confirmed.
  useEffect(() => {
    if (!store.hydrated && profileQ.data) {
      const data = readOnboarding(profileQ.data);
      store.hydrate(data, restoreStep(data.step, buildSteps(), view.hasAccess));
    }
  }, [profileQ.data, store, view.hasAccess]);

  const saveMut = useMutation({
    mutationFn: (patch: OnboardingData) => saveOnboarding(patch),
    onSuccess: (profile) => qc.setQueryData(profileKeys.me(user?.id), profile),
  });

  const persist = useCallback(
    async (patch: OnboardingData) => {
      store.patch(patch);
      await saveMut.mutateAsync(patch);
    },
    [store, saveMut],
  );

  const goNext = useCallback(
    async (extra?: OnboardingData) => {
      const n = nextStep(store.step, buildSteps());
      await persist({
        ...(extra ?? {}),
        status: 'in_progress',
        ...(n ? { step: n } : {}),
      });
      if (n) store.setStep(n);
    },
    [store, persist],
  );

  const goBack = useCallback(() => {
    const p = prevStep(store.step, steps);
    if (!p) return;
    store.setStep(p);
    // Best-effort: record the step for resume (answers are already persisted).
    saveMut.mutate(
      { step: p },
      {
        onError: (e) =>
          logger.warn('onboarding step persist failed', { error: String(e) }),
      },
    );
  }, [store, steps, saveMut]);

  return {
    hydrated: store.hydrated,
    data: store.data,
    step: store.step,
    steps,
    progress: progressFor(store.step, steps),
    canBack: canGoBack(store.step),
    saving: saveMut.isPending,
    view,
    patchLocal: store.patch,
    persist,
    goNext,
    goBack,
  };
}

function formatRenewalDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

/**
 * Keeps the trial reminder (2 days before the end) in sync with the SERVER-confirmed trial state.
 * Idempotent: only (re)schedules when the trial end/plan changes; cancels the reminder as soon as
 * the trial is no longer active (converted, canceled, expired). While notifications aren't allowed
 * it waits, and tries again whenever the app returns to the foreground, so a reminder turned on
 * later (in the app or in the phone's Settings) still gets the promised reminder. Mounted once near
 * the app root. Trial validity never depends on this.
 */
export function useTrialReminderSync(): void {
  const { view } = useSubscriptionView();
  const { data: profile } = useProfile();
  const lastSig = useRef<string | null>(null);

  const plan: PlanId =
    (readOnboarding(profile).selected_plan as PlanId | undefined) ??
    (view.plan as PlanId | null) ??
    'yearly';

  const trialing = view.isTrialing && !!view.trialEndsAt;
  const endsAt = view.trialEndsAt;
  // The renewal price in the reminder is the store's own (client 10/14 p.36).
  const prices = usePlanPrices();
  // Each run reads the latest state when it starts (a foreground retry never uses an old one). Kept
  // current by the first effect below, which React runs before the sync effect after it.
  const wanted = useRef({ trialing, endsAt, plan, prices });

  const sync = useCallback(async () => {
    const { trialing: on, endsAt: end, plan: chosen, prices: shown } = wanted.current;
    const price = priceWithPeriod(chosen, shown);
    const sig = on && end ? `${end}|${chosen}|${price}` : 'none';
    if (lastSig.current === sig) return;
    try {
      if (!on || !end) {
        await cancelScheduled(TRIAL_REMINDER_ID);
        lastSig.current = sig;
        return;
      }
      const perm = await getNotificationPermission();
      if (!canDeliver(perm)) return; // not allowed yet: tried again on the next foreground
      const fireAt = new Date(trialReminderFireAt(new Date(end).getTime()));
      const { title, body } = trialReminderMessage({
        priceLabel: price,
        renewalDateLabel: formatRenewalDate(end),
      });
      await scheduleOneOff(TRIAL_REMINDER_ID, fireAt, { title, body });
      lastSig.current = sig;
    } catch (e) {
      logger.warn('trial reminder sync failed', { error: String(e) });
    }
  }, []);

  useEffect(() => {
    wanted.current = { trialing, endsAt, plan, prices };
  }, [trialing, endsAt, plan, prices]);

  useEffect(() => {
    void sync();
  }, [sync, trialing, endsAt, plan, prices]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => subscription.remove();
  }, [sync]);
}
