/**
 * An invite code typed while creating an account (onboarding "Save your progress" → email, or the
 * Sign Up screen), waiting to be redeemed once the new account's session is ready. The Circles
 * feature redeems it at the app root (usePendingInviteRedeem) and tells the person what happened,
 * exactly like the Join a Circle page does.
 */
import { create } from 'zustand';

interface PendingInviteState {
  code: string | null;
  set: (code: string | null) => void;
}

export const usePendingInviteStore = create<PendingInviteState>((set) => ({
  code: null,
  set: (code) => set({ code: code?.trim() ? code.trim() : null }),
}));
