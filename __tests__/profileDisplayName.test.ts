/**
 * Client 10/14 p.3 + p.10: every account gets a real name from the start, a name the user set is
 * never overwritten, and when no name exists at all the email's first part is used (fallback
 * chosen 2026-10-16). Also locks the review fixes: the sync targets the account signed in NOW,
 * Apple's held name only ever lands on its own account, a Google name on the identity is used,
 * Apple's name kept on the phone is used (and then deleted), and the write only lands while the
 * name is still empty.
 */
import { displayNameToSave, emailStart, syncDisplayNameFromAuth } from '@features/profile/api';
import { usePendingNameStore } from '@store/pendingName';
import { rememberAppleName } from '@store/appleName';

type Row = { user_id: string; display_name: string | null };
type MockUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
  identities?: { provider: string; identity_data: Record<string, unknown> }[];
};
const mockState: {
  user: MockUser | null;
  profile: Row | null;
  /** Simulates the user saving a name in Edit Profile between our read and our write. */
  nameSavedMeanwhile: string | null;
  updates: { userId: string; patch: Record<string, unknown>; onlyIfEmpty: boolean }[];
} = { user: null, profile: null, nameSavedMeanwhile: null, updates: [] };

jest.mock('@lib', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: mockState.user } }) },
    from: () => {
      let patch: Record<string, unknown> | null = null;
      let userId = '';
      let onlyIfEmpty = false;
      const q = {
        select: () => q,
        update: (p: Record<string, unknown>) => {
          patch = p;
          return q;
        },
        eq: (_col: string, v: string) => {
          userId = v;
          return q;
        },
        or: (filter: string) => {
          onlyIfEmpty = filter === 'display_name.is.null,display_name.eq.';
          return q;
        },
        maybeSingle: () => {
          const row = mockState.profile && mockState.profile.user_id === userId ? mockState.profile : null;
          if (!patch) return Promise.resolve({ data: row, error: null });
          mockState.updates.push({ userId, patch, onlyIfEmpty });
          if (mockState.nameSavedMeanwhile && onlyIfEmpty) return Promise.resolve({ data: null, error: null });
          return Promise.resolve({ data: { ...row, ...patch, user_id: userId }, error: null });
        },
      };
      return q;
    },
  },
}));

const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage');

beforeEach(async () => {
  mockState.user = null;
  mockState.profile = null;
  mockState.nameSavedMeanwhile = null;
  mockState.updates = [];
  usePendingNameStore.getState().clear();
  await AsyncStorage.clear();
});

describe('emailStart', () => {
  it('is the part before @, or null', () => {
    expect(emailStart('konah.q@gmail.com')).toBe('konah.q');
    expect(emailStart('x8k2qf9w@privaterelay.appleid.com')).toBe('x8k2qf9w');
    expect(emailStart('')).toBeNull();
    expect(emailStart(null)).toBeNull();
    expect(emailStart(undefined)).toBeNull();
  });
});

describe('displayNameToSave', () => {
  const email = 'konah.q@gmail.com';
  it('fills an empty profile name with the real name', () => {
    expect(displayNameToSave(null, 'Konah Quittman', email, true)).toBe('Konah Quittman');
    expect(displayNameToSave('   ', ' Konah Quittman ', email, false)).toBe('Konah Quittman');
  });
  it('without a real name, the email’s first part only when the fallback is allowed', () => {
    expect(displayNameToSave(null, null, email, true)).toBe('konah.q');
    expect(displayNameToSave('', '  ', email, true)).toBe('konah.q');
    expect(displayNameToSave(null, null, email, false)).toBeNull();
  });
  it('without a name or an email (anonymous onboarding user) there is nothing to save', () => {
    expect(displayNameToSave(null, null, null, true)).toBeNull();
  });
  it('never overwrites a name that is already there, whatever it is', () => {
    expect(displayNameToSave('Sam', 'Samuel', 'sam@x.com', true)).toBeNull(); // user's own short name
    expect(displayNameToSave('konah.q', 'Konah Quittman', email, true)).toBeNull();
    expect(displayNameToSave('KQ', null, email, true)).toBeNull();
  });
});

describe('syncDisplayNameFromAuth', () => {
  const fill = (name: string) => [{ userId: expect.any(String), patch: { display_name: name }, onlyIfEmpty: true }];

  it('writes to the account signed in NOW, only while its name is still empty', async () => {
    mockState.user = { id: 'real-user', email: 'konah.q@gmail.com', user_metadata: {} };
    mockState.profile = { user_id: 'real-user', display_name: null };
    const out = await syncDisplayNameFromAuth('Konah Quittman');
    expect(mockState.updates).toEqual([{ userId: 'real-user', patch: { display_name: 'Konah Quittman' }, onlyIfEmpty: true }]);
    expect(out?.user_id).toBe('real-user');
  });

  it('a name the user saved in the meantime wins (the fill lands on no row)', async () => {
    mockState.user = { id: 'u1', email: 'kay@x.com', user_metadata: {} };
    mockState.profile = { user_id: 'u1', display_name: null };
    mockState.nameSavedMeanwhile = 'Kay';
    expect(await syncDisplayNameFromAuth()).toBeNull();
  });

  it('name order: given name, Apple’s held name, display_name, Google’s full_name, name', async () => {
    mockState.user = {
      id: 'u1',
      email: 'a@b.com',
      user_metadata: { display_name: 'Typed Name', full_name: 'Google Full', name: 'Google Name' },
    };
    const run = async () => {
      mockState.profile = { user_id: 'u1', display_name: null };
      mockState.updates = [];
      await syncDisplayNameFromAuth();
      return mockState.updates[0]?.patch.display_name;
    };
    usePendingNameStore.getState().set('Apple Name');
    mockState.profile = { user_id: 'u1', display_name: null };
    await syncDisplayNameFromAuth('Given Name');
    expect(mockState.updates[0].patch.display_name).toBe('Given Name');
    expect(usePendingNameStore.getState().name).toBeNull(); // the profile has a name now

    usePendingNameStore.getState().set('Apple Name');
    expect(await run()).toBe('Apple Name');
    expect(usePendingNameStore.getState().name).toBeNull(); // used, then dropped
    expect(await run()).toBe('Typed Name');
    mockState.user.user_metadata = { full_name: 'Google Full', name: 'Google Name' };
    expect(await run()).toBe('Google Full');
    mockState.user.user_metadata = { name: 'Google Name' };
    expect(await run()).toBe('Google Name');
  });

  it('falls back to the email’s first part only when allowed (the default for sign-in callers)', async () => {
    mockState.user = { id: 'u1', email: 'x8k2qf9w@privaterelay.appleid.com', user_metadata: {} };
    mockState.profile = { user_id: 'u1', display_name: '' };
    expect(await syncDisplayNameFromAuth(undefined, { allowEmailFallback: false })).toBeNull();
    expect(mockState.updates).toEqual([]);
    await syncDisplayNameFromAuth();
    expect(mockState.updates).toEqual(fill('x8k2qf9w'));
  });

  it('does not touch a name the user set', async () => {
    usePendingNameStore.getState().set('Apple Name');
    mockState.user = { id: 'u1', email: 'a@b.com', user_metadata: { full_name: 'Google Full' } };
    mockState.profile = { user_id: 'u1', display_name: 'My Own Name' };
    expect(await syncDisplayNameFromAuth('Typed')).toBeNull();
    expect(mockState.updates).toEqual([]);
  });

  // Review finding: a Google link may store the name only on the identity, not the account.
  it('uses the name on a linked Google identity when the account itself has none', async () => {
    mockState.user = {
      id: 'u1',
      email: 'konahbluequittman@gmail.com',
      user_metadata: {},
      identities: [
        { provider: 'email', identity_data: {} },
        { provider: 'google', identity_data: { full_name: 'Konah Quittman', name: 'Konah Q' } },
      ],
    };
    mockState.profile = { user_id: 'u1', display_name: null };
    await syncDisplayNameFromAuth();
    expect(mockState.updates).toEqual(fill('Konah Quittman'));
  });

  // Review finding: Apple's name saved on the phone must win over the email fallback after a
  // relaunch (the save on the account failed), and be deleted once it is on the profile.
  it('uses Apple’s name kept on the phone for this account’s Apple ID, then deletes it', async () => {
    await rememberAppleName('apple-sub-1', 'Konah Quittman');
    mockState.user = {
      id: 'u1',
      email: 'x8k2qf9w@privaterelay.appleid.com',
      user_metadata: {},
      identities: [{ provider: 'apple', identity_data: { sub: 'apple-sub-1' } }],
    };
    mockState.profile = { user_id: 'u1', display_name: null };
    await syncDisplayNameFromAuth();
    expect(mockState.updates).toEqual(fill('Konah Quittman'));
    expect(await AsyncStorage.getItem('lysm.appleName.apple-sub-1')).toBeNull();
  });

  it('another account’s kept Apple name is never used', async () => {
    await rememberAppleName('apple-sub-OTHER', 'Someone Else');
    mockState.user = {
      id: 'u1',
      email: 'lee@x.com',
      user_metadata: {},
      identities: [{ provider: 'apple', identity_data: { sub: 'apple-sub-1' } }],
    };
    mockState.profile = { user_id: 'u1', display_name: null };
    await syncDisplayNameFromAuth();
    expect(mockState.updates).toEqual(fill('lee'));
  });

  // Review finding: the held Apple name must never land on another person's profile.
  it('a held Apple name is used only for the account it belongs to', async () => {
    usePendingNameStore.getState().set('Apple Person');
    usePendingNameStore.getState().claim('someone-else');
    mockState.user = { id: 'u2', email: 'lee@x.com', user_metadata: { full_name: 'Lee Park' } };
    mockState.profile = { user_id: 'u2', display_name: null };
    await syncDisplayNameFromAuth();
    expect(mockState.updates[0].patch.display_name).toBe('Lee Park');
    expect(usePendingNameStore.getState().name).toBe('Apple Person'); // not this account's to drop
  });

  it('held and kept Apple names are dropped when their account already has a name', async () => {
    usePendingNameStore.getState().set('Apple Person');
    usePendingNameStore.getState().claim('u3');
    await rememberAppleName('apple-sub-3', 'Apple Person');
    mockState.user = {
      id: 'u3',
      email: 'a@b.com',
      user_metadata: {},
      identities: [{ provider: 'apple', identity_data: { sub: 'apple-sub-3' } }],
    };
    mockState.profile = { user_id: 'u3', display_name: 'Already Named' };
    expect(await syncDisplayNameFromAuth()).toBeNull();
    expect(usePendingNameStore.getState().name).toBeNull();
    expect(await AsyncStorage.getItem('lysm.appleName.apple-sub-3')).toBeNull();
  });

  it('does nothing without a signed-in account or a profile row', async () => {
    expect(await syncDisplayNameFromAuth('X')).toBeNull();
    mockState.user = { id: 'u1', email: 'a@b.com' };
    expect(await syncDisplayNameFromAuth('X')).toBeNull();
    expect(mockState.updates).toEqual([]);
  });
});
