/**
 * Account linking copy (N4, client revisions 10/14 p.15-16): exact text, curly apostrophes, and no
 * dash punctuation anywhere (client rule).
 */
import {
  HAVE_ACCOUNT_TITLE,
  PASSWORD_SET_MESSAGE,
  PASSWORD_SET_SIGN_IN_MESSAGE,
  haveAccountMessage,
  linkProblemMessage,
  linkScreenCopy,
  linkedMessage,
  notLinkedMessage,
} from '@features/auth/linkMessages';
import type { PendingLink } from '@features/auth/linking';

const apple = { provider: 'apple' as const, idToken: 't', email: null };
const google = { provider: 'google' as const, idToken: 't', email: null };

const all: string[] = [];
const keep = (s: string) => {
  all.push(s);
  return s;
};

it('"Already have a LYSM account?" names what could not be matched', () => {
  expect(keep(HAVE_ACCOUNT_TITLE)).toBe('Already have a LYSM account?');
  expect(
    keep(
      haveAccountMessage({
        kind: 'fallback',
        origin: 'signin',
        relay: true,
        attempt: apple,
      }),
    ),
  ).toBe(
    'This Apple ID hides its email, so we couldn’t match it to a LYSM account. If you already have one, sign in to it and we’ll add Apple to it.',
  );
  expect(
    keep(
      haveAccountMessage({
        kind: 'fallback',
        origin: 'onboarding',
        relay: false,
        attempt: apple,
      }),
    ),
  ).toBe(
    'We didn’t find a LYSM account for this Apple ID. If you already have one, sign in to it and we’ll add Apple to it.',
  );
});

it('each linking screen says which account and which proof', () => {
  const link = (l: PendingLink, step?: 'prove' | 'password') => {
    const c = linkScreenCopy(l, step);
    keep(c.title);
    keep(c.subtitle);
    return c;
  };
  expect(
    link({
      kind: 'link',
      origin: 'signin',
      attempt: google,
      email: 'sam@example.com',
      method: 'password',
    }),
  ).toEqual({
    title: 'Link your account',
    subtitle:
      'There’s already a LYSM account for sam@example.com. Enter its password to confirm it’s you, and we’ll add Google to it.',
  });
  expect(
    link({
      kind: 'link',
      origin: 'signin',
      attempt: apple,
      email: 'gina@example.com',
      method: 'google',
    }),
  ).toEqual({
    title: 'Link your account',
    subtitle:
      'There’s already a LYSM account for gina@example.com that signs in with Google. Continue with Google to confirm it’s you, and we’ll add Apple to it.',
  });
  expect(
    link({ kind: 'fallback', origin: 'signin', relay: true, attempt: apple }),
  ).toEqual({
    title: 'Link your account',
    subtitle:
      'Sign in to your LYSM account the way you usually do, and we’ll add Apple to it.',
  });
  const setLink: PendingLink = {
    kind: 'set_password',
    origin: 'signin',
    email: 'abe@example.com',
    provider: 'apple',
  };
  expect(link(setLink)).toEqual({
    title: 'Confirm it’s you',
    subtitle:
      'abe@example.com signs in with Apple. Continue with Apple to confirm it’s you, then create a password so you can also sign in with your email.',
  });
  expect(link(setLink, 'password')).toEqual({
    title: 'Create a password',
    subtitle:
      'Thanks, that’s confirmed. Create a password for abe@example.com. You can keep using Apple too.',
  });
});

it('results and problems', () => {
  expect(keep(linkedMessage('apple'))).toBe(
    'You’re in. Apple now opens this account too.',
  );
  expect(keep(notLinkedMessage('google'))).toBe(
    'You’re signed in, but we couldn’t add Google this time. Try Google again next time you sign in.',
  );
  expect(keep(PASSWORD_SET_MESSAGE)).toBe(
    'Your password is set. You can now sign in with your email and password too.',
  );
  expect(keep(PASSWORD_SET_SIGN_IN_MESSAGE)).toBe(
    'Your password is set. Please sign in with your email and new password.',
  );
  expect(keep(linkProblemMessage('wrong_password'))).toBe(
    'That password isn’t right. Please try again.',
  );
  expect(keep(linkProblemMessage('no_account', 'google'))).toBe(
    'We couldn’t find a LYSM account for that Google account. Try another way to sign in.',
  );
  expect(keep(linkProblemMessage('reauth_mismatch'))).toBe(
    'That isn’t the account linked to LYSM. Try again with the account you use for LYSM.',
  );
  expect(keep(linkProblemMessage('wrong_provider', 'apple'))).toBe(
    'Please confirm with Apple, the sign-in this account was created with.',
  );
  expect(keep(linkProblemMessage('invalid_ticket'))).toBe(
    'That took too long. Please confirm it’s you again.',
  );
  expect(keep(linkProblemMessage('has_password'))).toBe(
    'This account already has a password. Sign in with your email and password.',
  );
  for (const r of [
    'reauth_expired',
    'reauth_unavailable',
    'too_many_attempts',
    'too_many',
    'weak_password',
    'unknown',
  ] as const) {
    expect(keep(linkProblemMessage(r)).length).toBeGreaterThan(5);
  }
});

it('no dash punctuation and only curly apostrophes', () => {
  expect(all.length).toBeGreaterThan(20);
  for (const s of all) {
    expect(s).not.toMatch(/[–—]| - /);
    expect(s).not.toMatch(/'/);
  }
});
