import { resolveGate, type GateInput } from '@/navigation/gate';
import { cooldownRemaining, RESEND_COOLDOWN_SECONDS } from '@features/email-verification/cooldown';

const base: GateInput = {
  reauthenticating: false,
  bootstrapping: false,
  authStatus: 'signedIn',
  gateLoading: false,
  onboarded: true,
  entitled: true,
};

describe('resolveGate — centralized route guard (§17: auth + subscribe live in onboarding; 10/14 p.18: unverified email accounts verify by code)', () => {
  it('an unverified email account past sign-up verifies before the paywall or Home', () => {
    expect(resolveGate({ ...base, needsEmailVerification: true })).toBe('verifyEmail');
    expect(resolveGate({ ...base, needsEmailVerification: true, entitled: false })).toBe('verifyEmail');
    expect(resolveGate({ ...base, needsEmailVerification: true, onboarded: false })).toBe('verifyEmail');
    // Never before the session itself is settled.
    expect(resolveGate({ ...base, needsEmailVerification: true, authStatus: 'signedOut' })).toBe('auth');
  });

  it('loading auth → splash', () => {
    expect(resolveGate({ ...base, authStatus: 'loading' })).toBe('splash');
  });

  it('signed out → auth (safety net when anonymous sign-in is unavailable / after logout)', () => {
    expect(resolveGate({ ...base, authStatus: 'signedOut', onboarded: false })).toBe('auth');
  });

  it('signed in (incl. anonymous) but still loading profile/sub → splash', () => {
    expect(resolveGate({ ...base, gateLoading: true })).toBe('splash');
  });

  it('authenticated (or anonymous), onboarding incomplete → onboarding', () => {
    expect(resolveGate({ ...base, onboarded: false })).toBe('onboarding');
  });

  it('onboarded but not entitled → paywall', () => {
    expect(resolveGate({ ...base, entitled: false })).toBe('paywall');
  });

  it('onboarded + entitled → main', () => {
    expect(resolveGate(base)).toBe('main');
  });

  it('follows the full priority order: auth → onboarding → paywall → main', () => {
    expect(resolveGate({ ...base, authStatus: 'signedOut', onboarded: false, entitled: false })).toBe('auth');
    expect(resolveGate({ ...base, onboarded: false, entitled: false })).toBe('onboarding');
    expect(resolveGate({ ...base, entitled: false })).toBe('paywall');
    expect(resolveGate(base)).toBe('main');
  });
});

describe('cooldownRemaining — resend timer', () => {
  const T = 1_000_000_000_000;
  it('is 0 when never sent', () => {
    expect(cooldownRemaining(null, T)).toBe(0);
  });
  it('is the full window right after sending', () => {
    expect(cooldownRemaining(T, T)).toBe(RESEND_COOLDOWN_SECONDS);
  });
  it('counts down', () => {
    expect(cooldownRemaining(T, T + 30_000)).toBe(30);
    expect(cooldownRemaining(T, T + 59_000)).toBe(1);
  });
  it('clamps to 0 after the window', () => {
    expect(cooldownRemaining(T, T + 60_000)).toBe(0);
    expect(cooldownRemaining(T, T + 120_000)).toBe(0);
  });
});
