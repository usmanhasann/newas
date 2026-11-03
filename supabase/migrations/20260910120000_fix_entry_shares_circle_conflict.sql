-- Fix circle sharing (entry_shares INSERT silently failing 100% of the time).
--
-- The client shares an entry to circles via a PostgREST upsert:
--   supabase.from('entry_shares').upsert(rows, { onConflict: 'entry_id,circle_id', ... })
-- which compiles to `INSERT ... ON CONFLICT (entry_id, circle_id) DO NOTHING`. The ONLY unique
-- index on those columns was PARTIAL — `entry_shares_circle_uniq ... WHERE (circle_id IS NOT NULL)`
-- (20260619130000_circles_sharing.sql). Postgres cannot use a partial unique index as an ON
-- CONFLICT arbiter unless the statement repeats the index predicate, and supabase-js's `onConflict`
-- only emits the column list — so every circle-share insert failed at plan time with SQLSTATE 42P10
-- ("no unique or exclusion constraint matching the ON CONFLICT specification") and was swallowed by
-- a silent catch on the client. Result: entries were flagged shared=true but NO entry_shares row was
-- ever written, so circle feeds were always empty.
--
-- Replace the partial index with a plain UNIQUE CONSTRAINT on (entry_id, circle_id): PostgREST can
-- infer it as the arbiter. NULL circle_id rows (direct user shares) stay unconstrained because NULLs
-- are distinct in a UNIQUE — identical to the previous partial-index behavior. The direct-user-share
-- partial index (entry_shares_user_uniq) is left as-is: no client path upserts on target_user_id.

drop index if exists public.entry_shares_circle_uniq;

alter table public.entry_shares
  add constraint entry_shares_entry_circle_key unique (entry_id, circle_id);
