-- ============================================================================
-- 20260619160000_grant_api_roles.sql
-- Grant the Supabase API roles (anon, authenticated, service_role) access to the
-- public schema so PostgREST can reach the tables + functions. RLS remains the
-- ROW-level security layer — these are table/schema-level privileges, exactly what
-- a normal `supabase db push` configures automatically via default privileges.
--
-- This migration is required because the initial schema here was applied via the
-- Supabase Management API (which doesn't run as the role that owns the default-
-- privilege grants). It is idempotent and harmless on a normal CLI push.
-- ============================================================================
grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
