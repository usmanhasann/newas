/**
 * The single typed Supabase client for the app. Uses the ANON key only (RLS
 * enforces access). Session persists in encrypted SecureStore (chunked). The
 * service-role key is NEVER bundled — privileged work goes through Edge Functions.
 */
import 'react-native-url-polyfill/auto';
import { AppState, type AppStateStatus } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';
import type { Database } from '@app-types/database';
import { env } from './env';
import { secureStorage, withFreshInstallCheck } from './secureStorage';

/**
 * Where supabase-js keeps the saved session: its own default key (`sb-<project ref>-auth-token`),
 * spelled out so a fresh install can clear it. The same value as before, so nobody is signed out.
 */
export const SESSION_STORAGE_KEY = `sb-${new URL(env.supabaseUrl).hostname.split('.')[0]}-auth-token`;

// A reinstall starts signed out (N16.28): iOS keeps the Keychain after the app is deleted, so the
// old session (and the sign-in helpers stored beside it) is cleared before the client reads it.
const authStorage = withFreshInstallCheck(secureStorage, [
  SESSION_STORAGE_KEY,
  `${SESSION_STORAGE_KEY}-code-verifier`,
  `${SESSION_STORAGE_KEY}-user`,
]);

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: authStorage,
    storageKey: SESSION_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // RN: we handle the reset deep link ourselves
    lock: processLock,
  },
});

/**
 * Supabase needs auto-refresh paused while the app is backgrounded (RN guidance).
 * Call once at app start; returns an unsubscribe.
 */
export function registerAuthAutoRefresh(): () => void {
  const handler = (state: AppStateStatus) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  };
  const sub = AppState.addEventListener('change', handler);
  // Kick off immediately for the current state.
  handler(AppState.currentState);
  return () => sub.remove();
}
