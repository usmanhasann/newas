-- ============================================================================
-- 20260619095000_crisis_feedback_audit.sql
-- crisis_keywords (drives the safety warning), feedback, audit_log.
--
-- SAFETY (build prompt §9.4 / master_spec): when a user types a concerning phrase
-- we surface a NON-dismissive warning with a tappable hotline. Each phrase can show
-- a DIFFERENT message + resource (per-row). Detection is best-effort client-side for
-- immediacy AND re-checked server-side on save.
--
-- ⚠️ The seed below is US-centric PLACEHOLDER data (988 Suicide & Crisis Lifeline)
-- pending the client's confirmation of regions/numbers (build prompt §15.4).
-- Add more regions by inserting rows with the appropriate `region`.
-- ============================================================================

create type public.crisis_severity as enum ('low', 'medium', 'high', 'critical');

create table public.crisis_keywords (
  id            uuid primary key default gen_random_uuid(),
  phrase        text not null,
  -- how to match `phrase` against entry text (lowercased):
  --   'contains' substring, 'word' whole-word boundary, 'regex' raw pattern
  match_type    text not null default 'contains' check (match_type in ('contains', 'word', 'regex')),
  severity      public.crisis_severity not null default 'high',
  title         text not null,
  message       text not null,
  resource_name text not null,
  resource_phone text not null,
  resource_sms  text,
  resource_url  text,
  region        text not null default 'US',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index crisis_keywords_region_active_idx
  on public.crisis_keywords (region)
  where is_active = true;

create trigger crisis_keywords_set_updated_at
  before update on public.crisis_keywords
  for each row execute function public.set_updated_at();

alter table public.crisis_keywords enable row level security;

-- Readable by any authenticated user (the client fetches the active list to scan
-- locally). Writes via migrations / service role only.
create policy "crisis_keywords_select_active"
  on public.crisis_keywords for select
  to authenticated
  using (is_active = true);

insert into public.crisis_keywords
  (phrase, match_type, severity, title, message, resource_name, resource_phone, resource_sms, resource_url, region)
values
  ('kill myself', 'contains', 'critical',
   'You don''t have to face this alone',
   'It sounds like you''re in a lot of pain right now. You matter, and help is available this very moment. Please reach out to someone who can support you.',
   '988 Suicide & Crisis Lifeline', '988', '988', 'https://988lifeline.org', 'US'),

  ('end my life', 'contains', 'critical',
   'Please reach out — right now',
   'Thoughts about ending your life are a sign of how much pain you''re carrying, not a sign of weakness. Trained counselors are ready to listen, free and confidential, 24/7.',
   '988 Suicide & Crisis Lifeline', '988', '988', 'https://988lifeline.org', 'US'),

  ('suicide', 'word', 'critical',
   'Help is here for you',
   'If you''re thinking about suicide, please talk to someone now. You can call or text 988 any time to reach a caring, trained counselor.',
   '988 Suicide & Crisis Lifeline', '988', '988', 'https://988lifeline.org', 'US'),

  ('suicidal', 'word', 'critical',
   'Help is here for you',
   'Feeling suicidal can be overwhelming, but you don''t have to carry it by yourself. Reaching out is a brave first step — support is one call or text away.',
   '988 Suicide & Crisis Lifeline', '988', '988', 'https://988lifeline.org', 'US'),

  ('want to die', 'contains', 'high',
   'Your life matters',
   'When the pain feels like too much, it can be hard to see a way forward — but you don''t have to figure it out alone. Please reach out and let someone help you through this moment.',
   '988 Suicide & Crisis Lifeline', '988', '988', 'https://988lifeline.org', 'US'),

  ('dont want to live', 'contains', 'high',
   'You deserve support',
   'It takes strength to put these feelings into words. Please let a trained counselor support you — they''re available right now, and the call is free and confidential.',
   '988 Suicide & Crisis Lifeline', '988', '988', 'https://988lifeline.org', 'US'),

  ('hurt myself', 'contains', 'high',
   'You''re not alone in this',
   'Wanting to hurt yourself is often a way of coping with pain that feels unbearable. There are people who understand and want to help you find some relief.',
   '988 Suicide & Crisis Lifeline', '988', '988', 'https://988lifeline.org', 'US'),

  ('self harm', 'contains', 'high',
   'Support is available',
   'If you''re thinking about harming yourself, please reach out. Talking to someone can help ease what you''re feeling and keep you safe right now.',
   '988 Suicide & Crisis Lifeline', '988', '988', 'https://988lifeline.org', 'US'),

  ('cut myself', 'contains', 'high',
   'Please be gentle with yourself',
   'You''re carrying something heavy right now. A trained counselor can help you work through these urges — you can call or text 988 any time.',
   '988 Suicide & Crisis Lifeline', '988', '988', 'https://988lifeline.org', 'US'),

  ('no reason to live', 'contains', 'high',
   'There is support for you',
   'When everything feels pointless, it can be hard to believe things will change — but feelings, even the heaviest ones, can shift with support. Please reach out.',
   '988 Suicide & Crisis Lifeline', '988', '988', 'https://988lifeline.org', 'US'),

  ('cant go on', 'contains', 'medium',
   'Take a breath — you''re not alone',
   'It sounds like you''re exhausted by what you''re going through. You don''t have to hold it all on your own; someone is ready to listen whenever you''re ready.',
   '988 Suicide & Crisis Lifeline', '988', '988', 'https://988lifeline.org', 'US'),

  ('hopeless', 'word', 'medium',
   'Brighter moments are still possible',
   'Hopelessness can cloud everything, but it doesn''t have the final word. Talking with someone who understands can help you find a next step, however small.',
   '988 Suicide & Crisis Lifeline', '988', '988', 'https://988lifeline.org', 'US');

-- ---------- feedback --------------------------------------------------------
create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  message     text not null,
  category    text,
  app_version text,
  platform    text,
  created_at  timestamptz not null default now()
);

create index feedback_user_idx on public.feedback (user_id);
create index feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

create policy "feedback_insert_own"
  on public.feedback for insert
  with check (auth.uid() = user_id);

create policy "feedback_select_own"
  on public.feedback for select
  using (auth.uid() = user_id);

-- ---------- audit_log -------------------------------------------------------
-- Trail for share / permission / view changes (build prompt §6). Written by
-- security-definer functions / service role; users can read rows they acted on.
create table public.audit_log (
  id             uuid primary key default gen_random_uuid(),
  actor_id       uuid references auth.users (id) on delete set null,
  action         text not null,
  entity_type    text not null,
  entity_id      uuid,
  target_user_id uuid references auth.users (id) on delete set null,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_target_idx on public.audit_log (target_user_id, created_at desc);

alter table public.audit_log enable row level security;

create policy "audit_select_actor"
  on public.audit_log for select
  using (auth.uid() = actor_id);
