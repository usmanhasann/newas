import './global.css';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { queryClient, initObservability } from '@lib';
import { appFonts } from '@theme';
import { ErrorBoundary, BrandSplash, Toast } from '@components';
import { RootNavigator, linking } from '@/navigation';
import { useAuthBootstrap, useAuthDeepLink } from '@features/auth';
import { InAppBannerHost, usePushRegistration } from '@features/notifications';
import { useTrialReminderSync } from '@features/onboarding';
import { useWidgetSync } from '@features/widget';
import { usePendingInviteRedeem } from '@features/circles';
import { useEnsureDisplayName, useSyncProfileTimezone } from '@features/profile';
import { useDailyPromptReminder } from '@features/journal';
import { useStorePurchaseListener } from '@features/iap';
import { useStoreSubscriptionSync } from '@features/subscription';

// Keep the native splash up from the very first frame. It stays up — covering the anon
// bootstrap, the transient signed-out moment, and the profile/subscription load — until
// RootNavigator hides it once the gate has a real destination, so cold launch is a seamless
// splash → Welcome/Home with no login flash or loader. Init observability once.
void SplashScreen.preventAutoHideAsync();
initObservability();

function AppInner() {
  useAuthBootstrap();
  useAuthDeepLink();
  useSyncProfileTimezone();
  useEnsureDisplayName();
  usePushRegistration();
  useDailyPromptReminder();
  useTrialReminderSync();
  // In-app purchases: finish store purchases that complete outside a purchase call, and re-check
  // the store subscription every time the app opens (client 10/14 p.38).
  useStorePurchaseListener();
  useStoreSubscriptionSync();
  useWidgetSync();
  usePendingInviteRedeem();
  return (
    <>
      <RootNavigator />
      {/* In-app notification banners (and opening a tapped push), above every screen. */}
      <InAppBannerHost />
    </>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts(appFonts);

  // Hold at the native splash until fonts are ready. We do NOT hide it here — RootNavigator
  // hides it once the destination is known, so nothing renders on top of the splash early.
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <NavigationContainer linking={linking} fallback={<BrandSplash />}>
              <AppInner />
              <StatusBar style="dark" />
            </NavigationContainer>
            <Toast />
          </QueryClientProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
