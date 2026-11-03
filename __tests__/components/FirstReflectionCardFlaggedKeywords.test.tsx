/**
 * The first check in had concerning words (client revisions 10/14 p.35 + p.36, N15.70 to N15.73,
 * N18): its text is never sent to the AI, even when nobody asked for its reflection yet (idle) and
 * the server doesn't have the flag (the phone's keyword check decides). The card uses the
 * answers-based reflection under "BASED ON YOUR ANSWERS" and starts it. One render per file.
 */
import { render, screen } from '@testing-library/react-native';
import { FirstReflectionCard } from '@features/subscription/components/FirstReflectionCard';

const mockRequestWelcome = jest.fn();
const mockGenerate = jest.fn();

jest.mock('@features/journal', () => ({
  useEntry: () => ({
    data: { note: 'Some days I want to end it all.', ai_status: 'idle', ai_summary: null },
    isError: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('@features/ai-summary', () => ({
  useGenerateSummary: () => ({ mutate: mockGenerate, isPending: false, isError: false }),
}));
jest.mock('@features/crisis', () => ({
  useCrisisKeywords: () => ({
    data: [{ id: 'k1', phrase: 'end it all', match_type: 'contains', severity: 'critical', is_active: true }],
    isError: false,
  }),
  detectCrisis: jest.requireActual('@features/crisis/matcher').detectCrisis,
}));
jest.mock('@features/welcome-reflection', () => ({
  useWelcomeReflection: () => ({ data: null }),
  useRequestWelcomeReflection: () => ({ mutate: mockRequestWelcome, isPending: false, isError: false }),
}));

it('never asks the AI about the flagged entry; uses the answers instead', async () => {
  await render(<FirstReflectionCard entryId="e1" />);

  expect(screen.getByText('BASED ON YOUR ANSWERS')).toBeTruthy();
  expect(screen.queryByText('WRITTEN FOR YOU')).toBeNull();
  expect(mockGenerate).not.toHaveBeenCalled();
  expect(mockRequestWelcome).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Writing your reflection...')).toBeTruthy();
});
