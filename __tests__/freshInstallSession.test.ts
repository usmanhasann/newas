/**
 * App deleted and reinstalled = a brand-new user (client revisions 10/14 p.38, N16.28). iOS keeps the
 * Keychain (where the session is saved, in chunks) after the app is deleted; AsyncStorage is wiped.
 *  - Fresh install (AsyncStorage empty, no marker): the saved session is cleared BEFORE anything can
 *    read it, then the install marker is written.
 *  - Update from a version without the marker (AsyncStorage holds the app's other keys): the person
 *    stays signed in; the marker is written.
 *  - Marker present: nothing is touched. Failures never sign anyone out by mistake.
 * The Keychain is an in-memory stand-in; AsyncStorage is the package's own Jest mock.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  INSTALL_MARKER_KEY,
  clearSessionOnFreshInstall,
  secureStorage,
  withFreshInstallCheck,
} from '@lib/secureStorage';

const mockKeychain = new Map<string, string>();
const mockDeleteFails = { value: false };
// The failure cases log a warning on purpose.
jest.spyOn(console, 'warn').mockImplementation(() => {});

jest.mock('expo-secure-store', () => ({
  getItemAsync: (k: string) => Promise.resolve(mockKeychain.get(k) ?? null),
  setItemAsync: (k: string, v: string) => {
    mockKeychain.set(k, v);
    return Promise.resolve();
  },
  deleteItemAsync: (k: string) => {
    if (mockDeleteFails.value) return Promise.reject(new Error('keychain locked'));
    mockKeychain.delete(k);
    return Promise.resolve();
  },
}));

const KEY = 'sb-proj-auth-token';
const SESSION_KEYS = [KEY, `${KEY}-code-verifier`, `${KEY}-user`];
// Longer than one SecureStore chunk, so it is saved in parts.
const OLD_SESSION = JSON.stringify({ access_token: 'old'.repeat(900), refresh_token: 'r' });

async function seedOldInstall() {
  await secureStorage.setItem(KEY, OLD_SESSION);
  await secureStorage.setItem(`${KEY}-code-verifier`, 'verifier');
}

beforeEach(async () => {
  mockKeychain.clear();
  mockDeleteFails.value = false;
  await AsyncStorage.clear();
  jest.mocked(AsyncStorage.getAllKeys).mockClear();
});

it('a fresh install clears the old session before the first read, then writes the marker', async () => {
  await seedOldInstall();
  expect(mockKeychain.get(KEY)).toBe('__chunked__');
  expect(mockKeychain.size).toBeGreaterThan(3); // head + count + chunks + verifier

  const storage = withFreshInstallCheck(secureStorage, SESSION_KEYS);
  // The very first read (what the Supabase client does at startup) already sees no session.
  await expect(storage.getItem(KEY)).resolves.toBeNull();
  await expect(storage.getItem(`${KEY}-code-verifier`)).resolves.toBeNull();
  expect(mockKeychain.size).toBe(0); // every chunk is gone
  expect(await AsyncStorage.getItem(INSTALL_MARKER_KEY)).toEqual(expect.any(String));

  // A new sign-in on this launch is kept.
  await storage.setItem(KEY, 'new-session');
  await expect(storage.getItem(KEY)).resolves.toBe('new-session');
});

it('an update from a version without the marker keeps the person signed in', async () => {
  await seedOldInstall();
  await AsyncStorage.setItem('journal.daily_prompt.v1', '[]');

  const storage = withFreshInstallCheck(secureStorage, SESSION_KEYS);
  await expect(storage.getItem(KEY)).resolves.toBe(OLD_SESSION);
  await expect(storage.getItem(`${KEY}-code-verifier`)).resolves.toBe('verifier');
  expect(await AsyncStorage.getItem(INSTALL_MARKER_KEY)).toEqual(expect.any(String));
});

it('once the marker is there, later launches never touch the session', async () => {
  await seedOldInstall();
  await AsyncStorage.setItem(INSTALL_MARKER_KEY, '2026-10-21T00:00:00.000Z');

  await expect(clearSessionOnFreshInstall(secureStorage, SESSION_KEYS)).resolves.toBe(false);
  await expect(secureStorage.getItem(KEY)).resolves.toBe(OLD_SESSION);
  expect(await AsyncStorage.getItem(INSTALL_MARKER_KEY)).toBe('2026-10-21T00:00:00.000Z');
});

it('decides once per launch, however many reads arrive at the same time', async () => {
  await seedOldInstall();
  const storage = withFreshInstallCheck(secureStorage, SESSION_KEYS);
  const reads = await Promise.all([storage.getItem(KEY), storage.getItem(KEY), storage.getItem(KEY)]);
  expect(reads).toEqual([null, null, null]);
  expect(AsyncStorage.getAllKeys).toHaveBeenCalledTimes(1);
});

it('AsyncStorage unreadable: nothing is cleared and no marker is written', async () => {
  await seedOldInstall();
  jest.mocked(AsyncStorage.getAllKeys).mockRejectedValueOnce(new Error('disk'));

  const storage = withFreshInstallCheck(secureStorage, SESSION_KEYS);
  await expect(storage.getItem(KEY)).resolves.toBe(OLD_SESSION);
  expect(await AsyncStorage.getItem(INSTALL_MARKER_KEY)).toBeNull();
});

it('Keychain refuses the delete: no marker, so the next launch tries again; the app still runs', async () => {
  await seedOldInstall();
  mockDeleteFails.value = true;
  await expect(clearSessionOnFreshInstall(secureStorage, SESSION_KEYS)).resolves.toBe(true);
  expect(await AsyncStorage.getItem(INSTALL_MARKER_KEY)).toBeNull();

  // Next launch, Keychain working again: still a fresh install, so it's cleared now.
  mockDeleteFails.value = false;
  const storage = withFreshInstallCheck(secureStorage, SESSION_KEYS);
  await expect(storage.getItem(KEY)).resolves.toBeNull();
  expect(await AsyncStorage.getItem(INSTALL_MARKER_KEY)).toEqual(expect.any(String));
});
