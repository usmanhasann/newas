import { supabase } from '@lib';
import type { ReflectionType } from '@app-types/database';

/** UI-facing shape of one period type's reflection state (from the overview RPC). */
export interface ReflectionOverview {
  type: ReflectionType;
  hasAnyEntry: boolean;
  /** Next unlock date (YYYY-MM-DD, user's local tz) — computed by the backend. */
  nextUnlockDate: string;
  content: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  generatedAt: string | null;
  generating: boolean;
  failed: boolean;
  /**
   * The newest finished period (periodStart..periodEnd) has entries: false = an empty period (the
   * card shows its empty state with the dates), null = no period has finished yet.
   */
  periodHasEntries: boolean | null;
}

/**
 * Reflection state per type. `p_today` is the caller's local date (their tz); all
 * period/unlock math is done server-side (single source of truth — §8).
 */
export async function fetchReflectionsOverview(
  todayLocal: string,
): Promise<ReflectionOverview[]> {
  const { data, error } = await supabase.rpc('get_reflections_overview', {
    p_today: todayLocal,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    type: r.type,
    hasAnyEntry: r.has_any_entry,
    nextUnlockDate: r.next_unlock_date,
    content: r.content,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    generatedAt: r.generated_at,
    generating: r.generating,
    failed: r.failed,
    periodHasEntries: r.period_has_entries ?? null,
  }));
}

export interface GenerateReflectionsResult {
  generated: number;
}

/**
 * Idempotently generates any due reflections for the caller (server validates +
 * generates; already-ready periods are untouched). Safe to call every time Insights
 * opens.
 */
export async function triggerReflectionGeneration(): Promise<GenerateReflectionsResult> {
  const { data, error } = await supabase.functions.invoke('generate-reflections', {
    body: {},
  });
  if (error) throw error;
  return (data as GenerateReflectionsResult) ?? { generated: 0 };
}
