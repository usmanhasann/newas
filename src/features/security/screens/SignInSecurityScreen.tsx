/**
 * Sign-in & Security (client revisions 10/14 p.17-21), opened from the Profile row of the same
 * name: an "Email" row and a "Password" row. Changing the email or the password lives here only,
 * never on the sign-in page (that page only has "Forgot password").
 *  - Email: an account with a password changes it (current password, then a code to the new
 *    address). A Google / Apple only account's email is read-only (the provider controls it),
 *    except an Apple "Hide My Email" relay address, which can be replaced with a real email.
 *  - Password: "Password" changes it; a Google / Apple only account sees "Set a password" instead.
 */
import { ActivityIndicator, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Screen, Text } from '@components';
import { colors } from '@theme';
import { providerName } from '@features/auth';
import type { ProfileStackParamList } from '@/navigation/types';
import { useSignInMethods } from '../hooks';
import { securityView, type SecurityView } from '../logic';
import { SecurityHeader } from '../components/SecurityHeader';
import { SecurityRow } from '../components/SecurityRow';

type Props = NativeStackScreenProps<ProfileStackParamList, 'SignInSecurity'>;

function emailNote(view: SecurityView): string | undefined {
  if (view.emailMode === 'relay') {
    return 'Apple’s private relay address. Tap to use your real email instead.';
  }
  if (view.emailMode === 'readonly') {
    return view.originalProvider
      ? `Your email comes from ${providerName(view.originalProvider)} sign-in, so it’s managed there.`
      : 'Your email comes from your sign-in provider, so it’s managed there.';
  }
  return undefined;
}

function passwordNote(view: SecurityView): string {
  if (view.passwordMode === 'change') return 'Change your password';
  return view.originalProvider
    ? `Add a password so you can also sign in with your email. You’ll confirm with ${providerName(view.originalProvider)} first.`
    : 'Add a password so you can also sign in with your email.';
}

export function SignInSecurityScreen({ navigation }: Props) {
  const methods = useSignInMethods();
  const view = methods.data ? securityView(methods.data) : null;

  return (
    <Screen scroll contentClassName="py-2">
      <SecurityHeader title="Sign-in & Security" onBack={() => navigation.goBack()} />

      {view ? (
        <View className="mt-4">
          <SecurityRow
            icon="mail-outline"
            label="Email"
            value={view.email ?? undefined}
            note={emailNote(view)}
            onPress={
              view.emailMode === 'readonly'
                ? undefined
                : () => navigation.navigate('ChangeEmail')
            }
          />
          <SecurityRow
            icon="key-outline"
            label={view.passwordMode === 'change' ? 'Password' : 'Set a password'}
            note={passwordNote(view)}
            onPress={() =>
              navigation.navigate(
                view.passwordMode === 'change' ? 'ChangePassword' : 'SetPassword',
              )
            }
          />
        </View>
      ) : methods.isError ? (
        <View className="mt-10 items-center gap-4">
          <Text variant="bodyMuted" className="text-center">
            We couldn’t load your sign-in details. Check your connection and try again.
          </Text>
          <Button
            title="Try again"
            variant="outline"
            onPress={() => void methods.refetch()}
          />
        </View>
      ) : (
        <View className="mt-10 items-center" accessibilityLabel="Loading">
          <ActivityIndicator color={colors.brand[500]} />
        </View>
      )}
    </Screen>
  );
}
