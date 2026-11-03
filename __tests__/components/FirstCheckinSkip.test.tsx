/**
 * The onboarding first check in, "Skip for now" (client 10/14 p.33, N15.07): no entry is created, the
 * Welcome reflection (written from the onboarding answers) starts the moment they tap, and onboarding
 * goes straight on with reflection_status 'skipped'. No entry reflection is asked for.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { FirstCheckinStep } from '@features/onboarding/screens/steps/FirstCheckinStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

const mockCreate = jest.fn();
const mockGenerate = jest.fn();
const mockStartWelcome = jest.fn();

jest.mock('@features/onboarding/measure', () => ({
  measureOnScreen: jest.fn(),
  measureInScrollContent: jest.fn(),
}));
jest.mock('@features/onboarding/analytics', () => ({ trackOnboarding: jest.fn() }));
jest.mock('@features/journal', () => ({
  useCreateEntry: () => ({ isPending: false, mutateAsync: (i: unknown) => mockCreate(i) }),
  useEntry: () => ({ data: undefined }),
}));
jest.mock('@features/ai-summary', () => ({
  useGenerateSummary: () => ({ isPending: false, mutate: () => mockGenerate() }),
}));
jest.mock('@features/crisis', () => ({
  useEntryCrisisCheck: () => ({ hasCrisisWords: () => false, showSupport: jest.fn(), sheet: null }),
}));
jest.mock('@features/safety', () => ({ reportPrivateThreat: jest.fn() }));
jest.mock('@features/welcome-reflection', () => ({
  useStartWelcomeReflection: () => () => mockStartWelcome(),
}));

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

it('starts the answers-based reflection on tap and goes on without creating an entry', async () => {
  const utils = await render(<FirstCheckinStep nav={nav} />);
  // Something typed but not saved is not an entry.
  await fireEvent.changeText(utils.getByPlaceholderText('A sentence is plenty…'), 'Not now');

  await fireEvent.press(utils.getByText('Skip for now'));
  await waitFor(() => expect(nav.goNext).toHaveBeenCalledWith({ reflection_status: 'skipped' }));
  expect(mockStartWelcome).toHaveBeenCalledTimes(1);
  // Started the moment they tapped, before the step moves on.
  expect(mockStartWelcome.mock.invocationCallOrder[0]).toBeLessThan(
    (nav.goNext as jest.Mock).mock.invocationCallOrder[0]!,
  );
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockGenerate).not.toHaveBeenCalled();
  expect(utils.queryByText('Your first reflection')).toBeNull();
});
