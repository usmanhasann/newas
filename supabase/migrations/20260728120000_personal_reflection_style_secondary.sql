-- ============================================================================
-- 20260728120000_personal_reflection_style_secondary.sql
-- Personalization: allow a SECOND personal reflection tone. Users may now pick up to two
-- tones during onboarding (and in Edit Profile); when a second is present, the AI BLENDS the
-- two voices for both the private weekly/monthly/yearly reflections (generate-reflections)
-- and the per-entry AI Insight (ai-summary).
--
-- Additive + nullable: the existing primary column (personal_reflection_style, NOT NULL
-- DEFAULT 'gentle') is unchanged, so every existing profile and every read that already
-- falls back to 'gentle' keeps working. Only when this secondary is set does blending kick in.
-- ============================================================================

alter table public.profiles
  add column if not exists personal_reflection_style_secondary public.personal_reflection_style;

-- A blend of a tone with itself is meaningless — the secondary must differ from the primary
-- (or be null). Named so it can be dropped/altered later.
alter table public.profiles
  drop constraint if exists profiles_reflection_style_secondary_distinct;
alter table public.profiles
  add constraint profiles_reflection_style_secondary_distinct
  check (
    personal_reflection_style_secondary is null
    or personal_reflection_style_secondary <> personal_reflection_style
  );

-- Column-level UPDATE grants are the real gate on which profile columns authenticated users
-- may write (see 20260629130000, which revoked table-level UPDATE and re-granted an explicit
-- column list; 20260716140000 added the primary tone). Add the secondary, or the client's
-- RLS-passing update would fail with a column permission error.
grant update (personal_reflection_style_secondary) on public.profiles to authenticated;
