/**
 * Live circles (client revisions 10/14 p.7, Public and Private alike): while a circle (or one of its
 * posts) is open, new posts, prompts and replies from other members, hearts, reply counts, edits and
 * deletions show up on their own, with no leaving and coming back and no pull to refresh.
 *
 * One channel per open circle, shared by every screen showing it, closed a moment after the last
 * one leaves (or is hidden behind another tab) and whenever the app goes to the background. Signals are gathered for a moment and
 * applied once: counts and deletions are patched in place, a new post is loaded by itself and placed
 * in order, a thread with new replies reloads just its replies. Nothing is reloaded whole for one
 * change. Opening a circle, and coming back to the app, loads anything new right away.
 */
import { useContext, useEffect, useState } from 'react';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import type { QueryClient } from '@tanstack/react-query';
import { queryClient } from '@lib';
import { useCurrentUser } from '@store/session';
import { openCirclePostsChannel, type LivePostSignal, type LiveStatus } from './liveApi';
import {
  feedKeyInfo,
  insertIntoFeed,
  mapCachedPosts,
  planLiveBatch,
  queryInCircle,
} from './liveFeed';
import { fetchPost, type PostWithAuthor } from './postsApi';
import { postKeys } from './postKeys';

/** Signals arriving within this long (ms) are applied together. */
export const LIVE_FLUSH_MS = 300;
/** A circle's channel stays open this long (ms) after its last screen closes (quick back and forth). */
export const LIVE_LINGER_MS = 3000;
/** More new or edited posts than this in one burst: reload the circle's feed instead of each post. */
export const LIVE_MAX_FETCH = 6;

interface Entry {
  circleId: string;
  viewerId: string;
  refs: number;
  /** Closes the open channel (null: none open). */
  stop: (() => Promise<void>) | null;
  /** The previous channel still leaving: a reopen waits for it. */
  closing: Promise<void> | null;
  live: boolean;
  joinedOnce: boolean;
  linger: ReturnType<typeof setTimeout> | null;
  queue: LivePostSignal[];
  flushTimer: ReturnType<typeof setTimeout> | null;
}

const entries = new Map<string, Entry>();
let appStateSub: NativeEventSubscription | null = null;
let inBackground = false;

/** Posts recently deleted (or no longer visible), so a list holding new posts back drops them. */
const removedIds = new Set<string>();
const REMOVED_KEEP = 500;
function noteRemoved(id: string) {
  removedIds.delete(id);
  removedIds.add(id);
  if (removedIds.size > REMOVED_KEEP) removedIds.delete(removedIds.values().next().value!);
}
export const wasRemovedLive = (id: string) => removedIds.has(id);

const allPostQueries = (qc: QueryClient) =>
  qc.getQueryCache().findAll({ queryKey: postKeys.all });

/** Patch every cached copy of the posts `fix` changes, keeping each query's load time. */
function patchEverywhere(
  qc: QueryClient,
  fix: (p: PostWithAuthor) => PostWithAuthor | null,
) {
  for (const q of allPostQueries(qc)) {
    const next = mapCachedPosts(q.state.data, fix);
    if (next !== q.state.data)
      qc.setQueryData(q.queryKey, next, { updatedAt: q.state.dataUpdatedAt });
  }
}

/**
 * Reload this circle's cached posts loaded before `olderThan` (ms): what's on screen refetches now,
 * the rest when next shown. A load already running is reused, never restarted.
 */
export function catchUpCircle(qc: QueryClient, circleId: string, olderThan: number) {
  const circleOfPost = (id: string) =>
    qc.getQueryData<PostWithAuthor | null>(postKeys.post(id))?.circle_id ?? undefined;
  void qc.invalidateQueries(
    {
      queryKey: postKeys.all,
      predicate: (q) =>
        q.state.dataUpdatedAt < olderThan &&
        queryInCircle(q.queryKey, q.state.data, circleId, circleOfPost),
    },
    { cancelRefetch: false },
  );
}

/** Apply one burst of a circle's signals to the cache. */
export async function applyLiveBatch(
  qc: QueryClient,
  circleId: string,
  viewerId: string,
  signals: readonly LivePostSignal[],
): Promise<void> {
  const plan = planLiveBatch(signals);

  // Deletions and new counts: patched where they're shown, nothing reloaded.
  for (const id of plan.removed.keys()) noteRemoved(id);
  for (const id of plan.newPosts) removedIds.delete(id);
  if (plan.removed.size || plan.counts.size) {
    patchEverywhere(qc, (p) => {
      if (plan.removed.has(p.id)) return null;
      const c = plan.counts.get(p.id);
      return c && (c.like_count !== p.like_count || c.reply_count !== p.reply_count)
        ? { ...p, like_count: c.like_count, reply_count: c.reply_count }
        : p;
    });
  }
  // A preview window that lost a post refills from the next one down (a handful of rows).
  if ([...plan.removed.values()].some((parent) => parent === null)) {
    void qc.invalidateQueries({ queryKey: [...postKeys.feed(circleId), 'preview'] });
  }
  // New replies: only those threads' reply lists reload (and only if they're on screen).
  for (const parentId of plan.newReplyParents) {
    void qc.invalidateQueries({ queryKey: postKeys.replies(parentId) });
  }

  const toLoad = [...plan.newPosts, ...plan.edited];
  if (toLoad.length === 0) return;
  if (toLoad.length > LIVE_MAX_FETCH) {
    catchUpCircle(qc, circleId, Number.POSITIVE_INFINITY);
    return;
  }
  const loaded = await Promise.all(toLoad.map((id) => fetchPost(id, viewerId)));
  const isNew = new Set(plan.newPosts);
  toLoad.forEach((id, i) => {
    const post = loaded[i];
    if (!post) {
      // Not visible to this person after all (e.g. a Private thread from before they joined).
      noteRemoved(id);
      patchEverywhere(qc, (p) => (p.id === id ? null : p));
      return;
    }
    if (isNew.has(id)) {
      for (const q of qc.getQueryCache().findAll({ queryKey: postKeys.feed(circleId) })) {
        const info = feedKeyInfo(q.queryKey, circleId);
        if (!info) continue;
        const next = insertIntoFeed(q.state.data, post, info);
        if (next !== q.state.data)
          qc.setQueryData(q.queryKey, next, { updatedAt: q.state.dataUpdatedAt });
      }
    }
    patchEverywhere(qc, (p) => (p.id === id ? post : p));
  });
}

function flush(e: Entry) {
  const batch = e.queue;
  e.queue = [];
  e.flushTimer = null;
  if (batch.length === 0) return;
  // If a burst can't be applied (say the network dropped), load the circle's posts again instead.
  applyLiveBatch(queryClient, e.circleId, e.viewerId, batch).catch(() =>
    catchUpCircle(queryClient, e.circleId, Date.now()),
  );
}

function open(e: Entry) {
  const requestedAt = Date.now();
  // Anything loaded before now may have missed changes: load it again right away.
  catchUpCircle(queryClient, e.circleId, requestedAt);
  e.live = false;
  e.joinedOnce = false;
  let stopChannel: (() => Promise<void>) | null = null;
  let cancelled = false;
  const previous = e.closing ?? Promise.resolve();
  void previous.then(() => {
    if (cancelled) return;
    stopChannel = openCirclePostsChannel(e.circleId, {
      onSignal: (signal) => {
        e.queue.push(signal);
        e.flushTimer ??= setTimeout(() => flush(e), LIVE_FLUSH_MS);
      },
      onStatus: (status: LiveStatus) => {
        if (cancelled) return;
        if (status === 'live') {
          // First join: cover the moment between loading and listening. A rejoin after a drop:
          // anything may have been missed while it was down.
          catchUpCircle(queryClient, e.circleId, e.joinedOnce ? Date.now() : requestedAt);
          e.joinedOnce = true;
          e.live = true;
        } else {
          e.live = false;
        }
      },
    });
  });
  e.stop = async () => {
    cancelled = true;
    if (stopChannel) await stopChannel();
  };
}

function close(e: Entry) {
  if (e.flushTimer) clearTimeout(e.flushTimer);
  e.flushTimer = null;
  e.queue = [];
  e.live = false;
  const stop = e.stop;
  e.stop = null;
  if (!stop) return;
  const closing: Promise<void> = stop()
    .catch(() => undefined)
    .finally(() => {
      if (e.closing === closing) e.closing = null;
    });
  e.closing = closing;
}

function onAppState(state: AppStateStatus) {
  if (state === 'background') {
    inBackground = true;
    for (const e of [...entries.values()]) {
      close(e);
      if (e.refs === 0) forget(e);
    }
  } else if (state === 'active' && inBackground) {
    inBackground = false;
    // Back in the app: reopen what's on screen, loading anything new right away.
    for (const e of entries.values()) if (e.refs > 0 && !e.stop) open(e);
  }
}

function forget(e: Entry) {
  if (e.linger) clearTimeout(e.linger);
  e.linger = null;
  entries.delete(e.circleId);
  if (entries.size === 0) {
    appStateSub?.remove();
    appStateSub = null;
  }
}

/**
 * Start following a circle live (screens call this through useCircleLive). Returns release().
 * Exported for tests.
 */
export function acquireCircleLive(circleId: string, viewerId: string): () => void {
  let e = entries.get(circleId);
  if (!e) {
    e = {
      circleId,
      viewerId,
      refs: 0,
      stop: null,
      closing: null,
      live: false,
      joinedOnce: false,
      linger: null,
      queue: [],
      flushTimer: null,
    };
    entries.set(circleId, e);
  }
  const entry = e;
  entry.viewerId = viewerId;
  entry.refs += 1;
  if (entry.linger) {
    clearTimeout(entry.linger);
    entry.linger = null;
  }
  if (!appStateSub) {
    inBackground = AppState.currentState === 'background';
    appStateSub = AppState.addEventListener('change', onAppState);
  }
  if (!inBackground) {
    if (!entry.stop) open(entry);
    // Already open but not connected right now: nothing is arriving live, so load what's new.
    else if (!entry.live) catchUpCircle(queryClient, circleId, Date.now());
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    entry.linger = setTimeout(() => {
      entry.linger = null;
      if (entry.refs > 0) return;
      close(entry);
      forget(entry);
    }, LIVE_LINGER_MS);
  };
}

/** Whether the screen this is in is the one showing (always true outside navigation). */
function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return focused;
}

/**
 * Follow this circle live while the calling screen is showing: not while another tab or screen
 * covers it (coming back to it loads anything new right away). Pass `enabled` false for people who
 * aren't members: they can't see its posts, and the channel would refuse them.
 */
export function useCircleLive(circleId: string | null | undefined, enabled = true): void {
  const viewerId = useCurrentUser()?.id;
  const focused = useScreenFocused();
  useEffect(() => {
    if (!circleId || !viewerId || !enabled || !focused) return;
    return acquireCircleLive(circleId, viewerId);
  }, [circleId, viewerId, enabled, focused]);
}
