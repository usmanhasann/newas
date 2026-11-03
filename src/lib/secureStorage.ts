/**
 * SecureStore-backed storage for the Supabase auth session (Keychain on iOS,
 * Keystore on Android) — build prompt §6 "secure session storage".
 *
 * expo-secure-store has a ~2KB per-value limit, but a Supabase session (JWT +
 * refresh token) can exceed it. This adapter transparently CHUNKS large values
 * across multiple SecureStore entries so the whole session stays encrypted at rest.
 * On web (no SecureStore) it falls back to AsyncStorage.
 *
 * Reinstall (client revisions 10/14 p.38, N16.28): see withFreshInstallCheck below.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';

const isWeb = Platform.OS === 'web';
const CHUNK_SIZE = 1800; // safely under the 2KB SecureStore limit
const CHUNKED = '__chunked__';
// SecureStore keys allow only [A-Za-z0-9._-]; use '.' separators.
const countKey = (key: string) => `${key}.cn`;
const chunkKey = (key: string, i: number) => `${key}.c.${i}`;

export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

async function removeChunks(key: string): Promise<void> {
  const countRaw = await SecureStore.getItemAsync(countKey(key));
  const count = countRaw ? parseInt(countRaw, 10) : 0;
  const ops: Promise<void>[] = [];
  for (let i = 0; i < count; i += 1)
    ops.push(SecureStore.deleteItemAsync(chunkKey(key, i)));
  ops.push(SecureStore.deleteItemAsync(countKey(key)));
  await Promise.all(ops);
}

export const secureStorage: SessionStorage = isWeb
  ? {
      getItem: (k) => AsyncStorage.getItem(k),
      setItem: (k, v) => AsyncStorage.setItem(k, v),
      removeItem: (k) => AsyncStorage.removeItem(k),
    }
  : {
      async getItem(key) {
        const head = await SecureStore.getItemAsync(key);
        if (head == null) return null;
        if (head !== CHUNKED) return head;
        const countRaw = await SecureStore.getItemAsync(countKey(key));
        const count = countRaw ? parseInt(countRaw, 10) : 0;
        const parts: string[] = [];
        for (let i = 0; i < count; i += 1) {
          const part = await SecureStore.getItemAsync(chunkKey(key, i));
          if (part == null) return null; // corrupt; force re-auth
          parts.push(part);
        }
        return parts.join('');
      },

      async setItem(key, value) {
        // Clear any previous chunks first to avoid stale fragments.
        await removeChunks(key);
        if (value.length <= CHUNK_SIZE) {
          await SecureStore.setItemAsync(key, value);
          return;
        }
        const chunks: string[] = [];
        for (let i = 0; i < value.length; i += CHUNK_SIZE) {
          chunks.push(value.slice(i, i + CHUNK_SIZE));
        }
        await Promise.all(
          chunks.map((c, i) => SecureStore.setItemAsync(chunkKey(key, i), c)),
        );
        await SecureStore.setItemAsync(countKey(key), String(chunks.length));
        await SecureStore.setItemAsync(key, CHUNKED);
      },

      async removeItem(key) {
        await removeChunks(key);
        await SecureStore.deleteItemAsync(key);
      },
    };

/**
 * Marks this install. It lives in AsyncStorage, which is wiped when the app is deleted.
 */
export const INSTALL_MARKER_KEY = 'lysm.install.v1';

/**
 * App deleted and reinstalled = a brand-new user (client revisions 10/14 p.38, N16.28). iOS keeps
 * Keychain items (where SecureStore saves the session) after the app is deleted, so a reinstall would
 * otherwise sign the old account straight back in and skip onboarding.
 *
 * On the first launch without the install marker, the saved session (`sessionKeys`) is cleared ONLY
 * when AsyncStorage holds nothing at all: a truly fresh install. Any other key means this is an update
 * from a version that didn't write the marker yet, and the person stays signed in. Then the marker is
 * written, so this decides once per install.
 *
 * Never throws and never signs anyone out by mistake: if AsyncStorage can't be read nothing is
 * cleared; if the session can't be cleared the marker isn't written, so the next launch tries again.
 * Resolves true when it cleared the session.
 */
export async function clearSessionOnFreshInstall(
  store: SessionStorage,
  sessionKeys: readonly string[],
): Promise<boolean> {
  let keys: readonly string[];
  try {
    keys = await AsyncStorage.getAllKeys();
  } catch (e) {
    logger.warn('install check skipped: storage unreadable', { error: String(e) });
    return false;
  }
  if (keys.includes(INSTALL_MARKER_KEY)) return false;
  const fresh = keys.length === 0;
  try {
    if (fresh) {
      for (const key of sessionKeys) await store.removeItem(key);
    }
    await AsyncStorage.setItem(INSTALL_MARKER_KEY, new Date().toISOString());
  } catch (e) {
    logger.warn('install check incomplete', { error: String(e) });
  }
  return fresh;
}

/**
 * `store`, with every read and write waiting for clearSessionOnFreshInstall first. The check starts
 * at once (before anything else in the app writes to AsyncStorage) and runs once per launch, so the
 * Supabase client can never read a session left over from a deleted install.
 */
export function withFreshInstallCheck(
  store: SessionStorage,
  sessionKeys: readonly string[],
): SessionStorage {
  const ready = clearSessionOnFreshInstall(store, sessionKeys);
  return {
    async getItem(key) {
      await ready;
      return store.getItem(key);
    },
    async setItem(key, value) {
      await ready;
      return store.setItem(key, value);
    },
    async removeItem(key) {
      await ready;
      return store.removeItem(key);
    },
  };
}
