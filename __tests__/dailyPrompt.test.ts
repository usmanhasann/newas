import {
  DAILY_PROMPTS,
  advanceRotation,
  buildCycle,
  isValidRotation,
  promptFor,
  nextDay,
  planDays,
  stateForDay,
  type RotationState,
  type Rand,
} from '@features/journal/promptRotation';

/** Deterministic PRNG (mulberry32) so shuffles are reproducible per seed. */
function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COUNT = DAILY_PROMPTS.length;
const IDENTITY = Array.from({ length: COUNT }, (_, i) => i);

/** n consecutive, lexicographically-increasing YYYY-MM-DD dates (so "a later day" ordering holds). */
function seqDays(n: number): string[] {
  const t0 = Date.parse('2026-01-01T00:00:00Z');
  return Array.from({ length: n }, (_, i) => new Date(t0 + i * 86400000).toISOString().slice(0, 10));
}

/** Drive `openDays` distinct calendar days from a starting state, returning every day's state. */
function run(days: string[], rand: Rand, start: RotationState | null = null): RotationState[] {
  const out: RotationState[] = [];
  let state = start;
  for (const d of days) {
    state = advanceRotation(state, d, rand);
    out.push(state);
  }
  return out;
}

const isPermutation = (order: number[]) =>
  order.length === COUNT && new Set(order).size === COUNT && order.every((n) => n >= 0 && n < COUNT);

describe('daily prompt rotation', () => {
  it('has exactly the 7 specified prompts, in the listed wording', () => {
    expect(DAILY_PROMPTS).toEqual([
      'How are you feeling today?',
      "What's on your mind right now?",
      'What made today different?',
      'What are you grateful for today?',
      'How does today compare to yesterday?',
      'What do you want to remember about today?',
      "What's weighing on you today?",
    ]);
  });

  describe('first run', () => {
    it('starts a valid, shuffled cycle at position 0 for today', () => {
      const s = advanceRotation(null, '2026-09-11', seeded(1));
      expect(isValidRotation(s)).toBe(true);
      expect(s.position).toBe(0);
      expect(s.date).toBe('2026-09-11');
      expect(isPermutation(s.order)).toBe(true);
    });

    it('is never the exact listed 1–7 order, for any seed', () => {
      for (let seed = 1; seed <= 2000; seed++) {
        const order = buildCycle(seeded(seed), null);
        expect(isPermutation(order)).toBe(true);
        expect(order).not.toEqual(IDENTITY);
      }
    });

    it('treats missing OR corrupted persisted state as a first run', () => {
      const bad: unknown[] = [
        null,
        undefined,
        { order: [0, 1, 2], position: 0, date: 'x' }, // too short
        { order: [0, 1, 2, 3, 4, 5, 5], position: 0, date: 'x' }, // dup / not a permutation
        { order: [0, 1, 2, 3, 4, 5, 7], position: 0, date: 'x' }, // out of range
        { order: IDENTITY, position: 9, date: 'x' }, // position out of range
        { order: IDENTITY, position: 0, date: '' }, // empty date
      ];
      for (const prev of bad) {
        const s = advanceRotation(prev as RotationState | null, '2026-09-11', seeded(3));
        expect(isValidRotation(s)).toBe(true);
        expect(s.position).toBe(0);
        expect(s.date).toBe('2026-09-11');
      }
    });
  });

  describe('once per day, not per app open', () => {
    it('returns the SAME state (same prompt) when opened again the same day', () => {
      const day1 = advanceRotation(null, '2026-09-11', seeded(5));
      const again = advanceRotation(day1, '2026-09-11', seeded(999));
      expect(again).toBe(day1); // same reference → nothing to persist
      expect(promptFor(again)).toBe(promptFor(day1));
    });
  });

  describe('advancing across days', () => {
    it('advances exactly one step on a new day within the cycle', () => {
      const d1 = advanceRotation(null, '2026-09-11', seeded(7));
      const d2 = advanceRotation(d1, '2026-09-12', seeded(7));
      expect(d2.order).toEqual(d1.order); // same cycle
      expect(d2.position).toBe(d1.position + 1);
      expect(d2.date).toBe('2026-09-12');
      expect(promptFor(d2)).not.toBe(promptFor(d1));
    });

    it('shows all 7 unique prompts across 7 open-days (a full permutation, no repeats)', () => {
      const days = seqDays(7);
      const states = run(days, seeded(11));
      const shown = states.map(promptFor);
      expect(new Set(shown).size).toBe(COUNT); // no repeats within a cycle
      expect(new Set(shown)).toEqual(new Set(DAILY_PROMPTS));
    });

    it('only advances on days the app is opened — skipped days never move progress backward', () => {
      // Three opens spread far apart → exactly three steps (positions 0,1,2), same cycle.
      const states = run(['2026-01-01', '2026-03-15', '2027-01-01'], seeded(13));
      expect(states.map((s) => s.position)).toEqual([0, 1, 2]);
      expect(states[1].order).toEqual(states[0].order);
      expect(states[2].order).toEqual(states[0].order);
    });
  });

  describe('monotonic — never advances on a same-or-earlier calendar day', () => {
    it('a backward local date (clock reset / westward travel) does not advance or reset', () => {
      // Open on Jan 1, Jan 2, then the local date jumps BACK to Jan 1, then forward to Jan 2 again.
      const states = run(['2026-01-01', '2026-01-02', '2026-01-01', '2026-01-02'], seeded(23));
      expect(states.map((s) => s.position)).toEqual([0, 1, 1, 1]);
      // The order (cycle) is untouched and the state is literally the same object (no re-persist).
      expect(states[2]).toBe(states[1]);
      expect(states[3]).toBe(states[1]);
    });

    it('returns prev unchanged for an earlier date (idempotent, no backward move)', () => {
      const d1 = advanceRotation(null, '2026-05-10', seeded(2));
      const d2 = advanceRotation(d1, '2026-05-11', seeded(2)); // advanced to position 1
      const backward = advanceRotation(d2, '2026-05-09', seeded(2)); // earlier → unchanged
      expect(backward).toBe(d2);
      expect(backward.position).toBe(1);
    });

    it('a far-future date still advances only ONE step (one per open-day)', () => {
      const d1 = advanceRotation(null, '2026-05-10', seeded(2));
      const d2 = advanceRotation(d1, '2030-01-01', seeded(2));
      expect(d2.position).toBe(1);
      expect(d2.order).toEqual(d1.order);
    });
  });

  describe('reshuffle at the end of a cycle', () => {
    it('reshuffles into a new cycle on the 8th open-day, back to position 0', () => {
      const days = seqDays(8);
      const states = run(days, seeded(17));
      const seventh = states[6];
      const eighth = states[7];
      expect(seventh.position).toBe(COUNT - 1);
      expect(eighth.position).toBe(0);
      expect(isPermutation(eighth.order)).toBe(true);
    });

    it("the new cycle's first prompt is never the one showing right before the reshuffle", () => {
      // Property check across many seeds: drive to the reshuffle and compare day 8 vs day 7.
      for (let seed = 1; seed <= 3000; seed++) {
        const rand = seeded(seed);
        const days = seqDays(8);
        const states = run(days, rand);
        const lastOfOldCycle = promptFor(states[6]);
        const firstOfNewCycle = promptFor(states[7]);
        expect(firstOfNewCycle).not.toBe(lastOfOldCycle);
      }
    });

    it('the second full cycle again shows all 7 unique prompts', () => {
      const days = seqDays(14);
      const states = run(days, seeded(19));
      const secondCycle = states.slice(7, 14).map(promptFor);
      expect(new Set(secondCycle).size).toBe(COUNT);
      expect(new Set(secondCycle)).toEqual(new Set(DAILY_PROMPTS));
    });

    it('only forbids the immediate predecessor — all 6 other prompts are eligible first picks', () => {
      // Across many seeds, the set of possible "first of new cycle" prompts should cover more than
      // one value (i.e. it is genuinely varied, not pinned), and never include the forbidden one.
      const firsts = new Set<string>();
      for (let seed = 1; seed <= 500; seed++) {
        const states = run(seqDays(8), seeded(seed));
        expect(promptFor(states[7])).not.toBe(promptFor(states[6]));
        firsts.add(promptFor(states[7]));
      }
      expect(firsts.size).toBeGreaterThan(1);
    });
  });

  describe('buildCycle reshuffle constraint (direct)', () => {
    it('keeps `avoid` out of the first slot for every seed and every avoid value', () => {
      for (let avoid = 0; avoid < COUNT; avoid++) {
        for (let seed = 1; seed <= 400; seed++) {
          const order = buildCycle(seeded(seed), avoid);
          expect(isPermutation(order)).toBe(true);
          expect(order[0]).not.toBe(avoid);
        }
      }
    });
  });

  describe('promptFor', () => {
    it('maps order/position to the right prompt text', () => {
      const s: RotationState = { order: [3, 1, 5, 0, 2, 6, 4], position: 2, date: 'd' };
      expect(promptFor(s)).toBe(DAILY_PROMPTS[5]);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Shared with the daily check-in notification (client spec 2026-09-29)
// ---------------------------------------------------------------------------------------------
describe('nextDay', () => {
  it('rolls over months, years and leap days', () => {
    expect(nextDay('2026-01-31')).toBe('2026-02-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
  });
});

describe('stateForDay', () => {
  const s0: RotationState = { order: [3, 1, 5, 6, 2, 0, 4], position: 2, date: '2026-09-10' };

  it('reminder OFF: days away only move one step (it advances on open-days, not calendar days)', () => {
    const s = stateForDay([s0], '2026-09-20', false, seeded(1));
    expect(s).toEqual({ order: s0.order, position: 3, date: '2026-09-20' });
  });

  it("reminder ON: every calendar day moves one step, even days the app wasn’t opened", () => {
    const s = stateForDay([s0], '2026-09-13', true, seeded(1));
    expect(s).toEqual({ order: s0.order, position: 5, date: '2026-09-13' });
  });

  it('a day that was already planned keeps its prompt in either mode', () => {
    const planned: RotationState = { order: s0.order, position: 6, date: '2026-09-14' };
    expect(stateForDay([s0, planned], '2026-09-14', true, seeded(1))).toBe(planned);
    expect(stateForDay([s0, planned], '2026-09-14', false, seeded(1))).toBe(planned);
  });

  it('never moves backward when the clock goes back before everything stored', () => {
    expect(stateForDay([s0], '2026-09-01', true, seeded(1))).toBe(s0);
  });

  it('starts a fresh valid cycle with nothing stored', () => {
    const s = stateForDay([], '2026-09-10', true, seeded(4));
    expect(isValidRotation(s)).toBe(true);
    expect(s.position).toBe(0);
  });
});

describe('planDays', () => {
  it('plans one state per calendar day, moving every day, with no back-to-back repeats across reshuffles', () => {
    const plan = planDays([], '2026-09-10', 30, seeded(7));
    expect(plan).toHaveLength(30);
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i]!.date).toBe(nextDay(plan[i - 1]!.date));
      expect(promptFor(plan[i]!)).not.toBe(promptFor(plan[i - 1]!));
    }
  });

  it('re-planning keeps every day that was already planned (scheduled check-ins never change)', () => {
    const first = planDays([], '2026-09-10', 20, seeded(7));
    const again = planDays(first, '2026-09-15', 20, seeded(99));
    for (const s of again) {
      const before = first.find((p) => p.date === s.date);
      if (before) expect(s).toEqual(before);
    }
    expect(again[0]!.date).toBe('2026-09-15');
  });

  it("switching the reminder off continues from today’s planned prompt", () => {
    const plan = planDays([], '2026-09-10', 10, seeded(3));
    const today = stateForDay(plan, '2026-09-12', false, seeded(3));
    expect(today).toEqual(plan[2]);
    // Next open-day, two days later: exactly one step on from today's planned prompt.
    const later = stateForDay([today], '2026-09-14', false, seeded(3));
    expect(later.position === today.position + 1 || later.position === 0).toBe(true);
  });
});
