-- ============================================================================
-- 20260716140000_personal_reflection_style.sql
-- Personalization Phase 1: a per-USER reflection tone, chosen during onboarding and
-- editable later in the app. It shapes the voice of the user's PRIVATE weekly / monthly /
-- yearly reflections (generate-reflections). It is independent of any Circle setting.
--
--   gentle      — soft, encouraging, leads with empathy
--   direct      — clear, concise, gets to the point
--   encouraging — motivational, focused on growth and progress
--   reflective  — thoughtful, open-ended, invites the reader to go deeper
--
-- Default 'gentle' so every existing profile (and anyone who skips the step) is valid.
-- ============================================================================

create type public.personal_reflection_style as enum (
  'gentle',
  'direct',
  'encouraging',
  'reflective'
);

alter table public.profiles
  add column if not exists personal_reflection_style public.personal_reflection_style
    not null default 'gentle';

-- The client edits this itself (onboarding + Edit Profile). Column-level UPDATE grants are
-- the real gate on which profile columns authenticated users may write (see 20260629130000,
-- which revoked table-level UPDATE and re-granted an explicit column list). Add the new
-- column to that grant, or RLS-passing updates would fail with a column permission error.
grant update (personal_reflection_style) on public.profiles to authenticated;
