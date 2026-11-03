/**
 * Social sign-in for onboarding (spec §3). Both providers LINK to the current ANONYMOUS
 * session (Supabase manual linking) so the user's onboarding answers + first entry carry
 * over — never a fresh, empty user (§18). Provider-verified, so the app's email-verify
 * step is skipped (§16).
 *
 * APPLE = NATIVE. App Store review rejects "Sign in with Apple" shown in a web browser; it
 * must use the native AuthenticationServices sheet (expo-apple-authentication). We link its
 * id token via linkIdentity's native id-token overload (no nonce needed for the Expo flow).
 *
 * GOOGLE = NATIVE when configured (@react-native-google-signin), else the in-app browser
 * OAuth flow as a fallback. Native gives Google's own dialog and is linked via the native
 * id-token overload. The fallback (ASWebAuthenticationSession) is still in-app + Apple-safe.
 *
 * SIGN-IN vs SIGN-UP: the functions above (signInWithApple/Google) are the NEW-USER path —
 * they LINK the provider to the anonymous onboarding session. The `signInExistingWith*`
 * functions at the bottom are the EXISTING-USER path (Welcome → Sign In): they authenticate
 * into the user's real account via signInWithIdToken / OAuth (NOT link — link errors when the
 * identity already belongs to an account), switching the session away from the anon user.
 *
 * ACCOUNT LINKING (client 10/14 p.15-16, N4): the auth server links a Google / Apple sign-in to an
 * existing account with the same email BY ITSELF (that can't be switched off). So every native
 * Google / Apple token first goes to the account-link pre-check (linkApi.checkProviderToken), and
 * the token reaches the auth server only when it is already on an account ("existing") or belongs
 * to nobody ("new"). When its email is on another account the sign-in stops with
 * AccountLinkRequired: the person proves it's them with that account's password or original
 * provider, then the sign-in is ADDED to it (linkFlow.ts). Never merged automatically. When no
 * account matches on Sign In, or Apple hid the email, the person is asked "Already have a LYSM
 * account?" before a second account is created. The browser Google fallback can't be checked first
 * (the auth server finishes it), so it behaves as before until native Google is configured.
 *
 * CONFIG STATUS (Supabase project eavljsrtsyfhusqahxgk):
 *   • Anonymous sign-ins + "Manual linking": ENABLED.
 *   • Apple provider: ENABLED (2026-09-07) — native id-token flow, client_id = the bundle id
 *     `com.lysm.app`; no Services ID / secret / Apple key needed (those are only for web OAuth,
 *     which Apple here never uses). Works on the existing build (entitlement already shipped) —
 *     just verify "Continue with Apple" on a real iOS device.
 *   • Google provider: ENABLED (2026-09-07) via the BROWSER OAuth flow — a Web OAuth client in
 *     the Google Cloud project "LYSM" is set as external_google_client_id/secret, and the app's
 *     redirect `innercircle://auth-callback` is in Supabase's uri_allow_list. Works on the existing
 *     build (isGoogleNativeConfigured=false → signInWithGoogleBrowser, no rebuild). The Google
 *     consent screen is in TESTING mode → only test users can sign in until the app is PUBLISHED
 *     (needs a privacy-policy + home-page URL) or the tester's Google email is added as a test user.
 * TODO(optional — NATIVE Google, nicer UX, needs a REBUILD):
 *   • Add iOS + Android OAuth clients; set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID + _IOS_CLIENT_ID +
 *     _IOS_URL_SCHEME, enable "Skip nonce check" on the Google provider, then rebuild.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { User } from '@supabase/supabase-js';
import { supabase, isGoogleNativeConfigured } from '@lib';
import { usePendingNameStore } from '@store/pendingName';
import { forgetAppleName, recallAppleName, rememberAppleName } from '@store/appleName';
import { googleNativeIdToken } from './googleNative';
import { checkProviderToken } from './linkApi';
import {
  requireLink,
  type LinkAttempt,
  type LinkOrigin,
  type PendingLink,
} from './linking';

/** The redirect the Google browser fallback returns to (captured by openAuthSessionAsync). */
export const oauthRedirectTo = Linking.createURL('auth-callback');

/**
 * Recognises GoTrue's "this provider identity already belongs to an account" error so the
 * sign-up (link) path can fall back to signing the user IN instead of dead-ending. Supabase
 * reports it as code `identity_already_exists` (and phrasings like "already linked"/"in use").
 */
function isIdentityAlreadyLinked(error: { code?: string; message?: string }): boolean {
  return (
    error.code === 'identity_already_exists' ||
    /already.*(linked|registered|associated|in use|exist)/i.test(error.message ?? '')
  );
}

/**
 * True for a USER-INITIATED cancel of a native sign-in sheet — Apple throws
 * `ERR_REQUEST_CANCELED`, the Google helpers throw a "canceled" error. Callers should return
 * silently (no error toast) rather than telling the user something went wrong.
 */
export function isUserCanceledSignIn(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null | undefined;
  return e?.code === 'ERR_REQUEST_CANCELED' || /cancel/i.test(e?.message ?? '');
}

/**
 * The name Apple shares in the sign-in response ("Konah Quittman"), or null. Apple includes it
 * ONLY on the very first authorization an Apple ID ever grants this app; every later sign-in
 * returns no name, permanently. So it must be captured the moment it arrives (client 10/14, p.10).
 */
function appleFullName(
  credential: AppleAuthentication.AppleAuthenticationCredential,
): string | null {
  const name = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name || null;
}

/**
 * Save Apple's one-time name on the signed-in account (auth metadata), straight after sign-in, so
 * it survives even if the profile write that follows fails; the profile is filled from it (see
 * profile/api.syncDisplayNameFromAuth, also run on every app start). Retries once; never throws,
 * because a failed name save must not undo a successful sign-in. True when it is saved.
 */
async function saveAppleName(name: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await supabase.auth.updateUser({ data: { display_name: name } });
    if (!error) return true;
  }
  return false;
}

/** What the Apple sheet returned: the identity token, the Apple user id and its one-time name. */
interface AppleCredential {
  token: string;
  appleUserId: string;
  name: string | null;
}

/**
 * The Apple sheet. A shared name is kept on the phone for that Apple ID right away (appleName.ts);
 * a later attempt from the same Apple ID that comes back without a name (because an earlier attempt
 * failed, or stopped to link, after the sheet) reuses it.
 */
async function appleCredential(): Promise<AppleCredential> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  const token = credential.identityToken;
  if (!token) throw new Error('Apple did not return an identity token');
  const appleUserId = credential.user;
  let name = appleFullName(credential);
  if (name) await rememberAppleName(appleUserId, name);
  else name = await recallAppleName(appleUserId);
  return { token, appleUserId, name };
}

/**
 * `step` (link or sign in with the identity token), keeping Apple's one-time name safe the whole
 * way (client 10/14 p.10: it "can't be fixed after the fact"):
 *  1. It is held in memory BEFORE the session switches (usePendingNameStore), so whatever fills the
 *     profile right after the switch already has it; on success it is claimed for the signed-in
 *     account, on failure dropped from memory (the phone copy stays for the retry).
 *  2. It is saved on the account; only then is the phone copy deleted.
 * Resolves with the name (or null when Apple shared none, now or before).
 */
async function finishAppleSignIn(
  credential: AppleCredential,
  step: (token: string) => Promise<void>,
): Promise<string | null> {
  const { token, appleUserId, name } = credential;
  usePendingNameStore.getState().set(name);
  try {
    await step(token);
  } catch (e) {
    usePendingNameStore.getState().clear();
    throw e;
  }
  const { data } = await supabase.auth.getSession();
  usePendingNameStore.getState().claim(data.session?.user.id ?? null);
  if (name && (await saveAppleName(name))) await forgetAppleName(appleUserId);
  return name;
}

function appleAttempt(credential: AppleCredential): LinkAttempt {
  return {
    provider: 'apple',
    idToken: credential.token,
    email: null,
    appleUserId: credential.appleUserId,
    appleName: credential.name,
  };
}

/**
 * Ask the account-link pre-check what this Google / Apple sign-in would do BEFORE the auth server
 * sees the token (the auth server would link it to an account with the same email by itself).
 *  - "existing": already a way into an account: sign in.
 *  - "new": nobody has it. On Sign In (the person expects an account) or when Apple hid the email
 *    (it can't match one, p.16), stop and ask "Already have a LYSM account?" first.
 *  - "link_required": its email is on another account: stop, the person proves it's them first.
 *  - "unavailable": account-link isn't deployed yet: sign in as before.
 */
async function precheckSignIn(
  attempt: LinkAttempt,
  origin: LinkOrigin,
): Promise<'existing' | 'new' | 'unavailable'> {
  const check = await checkProviderToken(attempt.provider, attempt.idToken);
  switch (check.status) {
    case 'existing':
    case 'unavailable':
      return check.status;
    case 'new':
      if (origin === 'signin' || check.relay) {
        requireLink({ kind: 'fallback', origin, attempt, relay: check.relay });
      }
      return 'new';
    case 'link_required':
      return requireLink({
        kind: 'link',
        origin,
        attempt: { ...attempt, email: check.email },
        email: check.email,
        method: check.method,
      });
    case 'email_unverified':
      throw new SocialSignInError(
        check.side === 'account' ? 'email_unverified' : 'provider_email_unverified',
        'The email on this sign-in is not verified',
      );
    case 'email_in_use':
      throw new SocialSignInError(
        'email_exists',
        'An account with this email already exists',
      );
  }
}

/** Sign in with an Apple identity token (it is already a way into an account, or a new one). */
async function signInWithAppleToken(token: string): Promise<void> {
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token });
  if (error) throw error;
}

/**
 * Link an Apple identity token to the current (anonymous onboarding) session. If this Apple ID is
 * already on an account (a retry after a dropped link response), linkIdentity errors, so sign INTO
 * that account with the same token instead of a permanent "try again" dead end.
 */
async function linkAppleToCurrent(token: string): Promise<void> {
  const { error } = await supabase.auth.linkIdentity({ provider: 'apple', token });
  if (!error) return;
  if (!isIdentityAlreadyLinked(error)) throw error;
  await signInWithAppleToken(token);
}

/** Whether the native Apple sheet is available (iOS 13+ on a real Apple device). */
export async function isAppleAuthAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Native Sign in with Apple, linked to the current (anonymous) session. Native id-token
 * linking — no browser, so it satisfies Apple's native-flow requirement. Resolves with the name
 * Apple shared (first authorization only) so the caller can put it on the profile, else null.
 */
export async function signInWithApple(): Promise<string | null> {
  // "Link if new, sign in if existing" — the single-button Apple pattern. Linking upgrades the
  // anonymous onboarding session; an Apple ID that already belongs to an account (a returning user
  // who tapped "Get Started" instead of "Sign In") signs INTO that account instead. The route gate
  // then lands them on Home/Paywall. An Apple ID whose email is on another account stops here
  // (AccountLinkRequired). Apple's name ends up on whichever account is signed in afterwards.
  const credential = await appleCredential();
  const outcome = await precheckSignIn(appleAttempt(credential), 'onboarding');
  return finishAppleSignIn(
    credential,
    outcome === 'existing' ? signInWithAppleToken : linkAppleToCurrent,
  );
}

/**
 * Delete Account, for an account that uses Sign in with Apple: the user confirms with Apple once and
 * Apple's one-time authorization code (single use, valid five minutes) is sent to delete-account,
 * which revokes the app's Sign in with Apple authorization (App Store rule). No name or email is
 * requested. Throws Apple's cancel error if the user dismisses the sheet (isUserCanceledSignIn).
 */
export async function confirmAppleForDeletion(): Promise<string> {
  const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
  if (!credential.authorizationCode)
    throw new Error('Apple did not return an authorization code');
  return credential.authorizationCode;
}

/** A real (non-anonymous) account that already has Google on it. */
function hasGoogleAccount(user: User | null | undefined): boolean {
  return (
    !!user &&
    !user.is_anonymous &&
    !!user.identities?.some((i) => i.provider === 'google')
  );
}

/**
 * The auth server's "this Google account is already linked" (to this account or another one).
 * Strict on purpose: an email that already has an account ("already been registered") is NOT this,
 * and is never resolved by signing in automatically (client 10/14 p.15: never merge automatically).
 */
function isGoogleAlreadyLinked(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null | undefined;
  return (
    e?.code === 'identity_already_exists' ||
    /identity is already linked/i.test(typeof e?.message === 'string' ? e.message : '')
  );
}

/**
 * The onboarding link answered "this Google account is already linked". Either an earlier attempt
 * already linked it to THIS account and the app missed the answer (then pick up the upgraded
 * account and go on), or it belongs to another LYSM account: sign in to that one, as Apple does
 * (a returning user who tapped Get Started instead of Sign In).
 */
async function whenGoogleAlreadyLinked(
  signInExisting: () => Promise<void>,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (hasGoogleAccount(user)) {
    const { error } = await supabase.auth.refreshSession();
    if (error) throw error;
    return;
  }
  await signInExisting();
}

/** Sign in with a Google id token (it is already a way into an account, or a new one). */
async function signInWithGoogleToken(idToken: string): Promise<void> {
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw error;
}

/** Link a Google id token to the current (anonymous) session; an already linked one signs in. */
async function linkGoogleToCurrent(idToken: string): Promise<void> {
  const { error } = await supabase.auth.linkIdentity({
    provider: 'google',
    token: idToken,
  });
  if (!error) return;
  if (!isGoogleAlreadyLinked(error)) throw error;
  await whenGoogleAlreadyLinked(() => signInWithGoogleToken(idToken));
}

/**
 * Native Google Sign-In, linked to the current (anonymous) session; a Google account already on a
 * LYSM account signs in to it. One whose email is on another account stops (AccountLinkRequired).
 */
async function signInWithGoogleNative(): Promise<void> {
  const idToken = await googleNativeIdToken();
  const outcome = await precheckSignIn(
    { provider: 'google', idToken, email: null },
    'onboarding',
  );
  if (outcome === 'existing') {
    await whenGoogleAlreadyLinked(() => signInWithGoogleToken(idToken));
    return;
  }
  await linkGoogleToCurrent(idToken);
}

/** A sign-in the auth server refused, with its error code (e.g. identity_already_exists). */
export class SocialSignInError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SocialSignInError';
    this.code = code;
  }
}

/** The query and fragment parameters of a sign-in redirect URL, together. */
function redirectParams(url: string): URLSearchParams {
  const [beforeHash = '', fragment = ''] = url.split('#');
  const queryStart = beforeHash.indexOf('?');
  const params = new URLSearchParams(
    queryStart >= 0 ? beforeHash.slice(queryStart + 1) : '',
  );
  new URLSearchParams(fragment).forEach((value, key) => params.set(key, value));
  return params;
}

/**
 * The refusal in a sign-in redirect, or null. `access_denied` with no error_code is the person
 * tapping Cancel on Google's own page, so it is a cancel (no message); the auth server's own
 * access_denied refusals (e.g. a banned user) always carry an error_code.
 */
function redirectError(params: URLSearchParams): Error | null {
  const error = params.get('error');
  if (!error) return null;
  const code = params.get('error_code');
  if (error === 'access_denied' && !code) return new Error('Google sign-in was canceled');
  return new SocialSignInError(code || error, params.get('error_description') || error);
}

/**
 * When the app was closed during Google's in-app browser sign-in (Android can end the app in the
 * background), the redirect reopens it and only the deep-link handler sees it: the refusal it
 * carries, or null when it isn't a Google sign-in redirect, carries none, or the in-app browser
 * sign-in is still running (that one reports its own answer).
 */
export function orphanGoogleRedirectError(url: string): Error | null {
  if (googleBrowserOpen || isReauthRedirect(url)) return null;
  if (!url.split(/[?#]/)[0]?.endsWith('auth-callback')) return null;
  return redirectError(redirectParams(url));
}

/**
 * Finish a Google sign-in from the in-app browser's redirect URL (client 10/14 p.15: no silent
 * failures). This app's auth client uses the implicit flow, so the server answers in the URL
 * FRAGMENT: success = #access_token=…&refresh_token=…, refusal = error=…&error_code=…&
 * error_description=… (fragment or query). A PKCE-style ?code=… is handled too. Before, only
 * ?code= was read: a refusal looked like success, and on iPhone (where only this call sees the
 * redirect) a successful Sign In never took effect. Anything else is an error, never a silent pass.
 */
async function completeOAuthRedirect(url: string): Promise<void> {
  const params = redirectParams(url);
  const refused = redirectError(params);
  if (refused) throw refused;
  const code = params.get('code');
  if (code) {
    const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
    if (exErr) throw exErr;
    return;
  }
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error: setErr } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (setErr) throw setErr;
    return;
  }
  throw new SocialSignInError('no_session', 'Google sign-in did not complete');
}

/** True while Google's in-app browser sign-in is open (see orphanGoogleRedirectError). */
let googleBrowserOpen = false;

/** Open Google's sign-in page in the in-app browser and finish it from the redirect. */
async function runGoogleBrowser(url: string): Promise<void> {
  googleBrowserOpen = true;
  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(url, oauthRedirectTo);
  } finally {
    googleBrowserOpen = false;
  }
  if (result.type !== 'success' || !result.url) {
    throw new Error('Google sign-in was canceled');
  }
  await completeOAuthRedirect(result.url);
}

/** Google via the in-app browser OAuth flow (fallback when native isn't configured). */
async function signInWithGoogleBrowser(): Promise<void> {
  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo: oauthRedirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start Google sign-in');
  try {
    await runGoogleBrowser(data.url);
  } catch (e) {
    if (!isGoogleAlreadyLinked(e)) throw e;
    await whenGoogleAlreadyLinked(signInExistingWithGoogleBrowser);
    return;
  }

  // The onboarding answers live on the anonymous account: only go on once Google is really linked
  // to it, never as a still-anonymous user that looks signed up.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!hasGoogleAccount(user)) {
    throw new SocialSignInError(
      'link_incomplete',
      'Google was not linked to the account',
    );
  }
}

/**
 * Sign in with Google: native dialog when configured, in-app browser otherwise. Nothing to do when
 * this session's account already has Google (a retry after the screen missed an earlier success).
 */
export async function signInWithGoogle(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (hasGoogleAccount(data.session?.user)) return;
  return isGoogleNativeConfigured ? signInWithGoogleNative() : signInWithGoogleBrowser();
}

// ---------------------------------------------------------------------------
// EXISTING-USER sign-in (Welcome → Sign In). These SIGN IN to the real account
// (signInWithIdToken / OAuth) instead of linking to the anon session.
// ---------------------------------------------------------------------------

/**
 * Native Sign in with Apple that authenticates into the user's EXISTING account. If this is the
 * Apple ID's first authorization (a new user who started from Sign In), Apple's one-time name is
 * saved and returned like on the sign-up path; else null.
 */
export async function signInExistingWithApple(): Promise<string | null> {
  const credential = await appleCredential();
  await precheckSignIn(appleAttempt(credential), 'signin');
  return finishAppleSignIn(credential, signInWithAppleToken);
}

async function signInExistingWithGoogleNative(): Promise<void> {
  const idToken = await googleNativeIdToken();
  await precheckSignIn({ provider: 'google', idToken, email: null }, 'signin');
  await signInWithGoogleToken(idToken);
}

/**
 * "Already have a LYSM account?" then "No, create one": go on with the stopped sign-in as a new
 * account (onboarding: linked to the anonymous session, so the answers carry over; Sign In: a new
 * account, which then goes through onboarding). Resolves with Apple's one-time name, if any.
 */
export async function continueAsNewAccount(
  link: Extract<PendingLink, { kind: 'fallback' }>,
): Promise<string | null> {
  const { attempt, origin } = link;
  if (attempt.provider === 'apple') {
    return finishAppleSignIn(
      {
        token: attempt.idToken,
        appleUserId: attempt.appleUserId ?? '',
        name: attempt.appleName ?? null,
      },
      origin === 'onboarding' ? linkAppleToCurrent : signInWithAppleToken,
    );
  }
  await (origin === 'onboarding'
    ? linkGoogleToCurrent(attempt.idToken)
    : signInWithGoogleToken(attempt.idToken));
  return null;
}

async function signInExistingWithGoogleBrowser(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: oauthRedirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start Google sign-in');
  await runGoogleBrowser(data.url); // the session switches to the account here
}

/** Sign in with Google into an EXISTING account: native dialog when configured, else browser. */
export async function signInExistingWithGoogle(): Promise<void> {
  return isGoogleNativeConfigured
    ? signInExistingWithGoogleNative()
    : signInExistingWithGoogleBrowser();
}

// ---------------------------------------------------------------------------------------------
// RE-AUTHENTICATION (Sign-in & Security, client 10/14 p.20-21): prove it's you with the provider
// the account was created with before "Set a password" or replacing an Apple relay address. The
// proof goes to the server (update-password / change-email), which checks it belongs to THIS
// account. The app's own session never changes here.
// ---------------------------------------------------------------------------------------------

/** Where the browser Google re-authentication returns (never handled as a sign-in, see deepLink). */
export const reauthRedirectTo = Linking.createURL('reauth-callback');

export function isReauthRedirect(url: string): boolean {
  return (url.split(/[?#]/)[0] ?? '').endsWith('reauth-callback');
}

export type ReauthProof =
  | { provider: 'apple' | 'google'; id_token: string }
  | { provider: 'google'; access_token: string };

/**
 * A Google sign-in in the in-app browser that is NOT made this app's session: its tokens come back
 * to the caller (a proof for the server, or the session the account-link client links on).
 * `googleAccount` is offered to Google's account chooser first.
 */
export async function googleBrowserSession(
  googleAccount?: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: reauthRedirectTo,
      skipBrowserRedirect: true,
      queryParams: {
        prompt: 'select_account',
        ...(googleAccount ? { login_hint: googleAccount } : {}),
      },
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start Google sign-in');
  googleBrowserOpen = true;
  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(data.url, reauthRedirectTo);
  } finally {
    googleBrowserOpen = false;
  }
  if (result.type !== 'success' || !result.url)
    throw new Error('Google sign-in was canceled');
  const params = redirectParams(result.url);
  const refused = redirectError(params);
  if (refused) throw refused;
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken)
    throw new SocialSignInError('no_session', 'Google sign-in did not complete');
  return { accessToken, refreshToken };
}

/**
 * `googleAccount`: the account's Google email, offered to Google's account chooser first (browser
 * fallback), so the person picks the Google account this LYSM account uses.
 */
export async function reauthenticateWithProvider(
  provider: 'apple' | 'google',
  googleAccount?: string,
): Promise<ReauthProof> {
  if (provider === 'apple') {
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    if (!credential.identityToken)
      throw new Error('Apple did not return an identity token');
    return { provider: 'apple', id_token: credential.identityToken };
  }
  if (isGoogleNativeConfigured) {
    return { provider: 'google', id_token: await googleNativeIdToken(true) };
  }
  // Native Google isn't set up yet: a Google sign-in in the in-app browser whose tokens go to the
  // server as the proof (the server ends that extra session); it is never made this app's session.
  const { accessToken } = await googleBrowserSession(googleAccount);
  return { provider: 'google', access_token: accessToken };
}
