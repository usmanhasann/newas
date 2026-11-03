import { cn } from '@utils/cn';

describe('cn', () => {
  it('joins truthy class values', () => {
    expect(cn('a', false, 'b', undefined, null, 'c')).toBe('a b c');
  });

  it('returns empty string when nothing is truthy', () => {
    expect(cn(false, undefined, null)).toBe('');
  });
});
