/**
 * The name shown on Home's greeting and the Circles headline: the first word of the profile's
 * display name → "[Name]’s Circle"; no usable name → "Your Circle".
 */
import { firstName } from '@utils/name';
import { circlesPageTitle } from '@features/circles/postingLogic';

describe('firstName', () => {
  it('takes the first word of the display name', () => {
    expect(firstName('Konah Quittman')).toBe('Konah');
    expect(firstName('  Konah   Quittman ')).toBe('Konah');
    expect(firstName('Auguste')).toBe('Auguste');
  });

  it('is null when there is no usable name', () => {
    expect(firstName(null)).toBeNull();
    expect(firstName(undefined)).toBeNull();
    expect(firstName('')).toBeNull();
    expect(firstName('   ')).toBeNull();
  });
});

describe('circlesPageTitle', () => {
  it('is "[Name]’s Circle" with a name, "Your Circle" without', () => {
    expect(circlesPageTitle('Konah')).toBe('Konah’s Circle');
    expect(circlesPageTitle(null)).toBe('Your Circle');
  });
});
