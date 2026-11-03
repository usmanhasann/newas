import { useEffect, useRef } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@theme';
import { BrandSplash } from '@components';
import { useAuthStatus, useCurrentUser, useSessionStore } from '@store/session';
import { EmailConfirmationScreen, useEmailVerified } from '@features/email-verification';
import { PaywallScreen, useEntitlement } from '@features/subscription';
import { useProfile } from '@features/profile';
import { onboardingPastAuth } from '@features/onboarding';
import { AuthNavigator } from './AuthNavigator';
import { OnboardingFlowNavigator } from './OnboardingFlowNavigator';
import { MainNavigator } from './MainNavigator';
import { gateInputFrom, resolveGate } from './gate';

const Stack = createNativeStackNavigator();

/**
 * The gate (centralized in `resolveGate`):
 *   splash → auth → onboarding → verify email → paywall → main
 * A fresh user runs on an anonymous session and lands in the onboarding flow (Welcome →
 * Get Started continues onboarding; Sign In switches to a real account). New-user auth, the
 * email code (email sign-ups) and payment happen inside onboarding. An email + password account past
 * sign-up whose email isn't verified (older accounts, client revisions 10/14 p.18) gets the code
 * screen the next time the app opens. Conditionally rendering a single Stack.Screen is
 * React Navigation's auth-flow pattern; transitions happen as the session/profile/entitlement
 * change.
 *
 * Cold-launch seamlessness: the NATIVE splash is kept up (App.tsx) and this component hides
 * it only once the gate resolves to a real destination (target !== 'splash'). So everything
 * transient at startup — the anon-session bootstrap, the brief signed-out moment, the
 * profile/subscription load — happens UNDER the native splash and is never seen; the user
 * goes straight from the splash to Welcome/Home with no login flash or loader.
 */
export function RootNavigator() {
  const status = useAuthStatus();
  const user = useCurrentUser();
  const reauthenticating = useSessionStore((s) => s.reauthenticating);
  const bootstrapped = useSessionStore((s) => s.bootstrapped);
  const profileQ = useProfile();
  const { entitled, isLoading: subLoading, isError: subError } = useEntitlement();
  const emailVerifiedQ = useEmailVerified();
  // Only email + password sign-ups verify by code; Google / Apple verify the email themselves.
  const emailAccount =
    !!user && !user.is_anonymous && !!user.identities?.some((i) => i.provider === 'email');

  // All fragile derivations (bootstrapping negation, error-aware hold, onboarded collapse)
  // live in the pure, unit-tested gateInputFrom → resolveGate.
  const target = resolveGate(
    gateInputFrom({
      reauthenticating,
      bootstrapped,
      authStatus: status,
      profileLoading: profileQ.isLoading,
      profileError: profileQ.isError,
      subLoading,
      subError,
      onboardingCompleted: profileQ.data?.onboarding_completed,
      entitled,
      emailAccount,
      emailVerified: emailVerifiedQ.data,
      emailVerifiedLoading: emailVerifiedQ.isLoading,
      onboardingPastAuth: onboardingPastAuth(profileQ.data),
    }),
  );

  // Reveal the app only when there's a real destination — hide the native splash the moment
  // the gate leaves 'splash'. Idempotent (a ref guards the single hide).
  const splashHidden = useRef(false);
  useEffect(() => {
    if (target !== 'splash' && !splashHidden.current) {
      splashHidden.current = true;
      void SplashScreen.hideAsync();
    }
  }, [target]);
  // Safety net: never let a wedged gate strand the user on a frozen native splash.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!splashHidden.current) {
        splashHidden.current = true;
        void SplashScreen.hideAsync();
      }
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
      }}
    >
      {target === 'splash' ? (
        <Stack.Screen name="Splash" component={BrandSplash} />
      ) : target === 'auth' ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : target === 'onboarding' ? (
        <Stack.Screen name="Onboarding" component={OnboardingFlowNavigator} />
      ) : target === 'verifyEmail' ? (
        <Stack.Screen name="EmailConfirmation" component={EmailConfirmationScreen} />
      ) : target === 'paywall' ? (
        <Stack.Screen name="Paywall" component={PaywallScreen} />
      ) : (
        <Stack.Screen name="Main" component={MainNavigator} />
      )}
    </Stack.Navigator>
  );
}
