/**
 * Confirmation (overhaul spec §15) — CONDITIONAL on the transaction result. Shown once
 * the backend confirms access:
 *  • Yearly free trial → trial-started confirmation (5 days, when billing begins).
 *  • Monthly paid       → active-subscription confirmation, with NO trial wording.
 * "Begin" marks onboarding complete + saves the timestamp; the gate then routes to the
 * app. No back to the paywall. A completion failure shows a retry rather than losing data.
 */
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Text } from '@components';
import { colors } from '@theme';
import { toast } from '@store/toast';
import {
  useSubscriptionView,
  usePlanPrices,
  priceWithPeriod,
  TRIAL_DAYS,
  type PlanId,
} from '@features/subscription';
import { StepScaffold } from '../../components/StepScaffold';
import { AllSetCheck } from '../../components/AllSetCheck';
import { trackOnboarding } from '../../analytics';
import type { StepProps } from '../types';

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

export function ConfirmStep({ nav }: StepProps) {
  const sub = useSubscriptionView();
  const { view } = sub;
  const hasAccess = view.hasAccess;
  const isTrial = view.isTrialing;
  const plan = (view.plan ?? nav.data.selected_plan ?? 'yearly') as PlanId;
  const prices = usePlanPrices();

  useEffect(() => {
    trackOnboarding('screen_viewed', { screen: 'confirm' });
  }, []);

  const onBegin = async () => {
    try {
      // Advance to the FINAL step (the notification ask) — onboarding is completed there now.
      await nav.goNext({ selected_plan: plan });
    } catch {
      toast.error('We couldn’t continue. Please try again.');
    }
  };

  if (!hasAccess) {
    return (
      <StepScaffold centerContent>
        <View className="items-center">
          <ActivityIndicator color={colors.brand[500]} />
          <Text variant="h2" className="mt-4 text-center">
            Confirming your subscription…
          </Text>
          <Text variant="bodyMuted" className="mt-2 text-center">
            This only takes a moment.
          </Text>
          <Button
            title="Check again"
            variant="ghost"
            className="mt-6"
            loading={sub.isFetching}
            onPress={() => sub.refetch()}
          />
        </View>
      </StepScaffold>
    );
  }

  const trialEnds = formatDate(view.trialEndsAt);

  return (
    <StepScaffold
      centerContent
      footer={<Button title="Continue" loading={nav.saving} onPress={onBegin} />}
    >
      <View className="items-center">
        {/* Solid purple circle + white check that pops in and draws itself once (client 10/14 p.11),
            with a generous gap above the headline. */}
        <AllSetCheck />
        <Text
          variant="h1"
          numberOfLines={1}
          adjustsFontSizeToFit
          className="mt-20 w-full text-center"
        >
          You’re all set.
        </Text>

        {isTrial ? (
          <Text variant="bodyMuted" className="mt-3 text-center">
            Your {TRIAL_DAYS}-day free trial is active
            {trialEnds ? ` until ${trialEnds}` : ''}. We’ll send a friendly reminder
            before it ends, then it renews at {priceWithPeriod(plan, prices)}. No
            surprises.
          </Text>
        ) : (
          <Text variant="bodyMuted" className="mt-3 text-center">
            Thanks for subscribing! Your {priceWithPeriod(plan, prices)} plan is active
            now. You can manage or cancel anytime in Settings.
          </Text>
        )}
      </View>
    </StepScaffold>
  );
}
