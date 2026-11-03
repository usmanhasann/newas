-- ============================================================================
-- 20260930100000_audit_fixes.sql
-- Fixes from the full audit of the client's revision list (2026-09-30). Needs 20260929120000
-- (reflection period math), 20260929150000 (journal_days) and 20260929190000 (circle posts).
--
-- * Mood Breakdown: it locks to the last period that has ENDED, found with the same period math as
--   the Weekly/Monthly/Yearly cards. It used to follow whichever AI reflection was ready, so a slow
--   or failed AI left it showing an older period (or nothing at all).
-- * One push per event, whatever the app sends: a join request tells the owner at most once a day
--   per person, a new post or reply is announced once, and "request approved" once per approval.
-- ============================================================================

-- ---------- 1. Mood Breakdown periods ---------------------------------------------------
-- Per card type: the newest period that has fully ended and in which the user journaled (a period
-- with no entries never unlocks a new card, same as the reflections). None yet → still locked.
create or replace function public.get_breakdown_periods(p_today date)
returns table (type public.reflection_type, period_start date, period_end date)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  v_first date;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select pr.first_entry_date into v_first from public.profiles pr where pr.user_id = uid;
  if v_first is null then
    return;
  end if;
  return query
    select ty.t, b.period_start, b.period_end
      from unnest(enum_range(null::public.reflection_type)) as ty (t)
      cross join lateral (
        select pb.period_start, pb.period_end
          from generate_series(public.reflection_period_index(ty.t, v_first, p_today) - 1, 0, -1) as g (idx)
          cross join lateral public.reflection_period_bounds(ty.t, v_first, g.idx) as pb
         where exists (
           select 1 from public.journal_days jd
            where jd.user_id = uid and jd.local_date between pb.period_start and pb.period_end
         )
         order by g.idx desc
         limit 1
      ) b;
end;
$$;

revoke all on function public.get_breakdown_periods(date) from public, anon;
grant execute on function public.get_breakdown_periods(date) to authenticated;

-- ---------- 2. one push per event (service role only) --------------------------------
create table if not exists public.join_request_pushes (
  circle_id    uuid not null references public.circles (id) on delete cascade,
  requester_id uuid not null references auth.users (id) on delete cascade,
  sent_at      timestamptz not null default now(),
  primary key (circle_id, requester_id)
);
alter table public.join_request_pushes enable row level security;
revoke all on table public.join_request_pushes from anon, authenticated;

-- True when the owner should hear about this request: the first time, or a day after the last one.
create or replace function public.claim_join_request_push(p_circle uuid, p_requester uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.join_request_pushes as j (circle_id, requester_id, sent_at)
  values (p_circle, p_requester, now())
  on conflict (circle_id, requester_id) do update
    set sent_at = now()
    where j.sent_at < now() - interval '1 day';
  return found;
end;
$$;

create table if not exists public.post_pushes (
  post_id uuid primary key references public.circle_posts (id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.post_pushes enable row level security;
revoke all on table public.post_pushes from anon, authenticated;

-- Posts that already exist were announced when they were made.
insert into public.post_pushes (post_id)
select p.id from public.circle_posts p
on conflict do nothing;

create or replace function public.claim_post_push(p_post uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.post_pushes (post_id) values (p_post) on conflict do nothing;
  return found;
end;
$$;

create table if not exists public.approval_pushes (
  circle_id   uuid not null references public.circles (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  approved_at timestamptz not null,
  primary key (circle_id, user_id, approved_at)
);
alter table public.approval_pushes enable row level security;
revoke all on table public.approval_pushes from anon, authenticated;

-- True once per approval (leaving and being approved again is a new approval).
create or replace function public.claim_approval_push(p_circle uuid, p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_at timestamptz;
begin
  select m.approved_at into v_at
    from public.circle_members m
   where m.circle_id = p_circle and m.user_id = p_user and m.status = 'approved';
  if v_at is null then
    return false;
  end if;
  insert into public.approval_pushes (circle_id, user_id, approved_at)
  values (p_circle, p_user, v_at)
  on conflict do nothing;
  return found;
end;
$$;

revoke all on function public.claim_join_request_push(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_post_push(uuid) from public, anon, authenticated;
revoke all on function public.claim_approval_push(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_join_request_push(uuid, uuid) to service_role;
grant execute on function public.claim_post_push(uuid) to service_role;
grant execute on function public.claim_approval_push(uuid, uuid) to service_role;
