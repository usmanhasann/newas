import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OnboardingScreen } from '@features/onboarding';
import {
  SignInScreen,
  EmailSignInScreen,
  ForgotPasswordScreen,
  LinkAccountScreen,
} from '@features/auth';
import type { OnboardingFlowStackParamList } from './types';

const Stack = createNativeStackNavigator<OnboardingFlowStackParamList>();

/**
 * Pre-auth flow for not-yet-onboarded users. The Welcome screen (onboarding step 1) offers
 * "Get Started" (continue the onboarding step machine on the anonymous session) and "Sign In"
 * (→ SignInScreen for existing users). A successful sign-in switches the session to the real
 * account, so the RootNavigator gate swaps this whole navigator out for Home/Paywall
 * automatically — no onboarding, no payment.
 */
export function OnboardingFlowNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="EmailSignIn" component={EmailSignInScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      {/* Account linking (client revisions 10/14 p.15-16), from Sign In and "Save your progress". */}
      <Stack.Screen name="LinkAccount" component={LinkAccountScreen} />
    </Stack.Navigator>
  );
}
