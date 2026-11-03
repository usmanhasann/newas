/**
 * "Verify your email" screen (client revisions 10/14 p.18): the 6-digit code step on its own page.
 *  - Standalone (no props): the app-open check for an older email + password account that never
 *    verified (the route gate shows it before the paywall / Home). Verifying moves the gate on;
 *    "Log out" is the way out.
 *  - Embedded (circle check, the backstop): `onConfirmed` resumes the circle action, `onBack`
 *    cancels it.
 * The verified flag lives on the server; this screen never trusts client state for it.
 */
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Text } from '@components';
import { colors } from '@theme';
import { useSignOut } from '@features/auth';
import { EmailCodeVerifier } from '../components/EmailCodeVerifier';

export interface EmailConfirmationScreenProps {
  /** Called once the email is verified (in-flow use: the circle check). The standalone gate needs
   *  none: the verified flag it reads is updated and it routes on by itself. */
  onConfirmed?: () => void;
  /** Hide "Log out" (not meaningful mid-flow). */
  embedded?: boolean;
  /** When provided, a back chevron at the top cancels (stacks with no header, e.g. the circle check). */
  onBack?: () => void;
}

export function EmailConfirmationScreen({
  onConfirmed,
  embedded,
  onBack,
}: EmailConfirmationScreenProps = {}) {
  const signOut = useSignOut();

  return (
    <Screen scroll keyboardAvoiding contentClassName="py-8">
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="mb-4 self-start"
        >
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
      ) : null}
      <View className="items-center">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-brand-50">
          <Ionicons name="mail-unread-outline" size={44} color={colors.brand[500]} />
        </View>
        <Text variant="h1" className="mt-6 text-center">
          Verify your email
        </Text>
        <Text variant="bodyMuted" className="mt-3 text-center">
          To keep your account safe, confirm your email before you continue.
        </Text>
      </View>

      <View className="mt-8">
        <EmailCodeVerifier onVerified={() => onConfirmed?.()} />
      </View>

      {!embedded ? (
        <View className="mt-8 items-center">
          <Text variant="link" onPress={() => signOut.mutate()} accessibilityRole="link">
            Log out
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}
