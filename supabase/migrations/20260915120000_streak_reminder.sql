-- 8pm "keep your streak" reminder — server side.
--
-- A scheduled edge function (streak-reminder) runs on a fixed cadence and, for each user for whom it
-- is currently 8pm in THEIR timezone and who has a live streak they haven't extended today, sends one
-- push. The "who qualifies + their streak count + once-per-day dedupe" all live here so the edge
-- function stays a thin sender.
--
-- DAY BOUNDARY: the user's LOCAL calendar day (midnight reset), the SAME definition get_journal_stats,
-- the mood-row reset, and the prompt rotation use. journal_entries.local_date is already the entry's
-- local date, so "hasn't journaled today" ⇔ the latest local_date is exactly yesterday (a streak that
-- is alive — last entry yesterday — but not yet extended today). If the latest entry is today they've
-- journaled; if it's older than yesterday the streak is dead. So the single condition
-- `max(local_date) = today_local - 1` captures "active streak AND not journaled today".

-- Idempotency ledger: at most one reminder per user per local day. Claimed atomically before sending,
-- so overlapping cron runs never double-notify. Service-role only.
create table public.streak_reminder_sends (
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, local_date)
);
alter table public.streak_reminder_sends enable row level security;
revoke all on table public.streak_reminder_sends from anon, authenticated;

-- Length of the consecutive-day run ending at `end_date` (0 if that day has no entry). Gaps-and-islands
-- over the user's distinct local dates: consecutive days share `local_date - row_number()`.
create or replace function public.streak_len(uid uuid, end_date date)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  with dates as (
    select distinct local_date
    from public.journal_entries
    where user_id = uid and local_date <= end_date
  ),
  islands as (
    select local_date, local_date - (row_number() over (order by local_date))::int as grp
    from dates
  )
  select coalesce(
    (select count(*)::int from islands where grp = (select grp from islands where local_date = end_date)),
    0
  );
$$;

-- Claim (and return) the users to remind right now: it's 8pm in their tz, their last entry was
-- yesterday (live streak, today not done), and they haven't opted out of journaling reminders. The
-- INSERT ... ON CONFLICT DO NOTHING is the atomic per-day claim; only newly-claimed users are returned.
create or replace function public.claim_streak_reminders(run_at timestamptz)
returns table (user_id uuid, streak int)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  with cand as (
    -- profiles.timezone is unvalidated free text (the client writes it). Joining pg_timezone_names
    -- means a corrupt/unknown zone SKIPS that one user instead of raising in AT TIME ZONE and aborting
    -- the whole batch (which would send NO reminders to ANYONE until the bad row was fixed). Compute
    -- the user's local timestamp once; derive the local date + hour from it.
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

-- Grants: these run under the service role (the edge function); no client access.
revoke all on function public.streak_len(uuid, date) from public, anon, authenticated;
grant execute on function public.streak_len(uuid, date) to service_role;
revoke all on function public.claim_streak_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_streak_reminders(timestamptz) to service_role;

-- SCHEDULING (deploy-time; not activated by this migration because it needs the project's Functions URL
-- and a shared secret, which don't belong in version control). After deploying the `streak-reminder`
-- edge function and setting its CRON_SECRET, run ONCE (substituting the URL + secret), guarded like the
-- trial-expiry job. Every 30 min covers whole- and half-hour timezone offsets; the ledger + the hour=20
-- filter make the extra runs no-ops.
--
--   select cron.schedule(
--     'lysm-streak-reminder', '0,30 * * * *',
--     $cron$
--       select net.http_post(
--         url    := 'https://<project-ref>.functions.supabase.co/streak-reminder',
--         headers:= jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
--         body   := '{}'::jsonb
--       );
--     $cron$
--   );
