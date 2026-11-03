/**
 * Authentication (overhaul spec §3/§17) — the onboarding SIGN-UP screen ("Save your progress",
 * client 10/14 p.31-32 + mockup): the progress bar at the top, the LYSM app icon with the headline
 * and subtext in the middle, and at the bottom the three "Continue with…" pills (Apple, Google,
 * Email) with the Terms / Privacy Policy line under them. Same layout as Sign In (AuthHero +
 * AuthProviderButtons). Apple only renders where it's available (iOS). No back arrow: back is
 * disabled on this step by design (flow.ts canGoBack), which matches the mockup.
 * Apple/Google are provider-verified and skip the app's email-verification step. An email sign-up
 * is BLOCKED until its email is verified: right after Create Account this step shows the 6-digit
 * code (EmailCodeVerifier: "Resend code", "Wrong email? Change it.") and only moves on to the
 * paywall once the code is confirmed (client revisions 10/14 p.18). Each option LINKS to the current
 * anonymous session so the user's onboarding answers + first entry carry over (§18).
 *
 * "Continue with Email" opens an INLINE form mirroring the standalone Sign-Up page (name /
 * email / password / invite code, same ControlledTextField design) that links to the
 * anonymous session rather than creating a fresh account (which would drop onboarding progress).
 *
 * Apple invokes the native Sign-in-with-Apple sheet, satisfying App Store guidelines.
 *
 * Account linking (client revisions 10/14 p.15-16, N4): a sign-in that already has a LYSM account
 * is never merged into this one by itself. A Google / Apple sign-in whose email is on another
 * account, or an email that already belongs to a Google / Apple only account, opens "Link your
 * account": the person proves it's them, then continues in that existing account (like a returning
 * user). Apple with a hidden email first asks "Already have a LYSM account?".
 */
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AuthHero,
  AuthProviderButtons,
  Button,
  ControlledTextField,
  LegalNotice,
  Text,
  type AuthProviderId,
} from '@components';
import { cn } from '@utils/cn';
import { toast } from '@store/toast';
import { useCurrentUser } from '@store/session';
import { useSyncDisplayName } from '@features/profile';
import {
  existingAccountKind,
  isAppleAuthAvailable,
  isUserCanceledSignIn,
  linkEmailIdentity,
  resolveAccountLink,
  signInWithApple,
  signInWithGoogle,
  socialSignInMessage,
  startEmailAccountLink,
} from '@features/auth';
import { EmailCodeVerifier } from '@features/email-verification';
import { signupSchema, type SignupInput } from '@features/auth/schema';
import { usePendingInviteStore } from '@store/pendingInvite';
import type { OnboardingFlowStackParamList } from '@/navigation/types';
import { StepScaffold } from '../../components/StepScaffold';
import { trackOnboarding } from '../../analytics';
import type { StepProps } from '../types';

export function AuthStep({ nav }: StepProps) {
  const navigation =
    useNavigation<NativeStackNavigationProp<OnboardingFlowStackParamList>>();
  const user = useCurrentUser();
  // Already a real (non-anonymous) account on arrival (e.g. a new user used Sign In with a
  // social provider) → skip the (redundant, would-error) link and just advance. Snapshotted
  // once via a lazy initializer so the normal anon→link flow isn't affected.
  const [arrivedAuthenticated] = useState(() => !!user && !user.is_anonymous);
  // An email + password account arriving here (the app was closed on the code step, or it signed
  // in before finishing onboarding) still has to verify before the paywall.
  const [arrivedWithEmail] = useState(
    () => arrivedAuthenticated && !!user?.identities?.some((i) => i.provider === 'email'),
  );
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [mode, setMode] = useState<'choose' | 'email' | 'verify'>(() =>
    arrivedWithEmail ? 'verify' : 'choose',
  );
  // Which sign-in is in progress. Only that button shows a spinner; the others are grayed out but
  // keep their normal text and icons (client 10/14 p.32).
  const [busy, setBusy] = useState<AuthProviderId | null>(null);
  // Invite code is optional and uncommon — collapsed by default so the form fits one screen.
  const [showInvite, setShowInvite] = useState(false);

  const syncName = useSyncDisplayName();

  const { control, handleSubmit } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { displayName: '', email: '', password: '', inviteCode: '' },
  });

  useEffect(() => {
    trackOnboarding('screen_viewed', { screen: 'auth' });
    isAppleAuthAvailable().then(setAppleAvailable);
    if (arrivedAuthenticated && !arrivedWithEmail) {
      const identities = user?.identities ?? [];
      const method = identities.some((i) => i.provider === 'apple')
        ? 'apple'
        : identities.some((i) => i.provider === 'google')
          ? 'google'
          : 'email';
      trackOnboarding('auth_completed', { method });
      syncName.mutate(undefined); // signed in before onboarding: still put the account's name on the profile
      nav.goNext({ auth_method: method }).catch(() => {
        toast.error('Something went wrong. Please try again.');
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signed up with Google / Apple: put the provider's name on the profile (home greeting; Apple
  // shares it only on the first authorization) and go on. Provider-verified → skips email verify (§16).
  const socialSignedUp = async (method: 'apple' | 'google', name?: string | null) => {
    syncName.mutate(name ?? undefined);
    trackOnboarding('auth_completed', { method });
    await nav.goNext({ auth_method: method });
  };

  // Never a silent failure (client 10/14 p.15). A sign-in that may belong to an existing account
  // opens linking (or asks "Already have a LYSM account?" first; "No, create one" signs up here).
  // When the person already has a LYSM account it can't link (browser Google), this screen has no
  // way back, so take them to Sign In, where the message tells them what to do.
  const socialFailed = async (e: unknown, method: 'apple' | 'google') => {
    if (isUserCanceledSignIn(e)) return; // user dismissed the sheet / browser — not an error
    let error = e;
    try {
      const outcome = await resolveAccountLink(e, () =>
        navigation.navigate('LinkAccount'),
      );
      if (outcome?.kind === 'created') {
        await socialSignedUp(method, outcome.appleName);
        return;
      }
      if (outcome) return;
    } catch (linkError) {
      if (isUserCanceledSignIn(linkError)) return;
      error = linkError;
    }
    toast.error(socialSignInMessage(error, method === 'apple' ? 'Apple' : 'Google'));
    if (existingAccountKind(error)) navigation.navigate('SignIn');
  };

  const onApple = async () => {
    if (busy) return;
    setBusy('apple');
    try {
      // Apple shares the name only on the first authorization, so pass it straight to the profile.
      const appleName = arrivedAuthenticated ? null : await signInWithApple();
      await socialSignedUp('apple', appleName);
    } catch (e) {
      await socialFailed(e, 'apple');
    } finally {
      setBusy(null);
    }
  };

  const onGoogle = async () => {
    if (busy) return;
    setBusy('google');
    try {
      if (!arrivedAuthenticated) await signInWithGoogle();
      await socialSignedUp('google'); // copies Google's name into the profile
    } catch (e) {
      await socialFailed(e, 'google');
    } finally {
      setBusy(null);
    }
  };

  // That email is already on an account (p.16): a Google / Apple only one opens linking (confirm
  // with that provider, then set a password, then continue in it); one with a password is signed
  // in to with it, so the email sign-in page opens with the email filled in.
  const emailTaken = async (email: string): Promise<boolean> => {
    const found = await startEmailAccountLink(email, 'onboarding', () =>
      navigation.navigate('LinkAccount'),
    );
    if (found === 'opened') return true;
    if (found === 'none') {
      toast.error(
        'An account with this email already exists. Sign in with your email and password.',
      );
      navigation.navigate('EmailSignIn', { email });
      return true;
    }
    return false;
  };

  const submitEmail = async (values: SignupInput) => {
    if (busy) return;
    setBusy('email');
    try {
      if (!arrivedAuthenticated) {
        await linkEmailIdentity({
          email: values.email.trim(),
          password: values.password,
          displayName: values.displayName.trim(),
        });
        // Upgrading this session doesn't create a new account, so nothing on the server redeems the
        // code: the app does, right away, and says what happened (usePendingInviteRedeem).
        if (values.inviteCode?.trim())
          usePendingInviteStore.getState().set(values.inviteCode);
      }
      syncName.mutate(values.displayName.trim()); // save the typed name to the profile
      trackOnboarding('auth_completed', { method: 'email' });
      // Blocked until the email is verified: the code step sends the code and moves on after it.
      setMode('verify');
    } catch (e) {
      if (existingAccountKind(e) === 'email' && (await emailTaken(values.email.trim())))
        return;
      toast.error('We couldn’t create your account. That email may already be in use.');
    } finally {
      setBusy(null);
    }
  };
  const onEmail = handleSubmit(submitEmail);

  // The code is confirmed (or the email already was): now the paywall.
  const onEmailVerified = () => {
    nav.goNext({ auth_method: 'email' }).catch(() => {
      toast.error('Something went wrong. Please try again.');
    });
  };

  if (mode === 'verify') {
    return (
      <StepScaffold
        canBack={false}
        progress={nav.progress}
        keyboardAvoiding
        scroll
        title="Verify your email"
      >
        <EmailCodeVerifier onVerified={onEmailVerified} />
      </StepScaffold>
    );
  }

  return (
    <StepScaffold
      canBack={nav.canBack}
      onBack={mode === 'email' ? () => setMode('choose') : nav.goBack}
      progress={nav.progress}
      keyboardAvoiding={mode === 'email'}
      // The icon, headline and subtext sit centred in the space between the progress bar and the
      // buttons; they still scroll instead of squashing if a very large system font makes them
      // taller than that space.
      scroll={mode === 'choose'}
      centerContent={mode === 'choose'}
      title={mode === 'email' ? 'Create your account' : undefined}
      subtitle={
        mode === 'email' ? 'Your plan and entries will be saved to it.' : undefined
      }
      footer={
        mode === 'choose' ? (
          // The three sign-in buttons anchored at the bottom, the legal line under them.
          <View className="gap-5">
            <AuthProviderButtons
              appleAvailable={appleAvailable}
              busy={busy}
              onApple={onApple}
              onGoogle={onGoogle}
              onEmail={() => setMode('email')}
            />
            <LegalNotice />
          </View>
        ) : (
          <View className="gap-2">
            <Button title="Create Account" onPress={onEmail} loading={busy === 'email'} />
            {/* Not while Create Account runs: the person stays with its spinner until it settles. */}
            <Pressable
              onPress={() => {
                if (!busy) setMode('choose');
              }}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy !== null }}
              className={cn(busy !== null && 'opacity-50')}
            >
              <Text variant="link" className="text-center">
                Use a different sign-in option
              </Text>
            </Pressable>
          </View>
        )
      }
    >
      {mode === 'choose' ? (
        <AuthHero
          title="Save your progress"
          subtitle="Create your account so your plan and entries are always here for you."
        />
      ) : (
        <View className="gap-4">
          <ControlledTextField
            control={control}
            name="displayName"
            label="Name"
            placeholder="What should we call you?"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
          />
          <ControlledTextField
            control={control}
            name="email"
            label="Email"
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
          />
          <ControlledTextField
            control={control}
            name="password"
            label="Create Password"
            placeholder="Create a password"
            hint="Use at least 8 characters."
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password-new"
            textContentType="newPassword"
          />

          {showInvite ? (
            <ControlledTextField
              control={control}
              name="inviteCode"
              label="Invite Code"
              placeholder="e.g. CIRCLE-1234"
              autoCapitalize="characters"
              autoCorrect={false}
              hint="Optional. Links you to the circle that invited you."
            />
          ) : (
            <Pressable
              onPress={() => setShowInvite(true)}
              accessibilityRole="button"
              className="items-center"
            >
              <Text variant="link">Have an invite code?</Text>
            </Pressable>
          )}
        </View>
      )}
    </StepScaffold>
  );
}
