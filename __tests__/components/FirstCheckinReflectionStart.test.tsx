/**
 * The background reflection on the first check in (client 10/14 p.33, N15.05/N15.06), with the REAL
 * useGenerateSummary hook and React Query: the hook starts out bound to no entry, so this proves the
 * request goes out for the entry that was just saved (not an empty id), exactly once, and keeps going
 * after the step has moved on (the step's screen is gone by the time the reply arrives).
 * Only the network call (invokeAiSummary) is stood in.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FirstCheckinStep } from '@features/onboarding/screens/steps/FirstCheckinStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

const mockInvoke = jest.fn((_entryId: string) => new Promise<unknown>(() => undefined));

jest.mock('@features/onboarding/measure', () => ({
  measureOnScreen: jest.fn(),
  measureInScrollContent: jest.fn(),
}));
jest.mock('@features/onboarding/analytics', () => ({ trackOnboarding: jest.fn() }));
jest.mock('@features/ai-summary/api', () => ({
  invokeAiSummary: (entryId: string) => mockInvoke(entryId),
}));
jest.mock('@features/journal', () => ({
  journalKeys: { entry: (id: string) => ['journal', 'entry', id] },
  useCreateEntry: () => ({
    isPending: false,
    mutateAsync: () => Promise.resolve({ id: 'entry-42', crisis_flagged: false }),
  }),
  useEntry: () => ({ data: undefined }),
}));
jest.mock('@features/crisis', () => ({
  useEntryCrisisCheck: () => ({ hasCrisisWords: () => false, showSupport: jest.fn(), sheet: null }),
}));
jest.mock('@features/safety', () => ({ reportPrivateThreat: jest.fn() }));
jest.mock('@features/welcome-reflection', () => ({ useStartWelcomeReflection: () => jest.fn() }));

const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

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

it('asks for the reflection of the entry just saved, once, and it outlives the step', async () => {
  const utils = await render(
    <QueryClientProvider client={qc}>
      <FirstCheckinStep nav={nav} />
    </QueryClientProvider>,
  );
  await fireEvent.press(utils.getByLabelText('Grateful'));
  await fireEvent.changeText(utils.getByPlaceholderText('A sentence is plenty…'), 'Good walk');
  await fireEvent.press(utils.getByText('Save & reflect'));

  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('entry-42'));
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  expect(nav.goNext).toHaveBeenCalledWith({ first_entry_id: 'entry-42', reflection_status: 'pending' });

  // The step goes away (as when onboarding moves on): the request is still running in the cache.
  await act(async () => utils.unmount());
  const running = qc.getMutationCache().getAll();
  expect(running).toHaveLength(1);
  expect(running[0]!.state.status).toBe('pending');
  expect(mockInvoke).toHaveBeenCalledTimes(1);
});
