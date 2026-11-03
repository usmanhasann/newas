/**
 * Regression: every StepId must be wired to a screen in OnboardingScreen's switch. The step
 * machine (flow.ts) and the renderer are separate files, so a step can be added to BASE_ORDER
 * and route correctly while the switch silently falls through and renders nothing — a dead end
 * the flow tests cannot catch. This drives the REAL OnboardingScreen to each step that renders
 * without network/native dependencies and asserts something identifying is on screen.
 */
import { render } from '@testing-library/react-native';
import { OnboardingScreen } from '@features/onboarding/screens/OnboardingScreen';
import { useOnboarding } from '@features/onboarding/hooks';
import type { OnboardingNav } from '@features/onboarding/hooks';
import type { StepId } from '@features/onboarding/flow';

jest.mock('@features/onboarding/hooks', () => ({ useOnboarding: jest.fn() }));
jest.mock('@store/onboarding', () => {
  const reset = jest.fn();
  const markPlanAnimationPlayed = jest.fn();
  const state = { reset, markPlanAnimationPlayed, planAnimationPlayed: false, data: {} };
  const useOnboardingStore = (sel: (s: unknown) => unknown) => sel(state);
  useOnboardingStore.getState = () => state;
  return { useOnboardingStore };
});

const useOnboardingMock = useOnboarding as jest.Mock;

function makeNav(step: StepId): OnboardingNav {
  return {
    hydrated: true,
    data: {},
    step,
    steps: [],
    progress: { index: 3, total: 18 },
    canBack: true,
    saving: false,
    view: {} as OnboardingNav['view'],
    patchLocal: jest.fn(),
    persist: jest.fn(),
    goNext: jest.fn(() => Promise.resolve()),
    goBack: jest.fn(),
  } as OnboardingNav;
}

// Steps that render purely from local state — no Supabase query, no native permission call.
const CASES: { step: StepId; expect: RegExp }[] = [
  { step: 'birthday', expect: /When is your birthday\?/ },
  { step: 'motivation', expect: /What brought you here today\?/ },
  { step: 'frequency', expect: /How often do you feel overwhelmed\?/ },
  { step: 'support', expect: /When things get hard, who do you turn to\?/ },
  { step: 'goal', expect: /What would feel like a win a month from now\?/ },
  { step: 'reflectionStyle', expect: /How should your reflections sound\?/ },
  { step: 'shift', expect: /The shift you.re working toward/ },
  { step: 'circlesPrivacy', expect: /Two ways to\s*open up\./ },
];

describe('OnboardingScreen — every ordered step resolves to a real screen', () => {
  it.each(CASES)('renders a screen for "$step"', async ({ step, expect: pattern }) => {
    useOnboardingMock.mockImplementation(() => makeNav(step));
    const { getByText } = await render(<OnboardingScreen />);
    expect(getByText(pattern)).toBeTruthy();
  });

  it('shows the crisis-resources disclaimer on frequency only (scoped, not on other quizzes)', async () => {
    useOnboardingMock.mockImplementation(() => makeNav('frequency'));
    const freq = await render(<OnboardingScreen />);
    expect(freq.getByText('See crisis resources')).toBeTruthy();
    expect(freq.getByText(/not a substitute for professional support/)).toBeTruthy();
    freq.unmount();

    // Another quiz step must NOT carry it — the disclaimer is opt-in per screen.
    useOnboardingMock.mockImplementation(() => makeNav('motivation'));
    const mot = await render(<OnboardingScreen />);
    expect(mot.queryByText('See crisis resources')).toBeNull();
  });
});
