/**
 * The phone's time zone, which the app now follows automatically (client 10/14 p.30: the manual
 * Timezone setting is gone). Kept free of React and I/O so it can be tested on its own; the hook
 * that keeps profiles.timezone in step with it is useSyncProfileTimezone (hooks.ts).
 */
import { z } from 'zod';
import { getCalendars } from 'expo-localization';
import { deviceTimeZone } from '@utils/date';

/**
 * An IANA zone name ("America/Los_Angeles", "America/Argentina/Buenos_Aires", "UTC") that this
 * phone's date maths can read. Offsets and POSIX rules ("GMT+05:00", "GMT+5") are refused: the
 * server reads a bare "GMT+5" with the opposite sign, so it would date every day wrongly.
 * The database re-checks the same shape (profiles_timezone_valid).
 */
const ZONE_NAME = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/;

export function isUsableTimeZone(zone: string): boolean {
  if (!ZONE_NAME.test(zone)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z.string().min(1).max(64).refine(isUsableTimeZone);

/** The zone the phone's own settings report, read fresh from the OS each time (null if none). */
function nativeTimeZone(): string | null {
  try {
    return getCalendars()[0]?.timeZone ?? null;
  } catch {
    return null;
  }
}

/**
 * The phone's current time zone, or null when it can't be told. The OS setting is read first (it
 * is fresh after the phone changes zone on landing); the JS engine's zone is the fallback.
 */
export function phoneTimeZone(
  readNative: () => string | null = nativeTimeZone,
  readEngine: () => string = deviceTimeZone,
): string | null {
  for (const read of [readNative, readEngine]) {
    let zone: string | null = null;
    try {
      zone = read();
    } catch {
      zone = null;
    }
    const parsed = timeZoneSchema.safeParse(zone);
    if (parsed.success) return parsed.data;
  }
  return null;
}

/** The zone to save on the profile, or null when it already matches the phone (or none is known). */
export function timezoneToSave(saved: string | null | undefined, phone: string | null): string | null {
  if (!phone || phone === saved) return null;
  return phone;
}
