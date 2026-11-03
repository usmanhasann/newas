/**
 * Profile bio limit: 150 characters, spaces included. Enforced as the input's `maxLength`, so typing
 * (and pasting) simply stops at the cap rather than letting the user go over and blocking Save.
 * Counts the same way the native `maxLength` does (string length), so the counter and the cap agree.
 */
export const BIO_MAX_LENGTH = 150;

/**
 * The live counter under the bio field, e.g. "42/150": the same format as the circle description
 * counter (client 10/14 p.29: "0/150, 45/150", styled like the bio's), so the two read alike.
 */
export function bioCounter(bio: string): string {
  return `${bio.length}/${BIO_MAX_LENGTH}`;
}
