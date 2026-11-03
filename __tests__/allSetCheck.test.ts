/**
 * "You're all set" icon (client revisions 10/14 p.11, N12): the check's geometry and the entrance
 * timing, as pure values.
 */
import {
  ALL_SET_CHECK,
  ALL_SET_CHECK_TOTAL_MS,
  CHECK_LENGTH,
  CHECK_PATH,
  CHECK_POINTS,
  CHECK_STROKE_WIDTH,
  CHECK_VIEWBOX,
  checkStroke,
  polylineLength,
} from '@features/onboarding/allSetCheck';

describe('check geometry', () => {
  it('is a single tick: one continuous path, short stroke then long stroke', () => {
    expect(CHECK_POINTS).toHaveLength(3);
    expect(CHECK_PATH).toBe('M25 49.5 L41.5 67 L74.5 32');
    const [start, corner, end] = CHECK_POINTS;
    const short = Math.hypot(corner[0] - start[0], corner[1] - start[1]);
    const long = Math.hypot(end[0] - corner[0], end[1] - corner[1]);
    expect(short).toBeLessThan(long);
    // The corner is the lowest point (a tick, not a caret).
    expect(corner[1]).toBeGreaterThan(start[1]);
    expect(corner[1]).toBeGreaterThan(end[1]);
  });

  it('spans roughly 55 to 60% of the circle, centered, with a thick stroke', () => {
    const xs = CHECK_POINTS.map(([x]) => x);
    const ys = CHECK_POINTS.map(([, y]) => y);
    const cap = CHECK_STROKE_WIDTH / 2; // round caps add half the stroke at each end
    const left = Math.min(...xs) - cap;
    const right = Math.max(...xs) + cap;
    const top = Math.min(...ys) - cap;
    const bottom = Math.max(...ys) + cap;
    const width = (right - left) / CHECK_VIEWBOX;
    expect(width).toBeGreaterThanOrEqual(0.55);
    expect(width).toBeLessThanOrEqual(0.6);
    expect(Math.abs((left + right) / 2 - CHECK_VIEWBOX / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs((top + bottom) / 2 - CHECK_VIEWBOX / 2)).toBeLessThanOrEqual(1);
    expect(CHECK_STROKE_WIDTH / CHECK_VIEWBOX).toBeGreaterThanOrEqual(0.07);
  });

  it('measures the whole path as the dash length', () => {
    expect(polylineLength([[0, 0], [3, 4], [3, 10]])).toBe(11);
    expect(CHECK_LENGTH).toBeCloseTo(polylineLength(CHECK_POINTS), 10);
  });
});

describe('checkStroke(progress)', () => {
  it('hides the check completely before it starts drawing (no stray round-cap dot)', () => {
    expect(checkStroke(0)).toEqual({ strokeDashoffset: CHECK_LENGTH, opacity: 0 });
    expect(checkStroke(-1)).toEqual({ strokeDashoffset: CHECK_LENGTH, opacity: 0 });
  });

  it('reveals the path from its start, in proportion to progress (drawn, not faded)', () => {
    const half = checkStroke(0.5);
    expect(half.opacity).toBe(1);
    expect(half.strokeDashoffset).toBeCloseTo(CHECK_LENGTH / 2, 10);
    const third = checkStroke(1 / 3);
    expect(third.opacity).toBe(1);
    expect(third.strokeDashoffset).toBeCloseTo((CHECK_LENGTH * 2) / 3, 10);
  });

  it('is fully drawn at the end and stays there', () => {
    expect(checkStroke(1)).toEqual({ strokeDashoffset: 0, opacity: 1 });
    expect(checkStroke(2)).toEqual({ strokeDashoffset: 0, opacity: 1 });
  });
});

describe('entrance timing', () => {
  it('pops the circle in from slightly smaller', () => {
    expect(ALL_SET_CHECK.circleStartScale).toBeGreaterThanOrEqual(0.7);
    expect(ALL_SET_CHECK.circleStartScale).toBeLessThan(1);
    expect(ALL_SET_CHECK.circleOvershoot).toBeGreaterThan(0);
  });

  it('fades the circle in no later than it settles', () => {
    expect(ALL_SET_CHECK.circleFadeMs).toBeLessThanOrEqual(ALL_SET_CHECK.circlePopMs);
  });

  it('starts drawing the check right after the circle settles, not before', () => {
    expect(ALL_SET_CHECK.checkDelayMs).toBeGreaterThanOrEqual(ALL_SET_CHECK.circlePopMs);
    expect(ALL_SET_CHECK.checkDelayMs - ALL_SET_CHECK.circlePopMs).toBeLessThanOrEqual(50);
  });

  it('feels quick: the whole sequence is well under a second', () => {
    expect(ALL_SET_CHECK_TOTAL_MS).toBe(ALL_SET_CHECK.checkDelayMs + ALL_SET_CHECK.checkDrawMs);
    expect(ALL_SET_CHECK_TOTAL_MS).toBeLessThanOrEqual(800);
  });
});
