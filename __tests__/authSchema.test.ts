import { loginSchema, signupSchema, resetPasswordSchema } from '@features/auth/schema';

describe('auth schemas', () => {
  it('rejects an invalid login email', () => {
    expect(loginSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
  });

  it('accepts a valid login', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'secret' }).success).toBe(
      true,
    );
  });

  it('requires an 8+ character signup password', () => {
    const r = signupSchema.safeParse({
      displayName: 'Sam',
      email: 'a@b.com',
      password: 'short',
    });
    expect(r.success).toBe(false);
  });

  // Client 10/14 p.5 (N7.20 to N7.22): no check marks in a name when creating an account.
  it('refuses a signup name with a check mark, with the client’s message', () => {
    for (const mark of ['✓', '✔', '☑', '✅', '☑️']) {
      const r = signupSchema.safeParse({
        displayName: `Taylor ${mark}`,
        email: 'a@b.com',
        password: 'abcdefgh',
      });
      expect(r.success).toBe(false);
      expect(r.error?.issues).toEqual([
        expect.objectContaining({
          path: ['displayName'],
          message: 'Names can’t include check marks or verification symbols.',
        }),
      ]);
    }
  });

  it('still requires a signup name, and trims it', () => {
    const empty = signupSchema.safeParse({
      displayName: '  ',
      email: 'a@b.com',
      password: 'abcdefgh',
    });
    expect(empty.error?.issues[0]?.message).toBe('Your name helps personalize LYSM');
    const ok = signupSchema.parse({
      displayName: ' Sam ',
      email: 'a@b.com',
      password: 'abcdefgh',
    });
    expect(ok.displayName).toBe('Sam');
  });

  it('requires matching reset passwords', () => {
    expect(
      resetPasswordSchema.safeParse({ password: 'abcdefgh', confirm: 'abcdefgi' })
        .success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ password: 'abcdefgh', confirm: 'abcdefgh' })
        .success,
    ).toBe(true);
  });

  it('normalizes invite codes to upper-case without spaces', () => {
    const r = signupSchema.parse({
      displayName: 'Sam',
      email: 'a@b.com',
      password: 'abcdefgh',
      inviteCode: ' ab-12 ',
    });
    expect(r.inviteCode).toBe('AB-12');
  });
});
