/**
 * Tiny className joiner (clsx-lite). Filters falsy values so conditional classes
 * read cleanly: cn('base', isActive && 'bg-brand-500', error && 'border-danger').
 * Caller-provided classes are placed last by convention so they take precedence.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
