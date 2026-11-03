/**
 * Account linking across Email, Google and Apple (client revisions 10/14 p.15-16 and p.19, N4):
 * the shared types and the in-memory "pending link" the Link your account screen works on.
 *
 * A sign-in whose email is already on another LYSM account is never merged automatically (p.15):
 * the sign-in functions (social.ts) stop and throw AccountLinkRequired, and the person first proves
 * it's them with the way that account was created (its password, else its original Google / Apple),
 * then the new sign-in is ADDED to it. The provider token of the attempt is kept only here, in memory
 * (never persisted, never in navigation state), until the link finishes or is cancelled.
 */
import { create } from 'zustand';

export type SocialProviderId = 'google' | 'apple';
/** How the existing account proves it's the same person (p.15). */
export type LinkMethod = 'password' | SocialProviderId;
/** Where the person started: Sign In, or the onboarding "Save your progress" step. */
export type LinkOrigin = 'signin' | 'onboarding';

/** The Google / Apple sign-in that is waiting to be added to an existing account. */
export interface LinkAttempt {
  provider: SocialProviderId;
  idToken: string;
  /** The provider's email (lower case), or null when it shared none. */
  email: string | null;
  /** Apple only: its user id and the one-time name it shared, if any (kept for "create one"). */
  appleUserId?: string;
  appleName?: string | null;
}

export type PendingLink =
  /** The email is on an existing account: prove it's you with `method`, then add the attempt. */
  | {
      kind: 'link';
      origin: LinkOrigin;
      attempt: LinkAttempt;
      email: string;
      method: LinkMethod;
    }
  /**
   * No account matched (e.g. Apple "Hide My Email", p.16) and the person said they already have
   * one: sign in to it the way they usually do, then add the attempt.
   */
  | { kind: 'fallback'; origin: LinkOrigin; attempt: LinkAttempt; relay: boolean }
  /**
   * An email + password sign-in on a Google / Apple only account: re-authenticate through that
   * provider, THEN set a new password (p.16).
   */
  | {
      kind: 'set_password';
      origin: LinkOrigin;
      email: string;
      provider: SocialProviderId;
    };

interface AccountLinkState {
  pending: PendingLink | null;
  set: (pending: PendingLink) => void;
  clear: () => void;
}

export const useAccountLinkStore = create<AccountLinkState>((set) => ({
  pending: null,
  set: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));

/**
 * Thrown by a sign-in that must not go on by itself: the pending link is already stored, so the
 * screen only has to open "Link your account" (or, for `fallback`, ask first).
 */
export class AccountLinkRequired extends Error {
  readonly link: PendingLink;
  constructor(link: PendingLink) {
    super('This sign-in needs to be linked to an existing account first');
    this.name = 'AccountLinkRequired';
    this.link = link;
  }
}

export function isAccountLinkRequired(error: unknown): error is AccountLinkRequired {
  return error instanceof AccountLinkRequired;
}

/** Store the pending link and stop the sign-in: the caller opens the linking flow. */
export function requireLink(link: PendingLink): never {
  useAccountLinkStore.getState().set(link);
  throw new AccountLinkRequired(link);
}
