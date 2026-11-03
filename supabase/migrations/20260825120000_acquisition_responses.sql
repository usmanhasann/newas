-- ============================================================================
-- 20260825120000_acquisition_responses.sql
-- "How'd you find us?" — marketing attribution captured from a one-time Home popup
-- (post-onboarding). Stored in a DEDICATED table (not the settings blob) so it's tied
-- to the user + timestamped and easy to pull marketing reports from. This is ADDITIVE:
-- the onboarding acquisition question (settings.onboarding.acquisition_source) is unchanged.
-- ============================================================================

create table if not exists public.acquisition_responses (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  source     text not null check (source in ('instagram','tiktok','app_store','friends_family','other')),
  created_at timestamptz not null default now()
);

alter table public.acquisition_responses enable row level security;

-- Users may read their own response; there is NO direct insert/update policy — all writes go
-- through resolve_acquisition_prompt() (SECURITY DEFINER) so user_id is always auth.uid() and
-- the source is validated server-side.
drop policy if exists "own acquisition read" on public.acquisition_responses;
create policy "own acquisition read" on public.acquisition_responses
  for select using (auth.uid() = user_id);

-- Records the answer (when p_source is given) into acquisition_responses, and ALWAYS marks the
-- Home prompt as seen (settings.acquisition_prompt_seen) so it appears exactly once — whether the
-- user answered or skipped. Idempotent per user (upsert on the PK).
create or replace function public.resolve_acquisition_prompt(p_source text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_source is not null then
    if p_source not in ('instagram','tiktok','app_store','friends_family','other') then
      raise exception 'invalid acquisition source: %', p_source using errcode = '22023';
    end if;
    insert into public.acquisition_responses (user_id, source)
    values (auth.uid(), p_source)
    on conflict (user_id) do update set source = excluded.source, created_at = now();
  end if;

  update public.profiles
     set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{acquisition_prompt_seen}', 'true'::jsonb, true),
         updated_at = now()
   where user_id = auth.uid();
end;
$$;

revoke all on function public.resolve_acquisition_prompt(text) from public, anon;
grant execute on function public.resolve_acquisition_prompt(text) to authenticated, service_role;
