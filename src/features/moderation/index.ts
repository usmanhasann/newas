/**
 * Circles moderation (System 1): the service the Circle post/reply composer and the report/appeal
 * UIs call. Enforcement runs SERVER-SIDE (the moderate-circle-content Edge Function + the pure engine
 * in supabase/functions/_shared/moderation.ts); the client only reads its OWN standing and files its
 * OWN reports/appeals, all RLS-enforced. The composer calls `moderateCircleText` before persisting
 * and `scanCirclePost` after. There is no per-person block or mute (client spec 2026-09-29: everyone
 * in a circle sees everything its members post there).
 */
export {
  moderateCircleText,
  scanCirclePost,
  reportContent,
  submitAppeal,
  fetchMyCircleStanding,
  type ModerationVerdict,
} from './api';
