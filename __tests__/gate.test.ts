/**
 * Route-gate decisions (src/navigation/gate.ts). The gate is the single place that decides
 * where a launch resolves. These tests lock the client's launch requirement: a branded
 * splash appears on EVERY open — for a brand-new install AND a returning user — and stays
 * up until the app has actually loaded (session + profile + subscription), then routes.
 */
import {
  resolveGate,
  isGateResolving,
  gateInputFrom,
  type GateInput,
  type GateState,
} from '@/navigation/gate';

const base: GateInput = {
  reauthenticating: false,
  bootstrapping: false,
  authStatus: 'signedIn',
  gateLoading: false,
  onboarded: true,
  entitled: true,
};
const gate = (over: Partial<GateInput> = {}) => resolveGate({ ...base, ...over });

describe('resolveGate — splash on every launch (§2)', () => {
  it('shows the splash while the session is still resolving — new OR returning user', () => {
    // At cold launch the anonymous/real session hasn't resolved yet (authStatus 'loading').
    // This is the "quick image until the app is loaded" shown regardless of install state.
    expect(gate({ authStatus: 'loading', onboarded: false })).toBe('splash'); // brand-new install
    expect(gate({ authStatus: 'loading', onboarded: true, entitled: true })).toBe('splash'); // returning
  });

  it('keeps the splash up while a signed-in user’s profile/subscription load', () => {
    expect(gate({ authStatus: 'signedIn', gateLoading: true, onboarded: true })).toBe('splash');
    expect(gate({ authStatus: 'signedIn', gateLoading: true, onboarded: false })).toBe('splash');
  });

  it('never strands a fully-loaded signed-in user on the splash', () => {
    expect(gate({ authStatus: 'signedIn', gateLoading: false })).not.toBe('splash');
  });
});

describe('resolveGate — cold-launch bootstrap never flashes the login screen', () => {
  it('holds the splash while the initial session decision is unresolved — even if a transient signedOut fires', () => {
    // On a fresh install Supabase emits INITIAL_SESSION(null) → signedOut BEFORE the anon
    // session is minted. Bootstrapping must keep the splash up so the old Sign In never flashes.
    expect(gate({ bootstrapping: true, authStatus: 'signedOut', onboarded: false })).toBe('splash');
    expect(gate({ bootstrapping: true, authStatus: 'loading', onboarded: false })).toBe('splash');
    // and even the first signed-in tick (before the bootstrap flag flips) stays on splash
    expect(gate({ bootstrapping: true, authStatus: 'signedIn', onboarded: false })).toBe('splash');
  });

  it('routes to auth ONLY once bootstrap has resolved and the user is genuinely signed out', () => {
    expect(gate({ bootstrapping: false, authStatus: 'signedOut', onboarded: false })).toBe('auth');
  });

  it('lands a freshly-minted anon session on onboarding once bootstrap resolves', () => {
    expect(gate({ bootstrapping: false, authStatus: 'signedIn', onboarded: false })).toBe(
      'onboarding',
    );
  });
});

describe('isGateResolving — hold the splash rather than misroute on a query error', () => {
  const s = {
    signedIn: true,
    profileLoading: false,
    profileError: false,
    subLoading: false,
    subError: false,
  };

  it('does not hold for a signed-out user (nothing to resolve)', () => {
    expect(isGateResolving({ ...s, signedIn: false, profileLoading: true, profileError: true })).toBe(
      false,
    );
  });

  it('holds while the profile or subscription is loading', () => {
    expect(isGateResolving({ ...s, profileLoading: true })).toBe(true);
    expect(isGateResolving({ ...s, subLoading: true })).toBe(true);
  });

  it('HOLDS on a profile ERROR — an onboarded, entitled subscriber must NOT be dumped into onboarding', () => {
    expect(isGateResolving({ ...s, profileError: true })).toBe(true);
  });

  it('HOLDS on a subscription ERROR — a paying subscriber must NOT be dropped on the paywall', () => {
    expect(isGateResolving({ ...s, subError: true })).toBe(true);
  });

  it('resolves (false) once every signal has loaded cleanly', () => {
    expect(isGateResolving(s)).toBe(false);
  });
});

describe('gateInputFrom → resolveGate — the full launch wiring (locks the bootstrapping negation)', () => {
  const s: GateState = {
    reauthenticating: false,
    bootstrapped: true,
    authStatus: 'signedIn',
    profileLoading: false,
    profileError: false,
    subLoading: false,
    subError: false,
    onboardingCompleted: true,
    entitled: true,
  };
  const route = (over: Partial<GateState> = {}) => resolveGate(gateInputFrom({ ...s, ...over }));

  it('negates bootstrapped: a fresh (unbootstrapped) launch holds the splash even when signedOut', () => {
    // This is the exact anti-flash contract — inverting the negation would break THIS test.
    expect(gateInputFrom({ ...s, bootstrapped: false }).bootstrapping).toBe(true);
    expect(route({ bootstrapped: false, authStatus: 'signedOut', onboardingCompleted: undefined })).toBe(
      'splash',
    );
  });

  it('routes a genuinely signed-out user to auth only once bootstrapped', () => {
    expect(route({ bootstrapped: true, authStatus: 'signedOut', onboardingCompleted: undefined })).toBe(
      'auth',
    );
  });

  it('holds the splash on a profile error (no dumping an onboarded subscriber into onboarding)', () => {
    expect(route({ profileError: true })).toBe('splash');
  });

  it('holds the splash on a subscription error (no dropping a paying user on the paywall)', () => {
    expect(route({ subError: true, entitled: false })).toBe('splash');
  });

  it('treats an unresolved (undefined) profile as not-onboarded once loading has ended', () => {
    expect(route({ onboardingCompleted: undefined })).toBe('onboarding');
  });

  it('routes a fully-loaded, onboarded, entitled user to main', () => {
    expect(route()).toBe('main');
  });
});

describe('resolveGate — routing after load (§17)', () => {
  it('sends a brand-new (anonymous) user into onboarding once loaded', () => {
    expect(gate({ authStatus: 'signedIn', gateLoading: false, onboarded: false })).toBe('onboarding');
  });

  it('sends a returning, onboarded but lapsed user to the paywall', () => {
    expect(gate({ onboarded: true, entitled: false })).toBe('paywall');
  });

  it('sends a returning, entitled user straight to main', () => {
    expect(gate({ onboarded: true, entitled: true })).toBe('main');
  });

  it('falls back to the auth screen only after a hard sign-out', () => {
    expect(gate({ authStatus: 'signedOut' })).toBe('auth');
  });
});

describe('resolveGate — existing-user Sign In routing', () => {
  it('sends an existing, active (verified or Google / Apple) user straight to Home', () => {
    expect(gate({ onboarded: true, entitled: true })).toBe('main');
  });

  it('sends an existing but lapsed user to the paywall (never back through onboarding)', () => {
    expect(gate({ onboarded: true, entitled: false })).toBe('paywall');
  });
});

describe('resolveGate — Welcome is the signed-out front door', () => {
  it('holds the splash while sign-out swaps in a fresh anonymous session (no login flash)', () => {
    expect(gate({ reauthenticating: true, authStatus: 'signedOut' })).toBe('splash');
    expect(gate({ reauthenticating: true, authStatus: 'signedIn', onboarded: false })).toBe('splash');
  });

  it('lands the fresh anon session on Welcome (onboarding), not the login screen', () => {
    expect(gate({ reauthenticating: false, authStatus: 'signedIn', onboarded: false })).toBe(
      'onboarding',
    );
  });

  it('falls back to the login screen only if anonymous sign-in is unavailable', () => {
    expect(gate({ reauthenticating: false, authStatus: 'signedOut' })).toBe('auth');
  });
});

// Client revisions 10/14 p.18 (N5): email + password sign-ups verify by a 6-digit code. New ones do
// it inside the sign-up step (AuthStep); accounts from before that existed are asked the next time
// the app opens, before the paywall or Home.
describe('gateInputFrom → resolveGate — unverified email accounts are asked on the next open', () => {
  const s: GateState = {
    reauthenticating: false,
    bootstrapped: true,
    authStatus: 'signedIn',
    profileLoading: false,
    profileError: false,
    subLoading: false,
    subError: false,
    onboardingCompleted: true,
    entitled: true,
    emailAccount: true,
    emailVerified: false,
    emailVerifiedLoading: false,
  };
  const route = (over: Partial<GateState> = {}) => resolveGate(gateInputFrom({ ...s, ...over }));

  it('an onboarded email + password account that never verified gets the code screen', () => {
    expect(route()).toBe('verifyEmail');
    expect(route({ entitled: false })).toBe('verifyEmail'); // before the paywall too
  });

  it('a verified account goes on as before', () => {
    expect(route({ emailVerified: true })).toBe('main');
    expect(route({ emailVerified: true, entitled: false })).toBe('paywall');
  });

  it('Google / Apple and anonymous accounts are never asked (the provider verified the email)', () => {
    expect(route({ emailAccount: false })).toBe('main');
    expect(route({ emailAccount: false, onboardingCompleted: false, onboardingPastAuth: true })).toBe(
      'onboarding',
    );
  });

  it('an account saved at the paywall or later (not onboarded yet) verifies before going on', () => {
    expect(route({ onboardingCompleted: false, onboardingPastAuth: true })).toBe('verifyEmail');
    expect(route({ onboardingCompleted: false, onboardingPastAuth: true, emailVerified: true })).toBe(
      'onboarding',
    );
  });

  it('one still on the sign-up step stays in onboarding (the code is part of that step)', () => {
    expect(route({ onboardingCompleted: false, onboardingPastAuth: false })).toBe('onboarding');
  });

  it('holds the splash while the flag loads, and never locks anyone out when it can’t be read', () => {
    expect(route({ emailVerified: undefined, emailVerifiedLoading: true })).toBe('splash');
    expect(route({ emailVerified: undefined, emailVerifiedLoading: false })).toBe('main');
    // An anonymous onboarding session never waits for it.
    expect(
      route({ emailAccount: false, onboardingCompleted: false, emailVerified: undefined, emailVerifiedLoading: true }),
    ).toBe('onboarding');
  });
});
