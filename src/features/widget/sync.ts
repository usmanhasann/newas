/**
 * Keeps the home-screen widget in step with Profile → Home Widget, on both platforms.
 *
 * Every sync checks the feed once with this phone's read-only widget key: that validates the key
 * (a revoked or pruned one is replaced) and the circle (one that's no longer a Private circle the
 * user is in is cleared). Then iOS gets its settings (it fetches for itself from there on) and
 * Android gets the data. Best-effort: offline, the widget keeps what it last had.
 */
import { env } from '@lib';
import * as api from './api';
import { writeAndroidWidgetData, writeIosWidgetSettings } from './native';

/**
 * What a sync did: the widget now shows the circle (synced), shows nothing (cleared), the circle
 * can't be shown and was un-picked (unavailable), the server couldn't be reached (failed: the widget
 * keeps its last data), or a newer sync took over (superseded).
 */
export type WidgetSyncResult = 'synced' | 'cleared' | 'unavailable' | 'failed' | 'superseded';

/** This phone's widget key, minting one the first time. */
async function ensureWidgetKey(): Promise<string> {
  const stored = await api.getStoredWidgetKey();
  if (stored) return stored;
  const key = await api.createWidgetKey();
  await api.storeWidgetKey(key);
  return key;
}

function clearWidgets(): void {
  writeIosWidgetSettings(null);
  writeAndroidWidgetData(null);
}

async function syncNow(circleId: string | null): Promise<WidgetSyncResult> {
  if (!circleId) {
    clearWidgets();
    return 'cleared';
  }
  try {
    let key = await ensureWidgetKey();
    let feed = await api.fetchWidgetFeed(key, circleId);
    if ('error' in feed && feed.error === 'invalid_key') {
      await api.storeWidgetKey(null);
      key = await ensureWidgetKey();
      feed = await api.fetchWidgetFeed(key, circleId);
    }
    if ('error' in feed) {
      // Not a Private circle this user is in any more (left, removed, or a Public pick from before).
      await api.setWidgetCircleId(null);
      clearWidgets();
      return 'unavailable';
    }
    writeIosWidgetSettings({
      key,
      circleId,
      feedUrl: `${env.supabaseUrl}/rest/v1/rpc/widget_feed`,
      apiKey: env.supabaseAnonKey,
    });
    writeAndroidWidgetData({ ...feed, circleId, updatedAt: Date.now() });
    return 'synced';
  } catch {
    return 'failed'; // the widget keeps its last data
  }
}

let queue: Promise<unknown> = Promise.resolve();
let latest = 0;

/**
 * Bring the widget in line with the saved choice (app open, foreground, a new pick). Syncs run one
 * at a time and each reads the saved choice when it starts; one overtaken by a newer request is
 * skipped. So the widget always ends up matching the LAST pick (two quick taps, or a pick during a
 * foreground refresh), and this phone never mints two keys at once.
 */
export function refreshWidget(): Promise<WidgetSyncResult> {
  const run = ++latest;
  const result = queue.then(async (): Promise<WidgetSyncResult> => {
    if (run !== latest) return 'superseded';
    try {
      return await syncNow(await api.getWidgetCircleId());
    } catch {
      return 'failed';
    }
  });
  queue = result;
  return result;
}

/** Forget every widget setting on this phone; the widget then asks to pick a circle. */
export async function resetWidget(): Promise<void> {
  await api.setWidgetCircleId(null);
  await api.storeWidgetKey(null);
  await api.setWidgetOwner(null);
  await refreshWidget(); // after any sync already running, so it can't write old settings back
}

/**
 * Signing out (while still signed in): revoke this phone's key on the server first, so it stops
 * working even if a copy of it survived somewhere, then wipe the widget here (also when the revoke
 * fails; the sign-out itself never waits long for either). Best-effort.
 */
export async function forgetWidgetOnSignOut(): Promise<void> {
  const key = await api.getStoredWidgetKey();
  try {
    if (key) await api.revokeWidgetKey(key);
  } finally {
    await resetWidget();
  }
}

/**
 * Called whenever the signed-in account settles: a sign-out (→ anonymous), a deleted account, a
 * DIFFERENT account on this phone, or no account recorded at all (first run, or a reinstall: the
 * iPhone keychain keeps the old widget key) starts clean, so nobody's widget ever uses someone
 * else's key or shows their circle. The same account just re-syncs.
 */
export async function reconcileWidgetOwner(userId: string | null): Promise<void> {
  const owner = await api.getWidgetOwner();
  if (!userId || owner !== userId) await resetWidget();
  if (!userId) return;
  await api.setWidgetOwner(userId);
  await refreshWidget();
}
