-- System 2 (crisis) — remove the legacy server-side crisis sink.
--
-- The June "safety net" trigger (20260619100000_crisis_detection_trigger.sql) scanned every journal
-- note server-side and recorded matches to public.audit_log as durable, USER-LINKED 'crisis.detected'
-- rows — with the matched phrase in metadata — and the audit_select_actor RLS policy lets the user
-- read those rows back. System 2's ratified design mandates that crisis detection produce NO flag and
-- NO record about a person: it is SUPPORT, never moderation, even in a private journal.
--
-- Nothing consumes these rows (no reader anywhere in the app or DB), and the client hybrid detector
-- (on-device prescreen → detect-crisis AI confirm → CrisisResourcesSheet) is now the sole crisis path
-- and stores nothing. So this sink is removed and its existing rows are purged.

drop trigger if exists journal_entries_crisis_detect on public.journal_entries;
drop function if exists public.detect_crisis_on_entry();

-- Purge the user-linked crisis records the trigger already wrote.
delete from public.audit_log where action = 'crisis.detected';
