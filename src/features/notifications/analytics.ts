/**
 * Notification analytics. Mirrors the onboarding tracker: rides the app's existing
 * observability (logger → Sentry breadcrumbs, sendDefaultPii=false) and sends ONLY
 * non-sensitive, categorical props — never entry text, reflections, or contact data.
 *
 * The re-prompt is a conversion surface, so it needs to be measurable: without these we
 * couldn't tell whether the engagement thresholds are set anywhere near right.
 */
import { logger } from '@lib';

export type NotificationEvent =
  | 'reprompt_shown'
  | 'reprompt_accepted' // tapped "Turn on reminders"
  | 'reprompt_dismissed' // tapped "Not now"
  | 'reprompt_sent_to_settings' // OS refused to ask → deep-linked to system Settings
  | 'reprompt_permission_granted';

type SafeProps = Record<string, string | number | boolean>;

export function trackNotification(event: NotificationEvent, props?: SafeProps): void {
  logger.info('notifications', { event, ...(props ?? {}) });
}
