// The in-app notifications list (client revisions 10/14 p.8 and p.24; migration
// 20261022130000_notifications_list): every notification the server sends is also saved for each
// person it's for, at the moment it's sent, whether or not a phone of theirs can receive the push.
// Saving never blocks or fails a send: an error (say the table isn't there yet) is logged and the
// push still goes.
//
// noticeRows is pure (no I/O, no Deno APIs) so Jest tests it directly.

// deno-lint-ignore no-explicit-any
type Admin = any;

/** One notification as the list keeps it: the push's own words and data. */
export interface ListNotice {
  /** What it's about: the push data's `type` (post_created, recap, streak_reminder, ...). */
  kind: string;
  title: string;
  body: string;
  /** The push's data (where a tap goes). */
  data: Record<string, string>;
  /** The person it's about (their name and verified badge show live in the list). */
  actorId?: string | null;
}

export interface NoticeRow {
  user_id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, string>;
  actor_id: string | null;
}

/** The table's limits (see the migration). */
const MAX_TITLE = 200;
const MAX_BODY = 500;
const MAX_KIND = 64;
/** Rows per insert, so a big circle's notification goes in a few requests. */
export const NOTICE_INSERT_CHUNK = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One row per person (each once), the text trimmed to fit. Nobody, or no kind: no rows. */
export function noticeRows(userIds: readonly string[], notice: ListNotice): NoticeRow[] {
  const kind = (notice.kind ?? '').trim().slice(0, MAX_KIND);
  if (!kind) return [];
  const actor = notice.actorId && UUID.test(notice.actorId) ? notice.actorId : null;
  const ids = [
    ...new Set(userIds.filter((id) => typeof id === 'string' && UUID.test(id))),
  ];
  return ids.map((user_id) => ({
    user_id,
    kind,
    title: (notice.title ?? '').trim().slice(0, MAX_TITLE),
    body: (notice.body ?? '').trim().slice(0, MAX_BODY),
    data: { ...notice.data },
    actor_id: actor,
  }));
}

/** Saves the notification for these people. Never throws. */
export async function recordNotices(
  admin: Admin,
  userIds: readonly string[],
  notice: ListNotice,
): Promise<void> {
  const rows = noticeRows(userIds, notice);
  for (let i = 0; i < rows.length; i += NOTICE_INSERT_CHUNK) {
    try {
      const { error } = await admin
        .from('notifications')
        .insert(rows.slice(i, i + NOTICE_INSERT_CHUNK));
      if (error) {
        console.error('notifications list: save failed: ' + (error.message ?? 'unknown'));
        return;
      }
    } catch (e) {
      console.error(
        'notifications list: save failed: ' +
          (e instanceof Error ? e.message : 'unknown'),
      );
      return;
    }
  }
}
