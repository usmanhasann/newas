/**
 * Shape of the onboarding data persisted on profiles.settings.onboarding (the
 * backend source of truth for resume). All fields optional/null-safe so partial
 * progress and existing users (no onboarding key yet) read cleanly.
 */
import type { PlanId } from '@features/subscription';
import type { NotificationPermissionState } from '@features/notifications';
import type {
  AcquisitionValue,
  AuthMethod,
  FrequencyValue,
  GoalValue,
  MotivationValue,
  ReflectionStyleValue,
  SupportValue,
} from './constants';
import type { StepId } from './flow';

export type PermissionState = NotificationPermissionState;

export interface TrialReminderState {
  status: 'scheduled' | 'skipped' | 'canceled';
  scheduled_at: string | null;
  notif_id: string | null;
}

export interface OnboardingData {
  status?: 'in_progress' | 'completed';
  step?: StepId;
  /** Date of birth as a local ISO 'YYYY-MM-DD' (used to calibrate the plan). */
  date_of_birth?: string | null;
  /** Whether the user has tried other journaling apps before. */
  tried_other_apps?: boolean | null;
  // The "real" questions are multi-select (up to 2, min 1), so these are arrays.
  motivation?: MotivationValue[] | null;
  support?: SupportValue[] | null;
  goal?: GoalValue[] | null;
  /** How often the user feels overwhelmed — SINGLE-select, so a scalar (not an array). */
  frequency?: FrequencyValue | null;
  /** Where the user heard about us (spec §8) — single-select. */
  acquisition_source?: AcquisitionValue | null;
  /**
   * Personal reflection tone(s) — up to 2. At completion, [0] → profiles.personal_reflection_style
   * and [1] → profiles.personal_reflection_style_secondary; when two are chosen the AI blends them.
   */
  personal_reflection_style?: ReflectionStyleValue[] | null;
  reminder_time?: string | null; // HH:MM (local); also mirrored to notification_prefs
  reminder_timezone?: string | null; // IANA; also mirrored to profiles.timezone
  notif_permission?: PermissionState | null;
  reminder_enabled?: boolean | null;
  /** How the user signed up (spec §3). Recorded once the account exists (email: once verified). */
  auth_method?: AuthMethod | null;
  first_entry_id?: string | null;
  reflection_status?: string | null;
  trusted_circle_deferred?: boolean | null;
  selected_plan?: PlanId | null;
  trial_reminder?: TrialReminderState | null;
  completed_at?: string | null;
}
