/**
 * Client 10/14 p.30: the app follows the phone's time zone. phoneTimeZone reads the phone's own
 * setting first (fresh after the phone changes zone on landing) and falls back to the JS engine's
 * zone; anything the app's date maths (or the server) can't read is never used. saveMyTimezone
 * re-checks the zone before it is written.
 */
import { isUsableTimeZone, phoneTimeZone, timeZoneSchema, timezoneToSave } from '@features/profile/timezone';
import { saveMyTimezone } from '@features/profile/api';

const mockUpdate = jest.fn();
jest.mock('@lib', () => ({
  supabase: {
    from: () => ({
      update: (patch: unknown) => {
        mockUpdate(patch);
        return {
          eq: () => ({
            select: () => ({ single: () => Promise.resolve({ data: { user_id: 'u1', ...(patch as object) }, error: null }) }),
          }),
        };
      },
    }),
  },
}));

describe('phoneTimeZone', () => {
  it('uses the zone the phone’s settings report', () => {
    expect(phoneTimeZone(() => 'America/New_York', () => 'America/Los_Angeles')).toBe('America/New_York');
  });

  it.each([
    ['no zone from the OS', null],
    ['an offset, not a zone name', 'GMT+05:00'],
    ['a POSIX style offset the server reads backwards', 'GMT+5'],
    ['an unknown name', 'Mars/Olympus_Mons'],
    ['empty', ''],
  ])('falls back to the engine’s zone when the OS gives %s', (_label, native) => {
    expect(phoneTimeZone(() => native, () => 'Asia/Karachi')).toBe('Asia/Karachi');
  });

  it('falls back when reading the OS zone throws', () => {
    expect(
      phoneTimeZone(
        () => {
          throw new Error('no native module');
        },
        () => 'Europe/London',
      ),
    ).toBe('Europe/London');
  });

  it('is null when neither source gives a usable zone', () => {
    expect(phoneTimeZone(() => null, () => 'GMT+5')).toBeNull();
  });
});

describe('isUsableTimeZone / timeZoneSchema', () => {
  it.each(['UTC', 'America/Los_Angeles', 'America/Argentina/Buenos_Aires', 'Etc/GMT+5', 'Asia/Karachi'])(
    'accepts %s',
    (zone) => {
      expect(isUsableTimeZone(zone)).toBe(true);
      expect(timeZoneSchema.safeParse(zone).success).toBe(true);
    },
  );

  it.each(['', 'GMT+05:00', '+05:00', 'America/Not_A_City', 'a/b/c/d', `Europe/${'x'.repeat(80)}`])(
    'refuses %s',
    (zone) => {
      expect(timeZoneSchema.safeParse(zone).success).toBe(false);
    },
  );
});

describe('timezoneToSave', () => {
  it.each([
    ['phone moved east', 'America/Los_Angeles', 'America/New_York', 'America/New_York'],
    ['first sync from the UTC default', 'UTC', 'Asia/Karachi', 'Asia/Karachi'],
    ['phone itself on UTC (the old rule left this alone)', 'Asia/Karachi', 'UTC', 'UTC'],
    ['already the same', 'Europe/London', 'Europe/London', null],
    ['phone zone unknown', 'Europe/London', null, null],
  ])('%s', (_label, saved, phone, expected) => {
    expect(timezoneToSave(saved, phone)).toBe(expected);
  });
});

describe('saveMyTimezone', () => {
  beforeEach(() => mockUpdate.mockClear());

  it('writes a usable zone to the profile', async () => {
    const saved = await saveMyTimezone('u1', 'America/New_York');
    expect(mockUpdate).toHaveBeenCalledWith({ timezone: 'America/New_York' });
    expect(saved.timezone).toBe('America/New_York');
  });

  it('never sends a zone the app can’t read', async () => {
    await expect(saveMyTimezone('u1', 'GMT+5')).rejects.toThrow();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
