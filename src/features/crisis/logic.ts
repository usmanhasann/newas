/**
 * Crisis-support decision (System 2 — pure + framework-free, so it's the single tested source of
 * truth). The hybrid detector prescreens on-device, then asks the AI to confirm; this decides
 * whether to OFFER support.
 *
 * It deliberately FAILS OPEN: if the AI is unavailable we still offer resources on a prescreen hit —
 * over-offering support is always safer than missing a crisis. This can only ever OPEN the crisis
 * resources popup; it never records, flags, warns, restricts, or penalizes anything (System 2's one
 * hard rule).
 */
export function shouldOfferCrisisSupport(
  prescreenHit: boolean,
  aiConfirmed: boolean | null,
): boolean {
  if (!prescreenHit) return false; // no on-device hit → nothing was sent to the AI, nothing to offer
  if (aiConfirmed === null) return true; // AI unavailable → fail OPEN to support
  return aiConfirmed;
}
