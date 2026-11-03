/**
 * Apple shares the user's name ONLY on the very first authorization an Apple ID grants this app
 * (client 10/14 p.10: "it can't be fixed after the fact"). If anything after the Apple sheet fails
 * (the sign-in call, saving the name on the account, filling the profile, the app being closed),
 * the name would be gone for good. So it is kept on the phone, keyed by the Apple user id (the
 * `sub` of the account's Apple identity), until it is on the profile:
 *  - a later Apple sheet from the same Apple ID that comes back without a name reuses it;
 *  - the profile name fill (profile/api.syncDisplayNameFromAuth) reads it for the signed-in
 *    account's Apple identity, ahead of the email fallback, and deletes it once the profile has it.
 * Personal data is kept no longer than needed: removed once used, on sign-out and Delete Account,
 * and ignored + removed after 48 hours.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerSignOutTask } from './signOutTasks';

const PREFIX = 'lysm.appleName.';
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const key = (appleUserId: string) => PREFIX + appleUserId;

export async function rememberAppleName(appleUserId: string | undefined, name: string): Promise<void> {
  if (!appleUserId) return;
  try {
    await AsyncStorage.setItem(key(appleUserId), JSON.stringify({ name, at: Date.now() }));
  } catch {
    /* storage unavailable: the in-memory copy still covers this sign-in */
  }
}

export async function recallAppleName(appleUserId: string | undefined): Promise<string | null> {
  if (!appleUserId) return null;
  try {
    const raw = await AsyncStorage.getItem(key(appleUserId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { name?: unknown; at?: unknown };
    const name = typeof saved.name === 'string' ? saved.name.trim() : '';
    const fresh = typeof saved.at === 'number' && Date.now() - saved.at < MAX_AGE_MS;
    if (!name || !fresh) {
      await AsyncStorage.removeItem(key(appleUserId));
      return null;
    }
    return name;
  } catch {
    return null;
  }
}

export async function forgetAppleName(appleUserId: string | undefined): Promise<void> {
  if (!appleUserId) return;
  try {
    await AsyncStorage.removeItem(key(appleUserId));
  } catch {
    /* best-effort */
  }
}

/** Remove every kept Apple name (sign-out, Delete Account). */
export async function forgetAllAppleNames(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    /* best-effort */
  }
}

registerSignOutTask(forgetAllAppleNames);
