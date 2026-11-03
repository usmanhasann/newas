/**
 * Keyboard-aware scrolling for the first check-in note (client 10/14 p.6-7): when the keyboard
 * opens, the note box is centered in the space above it, and while typing the screen keeps the box
 * in view. Pure numbers here (unit-tested); the wiring is useKeyboardComposer.
 *
 * Why not KeyboardAvoidingView: on Android (Expo SDK 56 is always edge-to-edge) the window no longer
 * shrinks for the keyboard and KeyboardAvoidingView does nothing, and on iOS shrinking the screen
 * squeezed the box to nothing. So the screen keeps its size, the part the keyboard covers is
 * measured, and that much empty space is added below the content so the box can scroll above it.
 */
import { spacing } from '@theme';

/** Keyboard frame as React Native reports it: its top edge (screenY) and height, in dp/pt. */
export interface KeyboardFrame {
  screenY: number;
  height: number;
}

/**
 * The y (from the top of the screen) where a DOCKED keyboard starts, or null when there is no
 * keyboard to make room for: hidden, a zero frame (iOS "Prefer Cross-Fade Transitions"), a
 * floating or split keyboard (an iPad keyboard that doesn't reach the bottom of the screen; on
 * Android a floating keyboard reports a height of zero or less).
 */
export function dockedKeyboardTop(
  frame: KeyboardFrame | null | undefined,
  windowHeight: number,
  platform: string,
): number | null {
  if (!frame || frame.height <= 0 || frame.screenY <= 0) return null;
  if (platform === 'ios' && frame.screenY + frame.height < windowHeight - 1) return null;
  return frame.screenY;
}

/** How much of a view (top at pageY, `height` tall) the keyboard covers. */
export function keyboardOverlap(pageY: number, height: number, keyboardTop: number): number {
  return Math.max(0, Math.round(pageY + height - keyboardTop));
}

/** Room kept above and below the note box: about one line of text. */
export const NOTE_SCROLL_MARGIN = spacing[6];

/** The note box's resting height (about three lines). */
export const NOTE_MIN_HEIGHT = spacing[20];

/**
 * How tall the note box grows before it scrolls inside itself: a quarter of the screen, between
 * 128 and 192. Fixed for the screen size (never changes when the keyboard opens, so the box never
 * shrinks then), and small enough that the label + box fit above the keyboard on the smallest
 * phones, so the phone itself keeps the line being typed in view inside the box.
 */
export function noteMaxHeight(windowHeight: number): number {
  const min = spacing[32];
  const max = spacing[32] + spacing[16];
  return Math.min(max, Math.max(min, Math.round(windowHeight * 0.25)));
}

/** Where a box sits in the scroll content, and how much of the scroll view is above the keyboard. */
export interface BoxInView {
  /** Box top, from the top of the scroll content. */
  top: number;
  height: number;
  /** Height of the scroll view NOT covered by the keyboard. */
  visible: number;
  margin?: number;
}

/**
 * Scroll offset that centers the box in the visible space. A box too tall to center (with its
 * margins) is aligned by its bottom instead, where the typing happens. Never below 0; the native
 * scroll view keeps it within the content.
 */
export function centeredScrollY({ top, height, visible, margin = NOTE_SCROLL_MARGIN }: BoxInView): number {
  if (height + 2 * margin > visible) return Math.max(0, Math.round(top + height + margin - visible));
  return Math.max(0, Math.round(top + height / 2 - visible / 2));
}

/**
 * The smallest scroll that brings the whole box (with margins) back into the visible space while
 * typing, or null when it already is. The bottom comes first (that's where new lines appear).
 */
export function followScrollY({
  top,
  height,
  visible,
  margin = NOTE_SCROLL_MARGIN,
  scrollY,
}: BoxInView & { scrollY: number }): number | null {
  const bottom = top + height + margin;
  if (bottom > scrollY + visible) return Math.round(bottom - visible);
  if (top - margin < scrollY && height + 2 * margin <= visible) return Math.max(0, Math.round(top - margin));
  return null;
}
