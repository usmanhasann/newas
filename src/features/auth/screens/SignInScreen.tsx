/**
 * Existing-user Sign In ("Welcome back", reached from Welcome → Sign In). Same layout as the
 * onboarding "Save your progress" screen (client 10/14 p.31-32 + mockup): a back arrow at the top
 * left (no progress bar), the LYSM app icon with the headline and subtext in the middle, and at the
 * bottom the three "Continue with…" pills (Apple, Google, Email) with "Don’t have an account? Get
 * started" under them.
 *
 * Google & Apple authenticate the user's REAL account (signInWithIdToken via ../social) and skip
 * email verification (provider-verified); "Continue with Email" navigates to EmailSignInScreen,
 * which holds the email + password form. On success the session switches and the route gate lands
 * them on Home (active) / Paywall (lapsed), with no onboarding. The back arrow and "Get started"
 * both return to onboarding, where the person came from.
 */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AuthHero, AuthProviderButtons, Screen, Text } from '@components';
import { colors, spacing } from '@theme';
import { toast } from '@store/toast';
import type { OnboardingFlowStackParamList } from '@/navigation/types';
import {
  isAppleAuthAvailable,
  isUserCanceledSignIn,
  signInExistingWithApple,
  signInExistingWithGoogle,
} from '../social';
import { socialSignInMessage } from '../errors';
import { resolveAccountLink } from '../linkFlow';

export function SignInScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<OnboardingFlowStackParamList>>();
  const [appleAvailable, setAppleAvailable] = useState(false);
  // Which sign-in is in progress. Only that button shows a spinner; the others are grayed out but
  // keep their normal text and icons (client 10/14 p.32).
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);

  useEffect(() => {
    isAppleAuthAvailable().then(setAppleAvailable);
  }, []);

  // A new user can start here. Apple's one-time name is saved on the account inside
  // signInExistingWithApple, and the profile is filled from it by useEnsureDisplayName (app root).
  // A sign-in whose email is on another account, or that matches no account, is never merged or
  // created by itself (client 10/14 p.15-16): "Link your account" opens, or "Already have a LYSM
  // account?" is asked first.
  const runSocial = async (which: 'apple' | 'google', fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(which);
    try {
      await fn();
    } catch (e) {
      if (isUserCanceledSignIn(e)) return; // user dismissed the provider sheet — not an error
      let error = e;
      try {
        if (await resolveAccountLink(e, () => navigation.navigate('LinkAccount'))) return;
      } catch (linkError) {
        if (isUserCanceledSignIn(linkError)) return;
        error = linkError;
      }
      // Never a silent failure (client 10/14 p.15): say what happened.
      toast.error(socialSignInMessage(error, which === 'apple' ? 'Apple' : 'Google'));
    } finally {
      setBusy(null);
    }
  };
  const onGoogle = () => runSocial('google', signInExistingWithGoogle);
  const onApple = () => runSocial('apple', signInExistingWithApple);
  const backToOnboarding = () => navigation.goBack();

  return (
    <Screen contentClassName="py-4">
      {/* The same top bar as the onboarding steps (so the middle block sits where it does on
          "Save your progress"): a bare chevron, no progress bar. */}
      <View className="mb-4 h-9 flex-row items-center">
        <Pressable
          onPress={backToOnboarding}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          className="-ml-1 p-1"
        >
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingBottom: spacing[4],
        }}
      >
        <AuthHero
          title="Welcome back"
          subtitle="Sign in to pick up right where you left off."
        />
      </ScrollView>

      <View className="gap-5 pt-4">
        <AuthProviderButtons
          appleAvailable={appleAvailable}
          busy={busy}
          onApple={onApple}
          onGoogle={onGoogle}
          onEmail={() => navigation.navigate('EmailSignIn')}
        />
        <View className="flex-row flex-wrap items-center justify-center gap-1">
          <Text variant="bodyMuted" maxFontSizeMultiplier={1.3}>
            Don’t have an account?
          </Text>
          <Pressable onPress={backToOnboarding} accessibilityRole="link" hitSlop={12}>
            <Text
              variant="bodyStrong"
              maxFontSizeMultiplier={1.3}
              className="text-brand-600"
            >
              Get started
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
