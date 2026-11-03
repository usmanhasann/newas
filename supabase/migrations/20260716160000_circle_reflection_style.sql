-- ============================================================================
-- 20260716160000_circle_reflection_style.sql
-- Personalization Phase 2 (part 1): a per-CIRCLE reflection tone, chosen by the circle
-- creator (owner) at creation and editable later by the owner. It shapes the voice of the
-- AI text shared into THIS circle (wired into generation in part 2). It is INDEPENDENT of
-- any member's personal_reflection_style and never inherits from the creator's personal tone.
--
--   gentle | direct | encouraging | reflective — one tone for everything shared in the circle
--   personal — each shared message uses ITS AUTHOR's own personal_reflection_style
--
-- Default 'personal' (each member sounds like themselves) so every existing circle is valid
-- and no circle silently adopts the creator's personal tone.
--
-- No RLS/grant change needed: circles keeps table-level UPDATE for authenticated (gated by
-- circles_update_owner — owner only), and the enum type carries the default PUBLIC USAGE.
-- ============================================================================

create type public.circle_reflection_style as enum (
  'gentle',
  'direct',
  'encouraging',
  'reflective',
  'personal'
);

alter table public.circles
  add column if not exists circle_reflection_style public.circle_reflection_style
    not null default 'personal';
