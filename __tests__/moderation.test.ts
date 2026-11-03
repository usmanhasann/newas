/**
 * System 1 (Circles) enforcement engine — the pure tier ladder + standing derivation. This is the
 * authoritative decision logic the Edge Function runs; it must match the ratified design exactly.
 * The module lives with the Edge Functions (supabase/functions/_shared) so the server imports the
 * SAME source we test here — no drift between what's tested and what enforces.
 */
import {
  decideTier,
  decideEnforcement,
  isPreBlock,
  deriveStanding,
  restrictionUntil,
  enforcementReason,
  isSelfHarmOnly,
  RESTRICTION_DAYS,
  type Severity,
  type Tier,
} from '../supabase/functions/_shared/moderation';

describe('decideTier — the escalation ladder', () => {
  it('sends ANY single severe offense straight to Tier 3, regardless of history', () => {
    expect(decideTier(0, 'severe')).toBe(3);
    expect(decideTier(5, 'severe')).toBe(3);
  });

  it('first offense: low → Tier 1, moderate → Tier 2', () => {
    expect(decideTier(0, 'low')).toBe(1);
    expect(decideTier(0, 'moderate')).toBe(2);
  });

  it('second offense → Tier 2 (any non-severe severity)', () => {
    expect(decideTier(1, 'low')).toBe(2);
    expect(decideTier(1, 'moderate')).toBe(2);
  });

  it('third offense or beyond → Tier 3 (any non-severe severity)', () => {
    expect(decideTier(2, 'low')).toBe(3);
    expect(decideTier(2, 'moderate')).toBe(3);
    expect(decideTier(9, 'low')).toBe(3);
  });

  it('never decreases as prior strikes grow (monotonic escalation)', () => {
    for (const sev of ['low', 'moderate', 'severe'] as Severity[]) {
      let prevTier = 0 as Tier | 0;
      for (let prior = 0; prior <= 6; prior++) {
        const t = decideTier(prior, sev);
        expect(t).toBeGreaterThanOrEqual(prevTier);
        prevTier = t;
      }
    }
  });

  it('is defensive against negative or fractional prior-strike counts', () => {
    expect(decideTier(-3, 'low')).toBe(1); // treated as first offense
    expect(decideTier(1.7, 'low')).toBe(2); // floors to 1 prior → second offense
  });
});

describe('isPreBlock — block-before-post gate', () => {
  it('only severe content is blocked before posting', () => {
    expect(isPreBlock('severe')).toBe(true);
    expect(isPreBlock('moderate')).toBe(false);
    expect(isPreBlock('low')).toBe(false);
  });
});

describe('decideEnforcement — consequences per tier', () => {
  it('Tier 1 (first low): remove + warn, no restriction, no suspension, strike', () => {
    const d = decideEnforcement(0, 'low');
    expect(d).toEqual({
      tier: 1,
      removeContent: true,
      warnUser: true,
      restrictionDays: 0,
      suspendCircles: false,
      recordStrike: true,
    });
  });

  it('Tier 2 (first moderate): 5-day posting restriction, no suspension', () => {
    const d = decideEnforcement(0, 'moderate');
    expect(d.tier).toBe(2);
    expect(d.restrictionDays).toBe(RESTRICTION_DAYS.moderate);
    expect(d.suspendCircles).toBe(false);
    expect(d.removeContent && d.warnUser && d.recordStrike).toBe(true);
  });

  it('Tier 2 (second offense, low): 3-day restriction by severity', () => {
    const d = decideEnforcement(1, 'low');
    expect(d.tier).toBe(2);
    expect(d.restrictionDays).toBe(RESTRICTION_DAYS.low);
  });

  it('Tier 3 (severe): suspend Circles, no timed restriction', () => {
    const d = decideEnforcement(0, 'severe');
    expect(d.tier).toBe(3);
    expect(d.suspendCircles).toBe(true);
    expect(d.restrictionDays).toBe(0);
  });

  it('always removes content, warns, and records a strike (no silent penalties)', () => {
    for (const prior of [0, 1, 2, 5]) {
      for (const sev of ['low', 'moderate', 'severe'] as Severity[]) {
        const d = decideEnforcement(prior, sev);
        expect(d.removeContent).toBe(true);
        expect(d.warnUser).toBe(true);
        expect(d.recordStrike).toBe(true);
      }
    }
  });
});

describe('deriveStanding — gating state', () => {
  const now = '2026-09-11T12:00:00.000Z';

  it('is "ok" with no suspension and no active restriction', () => {
    expect(deriveStanding({ suspended: false, restrictedUntil: null }, now)).toBe('ok');
  });

  it('is "restricted" while a restriction is still in the future', () => {
    expect(
      deriveStanding(
        { suspended: false, restrictedUntil: '2026-09-14T12:00:00.000Z' },
        now,
      ),
    ).toBe('restricted');
  });

  it('is "ok" once a restriction has elapsed', () => {
    expect(
      deriveStanding(
        { suspended: false, restrictedUntil: '2026-09-10T12:00:00.000Z' },
        now,
      ),
    ).toBe('ok');
  });

  it('a suspension outranks everything, even with no restriction', () => {
    expect(deriveStanding({ suspended: true, restrictedUntil: null }, now)).toBe(
      'suspended',
    );
    expect(
      deriveStanding(
        { suspended: true, restrictedUntil: '2026-09-14T12:00:00.000Z' },
        now,
      ),
    ).toBe('suspended');
  });
});

describe('restrictionUntil', () => {
  it('adds whole days to the start timestamp', () => {
    expect(restrictionUntil('2026-09-11T12:00:00.000Z', 3)).toBe(
      '2026-09-14T12:00:00.000Z',
    );
    expect(restrictionUntil('2026-09-11T12:00:00.000Z', 5)).toBe(
      '2026-09-16T12:00:00.000Z',
    );
  });
});

describe('enforcementReason — always says what & why + offers appeal', () => {
  it('names the category and the consequence, and mentions appeal', () => {
    const warn = enforcementReason('inappropriate_language', decideEnforcement(0, 'low'));
    expect(warn).toMatch(/inappropriate language/);
    expect(warn).toMatch(/warning/i);
    expect(warn).toMatch(/appeal/i);

    const restricted = enforcementReason('harassment', decideEnforcement(0, 'moderate'));
    expect(restricted).toMatch(/harassment/);
    expect(restricted).toMatch(/can't post in Circles for 5 days/);
    expect(restricted).toMatch(/appeal/i);

    const suspended = enforcementReason('threat', decideEnforcement(0, 'severe'));
    expect(suspended).toMatch(/suspended pending review/);
    expect(suspended).toMatch(/journal/); // reassures the rest of the app is intact
    expect(suspended).toMatch(/appeal/i);
  });
});

// Regression (2026-09-19, production): the AI labelled a Circle post "I’m going to kill myself" a severe
// THREAT and auto-suspended its author. Self-harm is crisis SUPPORT (System 2) — never moderated.
describe('isSelfHarmOnly — self-harm is never moderated', () => {
  it.each([
    'I’m going to kill myself', // the exact production text (curly apostrophe)
    "I'm going to kill myself",
    'I want to die',
    'honestly I just wanna die tonight',
    'thinking about suicide again',
    'I feel suicidal',
    "I'm going to end my life",
    'I hurt myself again last night',
    'been cutting myself',
    "I don't want to be alive anymore",
    'everyone would be better off dead without me... I mean me',
    "I'm going to kill myself, you won't even miss me", // a 'you' that is not a violence target
  ])('treats %j as self-harm only', (text) => {
    expect(isSelfHarmOnly(text)).toBe(true);
  });

  it.each([
    "I'm going to kill you",
    'I will hurt him',
    "I'll kill you and then myself", // explicit violence at another person
    "I'm going to kill myself and take them with me",
    'going to kill my ex',
    'I want to die but first I will stab her',
  ])('does NOT exempt %j (violence aimed at someone else)', (text) => {
    expect(isSelfHarmOnly(text)).toBe(false);
  });

  it.each(['Great workout today!', 'this traffic is killing me', 'I hate Mondays', ''])(
    'ignores ordinary text %j (normal moderation applies)',
    (text) => {
      expect(isSelfHarmOnly(text)).toBe(false);
    },
  );
});
