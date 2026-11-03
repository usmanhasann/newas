/**
 * Typography — the only sanctioned way to render text.
 * Two-font system per design spec §3: serif (Playfair Display) for display/headings
 * and journal entry content; sans (Inter) for all UI labels, body, metadata, forms.
 * All sizes/weights/colors come from tokens via NativeWind classes.
 */
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { colors, fontFamily, fontSize } from '@theme';
import { cn } from '@utils/cn';

export type TextVariant =
  | 'display' // app name / hero
  | 'h1' // page heading ("Hello, Sarah")
  | 'h2'
  | 'h3'
  | 'entry' // journal entry body (serif, warm)
  | 'prompt' // accent prompt ("What's on your mind?")
  | 'body' // UI body (sans)
  | 'bodyStrong'
  | 'bodyMuted'
  | 'label' // form field label (uppercase small caps)
  | 'section' // section header ("TODAY'S MOOD")
  | 'caption' // hints
  | 'meta' // timestamps / metadata
  | 'button'
  | 'link';

const VARIANT: Record<TextVariant, string> = {
  display: 'font-serif text-4xl leading-tight tracking-tighter text-ink',
  h1: 'font-serif-semibold text-3xl leading-tight tracking-tight text-ink',
  h2: 'font-serif-semibold text-2xl leading-snug text-ink',
  h3: 'font-serif-semibold text-xl leading-snug text-ink',
  entry: 'font-serif text-md leading-relaxed text-ink',
  prompt: 'font-serif text-md leading-relaxed text-brand-500',
  body: 'font-sans text-base leading-relaxed text-ink',
  bodyStrong: 'font-sans-semibold text-base text-ink',
  bodyMuted: 'font-sans text-base leading-relaxed text-ink-soft',
  // Modern form-field label: small, medium-weight, sentence case (not tiny uppercase).
  label: 'font-sans-medium text-sm text-ink',
  section: 'font-sans-semibold text-xs uppercase tracking-label text-ink-soft',
  caption: 'font-sans text-xs leading-relaxed text-ink-soft',
  meta: 'font-sans text-xs text-ink-soft',
  button: 'font-sans-semibold text-md',
  link: 'font-sans-medium text-base text-brand-500 underline',
};

// Tokens are under theme.extend in tailwind.config.js, so Tailwind's own defaults (text-7xl…,
// font-mono) are also emitted — recognise them too, or an override using one would still lose.
const TAILWIND_DEFAULT_SIZES = ['7xl', '8xl', '9xl'];
const SIZE_KEYS = new Set([...Object.keys(fontSize), ...TAILWIND_DEFAULT_SIZES]);
const FAMILY_KEYS = new Set([...Object.keys(fontFamily), 'mono']);

function colorKeys(tree: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const name = key === 'DEFAULT' ? prefix.replace(/-$/, '') : `${prefix}${key}`;
    return value !== null && typeof value === 'object'
      ? colorKeys(value as Record<string, unknown>, `${name}-`)
      : [name];
  });
}
const COLOR_KEYS = new Set([...colorKeys(colors), 'current', 'inherit']);

/**
 * Which style a class sets, for the groups a variant can also set; null = never conflicts.
 * Colour is an allow-list (not "any other text-*") so text-ellipsis, text-center, etc. never
 * strip the variant's colour.
 */
function conflictGroup(raw: string): string | null {
  if (raw.includes(':')) return null; // prefixed (active:, dark:) — conditional, not an override
  const cls = raw.startsWith('-') ? raw.slice(1) : raw; // -tracking-wide
  if (cls.startsWith('leading-')) return 'leading';
  if (cls.startsWith('tracking-')) return 'tracking';
  if (cls.startsWith('font-')) return FAMILY_KEYS.has(cls.slice(5)) ? 'family' : null;
  if (!cls.startsWith('text-')) return null;
  const value = cls.slice(5);
  const key = value.split('/')[0]; // text-lg/7 (size/leading), text-ink/50 (colour/opacity)
  if (SIZE_KEYS.has(key) || /^\[\d/.test(value)) return 'size'; // text-[18px]
  return COLOR_KEYS.has(key) ? 'color' : null;
}

/**
 * NativeWind resolves conflicting classes by STYLESHEET order, not className order — and
 * Tailwind emits same-plugin utilities alphabetically (text-2xl < text-base < text-xs), so a
 * caller's `text-lg` would silently lose to a variant's `text-xs`. Drop the variant's class in
 * every group the caller sets, so caller classes always win.
 */
export function resolveTextClasses(variant: TextVariant, className?: string): string {
  const base = VARIANT[variant];
  if (!className) return base;
  const overridden = new Set(className.split(/\s+/).map(conflictGroup));
  const kept = base.split(' ').filter((cls) => {
    const group = conflictGroup(cls);
    return group === null || !overridden.has(group);
  });
  return cn(kept.join(' '), className);
}

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  className?: string;
}

export function Text({ variant = 'body', className, ...rest }: TextProps) {
  return <RNText className={resolveTextClasses(variant, className)} {...rest} />;
}
