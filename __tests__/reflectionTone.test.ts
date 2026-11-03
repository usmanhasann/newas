/**
 * Reflection Tone (client revisions 10/14 p.21, N13): the same 4 tones and rules as onboarding
 * (at least 1, up to 2), the saved choice read back, and the validated profile update.
 */
import {
  MAX_TONES,
  MIN_TONES,
  REFLECTION_TONE_OPTIONS,
  canSaveTones,
  toggleTone,
  tonePatch,
  tonesFromProfile,
} from '@features/profile/reflectionTone';
import { REFLECTION_STYLES } from '@features/onboarding/constants';

describe('REFLECTION_TONE_OPTIONS', () => {
  it('are the same 4 tones as onboarding, same order and words', () => {
    expect(REFLECTION_TONE_OPTIONS.map((o) => o.value)).toEqual([
      'gentle',
      'direct',
      'encouraging',
      'reflective',
    ]);
    expect(REFLECTION_TONE_OPTIONS).toEqual(
      REFLECTION_STYLES.map(({ value, label, icon, description }) => ({
        value,
        label,
        icon,
        description,
      })),
    );
    expect([MIN_TONES, MAX_TONES]).toEqual([1, 2]);
  });
});

describe('tonesFromProfile', () => {
  it('reads the saved choice, primary first', () => {
    expect(
      tonesFromProfile({
        personal_reflection_style: 'direct',
        personal_reflection_style_secondary: 'gentle',
      }),
    ).toEqual(['direct', 'gentle']);
    expect(
      tonesFromProfile({
        personal_reflection_style: 'reflective',
        personal_reflection_style_secondary: null,
      }),
    ).toEqual(['reflective']);
  });

  it('never shows the same tone twice', () => {
    expect(
      tonesFromProfile({
        personal_reflection_style: 'gentle',
        personal_reflection_style_secondary: 'gentle',
      }),
    ).toEqual(['gentle']);
  });
});

describe('toggleTone (onboarding rules)', () => {
  it('adds a second tone, and blocks a third', () => {
    expect(toggleTone(['gentle'], 'direct')).toEqual(['gentle', 'direct']);
    const atCap: ('gentle' | 'direct')[] = ['gentle', 'direct'];
    expect(toggleTone(atCap, 'reflective' as never)).toBe(atCap);
  });

  it('unchooses a chosen tone, even the last one (then Save waits for a pick)', () => {
    expect(toggleTone(['gentle', 'direct'], 'gentle')).toEqual(['direct']);
    expect(toggleTone(['gentle'], 'gentle')).toEqual([]);
  });
});

describe('canSaveTones', () => {
  it('allows 1 or 2 different tones only', () => {
    expect(canSaveTones([])).toBe(false);
    expect(canSaveTones(['gentle'])).toBe(true);
    expect(canSaveTones(['gentle', 'direct'])).toBe(true);
    expect(canSaveTones(['gentle', 'direct', 'reflective'])).toBe(false);
    expect(canSaveTones(['gentle', 'gentle'])).toBe(false);
  });
});

describe('tonePatch', () => {
  it('writes the primary and the optional second tone', () => {
    expect(tonePatch(['encouraging', 'reflective'])).toEqual({
      personal_reflection_style: 'encouraging',
      personal_reflection_style_secondary: 'reflective',
    });
    expect(tonePatch(['direct'])).toEqual({
      personal_reflection_style: 'direct',
      personal_reflection_style_secondary: null,
    });
  });

  it('refuses an invalid choice instead of saving it', () => {
    expect(() => tonePatch([])).toThrow();
    expect(() => tonePatch(['gentle', 'direct', 'reflective'])).toThrow();
    expect(() => tonePatch(['gentle', 'gentle'])).toThrow();
    expect(() => tonePatch(['loud' as never])).toThrow();
  });
});
