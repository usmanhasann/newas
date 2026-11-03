import { View } from 'react-native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, ControlledTextField, Text } from '@components';
import type { AuthStackParamList } from '@/navigation/types';
import { AuthLayout, AuthErrorBanner } from '../components/AuthLayout';
import { loginSchema, type LoginInput } from '../schema';
import { useSignIn } from '../hooks';
import { authErrorMessage } from '../errors';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const signIn = useSignIn();
  const { control, handleSubmit } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  // On success the auth listener updates the session store and the router swaps stacks.
  const onSubmit = handleSubmit((values) => signIn.mutate(values));

  return (
    <AuthLayout
      title="LYSM"
      subtitle="A safe space for your thoughts, shared with those who care."
      footer={
        <Text
          variant="link"
          onPress={() => navigation.navigate('SignUp')}
          accessibilityRole="link"
        >
          New here? Create an account
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
