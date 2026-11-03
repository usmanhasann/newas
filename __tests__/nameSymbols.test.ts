/**
 * Client revisions 10/14 p.5 (N7.20 to N7.23): names can't include check marks or verification
 * symbols, so nobody fakes the verified badge by typing one. The shared check behind the sign-up
 * forms (displayNameSchema) and Edit Profile, and the clean-up used for Google / Apple names.
 */
import {
  NAME_CHECK_MARK_MESSAGE,
  NAME_REQUIRED_MESSAGE,
  displayNameSchema,
  hasCheckMark,
  isCheckMarkRefusal,
  stripCheckMarks,
} from '@utils/nameSymbols';

describe('the message (client’s exact words)', () => {
  it('reads exactly, with the app’s curly apostrophe', () => {
    expect(NAME_CHECK_MARK_MESSAGE).toBe('Names can’t include check marks or verification symbols.');
    expect(NAME_CHECK_MARK_MESSAGE.charCodeAt(9)).toBe(0x2019);
  });
});

describe('hasCheckMark', () => {
  // The client's list (✓, ✔, ☑, ✅, ☑️), the emoji form of ✔, and the look-alikes.
  it.each(['✓', '✔', '☑', '✅', '☑️', '✔️', '🗸', '🗹', '⍻', '√', '𐄂', '🮱'])(
    'finds %s anywhere in a name',
    (mark) => {
      expect(hasCheckMark(`Taylor ${mark}`)).toBe(true);
      expect(hasCheckMark(`${mark}Taylor`)).toBe(true);
      expect(hasCheckMark(`Tay${mark}lor Swift`)).toBe(true);
    },
  );

  it('leaves ordinary names alone, emoji and accents included', () => {
    for (const name of ['Konah Quittman', 'Zoë Saldaña', 'Ana 🌿', 'Checkmate', 'V', 'Li ✗', '李小龍']) {
      expect(hasCheckMark(name)).toBe(false);
    }
    expect(hasCheckMark(null)).toBe(false);
    expect(hasCheckMark('')).toBe(false);
  });
});

describe('stripCheckMarks (names from Google / Apple)', () => {
  it('takes the symbols out and tidies the spaces', () => {
    expect(stripCheckMarks('Ana ✅ Lee ✔️')).toBe('Ana Lee');
    expect(stripCheckMarks('  ☑️Taylor  Swift ✓ ')).toBe('Taylor Swift');
    expect(stripCheckMarks('✓✔☑️')).toBe('');
    expect(stripCheckMarks('Ana 🌿')).toBe('Ana 🌿');
  });
});

describe('displayNameSchema (sign-up forms)', () => {
  it('refuses a check mark with the client’s message', () => {
    const r = displayNameSchema.safeParse('Taylor ✅');
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(NAME_CHECK_MARK_MESSAGE);
  });
  it('still asks for a name when it is empty', () => {
    const r = displayNameSchema.safeParse('   ');
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(NAME_REQUIRED_MESSAGE);
  });
  it('accepts an ordinary name, trimmed', () => {
    expect(displayNameSchema.parse('  Konah Quittman ')).toBe('Konah Quittman');
  });
});

describe('isCheckMarkRefusal (the database said no)', () => {
  it('recognises the server’s refusal and nothing else', () => {
    expect(isCheckMarkRefusal({ code: '22023', message: 'name_has_check_mark' })).toBe(true);
    expect(isCheckMarkRefusal(new Error('name_has_check_mark'))).toBe(true);
    expect(isCheckMarkRefusal({ message: 'network down' })).toBe(false);
    expect(isCheckMarkRefusal(null)).toBe(false);
    expect(isCheckMarkRefusal('name_has_check_mark')).toBe(false);
  });
});
