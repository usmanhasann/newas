/**
 * The "You're all set" icon (client revisions 10/14 p.11, N12): a solid brand purple circle with a
 * single white check, nothing around it. Geometry + entrance timing live here so they are pure and
 * unit tested; components/AllSetCheck.tsx plays them.
 *
 * Measured from the client's screenshot and screen recording (p11-youre-all-set-icon.png / .mov):
 * the check spans about 58% of the circle's width, its stroke is about 8% of the circle, both ends
 * and the corner are round, and it sits centered. In the recording the circle pops in with a small
 * overshoot (about 2% past full size), and right after it settles the check draws itself in one
 * pass, short stroke first then the long one (about a third of a second), then everything holds.
 */

/** The check's SVG coordinate space (a square the size of the circle). */
export const CHECK_VIEWBOX = 100;

/** Start of the short stroke → the bottom corner → end of the long stroke (viewBox units). */
export const CHECK_POINTS: readonly (readonly [number, number])[] = [
  [25, 49.5],
  [41.5, 67],
  [74.5, 32],
];

/** Thick stroke, about 8% of the circle (round caps and joins are set on the path). */
export const CHECK_STROKE_WIDTH = 8;

/** One continuous path, so drawing it reads as a pen stroke: short side first, then the long side. */
export const CHECK_PATH = CHECK_POINTS.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');

/** Total length of a polyline (the dash length that hides / reveals the whole check). */
export function polylineLength(points: readonly (readonly [number, number])[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    total += Math.hypot(x1 - x0, y1 - y0);
  }
  return total;
}

export const CHECK_LENGTH = polylineLength(CHECK_POINTS);

/**
 * Entrance timing (ms). One time only: no loop, no pulse. The circle fades in while it scales up
 * from slightly smaller with a small overshoot; the check starts the moment the circle has settled.
 */
export const ALL_SET_CHECK = {
  /** "Scales up from slightly smaller to full size". */
  circleStartScale: 0.8,
  /** The circle's fade in (finishes before the scale settles). */
  circleFadeMs: 200,
  /** The circle's pop, eased with a slight overshoot ("back" easing). */
  circlePopMs: 320,
  /** Back easing strength: about 2% past full size on a 0.8 → 1 pop, then settles. */
  circleOvershoot: 1.7,
  /** The check waits for the circle to settle. */
  checkDelayMs: 320,
  /** "A quick stroke animation". */
  checkDrawMs: 320,
} as const;

/** The whole sequence, start to the check's last pixel ("well under a second"). */
export const ALL_SET_CHECK_TOTAL_MS = Math.max(
  ALL_SET_CHECK.circleFadeMs,
  ALL_SET_CHECK.circlePopMs,
  ALL_SET_CHECK.checkDelayMs + ALL_SET_CHECK.checkDrawMs,
);

/**
 * The check's stroke at `progress` (0 = not drawn, 1 = fully drawn): the dash offset that shows
 * exactly that much of the path from its start. Hidden entirely before it begins, so a round cap
 * can never leave a dot behind while the circle is still popping in.
 */
export function checkStroke(progress: number): { strokeDashoffset: number; opacity: number } {
  'worklet';
  const p = Math.min(1, Math.max(0, progress));
  return { strokeDashoffset: CHECK_LENGTH * (1 - p), opacity: p > 0 ? 1 : 0 };
}
