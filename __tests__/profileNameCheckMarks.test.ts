/**
 * Client revisions 10/14 p.5 (N7.22): names can't include check marks, account creation included.
 * A name the app fills in from Google / Apple (or the sign-up) is saved WITHOUT the symbols rather
 * than refused (the database refuses an app write that has one), so a new account still always
 * gets a name (O1 / O5).
 */
import { displayNameToSave } from '@features/profile/api';

jest.mock('@lib', () => ({ supabase: {} }));

const email = 'konah.q@gmail.com';

it('takes check marks out of a provider name before saving it', () => {
  expect(displayNameToSave(null, 'Ana ✅ Lee', email, true)).toBe('Ana Lee');
  expect(displayNameToSave('', ' Taylor Swift ✔️ ', email, false)).toBe('Taylor Swift');
  expect(displayNameToSave(null, '☑️Konah', email, true)).toBe('Konah');
});

it('a name that is only check marks counts as no name (email fallback when allowed)', () => {
  expect(displayNameToSave(null, '✓ ✔', email, true)).toBe('konah.q');
  expect(displayNameToSave(null, '✅', email, false)).toBeNull();
});

it('still never overwrites a name that is already there', () => {
  expect(displayNameToSave('Konah', 'Konah ✅', email, true)).toBeNull();
});
