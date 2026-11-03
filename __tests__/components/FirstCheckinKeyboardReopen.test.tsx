/**
 * Client 10/14 p.7 (O4.03/O4.09/O4.10), iOS event order: the keyboard can open BEFORE the box
 * reports focus (centering still happens); keyboardDidShow re-checks the settled frame; a closed
 * keyboard leaves no blank space and nothing scrolled past the end; what was typed stays; tapping
 * back in centers the box again; a zero frame (Prefer Cross-Fade Transitions) takes no room.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions, Keyboard, ScrollView, type KeyboardEvent } from 'react-native';
import { FirstCheckinStep } from '@features/onboarding/screens/steps/FirstCheckinStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

jest.mock('@features/onboarding/measure', () => ({
  measureOnScreen: jest.fn(),
  measureInScrollContent: jest.fn(),
}));
jest.mock('@features/journal', () => ({
  useCreateEntry: jest.fn(() => ({ isPending: false, mutateAsync: jest.fn() })),
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
const handlers: Record<string, (e?: KeyboardEvent) => void> = {};
jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: (e?: KeyboardEvent) => void) => {
  handlers[event] = fn;
  return { remove: jest.fn() };
}) as unknown as typeof Keyboard.addListener);
jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
const scrollTo = ScrollView.prototype.scrollTo as unknown as jest.Mock;

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

it('centers on every opening, in either event order, and cleans up when the keyboard closes', async () => {
  const utils = await render(<FirstCheckinStep nav={nav} />);
  const scroll = utils.getByTestId('composer-scroll');
  const input = utils.getByPlaceholderText('A sentence is plenty…');
  scrollTo.mockClear();
  await fireEvent(scroll, 'layout', layout(700));
  await fireEvent.changeText(input, 'Long day');
  measure.measureOnScreen.mockResolvedValue({ pageY: 100, height: 700 });
  measure.measureInScrollContent.mockResolvedValue({ top: 520, height: 128 });

  // Keyboard first: its room is laid out before the box reports focus → nothing yet...
  await act(async () => handlers.keyboardWillShow?.(keyboardAt(504, 340)));
  await fireEvent(utils.getByTestId('keyboard-space'), 'layout', layout(296));
  expect(scrollTo).not.toHaveBeenCalled();
  // ...then focus arrives and centers it.
  await fireEvent(input, 'focus');
  await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ y: 382, animated: true }));
  // keyboardDidShow (settled frame) keeps the room.
  await act(async () => handlers.keyboardDidShow?.(keyboardAt(504, 340)));
  expect(utils.getByTestId('keyboard-space').props.style).toMatchObject({ height: 296 });

  // Keyboard closes: no room left, and the screen isn't left scrolled past its end.
  await fireEvent(input, 'blur');
  await act(async () => handlers.keyboardWillHide?.());
  expect(utils.getByTestId('keyboard-space').props.style).toMatchObject({ height: 0 });
  await fireEvent(scroll, 'contentSizeChange', 350, 700);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: true });
  expect(utils.getByPlaceholderText('A sentence is plenty…').props.value).toBe('Long day');

  // A zero frame (Prefer Cross-Fade Transitions) takes no room.
  await act(async () => handlers.keyboardWillShow?.(keyboardAt(0, 0)));
  expect(utils.getByTestId('keyboard-space').props.style).toMatchObject({ height: 0 });

  // Tap back in: the next opening centers the box again.
  scrollTo.mockClear();
  await fireEvent(input, 'focus');
  await act(async () => handlers.keyboardDidShow?.(keyboardAt(504, 340)));
  await fireEvent(utils.getByTestId('keyboard-space'), 'layout', layout(296));
  await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith({ y: 382, animated: true }));
});
