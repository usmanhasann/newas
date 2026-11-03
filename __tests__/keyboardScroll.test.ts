/**
 * Client 10/14 p.6-7 (first check-in): when the keyboard opens the note box is centered in the
 * space above it, and as lines are typed the screen keeps it in view. Locks the pure numbers.
 */
import {
  NOTE_MIN_HEIGHT,
  NOTE_SCROLL_MARGIN,
  centeredScrollY,
  dockedKeyboardTop,
  followScrollY,
  keyboardOverlap,
  noteMaxHeight,
} from '@features/onboarding/keyboardScroll';

describe('dockedKeyboardTop: only a keyboard docked at the bottom takes room', () => {
  it('a normal keyboard: its top edge', () => {
    expect(dockedKeyboardTop({ screenY: 512, height: 340 }, 852, 'ios')).toBe(512);
    expect(dockedKeyboardTop({ screenY: 470, height: 290 }, 800, 'android')).toBe(470);
  });
  it('hidden, zero frames (iOS Prefer Cross-Fade) and floating keyboards: none', () => {
    expect(dockedKeyboardTop(null, 852, 'ios')).toBeNull();
    expect(dockedKeyboardTop(undefined, 852, 'android')).toBeNull();
    expect(dockedKeyboardTop({ screenY: 0, height: 0 }, 852, 'ios')).toBeNull();
    expect(dockedKeyboardTop({ screenY: 0, height: 340 }, 852, 'ios')).toBeNull();
    expect(dockedKeyboardTop({ screenY: 600, height: -48 }, 800, 'android')).toBeNull();
    // iPad floating keyboard: mid-screen, doesn't reach the bottom.
    expect(dockedKeyboardTop({ screenY: 500, height: 260 }, 1366, 'ios')).toBeNull();
  });
});

describe('keyboardOverlap', () => {
  it('how much of the view the keyboard covers, never negative', () => {
    expect(keyboardOverlap(120, 700, 512)).toBe(308);
    expect(keyboardOverlap(120, 300, 512)).toBe(0);
  });
});

describe('noteMaxHeight: fixed for the screen size, never below the resting size', () => {
  it('a quarter of the screen between 128 and 192', () => {
    expect(noteMaxHeight(640)).toBe(160);
    expect(noteMaxHeight(400)).toBe(128);
    expect(noteMaxHeight(1366)).toBe(192);
    expect(noteMaxHeight(640)).toBeGreaterThan(NOTE_MIN_HEIGHT);
  });
});

describe('centeredScrollY: the box centered in the space above the keyboard', () => {
  it('centers the box', () => {
    // visible 400, box 120 tall at 500 → its middle (560) at 200 → scroll 360.
    expect(centeredScrollY({ top: 500, height: 120, visible: 400 })).toBe(360);
  });
  it('never scrolls above the top', () => {
    expect(centeredScrollY({ top: 40, height: 120, visible: 400 })).toBe(0);
  });
  it('a box too tall to center is aligned by its bottom, where typing happens', () => {
    const y = centeredScrollY({ top: 500, height: 380, visible: 400 });
    expect(y).toBe(500 + 380 + NOTE_SCROLL_MARGIN - 400);
  });
});

describe('followScrollY: keep the box in view while typing, moving as little as possible', () => {
  it('the box grew below the visible space: scroll just enough', () => {
    expect(followScrollY({ top: 500, height: 200, visible: 400, scrollY: 300 })).toBe(
      500 + 200 + NOTE_SCROLL_MARGIN - 400,
    );
  });
  it('already in view: no scroll', () => {
    expect(followScrollY({ top: 500, height: 120, visible: 400, scrollY: 360 })).toBeNull();
  });
  it('its top went above the visible space: scroll back up just enough', () => {
    expect(followScrollY({ top: 500, height: 120, visible: 400, scrollY: 520 })).toBe(
      500 - NOTE_SCROLL_MARGIN,
    );
  });
});
