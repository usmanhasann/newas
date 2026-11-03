/**
 * Local (on-device) reminder scheduling via expo-notifications — the app's existing
 * supported notification mechanism. Used for the daily check-in (one per day, each carrying that
 * day's rotating prompt) and the trial reminder. All scheduling is IDEMPOTENT: each reminder has a stable
 * identifier and we cancel-then-(re)schedule, so repeated calls never create
 * duplicates and always UPDATE the existing reminder instead.
 *
 * Trial validity NEVER depends on a reminder being delivered — these are best-effort
 * nudges; access is derived from the subscriptions row (server timestamps).
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { logger } from '@lib';
import { DAILY_CHECKIN_ID } from './reminderIds';

export { DAILY_CHECKIN_ID, TRIAL_REMINDER_ID } from './reminderIds';

export type NotificationPermissionState =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'provisional'
  | 'unavailable';

function isSchedulable(): boolean {
  return Device.isDevice && Platform.OS !== 'web';
}

function mapPermission(
  p: Notifications.NotificationPermissionsStatus,
): NotificationPermissionState {
  if (p.granted) return 'granted';
  const iosStatus = p.ios?.status;
  if (iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL)
    return 'provisional';
  if (p.status === 'undetermined' || p.canAskAgain) return 'undetermined';
  return 'denied';
}

/** Read the current notification permission state (never throws). */
export async function getNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isSchedulable()) return 'unavailable';
  try {
    return mapPermission(await Notifications.getPermissionsAsync());
  } catch (e) {
    logger.warn('getNotificationPermission failed', { error: String(e) });
    return 'unavailable';
  }
}

/** Request notification permission, returning the resulting state (never throws). */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isSchedulable()) return 'unavailable';
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    return mapPermission(await Notifications.requestPermissionsAsync());
  } catch (e) {
    logger.warn('requestNotificationPermission failed', { error: String(e) });
    return 'unavailable';
  }
}

/** True when this permission state allows delivering scheduled notifications. */
export function canDeliver(state: NotificationPermissionState): boolean {
  return state === 'granted' || state === 'provisional';
}

export async function cancelScheduled(identifier: string): Promise<void> {
  if (!isSchedulable()) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // not scheduled / nothing to cancel — fine
  }
}

/** The daily check-in's title — unchanged. Its body is that day's rotating prompt. */
export const DAILY_CHECKIN_TITLE = 'Your daily check-in';

/** One scheduled check-in: when it fires, and the prompt it carries. `key` makes its id stable. */
export interface DailyCheckIn {
  key: string;
  at: Date;
  body: string;
}

function isDailyCheckInId(identifier: string): boolean {
  // Also matches the single repeating reminder older app versions scheduled ('ic-daily-checkin').
  return identifier === DAILY_CHECKIN_ID || identifier.startsWith(`${DAILY_CHECKIN_ID}-`);
}

/** Cancel every scheduled daily check-in (including the old repeating one). */
export async function cancelDailyCheckIns(): Promise<void> {
  if (!isSchedulable()) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => isDailyCheckInId(n.identifier))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch (e) {
    logger.warn('cancelDailyCheckIns failed', { error: String(e) });
  }
}

/**
 * Replace every scheduled daily check-in with `items`: one notification per day, each carrying
 * that day's prompt. Times already past are skipped. Returns how many were scheduled.
 */
export async function scheduleDailyCheckIns(items: DailyCheckIn[]): Promise<number> {
  if (!isSchedulable()) return 0;
  await cancelDailyCheckIns();
  const now = Date.now();
  let scheduled = 0;
  for (const item of items) {
    if (item.at.getTime() <= now) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `${DAILY_CHECKIN_ID}-${item.key}`,
        content: { title: DAILY_CHECKIN_TITLE, body: item.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.at },
      });
      scheduled += 1;
    } catch (e) {
      logger.warn('schedule daily check-in failed', { error: String(e), key: item.key });
    }
  }
  return scheduled;
}

/**
 * Schedule (or replace) a one-off reminder at a specific date. Skips silently if the
 * date is in the past (e.g. very short test trials). Returns the identifier or null.
 */
export async function scheduleOneOff(
  identifier: string,
  date: Date,
  content: { title: string; body: string },
): Promise<string | null> {
  if (!isSchedulable()) return null;
  if (date.getTime() <= Date.now()) {
    await cancelScheduled(identifier);
    return null;
  }
  try {
    await cancelScheduled(identifier);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });
    return identifier;
  } catch (e) {
    logger.warn('scheduleOneOff failed', { error: String(e), identifier });
    return null;
  }
}
