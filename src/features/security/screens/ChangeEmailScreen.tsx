/**
 * Change email, signed in only (client revisions 10/14 p.19, and p.21 for Apple relay addresses).
 *
 *   current password + new email → code to the NEW address → confirmed → the change takes effect
 *
 *  - The current password comes first, so someone holding an unlocked phone can't take the account
 *    over. "Forgot your current password?" sends the same reset as the sign-in page; someone who
 *    also lost the old inbox is pointed to support instead of weakening the check.
 *  - The code goes only to the new address (nothing is needed from the old one) and nothing
 *    changes until it's confirmed. The server then sends a heads-up to the old address.
 *  - An address another LYSM account uses is refused with a clear message (never merged).
 *  - An Apple "Hide My Email" account without a password confirms with Apple instead of a password,
 *    and can replace the relay address with a real email (the one exception to read-only).
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, CODE_LENGTH, CodeField, Screen, Text, TextField } from '@components';
import { colors } from '@theme';
import { cn } from '@utils/cn';
import { toast } from '@store/toast';
import { useCurrentUser } from '@store/session';
import {
  CODE_HINT,
  isUserCanceledSignIn,
  oneTimeCodeSchema,
  reauthenticateWithProvider,
  type ReauthProof,
} from '@features/auth';
import { cooldownRemaining, emailVerifyKeys } from '@features/email-verification';
import type { ProfileStackParamList } from '@/navigation/types';
import * as api from '../api';
import { securityKeys, useSignInMethods } from '../hooks';
import { securityView } from '../logic';
import { SUPPORT_POINTER, securityProblemMessage } from '../messages';
import { changeEmailSchema, relayEmailSchema } from '../schema';
import { SecurityHeader } from '../components/SecurityHeader';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ChangeEmail'>;

const PASSWORD_PROBLEMS = new Set([
  'password_required',
  'wrong_password',
  'too_many_attempts',
]);
const EMAIL_PROBLEMS = new Set(['email_taken', 'same_email', 'invalid_email']);

export function ChangeEmailScreen({ navigation }: Props) {
  const methods = useSignInMethods();
  const view = methods.data ? securityView(methods.data) : null;
  const relayMode = view?.emailMode === 'relay';
  const user = useCurrentUser();
  const qc = useQueryClient();

  const [step, setStep] = useState<'form' | 'code'>('form');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [proof, setProof] = useState<ReauthProof | null>(null);
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const cooldown = cooldownRemaining(sentAt, now);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /** Ask the server to email a code to the new address. True when it went out. */
  const sendCode = async (): Promise<boolean> => {
    const parsed = relayMode
      ? relayEmailSchema.safeParse({ newEmail })
      : changeEmailSchema.safeParse({ currentPassword, newEmail });
    if (!parsed.success) {
      const issues = parsed.error.issues;
      setPasswordError(issues.find((i) => i.path[0] === 'currentPassword')?.message);
      setEmailError(issues.find((i) => i.path[0] === 'newEmail')?.message);
      return false;
    }
    setPasswordError(undefined);
    setEmailError(undefined);
    setBanner(undefined);
    setBusy(true);
    try {
      let reauth = proof;
      if (relayMode && !reauth) {
        try {
          reauth = await reauthenticateWithProvider('apple');
          setProof(reauth);
        } catch (e) {
          if (!isUserCanceledSignIn(e))
            setBanner('We couldn’t confirm it’s you with Apple. Please try again.');
          return false;
        }
      }
      const res = await api.requestEmailChange({
        newEmail: parsed.data.newEmail,
        ...(relayMode ? { reauth: reauth ?? undefined } : { currentPassword }),
      });
      if (res.ok) {
        setSentTo(res.email);
        setSentAt(Date.now());
        return true;
      }
      if (res.reason === 'reauth_expired' || res.reason === 'reauth_mismatch')
        setProof(null);
      const message = securityProblemMessage(res);
      if (PASSWORD_PROBLEMS.has(res.reason)) setPasswordError(message);
      else if (EMAIL_PROBLEMS.has(res.reason)) setEmailError(message);
      else setBanner(message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onSend = async () => {
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
    if (await sendCode())
      toast.success(`We sent a new code to ${sentTo || newEmail.trim()}.`);
  };

  const onConfirm = async () => {
    if (busy) return;
    const parsed = oneTimeCodeSchema.safeParse(code);
    if (!parsed.success) {
      setCodeError(parsed.error.issues[0]?.message);
      return;
    }
    setBusy(true);
    setCodeError(undefined);
    try {
      const res = await api.confirmEmailChange(sentTo, parsed.data);
      if (!res.ok) {
        if (EMAIL_PROBLEMS.has(res.reason)) {
          setEmailError(securityProblemMessage(res));
          setStep('form');
        } else {
          setCodeError(securityProblemMessage(res));
        }
        return;
      }
      // The new address was confirmed by its code: it counts as verified.
      if (user?.id) qc.setQueryData(emailVerifyKeys.status(user.id), true);
      await api.refreshAccount().catch(() => undefined); // the session now carries the new email
      void qc.invalidateQueries({ queryKey: securityKeys.methods(user?.id) });
      toast.success(`Your email is now ${res.email}.`);
      navigation.goBack();
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <SecurityHeader title="Change email" onBack={() => navigation.goBack()} />
  );

  if (!view) {
    return (
      <Screen scroll contentClassName="py-2">
        {header}
        <View className="mt-10 items-center">
          <ActivityIndicator color={colors.brand[500]} />
        </View>
      </Screen>
    );
  }

  if (view.emailMode === 'readonly') {
    return (
      <Screen scroll contentClassName="py-2">
        {header}
        <Text variant="bodyMuted" className="mt-4">
          {securityProblemMessage({
            reason: 'read_only',
            provider: view.originalProvider ?? undefined,
          })}
        </Text>
      </Screen>
    );
  }

  if (step === 'code') {
    return (
      <Screen scroll keyboardAvoiding contentClassName="py-2">
        {header}
        <View className="mt-4 gap-4">
          <Text variant="bodyMuted">
            We sent a 6-digit code to <Text variant="bodyStrong">{sentTo}</Text>. Enter it
            to confirm your new email. Your email stays the same until you do.
          </Text>
          {banner ? (
            <Text
              variant="caption"
              className="text-danger-strong"
              accessibilityLiveRegion="polite"
            >
              {banner}
            </Text>
          ) : null}
          <CodeField
            value={code}
            onChangeText={(digits) => {
              setCode(digits);
              setCodeError(undefined);
            }}
            error={codeError}
            returnKeyType="done"
            onSubmitEditing={onConfirm}
          />
          <Button
            title="Confirm"
            onPress={onConfirm}
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
            <Pressable
              onPress={() => {
                setStep('form');
                setBanner(undefined);
              }}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text variant="link">Use a different email</Text>
            </Pressable>
          </View>
          <Text variant="caption" className="text-center">
            {CODE_HINT}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll keyboardAvoiding contentClassName="py-2">
      {header}
      <View className="mt-4 gap-4">
        <Text variant="bodyMuted">
          {relayMode
            ? 'Replace Apple’s private relay address with your real email. You’ll confirm it’s you with Apple, then we’ll send a code to the new address.'
            : 'Enter your current password and your new email. We’ll send a code to the new address, and the change happens once you enter it.'}
        </Text>
        <Text variant="caption">
          Current email:{' '}
          <Text variant="caption" className="font-sans-semibold text-ink">
            {view.email}
          </Text>
        </Text>
        {banner ? (
          <Text
            variant="caption"
            className="text-danger-strong"
            accessibilityLiveRegion="polite"
          >
            {banner}
          </Text>
        ) : null}
        {relayMode ? null : (
          <View className="gap-2">
            <TextField
              label="Current Password"
              value={currentPassword}
              onChangeText={(t) => {
                setCurrentPassword(t);
                setPasswordError(undefined);
              }}
              error={passwordError}
              placeholder="Your current password"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
            />
            <Pressable
              onPress={() =>
                navigation.navigate('ForgotPassword', { email: view.email ?? undefined })
              }
              accessibilityRole="button"
              hitSlop={8}
              className="self-start"
            >
              <Text variant="link">Forgot your current password?</Text>
            </Pressable>
          </View>
        )}
        <TextField
          label="New Email"
          value={newEmail}
          onChangeText={(t) => {
            setNewEmail(t);
            setEmailError(undefined);
          }}
          error={emailError}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={onSend}
        />
        <Button
          title={relayMode && !proof ? 'Continue with Apple' : 'Send code'}
          onPress={onSend}
          loading={busy}
          className="mt-2"
        />
        {relayMode ? null : (
          <Text variant="caption" className="text-center">
            {SUPPORT_POINTER}
          </Text>
        )}
      </View>
    </Screen>
  );
}
