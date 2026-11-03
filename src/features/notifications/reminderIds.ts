/**
 * Stable ids of the reminders scheduled on the phone (reminders.ts). Kept apart so pure code (the
 * in-app banner rules) can recognise them without loading the native notifications module.
 */
export const DAILY_CHECKIN_ID = 'ic-daily-checkin';
// The id stays as first shipped (it now fires 2 days before the end): rescheduling under the SAME
// id replaces a reminder an older version scheduled, so nobody gets two.
export const TRIAL_REMINDER_ID = 'ic-trial-day4';
