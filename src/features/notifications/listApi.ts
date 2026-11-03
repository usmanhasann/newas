/**
 * The in-app notifications list's server calls (migration 20261022130000_notifications_list). The
 * app reads only through these functions: the caller's own rows, newest first.
 */
import { supabase } from '@lib';
import {
  NOTIFICATIONS_PAGE,
  nextNotificationsCursor,
  parseNotificationRows,
  type NotificationRow,
} from './listModel';

export interface NotificationsCursor {
  createdAt: string;
  id: string;
}

export interface NotificationsPage {
  items: NotificationRow[];
  nextCursor: NotificationsCursor | null;
}

/** One page of the list, newest first; `cursor` = where the previous page ended. */
export async function fetchNotificationsPage(
  cursor?: NotificationsCursor | null,
): Promise<NotificationsPage> {
  const { data, error } = await supabase.rpc('my_notifications', {
    p_before_created: cursor?.createdAt ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: NOTIFICATIONS_PAGE,
  });
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  const items = parseNotificationRows(rows);
  // The cursor follows what the server sent, so a malformed row left out never ends the list early.
  const raw = rows as { id?: unknown; created_at?: unknown }[];
  const lastRaw = raw[raw.length - 1];
  const nextCursor =
    raw.length >= NOTIFICATIONS_PAGE &&
    typeof lastRaw?.id === 'string' &&
    typeof lastRaw.created_at === 'string'
      ? { createdAt: lastRaw.created_at, id: lastRaw.id }
      : nextNotificationsCursor(items);
  return { items, nextCursor };
}

/** Whether there's anything unread (the bell's dot). */
export async function hasUnreadNotifications(): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_unread_notifications');
  if (error) throw error;
  return data === true;
}

/** Opening the list marks everything in it read. */
export async function markNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc('mark_notifications_read');
  if (error) throw error;
}
