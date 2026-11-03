-- ============================================================================
-- 20260619094000_notifications.sql
-- Native push device tokens (APNs/FCM, NO OneSignal) + per-event notification
-- preferences. Pushes are SENT by an Edge Function (service role) reading these.
-- ============================================================================

create type public.device_platform as enum ('ios', 'android', 'web');

-- ---------- device_tokens ---------------------------------------------------
create table public.device_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  platform     public.device_platform not null,
  token        text not null unique,
  enabled      boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index device_tokens_user_enabled_idx
  on public.device_tokens (user_id)
  where enabled = true;

create trigger device_tokens_set_updated_at
  before update on public.device_tokens
  for each row execute function public.set_updated_at();

alter table public.device_tokens enable row level security;

create policy "device_tokens_select_own"
  on public.device_tokens for select using (auth.uid() = user_id);
create policy "device_tokens_insert_own"
  on public.device_tokens for insert with check (auth.uid() = user_id);
create policy "device_tokens_update_own"
  on public.device_tokens for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "device_tokens_delete_own"
  on public.device_tokens for delete using (auth.uid() = user_id);

-- ---------- notification_prefs ----------------------------------------------
-- Toggles map to design spec §6.11.
create table public.notification_prefs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users (id) on delete cascade,
  journaling_reminder boolean not null default true,
  daily_inspiration   boolean not null default false,
  weekly_progress     boolean not null default true,
  circle_activity     boolean not null default true,
  reminder_time       time,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger notification_prefs_set_updated_at
  before update on public.notification_prefs
  for each row execute function public.set_updated_at();

alter table public.notification_prefs enable row level security;

create policy "notification_prefs_select_own"
  on public.notification_prefs for select using (auth.uid() = user_id);
create policy "notification_prefs_insert_own"
  on public.notification_prefs for insert with check (auth.uid() = user_id);
create policy "notification_prefs_update_own"
  on public.notification_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Extend the new-user trigger to also seed default notification prefs now that the
-- table exists. (Replaces the profiles-only version from the earlier migration.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (user_id) do nothing;

  insert into public.notification_prefs (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;
