/**
 * Onboarding analytics. Reuses the app's existing observability (logger → Sentry
 * breadcrumbs, which run with sendDefaultPii=false). We deliberately send ONLY
 * non-sensitive, categorical/structural props (which screen, plan, permission
 * status, step index). We never send mood text, the AI reflection, contact data,
 * or the user's personal/emotional quiz answers.
 */
import { logger } from '@lib';

export type OnboardingEvent =
  | 'onboarding_started'
  | 'screen_viewed'
  | 'birthday_set'
  | 'tried_apps_answered'
  | 'quiz_answer_selected'
  | 'quiz_completed'
  | 'reflect_back_viewed'
  | 'plan_animation_completed'
  | 'first_checkin_completed'
  | 'first_checkin_skipped'
  | 'ai_reflection_generated'
  | 'ai_reflection_failed'
  | 'insights_preview_viewed'
  | 'auth_completed'
  | 'reminder_enabled'
  | 'reminder_skipped'
  | 'reminder_denied'
  | 'trial_paywall_viewed'
  | 'plan_selected'
  | 'trial_start_attempted'
  | 'trial_activated'
  | 'trial_activation_failed'
  | 'subscribed'
  | 'onboarding_completed'
  | 'onboarding_abandoned';

type SafeProps = Record<string, string | number | boolean>;

export function trackOnboarding(event: OnboardingEvent, props?: SafeProps): void {
  logger.info('onboarding', { event, ...(props ?? {}) });
}
