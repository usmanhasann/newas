/**
 * The in-app notifications list (client revisions 10/14 p.8 and p.24): the server's saving rule
 * (noticeRows, the SAME source the Edge Functions run) and the app's row model.
 */
import { noticeRows } from '../supabase/functions/_shared/notificationsList';
import {
  NOTIFICATIONS_PAGE,
  nextNotificationsCursor,
  notificationSpokenLabel,
  notificationTimeLabel,
  notificationView,
  parseNotificationRows,
  type NotificationRow,
} from '@features/notifications/listModel';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const P = '44444444-4444-4444-8444-444444444444';

function row(over: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: A,
    kind: 'post_created',
    title: 'New reply',
    body: 'Auguste replied to your post.',
    data: { type: 'post_created', circle_id: B, post_id: P },
    created_at: '2026-10-21T10:00:00.000Z',
    read_at: null,
    actor_name: 'Auguste',
    actor_avatar_url: null,
    actor_verified: false,
    preview: null,
    ...over,
  };
}

describe('noticeRows: what the server saves (one row per person)', () => {
  it('saves one row per person, once each, with the push’s words, data and the person it’s about', () => {
    const rows = noticeRows([A, B, A], {
      kind: 'circle_archived',
      title: 'Circle archived',
      body: 'Konah’s Friends has been archived. You can still read it, but no new posts can be added.',
      data: { type: 'circle_archived', circle_id: C },
      actorId: C,
    });
    expect(rows).toEqual([
      expect.objectContaining({ user_id: A, kind: 'circle_archived', actor_id: C }),
      expect.objectContaining({ user_id: B, kind: 'circle_archived', actor_id: C }),
    ]);
    expect(rows[0]!.data).toEqual({ type: 'circle_archived', circle_id: C });
    expect(rows[0]!.body).toContain('has been archived');
  });

  it('skips anything that isn’t a person id, trims the text to the table’s limits', () => {
    const rows = noticeRows(['nope', A], {
      kind: 'recap',
      title: 'x'.repeat(300),
      body: 'y'.repeat(900),
      data: { type: 'recap' },
      actorId: 'not-a-uuid',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toHaveLength(200);
    expect(rows[0]!.body).toHaveLength(500);
    expect(rows[0]!.actor_id).toBeNull();
  });

  it('saves nothing without anyone, or without a kind', () => {
    expect(noticeRows([], { kind: 'recap', title: 't', body: 'b', data: {} })).toEqual(
      [],
    );
    expect(noticeRows([A], { kind: '  ', title: 't', body: 'b', data: {} })).toEqual([]);
  });
});

describe('the list’s rows', () => {
  it('leaves out malformed rows instead of breaking the list', () => {
    const rows = parseNotificationRows([row(), { id: 'bad' }, null, row({ id: B })]);
    expect(rows.map((r) => r.id)).toEqual([A, B]);
    expect(parseNotificationRows('nope')).toEqual([]);
  });

  it('pages by the last row, and stops after a short page', () => {
    const full = Array.from({ length: NOTIFICATIONS_PAGE }, () => row());
    expect(nextNotificationsCursor(full)).toEqual({
      createdAt: full[0]!.created_at,
      id: A,
    });
    expect(nextNotificationsCursor([row()])).toBeNull();
  });

  it('a new reply: its text, the title as the small line, unread, opens the post aimed at the reply', () => {
    const v = notificationView(row({ preview: '  so   good  to hear ' }));
    expect(v.text).toBe('Auguste replied to your post.');
    expect(v.label).toBe('New reply');
    expect(v.preview).toBe('so good to hear');
    expect(v.unread).toBe(true);
    expect(v.icon).toBe('chatbubble-ellipses');
    expect(v.target).toEqual({ to: 'post', circleId: B, postId: P, aimAtReply: true });
  });

  it('a verified person gets the badge right after their name (N7), live from the server', () => {
    expect(notificationView(row({ actor_verified: true })).verifiedName).toBe('Auguste');
    expect(notificationView(row({ actor_verified: false })).verifiedName).toBeNull();
    // Only when the line starts with their name.
    expect(
      notificationView(row({ actor_verified: true, body: 'Your request was approved.' }))
        .verifiedName,
    ).toBeNull();
  });

  it('opens what each kind is about', () => {
    expect(
      notificationView(
        row({ kind: 'circle_archived', data: { type: 'circle_archived', circle_id: B } }),
      ).target,
    ).toEqual({ to: 'circle', circleId: B });
    expect(
      notificationView(
        row({
          kind: 'member_joined',
          data: { type: 'member_joined', circle_id: B, tab: 'members' },
        }),
      ).target,
    ).toEqual({ to: 'circle', circleId: B, tab: 'members' });
    expect(
      notificationView(
        row({
          kind: 'recap',
          data: { type: 'recap', recap_type: 'monthly', period_start: '2026-09-01' },
        }),
      ).target,
    ).toEqual({ to: 'insights', period: 'month', periodStart: '2026-09-01' });
    expect(
      notificationView(
        row({ kind: 'streak_reminder', data: { type: 'streak_reminder' } }),
      ).target,
    ).toEqual({ to: 'journal' });
    expect(notificationView(row({ kind: 'mystery', data: {} })).target).toBeNull();
  });

  it('a row with only a title shows the title, with no small line', () => {
    const v = notificationView(
      row({ body: '', title: 'Your free trial ends in 2 days.' }),
    );
    expect(v.text).toBe('Your free trial ends in 2 days.');
    expect(v.label).toBe('');
  });

  it('says when it came: Just now, minutes, hours today, Yesterday, weekday, then the date', () => {
    const now = new Date(2026, 9, 21, 15, 0, 0); // Wed Oct 21 2026, 3 PM local
    const at = (d: Date) => notificationTimeLabel(d.toISOString(), now);
    expect(at(new Date(2026, 9, 21, 14, 59, 30))).toBe('Just now');
    expect(at(new Date(2026, 9, 21, 14, 55))).toBe('5m');
    expect(at(new Date(2026, 9, 21, 9, 0))).toBe('6h');
    expect(at(new Date(2026, 9, 20, 23, 0))).toBe('Yesterday');
    expect(at(new Date(2026, 9, 16, 12, 0))).toBe('Fri');
    expect(at(new Date(2026, 8, 30, 12, 0))).toBe('Sep 30');
    expect(at(new Date(2025, 11, 31, 12, 0))).toBe('Dec 31, 2025');
    expect(notificationTimeLabel('nope', now)).toBe('');
  });

  it('reads well to a screen reader', () => {
    const v = notificationView(row({ actor_verified: true, preview: 'so good' }));
    expect(notificationSpokenLabel(v, '5m')).toBe(
      'Unread. Auguste, verified, replied to your post. so good. New reply. 5m',
    );
  });
});
