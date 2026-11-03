/**
 * The onboarding first check in with concerning words (client 10/14 p.35-36, N15.70 to N15.73 and
 * N18): keywords only. "Save & reflect" saves the entry privately, the crisis resources pop-up opens
 * as soon as it's saved, no AI reflection is asked for (even while the saved entry still reads idle)
 * and nothing goes to the private-threat AI check. The answers-based Welcome reflection starts
 * instead, and onboarding goes on with reflection_status 'flagged' only once the pop-up is closed.
 * There is no reflection page any more (N15.03): the composer stays behind the pop-up.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { FirstCheckinStep } from '@features/onboarding/screens/steps/FirstCheckinStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

const mockCreate = jest.fn((_i: Record<string, unknown>) => Promise.resolve({ id: 'entry-1' }));
const mockGenerate = jest.fn();
const mockThreat = jest.fn();
const mockShowSupport = jest.fn();
const mockStartWelcome = jest.fn();
// What the pop-up runs once it's closed.
const mockAfterClose: { current: (() => void) | null } = { current: null };

jest.mock('@features/onboarding/measure', () => ({
  measureOnScreen: jest.fn(),
  measureInScrollContent: jest.fn(),
}));
jest.mock('@features/onboarding/analytics', () => ({ trackOnboarding: jest.fn() }));
jest.mock('@features/journal', () => ({
  useCreateEntry: () => ({
    isPending: false,
    mutateAsync: (i: Record<string, unknown>) => mockCreate(i),
  }),
  // The saved entry still reads idle with no flag (as from an older server): the phone's check
  // alone must keep the AI away.
  useEntry: (id: string) => ({
    data: id
      ? {
          id,
          note: 'I feel hopeless',
          mood_slugs: ['happy'],
          ai_status: 'idle',
          ai_summary: null,
          crisis_flagged: false,
        }
      : undefined,
  }),
}));
jest.mock('@features/ai-summary', () => ({
  useGenerateSummary: () => ({ isPending: false, mutate: () => mockGenerate() }),
}));
jest.mock('@features/crisis', () => ({
  useEntryCrisisCheck: () => ({
    hasCrisisWords: (t: string | null | undefined) => /hopeless/i.test(t ?? ''),
    showSupport: (then?: () => void) => {
      mockShowSupport();
      mockAfterClose.current = then ?? null;
    },
    sheet: null,
    supportOpen: false,
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

it('saves privately, opens support, starts the answers-based reflection, and goes on after the pop-up', async () => {
  const utils = await render(<FirstCheckinStep nav={nav} />);
  await fireEvent.press(utils.getByLabelText('Happy'));
  await fireEvent.changeText(utils.getByPlaceholderText('A sentence is plenty…'), 'I feel hopeless');
  // Writing alone opens nothing.
  expect(mockShowSupport).not.toHaveBeenCalled();

  await fireEvent.press(utils.getByText('Save & reflect'));
  await waitFor(() => expect(mockShowSupport).toHaveBeenCalledTimes(1));
  expect(mockCreate).toHaveBeenCalledWith({ mood_slugs: ['happy'], note: 'I feel hopeless' });
  // A resume while the pop-up is open knows the check in exists.
  expect(nav.persist).toHaveBeenCalledWith({ first_entry_id: 'entry-1' });
  expect(mockThreat).not.toHaveBeenCalled();
  expect(mockStartWelcome).toHaveBeenCalledTimes(1);

  // The pop-up comes first: the step doesn't move on while it's open, and no page replaces the
  // composer behind it.
  expect(nav.goNext).not.toHaveBeenCalled();
  expect(utils.queryByText('Your first reflection')).toBeNull();
  expect(utils.queryByText('Continue')).toBeNull();
  expect(utils.queryByText('AI Insight')).toBeNull();
  expect(utils.getByPlaceholderText('A sentence is plenty…').props.value).toBe('I feel hopeless');

  // Closing it goes on, flagged.
  await act(async () => mockAfterClose.current?.());
  await waitFor(() =>
    expect(nav.goNext).toHaveBeenCalledWith({ first_entry_id: 'entry-1', reflection_status: 'flagged' }),
  );
  expect(nav.goNext).toHaveBeenCalledTimes(1);

  // Never the AI, even though the saved entry reads idle; and no second Welcome request.
  expect(mockGenerate).not.toHaveBeenCalled();
  expect(mockStartWelcome).toHaveBeenCalledTimes(1);
});
