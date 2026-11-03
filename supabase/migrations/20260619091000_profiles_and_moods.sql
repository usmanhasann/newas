-- ============================================================================
-- 20260619091000_profiles_and_moods.sql
-- profiles (1:1 with auth.users) + moods lookup (incl. `frustrated`).
-- RLS: a user reads/writes only their own profile. Cross-user profile reads for
-- circle members are added additively in the Phase 3 (circles) migration.
-- ============================================================================

-- ---------- profiles --------------------------------------------------------
create table public.profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users (id) on delete cascade,
  display_name  text,
  avatar_url    text,
  bio           text,
  timezone      text not null default 'UTC',
  onboarding_completed boolean not null default false,
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index profiles_user_id_idx on public.profiles (user_id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "profiles_insert_self"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Auto-provision a profile when a new auth user is created. SECURITY DEFINER so it
-- runs regardless of the (absent) session during signup. Re-created in the
-- notifications migration to also seed default notification_prefs.
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
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- moods -----------------------------------------------------------
-- Lookup table mirroring src/theme/moods.ts so the server + native widget can
-- render moods. Keep `color` in sync with src/theme/tokens.cjs (dot color).
create table public.moods (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  label       text not null,
  emoji       text not null,
  color       text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index moods_active_sort_idx on public.moods (is_active, sort_order);

create trigger moods_set_updated_at
  before update on public.moods
  for each row execute function public.set_updated_at();

alter table public.moods enable row level security;

-- Readable by any authenticated user; writes only via migrations / service role.
create policy "moods_select_authenticated"
  on public.moods for select
  to authenticated
  using (true);

insert into public.moods (slug, label, emoji, color, sort_order) values
  ('happy',      'Happy',      '😊', '#F2B705', 10),
  ('content',    'Content',    '🙂', '#7FA86B', 20),
  ('calm',       'Calm',       '😌', '#4FB286', 30),
  ('grateful',   'Grateful',   '🙏', '#2FA39A', 40),
  ('tired',      'Tired',      '😴', '#7E7AA8', 50),
  ('neutral',    'Neutral',    '😐', '#9AA0A6', 60),
  ('anxious',    'Anxious',    '😟', '#E08A3C', 70),
  ('sad',        'Sad',        '😢', '#5B8DEF', 80),
  ('frustrated', 'Frustrated', '😤', '#D9663F', 90),   -- required by master_spec
  ('angry',      'Angry',      '😠', '#E5564E', 100);
