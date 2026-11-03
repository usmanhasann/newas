import { supabase } from '@lib';

export interface AiSummaryResult {
  status: string;
  summary: string | null;
}

/** Invoke the ai-summary Edge Function for an entry the caller owns. */
export async function invokeAiSummary(entryId: string): Promise<AiSummaryResult> {
  const { data, error } = await supabase.functions.invoke('ai-summary', {
    body: { entry_id: entryId },
  });
  if (error) throw error;
  return data as AiSummaryResult;
}
