-- Circles Posts, Phase 3 — Public open-join.
--
-- The existing members_insert policy only lets a user self-insert status='requested' (the Private
-- approval flow). Public Circles are open-join: a user may add themselves as an APPROVED member
-- instantly. This ADDITIONAL (permissive) policy allows exactly that for PUBLIC circles; it is
-- AND-ed with the Phase-1 RESTRICTIVE members_no_banned_rejoin policy, so a banned user still can't
-- rejoin. A suspended user (global Circles suspension) can't open-join either.

create policy "members_open_join_public" on public.circle_members
  for insert with check (
    user_id = auth.uid()
    and status = 'approved'
    and role = 'member'
    and (select c.type from public.circles c where c.id = circle_id) = 'public'
    and public.my_circle_standing() <> 'suspended'
  );
