import { render, fireEvent } from '@testing-library/react-native';
import { NotificationsStep } from '@features/onboarding/screens/steps/NotificationsStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

// "Custom time" reveals the native time picker and the chosen time. The other behaviors of this
// screen each have their own file (one render per file: React 19 concurrent renders leak across
// sibling tests): NotificationsStepPreselect (9:00 PM preselected, CTA active, helper line),
// NotificationsStepOtherOption (another option can still be picked) and NotificationsStepMaybeLater
// (the skip finalizes onboarding).
jest.mock('@features/notifications', () => ({
  getNotificationPermission: jest.fn(() => Promise.resolve('undetermined')),
  requestNotificationPermission: jest.fn(() => new Promise(() => {})),
  canDeliver: jest.fn(() => true),
  scheduleDailyCheckIn: jest.fn(() => Promise.resolve(null)),
  useRegisterPushToken: jest.fn(() => jest.fn()),
  useUpdateNotificationPrefs: jest.fn(() => ({
    mutateAsync: jest.fn(() => Promise.resolve()),
  })),
}));
jest.mock('@features/profile', () => ({
  useCompleteOnboarding: () => ({ mutateAsync: jest.fn(() => Promise.resolve()) }),
  useUpdateProfile: () => ({ mutateAsync: jest.fn(() => Promise.resolve()) }),
}));

function makeNav(over: Partial<OnboardingNav> = {}): OnboardingNav {
  return {
    hydrated: true,
    data: {},
    step: 'notifications',
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

describe('<NotificationsStep /> — custom reminder time', () => {
  it('reveals the native time picker + chosen time when "Custom time" is selected', async () => {
    const nav = makeNav();
    const { getByLabelText, getByText, queryByText } = await render(
      <NotificationsStep nav={nav} />,
    );

    // Option labels in sentence case like the others (client 10/14 p.4: "Early evening").
    expect(getByLabelText('Early evening')).toBeTruthy();

    // The custom time only appears once the "Custom time" option is chosen.
    expect(queryByText(/Reminder set for/)).toBeNull();
    await fireEvent.press(getByLabelText('Custom time'));
    await new Promise((r) => setTimeout(r, 0));
    expect(getByText('Reminder set for 7:30 PM')).toBeTruthy();
  });
});
