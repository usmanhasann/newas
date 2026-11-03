import { useCallback, useRef } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EmailConfirmationScreen } from '@features/email-verification';
import { toast } from '@store/toast';
import type { CirclesStackParamList } from '@/navigation/types';
import { useJoinByCode } from '../hooks';

type Props = NativeStackScreenProps<CirclesStackParamList, 'VerifyEmailToJoin'>;

/**
 * Circle-join email gate. Reached ONLY when an unverified email account taps "Join Circle"
 * (the Join a Circle page's invite-code card does the check first). Reuses the shared
 * EmailConfirmationScreen (send / resend + auto re-check on foreground / deep link). On success it
 * completes the pending join and opens the circle — the user never re-enters the code. Back
 * cancels and returns to the Join a Circle page (their code is preserved there).
 */
export function VerifyEmailToJoinScreen({ route, navigation }: Props) {
  const { code } = route.params;
  const join = useJoinByCode();
  const joinedRef = useRef(false);

  const onConfirmed = useCallback(() => {
    if (joinedRef.current) return; // the confirm effect fires once, but guard anyway
    joinedRef.current = true;
    void (async () => {
      try {
        const result = await join.mutateAsync(code);
        if (!result) {
          toast.error('That code didn’t match a circle.');
          navigation.goBack();
        } else if (result.status === 'approved') {
          navigation.replace('CircleDetail', { circleId: result.circleId });
        } else {
          // Private circle: pending the owner's approval — nothing to open yet.
          toast.success(`Request sent to join “${result.name}.” You’ll get in once the owner approves.`);
          navigation.goBack();
        }
      } catch {
        joinedRef.current = false; // the join call failed — allow a retry
        toast.error('We couldn’t join that circle. Please try again.');
      }
    })();
  }, [code, join, navigation]);

  return (
    <EmailConfirmationScreen
      embedded
      onConfirmed={onConfirmed}
      onBack={() => navigation.goBack()}
    />
  );
}
