/**
 * The name Apple shared during the sign-in in progress (client 10/14 p.10: Apple sends it ONLY on
 * the first authorization, so it must be captured at that exact moment). Set before the account
 * session switches, so whatever fills the profile right after the switch (the sign-up step, or
 * useEnsureDisplayName at the app root) already has it, even before it is saved on the account.
 *
 * It belongs to ONE account: `userId` is null while the sign-in is in flight and set to the
 * signed-in account once it succeeds; it is only ever used for that account. Cleared when it is
 * on the profile, when that profile already has a name, when the sign-in fails, and on sign-out,
 * so it can never end up on someone else's profile. In memory only.
 */
import { create } from 'zustand';
import { registerSignOutTask } from './signOutTasks';

interface PendingNameState {
  name: string | null;
  userId: string | null;
  /** Hold a name for the sign-in about to happen (owner not known yet). */
  set: (name: string | null) => void;
  /** The sign-in succeeded: the held name belongs to this account. */
  claim: (userId: string | null) => void;
  clear: () => void;
}

export const usePendingNameStore = create<PendingNameState>((set) => ({
  name: null,
  userId: null,
  set: (name) => set({ name: name?.trim() ? name.trim() : null, userId: null }),
  claim: (userId) => set((s) => (s.name ? { userId } : s)),
  clear: () => set({ name: null, userId: null }),
}));

/** The held name if it may be used for `userId`, else null. */
export function pendingNameFor(userId: string): string | null {
  const { name, userId: owner } = usePendingNameStore.getState();
  return name && (owner === null || owner === userId) ? name : null;
}

registerSignOutTask(async () => {
  usePendingNameStore.getState().clear();
});
