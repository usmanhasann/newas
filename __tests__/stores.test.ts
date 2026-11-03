import type { Session } from '@supabase/supabase-js';
import { useSessionStore } from '@store/session';
import { useToastStore, toast } from '@store/toast';
import { useEmailVerifyStore } from '@store/emailVerify';
import { useDevFlags } from '@store/devFlags';

// Minimal Session stub (only the fields the store reads).
const fakeSession = (id: string): Session =>
  ({ user: { id } }) as unknown as Session;

describe('session store', () => {
  beforeEach(() => useSessionStore.getState().reset());

  it('starts signed out after reset', () => {
    const s = useSessionStore.getState();
    expect(s.status).toBe('signedOut');
    expect(s.user).toBeNull();
    expect(s.session).toBeNull();
  });

  it('setSession(session) → signedIn and derives the user', () => {
    useSessionStore.getState().setSession(fakeSession('user-1'));
    const s = useSessionStore.getState();
    expect(s.status).toBe('signedIn');
    expect(s.user?.id).toBe('user-1');
  });

  it('setSession(null) → signedOut and clears the user', () => {
    useSessionStore.getState().setSession(fakeSession('user-1'));
    useSessionStore.getState().setSession(null);
    const s = useSessionStore.getState();
    expect(s.status).toBe('signedOut');
    expect(s.user).toBeNull();
  });

  it('is NOT bootstrapped on a FRESH store so cold launch holds the splash (anti Sign-In-flash)', () => {
    // Read the pristine initial value via an isolated import — beforeEach's reset() sets it
    // true on the shared store, so we must observe the fresh module to catch an inverted default.
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useSessionStore: fresh } = require('@store/session');
      expect(fresh.getState().bootstrapped).toBe(false);
    });
  });

  it('setBootstrapped toggles the hold flag; reset() stays bootstrapped (never re-holds mid-session)', () => {
    useSessionStore.getState().setBootstrapped(true);
    expect(useSessionStore.getState().bootstrapped).toBe(true);
    useSessionStore.getState().setBootstrapped(false);
    expect(useSessionStore.getState().bootstrapped).toBe(false);
    // A post-launch reset (e.g. hard sign-out) must leave bootstrapped=true.
    useSessionStore.getState().reset();
    expect(useSessionStore.getState().bootstrapped).toBe(true);
  });
});

describe('toast store', () => {
  beforeEach(() => useToastStore.getState().hide());

  it('defaults to info and stores the message + type', () => {
    toast.success('saved');
    expect(useToastStore.getState()).toMatchObject({ message: 'saved', type: 'success' });
    toast.error('nope');
    expect(useToastStore.getState()).toMatchObject({ message: 'nope', type: 'error' });
    toast.info('fyi');
    expect(useToastStore.getState()).toMatchObject({ message: 'fyi', type: 'info' });
  });

  it('hide() clears the message', () => {
    toast.success('x');
    useToastStore.getState().hide();
    expect(useToastStore.getState().message).toBeNull();
  });
});

describe('emailVerify store', () => {
  beforeEach(() => useEmailVerifyStore.getState().reset());

  it('tracks lastSentAt (the resend cooldown); reset clears it', () => {
    useEmailVerifyStore.getState().setLastSentAt(1000);
    expect(useEmailVerifyStore.getState().lastSentAt).toBe(1000);
    useEmailVerifyStore.getState().reset();
    expect(useEmailVerifyStore.getState().lastSentAt).toBeNull();
  });
});

describe('devFlags store', () => {
  it('toggles bypassGate', () => {
    expect(useDevFlags.getState().bypassGate).toBe(false);
    useDevFlags.getState().setBypassGate(true);
    expect(useDevFlags.getState().bypassGate).toBe(true);
    useDevFlags.getState().setBypassGate(false);
    expect(useDevFlags.getState().bypassGate).toBe(false);
  });
});
