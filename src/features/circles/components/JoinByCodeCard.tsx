/**
 * "Invite Code" card at the top of the Join a Circle page, styled like Home's "Today's Moods"
 * card. The join-by-code flow is unchanged from the old standalone "Join with a code" screen:
 * email/password accounts must verify before joining (social accounts are provider-verified).
 */
import { useState } from 'react';
import { Button, Card, Text, TextField } from '@components';
import { useCurrentUser } from '@store/session';
import { toast } from '@store/toast';
import { checkVerified, useEmailVerified } from '@features/email-verification';
import { CircleArchivedError } from '../api';
import { useJoinByCode } from '../hooks';

export interface JoinByCodeCardProps {
  /** Joined straight away (public circle) → open it. */
  onJoined: (circleId: string) => void;
  /** Private circle: the request is pending the owner's approval — nothing to open yet. */
  onRequested: () => void;
  /** Unverified email account → the verify-to-join gate, which resumes this code's join. */
  onNeedsVerification: (code: string) => void;
}

export function JoinByCodeCard({
  onJoined,
  onRequested,
  onNeedsVerification,
}: JoinByCodeCardProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [checking, setChecking] = useState(false);
  const join = useJoinByCode();

  const user = useCurrentUser();
  // Only email/password accounts must verify before joining. Social (Apple/Google) users are
  // provider-verified and have no email identity here; anonymous users can't reach this screen.
  const hasEmailIdentity = !!user?.identities?.some((i) => i.provider === 'email');
  const verified = useEmailVerified();

  const runJoin = async (c: string) => {
    let result: Awaited<ReturnType<typeof join.mutateAsync>>;
    try {
      result = await join.mutateAsync(c);
    } catch (e) {
      // Never fail silently (a server error here once left people with a spinner and nothing
      // else): say it didn't work, keep the code in the field, and let them try again. An archived
      // circle takes no one new (client 10/14 p.23), so trying again won't help: say that instead.
      setError(
        e instanceof CircleArchivedError
          ? e.message
          : 'We couldn’t join that circle. Check your connection and try again.',
      );
      return;
    }
    if (!result) {
      setError('That code didn’t match a circle. Double-check it and try again.');
    } else if (result.status === 'approved') {
      onJoined(result.circleId);
    } else {
      toast.success(
        `Request sent to join “${result.name}.” You’ll get in once the owner approves.`,
      );
      onRequested();
    }
  };

  const onJoin = async () => {
    setError(undefined);
    const c = code.trim();
    if (!c) return;

    // Email accounts must be verified to join a circle. The cached flag resolves the common
    // case instantly (already verified — the email went out at sign-up); otherwise do a fresh
    // server check (they may have verified via the link since the app loaded). Only when still
    // unverified do we gate — routing to the verify screen, which resumes the join on success.
    if (hasEmailIdentity && verified.data !== true && user?.id) {
      setChecking(true);
      let ok = false;
      try {
        ok = await checkVerified(user.id);
      } catch {
        ok = false;
      }
      setChecking(false);
      if (!ok) {
        onNeedsVerification(c);
        return;
      }
    }
    await runJoin(c);
  };

  return (
    <Card>
      <Text variant="section">Invite Code</Text>
      <Text variant="bodyMuted" className="mt-1">
        Enter the invite code someone shared with you.
      </Text>
      <TextField
        containerClassName="mt-3"
        accessibilityLabel="Invite code"
        value={code}
        onChangeText={setCode}
        placeholder="e.g. A1B2C3D4"
        autoCapitalize="characters"
        autoCorrect={false}
        error={error}
        returnKeyType="go"
        onSubmitEditing={onJoin}
      />
      <Button
        title="Join Circle"
        className="mt-4"
        disabled={!code.trim() || join.isPending || checking}
        loading={join.isPending || checking}
        onPress={onJoin}
      />
    </Card>
  );
}
