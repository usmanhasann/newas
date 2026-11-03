/**
 * The main paywall, the last onboarding decision (client revisions 10/14 p.32 to p.36, N15). One
 * screen for both plans (it replaces the Annual / Monthly toggle screens): the full progress bar,
 * "[First name], your reflection is waiting" on two even lines, their first reflection in the purple
 * card (first sentence readable, the rest blurred, "Start your trial to read the rest"), three
 * checkmark lines, the Annual (selected by default) and Monthly cards, the trial timeline, and the
 * button with "No charge today. Cancel anytime." and "Restore purchases · Terms · Privacy".
 *
 * Monthly: "Start monthly plan", "Cancel anytime.", no timeline. Trial already used: "Start annual
 * plan", "Cancel anytime.", no "5-day free trial" line and no timeline. No back control (the mock
 * has none; this step never had one).
 *
 * Selling (p.36, usePaywallMode): through the App Store / Google Play whenever they can sell both
 * plans, prices included; the free trial is then the stores' own free-trial offer on Annual, and
 * Apple / Google decide whether this account can still have it. Until the stores can sell (products
 * not set up yet, offline) the app's own 5-day trial stands in, so nobody is ever stuck here.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Button, Text } from '@components';
import { toast } from '@store/toast';
import { firstName } from '@utils/name';
import { useProfile } from '@features/profile';
import {
  useStartTrial,
  usePaywallMode,
  DEFAULT_PLAN,
  FirstReflectionCard,
  PaywallHeader,
  BenefitList,
  PlanCards,
  TrialTimeline,
  PaywallFooter,
  MAIN_BENEFITS,
  mainPaywallHeader,
  paywallButtonLabel,
  paywallButtonNote,
  startsTrial,
  type PlanId,
} from '@features/subscription';
import { usePurchase, purchaseProblemMessage, type PurchaseOutcome } from '@features/iap';
import { StepScaffold } from '../../components/StepScaffold';
import { trackOnboarding } from '../../analytics';
import type { StepProps } from '../types';

export function TrialStep({ nav }: StepProps) {
  const [plan, setPlan] = useState<PlanId>(nav.data.selected_plan ?? DEFAULT_PLAN);
  const trial = useStartTrial();
  const purchase = usePurchase();
  const { data: profile } = useProfile();
  const { view } = nav;
  const { viaStore, trialEligible, prices } = usePaywallMode();

  useEffect(() => {
    trackOnboarding('screen_viewed', { screen: 'trial' });
    trackOnboarding('trial_paywall_viewed');
  }, []);

  // Tapping a card selects it (the selection survives a reflection retry: it lives here).
  const choosePlan = (p: PlanId) => {
    setPlan(p);
    nav.patchLocal({ selected_plan: p });
    trackOnboarding('plan_selected', { plan: p });
  };

  /** A store purchase finished: on to the confirmation (which waits for the server's entitlement). */
  const afterStorePurchase = async (
    outcome: PurchaseOutcome,
    event: 'trial_activated' | 'subscribed',
  ) => {
    if (outcome.status === 'purchased' || outcome.status === 'restored') {
      trackOnboarding(event, { plan });
      await nav.goNext({ selected_plan: plan });
    } else if (outcome.status === 'pending') {
      toast.info(
        'Your purchase is waiting for approval. You’ll get full access as soon as it’s approved.',
      );
    }
    // canceled: they closed the store's sheet; stay here.
  };

  const showProblem = (e: unknown) => {
    const message = purchaseProblemMessage(e, Platform.OS);
    if (message) toast.error(message);
  };

  const onStartTrial = async () => {
    if (trial.isPending || purchase.isPending) return; // no duplicate requests
    trackOnboarding('trial_start_attempted', { plan });
    try {
      await nav.persist({ selected_plan: plan });
      if (viaStore) {
        // The stores' own free trial on the Annual plan.
        await afterStorePurchase(
          await purchase.mutateAsync({ plan: 'yearly', withTrial: true }),
          'trial_activated',
        );
        return;
      }
      await trial.mutateAsync(); // the app's own trial (stores can't sell yet): idempotent
      trackOnboarding('trial_activated', { plan });
      await nav.goNext({ selected_plan: plan });
    } catch (e) {
      trackOnboarding('trial_activation_failed');
      if (viaStore) showProblem(e);
      else toast.error('We couldn’t start your trial. Please try again.');
    }
  };

  const onSubscribe = async () => {
    if (purchase.isPending) return;
    if (!viaStore) {
      toast.info('Purchases aren’t available right now. Please try again later.');
      return;
    }
    try {
      await nav.persist({ selected_plan: plan });
      await afterStorePurchase(
        await purchase.mutateAsync({ plan, withTrial: false }),
        'subscribed',
      );
    } catch (e) {
      showProblem(e);
    }
  };

  // Already entitled → continue; Annual while still eligible → the free trial; otherwise (Monthly,
  // or the trial was already used) → the paid plan.
  const withTrial = startsTrial(plan, trialEligible);
  const mode: 'continue' | 'trial' | 'subscribe' = view.hasAccess
    ? 'continue'
    : withTrial
      ? 'trial'
      : 'subscribe';

  if (mode === 'continue') {
    return (
      <StepScaffold
        canBack={nav.canBack}
        onBack={nav.goBack}
        progress={nav.progress}
        title="You already have access"
        footer={
          <Button title="Continue" onPress={() => nav.goNext({ selected_plan: plan })} />
        }
      >
        <Text variant="bodyMuted">
          Your subscription is active. Let’s finish setting up.
        </Text>
      </StepScaffold>
    );
  }

  return (
    <StepScaffold
      canBack={nav.canBack}
      onBack={nav.goBack}
      progress={nav.progress}
      scroll
      footer={
        <PaywallFooter
          buttonLabel={paywallButtonLabel(plan, trialEligible)}
          note={paywallButtonNote(plan, trialEligible)}
          loading={trial.isPending || purchase.isPending}
          onPress={mode === 'trial' ? onStartTrial : onSubscribe}
        />
      }
    >
      <PaywallHeader
        balanced
        text={mainPaywallHeader(firstName(profile?.display_name))}
      />
      <FirstReflectionCard entryId={nav.data.first_entry_id} />
      <BenefitList items={MAIN_BENEFITS} />
      <PlanCards
        plan={plan}
        onChoose={choosePlan}
        sublineStyle="trial"
        trialEligible={trialEligible}
        prices={prices}
        className="mt-6"
      />
      {withTrial ? <TrialTimeline /> : null}
    </StepScaffold>
  );
}
