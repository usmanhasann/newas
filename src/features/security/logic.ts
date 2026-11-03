/**
 * What the Sign-in & Security screen offers for an account (client revisions 10/14 p.17-21). Pure,
 * so every rule is unit-tested:
 *  - Email: an account with a password changes it (current password first). A Google / Apple only
 *    account can't: the provider controls it. The one exception is an Apple "Hide My Email" relay
 *    address, which can be replaced with a real email (after signing in with Apple again).
 *  - Password: "Password" (change it) when the account has one, else "Set a password" (after
 *    signing in again with the provider the account was created with).
 */
import type { SignInMethods } from './api';

export type SocialProvider = 'google' | 'apple';

export interface SecurityView {
  email: string | null;
  hasPassword: boolean;
  /** The Google / Apple sign-in the account was created with (the oldest one), or null. */
  originalProvider: SocialProvider | null;
  /** The email is an Apple "Hide My Email" relay address. */
  relay: boolean;
  /** change: with the current password. relay: replace the Apple relay address. readonly: no. */
  emailMode: 'change' | 'relay' | 'readonly';
  /** change: "Password". set: "Set a password" (needs originalProvider). */
  passwordMode: 'change' | 'set';
}

/** Apple "Hide My Email" relay addresses end in privaterelay.appleid.com (p.20). */
export function isAppleRelayEmail(email: string | null | undefined): boolean {
  return !!email && /@privaterelay\.appleid\.com$/i.test(email.trim());
}

export function securityView(m: SignInMethods): SecurityView {
  const original =
    (m.providers.find((p) => p === 'google' || p === 'apple') as
      | SocialProvider
      | undefined) ?? null;
  const relay = isAppleRelayEmail(m.email);
  const emailMode = m.hasPassword
    ? 'change'
    : relay && m.providers.includes('apple')
      ? 'relay'
      : 'readonly';
  return {
    email: m.email,
    hasPassword: m.hasPassword,
    originalProvider: original,
    relay,
    emailMode,
    passwordMode: m.hasPassword ? 'change' : 'set',
  };
}
