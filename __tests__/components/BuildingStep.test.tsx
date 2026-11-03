import { render, fireEvent, act } from '@testing-library/react-native';
import { BuildingStep } from '@features/onboarding/screens/steps/BuildingStep';
import { PLAN_ANIMATION_MS } from '@features/onboarding/constants';
import type { OnboardingNav } from '@features/onboarding/hooks';
import type { OnboardingData } from '@features/onboarding/types';

jest.mock('@hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn(() => true) }));
jest.mock('@store/onboarding', () => {
  const markPlanAnimationPlayed = jest.fn();
  const state = { planAnimationPlayed: false, markPlanAnimationPlayed };
  const useOnboardingStore = (sel: (s: unknown) => unknown) => sel(state);
  useOnboardingStore.getState = () => state;
  return { useOnboardingStore };
});

const reducedMock = (
  jest.requireMock('@hooks/useReducedMotion') as { useReducedMotion: jest.Mock }
).useReducedMotion;

// The multi-select questions are arrays; plan copy uses the PRIMARY (first) answer. Frequency
// is single-select, so it's a scalar.
const FULL: OnboardingData = {
  motivation: ['managing_stress', 'understanding_myself'],
  frequency: 'sometimes',
  support: ['close_friend'],
  goal: ['calmer', 'patterns'],
  personal_reflection_style: ['gentle', 'direct'],
  date_of_birth: '1990-01-01',
  tried_other_apps: true,
  acquisition_source: 'tiktok',
};

function makeNav(over: Partial<OnboardingNav> = {}): OnboardingNav {
  return {
    hydrated: true,
    data: FULL,
    step: 'building',
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

describe('<BuildingStep /> — personalized plan generation (§10/§11)', () => {
  beforeEach(() => reducedMock.mockReturnValue(true));

  it('will not build a plan from incomplete answers (§10 guard)', async () => {
    const nav = makeNav({ data: {} });
    const { findByText, queryByText } = await render(<BuildingStep nav={nav} />);

    expect(await findByText('Let’s finish a couple of questions first')).toBeTruthy();
    expect(queryByText('Continue')).toBeNull(); // no plan generated → no advance CTA
  });

  it('reveals a personalized checklist + the CTA when complete', async () => {
    const nav = makeNav();
    const { findByText, getByText } = await render(<BuildingStep nav={nav} />);

    // Every personal question is represented, derived from the user's own answers —
    // not generic filler. This includes who they turn to and the reflection tone they chose.
    expect(await findByText('Focusing on managing stress')).toBeTruthy(); // motivation
    expect(getByText('Steadying the days that overwhelm you now and then')).toBeTruthy(); // frequency (no "stress" echo)
    expect(getByText('Keeping the friend you lean on close')).toBeTruthy(); // support
    expect(getByText('Shaping a plan to feel calmer')).toBeTruthy(); // goal
    expect(getByText('Tuning your reflections to sound gentle and direct')).toBeTruthy(); // style, as words in the sentence
    expect(getByText(/Calibrating for your/)).toBeTruthy(); // age (date-relative → match prefix)
    expect(getByText('Building on what you’ve tried before')).toBeTruthy(); // tried other apps

    // The counter reaches 100% and only then does the CTA appear (→ first check-in).
    expect(getByText('100%')).toBeTruthy();
    fireEvent.press(getByText('Continue'));
    expect(nav.goNext).toHaveBeenCalledTimes(1);
  });

  it('personalizes to each user’s answers — different answers give different output', async () => {
    const nav = makeNav({
      data: {
        motivation: ['lifting_low_mood'],
        frequency: 'almost_always',
        support: ['keep_to_myself'],
        goal: ['more_good_days'],
        personal_reflection_style: ['reflective'],
        date_of_birth: '2004-06-15',
        tried_other_apps: false,
        acquisition_source: 'instagram',
      },
    });
    const { getByText, queryByText } = await render(<BuildingStep nav={nav} />);

    expect(getByText('Focusing on lifting your mood')).toBeTruthy();
    expect(getByText('Steadying the days that so often overwhelm you')).toBeTruthy();
    expect(getByText('A private space that’s just for you')).toBeTruthy(); // "keep to myself"
    expect(getByText('Shaping a plan to have more good days than hard ones')).toBeTruthy();
    expect(getByText('Tuning your reflections to sound reflective')).toBeTruthy();
    expect(getByText('A fresh start, built around you')).toBeTruthy(); // hasn't tried apps

    // The other user's answers must NOT appear — proves the output isn't static.
    expect(queryByText('Keeping the friend you lean on close')).toBeNull();
    expect(queryByText('Tuning your reflections to sound gentle and direct')).toBeNull();
  });

  it('assembles over the animation window: CTA only at 100% (real 0→100% path)', async () => {
    reducedMock.mockReturnValue(false); // exercise the real animation, not the reduced-motion skip
    jest.useFakeTimers();
    try {
      const nav = makeNav();
      const { queryByText, getByText } = await render(<BuildingStep nav={nav} />);

      // Mid-generation: the plan is still assembling, so the advance CTA is withheld.
      await act(async () => {
        jest.advanceTimersByTime(Math.floor(PLAN_ANIMATION_MS / 2));
      });
      expect(queryByText('Continue')).toBeNull();

      // Once the full window elapses it reaches 100% and reveals the personalized rows + CTA.
      await act(async () => {
        jest.advanceTimersByTime(PLAN_ANIMATION_MS);
      });
      expect(getByText('100%')).toBeTruthy();
      expect(getByText('Tuning your reflections to sound gentle and direct')).toBeTruthy();
      expect(getByText('Continue')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});
