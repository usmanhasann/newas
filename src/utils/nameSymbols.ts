/**
 * Names can't carry check marks (client revisions 10/14 p.5, N7): only an admin gives out the
 * verified badge, so nobody may fake it by typing ✓ ✔ ☑ ✅ ☑️ (or a look-alike) into their name.
 * Checked when an account is created and in Edit Profile; the database re-checks every save
 * (migration 20261022060000_verified_badges: the same list, keep the two in step).
 */
import { z } from 'zod';

/** Shown under the name field when a name has one of the symbols (client's exact words). */
export const NAME_CHECK_MARK_MESSAGE = 'Names can’t include check marks or verification symbols.';

/** The sign-up form's message for an empty name (Edit Profile uses it too). */
export const NAME_REQUIRED_MESSAGE = 'Your name helps personalize LYSM';

/**
 * The symbols, each with an optional emoji / text variation selector after it (✔️ ☑️):
 * ✓ U+2713, ✔ U+2714, ✅ U+2705, ☑ U+2611, 🗸 U+1F5F8, 🗹 U+1F5F9, ⍻ U+237B, √ U+221A,
 * 𐄂 U+10102, 🮱 U+1FBB1.
 */
const CHECK_MARK = /[\u2713\u2714\u2705\u2611\u{1F5F8}\u{1F5F9}\u237B\u221A\u{10102}\u{1FBB1}][\uFE0E\uFE0F]?/u;
const CHECK_MARKS = new RegExp(CHECK_MARK.source, 'gu');

/** Whether a name has a check mark or verification symbol in it. */
export function hasCheckMark(name: string | null | undefined): boolean {
  return !!name && CHECK_MARK.test(name);
}

/**
 * The name without those symbols, spaces tidied ("Ana ✅ Lee" → "Ana Lee"). Used for names the
 * user didn't type here (Google / Apple), so they still get saved rather than refused.
 */
export function stripCheckMarks(name: string): string {
  return name.replace(CHECK_MARKS, '').replace(/\s{2,}/g, ' ').trim();
}

/** A display name: required, and no check marks. For the sign-up forms (Zod). */
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, NAME_REQUIRED_MESSAGE)
  .refine((v) => !hasCheckMark(v), NAME_CHECK_MARK_MESSAGE);

/** The database refused a name with a check mark (its error message is this code). */
export function isCheckMarkRefusal(error: unknown): boolean {
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' && message.includes('name_has_check_mark');
}
