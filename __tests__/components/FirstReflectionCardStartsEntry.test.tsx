/**
 * They journaled but the reflection was never asked for (the app closed right after "Save &
 * reflect"): the paywall card asks for it once, with the label "WRITTEN FOR YOU", and says
 * "Writing your reflection..." until it is ready (client revisions 10/14 p.33 + p.35, N15.05,
 * N15.63 to N15.65). The welcome reflection is not asked for. One render per file.
 */
import { render, screen } from '@testing-library/react-native';
import { FirstReflectionCard } from '@features/subscription/components/FirstReflectionCard';

const mockRequestWelcome = jest.fn();
const mockGenerate = jest.fn();

jest.mock('@features/journal', () => ({
  useEntry: () => ({
    data: { note: 'A calm walk.', ai_status: 'idle', ai_summary: null, crisis_flagged: false },
    isError: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('@features/ai-summary', () => ({
  useGenerateSummary: () => ({ mutate: mockGenerate, isPending: false, isError: false }),
}));
jest.mock('@features/crisis', () => ({
  useCrisisKeywords: () => ({ data: undefined, isError: false }),
  detectCrisis: () => null,
}));
jest.mock('@features/welcome-reflection', () => ({
  useWelcomeReflection: () => ({ data: undefined }),
  useRequestWelcomeReflection: () => ({ mutate: mockRequestWelcome, isPending: false, isError: false }),
}));

it('asks for the entry’s reflection once and shows it is being written', async () => {
  await render(<FirstReflectionCard entryId="e1" />);

  // The server flag (false) decides, so it doesn't wait for the keyword list.
  expect(screen.getByText('WRITTEN FOR YOU')).toBeTruthy();
  expect(screen.getByText('Writing your reflection...')).toBeTruthy();
  expect(mockGenerate).toHaveBeenCalledTimes(1);
  expect(mockRequestWelcome).not.toHaveBeenCalled();
});
