/**
 * Onboarding notifications page (client 10/14 p.4): 9:00 PM is preselected, but the user can still
 * tap any other option to change it, and that time is what gets saved. One render per file.
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NotificationsStep } from '@features/onboarding/screens/steps/NotificationsStep';
import type { OnboardingNav } from '@features/onboarding/hooks';

const mockRequestPermission = jest.fn((): Promise<string> => Promise.resolve('granted'));
const mockUpdatePrefs = jest.fn((_patch: unknown) => Promise.resolve());
jest.mock('@features/notifications', () => ({
  getNotificationPermission: () => Promise.resolve('undetermined'),
  requestNotificationPermission: () => mockRequestPermission(),
  canDeliver: () => true,
  useRegisterPushToken: () => () => {},
  useUpdateNotificationPrefs: () => ({ mutateAsync: (p: unknown) => mockUpdatePrefs(p) }),
}));
jest.mock('@features/profile', () => ({
  useCompleteOnboarding: () => ({ mutateAsync: () => Promise.resolve() }),
  useUpdateProfile: () => ({ mutateAsync: () => Promise.resolve() }),
}));

const nav = {
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
} as unknown as OnboardingNav;

it('moves the selection off the preselected 9:00 PM and saves the time the user picked', async () => {
  const { getByLabelText, getByText } = await render(<NotificationsStep nav={nav} />);

  expect(getByLabelText('Before bed').props.accessibilityState).toEqual({
    selected: true,
  });

  await fireEvent.press(getByLabelText('Morning'));
  await waitFor(() =>
    expect(getByLabelText('Morning').props.accessibilityState).toEqual({
      selected: true,
    }),
  );
  expect(getByLabelText('Before bed').props.accessibilityState).toEqual({
    selected: false,
  });

  await fireEvent.press(getByText('Turn on reminders'));
  await waitFor(() =>
    expect(mockUpdatePrefs).toHaveBeenCalledWith({
      reminder_time: '09:00:00',
      journaling_reminder: true,
    }),
  );
  expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(nav.persist).toHaveBeenCalledWith(
      expect.objectContaining({ reminder_time: '09:00' }),
    ),
  );
});
