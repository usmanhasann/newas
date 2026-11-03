/**
 * Client revisions 10/14 p.8 (N8.15): no in-app banner over the Welcome back paywall. That paywall
 * is the app's root 'Paywall' screen (the gate sends a returning, onboarded user without a
 * subscription there), outside the app's main screens, so banners are blocked on it like on every
 * other root but 'Main'. Real gate, real root navigator and banner host; the screens themselves are
 * stand-ins.
 * One render per file (React 19 concurrent renders leak across sibling tests).
 */
import { act, render } from '@testing-library/react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from '@/navigation/RootNavigator';
import { InAppBannerHost } from '@features/notifications/components/InAppBannerHost';
import type { RootStackParamList } from '@/navigation/types';

const mockListeners: { received?: (n: unknown) => void } = {};
jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: (cb: (n: unknown) => void) => {
    mockListeners.received = cb;
    return { remove: () => {} };
  },
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  getLastNotificationResponse: () => null,
  clearLastNotificationResponse: () => {},
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
}));
jest.mock('expo-splash-screen', () => ({ hideAsync: () => Promise.resolve() }));
jest.mock('@features/notifications/api', () => ({
  fetchBannerPost: jest.fn(),
  fetchPostParent: jest.fn(),
}));

// A returning user: signed in (Google, so no email code), onboarded, subscription lapsed.
jest.mock('@store/session', () => {
  const state = {
    reauthenticating: false,
    bootstrapped: true,
    status: 'signedIn',
    user: { id: 'u1', is_anonymous: false, identities: [{ provider: 'google' }] },
  };
  return {
    useSessionStore: (pick: (s: typeof state) => unknown) => pick(state),
    useAuthStatus: () => state.status,
    useCurrentUser: () => state.user,
  };
});
jest.mock('@features/profile', () => ({
  useProfile: () => ({ isLoading: false, isError: false, data: { onboarding_completed: true } }),
}));
jest.mock('@features/onboarding', () => ({ onboardingPastAuth: () => true }));
jest.mock('@features/email-verification', () => ({
  EmailConfirmationScreen: () => null,
  useEmailVerified: () => ({ data: true, isLoading: false }),
}));
jest.mock('@features/subscription', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    PaywallScreen: () => <MockText>Welcome back paywall</MockText>,
    useEntitlement: () => ({ entitled: false, isLoading: false, isError: false }),
  };
});
jest.mock('@/navigation/AuthNavigator', () => ({ AuthNavigator: () => null }));
jest.mock('@/navigation/OnboardingFlowNavigator', () => ({ OnboardingFlowNavigator: () => null }));
jest.mock('@/navigation/MainNavigator', () => ({ MainNavigator: () => null }));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

it('shows no banner on the Welcome back paywall', async () => {
  const navRef = createNavigationContainerRef<RootStackParamList>();
  const utils = await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <NavigationContainer ref={navRef}>
        <RootNavigator />
        <InAppBannerHost />
      </NavigationContainer>
    </SafeAreaProvider>,
  );

  expect(utils.getByText('Welcome back paywall')).toBeTruthy();
  const root = navRef.getRootState();
  expect(root.routes[root.index].name).toBe('Paywall');

  await act(async () => {
    mockListeners.received!({
      request: {
        identifier: 'streak-1',
        content: {
          title: 'Don’t lose your streak',
          body: 'Keep your 6 day streak going and journal before midnight.',
          data: { type: 'streak_reminder' },
        },
      },
    });
  });
  expect(utils.queryByTestId('in-app-banner')).toBeNull();
  expect(utils.queryByText('Don’t lose your streak')).toBeNull();
});
