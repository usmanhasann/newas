/**
 * Client 10/14 p.6-7, first check-in "What's on your mind?" box and the keyboard (iOS events):
 *  - the box keeps its size and the buttons scroll with it, so nothing squeezes it (O4.01/O4.05);
 *  - keyboard opens → the box is centered in the space above it (O4.03), measured on the real
 *    scroll view and content view;
 *  - the box grows, or the user types after scrolling it away → the screen brings it back (O4.04/
 *    O4.06), but never while the user drags or flings (O4.07); our own scroll isn't the user's;
 *  - a mood tap picks the mood AND closes the keyboard; Skip, Back and a tap on the top bar close
 *    it, a swipe on the top bar doesn't (O4.08); what was typed stays (O4.09); Save closes it.
 * Native measurements are stood in (measure.ts); keyboard events are sent by hand.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Dimensions, Keyboard, ScrollView, StyleSheet, type KeyboardEvent } from 'react-native';
import { FirstCheckinStep } from '@features/onboarding/screens/steps/FirstCheckinStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

jest.mock('@features/onboarding/measure', () => ({
  measureOnScreen: jest.fn(),
  measureInScrollContent: jest.fn(),
}));
jest.mock('@features/journal', () => ({
  useCreateEntry: jest.fn(),
  useEntry: jest.fn(() => ({ data: undefined })),
}));
jest.mock('@features/ai-summary', () => ({
  useGenerateSummary: jest.fn(() => ({ isPending: false, mutate: jest.fn() })),
}));
jest.mock('@features/crisis', () => ({
  useEntryCrisisCheck: () => ({ hasCrisisWords: () => false, showSupport: jest.fn(), sheet: null }),
  CrisisSupportMessage: () => null,
}));
jest.mock('@features/safety', () => ({ reportPrivateThreat: jest.fn() }));
jest.mock('@features/welcome-reflection', () => ({ useStartWelcomeReflection: () => jest.fn() }));

const measure = jest.requireMock('@features/onboarding/measure') as {
  measureOnScreen: jest.Mock;
  measureInScrollContent: jest.Mock;
};
const journal = jest.requireMock('@features/journal') as { useCreateEntry: jest.Mock };
const createMutateAsync = jest.fn(() => Promise.resolve({ id: 'entry-1' }));
journal.useCreateEntry.mockReturnValue({ isPending: false, mutateAsync: createMutateAsync });

const handlers: Record<string, (e?: KeyboardEvent) => void> = {};
jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: (e?: KeyboardEvent) => void) => {
  handlers[event] = fn;
  return { remove: jest.fn() };
}) as unknown as typeof Keyboard.addListener);
jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
// A clock the test moves: our own animated scroll counts for 400ms.
let now = 1_000_000;
jest.spyOn(Date, 'now').mockImplementation(() => now);
// The mocked ScrollView's methods live on its prototype.
const scrollTo = ScrollView.prototype.scrollTo as unknown as jest.Mock;
const getNativeScrollRef = ScrollView.prototype.getNativeScrollRef as unknown as jest.Mock;

const nav = {
  hydrated: true,
  data: {},
  step: 'firstCheckin',
  steps: [],
  progress: null,
  canBack: true,
  saving: false,
  view: {} as OnboardingNav['view'],
  patchLocal: jest.fn(),
  persist: jest.fn(() => Promise.resolve()),
  goNext: jest.fn(() => Promise.resolve()),
  goBack: jest.fn(),
} as OnboardingNav;

const layout = (height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width: 350, height } } });
const keyboardAt = (screenY: number, height: number) =>
  ({ endCoordinates: { screenX: 0, screenY, width: 390, height } }) as KeyboardEvent;
const at = (x: number, y: number) => ({ nativeEvent: { pageX: x, pageY: y } });

it('keeps the note box centered and in view above the keyboard, and closes the keyboard on outside taps', async () => {
  const utils = await render(<FirstCheckinStep nav={nav} />);
  const scroll = utils.getByTestId('composer-scroll');
  const box = utils.getByTestId('note-box');
  const input = utils.getByPlaceholderText('A sentence is plenty…');
  scrollTo.mockClear();

  // O4.01/O4.05: the box keeps its resting size (no 3-line cap) and grows to a fixed height; the
  // buttons are inside the scroll view, not pinned under it.
  expect(StyleSheet.flatten(input.props.style)).toMatchObject({ minHeight: 80, maxHeight: 192 });
  expect(input.props.numberOfLines).toBeUndefined();
  expect(within(scroll).getByText('Save & reflect')).toBeTruthy();
  expect(within(scroll).getByText('Skip for now')).toBeTruthy();

  // Real refs are measured: the native scroll view, and the box against the content view.
  const nativeScroll = { tag: 'native-scroll' };
  getNativeScrollRef.mockReturnValue(nativeScroll);
  const content = { tag: 'content' };
  (scroll.props.innerViewRef as { current: unknown }).current = content;

  // The screen below the top bar: 700 tall, starting 100 from the top (bottom at 800).
  await fireEvent(scroll, 'layout', layout(700));
  await fireEvent(input, 'focus');
  await fireEvent.changeText(input, 'Long day');

  // Keyboard opens: top edge at 504 → it covers 800 - 504 = 296 → 404 visible.
  measure.measureOnScreen.mockResolvedValue({ pageY: 100, height: 700 });
  await act(async () => handlers.keyboardWillShow?.(keyboardAt(504, 340)));
  expect(measure.measureOnScreen).toHaveBeenCalledWith(nativeScroll);
  const space = utils.getByTestId('keyboard-space');
  expect(space.props.style).toMatchObject({ height: 296 });

  // Label + box at 520 (128 tall) → centered: 520 + 64 - 202 = 382.
  measure.measureInScrollContent.mockResolvedValue({ top: 520, height: 128 });
  await fireEvent(space, 'layout', layout(296));
  await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ y: 382, animated: true }));
  expect(measure.measureInScrollContent).toHaveBeenCalledWith(expect.anything(), content);

  // Android sends momentum events for OUR animated scroll too: that must not block following.
  await fireEvent(scroll, 'momentumScrollBegin');
  // New lines: the box is now 260 tall, its bottom (+ margin) at 804 → scroll to 804 - 404 = 400.
  measure.measureInScrollContent.mockResolvedValue({ top: 520, height: 260 });
  await fireEvent(box, 'layout', layout(260));
  await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith({ y: 400, animated: true }));
  await fireEvent(scroll, 'momentumScrollEnd');

  // The user scrolled back to the top; typing on the same line (no new line) brings the box back.
  now += 1000;
  await fireEvent(scroll, 'scroll', { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
  scrollTo.mockClear();
  await fireEvent.changeText(input, 'Long day, a');
  await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith({ y: 400, animated: true }));

  // While the user drags, nothing scrolls on its own...
  now += 1000;
  await fireEvent(scroll, 'scroll', { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
  scrollTo.mockClear();
  await fireEvent(scroll, 'scrollBeginDrag');
  measure.measureInScrollContent.mockResolvedValue({ top: 520, height: 300 });
  await fireEvent(box, 'layout', layout(300));
  expect(scrollTo).not.toHaveBeenCalled();
  await fireEvent(scroll, 'scrollEndDrag');
  // ...nor while their fling coasts; once it stops, the box is kept in view again.
  await fireEvent(scroll, 'momentumScrollBegin');
  await fireEvent(box, 'layout', layout(300));
  expect(scrollTo).not.toHaveBeenCalled();
  await fireEvent(scroll, 'momentumScrollEnd');
  await fireEvent(box, 'layout', layout(300));
  await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));

  // The mood row lets a tap reach the mood while the keyboard is open...
  const handled = JSON.stringify(utils.toJSON()).match(/"keyboardShouldPersistTaps":"handled"/g) ?? [];
  expect(handled.length).toBeGreaterThanOrEqual(2); // the screen + the mood row
  // ...and that one tap picks the mood AND closes the keyboard.
  dismiss.mockClear();
  await fireEvent.press(utils.getByLabelText('Happy'));
  expect(dismiss).toHaveBeenCalled();
  expect(utils.getByLabelText('Happy').props.accessibilityState).toMatchObject({ selected: true });

  // A tap on the top bar closes the keyboard; a swipe that starts there doesn't.
  const topBar = utils.getByTestId('composer-top-bar');
  dismiss.mockClear();
  await fireEvent(topBar, 'pressIn', at(40, 20));
  await fireEvent.press(topBar, at(40, 60));
  expect(dismiss).not.toHaveBeenCalled();
  await fireEvent(topBar, 'pressIn', at(40, 20));
  await fireEvent.press(topBar, at(42, 22));
  expect(dismiss).toHaveBeenCalledTimes(1);

  // Back and Skip close it too.
  dismiss.mockClear();
  await fireEvent.press(utils.getByLabelText('Go back'));
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(nav.goBack).toHaveBeenCalled();
  dismiss.mockClear();
  await fireEvent.press(utils.getByText('Skip for now'));
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(nav.goNext).toHaveBeenCalledWith({ reflection_status: 'skipped' });

  // Leaving the box keeps what was typed.
  await fireEvent(input, 'blur');
  expect(utils.getByPlaceholderText('A sentence is plenty…').props.value).toBe('Long day, a');

  // Save closes the keyboard first.
  dismiss.mockClear();
  await fireEvent.press(utils.getByText('Save & reflect'));
  expect(dismiss).toHaveBeenCalled();
  await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
});
