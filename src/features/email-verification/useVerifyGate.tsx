/**
 * Reusable email-verification gate for CIRCLE interactions: the backstop (client revisions 10/14
 * p.18). Email sign-ups verify by code before the paywall and older accounts are asked when the app
 * opens; this check stays for anyone who still reaches a circle unverified. It is enforced
 * only when a user acts in a circle — joining, sharing an entry, or reacting — never tied to a
 * screen or step. Social (Apple/Google) and anonymous accounts have no email identity and always
 * pass; an email account that isn't verified yet is sent to the shared EmailConfirmationScreen (in
 * a modal) and the gated action resumes automatically once they confirm.
 *
 * Journaling itself is NEVER gated: callers save the private entry first and gate only the share.
 * This mirrors the circle-JOIN gate (JoinByCodeCard) so all circle entry points behave identically.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Modal } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@store/session';
import { EmailConfirmationScreen } from './screens/EmailConfirmationScreen';
import { useEmailVerified, emailVerifyKeys } from './hooks';
import { checkVerified } from './api';

type GateAction = () => void | Promise<void>;
type Pending = { onConfirmed: GateAction; onCancel?: () => void };

export interface VerifyGate {
  /** Cached-or-fresh verification check, no UI. Resolves true when it's OK to act now — a
   *  verified email account, or a social / anonymous account with no email identity. */
  check: () => Promise<boolean>;
  /** Open the gate immediately; run `onConfirmed` after a successful verification, or `onCancel`
   *  if the user backs out. Use when the caller has already decided a gate is needed (e.g. it
   *  saved a private entry first and only the share must wait). */
  openVerify: (onConfirmed: GateAction, onCancel?: () => void) => void;
  /** check() → run `action` now if verified, else open the gate and resume it on success. The
   *  one-shot path for atomic actions (e.g. a reaction). */
  requireVerified: (action: GateAction) => Promise<void>;
  /** Render this once in the consuming screen — the verification modal (null until opened). */
  gate: ReactNode;
}

export function useVerifyGate(): VerifyGate {
  const user = useCurrentUser();
  const verified = useEmailVerified();
  const qc = useQueryClient();
  const [pending, setPending] = useState<Pending | null>(null);

  const check = useCallback(async (): Promise<boolean> => {
    // Only email/password accounts must verify. Social (Apple/Google) are provider-verified and
    // anonymous users have no email identity — both always pass. (Matches JoinByCodeCard.)
    const hasEmailIdentity = !!user?.identities?.some((i) => i.provider === 'email');
    if (!hasEmailIdentity || !user?.id) return true;
    if (verified.data === true) return true; // cached verified → no network round-trip
    try {
      return await checkVerified(user.id); // may have verified (e.g. on another device) since the app loaded
    } catch {
      return false; // network error → gate rather than let an unverified action slip through
    }
  }, [user, verified.data]);

  const openVerify = useCallback((onConfirmed: GateAction, onCancel?: () => void) => {
    setPending({ onConfirmed, onCancel });
  }, []);

  const requireVerified = useCallback(
    async (action: GateAction) => {
      if (await check()) {
        await action();
        return;
      }
      setPending({ onConfirmed: action });
    },
    [check],
  );

  const onConfirmed = useCallback(() => {
    const p = pending;
    setPending(null);
    // They just verified — prime the cached flag so later actions this session skip the check.
    if (user?.id) qc.setQueryData(emailVerifyKeys.status(user.id), true);
    if (p) void p.onConfirmed();
  }, [pending, qc, user]);

  const onClose = useCallback(() => {
    const p = pending;
    setPending(null);
    p?.onCancel?.();
  }, [pending]);

  // Mount the confirmation screen only while the gate is open, so its on-mount verification
  // check + AppState listener stay dormant until actually needed.
  const gate = useMemo<ReactNode>(
    () =>
      pending ? (
        <Modal visible animationType="slide" onRequestClose={onClose}>
          <EmailConfirmationScreen embedded onConfirmed={onConfirmed} onBack={onClose} />
        </Modal>
      ) : null,
    [pending, onConfirmed, onClose],
  );

  return { check, openVerify, requireVerified, gate };
}
