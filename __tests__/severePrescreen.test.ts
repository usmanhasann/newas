/**
 * System 1 — the on-device severe prescreen that gates the PRE-POST block. It must be strict: only
 * an explicit, directed threat (intent + violence verb + a direct target) trips it, so legitimate
 * posts are not held for a synchronous AI check. Anything it misses still goes through the async
 * post-scan.
 */
import { matchesSeverePrescreen } from '@features/safety';

describe('matchesSeverePrescreen — pre-post block gate', () => {
  it('flags explicit, directed threats of violence', () => {
    expect(matchesSeverePrescreen("I'm going to kill you")).toBe(true);
    expect(matchesSeverePrescreen("I'll hurt her")).toBe(true);
    expect(matchesSeverePrescreen('I am going to shoot them')).toBe(true);
    expect(matchesSeverePrescreen('gonna beat you up')).toBe(true);
    expect(matchesSeverePrescreen('about to attack him')).toBe(true);
  });

  it('does NOT flag figurative, ambiguous, or non-directed text', () => {
    expect(matchesSeverePrescreen('this workout is killing me')).toBe(false); // no intent, self target
    expect(matchesSeverePrescreen('you are killing me')).toBe(false); // no intent marker
    expect(matchesSeverePrescreen('I love you')).toBe(false); // no violence
    expect(matchesSeverePrescreen('kill him')).toBe(false); // no explicit intent marker → async scan
    expect(matchesSeverePrescreen('I want to kill myself')).toBe(false); // self-harm → System 2, not this
    expect(matchesSeverePrescreen('')).toBe(false);
    expect(matchesSeverePrescreen(null)).toBe(false);
  });
});
