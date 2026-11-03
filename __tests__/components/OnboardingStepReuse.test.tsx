/**
 * Regression: consecutive quiz screens must NOT share React state. All five question
 * screens render the same QuizStep component; without a distinct `key` per screen React
 * reuses the instance across a step change and the previous answer leaks in — leaving the
 * Continue button enabled (not darkened) and letting the stale answer be saved. This drives
 * the real OnboardingScreen from one quiz step to the next and asserts the second starts
 * fresh (Continue disabled → pressing it does not navigate).
 */
import { render, fireEvent } from '@testing-library/react-native';
import { OnboardingScreen } from '@features/onboarding/screens/OnboardingScreen';
import { useOnboarding } from '@features/onboarding/hooks';
import type { OnboardingNav } from '@features/onboarding/hooks';

jest.mock('@features/onboarding/hooks', () => ({ useOnboarding: jest.fn() }));
jest.mock('@store/onboarding', () => {
  const reset = jest.fn();
  const useOnboardingStore = (sel: (s: unknown) => unknown) => sel({ reset });
  useOnboardingStore.getState = () => ({ reset, data: { status: 'active' } });
  return { useOnboardingStore };
});

const useOnboardingMock = useOnboarding as jest.Mock;

function makeNav(over: Partial<OnboardingNav> = {}): OnboardingNav {
  return {
    hydrated: true,
    data: {},
    step: 'motivation',
    steps: [],
    progress: null,
    canBack: true,
    saving: false,
    view: {} as OnboardingNav['view'],
    patchLocal: jest.fn(),
    persist: jest.fn(),
    goNext: jest.fn(() => Promise.resolve()),
    goBack: jest.fn(),
    ...over,
  } as OnboardingNav;
}

describe('OnboardingScreen — quiz screens do not leak state across steps', () => {
  it('resets the Continue button when moving to the next question', async () => {
    const goNext = jest.fn(() => Promise.resolve());
    let nav = makeNav({ step: 'motivation', goNext });
    useOnboardingMock.mockImplementation(() => nav);

    const { getByText, getByLabelText, rerender } = await render(<OnboardingScreen />);

    // Answer the motivation question → its Continue enables.
    fireEvent.press(getByLabelText('Managing stress'));
    await new Promise((r) => setTimeout(r, 0));

    // Advance to the next quiz screen (same component, empty answer).
    nav = makeNav({ step: 'frequency', goNext });
    await rerender(<OnboardingScreen />);
    await new Promise((r) => setTimeout(r, 0));

    // Fresh screen → Continue is disabled again, so pressing it does not navigate. Under
    // the old (keyless) code the motivation answer would have carried over and fired goNext.
    fireEvent.press(getByText('Continue'));
    expect(goNext).not.toHaveBeenCalled();
  });
});
