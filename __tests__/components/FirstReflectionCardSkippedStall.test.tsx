/**
 * Skip for now, and the app was closed before the welcome reflection was asked for (client revisions
 * 10/14 p.33 + p.35, N15.07, N15.63 to N15.69): the paywall card starts it, says "Writing your
 * reflection..." under "BASED ON YOUR ANSWERS", and if nothing comes back it offers "Failed to load"
 * with "Try again" instead of spinning forever. One render per file.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { FirstReflectionCard } from '@features/subscription/components/FirstReflectionCard';
import { WRITING_STALL_MS } from '@features/subscription/firstReflection';

const mockRequestWelcome = jest.fn();
const mockGenerate = jest.fn();

jest.mock('@features/journal', () => ({
  useEntry: () => ({ data: undefined, isError: false, refetch: jest.fn() }),
}));
jest.mock('@features/ai-summary', () => ({
  useGenerateSummary: () => ({ mutate: mockGenerate, isPending: false, isError: false }),
}));
jest.mock('@features/crisis', () => ({
  useCrisisKeywords: () => ({ data: [], isError: false }),
  detectCrisis: () => null,
}));
jest.mock('@features/welcome-reflection', () => ({
  useWelcomeReflection: () => ({ data: null }),
  useRequestWelcomeReflection: () => ({ mutate: mockRequestWelcome, isPending: false, isError: false }),
}));

it('starts the answers-based reflection, waits, then offers Try again', async () => {
  jest.useFakeTimers();
  try {
    await render(<FirstReflectionCard entryId={null} />);

    expect(screen.getByText('BASED ON YOUR ANSWERS')).toBeTruthy();
    expect(screen.getByText('Writing your reflection...')).toBeTruthy();
    expect(mockRequestWelcome).toHaveBeenCalledTimes(1);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(screen.queryByText('Failed to load')).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(WRITING_STALL_MS);
    });
    expect(screen.getByText('Failed to load')).toBeTruthy();
    expect(screen.queryByText('Writing your reflection...')).toBeNull();

    await fireEvent.press(screen.getByText('Try again'));
    expect(mockRequestWelcome).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Writing your reflection...')).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});
