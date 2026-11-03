-- ============================================================================
-- 20260929120000_notifications_v2.sql
-- Notifications rework (client "Notifications — full spec", 2026-09-29).
--
-- 1. Global switches (notification_prefs):
--    + streak_reminder — the 8pm streak push gets its own switch (it used to ride on
--      journaling_reminder). Existing rows copy journaling_reminder so nobody starts getting a
--      reminder they had switched off; new users get it ON.
--    + weekly_recap / monthly_recap / yearly_recap — "your recap is ready" pushes. They replace the
--      "Weekly Progress Summary" switch, which was never wired to anything. ON by default.
--    daily_inspiration / weekly_progress / circle_activity are RETIRED (no longer shown or read).
--    The columns stay so app builds already installed — which still read/write them — keep working.
-- 2. circle_notification_prefs — each circle's own switches, per person. No row (or no value) means
--    ON. Replaces circle_post_mutes: its rows carry over as new_posts = false (the table stays for
--    installed builds).
-- 3. entry_reaction_pushes / post_reaction_pushes + claim_reaction_push() — "first reaction only":
--    one push per person per shared entry / post, ever. Existing reactions are back-filled, so
--    changing or re-adding one after this update never notifies again. Likewise
--    entry_share_pushes + claim_share_pushes(): "new shared entry" goes out once per entry per
--    circle, so saving an edit to an already-shared entry no longer re-notifies the circle.
-- 4. recap_push_sends + claim_recap_pushes() — the recap push goes out at 9 AM local on the day a
--    Weekly / Monthly / Yearly card unlocks (the day after its period ends), once per period.
-- 5. claim_streak_reminders() — now honors streak_reminder instead of journaling_reminder.
-- ============================================================================

-- ---------- 1. global switches ------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'notification_prefs'
       and column_name = 'streak_reminder'
  ) then
    alter table public.notification_prefs
      add column streak_reminder boolean not null default true;
    -- Carry each person's current effective setting over (see header). Runs only when the
    -- column is first added, so a re-run can never overwrite a choice made since.
    update public.notification_prefs set streak_reminder = journaling_reminder;
  end if;
end;
$$;

alter table public.notification_prefs
  add column if not exists weekly_recap  boolean not null default true,
  add column if not exists monthly_recap boolean not null default true,
  add column if not exists yearly_recap  boolean not null default true;

-- ---------- 2. per-circle switches ------------------------------------------------
create table if not exists public.circle_notification_prefs (
  user_id       uuid not null references auth.users (id) on delete cascade,
  circle_id     uuid not null references public.circles (id) on delete cascade,
  replies       boolean not null default true, -- someone replied to your post / prompt
  reactions     boolean not null default true, -- someone reacted to your post / shared entry
  new_prompts   boolean not null default true, -- Public: the creator posted a new prompt (members)
  new_posts     boolean not null default true, -- Private: anyone posted in the circle
  new_entries   boolean not null default true, -- Private: anyone shared a journal entry here
  join_requests boolean not null default true, -- Private: someone asked to join (owner)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, circle_id)
);

-- Fan-out reads "who in this circle switched X off".
create index if not exists circle_notification_prefs_circle_idx
  on public.circle_notification_prefs (circle_id);

drop trigger if exists circle_notification_prefs_set_updated_at on public.circle_notification_prefs;
create trigger circle_notification_prefs_set_updated_at
  before update on public.circle_notification_prefs
  for each row execute function public.set_updated_at();

alter table public.circle_notification_prefs enable row level security;

drop policy if exists "circle_notification_prefs_select_own" on public.circle_notification_prefs;
create policy "circle_notification_prefs_select_own"
  on public.circle_notification_prefs for select using (auth.uid() = user_id);
-- Writes only for a circle you're actually in (an owner is an approved member of their own circle).
drop policy if exists "circle_notification_prefs_insert_own" on public.circle_notification_prefs;
create policy "circle_notification_prefs_insert_own"
  on public.circle_notification_prefs for insert
  with check (auth.uid() = user_id and public.is_circle_member(circle_id, auth.uid()));
drop policy if exists "circle_notification_prefs_update_own" on public.circle_notification_prefs;
create policy "circle_notification_prefs_update_own"
  on public.circle_notification_prefs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.is_circle_member(circle_id, auth.uid()));
drop policy if exists "circle_notification_prefs_delete_own" on public.circle_notification_prefs;
create policy "circle_notification_prefs_delete_own"
  on public.circle_notification_prefs for delete using (auth.uid() = user_id);

-- Carry over the old Private "new post" mutes.
insert into public.circle_notification_prefs (user_id, circle_id, new_posts)
select m.user_id, m.circle_id, false
  from public.circle_post_mutes m
on conflict (user_id, circle_id) do update set new_posts = false;

-- ---------- 3. first-reaction-only ledgers (service role only) -------------------------
create table if not exists public.entry_reaction_pushes (
  entry_id   uuid not null references public.journal_entries (id) on delete cascade,
  reactor_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, reactor_id)
);
alter table public.entry_reaction_pushes enable row level security;
revoke all on table public.entry_reaction_pushes from anon, authenticated;

create table if not exists public.post_reaction_pushes (
  post_id    uuid not null references public.circle_posts (id) on delete cascade,
  reactor_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, reactor_id)
);
alter table public.post_reaction_pushes enable row level security;
revoke all on table public.post_reaction_pushes from anon, authenticated;

-- Reactions made before this update count as already notified.
insert into public.entry_reaction_pushes (entry_id, reactor_id)
select r.entry_id, r.user_id from public.reactions r
on conflict do nothing;
insert into public.post_reaction_pushes (post_id, reactor_id)
select r.post_id, r.user_id from public.post_reactions r
on conflict do nothing;

-- Atomically claim "this person's first reaction to this entry/post". True = first time (send the
-- push); false = already claimed (a change, or a removal then re-add) → send nothing.
create or replace function public.claim_reaction_push(p_kind text, p_target uuid, p_reactor uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_kind = 'entry' then
    insert into public.entry_reaction_pushes (entry_id, reactor_id)
    values (p_target, p_reactor)
    on conflict do nothing;
  elsif p_kind = 'post' then
    insert into public.post_reaction_pushes (post_id, reactor_id)
    values (p_target, p_reactor)
    on conflict do nothing;
  else
    raise exception 'unknown reaction kind: %', p_kind;
  end if;
  return found;
end;
$$;

revoke all on function public.claim_reaction_push(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_reaction_push(text, uuid, uuid) to service_role;

-- "New shared entry" is for an entry newly shared INTO a circle — not for every later edit of it
-- (saving an edit re-writes its shares). One push per entry per circle, ever. Existing shares count
-- as already notified.
create table if not exists public.entry_share_pushes (
  entry_id   uuid not null references public.journal_entries (id) on delete cascade,
  circle_id  uuid not null references public.circles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, circle_id)
);
alter table public.entry_share_pushes enable row level security;
revoke all on table public.entry_share_pushes from anon, authenticated;

insert into public.entry_share_pushes (entry_id, circle_id)
select s.entry_id, s.circle_id from public.entry_shares s
 where s.circle_id is not null
on conflict do nothing;

-- Claim the circles this entry has NOT been announced in yet; returns just those (atomic).
create or replace function public.claim_share_pushes(p_entry uuid, p_circles uuid[])
returns setof uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.entry_share_pushes (entry_id, circle_id)
  select p_entry, c from unnest(p_circles) as c
  on conflict do nothing
  returning circle_id;
$$;

revoke all on function public.claim_share_pushes(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.claim_share_pushes(uuid, uuid[]) to service_role;

-- ---------- 4. recap pushes -----------------------------------------------------------
-- The reflection period math, with the SAME expressions get_due_reflection_periods uses, so a recap
-- push and the card it announces always agree. Every period anchors to the user's first entry:
-- weekly = 7-day windows, monthly = month-anniversaries, yearly = anniversaries.
create or replace function public.reflection_period_index(
  p_type public.reflection_type,
  p_first date,
  p_day date
)
returns int
language sql
stable
as $$
  select case p_type
    when 'weekly'  then (p_day - p_first) / 7
    when 'monthly' then extract(year from age(p_day, p_first))::int * 12
                        + extract(month from age(p_day, p_first))::int
    when 'yearly'  then extract(year from age(p_day, p_first))::int
  end;
$$;

create or replace function public.reflection_period_bounds(
  p_type public.reflection_type,
  p_first date,
  p_index int
)
returns table (period_start date, period_end date)
language sql
stable
as $$
  select
    case p_type
      when 'weekly'  then p_first + p_index * 7
      when 'monthly' then (p_first + make_interval(months => p_index))::date
      when 'yearly'  then (p_first + make_interval(years => p_index))::date
    end,
    case p_type
      when 'weekly'  then p_first + p_index * 7 + 6
      when 'monthly' then (p_first + make_interval(months => p_index + 1) - interval '1 day')::date
      when 'yearly'  then (p_first + make_interval(years => p_index + 1) - interval '1 day')::date
    end;
$$;

-- Idempotency ledger: at most one recap push per person, type and period.
create table if not exists public.recap_push_sends (
  user_id      uuid not null references auth.users (id) on delete cascade,
  type         public.reflection_type not null,
  period_start date not null,
  sent_at      timestamptz not null default now(),
  primary key (user_id, type, period_start)
);
alter table public.recap_push_sends enable row level security;
revoke all on table public.recap_push_sends from anon, authenticated;

-- Claim (and return) the recap pushes to send right now: it's the 9 AM hour in the person's time
-- zone, a Weekly/Monthly/Yearly period of theirs ended yesterday (so its card unlocked at midnight),
-- that period has at least one entry (an empty period doesn't unlock a new card), their switch for
-- that recap is on, they can get a push, and they haven't already opened the new recap (a READY
-- reflection for it exists — only opening Insights creates one before this runs). The INSERT ...
-- ON CONFLICT DO NOTHING is the atomic claim, so overlapping runs never double-send.
create or replace function public.claim_recap_pushes(run_at timestamptz)
returns table (user_id uuid, type public.reflection_type, period_start date, period_end date)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  return query
  with cand as (
    -- Joining pg_timezone_names skips a corrupt timezone instead of aborting the whole batch
    -- (same guard as claim_streak_reminders).
    select p.user_id as uid,
           p.first_entry_date as first_day,
           ((run_at at time zone p.timezone)::date - 1) as yday
      from public.profiles p
      join pg_timezone_names z on z.name = p.timezone
     where p.first_entry_date is not null
       and extract(hour from (run_at at time zone p.timezone))::int = 9
       and exists (
         select 1 from public.device_tokens dt
          where dt.user_id = p.user_id and dt.enabled
       )
  ),
  periods as (
    -- For each recap type: the period that contains yesterday.
    select c.uid, c.first_day, c.yday, t.rtype,
           public.reflection_period_index(t.rtype, c.first_day, c.yday) as idx
      from cand c
     cross join unnest(enum_range(null::public.reflection_type)) as t (rtype)
     where c.yday >= c.first_day
  ),
  due as (
    select pr.uid, pr.rtype, b.period_start as ps, b.period_end as pe
      from periods pr
     cross join lateral public.reflection_period_bounds(pr.rtype, pr.first_day, pr.idx) b
      left join public.notification_prefs np on np.user_id = pr.uid
     where b.period_end = pr.yday
       and case pr.rtype
             when 'weekly'  then coalesce(np.weekly_recap, true)
             when 'monthly' then coalesce(np.monthly_recap, true)
             when 'yearly'  then coalesce(np.yearly_recap, true)
             else false
           end
       -- Same entry grouping as get_due_reflection_periods; the date window only keeps the scan
       -- on the (user_id, local_date) index.
       and exists (
         select 1 from public.journal_entries e
          where e.user_id = pr.uid
            and e.local_date between b.period_start - 31 and b.period_end + 31
            and public.reflection_period_index(pr.rtype, pr.first_day, e.local_date) = pr.idx
       )
       and not exists (
         select 1 from public.reflections r
          where r.user_id = pr.uid
            and r.type = pr.rtype
            and r.period_start = b.period_start
            and r.status = 'ready'
       )
  ),
  claimed as (
    insert into public.recap_push_sends (user_id, type, period_start)
    select d.uid, d.rtype, d.ps from due d
    on conflict (user_id, type, period_start) do nothing
    returning recap_push_sends.user_id as uid,
              recap_push_sends.type as rtype,
              recap_push_sends.period_start as ps
  )
  select cl.uid, cl.rtype, cl.ps, d.pe
    from claimed cl
    join due d on d.uid = cl.uid and d.rtype = cl.rtype and d.ps = cl.ps;
end;
$$;

revoke all on function public.claim_recap_pushes(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_recap_pushes(timestamptz) to service_role;

-- ---------- 5. streak reminder: its own switch -----------------------------------------
-- Same body as 20260918120000 (incl. the #variable_conflict fix); only the switch changes.
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
        (select np.streak_reminder from public.notification_prefs np where np.user_id = c.uid),
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
