import { render, fireEvent } from '@testing-library/react-native';
import { QuizStep } from '@features/onboarding/screens/steps/QuizStep';
import { MOTIVATIONS, FREQUENCIES, REFLECTION_STYLES } from '@features/onboarding/constants';
import type { OnboardingNav } from '@features/onboarding/hooks';

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
    goNext: jest.fn(),
    goBack: jest.fn(),
    ...over,
  } as OnboardingNav;
}

describe('<QuizStep /> single-select — Continue disabled until a valid answer (§5/§20)', () => {
  it('starts disabled, blocks navigation, then enables after a selection (scalar)', async () => {
    const nav = makeNav({ step: 'frequency' });
    const { getByText, getByLabelText } = await render(
      <QuizStep
        nav={nav}
        screen="frequency"
        title="How often do you feel overwhelmed?"
        options={FREQUENCIES}
        valueKey="frequency"
      />,
    );

    // Disabled at first: pressing Continue does not navigate (§20 — validate before nav).
    fireEvent.press(getByText('Continue'));
    expect(nav.goNext).not.toHaveBeenCalled();

    // Select a valid answer → the working state is patched with a SCALAR…
    fireEvent.press(getByLabelText('Sometimes'));
    expect(nav.patchLocal).toHaveBeenCalledWith({ frequency: 'sometimes' });

    // …let the selection commit, then Continue works and carries the answer forward.
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.press(getByText('Continue'));
    expect(nav.goNext).toHaveBeenCalledWith({ frequency: 'sometimes' });
  });

  it('preselects a previously-saved answer so Continue is enabled on return (§5 nav scenario)', async () => {
    const nav = makeNav({ step: 'frequency', data: { frequency: 'sometimes' } });
    const { getByText } = await render(
      <QuizStep
        nav={nav}
        screen="frequency"
        title="How often do you feel overwhelmed?"
        options={FREQUENCIES}
        valueKey="frequency"
      />,
    );
    // A valid answer already exists → Continue navigates immediately.
    fireEvent.press(getByText('Continue'));
    expect(nav.goNext).toHaveBeenCalledWith({ frequency: 'sometimes' });
  });
});

describe('<QuizStep multi /> — up to two answers, at least one', () => {
  it('blocks until one is picked, allows a second, caps at two, and carries the array', async () => {
    const nav = makeNav();
    const { getByText, getByLabelText } = await render(
      <QuizStep
        nav={nav}
        screen="motivation"
        title="What brought you here today?"
        options={MOTIVATIONS}
        valueKey="motivation"
        multi
      />,
    );

    // Nothing chosen yet → Continue blocked.
    fireEvent.press(getByText('Continue'));
    expect(nav.goNext).not.toHaveBeenCalled();

    // Pick two answers (each patched into working state as a growing array).
    fireEvent.press(getByLabelText('Managing stress'));
    await new Promise((r) => setTimeout(r, 0));
    expect(nav.patchLocal).toHaveBeenLastCalledWith({ motivation: ['managing_stress'] });
    fireEvent.press(getByLabelText('Understanding myself better'));
    await new Promise((r) => setTimeout(r, 0));

    // A third is locked at the cap of 2 — pressing it does nothing.
    fireEvent.press(getByLabelText('Just curious'));
    await new Promise((r) => setTimeout(r, 0));

    fireEvent.press(getByText('Continue'));
    expect(nav.goNext).toHaveBeenCalledWith({
      motivation: ['managing_stress', 'understanding_myself'],
    });
  });

  it('preselects defaultValues (reflection tone) and can blend a second tone', async () => {
    const nav = makeNav({ step: 'reflectionStyle' });
    const { getByText, getByLabelText } = await render(
      <QuizStep
        nav={nav}
        screen="reflectionStyle"
        title="How should your reflections sound?"
        options={REFLECTION_STYLES}
        valueKey="personal_reflection_style"
        multi
        defaultValues={['gentle']}
      />,
    );

    // Defaulted to 'gentle' → Continue is enabled immediately (a valid single tone).
    fireEvent.press(getByText('Continue'));
    expect(nav.goNext).toHaveBeenLastCalledWith({ personal_reflection_style: ['gentle'] });

    // Add a second tone → both are carried forward for the AI to blend.
    fireEvent.press(getByLabelText('Encouraging'));
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.press(getByText('Continue'));
    expect(nav.goNext).toHaveBeenLastCalledWith({
      personal_reflection_style: ['gentle', 'encouraging'],
    });
  });
});
