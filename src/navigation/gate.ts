/**
 * Centralized route-gate decision (pure, so it's unit-testable and there's ONE place
 * that decides where the user goes — no scattered redirect logic, no loops).
 *
 * With the overhaul (§17), onboarding runs on an ANONYMOUS session and now owns the
 * authentication + subscription steps internally. An email + password sign-up verifies its email
 * by a 6-digit code INSIDE onboarding, before the paywall (client revisions 10/14 p.18). Accounts
 * from before that step (and any account whose email changed without a code) are asked the next
 * time the app opens: the 'verifyEmail' stage, before the paywall. Circle actions keep their own
 * check as a backstop.
 *
 *   1. bootstrap  — the initial cold-launch session decision (restore real / mint anon)
 *      hasn't resolved yet → hold the splash so the login screen can never flash first
 *   2. auth status  (anonymous or real → 'signedIn'; only a hard sign-out is 'signedOut')
 *   3. email verification  — an email + password account whose email isn't verified, once it is
 *      past sign-up (onboarded, or saved at the paywall or later)
 *   4. onboarding completion  (anonymous users always land here; auth happens inside)
 *   5. entitlement (paywall)  — returning users whose subscription has lapsed
 *   6. main
 */
export type GateTarget = 'splash' | 'auth' | 'onboarding' | 'verifyEmail' | 'paywall' | 'main';

export interface GateInput {
  /** Sign-out is swapping the real account for a fresh anonymous session → hold on the
   *  splash so the signed-out login screen never flashes on the way to Welcome. */
  reauthenticating: boolean;
  /** The FIRST cold-launch session decision hasn't resolved yet (still restoring a real
   *  session or minting the anonymous one). While true we hold the splash — never 'auth' —
   *  because a fresh launch is mid-way to an anonymous session and Supabase fires a
   *  transient INITIAL_SESSION(null) → signedOut before anon sign-in completes. */
  bootstrapping: boolean;
  /** 'signedIn' covers anonymous sessions too; 'signedOut' only after a hard sign-out
   *  (or if anonymous sign-in is unavailable) → the login screen as a safety net. */
  authStatus: 'loading' | 'signedOut' | 'signedIn';
  /** Profile / subscription still loading for a signed-in user. */
  gateLoading: boolean;
  onboarded: boolean;
  /** An email + password account whose current email isn't verified (see gateInputFrom). */
  needsEmailVerification?: boolean;
  entitled: boolean;
}

/**
 * Whether the gate still can't TRUST its routing signals for a signed-in user — the profile or
 * subscription query is still loading OR has errored. Holding on an ERROR (not just loading) is
 * deliberate: undefined data must NOT collapse into a wrong route — an errored profile would
 * otherwise read as "not onboarded" (dumping a returning subscriber into onboarding), and an
 * errored subscription as "lapsed" (dropping a paying user on the paywall). While held the router
 * stays on the splash; refetchOnReconnect self-heals the transient case, after which the gate
 * routes on real data. Pure, so it's unit-testable.
 */
export function isGateResolving(s: {
  signedIn: boolean;
  profileLoading: boolean;
  profileError: boolean;
  subLoading: boolean;
  subError: boolean;
}): boolean {
  if (!s.signedIn) return false;
  return s.profileLoading || s.profileError || s.subLoading || s.subError;
}

export function resolveGate(i: GateInput): GateTarget {
  if (i.reauthenticating) return 'splash';
  // Hold the splash until the initial session decision resolves. This MUST precede the
  // signed-out check so a transient cold-launch signedOut can never surface the login screen.
  if (i.bootstrapping) return 'splash';
  if (i.authStatus === 'loading') return 'splash';
  if (i.authStatus === 'signedOut') return 'auth';
  if (i.gateLoading) return 'splash';
  // Before onboarding: an unverified email account saved at the paywall or later (from before the
  // email code existed) verifies first, then onboarding resumes where it was.
  if (i.needsEmailVerification) return 'verifyEmail';
  if (!i.onboarded) return 'onboarding';
  if (!i.entitled) return 'paywall';
  return 'main';
}

/**
 * Raw store + query state fed into the gate. Assembling the GateInput here (rather than
 * inline in RootNavigator) keeps the fragile derivations — the `bootstrapping = !bootstrapped`
 * negation, the error-aware hold, the `onboarded` collapse — PURE and therefore
 * unit-testable, so an inverted boolean can't ship green.
 */
export interface GateState {
  reauthenticating: boolean;
  /** False until the cold-launch session decision resolves (see GateInput.bootstrapping). */
  bootstrapped: boolean;
  authStatus: 'loading' | 'signedOut' | 'signedIn';
  profileLoading: boolean;
  profileError: boolean;
  subLoading: boolean;
  subError: boolean;
  /** profile.onboarding_completed — undefined until the profile query has resolved. */
  onboardingCompleted: boolean | undefined;
  entitled: boolean;
  /** A real (non-anonymous) account that signed up with email + password (an 'email' identity). */
  emailAccount?: boolean;
  /** Its verification flag (email_verifications) — undefined until loaded. */
  emailVerified?: boolean;
  emailVerifiedLoading?: boolean;
  /** The saved onboarding step is past sign-up (the paywall or later). */
  onboardingPastAuth?: boolean;
}

export function gateInputFrom(s: GateState): GateInput {
  const signedIn = s.authStatus === 'signedIn';
  // Only an email account past sign-up is checked here: onboarded, or saved at the paywall or later.
  // One still on the sign-up step verifies inside that step (AuthStep). While its flag loads, hold
  // the splash (no flash of Home); if it can't be read (offline), don't lock the person out: the
  // circle check is the backstop.
  const checksEmail =
    signedIn && !!s.emailAccount && ((s.onboardingCompleted ?? false) || !!s.onboardingPastAuth);
  return {
    reauthenticating: s.reauthenticating,
    bootstrapping: !s.bootstrapped,
    authStatus: s.authStatus,
    gateLoading:
      isGateResolving({
        signedIn,
        profileLoading: s.profileLoading,
        profileError: s.profileError,
        subLoading: s.subLoading,
        subError: s.subError,
      }) ||
      (checksEmail && !!s.emailVerifiedLoading),
    onboarded: s.onboardingCompleted ?? false,
    needsEmailVerification: checksEmail && s.emailVerified === false,
    entitled: s.entitled,
  };
}
