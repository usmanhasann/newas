/**
 * The native measurements behind the first check-in keyboard fix (client 10/14 p.6-7): the right
 * numbers are read from measure() (pageY, not y) and measureLayout(), and anything not laid out
 * yet is "no measurement" rather than a wrong one.
 */
import type { HostInstance } from 'react-native';
import { measureInScrollContent, measureOnScreen } from '@features/onboarding/measure';

const host = (methods: object) => methods as unknown as HostInstance;

describe('measureOnScreen', () => {
  it('reads pageY (from the top of the screen) and height', async () => {
    const view = host({ measure: (cb: (...a: number[]) => void) => cb(0, 5, 390, 700, 0, 100) });
    await expect(measureOnScreen(view)).resolves.toEqual({ pageY: 100, height: 700 });
  });
  it('not laid out (height 0) or no view: no measurement', async () => {
    const empty = host({ measure: (cb: (...a: number[]) => void) => cb(0, 0, 0, 0, 0, 0) });
    await expect(measureOnScreen(empty)).resolves.toBeNull();
    await expect(measureOnScreen(null)).resolves.toBeNull();
    await expect(measureOnScreen(undefined)).resolves.toBeNull();
  });
});

describe('measureInScrollContent', () => {
  const content = host({});
  it('reads the top and height inside the content, against the content view', async () => {
    const relative: unknown[] = [];
    const view = host({
      measureLayout: (to: unknown, ok: (...a: number[]) => void) => {
        relative.push(to);
        ok(0, 520, 350, 128);
      },
    });
    await expect(measureInScrollContent(view, content)).resolves.toEqual({ top: 520, height: 128 });
    expect(relative).toEqual([content]);
  });
  it('a failed measurement, no content view or no box: no measurement', async () => {
    const failing = host({ measureLayout: (_to: unknown, _ok: unknown, fail: () => void) => fail() });
    await expect(measureInScrollContent(failing, content)).resolves.toBeNull();
    const view = host({ measureLayout: (_to: unknown, ok: (...a: number[]) => void) => ok(0, 1, 2, 3) });
    await expect(measureInScrollContent(view, null)).resolves.toBeNull();
    await expect(measureInScrollContent(null, content)).resolves.toBeNull();
  });
});
