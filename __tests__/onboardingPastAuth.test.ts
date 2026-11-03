/**
 * Whether an onboarding resume point is past sign-up (N5, client revisions 10/14 p.18): an email +
 * password account saved at the paywall or later without verifying (from before the email code
 * existed) is asked to verify before going on.
 */
import { isPastAuth } from '@features/onboarding/flow';
import { onboardingPastAuth } from '@features/onboarding/api';
import type { Profile } from '@app-types/database';

jest.mock('@lib', () => ({ supabase: {} }));

describe('isPastAuth', () => {
  it('the paywall and the two screens after it are past sign-up', () => {
    expect(isPastAuth('trial')).toBe(true);
    expect(isPastAuth('confirm')).toBe(true);
    expect(isPastAuth('notifications')).toBe(true);
  });

  it('sign-up itself and everything before it are not; unknown steps are not', () => {
    expect(isPastAuth('auth')).toBe(false);
    expect(isPastAuth('building')).toBe(false);
    expect(isPastAuth('welcome')).toBe(false);
    expect(isPastAuth(undefined)).toBe(false);
    expect(isPastAuth('emailVerify')).toBe(false);
  });

  it('reads the saved step off the profile', () => {
    const profile = (step?: string) =>
      ({ settings: step ? { onboarding: { step } } : {} }) as unknown as Profile;
    expect(onboardingPastAuth(profile('trial'))).toBe(true);
    expect(onboardingPastAuth(profile('auth'))).toBe(false);
    expect(onboardingPastAuth(profile())).toBe(false);
    expect(onboardingPastAuth(undefined)).toBe(false);
  });
});
