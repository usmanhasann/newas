/**
 * "Set a password" (client revisions 10/14 p.20), for an account created with Google or Apple only:
 * the user first signs in again with the provider the account was created with, then creates a
 * password, after which they can also sign in with their email. The server checks that sign-in
 * belongs to this account, and signs out the account's other devices afterwards (this device signs
 * in again with the new password).
 */
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Screen, Text, TextField } from '@components';
import { colors } from '@theme';
import { toast } from '@store/toast';
import { useCurrentUser } from '@store/session';
import {
  isUserCanceledSignIn,
  providerName,
  reauthenticateWithProvider,
  resetPasswordSchema,
  useSignOut,
  type ReauthProof,
} from '@features/auth';
import { emailVerifyKeys } from '@features/email-verification';
import type { ProfileStackParamList } from '@/navigation/types';
import * as api from '../api';
import { securityKeys, useSignInMethods } from '../hooks';
import { securityView } from '../logic';
import { securityProblemMessage } from '../messages';
import { SecurityHeader } from '../components/SecurityHeader';

type Props = NativeStackScreenProps<ProfileStackParamList, 'SetPassword'>;

export function SetPasswordScreen({ navigation }: Props) {
  const methods = useSignInMethods();
  const view = methods.data ? securityView(methods.data) : null;
  const provider = view?.originalProvider ?? null;
  const user = useCurrentUser();
  const qc = useQueryClient();
  const signOut = useSignOut();

  const [proof, setProof] = useState<ReauthProof | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const header = (
    <SecurityHeader title="Set a password" onBack={() => navigation.goBack()} />
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

  const onReauth = async () => {
    if (busy || !provider) return;
    setBusy(true);
    setBanner(undefined);
    try {
      setProof(await reauthenticateWithProvider(provider, view.email ?? undefined));
    } catch (e) {
      if (!isUserCanceledSignIn(e)) {
        setBanner(
          `We couldn’t confirm it’s you with ${providerName(provider)}. Please try again.`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async () => {
    if (busy || !proof) return;
    const parsed = resetPasswordSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      const issues = parsed.error.issues;
      setPasswordError(issues.find((i) => i.path[0] === 'password')?.message);
      setConfirmError(issues.find((i) => i.path[0] === 'confirm')?.message);
      return;
    }
    setBusy(true);
    setBanner(undefined);
    setPasswordError(undefined);
    setConfirmError(undefined);
    try {
      const res = await api.setPassword(parsed.data.password, proof);
      if (!res.ok) {
        if (res.reason === 'weak_password') {
          setPasswordError(securityProblemMessage(res));
          return;
        }
        // A stale or wrong sign-in: confirm with the provider again.
        if (
          res.reason === 'reauth_expired' ||
          res.reason === 'reauth_mismatch' ||
          res.reason === 'reauth_required' ||
          res.reason === 'wrong_provider'
        ) {
          setProof(null);
        }
        setBanner(securityProblemMessage(res));
        return;
      }
      // The provider verified this email, and the server recorded it: the new email sign-in is
      // never asked for a code.
      if (user?.id) qc.setQueryData(emailVerifyKeys.status(user.id), true);
      if (await api.signInAgain(res.email, parsed.data.password)) {
        void qc.invalidateQueries({ queryKey: securityKeys.methods(user?.id) });
        toast.success(
          'Your password is set. You can now sign in with your email and password too.',
        );
        navigation.goBack();
      } else {
        toast.error(
          'Your password is set. Please sign in again with your email and new password.',
        );
        signOut.mutate();
      }
    } finally {
      setBusy(false);
    }
  };

  if (!provider || view.hasPassword) {
    return (
      <Screen scroll contentClassName="py-2">
        {header}
        <Text variant="bodyMuted" className="mt-4">
          {view.hasPassword
            ? 'Your account already has a password. You can change it under Password.'
            : 'We couldn’t find the sign-in this account was created with.'}
        </Text>
      </Screen>
    );
  }

  const name = providerName(provider);

  return (
    <Screen scroll keyboardAvoiding contentClassName="py-2">
      {header}
      <View className="mt-4 gap-4">
        {banner ? (
          <Text
            variant="caption"
            className="text-danger-strong"
            accessibilityLiveRegion="polite"
          >
            {banner}
          </Text>
        ) : null}
        {proof ? (
          <>
            <Text variant="bodyMuted">
              Thanks, that’s confirmed. Choose a password. You’ll sign in with{' '}
              <Text variant="bodyStrong">{view.email}</Text> and this password, or keep
              using {name}.
            </Text>
            {view.relay ? (
              <Text variant="caption">
                This is Apple’s private relay address. You can replace it with your real
                email under Email.
              </Text>
            ) : null}
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
              onSubmitEditing={onSubmit}
            />
            <Button
              title="Set Password"
              onPress={onSubmit}
              loading={busy}
              className="mt-2"
            />
          </>
        ) : (
          <>
            <Text variant="bodyMuted">
              Your account was created with {name}. To set a password, first confirm it’s
              you with {name}.
            </Text>
            <Button title={`Continue with ${name}`} onPress={onReauth} loading={busy} />
          </>
        )}
      </View>
    </Screen>
  );
}
