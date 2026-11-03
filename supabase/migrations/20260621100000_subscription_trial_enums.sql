-- ============================================================================
-- 20260621100000_subscription_trial_enums.sql
-- Add statuses for the application-managed free trial lifecycle. Additive only —
-- existing enum values are untouched. Kept in its OWN migration because Postgres
-- cannot use a newly added enum value in the same transaction that adds it; the
-- next migration (which references 'expired') runs in a separate transaction.
-- ============================================================================
alter type public.subscription_status add value if not exists 'expired';
alter type public.subscription_status add value if not exists 'inactive';
