// Unit test for the tone-blend helper shared with the AI edge functions. It's a pure,
// self-contained module (no Deno APIs), so the jest suite is its source of truth for behavior
// even though the functions themselves run on Deno.
import {
  resolveTones,
  combineVoice,
  asTone,
  TONES,
  type Tone,
} from '../supabase/functions/_shared/tone';

describe('tone blending helper (shared with the AI edge functions)', () => {
  it('exposes exactly the four tones', () => {
    expect(TONES).toEqual(['gentle', 'direct', 'encouraging', 'reflective']);
  });

  it('asTone validates known tones and rejects junk', () => {
    expect(asTone('gentle')).toBe('gentle');
    expect(asTone('nonsense')).toBeNull();
    expect(asTone(null)).toBeNull();
    expect(asTone(42)).toBeNull();
  });

  it('resolveTones falls back to gentle, keeps two distinct tones, drops redundant/invalid ones', () => {
    expect(resolveTones(null, null)).toEqual(['gentle']);
    expect(resolveTones('direct')).toEqual(['direct']);
    expect(resolveTones('direct', 'encouraging')).toEqual(['direct', 'encouraging']);
    // A secondary equal to the primary is dropped (no self-blend).
    expect(resolveTones('direct', 'direct')).toEqual(['direct']);
    // An invalid secondary is dropped; an invalid primary falls back to gentle.
    expect(resolveTones('direct', 'garbage')).toEqual(['direct']);
    expect(resolveTones('garbage', 'reflective')).toEqual(['gentle', 'reflective']);
  });

  it('combineVoice returns one clause verbatim, and blends two in order with an explicit note', () => {
    const clauses: Record<Tone, string> = {
      gentle: 'G-CLAUSE',
      direct: 'D-CLAUSE',
      encouraging: 'E-CLAUSE',
      reflective: 'R-CLAUSE',
    };
    expect(combineVoice(clauses, ['gentle'])).toBe('G-CLAUSE');

    const blend = combineVoice(clauses, ['gentle', 'direct']);
    expect(blend).toContain('G-CLAUSE');
    expect(blend).toContain('D-CLAUSE');
    expect(blend.toLowerCase()).toContain('blend');
    // The primary (gentle) leads; the secondary (direct) follows.
    expect(blend.indexOf('G-CLAUSE')).toBeLessThan(blend.indexOf('D-CLAUSE'));
  });
});
