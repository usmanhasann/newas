/**
 * The app's real Supabase client and the reinstall rule (client revisions 10/14 p.38, N16.28), one
 * app launch per isolated module registry:
 *  - the key it saves the session under is exactly supabase-js's own default, so naming it changes
 *    nothing for anyone already signed in;
 *  - fresh install (empty AsyncStorage) with a session left in the iOS Keychain: the client starts
 *    signed out and the old session is gone;
 *  - update from a version without the install marker: the same session is restored as before.
 * The Keychain is an in-memory stand-in that survives "reinstalls", as on iOS.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage';

const mockKeychain = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: (k: string) => Promise.resolve(mockKeychain.get(k) ?? null),
  setItemAsync: (k: string, v: string) => {
    mockKeychain.set(k, v);
    return Promise.resolve();
  },
  deleteItemAsync: (k: string) => {
    mockKeychain.delete(k);
    return Promise.resolve();
  },
}));

type Launch = {
  supabase: SupabaseClient;
  SESSION_STORAGE_KEY: string;
  asyncStorageKeys: () => Promise<readonly string[]>;
};

/**
 * One app launch in a fresh module registry: AsyncStorage starts as given (empty = just installed),
 * the Keychain as the previous install left it. The client module is loaded after that, as on a
 * real start.
 */
async function launch(asyncStorage: Record<string, string>): Promise<Launch> {
  let out: Launch | undefined;
  await jest.isolateModulesAsync(async () => {
    // require, not import(): each launch needs its own module registry, and Jest runs dynamic
    // import() only with --experimental-vm-modules.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store = require('@react-native-async-storage/async-storage') as AsyncStorageStatic;
    for (const [k, v] of Object.entries(asyncStorage)) await store.setItem(k, v);
    // A slow first look at AsyncStorage (a busy phone at startup): the client must still wait for
    // the install check before it reads the Keychain.
    jest.mocked(store.getAllKeys).mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return store.getAllKeys();
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require('@lib/supabase') as typeof import('@lib/supabase');
    out = {
      supabase: lib.supabase as unknown as SupabaseClient,
      SESSION_STORAGE_KEY: lib.SESSION_STORAGE_KEY,
      asyncStorageKeys: () => store.getAllKeys(),
    };
  });
  if (!out) throw new Error('launch failed');
  return out;
}

function session() {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: 'access-old',
    refresh_token: 'refresh-old',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    user: {
      id: '00000000-0000-0000-0000-000000000001',
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}

beforeEach(() => mockKeychain.clear());

it('saves the session under supabase-js’s own default key', async () => {
  // A hosted project's URL shape (the test default is localhost).
  const testUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcdefghijklmnop.supabase.co';
  let key: string;
  try {
    key = (await launch({ 'journal.daily_prompt.v1': '[]' })).SESSION_STORAGE_KEY;
  } finally {
    process.env.EXPO_PUBLIC_SUPABASE_URL = testUrl;
  }
  const { createClient } = jest.requireActual<typeof import('@supabase/supabase-js')>(
    '@supabase/supabase-js',
  );
  const plain = createClient('https://abcdefghijklmnop.supabase.co', 'anon', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect(key).toBe((plain as unknown as { storageKey: string }).storageKey);
  expect(key).toBe('sb-abcdefghijklmnop-auth-token');
});

it('a reinstall starts signed out; an update stays signed in', async () => {
  // The key the client uses (same value on every launch).
  const { SESSION_STORAGE_KEY: key } = await launch({ 'journal.daily_prompt.v1': '[]' });

  // Update from a version without the marker: other keys in AsyncStorage, session in the Keychain.
  mockKeychain.clear();
  mockKeychain.set(key, JSON.stringify(session()));
  const updated = await launch({ 'journal.daily_prompt.v1': '[]' });
  const kept = await updated.supabase.auth.getSession();
  expect(kept.data.session?.access_token).toBe('access-old');
  expect(await updated.asyncStorageKeys()).toContain('lysm.install.v1');

  // Deleted and reinstalled: AsyncStorage is empty, the Keychain still holds the session.
  mockKeychain.clear();
  mockKeychain.set(key, JSON.stringify(session()));
  const reinstalled = await launch({});
  const fresh = await reinstalled.supabase.auth.getSession();
  expect(fresh.data.session).toBeNull();
  expect(mockKeychain.has(key)).toBe(false);
  expect(await reinstalled.asyncStorageKeys()).toContain('lysm.install.v1');
});
