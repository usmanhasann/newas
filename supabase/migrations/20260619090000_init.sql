-- ============================================================================
-- 20260619090000_init.sql
-- Extensions + shared helper functions. Foundation for all later migrations.
-- ============================================================================

-- gen_random_uuid()
create extension if not exists pgcrypto;
-- case-insensitive text for emails / invite codes
create extension if not exists citext;
-- trigram fuzzy search (journal entry search, Help/FAQ search)
create extension if not exists pg_trgm;

-- Maintain updated_at on UPDATE. Attach via:
--   create trigger set_updated_at before update on <t>
--   for each row execute function public.set_updated_at();
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
