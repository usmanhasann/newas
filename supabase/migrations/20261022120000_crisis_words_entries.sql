-- ============================================================================
-- 20261022120000_crisis_words_entries.sql
-- Entries with concerning words (client revisions 10/14 p.36, N18): keywords only, no AI.
--
-- Every journal entry (the onboarding first check in and the app, new or edited) is checked against
-- the crisis keyword list (public.crisis_keywords) the moment it is saved, here in the database, so
-- no app build and no hand-made request can skip it. An entry that has the words:
--   * is saved privately like any other entry (nothing the user wrote is ever lost);
--   * gets NO AI reflection, and its text is never sent to any AI: crisis_flagged is the server's
--     answer, and the edge functions that call an AI (ai-summary, generate-reflections,
--     detect-private-threat, detect-crisis, moderate-circle-content) re-check it before sending;
--   * can't be shared into any circle: a new share is refused here, and an edit that adds the words
--     takes the entry out of every circle it was in (with its replies) and removes its reflection.
-- An edit that removes the words makes it an ordinary entry again: it's no longer flagged and its
-- reflection is made like any other entry's (ai_status back to idle).
--
-- The flag is a column on the user's own entry (RLS: only its writer can read it). There is still no
-- separate crisis record, log or review row about a person (System 2's rule, 20260911140000).
--
-- The matcher mirrors src/features/crisis/matcher.ts (the phone's check). Besides the text as typed
-- it also reads a normalized form, the same way on both sides: lower case, apostrophes dropped
-- ("don't", "don’t" and "dont" all read "dont", so iPhone's curly apostrophe no longer slips past the
-- list's "dont want to live"), runs of spaces and dashes read as one space ("self-harm" reads
-- "self harm").
-- ============================================================================

-- ---------- 1. the matcher --------------------------------------------------------
create or replace function public.crisis_words_normalize(p_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select btrim(regexp_replace(
           regexp_replace(lower(coalesce(p_text, '')), '[''`´‘’ʼ]', '', 'g'),
           '[[:space:]‐‑‒–—―-]+', ' ', 'g'));
$$;

-- Whether `p_hay` has `p_phrase`: anywhere ('contains') or as whole words ('word').
create or replace function public.crisis_words_has(p_hay text, p_phrase text, p_whole_words boolean)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_phrase <> '' and case
    when p_whole_words then
      p_hay ~ ('\y' || regexp_replace(p_phrase, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\y')
    else position(p_phrase in p_hay) > 0
  end;
$$;

-- True when the text has any active crisis keyword. 'contains' and 'word' (whole words) look in the
-- lower-cased text as typed AND in its normalized form, so normalizing only ever adds matches.
-- 'regex' runs the raw pattern case-insensitively on the raw text, and a broken pattern never
-- matches (as on the phone).
create or replace function public.crisis_words_match(p_text text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  k record;
  raw text;
  hay text;
begin
  if p_text is null or btrim(p_text) = '' then
    return false;
  end if;
  raw := lower(p_text);
  hay := public.crisis_words_normalize(p_text);
  for k in select c.phrase, c.match_type from public.crisis_keywords c where c.is_active loop
    if k.match_type = 'regex' then
      begin
        if p_text ~* k.phrase then
          return true;
        end if;
      exception when others then
        null;
      end;
    elsif public.crisis_words_has(raw, lower(k.phrase), k.match_type = 'word')
       or public.crisis_words_has(hay, public.crisis_words_normalize(k.phrase), k.match_type = 'word') then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- ---------- 2. the flag on the entry ----------------------------------------------
alter table public.journal_entries
  add column if not exists crisis_flagged boolean not null default false;

-- Set by the server on every write (the app can't set or clear it). A flagged entry holds no AI
-- reflection ('ready' with none, so nothing asks for one); leaving the flag makes it idle again so
-- its reflection is made like any other entry's.
create or replace function public.flag_entry_crisis_words()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  NEW.crisis_flagged := public.crisis_words_match(NEW.note);
  if NEW.crisis_flagged then
    NEW.ai_summary := null;
    NEW.ai_status := 'ready';
    NEW.ai_error := null;
  elsif TG_OP = 'UPDATE' and OLD.crisis_flagged then
    NEW.ai_summary := null;
    NEW.ai_status := 'idle';
    NEW.ai_error := null;
  end if;
  return NEW;
end;
$$;

-- Runs first of the BEFORE triggers (alphabetical), so the reflection guard sees the cleared value.
drop trigger if exists journal_entries_crisis_flag on public.journal_entries;
create trigger journal_entries_crisis_flag
  before insert or update on public.journal_entries
  for each row execute function public.flag_entry_crisis_words();

-- An edit that adds the words takes the entry out of every circle (its post and the replies under
-- it). Named to run before journal_entries_sync_posts, so the new text is never copied into a post.
create or replace function public.unshare_flagged_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.circle_posts p where p.entry_id = NEW.id;
  delete from public.entry_shares es where es.entry_id = NEW.id;
  return null;
end;
$$;

drop trigger if exists journal_entries_crisis_unshare on public.journal_entries;
create trigger journal_entries_crisis_unshare
  after update on public.journal_entries
  for each row when (new.crisis_flagged and not old.crisis_flagged)
  execute function public.unshare_flagged_entry();

-- ---------- 3. sharing is refused -------------------------------------------------
-- A flagged entry can't go into any circle, Public or Private: not through share_entry, not through
-- an older app's entry_shares insert, not by a direct insert, and not by switching what a circle
-- sees. The app shows "This entry can’t be shared, but support is always available." instead.
create or replace function public.refuse_sharing_flagged_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.entry_id is not null and exists (
       select 1 from public.journal_entries e
        where e.id = NEW.entry_id
          and (e.crisis_flagged or public.crisis_words_match(e.note))
     ) then
    raise exception 'this entry can''t be shared' using errcode = '42501', hint = 'crisis_words';
  end if;
  return NEW;
end;
$$;

drop trigger if exists circle_posts_refuse_flagged_entry on public.circle_posts;
create trigger circle_posts_refuse_flagged_entry
  before insert on public.circle_posts
  for each row when (new.entry_id is not null)
  execute function public.refuse_sharing_flagged_entry();

drop trigger if exists circle_posts_refuse_flagged_version on public.circle_posts;
create trigger circle_posts_refuse_flagged_version
  before update of entry_version on public.circle_posts
  for each row when (new.entry_id is not null and new.entry_version is distinct from old.entry_version)
  execute function public.refuse_sharing_flagged_entry();

drop trigger if exists entry_shares_refuse_flagged_entry on public.entry_shares;
create trigger entry_shares_refuse_flagged_entry
  before insert on public.entry_shares
  for each row execute function public.refuse_sharing_flagged_entry();

-- ---------- 4. keeping flags current ----------------------------------------------
-- Re-checks every entry whose flag no longer matches the keyword list (the entry trigger above sets
-- the flag, clears or restores the reflection state and unshares). Runs below as the backfill, and
-- again by itself whenever the keyword list changes. Returns how many entries changed.
create or replace function public.refresh_crisis_flags()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  update public.journal_entries e
     set crisis_flagged = not e.crisis_flagged
   where e.crisis_flagged is distinct from public.crisis_words_match(e.note);
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.crisis_keywords_refresh_flags()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.refresh_crisis_flags();
  return null;
end;
$$;

drop trigger if exists crisis_keywords_refresh_flags on public.crisis_keywords;
create trigger crisis_keywords_refresh_flags
  after insert or delete or update of phrase, match_type, is_active on public.crisis_keywords
  for each statement execute function public.crisis_keywords_refresh_flags();

-- ---------- 5. the edge functions' re-check before anything goes to an AI ------------
-- Of these entries, the ones that must never reach an AI: flagged, or matching the list right now.
create or replace function public.crisis_flagged_entries(p_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id
    from public.journal_entries e
   where e.id = any (coalesce(p_ids, '{}'::uuid[]))
     and (e.crisis_flagged or public.crisis_words_match(e.note));
$$;

-- Service role only (edge functions and the triggers above, which run as the owner).
revoke all on function public.crisis_words_normalize(text) from public, anon, authenticated;
revoke all on function public.crisis_words_has(text, text, boolean) from public, anon, authenticated;
revoke all on function public.crisis_words_match(text) from public, anon, authenticated;
revoke all on function public.crisis_flagged_entries(uuid[]) from public, anon, authenticated;
revoke all on function public.refresh_crisis_flags() from public, anon, authenticated;
revoke all on function public.flag_entry_crisis_words() from public, anon, authenticated;
revoke all on function public.unshare_flagged_entry() from public, anon, authenticated;
revoke all on function public.refuse_sharing_flagged_entry() from public, anon, authenticated;
revoke all on function public.crisis_keywords_refresh_flags() from public, anon, authenticated;
grant execute on function public.crisis_words_match(text) to service_role;
grant execute on function public.crisis_flagged_entries(uuid[]) to service_role;
grant execute on function public.refresh_crisis_flags() to service_role;

-- ---------- 6. backfill -------------------------------------------------------------
-- Entries written before this rule (none matched on the live database on 2026-10-21).
select public.refresh_crisis_flags();
