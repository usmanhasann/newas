/**
 * The "Welcome back" paywall (client revisions 10/14 p.37 to p.38, N16): where a returning user
 * without an active subscription lands every time they open the app (the route gate sends every
 * signed-in, onboarded user without access here; a canceled plan keeps access until its paid
 * period ends). Same layout as the main paywall, without the progress bar: "[First name], welcome
 * back", their last entry in the purple card (hidden when they have none), three checkmark lines,
 * "CHOOSE YOUR PLAN", the two plan cards with "Billed yearly" / "Billed monthly", and "Start annual
 * plan" (or "Start monthly plan") with "Cancel anytime." under it. If they can still have the free
 * trial, the trial version of the button, card lines and timeline shows instead.
 *
 * Kept from before (decision N15.98: each paywall keeps its current way out): "Log out" under the
 * links, and the development-only bypass.
 */
import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { Button, Screen, Text } from '@components';
import { spacing } from '@theme';
import { useDevFlags, IS_DEV } from '@store/devFlags';
import { toast } from '@store/toast';
import { firstName } from '@utils/name';
import { useSignOut } from '@features/auth';
import { useProfile } from '@features/profile';
import { useJournalStats } from '@features/insights';
import { usePurchase, purchaseProblemMessage } from '@features/iap';
import { usePaywallMode, useStartTrial } from '../hooks';
import { DEFAULT_PLAN, type PlanId } from '../pricing';
import {
  paywallButtonLabel,
  paywallButtonNote,
  startsTrial,
  welcomeBackBenefits,
  welcomeBackHeader,
} from '../paywallCopy';
import { LastEntryCard } from '../components/LastEntryCard';
import {
  BenefitList,
  ChooseYourPlanLabel,
  PaywallFooter,
  PaywallHeader,
  PlanCards,
  TrialTimeline,
} from '../components/PaywallParts';

export function PaywallScreen() {
  const [plan, setPlan] = useState<PlanId>(DEFAULT_PLAN);
  const setBypass = useDevFlags((s) => s.setBypassGate);
  const signOut = useSignOut();
  const purchase = usePurchase();
  const trial = useStartTrial();
  const { data: profile } = useProfile();
  const stats = useJournalStats();
  // Through the stores whenever they can sell (their prices, their free trial and its eligibility,
  // p.36-37); the app's own trial only until then (usePaywallMode).
  const { viaStore, trialEligible: eligible, prices } = usePaywallMode();
  const withTrial = startsTrial(plan, eligible);
  // The entry count line waits for the count, so it never flips from one wording to another.
  const statsKnown = stats.data !== undefined || stats.isError;

  const buy = async (withStoreTrial: boolean) => {
    if (purchase.isPending) return;
    try {
      const outcome = await purchase.mutateAsync({
        plan: withStoreTrial ? 'yearly' : plan,
        withTrial: withStoreTrial,
      });
      // purchased / restored: the route gate opens the app once the server's entitlement lands.
      if (outcome.status === 'pending') {
        toast.info(
          'Your purchase is waiting for approval. You’ll get full access as soon as it’s approved.',
        );
      }
    } catch (e) {
      const message = purchaseProblemMessage(e, Platform.OS);
      if (message) toast.error(message);
    }
  };

  const onSubscribe = () => {
    if (!viaStore) {
      toast.info('Purchases aren’t available right now. Please try again later.');
      return;
    }
    void buy(false);
  };

  const onStartTrial = () => {
    if (viaStore) {
      void buy(true);
      return;
    }
    if (trial.isPending) return;
    trial.mutate(undefined, {
      onError: () => toast.error('We couldn’t start your trial. Please try again.'),
    });
  };

  return (
    <Screen contentClassName="py-4">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: spacing[6], paddingBottom: spacing[4] }}
      >
        <PaywallHeader text={welcomeBackHeader(firstName(profile?.display_name))} />
        <LastEntryCard />
        {statsKnown ? (
          <BenefitList items={welcomeBackBenefits(stats.data?.entries_count)} />
        ) : null}
        <ChooseYourPlanLabel />
        <PlanCards
          plan={plan}
          onChoose={setPlan}
          sublineStyle="billing"
          trialEligible={eligible}
          prices={prices}
          className="mt-6"
        />
        {withTrial ? <TrialTimeline /> : null}
      </ScrollView>

      <PaywallFooter
        buttonLabel={paywallButtonLabel(plan, eligible)}
        note={paywallButtonNote(plan, eligible)}
        loading={trial.isPending || purchase.isPending}
        onPress={withTrial ? onStartTrial : onSubscribe}
        extra={
          <View className="mt-3 items-center gap-2">
            {IS_DEV ? (
              <Button
                title="Continue without subscribing (dev)"
                variant="ghost"
                size="sm"
                onPress={() => setBypass(true)}
              />
            ) : null}
            <Text
              variant="link"
              accessibilityRole="button"
              onPress={() => signOut.mutate()}
              className="text-sm text-ink-soft"
            >
              Log out
            </Text>
          </View>
        }
      />
    </Screen>
  );
}
