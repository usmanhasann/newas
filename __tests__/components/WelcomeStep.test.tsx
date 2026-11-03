import { render, fireEvent } from '@testing-library/react-native';
import { WelcomeStep } from '@features/onboarding/screens/steps/WelcomeStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('@features/profile', () => ({
  useCompleteOnboarding: () => ({ mutate: jest.fn(), isPending: false }),
}));

function makeNav(over: Partial<OnboardingNav> = {}): OnboardingNav {
  return {
    hydrated: true,
    data: {},
    step: 'welcome',
    steps: [],
    progress: null,
    canBack: false,
    saving: false,
    view: {} as OnboardingNav['view'],
    patchLocal: jest.fn(),
    persist: jest.fn(),
    goNext: jest.fn(() => Promise.resolve()),
    goBack: jest.fn(),
    ...over,
  } as OnboardingNav;
}

describe('<WelcomeStep /> — Get Started vs Sign In split', () => {
  it('shows the headline + both actions; Get Started advances, Sign In navigates', async () => {
    const nav = makeNav();
    const { getByText } = await render(<WelcomeStep nav={nav} />);

    expect(getByText('Reflection made effortless')).toBeTruthy();

    fireEvent.press(getByText('Get Started'));
    expect(nav.goNext).toHaveBeenCalledTimes(1);

    fireEvent.press(getByText('Sign In'));
    expect(mockNavigate).toHaveBeenCalledWith('SignIn');
  });
});
