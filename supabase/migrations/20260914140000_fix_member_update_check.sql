-- SECURITY FIX — circle_members self-approval hole.
--
-- The members_update policy (20260619130000) had a USING clause but NO WITH CHECK. In Postgres an
-- UPDATE policy without WITH CHECK reuses USING as the new-row check — and that only pins
-- `user_id = auth.uid()`, never the new `status`/`role`. So any user could:
--   1. insert their own circle_members row with status='requested' (members_insert allows this on
--      ANY circle type), then
--   2. UPDATE it to status='approved' — self-approving into a PRIVATE circle with NO owner approval
--      (gaining access to that circle's shared journal entries + private posts), and bypassing the
--      suspension gate that members_open_join_public enforces only on INSERT.
-- The RESTRICTIVE members_no_banned_rejoin is INSERT-only, so it did not stop this UPDATE path.
--
-- Recreate members_update WITH a check: the circle OWNER may set any status/role (approve/reject);
-- a member may only self-update to NON-access-granting statuses (never 'approved'/'invited', never
-- role 'owner'). Approval stays owner-only, as designed.

drop policy if exists "members_update" on public.circle_members;
create policy "members_update" on public.circle_members
  for update
  using (user_id = auth.uid() or public.is_circle_owner(circle_id, auth.uid()))
  with check (
    public.is_circle_owner(circle_id, auth.uid())
    or (
      user_id = auth.uid()
      and status in ('requested', 'left', 'rejected')
      and role = 'member'
    )
  );
