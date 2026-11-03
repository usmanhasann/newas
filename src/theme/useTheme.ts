/**
 * useTheme() — runtime access to design tokens for dynamic styles (e.g. mood colors
 * resolved at runtime, gradient arrays, shadow objects) where a NativeWind className
 * isn't enough. Static styling should prefer NativeWind classes (token-driven).
 *
 * Currently a single light theme (the design spec is light-only). Dark mode is a
 * documented follow-up that needs design sign-off before the dark palette is invented.
 */
import { tokens, type Tokens } from './tokens';

export type Theme = Tokens;

export const theme: Theme = tokens;

export function useTheme(): Theme {
  return theme;
}
