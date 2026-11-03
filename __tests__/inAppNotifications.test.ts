/**
 * In-app notification banners (client revisions 10/14 p.7 to 9), the pure rules:
 *  - what a notification is about (data re-validated; reminders known by their id);
 *  - the circle banner lines, word for word: "[Name] in [Circle name]", "[Name] replied in
 *    [Circle name]", and "[Name] and [N] others posted in [Circle name]." for several at once;
 *  - which banners combine and which wait; the 4 second time and its cap; swipe up to dismiss;
 *  - where a tap goes (a post opens its circle then the post, a reply aims at the reply, a
 *    reflection opens Insights on that period, the streak reminder opens the Journal tab);
 *  - where banners may show (only the app's main screens; not the circle being looked at).
 */
import {
  BANNER_MAX_VISIBLE_MS,
  BANNER_QUEUE_MAX,
  BANNER_VISIBLE_MS,
  EMPTY_BANNERS,
  bannersAllowedOn,
  clearBanners,
  combinedPostsTitle,
  dragOffset,
  isViewingCircle,
  liveActivityCircle,
  nextBanner,
  notificationBanner,
  planNavigation,
  postBanner,
  postBannerTitle,
  previewLine,
  receiveBanner,
  releaseDismisses,
  replyBannerTitle,
  resolveTarget,
  targetForTopic,
  topicFor,
  visibleFor,
  type BannerPost,
} from '@features/notifications/inAppModel';

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const P2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const P3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ROOT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const E1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const post = (over: Partial<BannerPost> = {}): BannerPost => ({
  id: P1,
  circleId: C1,
  parentId: null,
  authorId: 'u-auguste',
  authorName: 'Auguste',
  avatarUrl: null,
  circleName: 'Konah’s Friends',
  text: 'Morning walk\n\nfelt   great',
  ...over,
});

describe('topicFor', () => {
  it('reads each server push', () => {
    expect(topicFor({ type: 'post_created', circle_id: C1, post_id: P1 }, 'n1')).toEqual({
      kind: 'post',
      circleId: C1,
      postId: P1,
    });
    expect(topicFor({ type: 'post_reaction', circle_id: C1, post_id: P1 }, 'n2')).toEqual({
      kind: 'post_reaction',
      circleId: C1,
      postId: P1,
    });
    expect(topicFor({ type: 'reaction', entry_id: E1 }, 'n3')).toEqual({
      kind: 'entry_reaction',
      entryId: E1,
    });
    expect(topicFor({ type: 'share_created' }, 'n4')).toEqual({ kind: 'shared_entry' });
    expect(topicFor({ type: 'added_to_circle', circle_id: C1 }, 'n5')).toEqual({
      kind: 'circle',
      circleId: C1,
    });
    expect(topicFor({ type: 'circle_archived', circle_id: C1 }, 'n6')).toEqual({
      kind: 'circle',
      circleId: C1,
    });
    expect(topicFor({ type: 'circle_unarchived', circle_id: C1 }, 'n7')).toEqual({
      kind: 'circle',
      circleId: C1,
    });
    expect(topicFor({ type: 'member_joined', circle_id: C1, tab: 'members' }, 'n8')).toEqual({
      kind: 'circle',
      circleId: C1,
      tab: 'members',
    });
    expect(topicFor({ type: 'join_request', circle_id: C1 }, 'n9')).toEqual({
      kind: 'circle',
      circleId: C1,
      tab: 'members',
    });
    expect(
      topicFor({ type: 'recap', recap_type: 'monthly', period_start: '2026-09-01' }, 'n10'),
    ).toEqual({ kind: 'recap', recap: 'monthly', periodStart: '2026-09-01' });
    // Pushes sent before period_start was added still open the right view.
    expect(topicFor({ type: 'recap', recap_type: 'weekly' }, 'n11')).toEqual({
      kind: 'recap',
      recap: 'weekly',
      periodStart: null,
    });
    expect(topicFor({ type: 'streak_reminder' }, 'n12')).toEqual({ kind: 'streak' });
  });

  it('knows the reminders scheduled on the phone by their id', () => {
    expect(topicFor({}, 'ic-daily-checkin-2026-10-20')).toEqual({ kind: 'daily_checkin' });
    expect(topicFor(undefined, 'ic-daily-checkin')).toEqual({ kind: 'daily_checkin' });
    expect(topicFor({}, 'ic-trial-day4')).toEqual({ kind: 'trial' });
  });

  it('never trusts malformed data', () => {
    expect(topicFor({ type: 'post_created', circle_id: 'x', post_id: P1 }, 'a')).toEqual({
      kind: 'other',
    });
    expect(topicFor({ type: 'post_created', circle_id: C1, post_id: 'nope' }, 'b')).toEqual({
      kind: 'circle',
      circleId: C1,
    });
    expect(topicFor({ type: 'recap', recap_type: 'daily' }, 'c')).toEqual({ kind: 'other' });
    expect(
      topicFor({ type: 'recap', recap_type: 'weekly', period_start: 'not a date' }, 'd'),
    ).toEqual({ kind: 'recap', recap: 'weekly', periodStart: null });
    expect(topicFor('junk', 'e')).toEqual({ kind: 'other' });
    expect(topicFor({ type: 'something_new' }, 'f')).toEqual({ kind: 'other' });
  });

  it('only posts, replies and hearts appear live in the circle being viewed', () => {
    expect(liveActivityCircle({ kind: 'post', circleId: C1, postId: P1 })).toBe(C1);
    expect(liveActivityCircle({ kind: 'post_reaction', circleId: C1, postId: P1 })).toBe(C1);
    expect(liveActivityCircle({ kind: 'circle', circleId: C1 })).toBeNull();
    expect(liveActivityCircle({ kind: 'streak' })).toBeNull();
  });
});

describe('banner lines (exact client text)', () => {
  it('post, reply and several posts at once', () => {
    expect(postBannerTitle('Auguste', 'Konah’s Friends')).toBe('Auguste in Konah’s Friends');
    expect(replyBannerTitle('Auguste', 'Konah’s Friends')).toBe(
      'Auguste replied in Konah’s Friends',
    );
    expect(combinedPostsTitle('Auguste', 2, 'Konah’s Friends')).toBe(
      'Auguste and 2 others posted in Konah’s Friends.',
    );
    expect(combinedPostsTitle('Auguste', 1, 'Konah’s Friends')).toBe(
      'Auguste and 1 other posted in Konah’s Friends.',
    );
    expect(combinedPostsTitle('Auguste', 1200, 'Big')).toBe(
      'Auguste and 1,200 others posted in Big.',
    );
  });

  it('second line is a one line preview of what they wrote', () => {
    expect(previewLine('Morning walk\n\nfelt   great ')).toBe('Morning walk felt great');
    expect(previewLine(null)).toBe('');
    const b = postBanner('n1', post());
    expect(b.title).toBe('Auguste in Konah’s Friends');
    expect(b.body).toBe('Morning walk felt great');
    expect(b.bodyLines).toBe(1);
  });

  it('a reply names it a reply and opens its post aimed at the reply', () => {
    const b = postBanner('n1', post({ id: P2, parentId: ROOT, text: 'Same here!' }));
    expect(b.title).toBe('Auguste replied in Konah’s Friends');
    expect(b.body).toBe('Same here!');
    expect(b.posts).toEqual([]); // replies never combine
    expect(b.target).toEqual({
      to: 'post',
      circleId: C1,
      postId: P2,
      parentId: ROOT,
      aimAtReply: true,
    });
  });

  it('the verified badge follows a verified writer’s name (N7.15), and nobody else’s', () => {
    expect(postBanner('n1', post({ authorVerified: true })).verifiedName).toBe('Auguste');
    expect(postBanner('n2', post()).verifiedName).toBeNull();
    expect(postBanner('n3', post({ authorVerified: false })).verifiedName).toBeNull();
    const reply = postBanner('n4', post({ id: P2, parentId: ROOT, authorVerified: true }));
    expect(reply.title.startsWith(reply.verifiedName ?? '?')).toBe(true);
    // Several posts at once name the newest poster: the badge is theirs.
    let s = receiveBanner(EMPTY_BANNERS, postBanner('n5', post({ authorVerified: true })), 0);
    s = receiveBanner(
      s,
      postBanner('n6', post({ id: P2, authorId: 'u-mia', authorName: 'Mia' })),
      100,
    );
    expect(s.current?.title).toBe('Mia and 1 other posted in Konah’s Friends.');
    expect(s.current?.verifiedName).toBeNull();
    s = receiveBanner(
      s,
      postBanner('n7', post({ id: P3, authorId: 'u-noor', authorName: 'Noor', authorVerified: true })),
      200,
    );
    expect(s.current?.title).toBe('Noor and 2 others posted in Konah’s Friends.');
    expect(s.current?.verifiedName).toBe('Noor');
    // Other notifications never carry it.
    expect(notificationBanner('n8', { kind: 'streak' }, 'A', 'B').verifiedName).toBeNull();
  });

  it('other notifications keep their own title and text', () => {
    const topic = topicFor({ type: 'streak_reminder' }, 'n1');
    const b = notificationBanner('n1', topic, 'Don’t lose your streak', 'Keep it going.');
    expect(b.title).toBe('Don’t lose your streak');
    expect(b.body).toBe('Keep it going.');
    expect(b.icon).toBe('flame');
    expect(b.target).toEqual({ to: 'journal' });
    const onlyText = notificationBanner('n2', { kind: 'other' }, '', 'Just text');
    expect(onlyText.title).toBe('Just text');
    expect(onlyText.body).toBe('');
    expect(
      notificationBanner('n3', topicFor({ type: 'member_joined', circle_id: C1 }, 'n3'), 'a', 'b', {
        type: 'member_joined',
      }).icon,
    ).toBe('person-add');
  });
});

describe('the banner queue', () => {
  it('shows the first now; others wait their turn, newest kept when too many', () => {
    let s = receiveBanner(EMPTY_BANNERS, notificationBanner('a', { kind: 'streak' }, 'A', ''), 1000);
    expect(s.current?.key).toBe('a');
    expect(s.current?.shownAt).toBe(1000);
    for (const k of ['b', 'c', 'd', 'e']) {
      s = receiveBanner(s, notificationBanner(k, { kind: 'other' }, k, ''), 1100);
    }
    expect(s.queue.map((q) => q.key)).toEqual(['c', 'd', 'e']);
    expect(s.queue).toHaveLength(BANNER_QUEUE_MAX);
    s = nextBanner(s, 5000);
    expect(s.current?.key).toBe('c');
    expect(s.current?.shownAt).toBe(5000);
  });

  it('never shows one notification twice', () => {
    const item = notificationBanner('same', { kind: 'other' }, 'A', '');
    const s1 = receiveBanner(EMPTY_BANNERS, item, 0);
    expect(receiveBanner(s1, item, 10)).toBe(s1);
  });

  it('several posts in one circle at once become one banner', () => {
    let s = receiveBanner(EMPTY_BANNERS, postBanner('n1', post({ id: P1 })), 0);
    s = receiveBanner(
      s,
      postBanner('n2', post({ id: P2, authorId: 'u-mia', authorName: 'Mia' })),
      500,
    );
    s = receiveBanner(
      s,
      postBanner('n3', post({ id: P3, authorId: 'u-noor', authorName: 'Noor' })),
      900,
    );
    expect(s.queue).toEqual([]);
    expect(s.current?.title).toBe('Noor and 2 others posted in Konah’s Friends.');
    expect(s.current?.body).toBe('');
    expect(s.current?.version).toBe(2);
    expect(s.current?.target).toEqual({ to: 'circle', circleId: C1 });
  });

  it('several posts by one person stay a single post banner showing the newest', () => {
    let s = receiveBanner(EMPTY_BANNERS, postBanner('n1', post({ id: P1, text: 'first' })), 0);
    s = receiveBanner(s, postBanner('n2', post({ id: P2, text: 'second' })), 100);
    expect(s.current?.title).toBe('Auguste in Konah’s Friends');
    expect(s.current?.body).toBe('second');
    expect(s.current?.target).toMatchObject({ to: 'post', postId: P2, parentId: null });
  });

  it('posts in another circle, and replies, do not combine', () => {
    let s = receiveBanner(EMPTY_BANNERS, postBanner('n1', post()), 0);
    s = receiveBanner(s, postBanner('n2', post({ id: P2, circleId: C2, circleName: 'Work' })), 10);
    s = receiveBanner(s, postBanner('n3', post({ id: P3, parentId: ROOT })), 20);
    expect(s.current?.title).toBe('Auguste in Konah’s Friends');
    expect(s.queue.map((q) => q.title)).toEqual([
      'Auguste in Work',
      'Auguste replied in Konah’s Friends',
    ]);
  });

  it('a post combines with one waiting for the same circle', () => {
    let s = receiveBanner(EMPTY_BANNERS, notificationBanner('x', { kind: 'streak' }, 'X', ''), 0);
    s = receiveBanner(s, postBanner('n1', post()), 10);
    s = receiveBanner(s, postBanner('n2', post({ id: P2, authorId: 'u-mia', authorName: 'Mia' })), 20);
    expect(s.queue).toHaveLength(1);
    expect(s.queue[0].title).toBe('Mia and 1 other posted in Konah’s Friends.');
  });

  it('stops combining into a banner that has been up for the cap', () => {
    let s = receiveBanner(EMPTY_BANNERS, postBanner('n1', post()), 0);
    s = receiveBanner(
      s,
      postBanner('n2', post({ id: P2, authorId: 'u-mia', authorName: 'Mia' })),
      BANNER_MAX_VISIBLE_MS,
    );
    expect(s.current?.key).toBe('n1');
    expect(s.current?.title).toBe('Auguste in Konah’s Friends');
    expect(s.queue.map((q) => q.key)).toEqual(['n2']);
  });

  it('skips waiting banners no longer wanted, and clears everything when blocked', () => {
    let s = receiveBanner(EMPTY_BANNERS, notificationBanner('a', { kind: 'other' }, 'A', ''), 0);
    s = receiveBanner(s, notificationBanner('b', { kind: 'other' }, 'B', ''), 0);
    s = receiveBanner(s, notificationBanner('c', { kind: 'other' }, 'C', ''), 0);
    expect(nextBanner(s, 1, (i) => i.key !== 'b').current?.key).toBe('c');
    const cleared = clearBanners(s);
    expect(cleared.current).toBeNull();
    expect(cleared.queue).toEqual([]);
    expect(clearBanners(cleared)).toBe(cleared);
  });
});

describe('time on screen and swipe up', () => {
  it('about 4 seconds, restarted by a combined post but never past the cap', () => {
    const item = { ...postBanner('n1', post()), shownAt: 0 };
    expect(BANNER_VISIBLE_MS).toBe(4000);
    expect(visibleFor(item, 0)).toBe(4000);
    expect(visibleFor(item, 3000)).toBe(4000);
    expect(visibleFor(item, BANNER_MAX_VISIBLE_MS - 1000)).toBe(1000);
    expect(visibleFor(item, BANNER_MAX_VISIBLE_MS + 5)).toBe(0);
  });

  it('dismisses on a far or fast swipe up only', () => {
    expect(releaseDismisses(-40, 0)).toBe(true);
    expect(releaseDismisses(-5, -1)).toBe(true);
    expect(releaseDismisses(-10, -0.1)).toBe(false);
    expect(releaseDismisses(30, 0.5)).toBe(false);
    expect(dragOffset(-50)).toBe(-50);
    expect(dragOffset(40)).toBe(10);
  });
});

describe('where a tap goes', () => {
  it('a post opens its circle, then the post', async () => {
    const t = targetForTopic({ kind: 'post', circleId: C1, postId: P1 })!;
    const resolved = await resolveTarget(t, async () => null);
    expect(planNavigation(resolved)).toEqual({
      screen: 'CirclesTab',
      params: {
        state: {
          routes: [
            { name: 'MyCircles' },
            { name: 'CircleDetail', params: { circleId: C1 } },
            { name: 'PostThread', params: { circleId: C1, postId: P1 } },
          ],
        },
      },
    });
  });

  it('a reply opens its post’s page aimed at that reply', async () => {
    const t = targetForTopic({ kind: 'post', circleId: C1, postId: P2 })!;
    const resolved = await resolveTarget(t, async (id) => (id === P2 ? ROOT : null));
    expect(planNavigation(resolved)).toEqual({
      screen: 'CirclesTab',
      params: {
        state: {
          routes: [
            { name: 'MyCircles' },
            { name: 'CircleDetail', params: { circleId: C1 } },
            { name: 'PostThread', params: { circleId: C1, postId: ROOT, replyToId: P2 } },
          ],
        },
      },
    });
  });

  it('a heart on a reply opens that post (not aimed at a reply)', async () => {
    const t = targetForTopic({ kind: 'post_reaction', circleId: C1, postId: P2 })!;
    const resolved = await resolveTarget(t, async () => ROOT);
    expect(planNavigation(resolved)).toMatchObject({
      params: {
        state: { routes: [{}, {}, { name: 'PostThread', params: { circleId: C1, postId: ROOT } }] },
      },
    });
  });

  it('a post that is gone opens its circle', async () => {
    const t = targetForTopic({ kind: 'post', circleId: C1, postId: P1 })!;
    expect(await resolveTarget(t, async () => undefined)).toEqual({ to: 'circle', circleId: C1 });
    expect(
      await resolveTarget(t, async () => {
        throw new Error('offline');
      }),
    ).toEqual({ to: 'circle', circleId: C1 });
  });

  it('circle notices open the circle; joins and requests open Members', () => {
    expect(planNavigation(targetForTopic({ kind: 'circle', circleId: C1 })!)).toEqual({
      screen: 'CirclesTab',
      params: {
        state: {
          routes: [{ name: 'MyCircles' }, { name: 'CircleDetail', params: { circleId: C1 } }],
        },
      },
    });
    expect(
      planNavigation(targetForTopic({ kind: 'circle', circleId: C1, tab: 'members' })!),
    ).toMatchObject({
      params: {
        state: { routes: [{}, { name: 'CircleDetail', params: { circleId: C1, tab: 'members' } }] },
      },
    });
    expect(planNavigation(targetForTopic({ kind: 'shared_entry' })!)).toEqual({
      screen: 'CirclesTab',
      params: { state: { routes: [{ name: 'MyCircles' }] } },
    });
  });

  it('a reflection opens Insights on that view and period', () => {
    expect(
      planNavigation(
        targetForTopic({ kind: 'recap', recap: 'monthly', periodStart: '2026-09-01' })!,
      ),
    ).toEqual({ screen: 'InsightsTab', params: { period: 'month', periodStart: '2026-09-01' } });
    expect(
      planNavigation(targetForTopic({ kind: 'recap', recap: 'yearly', periodStart: null })!),
    ).toEqual({ screen: 'InsightsTab', params: { period: 'year' } });
  });

  it('the streak and journaling reminders open the Journal tab; the trial reminder Profile', () => {
    expect(planNavigation(targetForTopic({ kind: 'streak' })!)).toEqual({ screen: 'JournalTab' });
    expect(planNavigation(targetForTopic({ kind: 'daily_checkin' })!)).toEqual({
      screen: 'JournalTab',
    });
    expect(planNavigation(targetForTopic({ kind: 'trial' })!)).toEqual({ screen: 'ProfileTab' });
    expect(planNavigation(targetForTopic({ kind: 'entry_reaction', entryId: E1 })!)).toEqual({
      screen: 'JournalTab',
      params: {
        state: {
          routes: [{ name: 'JournalHome' }, { name: 'EntryDetail', params: { entryId: E1 } }],
        },
      },
    });
    expect(targetForTopic({ kind: 'other' })).toBeNull();
  });
});

describe('where banners may show', () => {
  it('only inside the app’s main screens', () => {
    expect(bannersAllowedOn('Main')).toBe(true);
    for (const r of [
      'Onboarding',
      'Paywall',
      'Auth',
      'Splash',
      'EmailConfirmation',
      'ResetPassword',
      'WelcomeBack',
      undefined,
    ]) {
      expect(bannersAllowedOn(r)).toBe(false);
    }
  });

  it('knows when the user is looking at that circle', () => {
    expect(isViewingCircle({ name: 'CircleDetail', params: { circleId: C1 } }, C1)).toBe(true);
    expect(isViewingCircle({ name: 'CircleFeed', params: { circleId: C1 } }, C1)).toBe(true);
    expect(
      isViewingCircle({ name: 'PostThread', params: { circleId: C1, postId: P1 } }, C1),
    ).toBe(true);
    expect(isViewingCircle({ name: 'CircleDetail', params: { circleId: C2 } }, C1)).toBe(false);
    expect(isViewingCircle({ name: 'EditCircle', params: { circleId: C1 } }, C1)).toBe(false);
    expect(isViewingCircle({ name: 'JournalHome' }, C1)).toBe(false);
    expect(isViewingCircle(undefined, C1)).toBe(false);
  });
});
