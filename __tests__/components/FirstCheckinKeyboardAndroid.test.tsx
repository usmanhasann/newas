/**
 * Client 10/14 p.6-7 on Android (always edge-to-edge in Expo SDK 56: the window doesn't shrink for
 * the keyboard, which is why the old screen let it cover the box). Android only sends
 * keyboardDidShow / keyboardDidHide: the box is centered above the keyboard, a floating keyboard
 * takes no room, and the room goes when the keyboard closes.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions, Keyboard, Platform, ScrollView, type KeyboardEvent } from 'react-native';
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
jest.replaceProperty(Platform, 'OS', 'android');

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

it('listens to the Android keyboard events and centers the box above the keyboard', async () => {
  const utils = await render(<FirstCheckinStep nav={nav} />);
  expect(Object.keys(handlers).sort()).toEqual(['keyboardDidHide', 'keyboardDidShow']);
  const scroll = utils.getByTestId('composer-scroll');
  scrollTo.mockClear();
  await fireEvent(scroll, 'layout', layout(700));
  await fireEvent(utils.getByPlaceholderText('A sentence is plenty…'), 'focus');

  measure.measureOnScreen.mockResolvedValue({ pageY: 100, height: 700 });
  measure.measureInScrollContent.mockResolvedValue({ top: 520, height: 128 });
  await act(async () => handlers.keyboardDidShow?.(keyboardAt(504, 296)));
  expect(utils.getByTestId('keyboard-space').props.style).toMatchObject({ height: 296 });
  await fireEvent(utils.getByTestId('keyboard-space'), 'layout', layout(296));
  await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ y: 382, animated: true }));

  // A floating keyboard (height 0 or less) takes no room.
  await act(async () => handlers.keyboardDidShow?.(keyboardAt(600, -48)));
  expect(utils.getByTestId('keyboard-space').props.style).toMatchObject({ height: 0 });
  await act(async () => handlers.keyboardDidShow?.(keyboardAt(504, 296)));
  expect(utils.getByTestId('keyboard-space').props.style).toMatchObject({ height: 296 });

  await act(async () => handlers.keyboardDidHide?.(keyboardAt(844, 0)));
  expect(utils.getByTestId('keyboard-space').props.style).toMatchObject({ height: 0 });
});
