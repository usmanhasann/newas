/**
 * Native measurements for the keyboard-aware note screen (kept apart so tests can stand them in).
 * Both resolve null when the view isn't laid out yet.
 */
import type { HostInstance } from 'react-native';

/**
 * A view's top (from the top of the screen) and height. Uses measure()'s pageY, which is in the
 * same space as the keyboard's screenY on both platforms (Android's measureInWindow is not).
 */
export function measureOnScreen(
  view: HostInstance | null | undefined,
): Promise<{ pageY: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!view) return resolve(null);
    view.measure((_x, _y, _width, height, _pageX, pageY) =>
      resolve(height > 0 ? { pageY, height } : null),
    );
  });
}

/** A view's top and height inside a scroll view's content (unaffected by the scroll position). */
export function measureInScrollContent(
  view: HostInstance | null | undefined,
  content: HostInstance | null | undefined,
): Promise<{ top: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!view || !content) return resolve(null);
    view.measureLayout(
      content,
      (_x, top, _width, height) => resolve(height > 0 ? { top, height } : null),
      () => resolve(null),
    );
  });
}
