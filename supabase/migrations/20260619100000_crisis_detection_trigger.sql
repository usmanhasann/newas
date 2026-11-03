-- ============================================================================
-- 20260619100000_crisis_detection_trigger.sql
-- Server-side safety net (build prompt §9.4: "re-checked server-side on save").
-- On insert/update of a journal entry's note, scan against active crisis_keywords
-- and record any matches to audit_log. The USER-FACING warning is shown client-side
-- for immediacy; this guarantees detection even if the client check is bypassed.
-- ============================================================================

create or replace function public.detect_crisis_on_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  k record;
begin
  if NEW.note is null or length(trim(NEW.note)) = 0 then
    return NEW;
  end if;

  for k in select * from public.crisis_keywords where is_active = true loop
    if (k.match_type = 'contains'
          and position(lower(k.phrase) in lower(NEW.note)) > 0)
       or (k.match_type = 'word'
          and lower(NEW.note) ~ ('\m' ||
              regexp_replace(lower(k.phrase), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\M'))
       or (k.match_type = 'regex'
          and NEW.note ~* k.phrase)
    then
      insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
      values (
        NEW.user_id,
        'crisis.detected',
        'journal_entry',
        NEW.id,
        jsonb_build_object('phrase', k.phrase, 'severity', k.severity, 'region', k.region)
      );
    end if;
  end loop;

  return NEW;
end;
$$;

create trigger journal_entries_crisis_detect
  after insert or update of note on public.journal_entries
  for each row execute function public.detect_crisis_on_entry();
