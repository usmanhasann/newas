-- ============================================================================
-- 20260629140000_reflections.sql
-- Weekly / Monthly / Yearly AI reflections (build task §7 + §8).
--
-- Lifecycle: a reflection is generated ONCE per (user, type, completed period) and
-- is then STATIC — the unique constraint + an "only generate when no READY row
-- exists" rule guarantee it never regenerates on revisit, restart, new entries, or a
-- model/prompt change. Generation is idempotent and safe to run from multiple paths
-- (on-open Edge Function + optional scheduled job).
--
-- All PERIOD + UNLOCK math lives here (the reusable backend service), so the client
-- never computes periods itself (§8). Weeks are Monday-based (Postgres date_trunc
-- 'week'); months/years are calendar periods. Everything buckets by the entry's
-- LOCAL date, so it's correct in the user's timezone.
-- ============================================================================

create type public.reflection_type as enum ('weekly', 'monthly', 'yearly');
create type public.reflection_gen_status as enum ('pending', 'ready', 'failed');

create table public.reflections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  type             public.reflection_type not null,
  period_start     date not null,                 -- inclusive, local date
  period_end       date not null,                 -- inclusive, local date
  status           public.reflection_gen_status not null default 'pending',
  content          text,
  entry_count      int not null default 0,
  source_entry_ids uuid[] not null default '{}',  -- source references (snapshot)
  source_version   int not null default 1,        -- source-data version
  model            text,                          -- AI model used
  prompt_version   int not null default 1,        -- prompt version
  error            text,
  generated_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- One reflection per user, type, and period — duplicates cannot be created.
  constraint reflections_unique_period unique (user_id, type, period_start)
);

create index reflections_user_type_idx
  on public.reflections (user_id, type, period_start desc);

create trigger reflections_set_updated_at
  before update on public.reflections
  for each row execute function public.set_updated_at();

alter table public.reflections enable row level security;

-- Users READ their own reflections only. Writes happen exclusively via the service
-- role (Edge Function) — there is deliberately no insert/update/delete policy for
-- authenticated, so RLS denies client writes (no API bypass).
create policy "reflections_select_own"
  on public.reflections for select
  using (auth.uid() = user_id);

-- ---------- period service (single source of truth) ------------------------

-- Next unlock date for a period type given the user's local "today": the start of
-- the period AFTER the current in-progress one (e.g. weekly → next Monday).
create or replace function public.reflection_next_unlock(
  p_type public.reflection_type,
  p_today date
)
returns date
language sql
immutable
as $$
  select case p_type
    when 'weekly'  then (date_trunc('week',  p_today::timestamp) + interval '7 days')::date
    when 'monthly' then (date_trunc('month', p_today::timestamp) + interval '1 month')::date
    when 'yearly'  then (date_trunc('year',  p_today::timestamp) + interval '1 year')::date
  end;
$$;

-- Completed periods (weekly/monthly/yearly) that contain at least one of the user's
-- entries and do NOT yet have a READY reflection — i.e. what still needs generating.
-- Data-driven (only periods the user actually journaled in), so it's naturally
-- bounded. Re-usable by the on-open Edge Function (auth.uid()) and the scheduled job
-- (service role passing p_user); a normal user can only ever query themselves.
create or replace function public.get_due_reflection_periods(
  p_today date,
  p_user uuid default null
)
returns table (
  type public.reflection_type,
  period_start date,
  period_end date,
  entry_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := coalesce(p_user, auth.uid());
begin
  if uid is null then
    raise exception 'no user';
  end if;
  if auth.uid() is not null and uid <> auth.uid() then
    raise exception 'forbidden';
  end if;

  return query
  with periods as (
    select 'weekly'::public.reflection_type as t,
           date_trunc('week', e.local_date::timestamp)::date as ps,
           (date_trunc('week', e.local_date::timestamp) + interval '6 days')::date as pe,
           count(*) as cnt
      from public.journal_entries e
     where e.user_id = uid
     group by 1, 2, 3
    union all
    select 'monthly'::public.reflection_type,
           date_trunc('month', e.local_date::timestamp)::date,
           (date_trunc('month', e.local_date::timestamp) + interval '1 month - 1 day')::date,
           count(*)
      from public.journal_entries e
     where e.user_id = uid
     group by 1, 2, 3
    union all
    select 'yearly'::public.reflection_type,
           date_trunc('year', e.local_date::timestamp)::date,
           (date_trunc('year', e.local_date::timestamp) + interval '1 year - 1 day')::date,
           count(*)
      from public.journal_entries e
     where e.user_id = uid
     group by 1, 2, 3
  )
  select p.t, p.ps, p.pe, p.cnt
    from periods p
    left join public.reflections r
      on r.user_id = uid
     and r.type = p.t
     and r.period_start = p.ps
     and r.status = 'ready'
   where p.pe < p_today        -- period has fully elapsed
     and r.id is null          -- no READY reflection yet (static once ready)
   order by p.ps;
end;
$$;

-- Per-type overview for the Insights UI: the next unlock date (server-computed),
-- whether the user has journaled at all (drives placeholder visibility), the latest
-- READY reflection to display, and whether the newest completed period is currently
-- generating or failed.
create or replace function public.get_reflections_overview(p_today date)
returns table (
  type public.reflection_type,
  has_any_entry boolean,
  next_unlock_date date,
  content text,
  period_start date,
  period_end date,
  generated_at timestamptz,
  generating boolean,
  failed boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  any_entry boolean;
begin
  if uid is null then
    raise exception 'no user';
  end if;
  select exists(select 1 from public.journal_entries where user_id = uid) into any_entry;

  return query
  with types as (
    select unnest(enum_range(null::public.reflection_type)) as t
  ),
  latest_ready as (
    select distinct on (r.type)
           r.type, r.content, r.period_start, r.period_end, r.generated_at
      from public.reflections r
     where r.user_id = uid and r.status = 'ready'
     order by r.type, r.period_start desc
  ),
  nonready as (
    select r.type,
           bool_or(r.status = 'pending') as generating,
           bool_or(r.status = 'failed') as failed
      from public.reflections r
     where r.user_id = uid and r.status in ('pending', 'failed')
     group by r.type
  )
  select ty.t,
         any_entry,
         public.reflection_next_unlock(ty.t, p_today),
         lr.content, lr.period_start, lr.period_end, lr.generated_at,
         coalesce(nr.generating, false),
         coalesce(nr.failed, false)
    from types ty
    left join latest_ready lr on lr.type = ty.t
    left join nonready nr on nr.type = ty.t;
end;
$$;

-- PostgREST exposure (mirrors 20260619160000_grant_api_roles.sql).
grant execute on function public.reflection_next_unlock(public.reflection_type, date)
  to anon, authenticated, service_role;
grant execute on function public.get_due_reflection_periods(date, uuid)
  to authenticated, service_role;
grant execute on function public.get_reflections_overview(date)
  to authenticated, service_role;
