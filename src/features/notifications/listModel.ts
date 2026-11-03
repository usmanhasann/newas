/**
 * The in-app notifications list (client revisions 10/14 p.8 and p.24; the bell on the Journal tab).
 * Pure: the row shape the server sends (re-validated with Zod: it comes from outside the app), what
 * each row says, its icon, its time, and where a tap goes. No React, no I/O: Jest tests it directly.
 */
import { z } from 'zod';
import { topicFor, targetForTopic, type BannerIcon, type NavTarget } from './inAppModel';

/** The list's queries (kept here, free of side effects, so the banner host can use them). */
export const notifListKeys = {
  all: (uid?: string) => ['notif', 'list', uid] as const,
  items: (uid?: string) => ['notif', 'list', uid, 'items'] as const,
  unread: (uid?: string) => ['notif', 'list', uid, 'unread'] as const,
};

/** Every list query, for everyone: a new notification arrived (InAppBannerHost). */
export const NOTIFICATIONS_LIST_ROOT = ['notif', 'list'] as const;

/** Rows per page of the list. */
export const NOTIFICATIONS_PAGE = 30;

const rowSchema = z.object({
  id: z.guid(),
  kind: z.string().min(1).max(64),
  title: z.string().max(200).catch(''),
  body: z.string().max(500).catch(''),
  data: z.record(z.string(), z.unknown()).catch({}),
  created_at: z.string().min(1),
  read_at: z.string().nullable().catch(null),
  actor_name: z.string().nullable().catch(null),
  actor_avatar_url: z.string().nullable().catch(null),
  actor_verified: z.boolean().nullable().catch(false),
  preview: z.string().nullable().catch(null),
});

/** One row of my_notifications(). */
export type NotificationRow = z.infer<typeof rowSchema>;

/** The rows that are well formed (a malformed one is left out rather than breaking the list). */
export function parseNotificationRows(rows: unknown): NotificationRow[] {
  if (!Array.isArray(rows)) return [];
  const out: NotificationRow[] = [];
  for (const r of rows) {
    const parsed = rowSchema.safeParse(r);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Where the next page starts: after the last row (keyset), or null when this page wasn't full. */
export function nextNotificationsCursor(
  rows: readonly NotificationRow[],
  pageSize: number = NOTIFICATIONS_PAGE,
): { createdAt: string; id: string } | null {
  const last = rows[rows.length - 1];
  return rows.length >= pageSize && last
    ? { createdAt: last.created_at, id: last.id }
    : null;
}

const ICON_FOR_KIND: Record<string, BannerIcon> = {
  post_created: 'chatbubble-ellipses',
  post_reaction: 'heart',
  reaction: 'heart',
  share_created: 'chatbubbles',
  added_to_circle: 'people',
  join_request: 'person-add',
  member_joined: 'person-add',
  circle_archived: 'archive',
  circle_unarchived: 'people',
  recap: 'sparkles',
  streak_reminder: 'flame',
};

export interface NotificationView {
  id: string;
  /** The main line: the notification's text ("Auguste replied to your post."), else its title. */
  text: string;
  /**
   * The person's name the main line starts with, when they are verified (client 10/14 p.5, N7: the
   * badge shows right after their name, everywhere it appears). Null: no badge.
   */
  verifiedName: string | null;
  /** The small line under it: the notification's title ("New reply"), when the main line is its text. */
  label: string;
  /** One line of what they wrote (a new post or reply), read live; null when there's none. */
  preview: string | null;
  icon: BannerIcon;
  avatarUrl: string | null;
  unread: boolean;
  createdAt: string;
  target: NavTarget | null;
}

/** What one row shows, and where tapping it goes. */
export function notificationView(row: NotificationRow): NotificationView {
  const title = row.title.trim();
  const body = row.body.trim();
  const text = body || title;
  const name = row.actor_name?.trim() ?? '';
  const verifiedName = row.actor_verified && name && text.startsWith(name) ? name : null;
  const preview = row.preview?.replace(/\s+/g, ' ').trim() || null;
  return {
    id: row.id,
    text,
    verifiedName,
    label: body ? title : '',
    preview,
    icon: ICON_FOR_KIND[row.kind] ?? 'notifications',
    avatarUrl: row.actor_avatar_url || null,
    unread: row.read_at === null,
    createdAt: row.created_at,
    target: targetForTopic(
      topicFor({ ...row.data, type: row.data.type ?? row.kind }, row.id),
    ),
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * When it came, short: "Just now", "5m", "3h", then "Yesterday", then "Mon" for the last week, then
 * "Sep 30" (with the year once it isn't this year). Local time; `now` is passed in for tests.
 */
export function notificationTimeLabel(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const t = at.getTime();
  if (Number.isNaN(t)) return '';
  const ago = now.getTime() - t;
  if (ago < MINUTE) return 'Just now';
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)}m`;
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  if (t >= startOfToday) return `${Math.floor(ago / HOUR)}h`;
  if (t >= startOfToday - DAY) return 'Yesterday';
  if (t >= startOfToday - 6 * DAY) {
    return WEEKDAYS[at.getDay()]!;
  }
  const day = `${MONTHS[at.getMonth()]} ${at.getDate()}`;
  return at.getFullYear() === now.getFullYear() ? day : `${day}, ${at.getFullYear()}`;
}

/** What a screen reader says for a row. */
export function notificationSpokenLabel(
  view: NotificationView,
  timeLabel: string,
): string {
  const text = view.verifiedName
    ? `${view.verifiedName}, verified,${view.text.slice(view.verifiedName.length)}`
    : view.text;
  return [view.unread ? 'Unread' : null, text, view.preview, view.label, timeLabel]
    .map((part) => (part ?? '').replace(/[.s]+$/, ''))
    .filter(Boolean)
    .join('. ');
}
