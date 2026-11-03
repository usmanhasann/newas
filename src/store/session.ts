/**
 * Auth session store (Zustand) — TRUE client state. The Supabase session is the
 * source of truth; an onAuthStateChange listener (auth feature) pushes updates here
 * so navigation can switch between auth / gated / main stacks synchronously.
 * Server data (profile, subscription, entries) lives in TanStack Query, not here.
 */
import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface SessionState {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /** True while a sign-out is swapping the real account for a fresh anonymous session
   *  (so the router shows the splash instead of flashing the signed-out login screen on
   *  the way back to the Welcome front door). */
  reauthenticating: boolean;
  /** False until the INITIAL session decision at cold launch has resolved — i.e. we've
   *  either restored a real session or finished minting (or failing to mint) the anonymous
   *  one. Until then the router holds the splash so a transient signed-out moment (the
   *  Supabase INITIAL_SESSION(null) event that fires before anon sign-in completes) can
   *  never flash the login screen on the way to Welcome. */
  bootstrapped: boolean;
  setSession: (session: Session | null) => void;
  setReauthenticating: (value: boolean) => void;
  setBootstrapped: (value: boolean) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'loading',
  session: null,
  user: null,
  reauthenticating: false,
  bootstrapped: false,
  setSession: (session) =>
    set({
      session,
      user: session?.user ?? null,
      status: session ? 'signedIn' : 'signedOut',
    }),
  setReauthenticating: (value) => set({ reauthenticating: value }),
  setBootstrapped: (value) => set({ bootstrapped: value }),
  // A reset happens after the app is already up (e.g. a hard sign-out), so it stays
  // bootstrapped — we never want to re-show the cold-launch hold mid-session.
  reset: () =>
    set({
      session: null,
      user: null,
      status: 'signedOut',
      reauthenticating: false,
      bootstrapped: true,
    }),
}));

// Stable selectors (avoid re-renders).
export const useAuthStatus = () => useSessionStore((s) => s.status);
export const useCurrentUser = () => useSessionStore((s) => s.user);
