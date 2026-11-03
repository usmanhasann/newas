/**
 * The onboarding first check in, "Save & reflect" with no concerning words (client 10/14 p.33,
 * N15.03/N15.05/N15.06): there is no "Your first reflection" page any more. The entry is saved, the
 * AI reflection starts in the background for THAT entry, and the step goes straight on with
 * reflection_status 'pending' (the paywall shows the reflection when it's ready). The private-threat
 * check still runs, and nothing about the Welcome reflection or the crisis pop-up happens.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { FirstCheckinStep } from '@features/onboarding/screens/steps/FirstCheckinStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

const mockCreate = jest.fn((_i: Record<string, unknown>) =>
  Promise.resolve({ id: 'entry-1', crisis_flagged: false }),
);
const mockGenerate = jest.fn((_entryId: string) => undefined);
const mockThreat = jest.fn();
const mockShowSupport = jest.fn();
const mockStartWelcome = jest.fn();

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
  useEntry: () => ({ data: undefined }),
}));
// The hook is bound to an entry id: record which entry each mutate() was for.
jest.mock('@features/ai-summary', () => ({
  useGenerateSummary: (entryId: string) => ({
    isPending: false,
    mutate: () => mockGenerate(entryId),
  }),
}));
jest.mock('@features/crisis', () => ({
  useEntryCrisisCheck: () => ({
    hasCrisisWords: () => false,
    showSupport: () => mockShowSupport(),
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

it('saves, starts the reflection for that entry in the background, and goes straight on', async () => {
  const utils = await render(<FirstCheckinStep nav={nav} />);
  expect(utils.getByText('Let’s try your first check in.')).toBeTruthy();
  // No helper caption under the composer: the placeholder carries the guidance.
  expect(utils.queryByText(/required to continue/)).toBeNull();

  await fireEvent.press(utils.getByLabelText('Happy'));
  await fireEvent.changeText(utils.getByPlaceholderText('A sentence is plenty…'), ' Long day ');
  await fireEvent.press(utils.getByText('Save & reflect'));

  await waitFor(() =>
    expect(nav.goNext).toHaveBeenCalledWith({ first_entry_id: 'entry-1', reflection_status: 'pending' }),
  );
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockCreate).toHaveBeenCalledWith({ mood_slugs: ['happy'], note: 'Long day' });
  // The reflection is asked for once, for the entry just saved, before the step moves on.
  expect(mockGenerate).toHaveBeenCalledTimes(1);
  expect(mockGenerate).toHaveBeenCalledWith('entry-1');
  expect(mockGenerate.mock.invocationCallOrder[0]).toBeLessThan(
    (nav.goNext as jest.Mock).mock.invocationCallOrder[0]!,
  );
  expect(nav.goNext).toHaveBeenCalledTimes(1);
  expect(mockThreat).toHaveBeenCalledWith({ text: 'Long day', source: 'checkin_note', sourceId: 'entry-1' });
  // goNext saves the entry id with the step; no separate save is needed.
  expect(nav.persist).not.toHaveBeenCalled();

  // No crisis pop-up, no answers-based reflection.
  expect(mockShowSupport).not.toHaveBeenCalled();
  expect(mockStartWelcome).not.toHaveBeenCalled();

  // The removed page never shows: no reflection title, no "What you wrote", no Continue. The
  // composer stays as it was until the step changes, its Save button busy and Skip off.
  expect(utils.queryByText('Your first reflection')).toBeNull();
  expect(utils.queryByText('What you wrote')).toBeNull();
  expect(utils.queryByText('Continue')).toBeNull();
  expect(utils.queryByText('This is what you’ll get every day.')).toBeNull();
  expect(utils.getByPlaceholderText('A sentence is plenty…').props.value).toBe(' Long day ');
  const busy = utils
    .getAllByRole('button')
    .filter((b) => (b.props.accessibilityState as { busy?: boolean } | undefined)?.busy);
  expect(busy).toHaveLength(1);
  expect(busy[0]).toBeDisabled();
  expect(utils.getByText('Skip for now')).toBeDisabled();

  // A second tap can't save a second entry, and Skip can't start the other reflection.
  await fireEvent.press(busy[0]!);
  await fireEvent.press(utils.getByText('Skip for now'));
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockGenerate).toHaveBeenCalledTimes(1);
  expect(mockStartWelcome).not.toHaveBeenCalled();
  expect(nav.goNext).toHaveBeenCalledTimes(1);
});
