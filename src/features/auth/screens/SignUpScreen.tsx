import { View } from 'react-native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, ControlledTextField, Text } from '@components';
import { usePendingInviteStore } from '@store/pendingInvite';
import type { AuthStackParamList } from '@/navigation/types';
import { AuthLayout, AuthErrorBanner } from '../components/AuthLayout';
import { signupSchema, type SignupInput } from '../schema';
import { useSignUp } from '../hooks';
import { authErrorMessage } from '../errors';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export function SignUpScreen({ navigation, route }: Props) {
  const signUp = useSignUp();
  const { control, handleSubmit } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      displayName: '',
      email: '',
      password: '',
      inviteCode: route.params?.inviteCode ?? '',
    },
  });

  // The new account is signed in straight away; its invite code (if any) is then redeemed with a
  // clear result, and a Private circle's owner is told (usePendingInviteRedeem).
  const onSubmit = handleSubmit((values) =>
    signUp.mutate(values, {
      onSuccess: () => usePendingInviteStore.getState().set(values.inviteCode ?? null),
    }),
  );

  return (
    <AuthLayout
      title="Create Account"
      subtitle="Begin your journaling journey."
      footer={
        <Text
          variant="link"
          onPress={() => navigation.navigate('Login')}
          accessibilityRole="link"
        >
          Already have an account? Sign in
        </Text>
      }
    >
      <AuthErrorBanner
        message={signUp.isError ? authErrorMessage(signUp.error) : undefined}
      />

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

      {/* Invite code is an optional, clearly-separated path (design spec §6.2 fix). */}
      <View className="mt-2 gap-3 border-t border-line pt-5">
        <Text variant="section">Have an invite code?</Text>
        <ControlledTextField
          control={control}
          name="inviteCode"
          label="Invite Code"
          placeholder="e.g. CIRCLE-1234"
          autoCapitalize="characters"
          autoCorrect={false}
          hint="Optional. Links you to the circle that invited you."
        />
      </View>

      <Button
        title="Create Account"
        onPress={onSubmit}
        loading={signUp.isPending}
        className="mt-2"
      />
    </AuthLayout>
  );
}
