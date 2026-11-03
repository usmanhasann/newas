import { supabase } from '@lib';
import { matchesPrivateThreatPrescreen } from './threatMatcher';

export type PrivateThreatSource = 'journal_entry' | 'checkin_note';

/**
 * System 3 — private-threat report (fire-and-forget, NO user-facing effect). Runs the on-device
 * prescreen first; only a possible hit sends the excerpt to the `detect-private-threat` Edge
 * Function, which AI-confirms and, if credible, writes a service-role-only flag for internal human
 * review and notifies the review team.
 *
 * There is deliberately NO automated consequence and NOTHING the user ever sees — this is about a
 * possible risk to someone OUTSIDE the app, assessed by a human. A failure here must never affect
 * the user's save, so it is fully swallowed.
 */
export async function reportPrivateThreat(input: {
  text: string;
  source: PrivateThreatSource;
  sourceId?: string | null;
}): Promise<void> {
  // On-device prescreen — private text never leaves the phone unless this hits.
  if (!matchesPrivateThreatPrescreen(input.text)) return;
  try {
    await supabase.functions.invoke('detect-private-threat', {
      body: { text: input.text, source: input.source, source_id: input.sourceId ?? null },
    });
  } catch {
    /* best-effort, internal-only — never surface to or block the user */
  }
}
