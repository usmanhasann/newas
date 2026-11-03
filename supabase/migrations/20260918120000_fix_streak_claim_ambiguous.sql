-- Hotfix — claim_streak_reminders threw `column reference "user_id" is ambiguous` at runtime.
--
-- The function RETURNS TABLE (user_id uuid, streak int), so `user_id` is an OUT parameter in scope for
-- the whole body. PL/pgSQL's default #variable_conflict is `error`, so the unqualified `user_id` in the
-- INSERT column list + `on conflict (user_id, local_date)` (which must resolve to the TABLE column) is
-- rejected as ambiguous — the function fails for EVERY run, sending no reminders. Caught by the
-- streak-reminder edge-function smoke test right after deploy.
--
-- Fix: `#variable_conflict use_column` so a name that is both an OUT var and a column resolves to the
-- COLUMN. No body statement reads user_id/streak as a variable (the final SELECT maps positionally), so
-- this is safe and preserves the { user_id, streak } result contract the edge function reads.

create or replace function public.claim_streak_reminders(run_at timestamptz)
returns table (user_id uuid, streak int)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  return query
  with cand as (
    select p.user_id as uid, (run_at at time zone p.timezone) as lts
    from public.profiles p
    join pg_timezone_names z on z.name = p.timezone
  ),
  due as (
    select c.uid, c.lts::date as today_local
    from cand c
    where extract(hour from c.lts)::int = 20
      and (select max(je.local_date) from public.journal_entries je where je.user_id = c.uid)
          = c.lts::date - 1
      and coalesce(
        (select np.journaling_reminder from public.notification_prefs np where np.user_id = c.uid),
        true
      )
  ),
  claimed as (
    insert into public.streak_reminder_sends (user_id, local_date)
    select d.uid, d.today_local from due d
    on conflict (user_id, local_date) do nothing
    returning streak_reminder_sends.user_id as uid, streak_reminder_sends.local_date as ld
  )
  select cl.uid, public.streak_len(cl.uid, cl.ld - 1)
  from claimed cl;
end;
$$;

revoke all on function public.claim_streak_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_streak_reminders(timestamptz) to service_role;
