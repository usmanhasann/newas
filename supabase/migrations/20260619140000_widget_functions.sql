-- ============================================================================
-- 20260619140000_widget_functions.sql
-- Feeds the home-screen widget (build prompt §9.8): each approved member's latest
-- mood SHARED to the chosen circle. Privacy-safe — based on shared entries only and
-- honoring sharing_permissions; never exposes the note. Caller must be a member.
-- ============================================================================
create or replace function public.get_circle_member_moods(cid uuid)
returns table (user_id uuid, mood_slug text, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct on (e.user_id) e.user_id, e.mood_slug, e.created_at
  from public.entry_shares es
  join public.journal_entries e on e.id = es.entry_id
  left join public.sharing_permissions sp
    on sp.owner_id = e.user_id and sp.target_user_id = auth.uid()
  where es.circle_id = cid
    and public.is_circle_member(cid, auth.uid())
    and coalesce(sp.can_see_mood, true) = true
  order by e.user_id, e.created_at desc;
$$;
