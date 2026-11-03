import { supabase } from '@lib';
import type { DevicePlatform, NotificationPrefs } from '@app-types/database';
import type { BannerPost } from './inAppModel';

export async function registerDeviceToken(
  userId: string,
  platform: DevicePlatform,
  token: string,
): Promise<void> {
  const { error } = await supabase.from('device_tokens').upsert(
    {
      user_id: userId,
      platform,
      token,
      enabled: true,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'token' },
  );
  if (error) throw error;
}

export async function disableDeviceToken(token: string): Promise<void> {
  const { error } = await supabase
    .from('device_tokens')
    .update({ enabled: false })
    .eq('token', token);
  if (error) throw error;
}

export async function fetchPrefs(userId: string): Promise<NotificationPrefs | null> {
  const { data, error } = await supabase
    .from('notification_prefs')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The Notifications page's own switches (circle notifications are set inside each circle). */
export type PrefsPatch = Partial<
  Pick<
    NotificationPrefs,
    | 'journaling_reminder'
    | 'streak_reminder'
    | 'weekly_recap'
    | 'monthly_recap'
    | 'yearly_recap'
    | 'reminder_time'
  >
>;

export async function updatePrefs(userId: string, patch: PrefsPatch): Promise<void> {
  const { error } = await supabase
    .from('notification_prefs')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' });
  if (error) throw error;
}

// send-push resolves every recipient server-side from these ids and applies each person's own
// switches for that circle; reactions only ever notify on someone's FIRST reaction.
export type NotifyEvent =
  // A heart on a Circle post / prompt / reply / shared entry → its author.
  | { type: 'post_reaction'; post_id: string }
  // An entry shared into Private circles → their members (once per circle, once they can see it).
  | { type: 'share_created'; entry_id: string }
  // The owner approved a join request → whoever asked (always sent; no switch).
  | { type: 'added_to_circle'; circle_id: string; user_id: string }
  // A new Circle post/reply (reply → the person it answers; top-level → the circle's members).
  | { type: 'post_created'; circle_id: string; post_id: string }
  // A pending request to join a Private Circle → send-push notifies the owner.
  | { type: 'join_request'; circle_id: string };

/**
 * Fire-and-forget: invoke the send-push fan-out for an event. Never throws (push is
 * best-effort and must not block the user action that triggered it).
 */
export async function notifyEvent(payload: NotifyEvent): Promise<void> {
  try {
    await supabase.functions.invoke('send-push', { body: payload });
  } catch {
    // best-effort
  }
}

/** The author columns a banner reads. */
interface BannerAuthor {
  display_name: string | null;
  avatar_url: string | null;
  /** The admin-only verified badge (N7). Absent = not verified. */
  verified?: boolean | null;
}

/**
 * A Circle post or reply as its in-app banner shows it: who wrote what, in which circle. Null when
 * it's gone (deleted, or no longer visible to this user). One small read per banner, only while the
 * app is open.
 */
export async function fetchBannerPost(postId: string): Promise<BannerPost | null> {
  const { data: post, error } = await supabase
    .from('circle_posts')
    .select('id, circle_id, parent_id, author_id, body, deleted_at')
    .eq('id', postId)
    .maybeSingle();
  if (error) throw error;
  if (!post || post.deleted_at) return null;
  const [author, circle] = await Promise.all([
    post.author_id
      ? supabase
          .from('profiles')
          .select('display_name, avatar_url, verified')
          .eq('user_id', post.author_id)
          .maybeSingle()
          // `verified` (migration 20261022060000) isn't in the shared generated types yet.
          .then((r) => r as unknown as { data: BannerAuthor | null; error: unknown })
      : Promise.resolve({ data: null, error: null }),
    supabase.from('circles').select('name').eq('id', post.circle_id).maybeSingle(),
  ]);
  if (author.error) throw author.error;
  if (circle.error) throw circle.error;
  return {
    id: post.id,
    circleId: post.circle_id,
    parentId: post.parent_id,
    authorId: post.author_id,
    // The same fallbacks as the push itself (send-push).
    authorName: author.data?.display_name?.trim() || 'Someone',
    // The badge after the name (N7.15), read live like every other place it shows.
    authorVerified: author.data?.verified === true,
    avatarUrl: author.data?.avatar_url ?? null,
    circleName: circle.data?.name?.trim() || 'your circle',
    text: post.body ?? '',
  };
}

/**
 * The post a reply sits under, for opening the right page from a notification: null for a top-level
 * post, undefined when the post is gone.
 */
export async function fetchPostParent(
  postId: string,
): Promise<string | null | undefined> {
  const { data, error } = await supabase
    .from('circle_posts')
    .select('parent_id, deleted_at')
    .eq('id', postId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.deleted_at) return undefined;
  return data.parent_id;
}
