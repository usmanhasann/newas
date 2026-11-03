/**
 * Working state for the email-verification code screen. The SERVER (email_verifications) is the
 * source of truth; this only holds a UI helper: when the last code email went out, which drives the
 * "Resend code" cooldown (client revisions 10/14 p.18) across the places the screen appears.
 */
import { create } from 'zustand';

interface EmailVerifyStore {
  /** Epoch ms of the last successful send (drives the resend cooldown). */
  lastSentAt: number | null;
  setLastSentAt: (t: number | null) => void;
  reset: () => void;
}

export const useEmailVerifyStore = create<EmailVerifyStore>((set) => ({
  lastSentAt: null,
  setLastSentAt: (t) => set({ lastSentAt: t }),
  reset: () => set({ lastSentAt: null }),
}));
