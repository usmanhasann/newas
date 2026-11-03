/**
 * Auth hooks. useAuthBootstrap() wires the Supabase session into the Zustand store
 * (the navigator reads it). The mutation hooks wrap the api layer for the screens.
 */
import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, registerAuthAutoRefresh, logger } from '@lib';
import { useSessionStore } from '@store/session';
import { runSignOutTasks } from '@store/signOutTasks';
import { forgetAllAppleNames } from '@store/appleName';
import * as api from './api';
import type { LoginInput, SignupInput } from './schema';

export function useAuthBootstrap(): void {
  const setSession = useSessionStore((s) => s.setSession);
  const setBootstrapped = useSessionStore((s) => s.setBootstrapped);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        // 1) Restore a persisted session if there is one. Tolerate a storage-read THROW
        //    (e.g. the iOS Keychain is briefly unavailable right after boot) — treat it the
        //    same as "no session" so we still fall through to the anonymous mint below rather
        //    than stranding the user on the login screen.
        let restored = null;
        try {
          const { data } = await supabase.auth.getSession();
          restored = data.session ?? null;
        } catch (e) {
          logger.error('getSession failed', { error: String(e) });
        }
        if (!mounted) return;
        if (restored) {
          setSession(restored);
          return;
        }

        // 2) No usable session → start an ANONYMOUS one so onboarding can run (and persist a
        //    real first entry) before the user picks an auth method near the end (spec §17).
        //    This runs whether getSession resolved null OR threw, so a transient storage read
        //    failure still lands the user on Welcome. Only a genuine failure — provider
        //    disabled (throws), or a 200 with no session tokens (returns a null session) —
        //    falls back to signed-out → the login screen (the safety net).
        try {
          const anon = await api.signInAnonymously();
          if (!mounted) return;
          if (anon.session) {
            setSession(anon.session);
          } else {
            // Abnormal: a non-error response that carried no session. Don't silently strand —
            // surface it and fall back deterministically to the signed-out safety net.
            logger.warn('anonymous sign-in returned no session');
            setSession(null);
          }
        } catch (e) {
          logger.warn('anonymous sign-in unavailable', { error: String(e) });
          if (mounted) setSession(null);
        }
      } finally {
        // The initial session decision has fully resolved (real session restored, anon minted,
        // or anon definitively failed) — release the bootstrap hold so the gate can route. Runs
        // AFTER the awaited anon call, so the splash never gives way to the login screen while
        // the anonymous session is still in flight.
        if (mounted) setBootstrapped(true);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    const unsubRefresh = registerAuthAutoRefresh();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      unsubRefresh();
    };
  }, [setSession, setBootstrapped]);
}

export function useSignIn() {
  return useMutation({
    mutationFn: (input: LoginInput) => api.signInWithPassword(input),
  });
}

export function useSignUp() {
  return useMutation({
    mutationFn: (input: SignupInput) => api.signUpWithPassword(input),
  });
}

export function useSignOut() {
  const setReauthenticating = useSessionStore((s) => s.setReauthenticating);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Work that needs the session one last time (e.g. revoking the widget key). Time-boxed.
      await runSignOutTasks();
      await api.signOut();
      // Return to the Welcome front door: swap the real account for a FRESH anonymous
      // session so the user lands on Welcome (Get Started / Sign In), not a bare login
      // screen. If anonymous sign-in is unavailable, we stay signed out and the gate falls
      // back to the login screen (safety net).
      try {
        await api.signInAnonymously();
      } catch (e) {
        logger.warn('re-anon after sign-out unavailable', { error: String(e) });
      }
    },
    // Keep the router on the splash during the real→anon swap (no signed-out flash).
    onMutate: () => setReauthenticating(true),
    onSettled: () => {
      setReauthenticating(false);
      // Drop the previous account's cached profile/subscription/etc. so the fresh session
      // never briefly sees stale data.
      qc.clear();
    },
  });
}

/**
 * Permanently delete the account, then swap the (now-invalid) session for a fresh anonymous one
 * so the user lands on Welcome — never stuck on a signed-in state for a deleted account. The
 * splash is held ONLY AFTER the server delete succeeds, so a FAILED delete leaves the account
 * intact and surfaces the error on the confirmation screen (which is still mounted).
 */
export function useDeleteAccount() {
  const setReauthenticating = useSessionStore((s) => s.setReauthenticating);
  const qc = useQueryClient();
  return useMutation({
    // appleAuthorizationCode: from the user's Apple confirmation, for an Apple account (revokes Sign
    // in with Apple on the server); undefined otherwise.
    mutationFn: async (appleAuthorizationCode?: string) => {
      await api.deleteAccount(appleAuthorizationCode); // throws on failure → account left intact, no session change
      setReauthenticating(true); // deletion succeeded — hold the splash through the session swap
      await forgetAllAppleNames(); // no personal data left on the phone after Delete Account
      await api.signOut().catch(() => undefined); // tolerate the now-invalid session
      try {
        await api.signInAnonymously();
      } catch (e) {
        logger.warn('re-anon after account deletion unavailable', { error: String(e) });
      }
    },
    onSettled: () => {
      setReauthenticating(false);
      qc.clear();
    },
  });
}

