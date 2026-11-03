/**
 * Onboarding notifications page (client 10/14 p.4): "Before bed (9:00 PM)" is preselected when
 * the page opens so "Turn on reminders" is active right away, the skip reads "Maybe later", and a
 * small gray line sits right under "Custom time". One render per file (React 19 concurrent
 * renders leak across sibling tests).
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import type { ReactTestRendererJSON } from 'react-test-renderer';
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

const HELPER = 'You can change this anytime in Profile → Notifications.';

/** Every text string on screen, in render order. */
function texts(node: ReactTestRendererJSON | ReactTestRendererJSON[] | null): string[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(texts);
  return (node.children ?? []).flatMap((c) => (typeof c === 'string' ? [c] : texts(c)));
}

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

it('opens with 9:00 PM chosen, the CTA live, "Maybe later", and the helper under Custom time', async () => {
  const { getByLabelText, getByText, getByRole, queryByText, toJSON } = await render(
    <NotificationsStep nav={nav} />,
  );

  // "Before bed (9:00 PM)" is the selected option; nothing else is.
  expect(getByLabelText('Before bed').props.accessibilityState).toEqual({
    selected: true,
  });
  expect(getByText('9:00 PM')).toBeTruthy();
  for (const other of ['Morning', 'Early afternoon', 'Early evening', 'Custom time']) {
    expect(getByLabelText(other).props.accessibilityState).toEqual({ selected: false });
  }

  // The skip is "Maybe later" (the old label is gone).
  expect(getByText('Maybe later')).toBeTruthy();
  expect(queryByText('Add one later')).toBeNull();

  // Gray helper line, exact text, directly under the "Custom time" option.
  expect(getByText(HELPER).props.className).toContain('text-ink-soft'); // the app's gray helper
  const all = texts(toJSON() as ReactTestRendererJSON | ReactTestRendererJSON[] | null);
  const custom = all.indexOf('Custom time');
  expect(custom).toBeGreaterThan(-1);
  expect(all.slice(custom + 1, custom + 3)).toEqual(['Pick an exact time', HELPER]);

  // "Turn on reminders" is active right away: no option tapped, it asks the OS and saves 9:00 PM.
  const cta = getByRole('button', { name: 'Turn on reminders' });
  expect(cta.props.accessibilityState).toEqual(
    expect.objectContaining({ disabled: false }),
  );
  await fireEvent.press(getByText('Turn on reminders'));
  await waitFor(() => expect(mockRequestPermission).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(mockUpdatePrefs).toHaveBeenCalledWith({
      reminder_time: '21:00:00',
      journaling_reminder: true,
    }),
  );
  await waitFor(() =>
    expect(nav.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        reminder_time: '21:00',
        reminder_enabled: true,
        status: 'completed',
      }),
    ),
  );
});
