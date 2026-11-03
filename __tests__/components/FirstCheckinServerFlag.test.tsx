/**
 * The onboarding first check in when only the SERVER flags the entry (N18: the database is the
 * authority, e.g. a keyword the phone's list doesn't have yet): it is handled exactly like the
 * phone's own match. The crisis pop-up opens, no AI reflection and no private-threat check, the
 * Welcome reflection starts, and onboarding goes on 'flagged' once the pop-up is closed.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { FirstCheckinStep } from '@features/onboarding/screens/steps/FirstCheckinStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

const mockGenerate = jest.fn();
const mockThreat = jest.fn();
const mockStartWelcome = jest.fn();
const mockAfterClose: { current: (() => void) | null } = { current: null };

jest.mock('@features/onboarding/measure', () => ({
  measureOnScreen: jest.fn(),
  measureInScrollContent: jest.fn(),
}));
jest.mock('@features/onboarding/analytics', () => ({ trackOnboarding: jest.fn() }));
jest.mock('@features/journal', () => ({
  useCreateEntry: () => ({
    isPending: false,
    mutateAsync: () => Promise.resolve({ id: 'entry-9', crisis_flagged: true, ai_status: 'idle' }),
  }),
  useEntry: () => ({ data: undefined }),
}));
jest.mock('@features/ai-summary', () => ({
  useGenerateSummary: () => ({ isPending: false, mutate: () => mockGenerate() }),
}));
jest.mock('@features/crisis', () => ({
  useEntryCrisisCheck: () => ({
    hasCrisisWords: () => false,
    showSupport: (then?: () => void) => {
      mockAfterClose.current = then ?? null;
    },
    sheet: null,
    supportOpen: true,
  }),
}));
jest.mock('@features/safety', () => ({ reportPrivateThreat: (i: unknown) => mockThreat(i) }));
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

it('treats a server-flagged check in as flagged: support first, never the AI', async () => {
  const utils = await render(<FirstCheckinStep nav={nav} />);
  await fireEvent.press(utils.getByLabelText('Calm'));
  await fireEvent.changeText(utils.getByPlaceholderText('A sentence is plenty…'), 'Long day');
  await fireEvent.press(utils.getByText('Save & reflect'));

  await waitFor(() => expect(mockAfterClose.current).not.toBeNull());
  expect(mockStartWelcome).toHaveBeenCalledTimes(1);
  // While the pop-up is open, neither button can start anything else.
  expect(utils.getByText('Skip for now')).toBeDisabled();
  expect(nav.goNext).not.toHaveBeenCalled();

  await act(async () => mockAfterClose.current?.());
  await waitFor(() =>
    expect(nav.goNext).toHaveBeenCalledWith({ first_entry_id: 'entry-9', reflection_status: 'flagged' }),
  );
  expect(mockGenerate).not.toHaveBeenCalled();
  expect(mockThreat).not.toHaveBeenCalled();
});
