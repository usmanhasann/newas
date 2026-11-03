-- ============================================================================
-- 20260717120000_entry_shares_column_grants.sql
-- SECURITY FIX for 20260717090000 (per-circle toned share summaries).
--
-- THE HOLE: that migration put AI-derived content (ai_summary) onto public.entry_shares. But
-- entry_shares' RLS policy `shares_select` (20260619130000) allows SELECT to ANY approved member
-- of the circle -- with NO sharing_permissions check -- and 20260619160000 granted table-level
-- SELECT to anon/authenticated, which new columns inherit. Until now entry_shares held only join
-- keys (id/entry_id/circle_id/target_user_id/created_at), so that loose policy leaked nothing and
-- the sanitized RPCs (get_circle_feed / get_shared_entry) were the ONLY path to shared AI text --
-- the design invariant stated in 20260619130000. Adding ai_summary there let a client read the
-- summary straight off the table via PostgREST, BYPASSING the
-- `case when coalesce(sp.can_see_summary, true) ... else null end` masking, i.e. reading the AI
-- text of an author who had revoked can_see_summary for them.
--
-- THE FIX: take table-level SELECT away from the API roles and re-grant only the non-content
-- columns, so ai_summary / ai_status / ai_error are unreadable by clients. The SECURITY DEFINER
-- RPCs read as the function owner, so they are unaffected and remain the only way to see shared AI
-- text -- with the masking intact.
--
-- Safe for every existing caller (verified): the only anon/authenticated reads of this table are
-- `select('circle_id')` (src/features/sharing/api.ts) and `delete().eq('entry_id', ...)` (needs
-- SELECT on entry_id) -- both columns stay granted. The insert path is a return=minimal upsert.
-- Edge Functions (send-push, generate-share-summaries) use the SERVICE ROLE, which is untouched.
-- Column grants do not affect RLS evaluation, so shares_select/insert/delete keep working, and no
-- policy references the content columns.
-- ============================================================================

revoke select on public.entry_shares from anon, authenticated;

grant select (id, entry_id, circle_id, target_user_id, created_at)
  on public.entry_shares to anon, authenticated;
