/**
 * Onboarding option sets + mappings. Pure data/logic (no I/O, no React) so the
 * whole flow's behavior is unit-testable. Answer VALUES are stable enum-like keys
 * (persisted); LABELS are the warm, plain-spoken copy shown to the user.
 */
import type { OptionIconName } from '@components';
import { parseHhmm, formatHhmm12 } from '@utils/date';

export type MotivationValue =
  | 'managing_stress'
  | 'lifting_low_mood'
  | 'understanding_myself'
  | 'building_habit'
  | 'curious';

export type FrequencyValue = 'rarely' | 'sometimes' | 'most_days' | 'almost_always';

export type SupportValue =
  | 'close_friend'
  | 'family'
  | 'partner'
  | 'keep_to_myself'
  | 'not_sure';

export type GoalValue =
  | 'calmer'
  | 'patterns'
  | 'daily_habit'
  | 'less_alone'
  | 'more_good_days';

/** Where the user heard about LYSM (overhaul spec §8). */
export type AcquisitionValue = 'instagram' | 'tiktok' | 'friends_family' | 'app_store' | 'other';

/** How the user authenticated (overhaul spec §3) — drives the email-verify branch. */
export type AuthMethod = 'apple' | 'google' | 'email';

/**
 * Personal reflection tone (personalization Phase 1). Shapes the voice of the user's PRIVATE
 * weekly/monthly/yearly reflections. Values mirror the DB enum public.personal_reflection_style.
 */
export type ReflectionStyleValue = 'gentle' | 'direct' | 'encouraging' | 'reflective';

export interface Option<T extends string> {
  value: T;
  label: string;
  /** Optional leading logo/icon (Ionicons name), e.g. source logos on the acquisition step. */
  icon?: OptionIconName;
  /** Optional supporting line under the label (e.g. what a reflection tone feels like). */
  description?: string;
}

export const MOTIVATIONS: Option<MotivationValue>[] = [
  { value: 'managing_stress', label: 'Managing stress' },
  { value: 'lifting_low_mood', label: 'Lifting a low mood' },
  { value: 'understanding_myself', label: 'Understanding myself better' },
  { value: 'building_habit', label: 'Building a daily habit' },
  { value: 'curious', label: 'Just curious' },
];

export const FREQUENCIES: Option<FrequencyValue>[] = [
  { value: 'rarely', label: 'Rarely' },
  { value: 'sometimes', label: 'Sometimes' },
  { value: 'most_days', label: 'Most days' },
  { value: 'almost_always', label: 'Almost always' },
];

export const SUPPORTS: Option<SupportValue>[] = [
  { value: 'close_friend', label: 'A close friend' },
  { value: 'family', label: 'Family' },
  { value: 'partner', label: 'A partner' },
  { value: 'keep_to_myself', label: 'I tend to keep it to myself' },
  { value: 'not_sure', label: 'Not sure' },
];

export const GOALS: Option<GoalValue>[] = [
  { value: 'calmer', label: 'Feeling calmer' },
  { value: 'patterns', label: 'Noticing my patterns' },
  { value: 'daily_habit', label: 'A steady daily habit' },
  { value: 'less_alone', label: 'Feeling less alone' },
  { value: 'more_good_days', label: 'More good days than hard ones' },
];

/**
 * Personal reflection tone options (personalization Phase 1). Order is deliberate: 'gentle'
 * first — it is also the DB default and what's preselected on the onboarding step.
 */
export const REFLECTION_STYLES: Option<ReflectionStyleValue>[] = [
  {
    value: 'gentle',
    label: 'Gentle',
    icon: 'heart-outline',
    description: 'Soft and encouraging, leading with empathy.',
  },
  {
    value: 'direct',
    label: 'Direct',
    icon: 'flash-outline',
    description: 'Clear and concise, straight to the point.',
  },
  {
    value: 'encouraging',
    label: 'Encouraging',
    icon: 'trending-up-outline',
    description: 'Motivating, focused on growth and progress.',
  },
  {
    value: 'reflective',
    label: 'Reflective',
    icon: 'chatbubble-ellipses-outline',
    description: 'Thoughtful and open-ended, leaving room rather than drawing conclusions.',
  },
];

/** Acquisition-source options (spec §8). Each carries a leading logo/icon. "Other" is last. */
export const ACQUISITIONS: Option<AcquisitionValue>[] = [
  { value: 'instagram', label: 'Instagram', icon: 'logo-instagram' },
  { value: 'tiktok', label: 'TikTok', icon: 'logo-tiktok' },
  { value: 'app_store', label: 'App Store', icon: 'logo-apple-appstore' },
  { value: 'friends_family', label: 'Friends and Family', icon: 'people' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

// Time parsing/formatting lives in @utils/date so the notifications feature can reuse it
// without importing across feature boundaries. Re-exported here so callers are unchanged.
export { parseHhmm, formatHhmm12 };

/** Personalization animation length (ms). Deliberately unhurried (~7s) so each plan piece
 *  pops in and checks off one at a time, at a pace the user can actually read. Kept here so
 *  tests share the constant. */
export const PLAN_ANIMATION_MS = 7000;

/**
 * Whether to skip the Screen 8 personalization delay: when reduced-motion is on,
 * or it already ran this session (don't replay when navigating back/forward).
 */
export function shouldSkipPlanAnimation(reducedMotion: boolean, alreadyPlayed: boolean): boolean {
  return reducedMotion || alreadyPlayed;
}
