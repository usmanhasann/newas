/** Resend-cooldown math. Pure (no I/O) so it's unit-testable in isolation. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Seconds left on the resend cooldown given the last send time. */
export function cooldownRemaining(lastSentAt: number | null, now: number = Date.now()): number {
  if (!lastSentAt) return 0;
  return Math.max(0, RESEND_COOLDOWN_SECONDS - Math.floor((now - lastSentAt) / 1000));
}
