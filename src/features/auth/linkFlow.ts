/**
 * Account linking flows (client revisions 10/14 p.15-16 and p.19, N4). Never merged automatically:
 * the person first proves it's them the way the existing account was created, and only then is the
 * new sign-in ADDED to it, by that account itself (linkIdentity). Nothing is removed: the password,
 * Google and Apple all keep working side by side and all open the same single account.
 *
 *   Email + password account, signing in with Google or Apple  → its password, then link (p.15-16)
 *   Google account, signing in with Apple (and Apple + Google) → re-authenticate through the
 *                                                                original provider, then link
 *   Google / Apple account, signing in with email + password   → re-authenticate through it, THEN
 *                                                                set a new password (p.16)
 *   No match (Apple "Hide My Email"), "Already have a LYSM account?" → sign in the usual way, then
 *                                                                link (p.16)
 *
 * The existing account is signed in on a separate auth client (linkApi.createLinkClient), so the
 * app's own session (the onboarding's anonymous one, or none) changes only once, at the end. From
 * onboarding the person then continues in their existing account, like a returning user.
 */
import { Alert } from 'react-native';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { isGoogleNativeConfigured } from '@lib';
import { forgetAppleName } from '@store/appleName';
import type { Database } from '@app-types/database';
import {
  adoptSession,
  checkProviderToken,
  confirmLink,
  createLinkClient,
  emailSignInMethod,
  setLinkPassword,
  type LinkProblem,
} from './linkApi';
import {
  isAccountLinkRequired,
  useAccountLinkStore,
  type LinkAttempt,
  type LinkOrigin,
  type PendingLink,
  type SocialProviderId,
} from './linking';
import { HAVE_ACCOUNT_TITLE, haveAccountMessage } from './linkMessages';
import {
  continueAsNewAccount,
  googleBrowserSession,
  reauthenticateWithProvider,
} from './social';
import { signInWithPassword } from './api';

type LinkClient = SupabaseClient<Database>;

/** A step of the linking flow didn't work; `reason` picks the message (linkProblemMessage). */
export class LinkFlowError extends Error {
  readonly reason: LinkProblem | 'no_account' | 'wrong_password';
  constructor(reason: LinkProblem | 'no_account' | 'wrong_password') {
    super(`Account link step failed (${reason})`);
    this.name = 'LinkFlowError';
    this.reason = reason;
  }
}

/** 'linked' = the new sign-in was added; 'signed_in' = the account is open but it wasn't added. */
export type LinkResult = 'linked' | 'signed_in';

/**
 * The existing account is signed in on `client`: add the stopped sign-in to it, then make that the
 * app's session. If adding fails, the person already proved it's them, so the account opens anyway
 * (they can add it next time).
 */
async function addAndOpen(client: LinkClient, attempt: LinkAttempt): Promise<LinkResult> {
  const { data, error } = await client.auth.linkIdentity({
    provider: attempt.provider,
    token: attempt.idToken,
  });
  const session =
    (!error && data.session) || (await client.auth.getSession()).data.session;
  if (!session) throw new LinkFlowError('unknown');
  await adoptSession(session);
  useAccountLinkStore.getState().clear();
  // The Apple ID now opens an account that already has its own name: no need to keep Apple's.
  if (!error && attempt.provider === 'apple' && attempt.appleUserId) {
    await forgetAppleName(attempt.appleUserId);
  }
  return error ? 'signed_in' : 'linked';
}

function attemptOf(link: PendingLink): LinkAttempt {
  if (link.kind === 'set_password') throw new LinkFlowError('unknown');
  return link.attempt;
}

/** Email + password account: its password proves it's them (p.15). `email` = the account's email. */
export async function linkWithPassword(
  link: PendingLink,
  email: string,
  password: string,
): Promise<LinkResult> {
  const attempt = attemptOf(link);
  const client = createLinkClient();
  const { error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) {
    const invalid = /invalid (login )?credentials/i.test(error.message);
    throw new LinkFlowError(invalid ? 'wrong_password' : 'unknown');
  }
  return addAndOpen(client, attempt);
}

/** A Google sign-in made in the in-app browser, then set on the link client. */
async function browserGoogleOn(client: LinkClient, email?: string): Promise<string> {
  const { accessToken, refreshToken } = await googleBrowserSession(email);
  const { error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw new LinkFlowError('unknown');
  return accessToken;
}

/**
 * Google / Apple only account: re-authenticate through the provider it was created with (p.15-16).
 * The server confirms that sign-in IS this account before the app signs in with it, so a different
 * Google account or Apple ID can never be signed in, created or linked here.
 */
async function signInWithOriginal(
  client: LinkClient,
  provider: SocialProviderId,
  email: string,
): Promise<void> {
  if (provider === 'google' && !isGoogleNativeConfigured) {
    const accessToken = await browserGoogleOn(client, email);
    const res = await confirmLink(
      email,
      { provider: 'google', access_token: accessToken },
      true,
    );
    if (!res.ok) throw new LinkFlowError(res.reason);
    return;
  }
  const proof = await reauthenticateWithProvider(provider, email);
  if (!('id_token' in proof)) throw new LinkFlowError('unknown');
  const res = await confirmLink(email, proof);
  if (!res.ok) throw new LinkFlowError(res.reason);
  const { error } = await client.auth.signInWithIdToken({
    provider,
    token: proof.id_token,
  });
  if (error) throw new LinkFlowError('unknown');
}

/** A browser Google sign-in that just created an account (nobody had that Google account). */
function isBrandNewAccount(user: User | null | undefined): boolean {
  if (!user) return true;
  const providers = (user.identities ?? []).map((i) => i.provider);
  const created = Date.parse(user.created_at);
  const lastSignIn = Date.parse(user.last_sign_in_at ?? user.created_at);
  return (
    providers.every((p) => p === 'google') &&
    Number.isFinite(created) &&
    lastSignIn - created < 60_000
  );
}

/**
 * "Already have a LYSM account?" → yes: sign in to it with Google or Apple. Only an account that
 * already has that sign-in is used; nothing new is created or matched by email here.
 */
async function signInExistingOn(
  client: LinkClient,
  provider: SocialProviderId,
): Promise<void> {
  if (provider === 'google' && !isGoogleNativeConfigured) {
    await browserGoogleOn(client);
    const { data } = await client.auth.getUser();
    if (isBrandNewAccount(data.user)) {
      await client.auth.signOut().catch(() => undefined);
      throw new LinkFlowError('no_account');
    }
    return;
  }
  const proof = await reauthenticateWithProvider(provider);
  if (!('id_token' in proof)) throw new LinkFlowError('unknown');
  const check = await checkProviderToken(provider, proof.id_token);
  if (check.status !== 'existing') throw new LinkFlowError('no_account');
  const { error } = await client.auth.signInWithIdToken({
    provider,
    token: proof.id_token,
  });
  if (error) throw new LinkFlowError('unknown');
}

/**
 * Prove it's them with a provider, then add the stopped sign-in: the existing account's original
 * provider (`link`), or the provider the person picked ("Already have a LYSM account?").
 */
export async function linkWithProvider(
  link: PendingLink,
  provider: SocialProviderId,
): Promise<LinkResult> {
  const attempt = attemptOf(link);
  const client = createLinkClient();
  if (link.kind === 'link') await signInWithOriginal(client, provider, link.email);
  else await signInExistingOn(client, provider);
  return addAndOpen(client, attempt);
}

/**
 * Google / Apple account signing in with email + password, step 1: re-authenticate through that
 * provider. Resolves with the ticket that allows step 2; nothing is set before this succeeds (p.16).
 */
export async function confirmForNewPassword(
  link: Extract<PendingLink, { kind: 'set_password' }>,
): Promise<string> {
  const proof = await reauthenticateWithProvider(link.provider, link.email);
  const res = await confirmLink(link.email, proof);
  if (!res.ok) throw new LinkFlowError(res.reason);
  if (!res.ticket) throw new LinkFlowError('has_password');
  return res.ticket;
}

/**
 * Step 2: the brand new password (p.16). Then this phone signs in with it; the account keeps its
 * Google / Apple sign-in. 'set_only' = the password is set but signing in with it didn't work.
 */
export async function finishNewPassword(
  email: string,
  ticket: string,
  password: string,
): Promise<'signed_in' | 'set_only'> {
  const res = await setLinkPassword(email, ticket, password);
  if (!res.ok) throw new LinkFlowError(res.reason);
  useAccountLinkStore.getState().clear();
  try {
    await signInWithPassword({ email, password });
    return 'signed_in';
  } catch {
    return 'set_only';
  }
}

/**
 * An email + password attempt hit an existing account (sign-up: that email is taken; Sign In: the
 * password didn't match). A Google / Apple only account gets "re-authenticate through it, then set
 * a new password" (p.16): stored and opened ('opened'). 'none' = an account with a password, or no
 * account (never told apart); 'unknown' = no answer (offline, not deployed yet).
 */
export async function startEmailAccountLink(
  email: string,
  origin: LinkOrigin,
  openLinkScreen: () => void,
): Promise<'opened' | 'none' | 'unknown'> {
  const method = await emailSignInMethod(email);
  if (method.status !== 'provider_only') return method.status;
  useAccountLinkStore.getState().set({
    kind: 'set_password',
    origin,
    email: email.trim().toLowerCase(),
    provider: method.provider,
  });
  openLinkScreen();
  return 'opened';
}

/** Ask "Already have a LYSM account?" (p.16). Resolves with the person's choice. */
function askHaveAccount(
  link: Extract<PendingLink, { kind: 'fallback' }>,
): Promise<'link' | 'new' | 'cancel'> {
  return new Promise((resolve) => {
    Alert.alert(
      HAVE_ACCOUNT_TITLE,
      haveAccountMessage(link),
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
        { text: 'No, create one', onPress: () => resolve('new') },
        { text: 'Yes, sign in', onPress: () => resolve('link') },
      ],
      { cancelable: true, onDismiss: () => resolve('cancel') },
    );
  });
}

export type LinkOutcome =
  /** "Link your account" was opened. */
  | { kind: 'opened' }
  /** The person cancelled: nothing happened. */
  | { kind: 'cancelled' }
  /** The person chose to create a new account and it was created: go on as after a sign-up. */
  | { kind: 'created'; appleName: string | null };

/**
 * A sign-in stopped because it may belong to an existing account: open "Link your account", or,
 * when no account matched, ask "Already have a LYSM account?" first. Null for any other error.
 */
export async function resolveAccountLink(
  error: unknown,
  openLinkScreen: () => void,
): Promise<LinkOutcome | null> {
  if (!isAccountLinkRequired(error)) return null;
  const link = error.link;
  if (link.kind !== 'fallback') {
    openLinkScreen();
    return { kind: 'opened' };
  }
  const choice = await askHaveAccount(link);
  if (choice === 'link') {
    openLinkScreen();
    return { kind: 'opened' };
  }
  useAccountLinkStore.getState().clear();
  if (choice === 'cancel') return { kind: 'cancelled' };
  return { kind: 'created', appleName: await continueAsNewAccount(link) };
}
