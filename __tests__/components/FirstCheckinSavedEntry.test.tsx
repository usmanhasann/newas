/**
 * The onboarding first check in when it was already saved (Back from the next step, or resuming
 * onboarding): no second composer (no duplicate entry) and no reflection page (client 10/14 p.33,
 * N15.03). The saved moods and words show with Continue, and Back still works. Continue goes on
 * without asking for a reflection (the paywall starts one that hasn't started, after its own check).
 * If the step can't be saved, a message shows and Continue tries again.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { FirstCheckinStep } from '@features/onboarding/screens/steps/FirstCheckinStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

const mockCreate = jest.fn();
const mockGenerate = jest.fn();
const mockStartWelcome = jest.fn();
const mockToastError = jest.fn();

jest.mock('@features/onboarding/measure', () => ({
  measureOnScreen: jest.fn(),
  measureInScrollContent: jest.fn(),
}));
jest.mock('@features/onboarding/analytics', () => ({ trackOnboarding: jest.fn() }));
jest.mock('@store/toast', () => ({ toast: { error: (m: string) => mockToastError(m) } }));
jest.mock('@features/journal', () => ({
  useCreateEntry: () => ({ isPending: false, mutateAsync: (i: unknown) => mockCreate(i) }),
  useEntry: (id: string) => ({
    data:
      id === 'entry-1'
        ? {
            id,
            note: 'Today was hard but I showed up anyway.',
            mood_slugs: ['calm', 'not-a-mood'],
            ai_status: 'ready',
            ai_summary: 'A gentle reflection.',
            crisis_flagged: false,
          }
        : undefined,
  }),
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

const goNext = jest
  .fn((_extra?: Record<string, unknown>) => Promise.resolve())
  .mockRejectedValueOnce(new Error('offline'));

const nav = {
  hydrated: true,
  data: { first_entry_id: 'entry-1' },
  step: 'firstCheckin',
  steps: [],
  progress: null,
  canBack: true,
  saving: false,
  view: {} as OnboardingNav['view'],
  patchLocal: jest.fn(),
  persist: jest.fn(() => Promise.resolve()),
  goNext,
  goBack: jest.fn(),
} as OnboardingNav;

it('shows the saved check in with Continue, never a reflection page or a second composer', async () => {
  const utils = await render(<FirstCheckinStep nav={nav} />);

  expect(utils.getByTestId('first-checkin-saved')).toBeTruthy();
  expect(utils.getByText('What you wrote')).toBeTruthy();
  expect(utils.getByText('Today was hard but I showed up anyway.')).toBeTruthy();
  // Only real moods show as pills.
  expect(utils.getByText('Calm')).toBeTruthy();
  expect(utils.queryByText('not-a-mood')).toBeNull();
  // Not the removed page: no reflection title or text.
  expect(utils.queryByText('Your first reflection')).toBeNull();
  expect(utils.queryByText('A gentle reflection.')).toBeNull();
  // No second composer.
  expect(utils.queryByPlaceholderText('A sentence is plenty…')).toBeNull();
  expect(utils.queryByText('Save & reflect')).toBeNull();
  expect(utils.queryByText('Skip for now')).toBeNull();

  // Back works here.
  await fireEvent.press(utils.getByLabelText('Go back'));
  expect(nav.goBack).toHaveBeenCalledTimes(1);

  // Continue: the step can't be saved the first time → a message, and Continue is there again.
  await fireEvent.press(utils.getByText('Continue'));
  await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('We couldn’t continue. Please try again.'));
  expect(goNext).toHaveBeenCalledWith({ first_entry_id: 'entry-1', reflection_status: 'ready' });

  await fireEvent.press(await utils.findByText('Continue'));
  await waitFor(() => expect(goNext).toHaveBeenCalledTimes(2));
  expect(goNext).toHaveBeenLastCalledWith({ first_entry_id: 'entry-1', reflection_status: 'ready' });

  // While the step moves on, the saved check in stays on screen (never an empty composer), and its
  // Continue is busy: another tap does nothing.
  expect(utils.getByText('What you wrote')).toBeTruthy();
  expect(utils.queryByPlaceholderText('A sentence is plenty…')).toBeNull();
  expect(utils.queryByText('Continue')).toBeNull();
  const busy = utils
    .getAllByRole('button')
    .filter((b) => (b.props.accessibilityState as { busy?: boolean } | undefined)?.busy);
  expect(busy).toHaveLength(1);
  await fireEvent.press(busy[0]!);
  expect(goNext).toHaveBeenCalledTimes(2);

  // Nothing new is written or asked for.
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockGenerate).not.toHaveBeenCalled();
  expect(mockStartWelcome).not.toHaveBeenCalled();
});
