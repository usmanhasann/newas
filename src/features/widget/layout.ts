/**
 * Home-screen widget rules (client spec 2026-09-29), as pure functions. The iOS widget mirrors
 * these 1:1 in Swift (targets/widget/CircleMoodsWidget.swift) and the Android widget in Kotlin
 * (plugins/withMoodWidget.js) — keep all three in step.
 *
 * The feed (widget_feed RPC) already holds only OTHER members and only entries SHARED to the circle;
 * these rules apply the clock on top, so they can be re-run as time passes:
 *  - A member's mood shows only while their newest shared entry is under 24 hours old — never stale.
 *  - 4 or fewer other members: everyone gets a row (nothing recent → a blank row, no mood/time).
 *  - 5 or more: only the 4 most recent entries, one row per person.
 *  - Newest entry at the top; blank rows after it, by name.
 */

/** Rows on the Large widget. */
export const WIDGET_ROWS = 4;
/** How long a mood stays on the widget. */
export const WIDGET_WINDOW_MS = 24 * 60 * 60 * 1000;

/** One member as the feed returns it (`at` = epoch ms of their newest shared entry, or null). */
export interface WidgetMember {
  id: string;
  name: string;
  avatar: string | null;
  moods: string[];
  at: number | null;
}

export interface WidgetRow {
  id: string;
  name: string;
  /** Shown on a colored circle when there's no profile photo. */
  initial: string;
  avatar: string | null;
  /** Empty for a blank row. */
  moods: string[];
  /** "Just now" / "25 min" / "1 hr" / "3 hrs"; null for a blank row. */
  time: string | null;
}

/** Whether a timestamp still counts (under 24 h old). A slightly-future clock counts as now. */
export function isRecent(at: number | null, now: number): boolean {
  return at !== null && Number.isFinite(at) && Math.max(0, now - at) < WIDGET_WINDOW_MS;
}

/** "Just now" under a minute, "N min" under an hour, then "1 hr" / "N hrs". */
export function relativeTime(at: number, now: number): string {
  const mins = Math.floor(Math.max(0, now - at) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? '1 hr' : `${hrs} hrs`;
}

/** First letter of the name, upper-cased ("?" if there's nothing to show). */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : '?';
}

/**
 * The widget's rows at time `now`. `memberCount` is the number of OTHER approved members (the feed
 * sends every one of them when it's 4 or fewer, otherwise only those with a recent entry).
 */
export function widgetRows(members: WidgetMember[], memberCount: number, now: number): WidgetRow[] {
  const toRow = (m: WidgetMember, recent: boolean): WidgetRow => ({
    id: m.id,
    name: m.name,
    initial: initialOf(m.name),
    avatar: m.avatar,
    moods: recent ? m.moods : [],
    time: recent && m.at !== null ? relativeTime(m.at, now) : null,
  });

  const recent = members
    .filter((m) => isRecent(m.at, now))
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));

  if (memberCount <= WIDGET_ROWS) {
    const blank = members
      .filter((m) => !isRecent(m.at, now))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...recent.map((m) => toRow(m, true)), ...blank.map((m) => toRow(m, false))].slice(
      0,
      WIDGET_ROWS,
    );
  }
  return recent.slice(0, WIDGET_ROWS).map((m) => toRow(m, true));
}
