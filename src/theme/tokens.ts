/**
 * Typed access to the design tokens.
 * The raw values live in ./tokens.cjs (single source of truth, also consumed by
 * tailwind.config.js). This module re-exports them with TypeScript types so app
 * code gets autocompletion + safety. Do not duplicate token values here.
 */
import tokens from './tokens.cjs';

export type Tokens = typeof tokens;

export const {
  colors,
  spacing,
  borderRadius,
  fontFamily,
  fontSize,
  letterSpacing,
  shadow,
  gradient,
  blur,
} = tokens;

export { tokens };
export default tokens;
