/**
 * Account deletion confirmation (App Store requirement). Destructive + irreversible, so it's a
 * dedicated screen (not an inline tap): it spells out what's removed, warns that deletion does
 * NOT cancel the store subscription, and gates the final action behind typing "delete". On
 * confirm it calls the delete-account Edge Function and resets to Welcome (via useDeleteAccount).
 *
 * An account that uses Sign in with Apple also confirms with Apple once (where Apple's sheet is
 * available, i.e. iPhone): its one-time code lets the server revoke Sign in with Apple, as the App
 * Store requires. Apple never stops a deletion (App Store 5.1.1(v)): if Apple's sheet fails, the
 * deletion goes ahead without it; if the user dismisses it, that attempt stops and a "Delete
 * without confirming with Apple" option appears (e.g. no Apple ID signed in on this phone).
 */
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Text, Button, Card, TextField } from '@components';
import { colors } from '@theme';
import { toast } from '@store/toast';
import { useCurrentUser } from '@store/session';
import {
  confirmAppleForDeletion,
  isAppleAuthAvailable,
  isUserCanceledSignIn,
  useDeleteAccount,
} from '@features/auth';
import type { ProfileStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'DeleteAccount'>;

const STORE = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';
const ACCOUNT = Platform.OS === 'ios' ? 'Apple' : 'Google';

export function DeleteAccountScreen({ navigation }: Props) {
  const [confirm, setConfirm] = useState('');
  const del = useDeleteAccount();
  const canDelete = confirm.trim().toLowerCase() === 'delete';
  const user = useCurrentUser();
  const usesApple = !!user?.identities?.some((i) => i.provider === 'apple');
  const [appleSheet, setAppleSheet] = useState(false);
  const [confirmingWithApple, setConfirmingWithApple] = useState(false);
  const [appleDismissed, setAppleDismissed] = useState(false);

  useEffect(() => {
    if (usesApple) void isAppleAuthAvailable().then(setAppleSheet);
  }, [usesApple]);

  const onDelete = async (withApple: boolean) => {
    if (!canDelete || del.isPending || confirmingWithApple) return;
    let appleCode: string | undefined;
    if (withApple && usesApple && appleSheet) {
      setConfirmingWithApple(true);
      try {
        appleCode = await confirmAppleForDeletion();
      } catch (e) {
        if (isUserCanceledSignIn(e)) {
          // The user dismissed Apple's sheet: nothing is deleted. In case Apple can't be used on
          // this phone (e.g. no Apple ID signed in), offer to delete without it.
          setAppleDismissed(true);
          return;
        }
        // Apple's sheet failed: Apple never blocks a deletion, so go ahead without it.
      } finally {
        setConfirmingWithApple(false);
      }
    }
    // On success useDeleteAccount resets the session and the gate routes to Welcome (this screen
    // unmounts). On failure the account is untouched and we surface the error here.
    del.mutate(appleCode, {
      onError: () => toast.error('We couldn’t delete your account. Please try again.'),
    });
  };

  return (
    <Screen scroll keyboardAvoiding contentClassName="py-2">
      <View className="flex-row items-center gap-3 py-3">
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text variant="h3">Delete account</Text>
      </View>

      <View className="mt-4 items-center">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-danger/10">
          <Ionicons name="trash-outline" size={30} color={colors['danger-strong']} />
        </View>
      </View>

      <Text variant="h2" className="mt-5 text-center">
        This can’t be undone
      </Text>
      <Text variant="bodyMuted" className="mt-3 text-center">
        Deleting your account permanently removes your journal entries, check-ins, circle posts and
        replies, and your profile. There’s no way to recover it.
      </Text>

      <Card elevated={false} className="mt-6 bg-warning-bg">
        <View className="flex-row gap-3">
          <Ionicons name="alert-circle" size={20} color={colors.warning} />
          <View className="flex-1">
            <Text variant="bodyStrong" style={{ color: colors.ink }}>
              Cancel your subscription separately
            </Text>
            <Text variant="caption" className="mt-1" style={{ color: colors.ink }}>
              Deleting your account does not cancel your subscription. It’s billed through {STORE},
              not us. Cancel it in your {ACCOUNT} account settings, or you’ll keep being charged with
              no account to use.
            </Text>
          </View>
        </View>
      </Card>

      <View className="mt-6">
        <TextField
          label="Type delete to confirm"
          value={confirm}
          onChangeText={setConfirm}
          placeholder="delete"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <Button
        title="Delete my account"
        variant="destructive"
        className="mt-6"
        disabled={!canDelete}
        loading={del.isPending || confirmingWithApple}
        onPress={() => void onDelete(true)}
      />
      {usesApple && appleSheet ? (
        <Text variant="caption" className="mt-2 text-center">
          Your account uses Sign in with Apple, so you’ll confirm with Apple next.
        </Text>
      ) : null}
      {appleDismissed && canDelete ? (
        <Button
          title="Delete without confirming with Apple"
          variant="ghost"
          className="mt-1"
          disabled={del.isPending}
          onPress={() => void onDelete(false)}
        />
      ) : null}
      <Button title="Cancel" variant="ghost" className="mt-2" onPress={() => navigation.goBack()} />
    </Screen>
  );
}
