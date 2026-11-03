/**
 * Notifications is the LAST onboarding step (after payment), so its skip, now "Maybe later"
 * (client 10/14 p.4), finalizes onboarding: it persists the reminder answers (the preselected
 * 9:00 PM, turned off) + the completion flag, copies the chosen reflection tone(s) onto the
 * profile, marks onboarding complete, never asks the OS, and NEVER calls goNext.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NotificationsStep } from '@features/onboarding/screens/steps/NotificationsStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

const mockRequestPermission = jest.fn(() => new Promise(() => {}));
const mockUpdatePrefs = jest.fn((_patch: unknown) => Promise.resolve());
jest.mock('@features/notifications', () => ({
  getNotificationPermission: () => Promise.resolve('undetermined'),
  requestNotificationPermission: () => mockRequestPermission(),
  canDeliver: () => true,
  useRegisterPushToken: () => () => {},
  useUpdateNotificationPrefs: () => ({ mutateAsync: (p: unknown) => mockUpdatePrefs(p) }),
}));
const mockComplete = jest.fn(() => Promise.resolve());
const mockUpdateProfile = jest.fn((_patch: unknown) => Promise.resolve());
jest.mock('@features/profile', () => ({
  useCompleteOnboarding: () => ({ mutateAsync: () => mockComplete() }),
  useUpdateProfile: () => ({ mutateAsync: (p: unknown) => mockUpdateProfile(p) }),
}));

const nav = {
  hydrated: true,
  data: { personal_reflection_style: ['gentle', 'direct'] },
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
} as unknown as OnboardingNav;

it('finalizes onboarding when the user skips with "Maybe later"', async () => {
  const { getByText } = await render(<NotificationsStep nav={nav} />);

  await fireEvent.press(getByText('Maybe later'));

  await waitFor(() => expect(mockComplete).toHaveBeenCalledTimes(1));
  // The reminder stays off, but the preselected time is kept for later.
  expect(mockUpdatePrefs).toHaveBeenCalledWith({
    reminder_time: '21:00:00',
    journaling_reminder: false,
  });
  // Persisted the reminder answers AND flagged onboarding complete in one write.
  expect(nav.persist).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'completed',
      reminder_enabled: false,
      reminder_time: '21:00',
    }),
  );
  // Copied the chosen tone(s) onto the real profile columns (primary + optional secondary).
  expect(mockUpdateProfile).toHaveBeenCalledWith({
    personal_reflection_style: 'gentle',
    personal_reflection_style_secondary: 'direct',
  });
  // Skipping never asks the OS, and the final step ends onboarding: it must NOT advance.
  expect(mockRequestPermission).not.toHaveBeenCalled();
  expect(nav.goNext).not.toHaveBeenCalled();
});
