import { supabase } from '@lib';
import type { CrisisKeyword } from '@app-types/database';

/** Active keywords (all regions for now; filter by user region when multi-region). */
export async function fetchCrisisKeywords(): Promise<CrisisKeyword[]> {
  const { data, error } = await supabase
    .from('crisis_keywords')
    .select('*')
    .eq('is_active', true);
  if (error) throw error;
  return data ?? [];
}

/**
 * System 2 crisis AI-confirm, for CIRCLE POSTS only (journal entries are keywords only and never
 * reach this: see useEntryCrisisCheck). Sends a possible-hit excerpt (only reached after an on-device
 * prescreen hit) to the `detect-crisis` Edge Function, which classifies suicidal ideation /
 * self-harm intent and returns a boolean. The function stores NOTHING and this result NEVER
 * produces a flag, warning, restriction, or any penalty — it only decides whether to OFFER the
 * crisis-resources popup. Throws on transport error so the caller can fail open (offer support).
 */
export async function confirmCrisis(text: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('detect-crisis', {
    body: { text, source: 'circle_post' },
  });
  if (error) throw error;
  return !!(data as { crisis?: boolean } | null)?.crisis;
}
