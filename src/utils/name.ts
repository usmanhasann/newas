/**
 * First word of a profile display name — "Konah Quittman" → "Konah". Used wherever the app
 * addresses the user by name (Home greeting, "[Name]’s Circle"). Null when there's no usable name.
 */
export function firstName(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first || null;
}
