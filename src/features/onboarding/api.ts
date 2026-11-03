import { supabase } from '@lib';
import type { Json, Profile } from '@app-types/database';
import type { OnboardingData } from './types';
import { isPastAuth } from './flow';

/**
 * Atomically merge a patch into profiles.settings.onboarding (backend source of
 * truth for resume). Uses the set_onboarding RPC so concurrent step saves never
 * clobber each other and we never round-trip the whole settings blob. Idempotent:
 * re-sending the same patch is a no-op merge.
 */
export async function saveOnboarding(patch: OnboardingData): Promise<Profile> {
  const { data, error } = await supabase.rpc('set_onboarding', {
    p_patch: patch as unknown as Json,
  });
  if (error) throw error;
  return data as Profile;
}

// The "real" question answers became multi-select (arrays). A flow interrupted under the old
// build may have persisted a bare scalar; coerce those to 1-element arrays on read so hydrated
// state is always the current shape. (`settings.onboarding` is schemaless jsonb.)
const ARRAY_ANSWER_KEYS = ['motivation', 'support', 'goal', 'personal_reflection_style'] as const;

// `frequency` went the other way — it was multi-select and is now SINGLE-select. A flow
// interrupted under that build persisted an array; take the primary (first) answer so hydrated
// state matches the current scalar shape. An empty array meant "unanswered" → null.
const SCALAR_ANSWER_KEYS = ['frequency'] as const;

function normalizeOnboarding(data: OnboardingData): OnboardingData {
  const out = { ...data } as Record<string, unknown>;
  for (const key of ARRAY_ANSWER_KEYS) {
    const v = out[key];
    if (v != null && !Array.isArray(v)) out[key] = [v]; // legacy scalar → [scalar]
  }
  for (const key of SCALAR_ANSWER_KEYS) {
    const v = out[key];
    if (Array.isArray(v)) out[key] = v[0] ?? null; // legacy [scalar, …] → scalar
  }
  return out as OnboardingData;
}

/** Safely read the persisted onboarding blob off a profile (null-safe, shape-normalized). */
export function readOnboarding(profile: Profile | null | undefined): OnboardingData {
  const settings = (profile?.settings ?? null) as { onboarding?: OnboardingData } | null;
  return normalizeOnboarding(settings?.onboarding ?? {});
}

/** Whether this profile's saved onboarding step is past sign-up (the paywall or later). */
export function onboardingPastAuth(profile: Profile | null | undefined): boolean {
  return isPastAuth(readOnboarding(profile).step);
}
