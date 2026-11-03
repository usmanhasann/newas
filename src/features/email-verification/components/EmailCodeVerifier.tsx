/**
 * The 6-digit email code step for an email + password account (client revisions 10/14 p.18): used
 * right after Create Account in onboarding (before the paywall), by the "verify your email" screen
 * older accounts see when the app opens, and by the circle check (backstop).
 *
 * On open it makes sure a code went out ('ensure': one that still works is never replaced, so
 * coming back to the screen doesn't invalidate the code being typed). "Resend code" has a cooldown;
 * "Wrong email? Change it." fixes a typo on the unverified account and sends a fresh code to the new
 * address. Codes expire, work once and lock after wrong tries (the server decides; the message
 * says what to do). On success the cached flag is set and `onVerified` runs once.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Button, CODE_LENGTH, CodeField, Text, TextField } from '@components';
import { cn } from '@utils/cn';
import { toast } from '@store/toast';
import { useCurrentUser } from '@store/session';
import { useEmailVerifyStore } from '@store/emailVerify';
import {
  CODE_HINT,
  codeProblemMessage,
  emailSchema,
  oneTimeCodeSchema,
} from '@features/auth';
import * as api from '../api';
import { emailVerifyKeys } from '../hooks';
import { sendProblemMessage } from '../messages';

export interface EmailCodeVerifierProps {
  /** Runs once, when the account's email is verified (also when it already was). */
  onVerified: () => void;
}

export function EmailCodeVerifier({ onVerified }: EmailCodeVerifierProps) {
  const user = useCurrentUser();
  const userId = user?.id;
  const qc = useQueryClient();
  const lastSentAt = useEmailVerifyStore((s) => s.lastSentAt);
  const setLastSentAt = useEmailVerifyStore((s) => s.setLastSentAt);

  const [email, setEmail] = useState(user?.email ?? '');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [checking, setChecking] = useState(false);
  // True from the start: opening the step makes sure a code went out (below).
  const [sending, setSending] = useState(true);
  const [changing, setChanging] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newEmailError, setNewEmailError] = useState<string | undefined>();
  const [now, setNow] = useState(() => Date.now());
  const done = useRef(false);

  const cooldown = api.cooldownRemaining(lastSentAt, now);
  const resendDisabled = sending || cooldown > 0;

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    if (userId) qc.setQueryData(emailVerifyKeys.status(userId), true);
    useEmailVerifyStore.getState().reset();
    onVerified();
  }, [onVerified, qc, userId]);

  /** Apply a send answer to the screen. `announce`: say a new code went out (Resend / new email). */
  const applySend = useCallback(
    (res: api.RequestResult, announce: boolean) => {
      if (res.ok) {
        if (res.email) setEmail(res.email);
        if (res.status === 'already_verified') {
          finish();
          return;
        }
        setNotice(undefined);
        if (res.status === 'sent') {
          setLastSentAt(Date.now());
          if (announce) toast.success(`We sent a new code to ${res.email ?? email}.`);
        }
        return;
      }
      if (
        res.reason === 'too_many' &&
        res.retryAfter !== undefined &&
        res.retryAfter <= api.RESEND_COOLDOWN_SECONDS
      ) {
        // Line the countdown up with the server's.
        setLastSentAt(Date.now() - (api.RESEND_COOLDOWN_SECONDS - res.retryAfter) * 1000);
      }
      setNotice(sendProblemMessage(res.reason));
    },
    [email, finish, setLastSentAt],
  );

  // Make sure a code went out (keeps one that still works).
  useEffect(() => {
    let active = true;
    void api
      .requestVerificationCode({ mode: 'ensure' })
      .then((res) => {
        if (active) applySend(res, false);
      })
      .finally(() => {
        if (active) setSending(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1s ticker for the resend countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const onVerify = async () => {
    if (checking) return;
    const parsed = oneTimeCodeSchema.safeParse(code);
    if (!parsed.success) {
      setCodeError(parsed.error.issues[0]?.message);
      return;
    }
    setChecking(true);
    setCodeError(undefined);
    try {
      const res = await api.confirmVerificationCode(parsed.data);
      if (res.ok) finish();
      else setCodeError(codeProblemMessage(res.reason, res.attemptsLeft));
    } finally {
      setChecking(false);
    }
  };

  const onResend = async () => {
    if (resendDisabled) return;
    setSending(true);
    setCode('');
    setCodeError(undefined);
    try {
      applySend(await api.requestVerificationCode({ mode: 'resend' }), true);
    } finally {
      setSending(false);
    }
  };

  const onSendToNewEmail = async () => {
    if (sending) return;
    const parsed = emailSchema.safeParse(newEmail);
    if (!parsed.success) {
      setNewEmailError(parsed.error.issues[0]?.message);
      return;
    }
    setSending(true);
    setNewEmailError(undefined);
    try {
      const res = await api.requestVerificationCode({
        mode: 'resend',
        email: parsed.data,
      });
      if (!res.ok && (res.reason === 'email_taken' || res.reason === 'invalid_email')) {
        setNewEmailError(sendProblemMessage(res.reason));
        return;
      }
      if (res.ok) {
        await api.refreshSession().catch(() => undefined); // the session now carries the new email
        setEmail(res.email ?? parsed.data);
        setChanging(false);
        setNewEmail('');
        setCode('');
        setCodeError(undefined);
      }
      applySend(res, res.ok);
    } finally {
      setSending(false);
    }
  };

  if (changing) {
    return (
      <View className="gap-4">
        <Text variant="bodyMuted">
          Enter the right email and we’ll send a new code to it.
        </Text>
        <TextField
          label="Email"
          value={newEmail}
          onChangeText={(t) => {
            setNewEmail(t);
            setNewEmailError(undefined);
          }}
          error={newEmailError}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={onSendToNewEmail}
        />
        <Button title="Send code" onPress={onSendToNewEmail} loading={sending} />
        <Pressable
          onPress={() => {
            setChanging(false);
            setNewEmailError(undefined);
          }}
          accessibilityRole="button"
          hitSlop={8}
          className="items-center"
        >
          <Text variant="link">Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="gap-4">
      <Text variant="bodyMuted">
        We sent a 6-digit code to <Text variant="bodyStrong">{email}</Text>. Enter it
        below to confirm your email.
      </Text>
      <CodeField
        value={code}
        onChangeText={(digits) => {
          setCode(digits);
          setCodeError(undefined);
        }}
        error={codeError}
        returnKeyType="done"
        onSubmitEditing={onVerify}
      />
      {notice ? (
        <Text
          variant="caption"
          className="text-danger-strong"
          accessibilityLiveRegion="polite"
        >
          {notice}
        </Text>
      ) : null}
      <Button
        title="Verify"
        onPress={onVerify}
        loading={checking}
        disabled={code.length !== CODE_LENGTH}
      />
      <View className="items-center gap-3">
        <Pressable
          onPress={onResend}
          disabled={resendDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: resendDisabled }}
          hitSlop={8}
          className={cn(resendDisabled && 'opacity-50')}
        >
          <Text variant="link">Resend code</Text>
        </Pressable>
        {cooldown > 0 ? (
          <Text variant="caption">You can ask for a new code in {cooldown}s.</Text>
        ) : null}
        <Pressable
          onPress={() => {
            setChanging(true);
            setNewEmail('');
          }}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text variant="link">Wrong email? Change it.</Text>
        </Pressable>
      </View>
      <Text variant="caption" className="text-center">
        {CODE_HINT}
      </Text>
    </View>
  );
}
