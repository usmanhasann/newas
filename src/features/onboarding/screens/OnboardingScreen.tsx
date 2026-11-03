/**
 * Onboarding flow container. Renders one step at a time from a single linear machine
 * (see flow.ts), hydrating working state from the backend on entry so an interrupted
 * flow resumes where it left off. The store is reset on exit so a different user never
 * inherits the previous user's answers.
 */
import { useEffect } from 'react';
import { LoadingScreen } from '@components';
import { CrisisDisclaimer } from '@features/crisis';
import { useOnboardingStore } from '@store/onboarding';
import { useOnboarding } from '../hooks';
import { MOTIVATIONS, FREQUENCIES, SUPPORTS, GOALS, REFLECTION_STYLES } from '../constants';
import { trackOnboarding } from '../analytics';
import { WelcomeStep } from './steps/WelcomeStep';
import { BirthdayStep } from './steps/BirthdayStep';
import { CirclesPrivacyStep } from './steps/CirclesPrivacyStep';
import { QuizStep } from './steps/QuizStep';
import { ValueGraphStep } from './steps/ValueGraphStep';
import { NotificationsStep } from './steps/NotificationsStep';
import { ReflectStep } from './steps/ReflectStep';
import { BuildingStep } from './steps/BuildingStep';
import { ShiftStep } from './steps/ShiftStep';
import { FirstCheckinStep } from './steps/FirstCheckinStep';
import { AuthStep } from './steps/AuthStep';
import { TrialStep } from './steps/TrialStep';
import { ConfirmStep } from './steps/ConfirmStep';

export function OnboardingScreen() {
  const nav = useOnboarding();
  const reset = useOnboardingStore((s) => s.reset);

  // On leaving onboarding: flag abandonment only if the user actually STARTED onboarding
  // (status 'in_progress') but didn't finish. An existing user who tapped "Sign In" from
  // Welcome never started ('status' unset), so tearing this navigator down on their sign-in
  // must NOT pollute the abandonment funnel. Then reset so the next user hydrates fresh.
  useEffect(() => {
    return () => {
      if (useOnboardingStore.getState().data.status === 'in_progress') {
        trackOnboarding('onboarding_abandoned');
      }
      reset();
    };
  }, [reset]);

  if (!nav.hydrated) return <LoadingScreen />;

  // The five QuizStep question screens share ONE component, so between two consecutive
  // quiz steps React reuses the instance and preserves its local state — the previous
  // question's selection leaks in, leaving Continue enabled (not darkened until an answer
  // is picked) and 'screen_viewed' not re-firing. A distinct `key` per quiz screen forces
  // a fresh remount. (Non-quiz steps are different component types, so they already remount.)
  switch (nav.step) {
    case 'welcome':
      return <WelcomeStep nav={nav} />;
    case 'birthday':
      return <BirthdayStep nav={nav} />;
    case 'valueGraph':
      return <ValueGraphStep nav={nav} />;
    case 'motivation':
      return (
        <QuizStep
          key="motivation"
          nav={nav}
          screen="motivation"
          title="What brought you here today?"
          subtitle="Pick up to two."
          options={MOTIVATIONS}
          valueKey="motivation"
          multi
        />
      );
    case 'frequency':
      return (
        <QuizStep
          key="frequency"
          nav={nav}
          screen="frequency"
          title="How often do you feel overwhelmed?"
          options={FREQUENCIES}
          valueKey="frequency"
          disclaimer={<CrisisDisclaimer />}
        />
      );
    case 'support':
      return (
        <QuizStep
          key="support"
          nav={nav}
          screen="support"
          title="When things get hard, who do you turn to?"
          subtitle="Pick up to two."
          options={SUPPORTS}
          valueKey="support"
          multi
        />
      );
    case 'goal':
      return (
        <QuizStep
          key="goal"
          nav={nav}
          screen="goal"
          title="What would feel like a win a month from now?"
          subtitle="Pick up to two."
          options={GOALS}
          valueKey="goal"
          multi
        />
      );
    case 'reflectionStyle':
      return (
        <QuizStep
          key="reflectionStyle"
          nav={nav}
          screen="reflectionStyle"
          title="How should your reflections sound?"
          subtitle="Pick up to two and we’ll blend them into the voice LYSM uses for your reflections and AI insights. You can change this anytime in your profile."
          options={REFLECTION_STYLES}
          valueKey="personal_reflection_style"
          multi
          defaultValues={['gentle']}
        />
      );
    case 'notifications':
      return <NotificationsStep nav={nav} />;
    case 'reflect':
      return <ReflectStep nav={nav} />;
    case 'building':
      return <BuildingStep nav={nav} />;
    case 'shift':
      return <ShiftStep nav={nav} />;
    case 'circlesPrivacy':
      return <CirclesPrivacyStep nav={nav} />;
    case 'firstCheckin':
      return <FirstCheckinStep nav={nav} />;
    case 'auth':
      return <AuthStep nav={nav} />;
    case 'trial':
      return <TrialStep nav={nav} />;
    case 'confirm':
      return <ConfirmStep nav={nav} />;
    default:
      return <WelcomeStep nav={nav} />;
  }
}
