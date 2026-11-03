/**
 * Email sign-in (Welcome → Sign In → "Sign in with Email"). The existing-user email + password
 * form, split out of SignInScreen so the Sign-In screen itself is a pure provider chooser
 * (Google / Apple / Email). Submitting runs signInWithPassword (via useSignIn) against the
 * user's REAL account; on success the auth listener switches the session and the RootNavigator
 * gate lands them on Home (active) / Paywall (lapsed). "Forgot password?" and "Back to sign in
 * options" stay within the OnboardingFlow stack.
 *
 * Account linking (client revisions 10/14 p.16, N4): when the password doesn't match because the
 * email belongs to a Google / Apple only account, "Link your account" opens: confirm with that
 * provider, THEN create a password. Any other failure shows the usual message.
 */
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, ControlledTextField, Text } from '@components';
import type { OnboardingFlowStackParamList } from '@/navigation/types';
import { AuthLayout, AuthErrorBanner } from '../components/AuthLayout';
import { loginSchema, type LoginInput } from '../schema';
import { useSignIn } from '../hooks';
import { authErrorMessage } from '../errors';
import { startEmailAccountLink } from '../linkFlow';

type Props = Partial<NativeStackScreenProps<OnboardingFlowStackParamList, 'EmailSignIn'>>;

export function EmailSignInScreen({ route }: Props = {}) {
  const navigation =
    useNavigation<NativeStackNavigationProp<OnboardingFlowStackParamList>>();
  const signIn = useSignIn();

  const { control, handleSubmit } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: route?.params?.email ?? '', password: '' },
  });

  // On success the auth listener updates the session store and the gate swaps stacks. A password
  // that doesn't match may be a Google / Apple only account (p.16): then linking opens.
  const onSubmit = handleSubmit((v) =>
    signIn.mutate(v, {
      onError: (e) => {
        if (/invalid (login )?credentials/i.test(e instanceof Error ? e.message : '')) {
          void startEmailAccountLink(v.email, 'signin', () =>
            navigation.navigate('LinkAccount'),
          );
        }
      },
    }),
  );

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Enter your email and password to continue."
      footer={
        <Text variant="link" onPress={() => navigation.goBack()} accessibilityRole="link">
          Back to sign in options
        </Text>
      }
    >
      <AuthErrorBanner
        message={signIn.isError ? authErrorMessage(signIn.error) : undefined}
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
        returnKeyType="next"
      />

      <ControlledTextField
        control={control}
        name="password"
        label="Password"
        placeholder="Your password"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />

      <View className="items-end">
        <Text
          variant="link"
          onPress={() => navigation.navigate('ForgotPassword')}
          accessibilityRole="link"
        >
          Forgot password?
        </Text>
      </View>

      <Button
        title="Sign In"
        onPress={onSubmit}
        loading={signIn.isPending}
        className="mt-2"
      />
    </AuthLayout>
  );
}
