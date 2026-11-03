/**
 * Per-SESSION state for the notification re-prompt. Deliberately in-memory only (no
 * persistence): the client's rule is "one prompt per app open — the next one appears
 * after they close and reopen the app". A zustand store gives exactly that for free —
 * it survives navigation and backgrounding, and resets on a fresh launch, which is what
 * "close and reopen" means to a user. Persisting it would break the rule in the other
 * direction (the prompt would never come back).
 *
 * Visibility lives here rather than in component state so the card is driven entirely by
 * the session: leaving Home and returning shows the SAME unanswered prompt rather than
 * raising a second one, and once the user answers it, it's gone until the next launch.
 */
import { create } from 'zustand';

interface NotificationNudgeState {
  /** True once the nudge has been raised during this app session. Never raised twice. */
  shownThisSession: boolean;
  /** True while the card should be on screen (i.e. raised and not yet answered). */
  visible: boolean;
  /** Raise the prompt for this session. */
  raise: () => void;
  /** The user answered (accepted or dismissed) — hide it for the rest of the session. */
  hide: () => void;
  /** Test-only reset; production never needs it (a process restart does the job). */
  reset: () => void;
}

export const useNotificationNudgeStore = create<NotificationNudgeState>((set) => ({
  shownThisSession: false,
  visible: false,
  raise: () => set({ shownThisSession: true, visible: true }),
  hide: () => set({ visible: false }),
  reset: () => set({ shownThisSession: false, visible: false }),
}));
