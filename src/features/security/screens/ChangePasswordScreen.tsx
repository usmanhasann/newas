/**
 * Change password (client revisions 10/14 p.19-20), for an account that has one: the current
 * password is required. "Forgot your current password?" sends the same code reset as the sign-in
 * page's "Forgot password", so nobody hits a dead end. Afterwards the user's other devices are
 * signed out (the server signs out every session and this device signs in again with the new
 * password).
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Screen, Text, TextField } from '@components';
import { toast } from '@store/toast';
import { useCurrentUser } from '@store/session';
import { useSignOut } from '@features/auth';
import type { ProfileStackParamList } from '@/navigation/types';
import * as api from '../api';
import { securityProblemMessage } from '../messages';
import { changePasswordSchema } from '../schema';
import { SecurityHeader } from '../components/SecurityHeader';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ChangePassword'>;

type Field = 'currentPassword' | 'password' | 'confirm';

export function ChangePasswordScreen({ navigation }: Props) {
  const user = useCurrentUser();
  const signOut = useSignOut();
  const [values, setValues] = useState<Record<Field, string>>({
    currentPassword: '',
    password: '',
    confirm: '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [banner, setBanner] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const set = (field: Field) => (text: string) => {
    setValues((v) => ({ ...v, [field]: text }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const onSubmit = async () => {
    if (busy) return;
    const parsed = changePasswordSchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as Field;
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setBusy(true);
    setBanner(undefined);
    try {
      const res = await api.changePassword(
        parsed.data.currentPassword,
        parsed.data.password,
      );
      if (!res.ok) {
        const message = securityProblemMessage(res);
        if (res.reason === 'wrong_password' || res.reason === 'too_many_attempts') {
          setErrors({ currentPassword: message });
        } else if (res.reason === 'same_password' || res.reason === 'weak_password') {
          setErrors({ password: message });
        } else {
          setBanner(message);
        }
        return;
      }
      if (await api.signInAgain(res.email, parsed.data.password)) {
        toast.success('Your password was updated. Your other devices were signed out.');
        navigation.goBack();
      } else {
        toast.error(
          'Your password was updated. Please sign in again with your new password.',
        );
        signOut.mutate();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll keyboardAvoiding contentClassName="py-2">
      <SecurityHeader title="Change password" onBack={() => navigation.goBack()} />
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
        <View className="gap-2">
          <TextField
            label="Current Password"
            value={values.currentPassword}
            onChangeText={set('currentPassword')}
            error={errors.currentPassword}
            placeholder="Your current password"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
          />
          <Pressable
            onPress={() =>
              navigation.navigate('ForgotPassword', { email: user?.email ?? undefined })
            }
            accessibilityRole="button"
            hitSlop={8}
            className="self-start"
          >
            <Text variant="link">Forgot your current password?</Text>
          </Pressable>
        </View>
        <TextField
          label="New Password"
          value={values.password}
          onChangeText={set('password')}
          error={errors.password}
          placeholder="New password"
          hint="Use at least 8 characters."
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password-new"
          textContentType="newPassword"
        />
        <TextField
          label="Confirm Password"
          value={values.confirm}
          onChangeText={set('confirm')}
          error={errors.confirm}
          placeholder="Re-enter new password"
          secureTextEntry
          autoCapitalize="none"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />
        <Button
          title="Update Password"
          onPress={onSubmit}
          loading={busy}
          className="mt-2"
        />
        <Text variant="caption" className="text-center">
          You’ll stay signed in on this device. Your other devices will be signed out.
        </Text>
      </View>
    </Screen>
  );
}
