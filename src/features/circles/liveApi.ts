import type { RealtimeChannel } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabase } from '@lib';

/**
 * A circle's private Realtime topic. The database sends a signal here whenever something its
 * members can see changes (migration 20261022030000_circle_posts_live); only the circle's approved
 * members may listen (RLS on realtime.messages).
 */
export const circlePostsTopic = (circleId: string) => `circle-posts:${circleId}`;

/**
 * One change in a circle: ids and counts only, never the text or who wrote it. The app loads the
 * content itself through the normal RLS-protected queries, so a Private circle still shows a member
 * only the threads from after they joined.
 *  - insert: a post or reply members can now see (parent_id null = a top-level post or prompt)
 *  - update: hearts or reply count changed, or the text/moods were edited (edited)
 *  - delete: deleted, or removed by moderation
 */
export const LivePostSignalSchema = z.object({
  op: z.enum(['insert', 'update', 'delete']),
  post_id: z.guid(),
  parent_id: z.guid().nullable(),
  like_count: z.number().int().min(0),
  reply_count: z.number().int().min(0),
  edited: z.boolean(),
});
export type LivePostSignal = z.infer<typeof LivePostSignalSchema>;

/** 'live' once the channel has joined; 'down' whenever it isn't (it rejoins by itself). */
export type LiveStatus = 'live' | 'down';

/**
 * Listen to one circle's signals. Private channels need the signed-in session's token, so with no
 * session nothing is opened. Malformed signals are ignored. Returns stop(), which resolves once the
 * channel has left, so reopening the same circle never picks up the one that's closing.
 */
export function openCirclePostsChannel(
  circleId: string,
  handlers: {
    onSignal: (signal: LivePostSignal) => void;
    onStatus: (status: LiveStatus) => void;
  },
): () => Promise<void> {
  let channel: RealtimeChannel | null = null;
  let stopped = false;
  const ready = (async () => {
    const { data } = await supabase.auth.getSession();
    if (stopped || !data.session) return;
    await supabase.realtime.setAuth();
    if (stopped) return;
    channel = supabase
      .channel(circlePostsTopic(circleId), { config: { private: true } })
      .on('broadcast', { event: 'post' }, (message) => {
        const parsed = LivePostSignalSchema.safeParse(message.payload);
        if (parsed.success) handlers.onSignal(parsed.data);
      })
      .subscribe((status) =>
        handlers.onStatus(status === 'SUBSCRIBED' ? 'live' : 'down'),
      );
  })().catch(() => handlers.onStatus('down'));

  return async () => {
    stopped = true;
    await ready;
    const open = channel;
    channel = null;
    if (open) await supabase.removeChannel(open);
  };
}
