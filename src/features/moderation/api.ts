import { supabase } from '@lib';
import { matchesSeverePrescreen } from '@features/safety';
import type { CircleStanding } from '@app-types/database';

export type ModerationVerdict = 'allow' | 'block';

/**
 * The reusable PRE-POST moderation gate the future Circle post/comment composer calls BEFORE
 * persisting content. On-device severe prescreen first; only a hit triggers a synchronous AI confirm
 * (which may block the post + apply Tier-3 enforcement). Fails OPEN — a confirm failure lets the post
 * through (the async post-scan is the backstop), so posting is never blocked by an outage.
 */
export async function moderateCircleText(input: {
  targetType: string;
  targetId?: string | null;
  text: string;
}): Promise<ModerationVerdict> {
  if (!matchesSeverePrescreen(input.text)) return 'allow';
  try {
    const { data, error } = await supabase.functions.invoke('moderate-circle-content', {
      body: {
        mode: 'pre_post',
        target_type: input.targetType,
        target_id: input.targetId ?? null,
        text: input.text,
      },
    });
    if (error) return 'allow';
    return (data as { verdict?: string } | null)?.verdict === 'block' ? 'block' : 'allow';
  } catch {
    return 'allow';
  }
}

/**
 * Fire the async full scan AFTER a post is live (harassment / inappropriate language / doxxing /
 * borderline threats). Best-effort and must never block the poster; the Edge Function applies any
 * tiered enforcement and the caller hides flagged content.
 */
export async function scanCirclePost(input: {
  targetType: string;
  targetId: string;
  text: string;
}): Promise<void> {
  try {
    await supabase.functions.invoke('moderate-circle-content', {
      body: {
        mode: 'post_scan',
        target_type: input.targetType,
        target_id: input.targetId,
        text: input.text,
      },
    });
  } catch {
    /* best-effort — async scan, never blocks the poster */
  }
}

/** User report (the visible "Report" button) → routes to the review queue for a human. */
export async function reportContent(input: {
  reporterId: string;
  reportedUserId?: string | null;
  targetType: string;
  targetId?: string | null;
  reason?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('circle_reports').insert({
    reporter_id: input.reporterId,
    reported_user_id: input.reportedUserId ?? null,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    reason: input.reason ?? null,
  });
  if (error) throw error;
}

/** Appeal a strike or suspension → review queue. Nothing is auto-reversed; a human decides. */
export async function submitAppeal(input: {
  userId: string;
  strikeId?: string | null;
  suspensionId?: string | null;
  message?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('moderation_appeals').insert({
    user_id: input.userId,
    strike_id: input.strikeId ?? null,
    suspension_id: input.suspensionId ?? null,
    message: input.message ?? null,
  });
  if (error) throw error;
}

/** The caller's current Circles standing (gates posting/viewing). Mirrors deriveStanding(). */
export async function fetchMyCircleStanding(): Promise<CircleStanding> {
  const { data, error } = await supabase.rpc('my_circle_standing');
  if (error) throw error;
  return (data as CircleStanding | null) ?? 'ok';
}
