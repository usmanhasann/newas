/**
 * Which due reflections generate-reflections writes first (client 10/14 p.8 + p.13-14, O27/O28):
 * the newest finished period of each length, the one Insights shows and the 9 AM recap push
 * announces, is always written in the first call, even behind a backlog.
 */
import { orderDuePeriods, type DuePeriod } from '../supabase/functions/_shared/reflectionOrder';

const p = (type: string, period_start: string): DuePeriod => ({ type, period_start });

/** The previous order: every type together, by date only. */
const dateOnly = (due: DuePeriod[], max: number) =>
  [...due].sort((a, b) => b.period_start.localeCompare(a.period_start)).slice(0, max);

describe('orderDuePeriods', () => {
  it('puts each type’s newest due period first, then the rest newest first', () => {
    const due = [
      p('weekly', '2027-09-06'),
      p('monthly', '2027-07-01'),
      p('weekly', '2027-09-13'),
      p('yearly', '2026-09-01'),
      p('monthly', '2027-08-01'),
      p('weekly', '2027-08-30'),
    ];
    expect(orderDuePeriods(due, 12)).toEqual([
      p('weekly', '2027-09-13'),
      p('monthly', '2027-08-01'),
      p('yearly', '2026-09-01'),
      p('weekly', '2027-09-06'),
      p('weekly', '2027-08-30'),
      p('monthly', '2027-07-01'),
    ]);
  });

  it('writes a newly unlocked Yearly in the first call, even behind 14 newer weekly periods', () => {
    const weeks = Array.from({ length: 14 }, (_, i) => {
      const day = new Date(Date.UTC(2027, 8, 27 - i * 7)).toISOString().slice(0, 10);
      return p('weekly', day);
    });
    const due = [p('yearly', '2026-09-01'), ...weeks, p('monthly', '2027-08-01')];

    const first = orderDuePeriods(due, 12);
    expect(first).toHaveLength(12);
    expect(first).toContainEqual(p('yearly', '2026-09-01'));
    expect(first).toContainEqual(p('monthly', '2027-08-01'));
    expect(first[0]).toEqual(p('weekly', '2027-09-27'));
    // The date-only order used before would have left the Yearly for a later call.
    expect(dateOnly(due, 12)).not.toContainEqual(p('yearly', '2026-09-01'));
  });

  it('hands back the caller’s own rows, period_end included (typed, unchanged)', () => {
    interface Row extends DuePeriod {
      period_end: string;
    }
    const w: Row = { type: 'weekly', period_start: '2027-09-06', period_end: '2027-09-12' };
    const m: Row = { type: 'monthly', period_start: '2027-08-01', period_end: '2027-08-31' };
    // What the edge function passes: the RPC's untyped rows, with the row type named.
    const fromRpc: unknown = [m, w];
    const out = orderDuePeriods<Row>(fromRpc as Row[], 12);
    const ends: string[] = out.map((r) => r.period_end); // a type error if T fell back to DuePeriod
    expect(ends).toEqual(['2027-09-12', '2027-08-31']);
    expect(out[0]).toBe(w);
    expect(out[1]).toBe(m);
  });

  it('keeps to the cap, leaves the input untouched, and handles nothing due', () => {
    const due = [p('weekly', '2027-09-06'), p('weekly', '2027-09-13'), p('monthly', '2027-08-01')];
    const copy = [...due];
    expect(orderDuePeriods(due, 2)).toEqual([p('weekly', '2027-09-13'), p('monthly', '2027-08-01')]);
    expect(due).toEqual(copy);
    expect(orderDuePeriods([], 12)).toEqual([]);
    expect(orderDuePeriods(due, 0)).toEqual([]);
  });
});
