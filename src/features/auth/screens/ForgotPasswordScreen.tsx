/**
 * Forgot password, by a 6-digit code (client revisions 10/14 p.20). The only way back in for
 * someone who is locked out, reached from the sign-in page's "Forgot password?", and from Sign-in &
 * Security's "Forgot your current password?" (the same reset, for the signed-in email).
 *
 *   email → code → new password → done
 *
 *  - A Google / Apple only account gets no email: the screen says so and names the provider the
 *    account was created with (exact client text).
 *  - No email goes to an address without an account; the screen answers the same way ("If there's
 *    a LYSM account…"), so it never tells whether an account exists.
 *  - The code expires, works once and locks after wrong tries (ask for a new one: "Resend code").
 *  - The reset signs out every session of the account; this device then signs in with the new
 *    password, so only the other devices stay signed out (signed out: the app opens the account;
 *    signed in from Sign-in & Security: back to that screen).
 *
 * Navigator-agnostic (goBack / pop): it lives in the sign-in stacks and the Profile stack.
 */
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { StackActions, useNavigation, useRoute } from '@react-navigation/native';
import { Button, CODE_LENGTH, CodeField, Text, TextField } from '@components';
import { cn } from '@utils/cn';
import { toast } from '@store/toast';
import { useCurrentUser } from '@store/session';
import { AuthLayout, AuthErrorBanner } from '../components/AuthLayout';
import { useSignOut } from '../hooks';
import { emailSchema, oneTimeCodeSchema, resetPasswordSchema } from '../schema';
import * as api from '../api';
import {
  CODE_HINT,
  codeProblemMessage,
  codeSendProblemMessage,
  providerOnlyResetMessage,
} from '../codeMessages';

type Step = 'email' | 'code' | 'password';
const RESEND_SECONDS = 60;

export function ForgotPasswordScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const user = useCurrentUser();
  const signOut = useSignOut();
  const presetEmail = (route.params as { email?: string } | undefined)?.email;

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(presetEmail ?? '');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | undefined>();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const normalized = email.trim().toLowerCase();
  // Signed in to this very account: the code screen can name the address plainly.
  const signedInAsThis =
    !!user && !user.is_anonymous && (user.email ?? '').toLowerCase() === normalized;
  // Opened from Sign-in & Security ("Forgot your current password?"), which passes the email.
  const fromSecurity = !!presetEmail && signedInAsThis;
  const cooldown = sentAt
    ? Math.max(0, RESEND_SECONDS - Math.floor((now - sentAt) / 1000))
    : 0;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const sendCode = async (): Promise<boolean> => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message);
      return false;
    }
    setBusy(true);
    setBanner(undefined);
    setEmailError(undefined);
    try {
      const res = await api.requestPasswordResetCode(parsed.data);
      if (res.ok && res.status === 'provider_only') {
        setBanner(providerOnlyResetMessage(res.provider));
        setStep('email');
        return false;
      }
      if (res.ok) {
        setSentAt(Date.now());
        return true;
      }
      if (
        res.reason === 'too_many' &&
        res.retryAfter !== undefined &&
        res.retryAfter <= RESEND_SECONDS
      ) {
        setSentAt(Date.now() - (RESEND_SECONDS - res.retryAfter) * 1000);
      }
      if (res.reason === 'invalid_email')
        setEmailError(codeSendProblemMessage(res.reason));
      else setBanner(codeSendProblemMessage(res.reason));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onSendCode = async () => {
    if (busy) return;
    if (await sendCode()) {
      setCode('');
      setCodeError(undefined);
      setStep('code');
    }
  };

  const onResend = async () => {
    if (busy || cooldown > 0) return;
    setCode('');
    setCodeError(undefined);
    if (await sendCode()) toast.success('We sent a new code.');
  };

  const onVerifyCode = async () => {
    if (busy) return;
    const parsed = oneTimeCodeSchema.safeParse(code);
    if (!parsed.success) {
      setCodeError(parsed.error.issues[0]?.message);
      return;
    }
    setBusy(true);
    setCodeError(undefined);
    try {
      const res = await api.verifyPasswordResetCode(normalized, parsed.data);
      if (res.ok) {
        setResetToken(res.resetToken);
        setStep('password');
      } else if (res.reason === 'too_many') {
        setCodeError('Too many tries from this device. Please wait a few minutes.');
      } else {
        setCodeError(codeProblemMessage(res.reason));
      }
    } finally {
      setBusy(false);
    }
  };

  const onSetPassword = async () => {
    if (busy || !resetToken) return;
    const parsed = resetPasswordSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      const issues = parsed.error.issues;
      setPasswordError(issues.find((i) => i.path[0] === 'password')?.message);
      setConfirmError(issues.find((i) => i.path[0] === 'confirm')?.message);
      return;
    }
    setBusy(true);
    setPasswordError(undefined);
    setConfirmError(undefined);
    try {
      const res = await api.completePasswordReset(
        normalized,
        resetToken,
        parsed.data.password,
      );
      if (!res.ok) {
        if (res.reason === 'weak_password') {
          setPasswordError('Use at least 8 characters');
        } else if (res.reason === 'invalid_token') {
          setBanner('That took too long. Please ask for a new code.');
          setResetToken(null);
          setStep('email');
        } else {
          setBanner('We couldn’t update your password. Please try again.');
        }
        return;
      }
      // The reset signed out every session of the account: sign this device in with the new
      // password (signed out, the app then opens the account; signed in, it stays signed in).
      let signedIn = true;
      try {
        await api.signInWithPassword({
          email: normalized,
          password: parsed.data.password,
        });
      } catch {
        signedIn = false;
      }
      if (fromSecurity) {
        if (signedIn) {
          toast.success('Your password was updated. Your other devices were signed out.');
          navigation.dispatch(StackActions.popTo('SignInSecurity'));
        } else {
          toast.error(
            'Your password was updated. Please sign in again with your new password.',
          );
          signOut.mutate();
        }
        return;
      }
      if (signedIn) {
        toast.success('Your password was updated.');
      } else {
        toast.success('Your password was updated. Sign in with your new password.');
        navigation.goBack();
      }
    } finally {
      setBusy(false);
    }
  };

  const backLabel = presetEmail ? 'Back' : 'Back to sign in';
  const backLink = (
    <Text variant="link" onPress={() => navigation.goBack()} accessibilityRole="link">
      {backLabel}
    </Text>
  );

  if (step === 'code') {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={
          signedInAsThis
            ? `We sent a 6-digit code to ${normalized}.`
            : `If there’s a LYSM account for ${normalized}, we sent a 6-digit code to it.`
        }
        footer={backLink}
      >
        <AuthErrorBanner message={banner} />
        <CodeField
          value={code}
          onChangeText={(digits) => {
            setCode(digits);
            setCodeError(undefined);
          }}
          error={codeError}
          returnKeyType="done"
          onSubmitEditing={onVerifyCode}
        />
        <Button
          title="Continue"
          onPress={onVerifyCode}
          loading={busy}
          disabled={code.length !== CODE_LENGTH}
        />
        <View className="items-center gap-3">
          <Pressable
            onPress={onResend}
            disabled={busy || cooldown > 0}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || cooldown > 0 }}
            hitSlop={8}
            className={cn((busy || cooldown > 0) && 'opacity-50')}
          >
            <Text variant="link">Resend code</Text>
          </Pressable>
          {cooldown > 0 ? (
            <Text variant="caption">You can ask for a new code in {cooldown}s.</Text>
          ) : null}
          {presetEmail ? null : (
            <Pressable
              onPress={() => {
                setStep('email');
                setBanner(undefined);
              }}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text variant="link">Use a different email</Text>
            </Pressable>
          )}
        </View>
        <Text variant="caption" className="text-center">
          {CODE_HINT}
        </Text>
      </AuthLayout>
    );
  }

  if (step === 'password') {
    return (
      <AuthLayout
        title="Choose a new password"
        subtitle="You’ll use it to sign in from now on."
        footer={backLink}
      >
        <AuthErrorBanner message={banner} />
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
          onSubmitEditing={onSetPassword}
        />
        <Button
          title="Update Password"
          onPress={onSetPassword}
          loading={busy}
          className="mt-2"
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot password?"
      subtitle="No worries, it happens to everyone! Enter your email and we’ll send you a 6-digit code."
      footer={backLink}
    >
      <AuthErrorBanner message={banner} />
      <TextField
        label="Email"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          setEmailError(undefined);
          setBanner(undefined);
        }}
        error={emailError}
        editable={!presetEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="go"
        onSubmitEditing={onSendCode}
      />
      <Button title="Send code" onPress={onSendCode} loading={busy} className="mt-2" />
    </AuthLayout>
  );
}
