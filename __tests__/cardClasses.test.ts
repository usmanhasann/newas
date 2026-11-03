/**
 * Card overrides must win on device. NativeWind applies conflicting classes by stylesheet order
 * (Tailwind emits them alphabetically), not className order, so a caller's `border-brand-500`
 * lost to the card's own `border-line` and `bg-brand-50` lost to `bg-surface`: the selected
 * circle in the widget picker and in Create Circle showed no purple border, and tinted cards
 * showed white. resolveCardClasses drops the card's class in each group the caller sets.
 */
import { resolveCardClasses } from '@components/Card';

const classes = (padded: boolean, className?: string) => resolveCardClasses(padded, className).split(' ');

describe('resolveCardClasses', () => {
  it('keeps the card look when nothing conflicts', () => {
    expect(resolveCardClasses(true)).toBe('rounded-lg border border-line bg-surface p-5');
    expect(resolveCardClasses(false)).toBe('rounded-lg border border-line bg-surface');
    expect(classes(true, 'mb-3 mt-2')).toEqual(['rounded-lg', 'border', 'border-line', 'bg-surface', 'p-5', 'mb-3', 'mt-2']);
  });

  it('a selected border replaces the card border (widget picker, Create Circle)', () => {
    const c = classes(true, 'mb-3 border-2 border-brand-500');
    expect(c).toContain('border-brand-500');
    expect(c).toContain('border-2');
    expect(c).not.toContain('border-line');
    expect(c).not.toContain('border');
  });

  it('a background override replaces the white surface', () => {
    for (const bg of ['bg-brand-50', 'bg-surface-muted', 'bg-warning-bg']) {
      const c = classes(false, bg);
      expect(c).toContain(bg);
      expect(c).not.toContain('bg-surface');
    }
  });

  it('padding and rounding overrides win; side-only paddings keep the rest', () => {
    expect(classes(true, 'p-3')).not.toContain('p-5');
    expect(classes(true, 'rounded-3xl')).not.toContain('rounded-lg');
    expect(classes(true, 'px-4')).toContain('p-5'); // only horizontal changes
  });

  it('never treats unrelated or conditional classes as overrides', () => {
    const c = classes(true, 'border-t-2 border-solid active:bg-brand-50 opacity-50');
    expect(c).toEqual(expect.arrayContaining(['border', 'border-line', 'bg-surface', 'p-5']));
  });
});
