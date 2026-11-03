/**
 * In-app notifications (client revisions 10/14 p.7 to 9). While the app is open the phone shows no
 * notification of its own (push.ts); LYSM shows its own banner instead, sliding down from the top.
 * This module is the pure part, shared by the banner and by taps on a push from outside the app:
 *
 *  - what a notification is about (its data, re-validated with Zod: it comes from outside the app);
 *  - the banner's two lines (exact client text for circle posts and replies, and the combined
 *    "[Name] and [N] others posted in [Circle name]." when several posts come in together);
 *  - which banners wait their turn and which are combined;
 *  - where a tap goes, as navigation params.
 *
 * No React, no I/O: Jest tests this file directly.
 */
import { z } from 'zod';
import type {
  NavigationState,
  NavigatorScreenParams,
  PartialState,
} from '@react-navigation/native';
import type { CirclesStackParamList, MainTabParamList } from '@/navigation/types';
import { DAILY_CHECKIN_ID, TRIAL_REMINDER_ID } from './reminderIds';

/** A banner stays up this long (the client's "about 4 seconds"). */
export const BANNER_VISIBLE_MS = 4000;
/** Posts combined into a showing banner restart its time, but never keep it up past this. */
export const BANNER_MAX_VISIBLE_MS = 10_000;
/** Banners waiting behind the one on screen. Older ones drop off. */
export const BANNER_QUEUE_MAX = 3;
/** How many recent notification ids are remembered, so one notification never shows twice. */
const RECENT_KEYS_MAX = 30;

export type RecapKind = 'weekly' | 'monthly' | 'yearly';
export type InsightsPeriod = 'week' | 'month' | 'year';

const PERIOD_FOR_RECAP: Record<RecapKind, InsightsPeriod> = {
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
};

/** What a notification is about. */
export type Topic =
  /** A new Circle post or reply (send-push "post_created"). */
  | { kind: 'post'; circleId: string; postId: string }
  /** Someone's first heart on the user's post or reply. */
  | { kind: 'post_reaction'; circleId: string; postId: string }
  /** Someone's first reaction to the user's shared entry (older builds' event). */
  | { kind: 'entry_reaction'; entryId: string }
  /** An entry shared into a Private circle (the push names no circle). */
  | { kind: 'shared_entry' }
  /** Anything else about one circle: approved request, join request, archive, unarchive, joins. */
  | { kind: 'circle'; circleId: string; tab?: 'members' }
  /** Weekly / Monthly / Yearly reflection ready (recap-notifications). */
  | { kind: 'recap'; recap: RecapKind; periodStart: string | null }
  /** The 8 PM streak reminder. */
  | { kind: 'streak' }
  /** The daily journaling reminder (scheduled on the phone). */
  | { kind: 'daily_checkin' }
  /** The free trial reminder (scheduled on the phone). */
  | { kind: 'trial' }
  | { kind: 'other' };

const id = z.guid().optional().catch(undefined);
const dataSchema = z.object({
  type: z.string().max(64).optional().catch(undefined),
  circle_id: id,
  post_id: id,
  entry_id: id,
  tab: z.literal('members').optional().catch(undefined),
  recap_type: z.enum(['weekly', 'monthly', 'yearly']).optional().catch(undefined),
  period_start: z.iso.date().optional().catch(undefined),
});

const CIRCLE_EVENTS = new Set([
  'added_to_circle',
  'join_request',
  'circle_archived',
  'circle_unarchived',
  'member_joined',
]);
/** Circle events that open the circle's Members tab (joins and requests to join are listed there). */
const MEMBERS_TAB_EVENTS = new Set(['join_request', 'member_joined']);

/**
 * What a notification is about, from its data (server pushes) or its id (reminders scheduled on the
 * phone, which carry no data). Anything unrecognised or malformed is 'other' (shown, opens nothing).
 */
export function topicFor(data: unknown, identifier: string): Topic {
  if (identifier === DAILY_CHECKIN_ID || identifier.startsWith(`${DAILY_CHECKIN_ID}-`)) {
    return { kind: 'daily_checkin' };
  }
  if (identifier === TRIAL_REMINDER_ID) return { kind: 'trial' };

  const parsed = dataSchema.safeParse(data ?? {});
  if (!parsed.success) return { kind: 'other' };
  const d = parsed.data;
  switch (d.type) {
    case 'post_created':
      return d.circle_id && d.post_id
        ? { kind: 'post', circleId: d.circle_id, postId: d.post_id }
        : d.circle_id
          ? { kind: 'circle', circleId: d.circle_id }
          : { kind: 'other' };
    case 'post_reaction':
      return d.circle_id && d.post_id
        ? { kind: 'post_reaction', circleId: d.circle_id, postId: d.post_id }
        : { kind: 'other' };
    case 'reaction':
      return d.entry_id
        ? { kind: 'entry_reaction', entryId: d.entry_id }
        : { kind: 'other' };
    case 'share_created':
      return { kind: 'shared_entry' };
    case 'recap':
      return d.recap_type
        ? { kind: 'recap', recap: d.recap_type, periodStart: d.period_start ?? null }
        : { kind: 'other' };
    case 'streak_reminder':
      return { kind: 'streak' };
    default:
      if (d.type && CIRCLE_EVENTS.has(d.type) && d.circle_id) {
        const membersTab = MEMBERS_TAB_EVENTS.has(d.type) || d.tab === 'members';
        return {
          kind: 'circle',
          circleId: d.circle_id,
          ...(membersTab ? { tab: 'members' } : {}),
        };
      }
      return { kind: 'other' };
  }
}

/**
 * The circle whose live page already shows this activity: no banner while the user is looking at
 * it (client p.8, point 11). Posts, replies and hearts all appear there live.
 */
export function liveActivityCircle(topic: Topic): string | null {
  return topic.kind === 'post' || topic.kind === 'post_reaction' ? topic.circleId : null;
}

// ---------------------------------------------------------------------------------------------
// Where a tap goes
// ---------------------------------------------------------------------------------------------

export type NavTarget =
  | { to: 'circles' }
  | { to: 'circle'; circleId: string; tab?: 'members' }
  /**
   * A post's page. `parentId`: the post it sits under (null = it is a top-level post; undefined =
   * not known yet, looked up before opening). `aimAtReply`: a reply opens its post's page aimed at
   * that reply (the composer set to answer it).
   */
  | {
      to: 'post';
      circleId: string;
      postId: string;
      parentId?: string | null;
      aimAtReply: boolean;
    }
  | { to: 'journal' }
  | { to: 'entry'; entryId: string }
  | { to: 'insights'; period?: InsightsPeriod; periodStart?: string }
  | { to: 'profile' };

/** Where tapping a notification about `topic` goes (null: nowhere, the banner just closes). */
export function targetForTopic(topic: Topic): NavTarget | null {
  switch (topic.kind) {
    case 'post':
      return {
        to: 'post',
        circleId: topic.circleId,
        postId: topic.postId,
        aimAtReply: true,
      };
    case 'post_reaction':
      return {
        to: 'post',
        circleId: topic.circleId,
        postId: topic.postId,
        aimAtReply: false,
      };
    case 'entry_reaction':
      return { to: 'entry', entryId: topic.entryId };
    case 'shared_entry':
      return { to: 'circles' };
    case 'circle':
      return {
        to: 'circle',
        circleId: topic.circleId,
        ...(topic.tab ? { tab: topic.tab } : {}),
      };
    case 'recap':
      return {
        to: 'insights',
        period: PERIOD_FOR_RECAP[topic.recap],
        ...(topic.periodStart ? { periodStart: topic.periodStart } : {}),
      };
    case 'streak':
    case 'daily_checkin':
      return { to: 'journal' };
    case 'trial':
      return { to: 'profile' };
    case 'other':
      return null;
  }
}

/**
 * Fills in what a post target still needs (the post it sits under) with `lookUp`, which returns the
 * post's parent (null for a top-level post) or undefined when the post can't be found (deleted, or
 * no longer visible). A post that can't be found opens its circle instead.
 */
export async function resolveTarget(
  target: NavTarget,
  lookUp: (postId: string) => Promise<string | null | undefined>,
): Promise<NavTarget> {
  if (target.to !== 'post' || target.parentId !== undefined) return target;
  let parentId: string | null | undefined;
  try {
    parentId = await lookUp(target.postId);
  } catch {
    parentId = undefined;
  }
  if (parentId === undefined) return { to: 'circle', circleId: target.circleId };
  return { ...target, parentId };
}

type CirclesRoute = {
  [K in keyof CirclesStackParamList]: { name: K; params?: CirclesStackParamList[K] };
}[keyof CirclesStackParamList];

/** The Circles tab opened on `routes` (Your Circles underneath, so Back goes the natural way). */
function circlesTab(routes: CirclesRoute[]): NavigatorScreenParams<MainTabParamList> {
  const state = {
    routes: [{ name: 'MyCircles' }, ...routes],
  } as PartialState<NavigationState>;
  return { screen: 'CirclesTab', params: { state } };
}

/**
 * Navigation params for `navigate('Main', …)`. A circle opens its page; a post opens that circle
 * and goes straight to the post (Back returns to the circle); a reply opens its post's page aimed at
 * the reply. Post targets must be resolved first (resolveTarget).
 */
export function planNavigation(
  target: NavTarget,
): NavigatorScreenParams<MainTabParamList> {
  switch (target.to) {
    case 'circles':
      return circlesTab([]);
    case 'circle':
      return circlesTab([
        {
          name: 'CircleDetail',
          params: {
            circleId: target.circleId,
            ...(target.tab ? { tab: target.tab } : {}),
          },
        },
      ]);
    case 'post': {
      const isReply = !!target.parentId;
      const thread: CirclesStackParamList['PostThread'] = isReply
        ? {
            circleId: target.circleId,
            postId: target.parentId as string,
            ...(target.aimAtReply ? { replyToId: target.postId } : {}),
          }
        : { circleId: target.circleId, postId: target.postId };
      return circlesTab([
        { name: 'CircleDetail', params: { circleId: target.circleId } },
        { name: 'PostThread', params: thread },
      ]);
    }
    case 'journal':
      // Just the tab: someone in the middle of writing an entry stays on it.
      return { screen: 'JournalTab' };
    case 'entry': {
      const state = {
        routes: [
          { name: 'JournalHome' },
          { name: 'EntryDetail', params: { entryId: target.entryId } },
        ],
      } as PartialState<NavigationState>;
      return { screen: 'JournalTab', params: { state } };
    }
    case 'insights':
      return {
        screen: 'InsightsTab',
        params: {
          ...(target.period ? { period: target.period } : {}),
          ...(target.periodStart ? { periodStart: target.periodStart } : {}),
        },
      };
    case 'profile':
      return { screen: 'ProfileTab' };
  }
}

// ---------------------------------------------------------------------------------------------
// Banner content
// ---------------------------------------------------------------------------------------------

/** One Circle post or reply, as the banner shows it. */
export interface BannerPost {
  id: string;
  circleId: string;
  /** The post it sits under (null: a top-level post). */
  parentId: string | null;
  authorId: string | null;
  authorName: string;
  /** The admin-only verified badge (N7), read live with the post. Absent = not verified. */
  authorVerified?: boolean;
  avatarUrl: string | null;
  circleName: string;
  /** What they wrote. */
  text: string;
}

export type BannerIcon =
  | 'chatbubble-ellipses'
  | 'chatbubbles'
  | 'heart'
  | 'people'
  | 'person-add'
  | 'archive'
  | 'sparkles'
  | 'flame'
  | 'book'
  | 'time'
  | 'notifications';

export interface BannerItem {
  /** The notification's id (one banner per notification). */
  key: string;
  /** Top line. */
  title: string;
  /**
   * The person's name the top line starts with, when they are verified (client 10/14 p.5, N7): the
   * badge shows right after it. Null: no badge.
   */
  verifiedName: string | null;
  /** Second line ('' = none). */
  body: string;
  /** Lines the second line may take: a post preview is one line. */
  bodyLines: 1 | 2;
  icon: BannerIcon;
  /** The person it's from, when it's someone's post or reply. */
  avatarUrl: string | null;
  /** The circle it's about, if any. */
  circleId: string | null;
  /** Top-level posts gathered into this banner, newest first. Only these combine (replies never do). */
  posts: BannerPost[];
  target: NavTarget | null;
  /** Bumps each time another post is combined in, so the banner restarts its time. */
  version: number;
  /** When it appeared (ms), null while waiting its turn. */
  shownAt: number | null;
}

/** A post's text on one line: line breaks and runs of spaces become single spaces. */
export function previewLine(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** Top line for a post (exact client text, p.8): "[Name] in [Circle name]". */
export function postBannerTitle(name: string, circleName: string): string {
  return `${name} in ${circleName}`;
}

/** Top line for a reply (exact client text, p.8): "[Name] replied in [Circle name]". */
export function replyBannerTitle(name: string, circleName: string): string {
  return `${name} replied in ${circleName}`;
}

/** Whole numbers with commas from 1,000 up. */
function formatCount(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Several posts at once (exact client text, p.8): "[Name] and [N] others posted in [Circle name]."
 * N counts the other people who posted ("1 other" for one).
 */
export function combinedPostsTitle(
  name: string,
  others: number,
  circleName: string,
): string {
  return `${name} and ${formatCount(others)} ${others === 1 ? 'other' : 'others'} posted in ${circleName}.`;
}

/** A person, for counting who posted (someone whose account is gone counts once per post). */
const personOf = (p: BannerPost) => p.authorId ?? `post:${p.id}`;

/** The name the badge follows when its writer is verified (every post title starts with it). */
const verifiedNameOf = (p: BannerPost) => (p.authorVerified ? p.authorName : null);

/** Lines, picture and tap target for the top-level posts gathered in one banner. */
function postsContent(
  posts: BannerPost[],
): Pick<
  BannerItem,
  'title' | 'verifiedName' | 'body' | 'bodyLines' | 'avatarUrl' | 'target'
> {
  const newest = posts[0];
  const people = new Set(posts.map(personOf));
  if (people.size <= 1) {
    return {
      title: postBannerTitle(newest.authorName, newest.circleName),
      verifiedName: verifiedNameOf(newest),
      body: previewLine(newest.text),
      bodyLines: 1,
      avatarUrl: newest.avatarUrl,
      target: {
        to: 'post',
        circleId: newest.circleId,
        postId: newest.id,
        parentId: null,
        aimAtReply: true,
      },
    };
  }
  return {
    title: combinedPostsTitle(newest.authorName, people.size - 1, newest.circleName),
    // The person it names is the newest poster.
    verifiedName: verifiedNameOf(newest),
    body: '',
    bodyLines: 1,
    avatarUrl: newest.avatarUrl,
    // Several posts: the circle itself, where they all are.
    target: { to: 'circle', circleId: newest.circleId },
  };
}

/** The banner for a Circle post or reply, from the post itself (exact client text). */
export function postBanner(key: string, post: BannerPost): BannerItem {
  if (post.parentId) {
    return {
      key,
      title: replyBannerTitle(post.authorName, post.circleName),
      verifiedName: verifiedNameOf(post),
      body: previewLine(post.text),
      bodyLines: 1,
      icon: 'chatbubbles',
      avatarUrl: post.avatarUrl,
      circleId: post.circleId,
      posts: [],
      target: {
        to: 'post',
        circleId: post.circleId,
        postId: post.id,
        parentId: post.parentId,
        aimAtReply: true,
      },
      version: 0,
      shownAt: null,
    };
  }
  return {
    key,
    icon: 'chatbubble-ellipses',
    circleId: post.circleId,
    posts: [post],
    version: 0,
    shownAt: null,
    ...postsContent([post]),
  };
}

const ICON_FOR: Record<Topic['kind'], BannerIcon> = {
  post: 'chatbubble-ellipses',
  post_reaction: 'heart',
  entry_reaction: 'heart',
  shared_entry: 'people',
  circle: 'people',
  recap: 'sparkles',
  streak: 'flame',
  daily_checkin: 'book',
  trial: 'time',
  other: 'notifications',
};

/** Any other notification: its own title and text, as the push would have shown them. */
export function notificationBanner(
  key: string,
  topic: Topic,
  title: string | null | undefined,
  body: string | null | undefined,
  data?: unknown,
): BannerItem {
  const type = (data as { type?: unknown } | null | undefined)?.type;
  const icon =
    type === 'member_joined'
      ? 'person-add'
      : type === 'circle_archived'
        ? 'archive'
        : ICON_FOR[topic.kind];
  const top = (title ?? '').trim();
  const text = (body ?? '').trim();
  return {
    key,
    // A notification with only text leads with it.
    title: top || text,
    verifiedName: null,
    body: top ? text : '',
    bodyLines: 2,
    icon,
    avatarUrl: null,
    circleId:
      topic.kind === 'post' || topic.kind === 'post_reaction' || topic.kind === 'circle'
        ? topic.circleId
        : null,
    posts: [],
    target: targetForTopic(topic),
    version: 0,
    shownAt: null,
  };
}

// ---------------------------------------------------------------------------------------------
// The banner queue
// ---------------------------------------------------------------------------------------------

export interface BannerState {
  current: BannerItem | null;
  queue: BannerItem[];
  /** Recent notification ids, newest first. */
  recentKeys: string[];
}

export const EMPTY_BANNERS: BannerState = { current: null, queue: [], recentKeys: [] };

/** Two banners combine when both are top-level posts in the same circle. */
function combines(a: BannerItem, b: BannerItem): boolean {
  return a.posts.length > 0 && b.posts.length > 0 && a.circleId === b.circleId;
}

function combine(older: BannerItem, newer: BannerItem): BannerItem {
  const seen = new Set<string>();
  const posts = [...newer.posts, ...older.posts].filter((p) =>
    seen.has(p.id) ? false : (seen.add(p.id), true),
  );
  return { ...older, ...postsContent(posts), posts, version: older.version + 1 };
}

/**
 * A notification arrives. Posts in the same circle as the banner on screen, or one waiting, are
 * combined into it ("at once" = while that banner is showing or waiting, up to
 * BANNER_MAX_VISIBLE_MS on screen). Otherwise it shows now, or waits its turn.
 */
export function receiveBanner(
  state: BannerState,
  item: BannerItem,
  now: number,
): BannerState {
  if (state.recentKeys.includes(item.key)) return state;
  const recentKeys = [item.key, ...state.recentKeys].slice(0, RECENT_KEYS_MAX);
  const cur = state.current;
  if (
    cur &&
    combines(cur, item) &&
    (cur.shownAt === null || now - cur.shownAt < BANNER_MAX_VISIBLE_MS)
  ) {
    return { ...state, recentKeys, current: combine(cur, item) };
  }
  const waiting = state.queue.findIndex((q) => combines(q, item));
  if (waiting >= 0) {
    const queue = state.queue.slice();
    queue[waiting] = combine(queue[waiting], item);
    return { ...state, recentKeys, queue };
  }
  if (!cur) return { ...state, recentKeys, current: { ...item, shownAt: now } };
  return { ...state, recentKeys, queue: [...state.queue, item].slice(-BANNER_QUEUE_MAX) };
}

/** The banner on screen is gone: the next one still wanted (`keep`) shows. */
export function nextBanner(
  state: BannerState,
  now: number,
  keep: (item: BannerItem) => boolean = () => true,
): BannerState {
  const queue = state.queue.filter(keep);
  const [next, ...rest] = queue;
  return { ...state, current: next ? { ...next, shownAt: now } : null, queue: rest };
}

/** Nothing may show (onboarding, paywall, sign-in, crisis pop-up): drop what's up and waiting. */
export function clearBanners(state: BannerState): BannerState {
  if (!state.current && state.queue.length === 0) return state;
  return { ...state, current: null, queue: [] };
}

/** How much longer the banner on screen stays (restarted by a combined post, within the cap). */
export function visibleFor(item: BannerItem, now: number): number {
  if (item.shownAt === null) return BANNER_VISIBLE_MS;
  const capLeft = item.shownAt + BANNER_MAX_VISIBLE_MS - now;
  return Math.max(0, Math.min(BANNER_VISIBLE_MS, capLeft));
}

/** Swipe up far or fast enough to dismiss (otherwise the banner springs back). */
export function releaseDismisses(dy: number, vy: number): boolean {
  return dy < -24 || vy < -0.5;
}

/** How far the banner follows a drag: freely upward, only a little downward. */
export function dragOffset(dy: number): number {
  return dy < 0 ? dy : dy / 4;
}

// ---------------------------------------------------------------------------------------------
// Where banners may show
// ---------------------------------------------------------------------------------------------

/**
 * Banners only show inside the app's main screens: never in onboarding, on a paywall (the main one or
 * Welcome back), on the sign-in / sign-up screens, the email confirmation or the password reset
 * (client p.8). All of those are root screens other than Main.
 */
export function bannersAllowedOn(rootRouteName: string | undefined): boolean {
  return rootRouteName === 'Main';
}

/** The circle screens that show a circle's posts and replies live. */
const LIVE_CIRCLE_ROUTES = new Set(['CircleDetail', 'CircleFeed', 'PostThread']);

/** True when the focused screen is that circle's page (its feed, a post, or its members). */
export function isViewingCircle(
  route: { name: string; params?: object } | undefined,
  circleId: string,
): boolean {
  if (!route || !LIVE_CIRCLE_ROUTES.has(route.name)) return false;
  return (route.params as { circleId?: unknown } | undefined)?.circleId === circleId;
}
