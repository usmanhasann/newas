import { supabase } from '@lib';
import type { AcquisitionValue } from '@features/onboarding';

/**
 * Marketing attribution for the one-time "How'd you find us?" Home popup. Both calls go through
 * the SECURITY DEFINER `resolve_acquisition_prompt` RPC, which records the answer (when given) in
 * the dedicated `acquisition_responses` table AND marks the prompt seen so it appears only once.
 */

/** Record the chosen source (tied to the user + timestamped) and mark the prompt seen. */
export async function recordAcquisitionSource(source: AcquisitionValue): Promise<void> {
  const { error } = await supabase.rpc('resolve_acquisition_prompt', { p_source: source });
  if (error) throw error;
}

/** Skip / dismiss without answering — records nothing, but still marks the prompt seen. */
export async function dismissAcquisitionPrompt(): Promise<void> {
  const { error } = await supabase.rpc('resolve_acquisition_prompt', { p_source: null });
  if (error) throw error;
}
