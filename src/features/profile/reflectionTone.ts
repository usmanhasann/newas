/**
 * Reflection Tone (client revisions 10/14 p.21, N13): the voice of the user's AI reflections, now
 * its own Profile screen (it moved out of Edit Profile so it lives in one place). Same 4 tones and
 * the same rules as onboarding: at least 1, up to 2; with two, the AI blends them. [0] is saved as
 * profiles.personal_reflection_style (NOT NULL), [1] as personal_reflection_style_secondary.
 */
import { z } from 'zod';
import type { OptionItem } from '@components';
import type { PersonalReflectionStyle, Profile } from '@app-types/database';
import type { ProfilePatch } from './api';

/**
 * The 4 tones, in onboarding's order and words (gentle first: the DB default). Kept local to the
 * profile feature (not imported from onboarding) to respect feature isolation; values mirror the DB
 * enum public.personal_reflection_style.
 */
export const REFLECTION_TONE_OPTIONS: OptionItem<PersonalReflectionStyle>[] = [
  { value: 'gentle', label: 'Gentle', icon: 'heart-outline', description: 'Soft and encouraging, leading with empathy.' },
  { value: 'direct', label: 'Direct', icon: 'flash-outline', description: 'Clear and concise, straight to the point.' },
  { value: 'encouraging', label: 'Encouraging', icon: 'trending-up-outline', description: 'Motivating, focused on growth and progress.' },
  { value: 'reflective', label: 'Reflective', icon: 'chatbubble-ellipses-outline', description: 'Thoughtful and open-ended, leaving room rather than drawing conclusions.' },
];

export const MIN_TONES = 1;
export const MAX_TONES = 2;

const toneSchema = z.enum(['gentle', 'direct', 'encouraging', 'reflective']);

/** 1 or 2 different tones. */
export const tonesSchema = z
  .array(toneSchema)
  .min(MIN_TONES)
  .max(MAX_TONES)
  .refine((t) => new Set(t).size === t.length, { message: 'Pick two different tones.' });

/** The saved choice, primary first (what the screen shows when it opens). */
export function tonesFromProfile(
  profile: Pick<Profile, 'personal_reflection_style' | 'personal_reflection_style_secondary'>,
): PersonalReflectionStyle[] {
  const primary = profile.personal_reflection_style ?? 'gentle';
  const secondary = profile.personal_reflection_style_secondary;
  return secondary && secondary !== primary ? [primary, secondary] : [primary];
}

/**
 * Tap a tone, exactly like onboarding: a chosen one is unchosen (even the last, then Save waits for
 * a pick); a new one is added while fewer than 2 are chosen (at 2, the others are locked).
 */
export function toggleTone(
  current: PersonalReflectionStyle[],
  tone: PersonalReflectionStyle,
): PersonalReflectionStyle[] {
  if (current.includes(tone)) return current.filter((t) => t !== tone);
  return current.length < MAX_TONES ? [...current, tone] : current;
}

/** Save is allowed with 1 or 2 tones chosen. */
export function canSaveTones(tones: PersonalReflectionStyle[]): boolean {
  return tonesSchema.safeParse(tones).success;
}

/** The profile update for a choice (validated: throws on 0, 3+ or repeated tones). */
export function tonePatch(
  tones: PersonalReflectionStyle[],
): Required<Pick<ProfilePatch, 'personal_reflection_style' | 'personal_reflection_style_secondary'>> {
  const [primary, secondary] = tonesSchema.parse(tones);
  return {
    personal_reflection_style: primary,
    personal_reflection_style_secondary: secondary ?? null,
  };
}
