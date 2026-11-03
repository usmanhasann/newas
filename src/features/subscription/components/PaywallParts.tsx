/**
 * The building blocks both paywalls share (client revisions 10/14 p.32 to p.37): the serif header,
 * the checkmark lines, the stacked plan cards, the trial timeline, and the footer (button, the line
 * under it, and "Restore purchases · Terms · Privacy"). Presentational: the screens own the data,
 * the selected plan and the actions. Every price comes from ../paywallCopy (which reads ./pricing).
 */
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Text } from '@components';
import { colors, spacing } from '@theme';
import { openLegalPage, PRIVACY_POLICY_URL, TERMS_URL } from '@lib/legal';
import { cn } from '@utils/cn';
import { PLAN_PRICING, type PlanId, type PlanPrices } from '../pricing';
import {
  CHOOSE_YOUR_PLAN,
  PLAN_NAME,
  TRIAL_TIMELINE,
  annualCrossedOutLabel,
  annualPerMonthShortLabel,
  balancedTwoLines,
  bestValueTag,
  planPriceLabel,
  planSubline,
} from '../paywallCopy';
import { RestoreLink } from './RestoreLink';

// ---------------------------------------------------------------------------------------------

/**
 * The serif header. `balanced`: always two even lines (p.33) with the name (which starts it) never
 * alone on the first, shrinking to fit a long name rather than wrapping a third line.
 */
export function PaywallHeader({
  text,
  balanced = false,
}: {
  text: string;
  balanced?: boolean;
}) {
  return (
    <Text
      variant="h1"
      accessibilityRole="header"
      accessibilityLabel={text}
      numberOfLines={balanced ? 2 : undefined}
      adjustsFontSizeToFit={balanced}
      maxFontSizeMultiplier={1.2}
      className="mb-5 font-serif-bold text-4xl"
    >
      {balanced ? balancedTwoLines(text, 2) : text}
    </Text>
  );
}

// ---------------------------------------------------------------------------------------------

export function BenefitList({ items }: { items: readonly string[] }) {
  return (
    <View className="mt-5 gap-2.5" accessibilityRole="list">
      {items.map((item) => (
        <View key={item} className="flex-row items-start gap-3">
          <Ionicons
            name="checkmark"
            size={20}
            color={colors.brand[600]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text className="flex-1 text-md leading-snug">{item}</Text>
        </View>
      ))}
    </View>
  );
}

/** "CHOOSE YOUR PLAN" (Welcome back only), in the gray spaced caps of "TODAY’S MOOD". */
export function ChooseYourPlanLabel() {
  return (
    <Text variant="section" accessibilityRole="header" className="mt-8">
      {CHOOSE_YOUR_PLAN}
    </Text>
  );
}

// ---------------------------------------------------------------------------------------------

function Radio({ selected }: { selected: boolean }) {
  return selected ? (
    <View className="h-6 w-6 items-center justify-center rounded-full bg-brand-600">
      <View className="h-2.5 w-2.5 rounded-full bg-surface" />
    </View>
  ) : (
    <View className="h-6 w-6 rounded-full border-2 border-line-strong" />
  );
}

function PlanCard({
  plan,
  selected,
  subline,
  prices,
  onPress,
}: {
  plan: PlanId;
  selected: boolean;
  subline: string | null;
  prices: PlanPrices;
  onPress: () => void;
}) {
  const yearly = plan === 'yearly';
  const price = planPriceLabel(plan, prices);
  const crossed = yearly ? annualCrossedOutLabel(prices) : null;
  const perMonth = yearly ? annualPerMonthShortLabel(prices) : null;
  const tag = yearly ? bestValueTag(prices) : null;
  // The selected card's border is 2px, the other's 1px: the padding makes up the difference so
  // nothing moves when the selection changes.
  const pad = selected
    ? { paddingHorizontal: spacing[5], paddingVertical: spacing[4] }
    : {
        paddingHorizontal: spacing[5] + spacing.px,
        paddingVertical: spacing[4] + spacing.px,
      };
  const a11y = [
    PLAN_NAME[plan],
    subline,
    price,
    crossed ? `was ${crossed}` : null,
    perMonth,
    tag,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, selected }}
      accessibilityLabel={a11y}
      testID={`plan-${plan}`}
    >
      <View
        className={cn(
          'flex-row items-center gap-4 rounded-lg bg-surface',
          selected ? 'border-2 border-brand-600' : 'border border-line-strong',
        )}
        style={pad}
      >
        <Radio selected={selected} />
        <View className="flex-1">
          <Text className="font-sans-bold text-lg leading-snug">{PLAN_NAME[plan]}</Text>
          {subline ? (
            <Text className="text-base leading-snug text-ink-soft">{subline}</Text>
          ) : null}
        </View>
        <View className="items-end">
          <Text className="font-sans-bold text-xl leading-snug">{price}</Text>
          {crossed && perMonth ? (
            <Text className="text-sm leading-snug text-ink-soft">
              <Text className="text-sm leading-snug text-ink-soft line-through">
                {crossed}
              </Text>
              {` · ${perMonth}`}
            </Text>
          ) : null}
        </View>
      </View>
      {tag ? (
        <View className="absolute -top-3 right-4 rounded-full bg-mood-calm-ink px-3 py-1">
          <Text className="font-sans-bold text-sm leading-snug text-ink-inverse">
            {tag}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Annual (on top, selected by default by the screens) and Monthly; tapping a card selects it. */
export function PlanCards({
  plan,
  onChoose,
  sublineStyle,
  trialEligible,
  prices = PLAN_PRICING,
  className,
}: {
  plan: PlanId;
  onChoose: (plan: PlanId) => void;
  sublineStyle: 'trial' | 'billing';
  trialEligible: boolean;
  /** The stores' prices (usePaywallMode / usePlanPrices); the defaults until they answer. */
  prices?: PlanPrices;
  className?: string;
}) {
  return (
    <View className={cn('gap-3', className)} accessibilityRole="radiogroup">
      {(['yearly', 'monthly'] as const).map((id) => (
        <PlanCard
          key={id}
          plan={id}
          selected={plan === id}
          subline={planSubline(id, sublineStyle, trialEligible)}
          prices={prices}
          onPress={() => onChoose(id)}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------

/** Today (Full access), Day 3 (We remind you), Day 5 (Trial ends), in one row on a thin line. */
export function TrialTimeline() {
  const third = `${100 / (TRIAL_TIMELINE.length * 2)}%` as const;
  return (
    <View className="mt-6" testID="trial-timeline">
      {/* The line runs from the first node's centre to the last one's (each column is a third). */}
      <View
        className="absolute h-0.5 bg-brand-200"
        style={{ left: third, right: third, top: (spacing[3] - spacing[0.5]) / 2 }}
      />
      <View className="flex-row">
        {TRIAL_TIMELINE.map((step, i) => (
          <View key={step.title} className="flex-1 items-center">
            <View
              className={cn(
                'h-3 w-3 rounded-full',
                i === 0 ? 'bg-brand-600' : 'border-2 border-brand-600 bg-background',
              )}
            />
            <Text className="mt-2 text-center font-sans-bold text-md leading-snug">
              {step.title}
            </Text>
            <Text className="text-center text-sm leading-snug text-ink-soft">
              {step.caption}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------

function Dot() {
  return <Text className="text-sm text-ink-soft">{' · '}</Text>;
}

/** "Restore purchases · Terms · Privacy": three purple underlined links. */
export function PaywallLinks() {
  return (
    <View className="mt-2 flex-row flex-wrap items-center justify-center">
      <RestoreLink className="text-sm text-brand-600" />
      <Dot />
      <Text
        variant="link"
        accessibilityRole="link"
        onPress={() => void openLegalPage(TERMS_URL)}
        className="text-sm text-brand-600"
      >
        Terms
      </Text>
      <Dot />
      <Text
        variant="link"
        accessibilityRole="link"
        onPress={() => void openLegalPage(PRIVACY_POLICY_URL)}
        className="text-sm text-brand-600"
      >
        Privacy
      </Text>
    </View>
  );
}

/** The bottom of both paywalls: the button with its glow, the line under it, then the links. */
export function PaywallFooter({
  buttonLabel,
  note,
  loading,
  onPress,
  extra,
}: {
  buttonLabel: string;
  note: string;
  loading: boolean;
  onPress: () => void;
  extra?: ReactNode;
}) {
  return (
    <View className="pt-4">
      <Button title={buttonLabel} loading={loading} onPress={onPress} />
      <Text className="mt-3 text-center text-sm leading-snug text-ink-soft">{note}</Text>
      <PaywallLinks />
      {extra}
    </View>
  );
}
