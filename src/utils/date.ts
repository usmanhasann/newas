/**
 * Date helpers. Streaks + the week/month/year mood breakdown bucket by the user's
 * LOCAL day, so we derive `local_date` (YYYY-MM-DD) in a specific timezone — this is
 * the piece that was previously broken (UTC bucketing). `en-CA` formats as YYYY-MM-DD.
 */
export function localDateInTZ(date: Date = new Date(), timeZone?: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date);
}

/**
 * Current hour (0–23) at `date` in the given IANA timezone (device tz when omitted). Used by the
 * streak indicator's 8pm check so it lines up with the reminder, which fires per the user's tz.
 */
export function hourInTZ(date: Date = new Date(), timeZone?: string): number {
  try {
    const s = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || undefined,
      hour: '2-digit',
      hour12: false,
    }).format(date);
    const h = Number(s);
    // hour12:false can format midnight as "24" on some engines — normalize to 0–23.
    return Number.isFinite(h) ? h % 24 : date.getHours();
  } catch {
    return date.getHours();
  }
}

/** Device timezone (IANA), e.g. "America/New_York". */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Parse an "HH:MM" or "HH:MM:SS" string into { hour, minute }; null if invalid. Lives here
 * (not in a feature) because both onboarding and notifications need it — `reminder_time` is a
 * Postgres `time`, so it comes back as "21:00:00" while the client writes "21:00".
 */
export function parseHhmm(time: string | null | undefined): { hour: number; minute: number } | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** "9:00 AM" style label for an HH:MM time (12h, locale-independent). Shared for the same reason. */
export function formatHhmm12(time: string | null | undefined): string | null {
  const p = parseHhmm(time);
  if (!p) return null;
  const ampm = p.hour < 12 ? 'AM' : 'PM';
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${String(p.minute).padStart(2, '0')} ${ampm}`;
}

/** An "HH:MM:SS" string (the Postgres `time` shape) from a Date's local hours/minutes. */
export function toHhmmss(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
}

/** "Mon, Jun 19" + "3:42 PM" for entry cards / detail. */
export function formatEntryDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
  return { date, time };
}

/** Difference in whole days between two YYYY-MM-DD local dates (a - b). */
export function diffLocalDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const au = Date.UTC(ay, am - 1, ad);
  const bu = Date.UTC(by, bm - 1, bd);
  return Math.round((au - bu) / 86_400_000);
}

/** Add (or subtract) whole days to a YYYY-MM-DD local date, returning YYYY-MM-DD. */
export function addDaysToLocalDate(local: string, days: number): string {
  const [y, m, d] = local.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * "Jun 19" style short label for a YYYY-MM-DD date (a full timestamp is accepted; only the
 * date part is used), or "" when there is no valid date. Built manually (NOT via Intl.DateTimeFormat) because some
 * Android/Hermes builds have partial Intl support and drop the `day`, rendering only the
 * month (e.g. "Jul" instead of "Jul 9"). This guarantees the day is always shown.
 */
export function formatLocalDateShort(local: string | null): string {
  if (!local) return '';
  const [, m, d] = local.slice(0, 10).split('-').map(Number);
  if (!m || !d || m < 1 || m > 12) return '';
  return `${SHORT_MONTHS[m - 1]} ${d}`;
}

/**
 * Locale-aware long date for a YYYY-MM-DD value, e.g. "January 1, 2026" (build task
 * §8 — the next-unlock date). Uses the device locale (undefined) so it follows the
 * user's regional formatting. Built in UTC to avoid an off-by-one from local tz. "" when there
 * is no date.
 */
export function formatLongLocalDate(local: string | null): string {
  if (!local) return '';
  const [y, m, d] = local.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "Jun 16 to Jun 22" range label for two YYYY-MM-DD dates ("" if either is missing). */
export function formatLocalRange(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  return `${formatLocalDateShort(start)} to ${formatLocalDateShort(end)}`;
}
