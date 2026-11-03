/**
 * Regression: NativeWind resolves conflicting classes by STYLESHEET order (Tailwind emits them
 * alphabetically: text-2xl < text-base < text-xs), not className order. Before this fix a
 * caller's size/colour override silently lost to the variant's own class — the paywall price
 * (`text-5xl` on the body variant) rendered at the body's 15px on device. resolveTextClasses
 * must drop the variant's class in every group the caller overrides.
 */
import { resolveTextClasses, type TextVariant } from '@components/Typography';

const split = (s: string) => s.split(/\s+/).filter(Boolean);

describe('resolveTextClasses', () => {
  it('returns the variant classes untouched when there is no override', () => {
    expect(resolveTextClasses('meta')).toBe('font-sans text-xs text-ink-soft');
  });

  it('paywall price: a big size beats the variant size (text-6xl over text-base)', () => {
    const c = split(resolveTextClasses('bodyStrong', 'text-6xl'));
    expect(c).toContain('text-6xl');
    expect(c).not.toContain('text-base');
    expect(c).toEqual(expect.arrayContaining(['font-sans-semibold', 'text-ink']));
  });

  it('muted paywall copy: size + leading override meta, colour and family kept', () => {
    const c = split(resolveTextClasses('meta', 'mt-2 text-center text-lg leading-snug'));
    expect(c).not.toContain('text-xs');
    expect(c).toEqual(
      expect.arrayContaining([
        'font-sans',
        'text-ink-soft',
        'text-lg',
        'leading-snug',
        'text-center',
      ]),
    );
  });

  it('a colour override replaces only the variant colour', () => {
    const c = split(resolveTextClasses('caption', 'text-brand-600'));
    expect(c).not.toContain('text-ink-soft');
    expect(c).toEqual(
      expect.arrayContaining(['text-xs', 'leading-relaxed', 'text-brand-600']),
    );
  });

  it('alignment, spacing and prefixed classes never strip variant classes', () => {
    const c = split(resolveTextClasses('body', 'text-center mt-2 active:text-brand-600'));
    expect(c).toEqual(
      expect.arrayContaining(['text-base', 'text-ink', 'leading-relaxed']),
    );
  });

  it('family + size overrides replace sans/base but keep the variant leading and colour', () => {
    const c = split(resolveTextClasses('body', 'font-serif text-2xl'));
    expect(c).not.toContain('font-sans');
    expect(c).not.toContain('text-base');
    expect(c).toEqual(
      expect.arrayContaining(['font-serif', 'text-2xl', 'leading-relaxed', 'text-ink']),
    );
  });

  it('sizes outside the tokens (Tailwind defaults, arbitrary, slash) still replace the variant size', () => {
    for (const o of ['text-7xl', 'text-[18px]', 'text-lg/7']) {
      const c = split(resolveTextClasses('meta', o));
      expect(c).not.toContain('text-xs');
      expect(c).toContain('text-ink-soft'); // colour untouched
    }
  });

  it('non-size, non-colour text-* utilities never strip the variant colour', () => {
    for (const o of ['text-ellipsis', 'text-wrap', 'text-opacity-50', 'text-justify']) {
      expect(split(resolveTextClasses('meta', o))).toEqual(
        expect.arrayContaining(['text-xs', 'text-ink-soft']),
      );
    }
  });

  it('opacity colours, font-mono and negative tracking are recognised', () => {
    expect(split(resolveTextClasses('caption', 'text-ink/50'))).not.toContain(
      'text-ink-soft',
    );
    expect(split(resolveTextClasses('body', 'font-mono'))).not.toContain('font-sans');
    expect(split(resolveTextClasses('section', '-tracking-wide'))).not.toContain(
      'tracking-label',
    );
  });

  it('never leaves two classes of the same group for any variant × override', () => {
    const variants: TextVariant[] = [
      'display',
      'h1',
      'h2',
      'h3',
      'entry',
      'prompt',
      'body',
      'bodyStrong',
      'bodyMuted',
      'label',
      'section',
      'caption',
      'meta',
      'button',
      'link',
    ];
    const overrides = [
      'text-xs',
      'text-6xl',
      'text-7xl',
      'text-[18px]',
      'text-brand-600',
      'text-ink/50',
      'leading-snug',
      'font-serif',
      'font-mono',
      'tracking-wide',
    ];
    const group = (c: string) =>
      c.startsWith('leading-')
        ? 'leading'
        : c.startsWith('tracking-')
          ? 'tracking'
          : /^font-(sans|serif|mono)/.test(c)
            ? 'family'
            : /^text-(xs|sm|base|md|lg|xl|\dxl|\[\d.*\])$/.test(c)
              ? 'size'
              : /^text-(ink|brand|danger)/.test(c)
                ? 'color'
                : null;
    for (const v of variants) {
      for (const o of overrides) {
        const groups = split(resolveTextClasses(v, o)).map(group).filter(Boolean);
        expect(new Set(groups).size).toBe(groups.length);
      }
    }
  });
});
