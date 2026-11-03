/**
 * Plan generation (overhaul spec §10/§11). Feels like the app is actively building a
 * personalized plan: the graphic breathes + floats, a real 0→100% progress advances slowly
 * with an updating percentage, and a checklist of plan pieces — derived from the user's own
 * answers — POPS IN and CHECKS OFF one at a time (at a readable pace), so it reads as genuine
 * personalization rather than a generic spinner. The Continue CTA is revealed ONLY at 100%
 * (once the plan has finished assembling). Per the client's screen order this closes the
 * content stretch (#17), so Continue advances to sign-up.
 *
 * §10 guard: plan generation must not start until every required answer exists. Because
 * this step sits after all required questions we normally arrive complete, but we
 * re-assert it here (validate-before-proceeding, §20) and route back if something's
 * missing rather than fabricating a plan from incomplete data.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Button, ProgressBar, Text } from '@components';
import { colors } from '@theme';
import { useReducedMotion } from '@hooks/useReducedMotion';
import { useOnboardingStore } from '@store/onboarding';
import { StepScaffold } from '../../components/StepScaffold';
import { PlanArt } from '../../components/illustrations';
import { PLAN_ANIMATION_MS, shouldSkipPlanAnimation } from '../../constants';
import { requiredAnswersComplete } from '../../flow';
import {
  goalAspiration,
  lifeStageLabel,
  motivationFocus,
  overwhelmPlanLabel,
  reflectionStylePhrase,
  supportPlanLabel,
  triedAppsPlanLabel,
} from '../../copy';
import { trackOnboarding } from '../../analytics';
import type { StepProps } from '../types';

const TICK_MS = 40;

/** Whole years from a 'YYYY-MM-DD' date of birth to today; null if absent/unparseable. */
function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const parts = dob.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  const now = new Date();
  let age = now.getFullYear() - y;
  const beforeBirthday =
    now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function AssemblyRow({
  icon,
  label,
  done,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  done: boolean;
}) {
  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <Ionicons name={icon} size={18} color={done ? colors.brand[500] : colors['ink-faint']} />
      <Text variant="body" className="flex-1" style={{ color: done ? colors.ink : colors['ink-soft'] }}>
        {label}
      </Text>
      <Ionicons
        name={done ? 'checkmark-circle' : 'ellipse-outline'}
        size={20}
        color={done ? colors.brand[500] : colors['ink-faint']}
      />
    </View>
  );
}

export function BuildingStep({ nav }: StepProps) {
  const reduced = useReducedMotion();
  const played = useOnboardingStore((s) => s.planAnimationPlayed);
  const markPlayed = useOnboardingStore((s) => s.markPlanAnimationPlayed);
  const ready = requiredAnswersComplete(nav.data);

  const skip = shouldSkipPlanAnimation(reduced, played);
  const [pct, setPct] = useState(skip ? 100 : 0);
  // Done when skipping (reduced motion / already played) or the counter has filled.
  const done = skip || pct >= 100;

  // The graphic breathes (scale) and gently floats (translateY) so it clearly reads as
  // "working" — reduced-motion → static.
  const scale = useSharedValue(1);
  const lift = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    scale.value = withRepeat(
      withSequence(withTiming(1.06, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1,
      false,
    );
    lift.value = withRepeat(
      withSequence(withTiming(-8, { duration: 900 }), withTiming(0, { duration: 900 })),
      -1,
      false,
    );
  }, [reduced, scale, lift]);
  const artStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: lift.value }],
  }));

  useEffect(() => {
    trackOnboarding('screen_viewed', { screen: 'building' });
  }, []);

  // Advance 0→100 while generating. Completes immediately when skipping (reduced motion
  // or already played this session, so back/forward navigation doesn't replay it).
  useEffect(() => {
    // Nothing to animate when not ready, or when skipping (mark it played once).
    if (!ready || skip) {
      if (skip && !played) {
        markPlayed();
        trackOnboarding('plan_animation_completed');
      }
      return;
    }
    // Fractional step (no rounding up) so the fill genuinely lasts the full PLAN_ANIMATION_MS.
    const step = 100 / (PLAN_ANIMATION_MS / TICK_MS);
    const id = setInterval(() => {
      setPct((p) => {
        const next = Math.min(100, p + step);
        if (next >= 100) {
          clearInterval(id);
          markPlayed();
          trackOnboarding('plan_animation_completed');
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, skip]);

  // §10/§20: never build a plan from incomplete data.
  if (!ready) {
    return (
      <StepScaffold
        canBack={nav.canBack}
        onBack={nav.goBack}
        progress={nav.progress}
        centerContent
        footer={<Button title="Go back" onPress={() => nav.goBack()} />}
      >
        <View className="items-center">
          <Text variant="h2" className="text-center">
            Let’s finish a couple of questions first
          </Text>
          <Text variant="bodyMuted" className="mt-3 text-center">
            We need your answers to build a plan that actually fits you.
          </Text>
        </View>
      </StepScaffold>
    );
  }

  // The plan pieces we "assemble", each derived from the user's OWN answers (no static
  // filler — two people who answered differently see a different plan). Every personal
  // question is represented, including who they turn to and the reflection tone they chose.
  // Each row checks off as the progress bar passes its share of 100%.
  const pieces: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
    { icon: 'compass-outline', label: `Focusing on ${motivationFocus(nav.data.motivation)}` },
    { icon: 'pulse-outline', label: overwhelmPlanLabel(nav.data.frequency) },
    { icon: 'people-outline', label: supportPlanLabel(nav.data.support) },
    { icon: 'flag-outline', label: `Shaping a plan to ${goalAspiration(nav.data.goal)}` },
    {
      icon: 'chatbubble-ellipses-outline',
      label: `Tuning your reflections to sound ${reflectionStylePhrase(nav.data.personal_reflection_style)}`,
    },
    { icon: 'time-outline', label: `Calibrating for ${lifeStageLabel(ageFromDob(nav.data.date_of_birth))}` },
    { icon: 'phone-portrait-outline', label: triedAppsPlanLabel(nav.data.tried_other_apps) },
  ];

  return (
    <StepScaffold
      canBack={nav.canBack}
      onBack={nav.goBack}
      progress={nav.progress}
      scroll
      footer={done ? <Button title="Continue" loading={nav.saving} onPress={() => nav.goNext()} /> : undefined}
    >
      <View className="items-center">
        <Animated.View style={artStyle}>
          <PlanArt size={168} />
        </Animated.View>
        <Text
          variant="h2"
          numberOfLines={done ? 1 : 2}
          adjustsFontSizeToFit
          className="mt-5 w-full text-center"
        >
          {done ? 'You’re all set' : 'Personalizing LYSM for you…'}
        </Text>

        <View className="mt-6 w-full">
          <ProgressBar step={pct} total={100} showLabel={false} />
          <Text variant="h3" className="mt-2 text-center" accessibilityLabel={`${Math.round(pct)} percent`}>
            {Math.round(pct)}%
          </Text>
        </View>

        <View className="mt-6 w-full gap-2.5">
          {pieces.map((p, i) => {
            // Each piece POPS IN at the start of its slot, then checks off partway through —
            // one at a time — so the plan visibly assembles at a pace the user can read.
            const slot = 100 / pieces.length;
            const appearAt = i * slot;
            if (pct < appearAt) return null;
            return (
              <Animated.View
                key={p.label}
                entering={reduced ? undefined : FadeInDown.duration(320)}
              >
                <AssemblyRow icon={p.icon} label={p.label} done={pct >= appearAt + slot * 0.6} />
              </Animated.View>
            );
          })}
        </View>
      </View>
    </StepScaffold>
  );
}
