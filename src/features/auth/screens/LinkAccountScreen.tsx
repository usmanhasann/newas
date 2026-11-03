/**
 * "Link your account" (client revisions 10/14 p.15-16, N4). Opened when a sign-in may belong to an
 * existing LYSM account, from Sign In and from the onboarding "Save your progress" step. Never
 * merged automatically: the person first proves it's them the way that account was created, and
 * only then is the new sign-in added to it (nothing is removed; every way in keeps working).
 *
 *  - Its email is on an account with a password: enter that password.
 *  - On a Google / Apple only account: continue with that provider.
 *  - An email + password sign-in on a Google / Apple only account: continue with that provider,
 *    THEN create a password (the password fields appear only after that succeeds).
 *  - "Already have a LYSM account?" (no match, e.g. Apple "Hide My Email"): sign in the usual way.
 *
 * When the link is done the existing account becomes this app's session and the route gate opens
 * it (Home or Paywall); from onboarding the person continues in that account. Cancel goes back with
 * nothing changed. Same layout as the other email screens (AuthLayout: the app icon on top).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AuthProviderButtons,
  Button,
  Text,
  TextField,
  type AuthProviderId,
} from '@components';
import { toast } from '@store/toast';
import type { OnboardingFlowStackParamList } from '@/navigation/types';
import { AuthLayout, AuthErrorBanner } from '../components/AuthLayout';
import { isAppleAuthAvailable, isUserCanceledSignIn } from '../social';
import { socialSignInMessage } from '../errors';
import { providerName } from '../codeMessages';
import { emailSchema, resetPasswordSchema } from '../schema';
import { useAccountLinkStore, type SocialProviderId } from '../linking';
import {
  LinkFlowError,
  confirmForNewPassword,
  finishNewPassword,
  linkWithPassword,
  linkWithProvider,
  type LinkResult,
} from '../linkFlow';
import {
  PASSWORD_SET_MESSAGE,
  PASSWORD_SET_SIGN_IN_MESSAGE,
  linkProblemMessage,
  linkScreenCopy,
  linkedMessage,
  notLinkedMessage,
} from '../linkMessages';

type Busy = AuthProviderId | 'password' | null;

export function LinkAccountScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<OnboardingFlowStackParamList>>();
  const link = useAccountLinkStore((s) => s.pending);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [banner, setBanner] = useState<string | undefined>();
  const [ticket, setTicket] = useState<string | null>(null);
  const [emailForm, setEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();

  useEffect(() => {
    isAppleAuthAvailable().then(setAppleAvailable);
  }, []);

  // Nothing to link (the app was reopened on this screen): back to where the person came from.
  useEffect(() => {
    if (!link && navigation.canGoBack()) navigation.goBack();
  }, [link, navigation]);
  if (!link) return null;

  const adding = link.kind === 'set_password' ? null : link.attempt.provider;

  const cancel = () => {
    if (busy) return;
    useAccountLinkStore.getState().clear();
    navigation.goBack();
  };

  const opened = (result: LinkResult) => {
    if (!adding) return;
    if (result === 'linked') toast.success(linkedMessage(adding));
    else toast.error(notLinkedMessage(adding));
  };

  /** One step at a time; a refusal is shown on the screen, a cancelled sheet says nothing. */
  const run = async (
    which: Exclude<Busy, null>,
    provider: SocialProviderId | undefined,
    step: () => Promise<void>,
  ) => {
    if (busy) return;
    setBusy(which);
    setBanner(undefined);
    try {
      await step();
    } catch (e) {
      if (isUserCanceledSignIn(e)) return;
      if (e instanceof LinkFlowError) {
        if (e.reason === 'wrong_password') setPasswordError(linkProblemMessage(e.reason));
        else setBanner(linkProblemMessage(e.reason, provider));
        return;
      }
      setBanner(socialSignInMessage(e, providerName(provider ?? adding ?? 'google')));
    } finally {
      setBusy(null);
    }
  };

  const withProvider = (provider: SocialProviderId) => () =>
    run(provider, provider, async () => {
      if (link.kind === 'set_password') setTicket(await confirmForNewPassword(link));
      else opened(await linkWithProvider(link, provider));
    });

  const withPassword = () => {
    const target = link.kind === 'link' ? link.email : email.trim();
    if (link.kind === 'fallback') {
      const parsed = emailSchema.safeParse(target);
      if (!parsed.success) {
        setEmailError(parsed.error.issues[0]?.message);
        return;
      }
    }
    if (!password) {
      setPasswordError('Enter your password.');
      return;
    }
    void run('password', undefined, async () => {
      opened(await linkWithPassword(link, target, password));
    });
  };

  const setNewPassword = () => {
    if (link.kind !== 'set_password' || !ticket) return;
    const parsed = resetPasswordSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      const issues = parsed.error.issues;
      setPasswordError(issues.find((i) => i.path[0] === 'password')?.message);
      setConfirmError(issues.find((i) => i.path[0] === 'confirm')?.message);
      return;
    }
    void run('password', link.provider, async () => {
      try {
        const result = await finishNewPassword(link.email, ticket, parsed.data.password);
        if (result === 'signed_in') toast.success(PASSWORD_SET_MESSAGE);
        else {
          toast.error(PASSWORD_SET_SIGN_IN_MESSAGE);
          navigation.navigate('EmailSignIn', { email: link.email });
        }
      } catch (e) {
        // A stale confirmation: confirm with the provider again.
        if (e instanceof LinkFlowError && e.reason === 'invalid_ticket') setTicket(null);
        throw e;
      }
    });
  };

  const forgotPassword = (address: string) =>
    navigation.navigate('ForgotPassword', address ? { email: address } : undefined);

  const passwordField = (
    <TextField
      label="Password"
      value={password}
      onChangeText={(t) => {
        setPassword(t);
        setPasswordError(undefined);
      }}
      error={passwordError}
      placeholder="Your password"
      secureTextEntry
      autoCapitalize="none"
      autoComplete="password"
      textContentType="password"
      returnKeyType="go"
      onSubmitEditing={withPassword}
    />
  );

  const forgotLink = (address: string) => (
    <View className="items-end">
      <Text
        variant="link"
        onPress={() => forgotPassword(address)}
        accessibilityRole="link"
      >
        Forgot password?
      </Text>
    </View>
  );

  /** Google / Apple buttons; Apple only where Sign in with Apple exists (iPhone, iPad). */
  const providerButtons = (providers: SocialProviderId[], onEmail?: () => void) => (
    <AuthProviderButtons
      appleAvailable={appleAvailable}
      busy={busy === 'password' ? null : busy}
      onApple={providers.includes('apple') ? withProvider('apple') : undefined}
      onGoogle={providers.includes('google') ? withProvider('google') : undefined}
      onEmail={onEmail}
    />
  );

  /** An Apple only account on a phone without Sign in with Apple (Android). */
  const appleElsewhere = (
    <Text variant="bodyMuted" className="text-center">
      This account signs in with Apple, which isn’t available on this device. Open LYSM on
      your iPhone or iPad and sign in with Apple there.
    </Text>
  );

  let body: ReactNode;
  const copy = linkScreenCopy(
    link,
    link.kind === 'set_password' && ticket ? 'password' : 'prove',
  );

  if (link.kind === 'set_password' && ticket) {
    body = (
      <>
        <TextField
          label="New Password"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setPasswordError(undefined);
          }}
          error={passwordError}
          placeholder="New password"
          hint="Use at least 8 characters."
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password-new"
          textContentType="newPassword"
        />
        <TextField
          label="Confirm Password"
          value={confirm}
          onChangeText={(t) => {
            setConfirm(t);
            setConfirmError(undefined);
          }}
          error={confirmError}
          placeholder="Re-enter new password"
          secureTextEntry
          autoCapitalize="none"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={setNewPassword}
        />
        <Button
          title="Set Password"
          onPress={setNewPassword}
          loading={busy === 'password'}
          className="mt-2"
        />
      </>
    );
  } else if (link.kind === 'set_password') {
    body =
      link.provider === 'apple' && !appleAvailable
        ? appleElsewhere
        : providerButtons([link.provider]);
  } else if (link.kind === 'link' && link.method === 'password') {
    body = (
      <>
        {passwordField}
        {forgotLink(link.email)}
        <Button
          title="Continue"
          onPress={withPassword}
          loading={busy === 'password'}
          className="mt-2"
        />
      </>
    );
  } else if (link.kind === 'link') {
    body =
      link.method === 'apple' && !appleAvailable
        ? appleElsewhere
        : providerButtons([link.method as SocialProviderId]);
  } else if (emailForm) {
    body = (
      <>
        <TextField
          label="Email"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setEmailError(undefined);
          }}
          error={emailError}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />
        {passwordField}
        {forgotLink(email.trim())}
        <Button
          title="Continue"
          onPress={withPassword}
          loading={busy === 'password'}
          className="mt-2"
        />
        <Text
          variant="link"
          className="text-center"
          accessibilityRole="button"
          onPress={() => {
            if (!busy) setEmailForm(false);
          }}
        >
          Use a different sign-in option
        </Text>
      </>
    );
  } else {
    // "Already have a LYSM account?": the other provider and email + password.
    body = providerButtons(
      link.attempt.provider === 'apple' ? ['google'] : ['apple'],
      () => setEmailForm(true),
    );
  }

  return (
    <AuthLayout
      title={copy.title}
      subtitle={copy.subtitle}
      footer={
        <Text variant="link" onPress={cancel} accessibilityRole="button">
          Cancel
        </Text>
      }
    >
      <AuthErrorBanner message={banner} />
      {body}
    </AuthLayout>
  );
}
